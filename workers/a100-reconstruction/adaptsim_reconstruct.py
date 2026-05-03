#!/usr/bin/env python3
from __future__ import annotations

import argparse
import contextlib
import dataclasses
import hashlib
import json
import os
import shlex
import shutil
import socket
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

try:
    import fcntl
except ImportError:  # pragma: no cover - the A100 target is Linux.
    fcntl = None  # type: ignore[assignment]


REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from contracts.models import (  # noqa: E402
    CaptureMetadata,
    CaptureStatus,
    ReconstructionManifest,
)


SUPPORTED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".heic", ".heif"}
DEFAULT_GCS_ROOT = "gs://aiscanners-hackathon2025/adaptsim-captures"
DEFAULT_WORK_ROOT = Path("~/adaptsim/data/captures").expanduser()
DEFAULT_LOCK_FILE = Path("/tmp/adaptsim-a100-reconstruction.lock")
DEFAULT_DLNR_MARGIN_M = 0.10
DEFAULT_MIN_IMAGES = 6
DEFAULT_MIN_REGISTERED_IMAGES = 3

PHASE_PROGRESS = {
    "validating_images": 18,
    "sfm_solving": 32,
    "reconstructing_splat": 48,
    "exporting_splat": 62,
    "extracting_mesh": 76,
    "postprocessing_mesh": 88,
    "ready_for_unreal_import": 94,
    "failed": 100,
}

CONTENT_TYPES = {
    ".json": "application/json",
    ".log": "text/plain",
    ".txt": "text/plain",
    ".ply": "application/octet-stream",
    ".usdz": "model/vnd.usdz+zip",
    ".glb": "model/gltf-binary",
    ".gltf": "model/gltf+json",
    ".obj": "text/plain",
}


class WorkerFailure(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        *,
        phase: str,
        retryable: bool = False,
        exit_code: int = 1,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.phase = phase
        self.retryable = retryable
        self.exit_code = exit_code


class StorageError(RuntimeError):
    pass


@dataclasses.dataclass(slots=True)
class WorkerConfig:
    capture_id: str
    gcs_root: str = DEFAULT_GCS_ROOT
    work_root: Path = DEFAULT_WORK_ROOT
    dataset_mode: str = "auto"
    golden_dataset_dir: Path | None = None
    min_images: int = DEFAULT_MIN_IMAGES
    min_registered_images: int = DEFAULT_MIN_REGISTERED_IMAGES
    enable_raw_colmap: bool = False
    frgs_bin: str | None = None
    colmap_bin: str = "colmap"
    mesh_converter: str | None = None
    dlnr_truncation_margin_m: float = DEFAULT_DLNR_MARGIN_M
    lock_file: Path = DEFAULT_LOCK_FILE
    no_lock: bool = False
    vm_instance: str = ""
    zone: str = "us-east1-b"


@dataclasses.dataclass(slots=True)
class DatasetSelection:
    mode: str
    frgs_input_dir: Path | None
    image_count: int
    registered_image_count: int
    sparse_point_count: int | None
    message: str


@dataclasses.dataclass(slots=True)
class MeshStatsValue:
    vertices: int
    faces: int
    center_m: tuple[float, float, float]
    size_m: tuple[float, float, float]
    warnings: list[str]


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso_now() -> str:
    return utc_now().isoformat().replace("+00:00", "Z")


def normalize_gcs_root(value: str) -> str:
    root = value.rstrip("/")
    if not root.startswith("gs://"):
        raise ValueError("--gcs-root must be a gs:// URI")
    parts = root[5:].split("/", 1)
    if len(parts) != 2 or not parts[0] or not parts[1]:
        raise ValueError("--gcs-root must include a bucket and prefix, for example gs://bucket/prefix")
    return root


def capture_prefix(gcs_root: str, capture_id: str) -> str:
    return f"{normalize_gcs_root(gcs_root)}/captures/{capture_id}/"


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2, sort_keys=False) + "\n", encoding="utf-8")
    tmp.replace(path)


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def content_type_for(path: Path) -> str:
    return CONTENT_TYPES.get(path.suffix.lower(), "application/octet-stream")


def has_any_files(path: Path) -> bool:
    return path.exists() and any(candidate.is_file() for candidate in path.rglob("*"))


def supported_images(path: Path) -> list[Path]:
    if not path.exists():
        return []
    return sorted(
        candidate
        for candidate in path.rglob("*")
        if candidate.is_file() and candidate.suffix.lower() in SUPPORTED_IMAGE_EXTENSIONS
    )


class GcloudStorageClient:
    def __init__(self, log: Any | None = None) -> None:
        self.log = log

    def download_file(self, uri: str, destination: Path, *, required: bool = True) -> bool:
        destination.parent.mkdir(parents=True, exist_ok=True)
        return self._run(["gcloud", "storage", "cp", uri, str(destination)], required=required)

    def download_tree(self, uri: str, destination: Path, *, required: bool = True) -> bool:
        destination.mkdir(parents=True, exist_ok=True)
        return self._run(["gcloud", "storage", "rsync", "-r", uri.rstrip("/"), str(destination)], required=required)

    def upload_file(self, source: Path, uri: str, *, required: bool = True) -> bool:
        if not source.exists():
            if required:
                raise StorageError(f"cannot upload missing file {source}")
            return False
        return self._run(["gcloud", "storage", "cp", str(source), uri], required=required)

    def upload_tree(self, source: Path, uri: str, *, required: bool = True) -> bool:
        if not has_any_files(source):
            return False
        return self._run(["gcloud", "storage", "rsync", "-r", str(source), uri.rstrip("/")], required=required)

    def exists(self, uri: str) -> bool:
        return self._run(["gcloud", "storage", "ls", uri], required=False)

    def _run(self, argv: list[str], *, required: bool) -> bool:
        if self.log:
            self.log.write(f"$ {format_command(argv)}\n")
            self.log.flush()
        proc = subprocess.run(argv, text=True, capture_output=True)
        if self.log:
            if proc.stdout:
                self.log.write(proc.stdout)
            if proc.stderr:
                self.log.write(proc.stderr)
            self.log.flush()
        if proc.returncode != 0:
            if required:
                detail = proc.stderr.strip() or proc.stdout.strip() or f"exit {proc.returncode}"
                raise StorageError(f"{format_command(argv)} failed: {detail}")
            return False
        return True


def format_command(argv: Iterable[str]) -> str:
    return " ".join(shlex.quote(part) for part in argv)


@contextlib.contextmanager
def single_gpu_lock(path: Path, *, disabled: bool = False) -> Any:
    if disabled:
        yield
        return
    if fcntl is None:
        raise WorkerFailure(
            "lock_unavailable",
            "single-GPU lock requires fcntl on the A100 Linux worker",
            phase="validating_images",
            retryable=True,
            exit_code=11,
        )
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as lock_file:
        try:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise WorkerFailure(
                "worker_busy",
                f"another A100 reconstruction job is holding {path}",
                phase="validating_images",
                retryable=True,
                exit_code=12,
            ) from exc
        lock_file.write(f"{os.getpid()} {iso_now()}\n")
        lock_file.flush()
        try:
            yield
        finally:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)


class ReconstructionWorker:
    def __init__(self, config: WorkerConfig, storage: Any | None = None) -> None:
        self.config = config
        self.config.gcs_root = normalize_gcs_root(config.gcs_root)
        self.capture_prefix = capture_prefix(self.config.gcs_root, self.config.capture_id)
        self.work_dir = (self.config.work_root / self.config.capture_id).expanduser().resolve()
        self.raw_dir = self.work_dir / "raw"
        self.raw_images_dir = self.raw_dir / "images"
        self.sfm_dir = self.work_dir / "sfm" / "colmap"
        self.reconstruction_dir = self.work_dir / "reconstruction"
        self.unreal_import_dir = self.work_dir / "unreal-import"
        self.logs_dir = self.work_dir / "logs"
        self.status_path = self.work_dir / "status.json"
        self.metadata_path = self.raw_dir / "metadata.json"
        self.remote_status_path = self.work_dir / "status.remote.json"
        self.log_path = self.logs_dir / "a100-reconstruction.log"
        self.storage = storage
        self.metadata: CaptureMetadata | None = None
        self.previous_status: dict[str, Any] | None = None
        self.display_name = self.config.capture_id
        self.sfm_status: dict[str, Any] | None = None
        self.artifacts: dict[str, Any] = {
            "raw_metadata_uri": f"{self.capture_prefix}raw/metadata.json",
            "sfm_report_uri": None,
            "splat_ply_uri": None,
            "splat_usdz_url": None,
            "mesh_preview_url": None,
            "unreal_mesh_url": None,
            "reconstruction_manifest_uri": None,
            "unreal_import_report_uri": None,
            "semantic_environment_uri": None,
        }

    def run(self) -> int:
        self.prepare_directories()
        with self.log_path.open("a", encoding="utf-8") as log_stream:
            if self.storage is None:
                self.storage = GcloudStorageClient(log_stream)
            self.log(log_stream, f"Starting AdaptSim A100 reconstruction for {self.config.capture_id}")
            with single_gpu_lock(self.config.lock_file.expanduser(), disabled=self.config.no_lock):
                try:
                    self.download_capture_inputs()
                    self.write_status(
                        "validating_images",
                        "Validating capture metadata and uploaded images.",
                    )
                    dataset = self.validate_inputs()
                    self.write_status("sfm_solving", dataset.message)
                    if dataset.mode == "raw":
                        if not self.config.enable_raw_colmap:
                            self.fail(
                                "raw_colmap_not_enabled",
                                (
                                    f"Raw image folder detected with {dataset.image_count} supported images, "
                                    "but raw-photo COLMAP to FVDB reconstruction is staged behind "
                                    "--enable-raw-colmap for this MVP. Golden safety_park mode is enabled."
                                ),
                                phase="sfm_solving",
                                retryable=False,
                                exit_code=30,
                            )
                        dataset = self.run_colmap_sfm(log_stream)
                        self.write_status("sfm_solving", "COLMAP pose solving completed.")
                    self.run_fvdb_reconstruction(dataset, log_stream)
                    self.run_mesh_postprocess(log_stream)
                    self.upload_outputs(required=True)
                    self.write_status(
                        "ready_for_unreal_import",
                        "Reconstruction artifacts are ready for the L4 Unreal import worker.",
                    )
                    self.log(log_stream, "A100 reconstruction completed successfully")
                    return 0
                except WorkerFailure:
                    raise
                except Exception as exc:  # pragma: no cover - safety net.
                    self.fail(
                        "unexpected_worker_error",
                        f"unexpected reconstruction worker error: {exc}",
                        phase="failed",
                        retryable=True,
                        exit_code=99,
                    )
        return 0

    def prepare_directories(self) -> None:
        for path in [
            self.raw_images_dir,
            self.sfm_dir,
            self.reconstruction_dir,
            self.unreal_import_dir,
            self.logs_dir,
        ]:
            path.mkdir(parents=True, exist_ok=True)

    def log(self, stream: Any, message: str) -> None:
        stream.write(f"[{iso_now()}] {message}\n")
        stream.flush()

    def download_capture_inputs(self) -> None:
        assert self.storage is not None
        try:
            self.storage.download_file(f"{self.capture_prefix}raw/metadata.json", self.metadata_path, required=True)
        except StorageError as exc:
            self.fail(
                "metadata_download_failed",
                f"could not download capture metadata from {self.capture_prefix}raw/metadata.json: {exc}",
                phase="validating_images",
                retryable=True,
                exit_code=20,
            )
        try:
            metadata = CaptureMetadata.model_validate_json(self.metadata_path.read_text(encoding="utf-8"))
        except Exception as exc:
            self.fail(
                "invalid_metadata",
                f"capture metadata is invalid: {exc}",
                phase="validating_images",
                retryable=False,
                exit_code=21,
            )
        if metadata.capture_id != self.config.capture_id:
            self.fail(
                "capture_id_mismatch",
                f"metadata capture_id {metadata.capture_id!r} does not match CLI capture_id {self.config.capture_id!r}",
                phase="validating_images",
                retryable=False,
                exit_code=21,
            )
        if metadata.gcs_prefix != self.capture_prefix:
            self.fail(
                "gcs_prefix_mismatch",
                f"metadata gcs_prefix {metadata.gcs_prefix!r} does not match {self.capture_prefix!r}",
                phase="validating_images",
                retryable=False,
                exit_code=21,
            )
        self.metadata = metadata
        self.display_name = metadata.display_name
        self.sfm_status = {
            "input_images": metadata.uploaded_image_count,
            "registered_images": None,
            "sparse_points": None,
            "report_uri": None,
        }
        self.storage.download_file(f"{self.capture_prefix}status.json", self.remote_status_path, required=False)
        if self.remote_status_path.exists():
            try:
                self.previous_status = load_json(self.remote_status_path)
            except Exception:
                self.previous_status = None
        self.storage.download_tree(f"{self.capture_prefix}raw/images", self.raw_images_dir, required=False)
        self.storage.download_tree(f"{self.capture_prefix}sfm/colmap", self.sfm_dir, required=False)

    def validate_inputs(self) -> DatasetSelection:
        metadata = self.require_metadata()
        image_paths = supported_images(self.raw_images_dir)
        unsupported = sorted(
            candidate
            for candidate in self.raw_images_dir.rglob("*")
            if candidate.is_file() and candidate.suffix.lower() not in SUPPORTED_IMAGE_EXTENSIONS
        )
        validation_log = self.logs_dir / "image_validation.log"
        lines = [
            f"capture_id={self.config.capture_id}",
            f"metadata_uploaded_image_count={metadata.uploaded_image_count}",
            f"metadata_expected_image_count={metadata.expected_image_count}",
            f"supported_image_count={len(image_paths)}",
            f"unsupported_file_count={len(unsupported)}",
        ]
        lines.extend(f"image={path.relative_to(self.raw_images_dir)} size_bytes={path.stat().st_size}" for path in image_paths)
        lines.extend(f"unsupported={path.relative_to(self.raw_images_dir)}" for path in unsupported)
        validation_log.write_text("\n".join(lines) + "\n", encoding="utf-8")
        self.upload_logs_best_effort()

        if self.should_use_golden_dataset():
            golden_dir = self.find_golden_dataset_dir()
            if golden_dir is None:
                self.fail(
                    "golden_dataset_missing",
                    (
                        "safety_park golden mode is selected, but no FVDB tutorial dataset was found. "
                        "Set --golden-dataset-dir or ADAPTSIM_GOLDEN_SAFETY_PARK_DIR to the prepared "
                        "COLMAP/FVDB tutorial scene directory."
                    ),
                    phase="validating_images",
                    retryable=True,
                    exit_code=22,
                )
            image_count = max(metadata.uploaded_image_count, len(image_paths), metadata.expected_image_count)
            report = self.write_sfm_report(
                mode="golden_fvdb_tutorial",
                input_dir=golden_dir,
                image_count=image_count,
                registered_image_count=image_count,
                sparse_point_count=None,
                notes=[
                    "Using pre-posed FVDB tutorial data for safety_park golden reconstruction.",
                    "Raw uploaded image SfM is intentionally bypassed in golden mode.",
                ],
            )
            self.sfm_status = {
                "input_images": image_count,
                "registered_images": image_count,
                "sparse_points": None,
                "report_uri": f"{self.capture_prefix}sfm/colmap/report.json",
            }
            self.artifacts["sfm_report_uri"] = f"{self.capture_prefix}sfm/colmap/report.json"
            self.upload_file_best_effort(report, f"{self.capture_prefix}sfm/colmap/report.json")
            return DatasetSelection(
                mode="golden",
                frgs_input_dir=golden_dir,
                image_count=image_count,
                registered_image_count=image_count,
                sparse_point_count=None,
                message="Using safety_park FVDB tutorial data as the posed golden dataset.",
            )

        if not image_paths:
            self.fail(
                "no_uploaded_images",
                f"no supported images were found under {self.capture_prefix}raw/images/",
                phase="validating_images",
                retryable=False,
                exit_code=23,
            )
        if len(image_paths) < self.config.min_images:
            self.fail(
                "insufficient_images",
                (
                    f"found {len(image_paths)} supported images under raw/images, "
                    f"but at least {self.config.min_images} are required for reconstruction"
                ),
                phase="validating_images",
                retryable=False,
                exit_code=24,
            )
        self.sfm_status = {
            "input_images": len(image_paths),
            "registered_images": None,
            "sparse_points": None,
            "report_uri": None,
        }
        return DatasetSelection(
            mode="raw",
            frgs_input_dir=None,
            image_count=len(image_paths),
            registered_image_count=0,
            sparse_point_count=None,
            message=f"Raw uploaded image folder detected with {len(image_paths)} supported images.",
        )

    def should_use_golden_dataset(self) -> bool:
        mode = self.config.dataset_mode
        if mode == "golden":
            if self.config.capture_id != "safety_park":
                self.fail(
                    "unsupported_golden_capture",
                    "golden dataset mode is only defined for capture_id safety_park",
                    phase="validating_images",
                    retryable=False,
                    exit_code=22,
                )
            return True
        if mode == "raw":
            return False
        return self.config.capture_id == "safety_park"

    def find_golden_dataset_dir(self) -> Path | None:
        candidates: list[Path] = []
        if self.config.golden_dataset_dir:
            candidates.append(self.config.golden_dataset_dir.expanduser())
        for env_name in [
            "ADAPTSIM_GOLDEN_SAFETY_PARK_DIR",
            "ADAPTSIM_FVDB_TUTORIAL_DATA",
            "FVDB_TUTORIAL_DATA",
        ]:
            value = os.environ.get(env_name)
            if value:
                candidates.append(Path(value).expanduser())
        home = Path("~/adaptsim").expanduser()
        candidates.extend(
            [
                self.sfm_dir,
                home / "data/captures/safety_park/sfm/colmap",
                home / "data/captures/safety_park/fvdb",
                home / "data/fvdb/tutorial/safety_park",
                home / "data/fvdb-reality-capture/tutorial/safety_park",
                home / "data/fvdb_reality_capture/tutorial/safety_park",
                home / "repos/fvdb-reality-capture/tutorials/data/safety_park",
                home / "repos/fvdb-reality-capture/examples/safety_park",
            ]
        )
        for candidate in candidates:
            resolved = candidate.resolve() if candidate.exists() else candidate
            if self.looks_like_frgs_input(resolved):
                nested = resolved / "sfm" / "colmap"
                if self.looks_like_frgs_input(nested):
                    return nested
                return resolved
        return None

    def looks_like_frgs_input(self, path: Path) -> bool:
        if not path.exists() or not path.is_dir():
            return False
        if has_any_files(path / "sparse") or has_any_files(path / "images"):
            return True
        if any(path.glob("transforms*.json")) and supported_images(path):
            return True
        if any(path.glob("cameras*.txt")) and has_any_files(path):
            return True
        return False

    def run_colmap_sfm(self, log_stream: Any) -> DatasetSelection:
        colmap = resolve_executable(self.config.colmap_bin)
        if colmap is None:
            self.fail(
                "colmap_not_found",
                f"COLMAP executable {self.config.colmap_bin!r} was not found on PATH",
                phase="sfm_solving",
                retryable=True,
                exit_code=31,
            )
        database_path = self.sfm_dir / "database.db"
        sparse_dir = self.sfm_dir / "sparse"
        sparse_dir.mkdir(parents=True, exist_ok=True)
        images_link = self.sfm_dir / "images"
        if not images_link.exists():
            try:
                images_link.symlink_to(self.raw_images_dir, target_is_directory=True)
            except OSError:
                shutil.copytree(self.raw_images_dir, images_link, dirs_exist_ok=True)
        colmap_log = self.logs_dir / "colmap.log"
        self.run_tool(
            [
                colmap,
                "feature_extractor",
                "--database_path",
                str(database_path),
                "--image_path",
                str(self.raw_images_dir),
                "--ImageReader.single_camera",
                "1",
                "--SiftExtraction.use_gpu",
                "1",
            ],
            log_path=colmap_log,
            phase="sfm_solving",
            error_code="colmap_feature_extraction_failed",
        )
        self.run_tool(
            [
                colmap,
                "exhaustive_matcher",
                "--database_path",
                str(database_path),
                "--SiftMatching.use_gpu",
                "1",
            ],
            log_path=colmap_log,
            phase="sfm_solving",
            error_code="colmap_matching_failed",
        )
        self.run_tool(
            [
                colmap,
                "mapper",
                "--database_path",
                str(database_path),
                "--image_path",
                str(self.raw_images_dir),
                "--output_path",
                str(sparse_dir),
            ],
            log_path=colmap_log,
            phase="sfm_solving",
            error_code="colmap_mapping_failed",
        )
        model_dir = sparse_dir / "0"
        if not has_any_files(model_dir):
            self.fail(
                "colmap_no_sparse_model",
                "COLMAP completed without writing sparse/0; cannot continue to FVDB reconstruction",
                phase="sfm_solving",
                retryable=False,
                exit_code=32,
            )
        self.run_tool(
            [
                colmap,
                "model_converter",
                "--input_path",
                str(model_dir),
                "--output_path",
                str(model_dir),
                "--output_type",
                "TXT",
            ],
            log_path=colmap_log,
            phase="sfm_solving",
            error_code="colmap_model_conversion_failed",
        )
        registered = count_colmap_registered_images(model_dir / "images.txt")
        sparse_points = count_colmap_points(model_dir / "points3D.txt")
        if registered < self.config.min_registered_images:
            self.fail(
                "too_few_registered_images",
                (
                    f"COLMAP registered {registered} images, "
                    f"but at least {self.config.min_registered_images} are required"
                ),
                phase="sfm_solving",
                retryable=False,
                exit_code=33,
            )
        report_path = self.write_sfm_report(
            mode="raw_colmap",
            input_dir=self.sfm_dir,
            image_count=len(supported_images(self.raw_images_dir)),
            registered_image_count=registered,
            sparse_point_count=sparse_points,
            notes=[],
        )
        self.sfm_status = {
            "input_images": len(supported_images(self.raw_images_dir)),
            "registered_images": registered,
            "sparse_points": sparse_points,
            "report_uri": f"{self.capture_prefix}sfm/colmap/report.json",
        }
        self.artifacts["sfm_report_uri"] = f"{self.capture_prefix}sfm/colmap/report.json"
        self.upload_outputs(required=False)
        self.log(log_stream, f"COLMAP registered {registered} images and {sparse_points} sparse points")
        return DatasetSelection(
            mode="raw",
            frgs_input_dir=self.sfm_dir,
            image_count=len(supported_images(self.raw_images_dir)),
            registered_image_count=registered,
            sparse_point_count=sparse_points,
            message="COLMAP pose solving completed.",
        )

    def run_fvdb_reconstruction(self, dataset: DatasetSelection, log_stream: Any) -> None:
        if dataset.frgs_input_dir is None:
            self.fail(
                "missing_frgs_input",
                "no FVDB input directory was prepared for reconstruction",
                phase="reconstructing_splat",
                retryable=False,
                exit_code=40,
            )
        frgs = self.resolve_frgs_bin()
        splat_ply = self.reconstruction_dir / "splat.ply"
        splat_usdz = self.reconstruction_dir / "splat.usdz"
        mesh_ply = self.reconstruction_dir / "mesh_dlnr.ply"
        fvdb_log = self.logs_dir / "fvdb_frgs.log"

        self.write_status("reconstructing_splat", "Running FVDB frgs reconstruct.")
        start = time.monotonic()
        self.run_tool(
            [frgs, "reconstruct", str(dataset.frgs_input_dir), "-o", str(splat_ply)],
            log_path=fvdb_log,
            phase="reconstructing_splat",
            error_code="frgs_reconstruct_failed",
        )
        reconstruct_s = time.monotonic() - start
        self.require_nonempty_file(
            splat_ply,
            "splat_ply_missing",
            "frgs reconstruct did not produce reconstruction/splat.ply",
            phase="reconstructing_splat",
        )
        self.artifacts["splat_ply_uri"] = f"{self.capture_prefix}reconstruction/splat.ply"
        self.upload_outputs(required=False)

        self.write_status("exporting_splat", "Exporting FVDB splat preview to USDZ.")
        start = time.monotonic()
        self.run_tool(
            [frgs, "convert", str(splat_ply), str(splat_usdz)],
            log_path=fvdb_log,
            phase="exporting_splat",
            error_code="frgs_convert_failed",
        )
        convert_s = time.monotonic() - start
        self.require_nonempty_file(
            splat_usdz,
            "splat_usdz_missing",
            "frgs convert did not produce reconstruction/splat.usdz",
            phase="exporting_splat",
        )
        self.artifacts["splat_usdz_url"] = f"/api/v1/captures/{self.config.capture_id}/artifacts/splat_usdz"
        self.upload_outputs(required=False)

        self.write_status("extracting_mesh", "Running FVDB DLNR mesh extraction.")
        start = time.monotonic()
        self.run_tool(
            [
                frgs,
                "mesh-dlnr",
                str(splat_ply),
                "-o",
                str(mesh_ply),
                f"{self.config.dlnr_truncation_margin_m:g}",
            ],
            log_path=fvdb_log,
            phase="extracting_mesh",
            error_code="frgs_mesh_dlnr_failed",
        )
        mesh_s = time.monotonic() - start
        self.require_nonempty_file(
            mesh_ply,
            "mesh_dlnr_missing",
            "frgs mesh-dlnr did not produce reconstruction/mesh_dlnr.ply",
            phase="extracting_mesh",
        )
        mesh_stats = read_mesh_stats(mesh_ply)
        self.artifacts["mesh_preview_url"] = f"/api/v1/captures/{self.config.capture_id}/artifacts/mesh_preview"
        report = {
            "capture_id": self.config.capture_id,
            "generated_at": iso_now(),
            "dataset_mode": dataset.mode,
            "frgs_input_dir": str(dataset.frgs_input_dir),
            "dlnr_truncation_margin_m": self.config.dlnr_truncation_margin_m,
            "duration_s": {
                "reconstruct": round(reconstruct_s, 3),
                "convert": round(convert_s, 3),
                "mesh_dlnr": round(mesh_s, 3),
            },
            "artifacts": {
                "splat_ply": str(splat_ply),
                "splat_usdz": str(splat_usdz),
                "mesh_dlnr_ply": str(mesh_ply),
            },
            "mesh": {
                "vertices": mesh_stats.vertices,
                "faces": mesh_stats.faces,
                "bounds_m": mesh_stats_contract(mesh_stats)["bounds_m"],
                "warnings": mesh_stats.warnings,
            },
        }
        write_json(self.reconstruction_dir / "report.json", report)
        self.upload_outputs(required=False)
        self.log(log_stream, "FVDB splat and DLNR mesh artifacts completed")

    def run_mesh_postprocess(self, log_stream: Any) -> None:
        self.write_status("postprocessing_mesh", "Preparing mesh handoff for Agent 5 Unreal conversion.")
        mesh_ply = self.reconstruction_dir / "mesh_dlnr.ply"
        scene_glb = self.unreal_import_dir / "scene_mesh.glb"
        manifest_path = self.unreal_import_dir / "reconstruction_manifest.json"
        self.require_nonempty_file(
            mesh_ply,
            "mesh_dlnr_missing",
            "missing reconstruction/mesh_dlnr.ply before postprocessing",
            phase="postprocessing_mesh",
        )

        converter = self.find_mesh_converter()
        if converter:
            converter_log = self.logs_dir / "mesh_postprocess.log"
            self.run_tool(
                [
                    converter,
                    "--capture-id",
                    self.config.capture_id,
                    "--source-mesh",
                    str(mesh_ply),
                    "--output-glb",
                    str(scene_glb),
                    "--manifest-output",
                    str(manifest_path),
                    "--gcs-prefix",
                    self.capture_prefix,
                    "--metadata",
                    str(self.metadata_path),
                    "--sfm-report",
                    str(self.sfm_dir / "report.json"),
                ],
                log_path=converter_log,
                phase="postprocessing_mesh",
                error_code="mesh_converter_failed",
            )
        elif scene_glb.exists():
            self.log(log_stream, "Using existing unreal-import/scene_mesh.glb; no Agent 5 converter was invoked")
        else:
            self.fail(
                "mesh_conversion_unavailable",
                (
                    "reconstruction/mesh_dlnr.ply is ready, but no Agent 5 mesh converter interface was found "
                    "and unreal-import/scene_mesh.glb does not exist. Expected converter: env "
                    "ADAPTSIM_MESH_CONVERTER or workers/l4-unreal-import/adaptsim-convert-mesh. "
                    "Handoff source is reconstruction/mesh_dlnr.ply; expected outputs are "
                    "unreal-import/scene_mesh.glb and unreal-import/reconstruction_manifest.json."
                ),
                phase="postprocessing_mesh",
                retryable=True,
                exit_code=50,
            )

        self.require_nonempty_file(
            scene_glb,
            "scene_mesh_glb_missing",
            "Agent 5 did not produce unreal-import/scene_mesh.glb",
            phase="postprocessing_mesh",
        )
        manifest = self.build_reconstruction_manifest()
        write_json(manifest_path, manifest)
        self.artifacts["unreal_mesh_url"] = f"/api/v1/captures/{self.config.capture_id}/artifacts/unreal_mesh_glb"
        self.artifacts["reconstruction_manifest_uri"] = f"{self.capture_prefix}unreal-import/reconstruction_manifest.json"
        self.upload_outputs(required=False)

    def build_reconstruction_manifest(self) -> dict[str, Any]:
        metadata = self.require_metadata()
        sfm_report_path = self.sfm_dir / "report.json"
        mesh_ply = self.reconstruction_dir / "mesh_dlnr.ply"
        splat_ply = self.reconstruction_dir / "splat.ply"
        splat_usdz = self.reconstruction_dir / "splat.usdz"
        scene_glb = self.unreal_import_dir / "scene_mesh.glb"
        decimated_glb = self.unreal_import_dir / "scene_mesh_decimated.glb"
        collision_obj = self.unreal_import_dir / "collision_proxy.obj"
        source_stats = read_mesh_stats(mesh_ply)
        render_stats = source_stats
        collision_stats = read_mesh_stats(collision_obj) if collision_obj.exists() else None
        warnings = []
        warnings.extend(source_stats.warnings)
        if not decimated_glb.exists():
            warnings.append("scene_mesh_decimated.glb was not produced by the Agent 5 mesh converter.")
        if not collision_obj.exists():
            warnings.append("collision_proxy.obj was not produced by the Agent 5 mesh converter.")
        if metadata.scale_hint.type == "unknown":
            warnings.append("Capture scale hint is unknown; Unreal transform uses unit scale assumptions.")
        elif metadata.scale_hint.confidence == "operator_provided":
            warnings.append("Scale is operator-provided from capture metadata.")

        artifacts = [
            self.artifact_entry("raw_metadata", self.metadata_path, f"{self.capture_prefix}raw/metadata.json"),
            self.artifact_entry("sfm_report", sfm_report_path, f"{self.capture_prefix}sfm/colmap/report.json"),
        ]
        if splat_ply.exists():
            artifacts.append(self.artifact_entry("splat_ply", splat_ply, f"{self.capture_prefix}reconstruction/splat.ply"))
        if splat_usdz.exists():
            artifacts.append(
                self.artifact_entry("splat_usdz", splat_usdz, f"{self.capture_prefix}reconstruction/splat.usdz")
            )
        artifacts.extend(
            [
                self.artifact_entry("mesh_dlnr_ply", mesh_ply, f"{self.capture_prefix}reconstruction/mesh_dlnr.ply"),
                self.artifact_entry("unreal_mesh_glb", scene_glb, f"{self.capture_prefix}unreal-import/scene_mesh.glb"),
            ]
        )
        if decimated_glb.exists():
            artifacts.append(
                self.artifact_entry(
                    "unreal_mesh_decimated_glb",
                    decimated_glb,
                    f"{self.capture_prefix}unreal-import/scene_mesh_decimated.glb",
                )
            )
        if collision_obj.exists():
            artifacts.append(
                self.artifact_entry(
                    "collision_proxy_obj",
                    collision_obj,
                    f"{self.capture_prefix}unreal-import/collision_proxy.obj",
                )
            )
        artifacts.append(
            {
                "artifact_type": "reconstruction_manifest",
                "content_type": "application/json",
                "gcs_uri": f"{self.capture_prefix}unreal-import/reconstruction_manifest.json",
                "size_bytes": None,
                "sha256": None,
            }
        )
        sfm_report = load_json(sfm_report_path) if sfm_report_path.exists() else {}
        registered = int(sfm_report.get("registered_image_count") or self.sfm_registered_count() or 0)
        sparse_points = sfm_report.get("sparse_point_count", self.sfm_sparse_count())
        manifest = {
            "contract_type": "reconstruction_manifest",
            "schema_version": "1.0",
            "capture_id": self.config.capture_id,
            "generated_at": iso_now(),
            "gcs_prefix": self.capture_prefix,
            "worker": {
                "worker_id": "a100_reconstruction",
                "vm_instance": self.config.vm_instance or socket.gethostname() or "a100-instance-02",
                "zone": self.config.zone,
                "tool_versions": self.tool_versions(),
            },
            "raw_metadata_uri": f"{self.capture_prefix}raw/metadata.json",
            "image_count": max(1, int(sfm_report.get("image_count") or metadata.uploaded_image_count or metadata.expected_image_count)),
            "registered_image_count": registered,
            "sparse_point_count": sparse_points,
            "reconstruction_method": "fvdb_frgs_dlnr_mesh",
            "dlnr_truncation_margin_m": self.config.dlnr_truncation_margin_m,
            "coordinate_frame": {
                "units": "meters",
                "up_axis": "z",
                "forward_axis": "x",
                "handedness": "right",
                "scale_to_meters": 1.0,
            },
            "transform_to_unreal": {
                "origin": "operator_marker" if metadata.scale_hint.type != "unknown" else "unknown",
                "scale": 100.0,
                "rotation_deg": [0.0, 0.0, 0.0],
                "translation_m": [0.0, 0.0, 0.0],
            },
            "source_mesh": mesh_stats_contract(source_stats),
            "render_mesh": mesh_stats_contract(render_stats),
            "collision_proxy": mesh_stats_contract(collision_stats) if collision_stats else None,
            "artifacts": artifacts,
            "warnings": warnings[:32],
        }
        validated = ReconstructionManifest.model_validate(manifest)
        return validated.model_dump(mode="json")

    def artifact_entry(self, artifact_type: str, local_path: Path, gcs_uri: str) -> dict[str, Any]:
        if not local_path.exists():
            return {
                "artifact_type": artifact_type,
                "content_type": content_type_for(local_path),
                "gcs_uri": gcs_uri,
                "size_bytes": None,
                "sha256": None,
            }
        return {
            "artifact_type": artifact_type,
            "content_type": content_type_for(local_path),
            "gcs_uri": gcs_uri,
            "size_bytes": local_path.stat().st_size,
            "sha256": sha256_file(local_path),
        }

    def write_sfm_report(
        self,
        *,
        mode: str,
        input_dir: Path,
        image_count: int,
        registered_image_count: int,
        sparse_point_count: int | None,
        notes: list[str],
    ) -> Path:
        report_path = self.sfm_dir / "report.json"
        report = {
            "capture_id": self.config.capture_id,
            "generated_at": iso_now(),
            "mode": mode,
            "input_dir": str(input_dir),
            "image_count": image_count,
            "registered_image_count": registered_image_count,
            "sparse_point_count": sparse_point_count,
            "notes": notes,
        }
        write_json(report_path, report)
        return report_path

    def write_status(
        self,
        phase: str,
        message: str,
        *,
        error: dict[str, Any] | None = None,
        retryable: bool = False,
    ) -> None:
        self.refresh_artifact_links()
        status_payload = {
            "contract_type": "capture_status",
            "schema_version": "1.0",
            "capture_id": self.config.capture_id,
            "display_name": self.display_name or self.config.capture_id,
            "status": phase,
            "updated_at": iso_now(),
            "gcs_prefix": self.capture_prefix,
            "progress": {
                "phase": phase,
                "message": message[:300],
                "percent": PHASE_PROGRESS.get(phase, PHASE_PROGRESS["failed"]),
            },
            "sfm": self.sfm_status,
            "artifacts": self.artifacts,
            "unreal": {
                "status": "not_started",
                "level_path": None,
                "import_report_uri": None,
            },
            "error": error,
        }
        if phase == "failed" and status_payload["error"] is None:
            status_payload["error"] = {
                "code": "worker_failed",
                "message": message[:500],
                "failed_phase": "failed",
                "retryable": retryable,
            }
        validated = CaptureStatus.model_validate(status_payload)
        write_json(self.status_path, validated.model_dump(mode="json"))
        if self.storage is not None:
            self.storage.upload_file(self.status_path, f"{self.capture_prefix}status.json", required=True)

    def refresh_artifact_links(self) -> None:
        if (self.sfm_dir / "report.json").exists():
            self.artifacts["sfm_report_uri"] = f"{self.capture_prefix}sfm/colmap/report.json"
        if (self.reconstruction_dir / "splat.ply").exists():
            self.artifacts["splat_ply_uri"] = f"{self.capture_prefix}reconstruction/splat.ply"
        if (self.reconstruction_dir / "splat.usdz").exists():
            self.artifacts["splat_usdz_url"] = f"/api/v1/captures/{self.config.capture_id}/artifacts/splat_usdz"
        if (self.reconstruction_dir / "mesh_dlnr.ply").exists():
            self.artifacts["mesh_preview_url"] = f"/api/v1/captures/{self.config.capture_id}/artifacts/mesh_preview"
        if (self.unreal_import_dir / "scene_mesh.glb").exists():
            self.artifacts["unreal_mesh_url"] = f"/api/v1/captures/{self.config.capture_id}/artifacts/unreal_mesh_glb"
        if (self.unreal_import_dir / "reconstruction_manifest.json").exists():
            self.artifacts["reconstruction_manifest_uri"] = (
                f"{self.capture_prefix}unreal-import/reconstruction_manifest.json"
            )

    def upload_outputs(self, *, required: bool) -> None:
        assert self.storage is not None
        self.storage.upload_tree(self.logs_dir, f"{self.capture_prefix}logs", required=required)
        if (self.sfm_dir / "report.json").exists():
            self.storage.upload_file(self.sfm_dir / "report.json", f"{self.capture_prefix}sfm/colmap/report.json", required=required)
        if has_any_files(self.reconstruction_dir):
            self.storage.upload_tree(self.reconstruction_dir, f"{self.capture_prefix}reconstruction", required=required)
        if has_any_files(self.unreal_import_dir):
            self.storage.upload_tree(self.unreal_import_dir, f"{self.capture_prefix}unreal-import", required=required)

    def upload_logs_best_effort(self) -> None:
        if self.storage is None:
            return
        try:
            self.storage.upload_tree(self.logs_dir, f"{self.capture_prefix}logs", required=False)
        except Exception:
            return

    def upload_file_best_effort(self, source: Path, uri: str) -> None:
        if self.storage is None:
            return
        try:
            self.storage.upload_file(source, uri, required=False)
        except Exception:
            return

    def fail(
        self,
        code: str,
        message: str,
        *,
        phase: str,
        retryable: bool,
        exit_code: int,
    ) -> None:
        error = {
            "code": code,
            "message": message[:500],
            "failed_phase": phase if phase != "failed" else None,
            "retryable": retryable,
        }
        status_error: Exception | None = None
        try:
            self.write_status("failed", message, error=error, retryable=retryable)
        except Exception as exc:
            status_error = exc
        try:
            self.upload_logs_best_effort()
        except Exception:
            pass
        if status_error:
            message = f"{message}; additionally failed to upload failed status.json: {status_error}"
        raise WorkerFailure(code, message, phase=phase, retryable=retryable, exit_code=exit_code)

    def require_metadata(self) -> CaptureMetadata:
        if self.metadata is None:
            raise RuntimeError("metadata has not been loaded")
        return self.metadata

    def require_nonempty_file(self, path: Path, code: str, message: str, *, phase: str) -> None:
        if not path.exists() or path.stat().st_size <= 0:
            self.fail(code, message, phase=phase, retryable=True, exit_code=41)

    def resolve_frgs_bin(self) -> str:
        configured = self.config.frgs_bin or os.environ.get("ADAPTSIM_FRGS_BIN")
        candidates = []
        if configured:
            candidates.append(configured)
        candidates.append(str(Path("~/adaptsim/.venv-fvdb/bin/frgs").expanduser()))
        candidates.append("frgs")
        for candidate in candidates:
            resolved = resolve_executable(candidate)
            if resolved:
                return resolved
        self.fail(
            "frgs_not_found",
            "FVDB frgs executable was not found. Expected ~/adaptsim/.venv-fvdb/bin/frgs or ADAPTSIM_FRGS_BIN.",
            phase="reconstructing_splat",
            retryable=True,
            exit_code=42,
        )
        raise AssertionError("unreachable")

    def find_mesh_converter(self) -> str | None:
        candidates = []
        configured = self.config.mesh_converter or os.environ.get("ADAPTSIM_MESH_CONVERTER")
        if configured:
            candidates.append(configured)
        candidates.extend(
            [
                str(REPO_ROOT / "workers/l4-unreal-import/adaptsim-convert-mesh"),
                str(REPO_ROOT / "workers/l4-unreal-import/adaptsim-mesh-postprocess"),
                "adaptsim-convert-mesh",
            ]
        )
        for candidate in candidates:
            resolved = resolve_executable(candidate)
            if resolved:
                return resolved
        return None

    def run_tool(self, argv: list[str], *, log_path: Path, phase: str, error_code: str) -> None:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        with log_path.open("a", encoding="utf-8") as log:
            log.write(f"\n[{iso_now()}] $ {format_command(argv)}\n")
            log.flush()
            proc = subprocess.run(argv, cwd=self.work_dir, text=True, stdout=log, stderr=subprocess.STDOUT)
            log.write(f"[{iso_now()}] exit={proc.returncode}\n")
            log.flush()
        self.upload_logs_best_effort()
        if proc.returncode != 0:
            self.fail(
                error_code,
                f"{format_command(argv)} failed with exit code {proc.returncode}; see logs/{log_path.name}",
                phase=phase,
                retryable=True,
                exit_code=40,
            )

    def tool_versions(self) -> dict[str, str]:
        versions: dict[str, str] = {}
        colmap = resolve_executable(self.config.colmap_bin)
        if colmap:
            versions["colmap"] = command_version([colmap, "-h"])
        frgs = resolve_executable(self.config.frgs_bin or os.environ.get("ADAPTSIM_FRGS_BIN") or "frgs")
        if frgs:
            versions["frgs"] = command_version([frgs, "--version"])
        converter = self.find_mesh_converter()
        if converter:
            versions["mesh_converter"] = command_version([converter, "--version"])
        return versions

    def sfm_registered_count(self) -> int | None:
        if self.sfm_status:
            return self.sfm_status.get("registered_images")
        return None

    def sfm_sparse_count(self) -> int | None:
        if self.sfm_status:
            return self.sfm_status.get("sparse_points")
        return None


def resolve_executable(value: str | None) -> str | None:
    if not value:
        return None
    expanded = str(Path(value).expanduser()) if "/" in value else value
    if "/" in expanded:
        path = Path(expanded)
        if path.exists() and os.access(path, os.X_OK):
            return str(path)
        return None
    return shutil.which(expanded)


def command_version(argv: list[str]) -> str:
    try:
        proc = subprocess.run(argv, text=True, capture_output=True, timeout=8)
    except Exception:
        return "unknown"
    output = (proc.stdout or proc.stderr or "").strip().splitlines()
    return output[0][:120] if output else "available"


def count_colmap_registered_images(path: Path) -> int:
    if not path.exists():
        return 0
    count = 0
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        parts = stripped.split()
        if len(parts) >= 10:
            count += 1
    return count


def count_colmap_points(path: Path) -> int:
    if not path.exists():
        return 0
    return sum(
        1
        for line in path.read_text(encoding="utf-8", errors="ignore").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    )


def read_mesh_stats(path: Path) -> MeshStatsValue:
    if path.suffix.lower() == ".obj":
        return read_obj_stats(path)
    return read_ply_stats(path)


def read_obj_stats(path: Path) -> MeshStatsValue:
    points: list[tuple[float, float, float]] = []
    faces = 0
    if not path.exists():
        return unknown_mesh_stats(f"{path.name} does not exist")
    with path.open("r", encoding="utf-8", errors="ignore") as stream:
        for line in stream:
            if line.startswith("v "):
                parts = line.split()
                if len(parts) >= 4:
                    try:
                        points.append((float(parts[1]), float(parts[2]), float(parts[3])))
                    except ValueError:
                        continue
            elif line.startswith("f "):
                faces += 1
    return stats_from_points(len(points), faces, points, [])


def read_ply_stats(path: Path) -> MeshStatsValue:
    if not path.exists():
        return unknown_mesh_stats(f"{path.name} does not exist")
    vertex_count = 0
    face_count = 0
    is_ascii = False
    header_lines = 0
    with path.open("rb") as stream:
        for raw_line in stream:
            header_lines += 1
            line = raw_line.decode("ascii", errors="ignore").strip()
            if line.startswith("format ascii"):
                is_ascii = True
            elif line.startswith("element vertex"):
                vertex_count = int(line.split()[-1])
            elif line.startswith("element face"):
                face_count = int(line.split()[-1])
            elif line == "end_header":
                break
    warnings: list[str] = []
    points: list[tuple[float, float, float]] = []
    if is_ascii and vertex_count > 0:
        with path.open("r", encoding="utf-8", errors="ignore") as stream:
            for _ in range(header_lines):
                next(stream, None)
            for _ in range(vertex_count):
                line = next(stream, "")
                parts = line.split()
                if len(parts) < 3:
                    continue
                try:
                    points.append((float(parts[0]), float(parts[1]), float(parts[2])))
                except ValueError:
                    continue
    elif vertex_count > 0:
        warnings.append("PLY bounds were not parsed because the mesh is binary; using conservative placeholder bounds.")
    return stats_from_points(vertex_count, face_count, points, warnings)


def unknown_mesh_stats(reason: str) -> MeshStatsValue:
    return MeshStatsValue(
        vertices=0,
        faces=0,
        center_m=(0.0, 0.0, 0.0),
        size_m=(1.0, 1.0, 1.0),
        warnings=[reason],
    )


def stats_from_points(
    vertex_count: int,
    face_count: int,
    points: list[tuple[float, float, float]],
    warnings: list[str],
) -> MeshStatsValue:
    if not points:
        return MeshStatsValue(
            vertices=max(0, vertex_count),
            faces=max(0, face_count),
            center_m=(0.0, 0.0, 0.0),
            size_m=(1.0, 1.0, 1.0),
            warnings=warnings or ["Mesh bounds unavailable; using conservative placeholder bounds."],
        )
    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    zs = [point[2] for point in points]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    min_z, max_z = min(zs), max(zs)
    return MeshStatsValue(
        vertices=max(0, vertex_count),
        faces=max(0, face_count),
        center_m=((min_x + max_x) / 2.0, (min_y + max_y) / 2.0, (min_z + max_z) / 2.0),
        size_m=(max(max_x - min_x, 0.001), max(max_y - min_y, 0.001), max(max_z - min_z, 0.001)),
        warnings=warnings,
    )


def mesh_stats_contract(stats: MeshStatsValue) -> dict[str, Any]:
    return {
        "vertices": stats.vertices,
        "faces": stats.faces,
        "bounds_m": {
            "center_m": [round(value, 6) for value in stats.center_m],
            "size_m": {
                "x": round(max(stats.size_m[0], 0.001), 6),
                "y": round(max(stats.size_m[1], 0.001), 6),
                "z": round(max(stats.size_m[2], 0.001), 6),
            },
        },
    }


def parse_args(argv: list[str] | None = None) -> WorkerConfig:
    parser = argparse.ArgumentParser(description="Run the AdaptSim A100 reconstruction worker for one capture.")
    parser.add_argument("--capture-id", required=True, help="Capture ID under gcs-root/captures/.")
    parser.add_argument("--gcs-root", default=DEFAULT_GCS_ROOT, help=f"GCS root prefix. Default: {DEFAULT_GCS_ROOT}")
    parser.add_argument(
        "--work-root",
        type=Path,
        default=Path(os.environ.get("ADAPTSIM_CAPTURE_WORK_ROOT", str(DEFAULT_WORK_ROOT))).expanduser(),
        help="Local capture work root. Default: ~/adaptsim/data/captures",
    )
    parser.add_argument(
        "--dataset-mode",
        choices=["auto", "golden", "raw"],
        default="auto",
        help="auto uses safety_park golden FVDB tutorial data and raw mode for other captures.",
    )
    parser.add_argument("--golden-dataset-dir", type=Path, default=None, help="Prepared FVDB tutorial/COLMAP directory.")
    parser.add_argument("--min-images", type=int, default=DEFAULT_MIN_IMAGES)
    parser.add_argument("--min-registered-images", type=int, default=DEFAULT_MIN_REGISTERED_IMAGES)
    parser.add_argument(
        "--enable-raw-colmap",
        action="store_true",
        help="Enable the staged raw-photo COLMAP path for non-golden captures.",
    )
    parser.add_argument("--frgs-bin", default=None, help="Path to frgs. Default checks ADAPTSIM_FRGS_BIN and FVDB venv.")
    parser.add_argument("--colmap-bin", default=os.environ.get("COLMAP_BIN", "colmap"))
    parser.add_argument("--mesh-converter", default=None, help="Agent 5 mesh converter executable.")
    parser.add_argument("--dlnr-truncation-margin-m", type=float, default=DEFAULT_DLNR_MARGIN_M)
    parser.add_argument("--lock-file", type=Path, default=DEFAULT_LOCK_FILE)
    parser.add_argument("--no-lock", action="store_true", help="Disable the single-GPU lock. Intended for local tests only.")
    parser.add_argument("--vm-instance", default=os.environ.get("ADAPTSIM_VM_INSTANCE", ""))
    parser.add_argument("--zone", default=os.environ.get("ADAPTSIM_VM_ZONE", "us-east1-b"))
    args = parser.parse_args(argv)
    return WorkerConfig(
        capture_id=args.capture_id,
        gcs_root=args.gcs_root,
        work_root=args.work_root,
        dataset_mode=args.dataset_mode,
        golden_dataset_dir=args.golden_dataset_dir,
        min_images=args.min_images,
        min_registered_images=args.min_registered_images,
        enable_raw_colmap=args.enable_raw_colmap,
        frgs_bin=args.frgs_bin,
        colmap_bin=args.colmap_bin,
        mesh_converter=args.mesh_converter,
        dlnr_truncation_margin_m=args.dlnr_truncation_margin_m,
        lock_file=args.lock_file,
        no_lock=args.no_lock,
        vm_instance=args.vm_instance,
        zone=args.zone,
    )


def main(argv: list[str] | None = None) -> int:
    try:
        config = parse_args(argv)
        return ReconstructionWorker(config).run()
    except WorkerFailure as exc:
        print(f"ERROR {exc.code} [{exc.phase}]: {exc.message}", file=sys.stderr)
        return exc.exit_code
    except ValueError as exc:
        print(f"ERROR invalid_arguments: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
