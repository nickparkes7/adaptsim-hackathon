from __future__ import annotations

import importlib.util
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pytest


MODULE_PATH = Path(__file__).resolve().parents[1] / "adaptsim_reconstruct.py"
SPEC = importlib.util.spec_from_file_location("adaptsim_reconstruct", MODULE_PATH)
assert SPEC and SPEC.loader
reconstruct = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = reconstruct
SPEC.loader.exec_module(reconstruct)


GCS_ROOT = "gs://aiscanners-hackathon2025/adaptsim-captures"


class FakeStorage:
    def __init__(self, remote_root: Path) -> None:
        self.remote_root = remote_root
        self.status_updates: list[dict[str, Any]] = []

    def _local(self, uri: str) -> Path:
        prefix = f"{GCS_ROOT}/"
        assert uri.startswith(prefix), uri
        return self.remote_root / uri[len(prefix) :]

    def download_file(self, uri: str, destination: Path, *, required: bool = True) -> bool:
        source = self._local(uri)
        if not source.exists():
            if required:
                raise reconstruct.StorageError(f"missing {uri}")
            return False
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
        return True

    def download_tree(self, uri: str, destination: Path, *, required: bool = True) -> bool:
        source = self._local(uri.rstrip("/"))
        if not source.exists():
            if required:
                raise reconstruct.StorageError(f"missing {uri}")
            return False
        destination.mkdir(parents=True, exist_ok=True)
        shutil.copytree(source, destination, dirs_exist_ok=True)
        return True

    def upload_file(self, source: Path, uri: str, *, required: bool = True) -> bool:
        if not source.exists():
            if required:
                raise reconstruct.StorageError(f"missing local {source}")
            return False
        destination = self._local(uri)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
        if uri.endswith("/status.json"):
            self.status_updates.append(json.loads(source.read_text(encoding="utf-8")))
        return True

    def upload_tree(self, source: Path, uri: str, *, required: bool = True) -> bool:
        if not source.exists():
            return False
        destination = self._local(uri.rstrip("/"))
        destination.mkdir(parents=True, exist_ok=True)
        shutil.copytree(source, destination, dirs_exist_ok=True)
        return True


def metadata(capture_id: str, uploaded: int, images: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    return {
        "contract_type": "capture_metadata",
        "schema_version": "1.0",
        "capture_id": capture_id,
        "display_name": f"{capture_id} capture",
        "operator_id": "test_operator",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "environment_type": "test_area",
        "expected_image_count": max(uploaded, 1),
        "uploaded_image_count": uploaded,
        "scale_hint": {"type": "unknown", "label": None, "distance_m": None, "confidence": "unknown"},
        "notes": None,
        "gcs_bucket": "aiscanners-hackathon2025",
        "gcs_capture_prefix": "adaptsim-captures",
        "gcs_prefix": f"{GCS_ROOT}/captures/{capture_id}/",
        "signing_service_account": "photogrammetry-test@gecko-dev-fde.iam.gserviceaccount.com",
        "signing_region": "us",
        "images": images or [],
    }


def write_remote_metadata(remote: Path, capture_id: str, payload: dict[str, Any]) -> None:
    path = remote / "captures" / capture_id / "raw" / "metadata.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")


def status_path(remote: Path, capture_id: str) -> Path:
    return remote / "captures" / capture_id / "status.json"


def make_config(tmp_path: Path, capture_id: str, **overrides: Any) -> Any:
    values = {
        "capture_id": capture_id,
        "gcs_root": GCS_ROOT,
        "work_root": tmp_path / "work",
        "dataset_mode": "raw",
        "no_lock": True,
    }
    values.update(overrides)
    return reconstruct.WorkerConfig(**values)


def test_missing_images_fail_cleanly_and_upload_status(tmp_path: Path) -> None:
    capture_id = "test_capture"
    remote = tmp_path / "remote"
    write_remote_metadata(remote, capture_id, metadata(capture_id, uploaded=0))
    worker = reconstruct.ReconstructionWorker(make_config(tmp_path, capture_id), FakeStorage(remote))

    with pytest.raises(reconstruct.WorkerFailure) as raised:
        worker.run()

    assert raised.value.code == "no_uploaded_images"
    status = json.loads(status_path(remote, capture_id).read_text(encoding="utf-8"))
    assert status["status"] == "failed"
    assert status["error"]["code"] == "no_uploaded_images"
    assert status["error"]["failed_phase"] == "validating_images"


def test_raw_folder_detection_is_staged_behind_clear_error(tmp_path: Path) -> None:
    capture_id = "raw_capture"
    remote = tmp_path / "remote"
    images = []
    image_dir = remote / "captures" / capture_id / "raw" / "images"
    image_dir.mkdir(parents=True)
    for index in range(6):
        filename = f"IMG_{index:04d}.jpg"
        (image_dir / filename).write_bytes(b"not really a jpeg but enough for folder detection")
        images.append(
            {
                "filename": filename,
                "content_type": "image/jpeg",
                "size_bytes": 42,
                "gcs_uri": f"{GCS_ROOT}/captures/{capture_id}/raw/images/{filename}",
                "width_px": 100,
                "height_px": 100,
                "sha256": None,
            }
        )
    write_remote_metadata(remote, capture_id, metadata(capture_id, uploaded=6, images=images))
    worker = reconstruct.ReconstructionWorker(make_config(tmp_path, capture_id), FakeStorage(remote))

    with pytest.raises(reconstruct.WorkerFailure) as raised:
        worker.run()

    assert raised.value.code == "raw_colmap_not_enabled"
    status = json.loads(status_path(remote, capture_id).read_text(encoding="utf-8"))
    assert status["status"] == "failed"
    assert status["error"]["failed_phase"] == "sfm_solving"
    assert "raw-photo COLMAP" in status["error"]["message"]


def test_manifest_builder_validates_handoff_contract(tmp_path: Path) -> None:
    capture_id = "mesh_capture"
    config = make_config(tmp_path, capture_id)
    worker = reconstruct.ReconstructionWorker(config, FakeStorage(tmp_path / "remote"))
    worker.prepare_directories()
    worker.metadata_path.write_text(json.dumps(metadata(capture_id, uploaded=6)), encoding="utf-8")
    worker.metadata = reconstruct.CaptureMetadata.model_validate_json(worker.metadata_path.read_text(encoding="utf-8"))
    worker.sfm_status = {
        "input_images": 6,
        "registered_images": 6,
        "sparse_points": 12,
        "report_uri": f"{GCS_ROOT}/captures/{capture_id}/sfm/colmap/report.json",
    }
    reconstruct.write_json(
        worker.sfm_dir / "report.json",
        {
            "capture_id": capture_id,
            "image_count": 6,
            "registered_image_count": 6,
            "sparse_point_count": 12,
        },
    )
    (worker.reconstruction_dir / "mesh_dlnr.ply").write_text(
        "\n".join(
            [
                "ply",
                "format ascii 1.0",
                "element vertex 3",
                "property float x",
                "property float y",
                "property float z",
                "element face 1",
                "property list uchar int vertex_indices",
                "end_header",
                "0 0 0",
                "1 0 0",
                "0 2 1",
                "3 0 1 2",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    (worker.unreal_import_dir / "scene_mesh.glb").write_bytes(b"glb")

    manifest = worker.build_reconstruction_manifest()

    assert manifest["contract_type"] == "reconstruction_manifest"
    assert manifest["source_mesh"]["vertices"] == 3
    assert manifest["source_mesh"]["faces"] == 1
    artifact_types = {artifact["artifact_type"] for artifact in manifest["artifacts"]}
    assert {"raw_metadata", "sfm_report", "mesh_dlnr_ply", "unreal_mesh_glb"}.issubset(artifact_types)


def test_golden_safety_park_runs_all_phases_with_fake_tools(tmp_path: Path) -> None:
    capture_id = "safety_park"
    remote = tmp_path / "remote"
    write_remote_metadata(remote, capture_id, metadata(capture_id, uploaded=6))
    golden_dir = tmp_path / "golden"
    (golden_dir / "images").mkdir(parents=True)
    (golden_dir / "images" / "frame.jpg").write_bytes(b"jpg")
    fake_frgs = tmp_path / "frgs"
    fake_frgs.write_text(
        """#!/usr/bin/env python3
from pathlib import Path
import sys
cmd = sys.argv[1]
if cmd == "reconstruct":
    out = Path(sys.argv[sys.argv.index("-o") + 1])
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("ply\\nformat ascii 1.0\\nelement vertex 1\\nproperty float x\\nproperty float y\\nproperty float z\\nelement face 0\\nproperty list uchar int vertex_indices\\nend_header\\n0 0 0\\n")
elif cmd == "convert":
    Path(sys.argv[3]).write_bytes(b"usdz")
elif cmd == "mesh-dlnr":
    out = Path(sys.argv[sys.argv.index("-o") + 1])
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("ply\\nformat ascii 1.0\\nelement vertex 3\\nproperty float x\\nproperty float y\\nproperty float z\\nelement face 1\\nproperty list uchar int vertex_indices\\nend_header\\n0 0 0\\n1 0 0\\n0 1 1\\n3 0 1 2\\n")
else:
    raise SystemExit(2)
""",
        encoding="utf-8",
    )
    fake_frgs.chmod(0o755)
    fake_converter = tmp_path / "adaptsim-convert-mesh"
    fake_converter.write_text(
        """#!/usr/bin/env python3
from pathlib import Path
import sys
out = Path(sys.argv[sys.argv.index("--output-glb") + 1])
out.parent.mkdir(parents=True, exist_ok=True)
out.write_bytes(b"glb")
""",
        encoding="utf-8",
    )
    fake_converter.chmod(0o755)
    storage = FakeStorage(remote)
    worker = reconstruct.ReconstructionWorker(
        make_config(
            tmp_path,
            capture_id,
            dataset_mode="golden",
            golden_dataset_dir=golden_dir,
            frgs_bin=str(fake_frgs),
            mesh_converter=str(fake_converter),
        ),
        storage,
    )

    assert worker.run() == 0

    final_status = json.loads(status_path(remote, capture_id).read_text(encoding="utf-8"))
    assert final_status["status"] == "ready_for_unreal_import"
    phases = [status["status"] for status in storage.status_updates]
    assert phases == [
        "validating_images",
        "sfm_solving",
        "reconstructing_splat",
        "exporting_splat",
        "extracting_mesh",
        "postprocessing_mesh",
        "ready_for_unreal_import",
    ]
    assert (remote / "captures" / capture_id / "reconstruction" / "mesh_dlnr.ply").exists()
    assert (remote / "captures" / capture_id / "unreal-import" / "scene_mesh.glb").exists()
    assert (remote / "captures" / capture_id / "unreal-import" / "reconstruction_manifest.json").exists()
