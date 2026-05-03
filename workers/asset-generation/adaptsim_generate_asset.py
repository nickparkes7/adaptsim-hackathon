#!/usr/bin/env python3
from __future__ import annotations

import argparse
import contextlib
import dataclasses
import hashlib
import importlib.util
import json
import os
import shlex
import shutil
import socket
import subprocess
import sys
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
    AssetCard,
    AssetGenerationRequest,
    AssetGenerationResult,
)


DEFAULT_GCS_ROOT = "gs://aiscanners-hackathon2025/adaptsim-captures"
DEFAULT_WORK_ROOT = Path("~/adaptsim/data/captures").expanduser()
DEFAULT_LOCK_FILE = Path("/tmp/adaptsim-a100-asset-generation.lock")
DEFAULT_PROPKIND = "barricade"
DEFAULT_TRELLIS_MODEL = "microsoft/TRELLIS-text-large"
DEFAULT_TRELLIS_SIMPLIFY = 0.95
DEFAULT_TRELLIS_TEXTURE_SIZE = 1024
DEFAULT_TIMEOUT_S = 60 * 60

CONTENT_TYPES = {
    ".glb": "model/gltf-binary",
    ".json": "application/json",
    ".log": "text/plain",
    ".txt": "text/plain",
}

PROP_PRESETS: dict[str, dict[str, Any]] = {
    "barricade": {
        "asset_label": "light_barricade",
        "display_name": "Generated Light Barricade",
        "bounds_m": {"x": 1.2, "y": 0.35, "z": 0.9},
        "gameplay_tags": ["prop", "cover", "obstacle", "static_prop"],
        "capabilities": ["block_path", "provide_cover"],
        "preferred_affordances": ["hallway", "chokepoint", "entry_point"],
        "constraints": [
            "requires_collision",
            "requires_scale_review",
            "requires_pivot_review",
            "avoid_blocking_all_exits",
        ],
        "prompt": (
            "A lightweight tactical training barricade prop for an Unreal Engine simulator, "
            "waist-high modular cover, weathered plastic and metal, simple silhouette, "
            "game-ready static object, no people, no weapons, isolated on plain background"
        ),
        "scale_note": "Target in-engine bounds are approximately 1.2m wide, 0.35m deep, and 0.9m tall.",
        "pivot_note": "Expected Unreal import pivot is bottom-center at floor contact after review.",
        "collision_note": "Use simple box or convex blocking collision before whitelisting for ScenarioDirector spawning.",
    },
    "debris": {
        "asset_label": "debris_cover",
        "display_name": "Generated Debris Cover",
        "bounds_m": {"x": 1.0, "y": 0.55, "z": 0.55},
        "gameplay_tags": ["prop", "cover", "obstacle", "static_prop"],
        "capabilities": ["block_path", "provide_cover"],
        "preferred_affordances": ["hallway", "room", "objective_area"],
        "constraints": ["requires_collision", "requires_scale_review", "requires_pivot_review"],
        "prompt": (
            "A compact pile of nonhazardous training debris used as low cover in a simulator, "
            "broken panels and soft cases, game-ready static prop, no people, no weapons, "
            "isolated on plain background"
        ),
        "scale_note": "Target in-engine bounds are approximately 1.0m wide, 0.55m deep, and 0.55m tall.",
        "pivot_note": "Expected Unreal import pivot is bottom-center at the broadest floor contact point after review.",
        "collision_note": "Use simplified convex blocking collision; do not rely on generated concave geometry.",
    },
    "cover": {
        "asset_label": "portable_cover",
        "display_name": "Generated Portable Cover",
        "bounds_m": {"x": 1.1, "y": 0.4, "z": 1.0},
        "gameplay_tags": ["prop", "cover", "obstacle", "static_prop"],
        "capabilities": ["provide_cover"],
        "preferred_affordances": ["hallway", "chokepoint", "room"],
        "constraints": [
            "requires_collision",
            "requires_scale_review",
            "requires_pivot_review",
            "avoid_blocking_all_exits",
        ],
        "prompt": (
            "A portable training cover prop for a tactical simulator, neutral colors, "
            "folding panel shape, sturdy base, game-ready static object, no people, no weapons, "
            "isolated on plain background"
        ),
        "scale_note": "Target in-engine bounds are approximately 1.1m wide, 0.4m deep, and 1.0m tall.",
        "pivot_note": "Expected Unreal import pivot is bottom-center on the floor-facing base after review.",
        "collision_note": "Use simple blocking collision and verify it does not seal required routes.",
    },
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
    asset_request: str
    gcs_root: str = DEFAULT_GCS_ROOT
    work_root: Path = DEFAULT_WORK_ROOT
    prop_kind: str = DEFAULT_PROPKIND
    prompt: str | None = None
    asset_label: str | None = None
    display_name: str | None = None
    bounds_m: str | None = None
    trellis_backend: str = "auto"
    trellis_command: str | None = None
    trellis_python: str | None = None
    trellis_model: str = DEFAULT_TRELLIS_MODEL
    seed: int = 9
    simplify: float = DEFAULT_TRELLIS_SIMPLIFY
    texture_size: int = DEFAULT_TRELLIS_TEXTURE_SIZE
    timeout_s: int = DEFAULT_TIMEOUT_S
    lock_file: Path = DEFAULT_LOCK_FILE
    no_lock: bool = False
    vm_instance: str = ""
    zone: str = "us-east1-b"


@dataclasses.dataclass(slots=True)
class NormalizedAssetRequest:
    request_id: str
    capture_id: str
    requester_id: str
    requested_at: str
    outputs_requested: list[str]
    notes: str | None
    prompt: str | None
    prop_kind: str
    source: dict[str, Any]
    raw: dict[str, Any]
    contract_validated: bool


@dataclasses.dataclass(slots=True)
class StaticPropSpec:
    prop_kind: str
    asset_label: str
    display_name: str
    prompt: str
    bounds_m: dict[str, float]
    gameplay_tags: list[str]
    capabilities: list[str]
    preferred_affordances: list[str]
    constraints: list[str]
    collision_profile: str
    scale_note: str
    pivot_note: str
    collision_note: str


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


def format_command(argv: Iterable[str]) -> str:
    return " ".join(shlex.quote(part) for part in argv)


def sanitize_identifier(value: str, *, fallback: str = "asset_request") -> str:
    lowered = value.strip().lower()
    token = "".join(ch if ch.isalnum() else "_" for ch in lowered)
    token = "_".join(part for part in token.split("_") if part)
    if not token or not token[0].isalpha():
        token = f"{fallback}_{token}" if token else fallback
    if len(token) < 3:
        token = f"{token}_id"
    return token[:64]


def title_from_identifier(value: str) -> str:
    return " ".join(part.capitalize() for part in sanitize_identifier(value).split("_"))


def short_digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:8]


def unique_tokens(values: Any, *, fallback: list[str]) -> list[str]:
    if values is None:
        iterable: Iterable[Any] = []
    elif isinstance(values, str):
        iterable = [values]
    else:
        iterable = values
    result: list[str] = []
    for value in iterable:
        if not str(value).strip():
            continue
        token = sanitize_identifier(str(value), fallback="tag")
        if token and token not in result:
            result.append(token)
    return result or list(fallback)


def parse_bounds_m(value: Any, *, fallback: dict[str, float]) -> dict[str, float]:
    if value is None:
        return dict(fallback)
    if isinstance(value, str):
        parts = [part.strip() for part in value.replace("x", ",").split(",") if part.strip()]
        if len(parts) != 3:
            raise WorkerFailure(
                "invalid_bounds_m",
                "--bounds-m must contain three positive numbers, for example 1.0,0.5,0.8",
                phase="loading_request",
                retryable=False,
                exit_code=23,
            )
        try:
            x, y, z = [float(part) for part in parts]
        except ValueError as exc:
            raise WorkerFailure(
                "invalid_bounds_m",
                "--bounds-m must contain numeric meter values",
                phase="loading_request",
                retryable=False,
                exit_code=23,
            ) from exc
        bounds = {"x": x, "y": y, "z": z}
    elif isinstance(value, dict):
        try:
            bounds = {"x": float(value["x"]), "y": float(value["y"]), "z": float(value["z"])}
        except (KeyError, TypeError, ValueError) as exc:
            raise WorkerFailure(
                "invalid_bounds_m",
                "bounds_m must include positive numeric x, y, and z values",
                phase="loading_request",
                retryable=False,
                exit_code=23,
            ) from exc
    elif isinstance(value, list) and len(value) == 3:
        try:
            bounds = {"x": float(value[0]), "y": float(value[1]), "z": float(value[2])}
        except (TypeError, ValueError) as exc:
            raise WorkerFailure(
                "invalid_bounds_m",
                "bounds_m list must contain three positive numeric meter values",
                phase="loading_request",
                retryable=False,
                exit_code=23,
            ) from exc
    else:
        raise WorkerFailure(
            "invalid_bounds_m",
            "bounds_m must be an object, a three-item list, or a comma-separated x,y,z string",
            phase="loading_request",
            retryable=False,
            exit_code=23,
        )
    if any(component <= 0 for component in bounds.values()):
        raise WorkerFailure(
            "invalid_bounds_m",
            "bounds_m values must be positive meters",
            phase="loading_request",
            retryable=False,
            exit_code=23,
        )
    return bounds


class GcloudStorageClient:
    def __init__(self, log: Any | None = None) -> None:
        self.log = log

    def download_file(self, uri: str, destination: Path, *, required: bool = True) -> bool:
        destination.parent.mkdir(parents=True, exist_ok=True)
        return self._run(["gcloud", "storage", "cp", uri, str(destination)], required=required)

    def upload_file(self, source: Path, uri: str, *, required: bool = True) -> bool:
        if not source.exists():
            if required:
                raise StorageError(f"cannot upload missing file {source}")
            return False
        return self._run(["gcloud", "storage", "cp", str(source), uri], required=required)

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


@contextlib.contextmanager
def single_gpu_lock(path: Path, *, disabled: bool = False) -> Any:
    if disabled:
        yield
        return
    if fcntl is None:
        raise WorkerFailure(
            "lock_unavailable",
            "single-GPU lock requires fcntl on the A100 Linux worker",
            phase="initializing",
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
                f"another A100 asset generation job is holding {path}",
                phase="initializing",
                retryable=True,
                exit_code=12,
            ) from exc
        lock_file.write(f"{os.getpid()} {iso_now()}\n")
        lock_file.flush()
        try:
            yield
        finally:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)


class AssetGenerationWorker:
    def __init__(self, config: WorkerConfig, storage: Any | None = None) -> None:
        self.config = config
        self.config.gcs_root = normalize_gcs_root(config.gcs_root)
        self.storage = storage
        self.request: NormalizedAssetRequest | None = None
        self.capture_prefix = ""
        self.run_prefix = ""
        self.work_dir = Path()
        self.asset_dir = Path()
        self.logs_dir = Path()
        self.request_path = Path()
        self.glb_path = Path()
        self.asset_card_path = Path()
        self.result_path = Path()
        self.report_path = Path()
        self.log_path = Path()
        self.warnings: list[str] = []
        self._prop_spec: StaticPropSpec | None = None

    def run(self) -> int:
        bootstrap_dir = self.config.work_root.expanduser() / "_asset_generation_bootstrap"
        bootstrap_logs = bootstrap_dir / "logs"
        bootstrap_logs.mkdir(parents=True, exist_ok=True)
        bootstrap_log_path = bootstrap_logs / "asset-generation.log"
        with bootstrap_log_path.open("a", encoding="utf-8") as log_stream:
            if self.storage is None:
                self.storage = GcloudStorageClient(log_stream)
            self.log(log_stream, "Starting AdaptSim A100 Trellis asset generation")
            try:
                with single_gpu_lock(self.config.lock_file.expanduser(), disabled=self.config.no_lock):
                    self.load_request(log_stream, bootstrap_dir)
                    self.prepare_run_paths()
                    if bootstrap_log_path != self.log_path:
                        self.log_path.parent.mkdir(parents=True, exist_ok=True)
                        shutil.copy2(bootstrap_log_path, self.log_path)
                    with self.log_path.open("a", encoding="utf-8") as run_log:
                        self.log(run_log, f"Loaded request {self.require_request().request_id}")
                        self.generate_asset(run_log)
                        self.publish_success(run_log)
                    return 0
            except WorkerFailure as exc:
                self.publish_failure_best_effort(exc, log_stream)
                raise
            except Exception as exc:  # pragma: no cover - safety net.
                failure = WorkerFailure(
                    "unexpected_worker_error",
                    f"unexpected asset generation worker error: {exc}",
                    phase="failed",
                    retryable=True,
                    exit_code=99,
                )
                self.publish_failure_best_effort(failure, log_stream)
                raise failure

    def log(self, stream: Any, message: str) -> None:
        stream.write(f"[{iso_now()}] {message}\n")
        stream.flush()

    def load_request(self, log_stream: Any, bootstrap_dir: Path) -> None:
        source = self.config.asset_request
        request_path = bootstrap_dir / "asset_request.json"
        if source.startswith("gs://"):
            assert self.storage is not None
            try:
                self.storage.download_file(source, request_path, required=True)
            except StorageError as exc:
                raise WorkerFailure(
                    "asset_request_download_failed",
                    f"could not download asset request {source}: {exc}",
                    phase="loading_request",
                    retryable=True,
                    exit_code=20,
                ) from exc
        else:
            request_path = Path(source).expanduser().resolve()
            if not request_path.exists():
                raise WorkerFailure(
                    "asset_request_missing",
                    f"asset request file does not exist: {request_path}",
                    phase="loading_request",
                    retryable=False,
                    exit_code=20,
                )
        try:
            payload = load_json(request_path)
        except Exception as exc:
            raise WorkerFailure(
                "invalid_asset_request_json",
                f"asset request is not valid JSON: {exc}",
                phase="loading_request",
                retryable=False,
                exit_code=21,
            ) from exc
        if not isinstance(payload, dict):
            raise WorkerFailure(
                "invalid_asset_request_shape",
                "asset request JSON must be an object",
                phase="loading_request",
                retryable=False,
                exit_code=21,
            )
        self.request = self.normalize_request(payload, request_path)
        self.request_path = request_path
        self.capture_prefix = capture_prefix(self.config.gcs_root, self.request.capture_id)
        self.run_prefix = f"{self.capture_prefix}asset-generation/{self.request.request_id}/"
        self.log(log_stream, f"Asset request loaded from {source}")

    def normalize_request(self, payload: dict[str, Any], request_path: Path) -> NormalizedAssetRequest:
        if payload.get("contract_type") == "asset_generation_request":
            try:
                contract = AssetGenerationRequest.model_validate(payload)
            except Exception as exc:
                raise WorkerFailure(
                    "invalid_asset_generation_request",
                    f"asset_generation_request validation failed: {exc}",
                    phase="loading_request",
                    retryable=False,
                    exit_code=22,
                ) from exc
            return NormalizedAssetRequest(
                request_id=contract.request_id,
                capture_id=contract.capture_id,
                requester_id=contract.requester_id,
                requested_at=contract.requested_at.isoformat().replace("+00:00", "Z"),
                outputs_requested=list(contract.outputs_requested),
                notes=contract.notes,
                prompt=None,
                prop_kind=self.normalize_prop_kind(self.config.prop_kind),
                source=contract.source.model_dump(mode="json"),
                raw=payload,
                contract_validated=True,
            )

        required = ["request_id", "capture_id"]
        missing = [key for key in required if not payload.get(key)]
        if missing:
            raise WorkerFailure(
                "invalid_simple_asset_request",
                (
                    f"simple asset request {request_path} is missing required field(s): {', '.join(missing)}. "
                    "Use the asset_generation_request contract when possible."
                ),
                phase="loading_request",
                retryable=False,
                exit_code=22,
            )
        source = payload.get("source")
        if not isinstance(source, dict):
            source = {}
        prop_kind = self.normalize_prop_kind(str(payload.get("prop_kind") or self.config.prop_kind))
        outputs = payload.get("outputs_requested") or ["asset_card"]
        if not isinstance(outputs, list) or not all(isinstance(item, str) for item in outputs):
            raise WorkerFailure(
                "invalid_simple_asset_request",
                "simple asset request outputs_requested must be a list of strings",
                phase="loading_request",
                retryable=False,
                exit_code=22,
            )
        return NormalizedAssetRequest(
            request_id=sanitize_identifier(str(payload["request_id"]), fallback="asset_request"),
            capture_id=sanitize_identifier(str(payload["capture_id"]), fallback="capture"),
            requester_id=sanitize_identifier(str(payload.get("requester_id") or "asset_worker"), fallback="requester"),
            requested_at=str(payload.get("requested_at") or iso_now()),
            outputs_requested=outputs,
            notes=payload.get("notes") if isinstance(payload.get("notes"), str) else None,
            prompt=payload.get("prompt") if isinstance(payload.get("prompt"), str) else None,
            prop_kind=prop_kind,
            source=source,
            raw=payload,
            contract_validated=False,
        )

    def normalize_prop_kind(self, value: str) -> str:
        token = sanitize_identifier(value, fallback=DEFAULT_PROPKIND)
        return token

    def prepare_run_paths(self) -> None:
        request = self.require_request()
        self.work_dir = (
            self.config.work_root.expanduser()
            / request.capture_id
            / "asset-generation"
            / request.request_id
        ).resolve()
        self.asset_dir = self.work_dir / "static-props"
        self.logs_dir = self.work_dir / "logs"
        for path in [self.asset_dir, self.logs_dir]:
            path.mkdir(parents=True, exist_ok=True)
        asset_id = self.asset_id()
        self.glb_path = self.asset_dir / f"{asset_id}.glb"
        self.asset_card_path = self.asset_dir / f"{asset_id}.asset_card.json"
        self.result_path = self.work_dir / "asset_generation_result.json"
        self.report_path = self.work_dir / "trellis_static_prop_report.json"
        self.log_path = self.logs_dir / "asset-generation.log"

    def generate_asset(self, log_stream: Any) -> None:
        request = self.require_request()
        if "asset_card" not in request.outputs_requested:
            self.warnings.append(
                "asset_card was not explicitly requested; this worker only supports static prop asset-card generation."
            )
        spec = self.prop_spec()
        prompt = spec.prompt
        self.log(log_stream, f"Generating {request.prop_kind} GLB using Trellis prompt: {prompt}")
        self.run_trellis(prompt, log_stream)
        self.require_nonempty_file(
            self.glb_path,
            "trellis_glb_missing",
            f"Trellis completed without producing a nonempty GLB at {self.glb_path}",
            phase="generating_asset",
        )
        self.require_glb_file(self.glb_path)
        asset_card = self.build_asset_card()
        write_json(self.asset_card_path, asset_card)
        self.validate_asset_card(self.asset_card_path)

    def run_trellis(self, prompt: str, log_stream: Any) -> None:
        command_template = self.config.trellis_command or os.environ.get("ADAPTSIM_TRELLIS_COMMAND")
        backend = self.config.trellis_backend
        if backend in {"auto", "command"} and command_template:
            argv = self.expand_trellis_command(command_template, prompt)
            self.run_tool(
                argv,
                log_path=self.logs_dir / "trellis.log",
                phase="generating_asset",
                error_code="trellis_command_failed",
            )
            return
        if backend == "command":
            raise WorkerFailure(
                "trellis_unavailable",
                "trellis backend is command, but no --trellis-command or ADAPTSIM_TRELLIS_COMMAND was provided",
                phase="generating_asset",
                retryable=True,
                exit_code=30,
            )
        if backend in {"auto", "python"}:
            python_bin = self.config.trellis_python or os.environ.get("ADAPTSIM_TRELLIS_PYTHON") or sys.executable
            if backend == "auto" and not self.config.trellis_python and not os.environ.get("ADAPTSIM_TRELLIS_PYTHON"):
                if importlib.util.find_spec("trellis") is None:
                    raise WorkerFailure(
                        "trellis_unavailable",
                        (
                            "Trellis Python package is not importable in this environment and no "
                            "ADAPTSIM_TRELLIS_COMMAND was provided. Install Microsoft TRELLIS on the A100 "
                            "or pass --trellis-command pointing at a prepared generator. Fallback prop assets "
                            "are not modified by this worker."
                        ),
                        phase="generating_asset",
                        retryable=True,
                        exit_code=30,
                    )
            argv = [
                python_bin,
                "-c",
                TRELLIS_TEXT_ADAPTER,
                "--prompt",
                prompt,
                "--output-glb",
                str(self.glb_path),
                "--model",
                self.config.trellis_model,
                "--seed",
                str(self.config.seed),
                "--simplify",
                f"{self.config.simplify:g}",
                "--texture-size",
                str(self.config.texture_size),
            ]
            self.run_tool(
                argv,
                log_path=self.logs_dir / "trellis.log",
                phase="generating_asset",
                error_code="trellis_python_adapter_failed",
            )
            return
        raise WorkerFailure(
            "invalid_trellis_backend",
            f"unsupported trellis backend {backend!r}; expected auto, command, or python",
            phase="generating_asset",
            retryable=False,
            exit_code=30,
        )

    def expand_trellis_command(self, template: str, prompt: str) -> list[str]:
        request = self.require_request()
        values = {
            "prompt": prompt,
            "output_glb": str(self.glb_path),
            "work_dir": str(self.work_dir),
            "asset_id": self.asset_id(),
            "request_json": str(self.request_path),
            "model": self.config.trellis_model,
            "seed": str(self.config.seed),
            "simplify": f"{self.config.simplify:g}",
            "texture_size": str(self.config.texture_size),
            "capture_id": request.capture_id,
            "request_id": request.request_id,
        }
        try:
            return [part.format(**values) for part in shlex.split(template)]
        except Exception as exc:
            raise WorkerFailure(
                "invalid_trellis_command",
                f"could not expand trellis command template: {exc}",
                phase="generating_asset",
                retryable=False,
                exit_code=31,
            ) from exc

    def run_tool(
        self,
        argv: list[str],
        *,
        log_path: Path,
        phase: str,
        error_code: str,
    ) -> None:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        with log_path.open("a", encoding="utf-8") as stream:
            stream.write(f"[{iso_now()}] $ {format_command(argv)}\n")
            stream.flush()
            try:
                proc = subprocess.run(
                    argv,
                    text=True,
                    stdout=stream,
                    stderr=subprocess.STDOUT,
                    timeout=self.config.timeout_s,
                )
            except FileNotFoundError as exc:
                raise WorkerFailure(
                    "trellis_executable_missing",
                    f"could not execute {argv[0]!r}: {exc}",
                    phase=phase,
                    retryable=True,
                    exit_code=32,
                ) from exc
            except subprocess.TimeoutExpired as exc:
                raise WorkerFailure(
                    "trellis_timeout",
                    f"Trellis command exceeded timeout of {self.config.timeout_s} seconds",
                    phase=phase,
                    retryable=True,
                    exit_code=33,
                ) from exc
        if proc.returncode != 0:
            detail = tail_text(log_path)
            raise WorkerFailure(
                error_code,
                f"Trellis command failed with exit {proc.returncode}. Log tail: {detail}",
                phase=phase,
                retryable=True,
                exit_code=34,
            )

    def require_nonempty_file(self, path: Path, code: str, message: str, *, phase: str) -> None:
        if not path.exists() or path.stat().st_size == 0:
            raise WorkerFailure(code, message, phase=phase, retryable=True, exit_code=35)

    def require_glb_file(self, path: Path) -> None:
        try:
            with path.open("rb") as stream:
                magic = stream.read(4)
        except OSError as exc:
            raise WorkerFailure(
                "trellis_glb_unreadable",
                f"could not read generated GLB {path}: {exc}",
                phase="generating_asset",
                retryable=True,
                exit_code=35,
            ) from exc
        if magic != b"glTF":
            raise WorkerFailure(
                "trellis_glb_invalid",
                f"generated file {path} does not have a GLB binary header",
                phase="generating_asset",
                retryable=True,
                exit_code=35,
            )

    def build_asset_card(self) -> dict[str, Any]:
        spec = self.prop_spec()
        description = (
            f"Trellis-generated draft static prop for AdaptSim. {spec.scale_note} "
            f"{spec.pivot_note} {spec.collision_note}"
        )
        card = {
            "contract_type": "asset_card",
            "schema_version": "1.0",
            "asset_id": self.asset_id(),
            "category": "static_prop",
            "display_name": spec.display_name,
            "description": description,
            "unreal_asset_path": None,
            "spawn_policy": "never_spawn",
            "gameplay_tags": spec.gameplay_tags,
            "capabilities": spec.capabilities,
            "equipment": [],
            "preferred_affordances": spec.preferred_affordances,
            "constraints": spec.constraints,
            "behavior_profiles": [],
            "likelihood_modifiers": {},
            "collision_profile": spec.collision_profile,
            "bounds_m": spec.bounds_m,
            "ingestion_status": "prototype",
        }
        return AssetCard.model_validate(card).model_dump(mode="json")

    def validate_asset_card(self, path: Path) -> None:
        try:
            AssetCard.model_validate(load_json(path))
        except Exception as exc:
            raise WorkerFailure(
                "invalid_generated_asset_card",
                f"generated asset card failed validation: {exc}",
                phase="writing_outputs",
                retryable=False,
                exit_code=40,
            ) from exc

    def publish_success(self, log_stream: Any) -> None:
        request = self.require_request()
        assert self.storage is not None
        glb_uri = f"{self.run_prefix}static-props/{self.glb_path.name}"
        asset_card_uri = f"{self.run_prefix}static-props/{self.asset_card_path.name}"
        result_uri = f"{self.run_prefix}asset_generation_result.json"
        report_uri = f"{self.run_prefix}trellis_static_prop_report.json"
        log_uri = f"{self.run_prefix}logs/asset-generation.log"
        trellis_log_uri = f"{self.run_prefix}logs/trellis.log"

        self.warnings.extend(self.notes_as_warnings())
        self.warnings.append(
            f"Generated GLB is published at {glb_uri}; current asset_generation_result contract cannot type GLB artifacts directly."
        )
        result = self.build_result(
            status="succeeded",
            generated_assets=[
                {
                    "artifact_type": "asset_card",
                    "artifact_id": self.asset_id(),
                    "gcs_uri": asset_card_uri,
                    "unreal_asset_path": None,
                }
            ],
            warnings=self.warnings,
            errors=[],
        )
        write_json(self.result_path, result)
        report = self.build_report(
            status="succeeded",
            artifacts={
                "glb_uri": glb_uri,
                "asset_card_uri": asset_card_uri,
                "asset_generation_result_uri": result_uri,
                "report_uri": report_uri,
                "log_uri": log_uri,
                "trellis_log_uri": trellis_log_uri,
            },
            error=None,
        )
        write_json(self.report_path, report)

        self.storage.upload_file(self.glb_path, glb_uri, required=True)
        self.storage.upload_file(self.asset_card_path, asset_card_uri, required=True)
        self.storage.upload_file(self.result_path, result_uri, required=True)
        self.storage.upload_file(self.report_path, report_uri, required=True)
        self.storage.upload_file(self.log_path, log_uri, required=False)
        trellis_log = self.logs_dir / "trellis.log"
        if trellis_log.exists():
            self.storage.upload_file(trellis_log, trellis_log_uri, required=False)
        self.log(log_stream, f"Published generated asset {self.asset_id()} to {self.run_prefix}")
        print(json.dumps({"status": "succeeded", "asset_id": self.asset_id(), "glb_uri": glb_uri, "asset_card_uri": asset_card_uri}))

    def publish_failure_best_effort(self, failure: WorkerFailure, log_stream: Any) -> None:
        if self.request is None:
            print(json.dumps({"status": "failed", "error": {"code": failure.code, "message": failure.message}}), file=sys.stderr)
            return
        try:
            if self.work_dir == Path():
                self.prepare_run_paths()
            self.logs_dir.mkdir(parents=True, exist_ok=True)
            if not self.log_path.exists():
                write_text(self.log_path, f"[{iso_now()}] {failure.code}: {failure.message}\n")
            result = self.build_result(
                status="failed",
                generated_assets=[],
                warnings=[
                    "Fallback prop asset cards and paths were not modified.",
                    *self.notes_as_warnings(),
                ],
                errors=[f"{failure.code}: {failure.message}"],
            )
            write_json(self.result_path, result)
            report = self.build_report(
                status="failed",
                artifacts={
                    "asset_generation_result_uri": f"{self.run_prefix}asset_generation_result.json",
                    "report_uri": f"{self.run_prefix}trellis_static_prop_report.json",
                    "log_uri": f"{self.run_prefix}logs/asset-generation.log",
                },
                error={
                    "code": failure.code,
                    "message": failure.message,
                    "phase": failure.phase,
                    "retryable": failure.retryable,
                },
            )
            write_json(self.report_path, report)
            if self.storage is not None:
                self.storage.upload_file(self.result_path, f"{self.run_prefix}asset_generation_result.json", required=False)
                self.storage.upload_file(self.report_path, f"{self.run_prefix}trellis_static_prop_report.json", required=False)
                self.storage.upload_file(self.log_path, f"{self.run_prefix}logs/asset-generation.log", required=False)
                trellis_log = self.logs_dir / "trellis.log"
                if trellis_log.exists():
                    self.storage.upload_file(trellis_log, f"{self.run_prefix}logs/trellis.log", required=False)
        except Exception as exc:  # pragma: no cover - best-effort reporting.
            self.log(log_stream, f"Failed while publishing failure report: {exc}")
        print(json.dumps({"status": "failed", "error": {"code": failure.code, "message": failure.message}}), file=sys.stderr)

    def build_result(
        self,
        *,
        status: str,
        generated_assets: list[dict[str, Any]],
        warnings: list[str],
        errors: list[str],
    ) -> dict[str, Any]:
        request = self.require_request()
        payload = {
            "contract_type": "asset_generation_result",
            "schema_version": "1.0",
            "request_id": request.request_id,
            "capture_id": request.capture_id,
            "generated_at": iso_now(),
            "status": status,
            "generated_assets": generated_assets,
            "warnings": dedupe(warnings)[:32],
            "errors": errors[:32],
        }
        return AssetGenerationResult.model_validate(payload).model_dump(mode="json")

    def build_report(
        self,
        *,
        status: str,
        artifacts: dict[str, Any],
        error: dict[str, Any] | None,
    ) -> dict[str, Any]:
        request = self.require_request()
        spec = self.prop_spec()
        files: dict[str, Any] = {}
        for label, path in [
            ("glb", self.glb_path),
            ("asset_card", self.asset_card_path),
            ("result", self.result_path),
        ]:
            if path.exists():
                files[label] = self.file_entry(path)
        return {
            "contract_type": "trellis_static_prop_report",
            "schema_version": "0.1",
            "request_id": request.request_id,
            "capture_id": request.capture_id,
            "asset_id": self.asset_id(),
            "status": status,
            "generated_at": iso_now(),
            "worker": {
                "worker_id": "a100_trellis_asset_generation",
                "vm_instance": self.config.vm_instance or socket.gethostname() or "a100-instance-02",
                "zone": self.config.zone,
                "tool_versions": self.tool_versions(),
            },
            "request_contract_validated": request.contract_validated,
            "source": request.source,
            "prop_kind": request.prop_kind,
            "prompt": spec.prompt,
            "trellis": {
                "backend": self.selected_backend_label(),
                "model": self.config.trellis_model,
                "seed": self.config.seed,
                "simplify": self.config.simplify,
                "texture_size": self.config.texture_size,
            },
            "artifacts": artifacts,
            "files": files,
            "scale_pivot_collision_notes": {
                "scale": spec.scale_note,
                "pivot": spec.pivot_note,
                "collision": spec.collision_note,
            },
            "fallback_paths_touched": [],
            "warnings": dedupe(self.warnings),
            "error": error,
        }

    def file_entry(self, path: Path) -> dict[str, Any]:
        return {
            "path": str(path),
            "content_type": content_type_for(path),
            "size_bytes": path.stat().st_size,
            "sha256": sha256_file(path),
        }

    def notes_as_warnings(self) -> list[str]:
        spec = self.prop_spec()
        return [
            spec.scale_note,
            spec.pivot_note,
            spec.collision_note,
            "Draft asset card uses spawn_policy=never_spawn until Unreal import, collision, scale, and whitelist review are complete.",
        ]

    def tool_versions(self) -> dict[str, str]:
        versions = {"python": sys.version.split()[0]}
        for tool in ["nvidia-smi", "gcloud"]:
            resolved = shutil.which(tool)
            if resolved:
                versions[tool] = resolved
        if importlib.util.find_spec("trellis") is not None:
            versions["trellis_python_package"] = "importable"
        return versions

    def selected_backend_label(self) -> str:
        if self.config.trellis_command or os.environ.get("ADAPTSIM_TRELLIS_COMMAND"):
            return "command"
        if self.config.trellis_backend == "python" or self.config.trellis_python or os.environ.get("ADAPTSIM_TRELLIS_PYTHON"):
            return "python"
        return self.config.trellis_backend

    def prop_spec(self) -> StaticPropSpec:
        if self._prop_spec is not None:
            return self._prop_spec
        request = self.require_request()
        raw = request.raw
        preset = PROP_PRESETS.get(request.prop_kind)

        prompt = self.config.prompt or request.prompt
        if prompt is None:
            prompt = self.extract_prompt_from_notes(request.notes)
        if prompt is None and isinstance(raw.get("prompt"), str):
            prompt = raw["prompt"]
        if prompt is None and preset:
            prompt = str(preset["prompt"])
        if prompt is None:
            prompt = (
                f"A game-ready static prop for an Unreal Engine training simulator: "
                f"{title_from_identifier(request.prop_kind)}, isolated on plain background, no people, no weapons"
            )
            self.warnings.append(
                "No explicit prompt was supplied for a custom prop; generated a generic prompt from prop_kind."
            )

        label = self.config.asset_label
        if label is None and isinstance(raw.get("asset_label"), str):
            label = raw["asset_label"]
        if label is None and preset:
            label = str(preset["asset_label"])
        label = sanitize_identifier(label or request.prop_kind, fallback="generated_prop")

        display_name = self.config.display_name
        if display_name is None and isinstance(raw.get("display_name"), str):
            display_name = raw["display_name"]
        if display_name is None and preset:
            display_name = str(preset["display_name"])
        display_name = (display_name or f"Generated {title_from_identifier(label)}")[:96]

        bounds_source = self.config.bounds_m
        if bounds_source is None:
            bounds_source = raw.get("bounds_m")
        fallback_bounds = preset["bounds_m"] if preset else {"x": 1.0, "y": 1.0, "z": 1.0}
        bounds_m = parse_bounds_m(bounds_source, fallback=fallback_bounds)

        gameplay_tags = unique_tokens(
            raw.get("gameplay_tags", preset["gameplay_tags"] if preset else ["prop", "static_prop"]),
            fallback=["prop", "static_prop"],
        )
        if "prop" not in gameplay_tags:
            gameplay_tags.insert(0, "prop")
        if "static_prop" not in gameplay_tags:
            gameplay_tags.append("static_prop")

        capabilities = unique_tokens(
            raw.get("capabilities", preset["capabilities"] if preset else []),
            fallback=[],
        )
        preferred_affordances = unique_tokens(
            raw.get("preferred_affordances", preset["preferred_affordances"] if preset else []),
            fallback=[],
        )
        constraints = unique_tokens(
            raw.get(
                "constraints",
                preset["constraints"] if preset else ["requires_collision", "requires_scale_review", "requires_pivot_review"],
            ),
            fallback=["requires_collision", "requires_scale_review", "requires_pivot_review"],
        )

        collision_profile = raw.get("collision_profile", "block_all")
        if collision_profile not in {"none", "block_all", "overlap_only", "pawn"}:
            collision_profile = "block_all"

        scale_note = self.spec_text(
            raw,
            "scale_note",
            preset["scale_note"] if preset else "Target scale is request-defined or pending Unreal import review.",
        )
        pivot_note = self.spec_text(
            raw,
            "pivot_note",
            preset["pivot_note"] if preset else "Expected Unreal import pivot is bottom-center after review.",
        )
        collision_note = self.spec_text(
            raw,
            "collision_note",
            preset["collision_note"] if preset else "Use simple or convex collision before whitelisting for spawning.",
        )

        self._prop_spec = StaticPropSpec(
            prop_kind=request.prop_kind,
            asset_label=label,
            display_name=display_name,
            prompt=prompt[:1000],
            bounds_m=bounds_m,
            gameplay_tags=gameplay_tags,
            capabilities=capabilities,
            preferred_affordances=preferred_affordances,
            constraints=constraints,
            collision_profile=str(collision_profile),
            scale_note=scale_note,
            pivot_note=pivot_note,
            collision_note=collision_note,
        )
        return self._prop_spec

    def extract_prompt_from_notes(self, notes: str | None) -> str | None:
        if notes:
            marker_index = notes.lower().find("prompt:")
            if marker_index >= 0:
                cleaned = notes[marker_index + len("prompt:") :].strip()
                if cleaned:
                    return cleaned[:1000]
        return None

    def spec_text(self, raw: dict[str, Any], field: str, fallback: str) -> str:
        value = raw.get(field)
        if isinstance(value, str) and value.strip():
            return value.strip()[:220]
        return fallback

    def prompt(self) -> str:
        return self.prop_spec().prompt

    def asset_label(self) -> str:
        return self.prop_spec().asset_label

    def asset_id(self) -> str:
        request = self.require_request()
        return sanitize_identifier(
            f"prop_trellis_{self.asset_label()}_{short_digest(request.request_id)}",
            fallback="prop_trellis_asset",
        )

    def require_request(self) -> NormalizedAssetRequest:
        if self.request is None:
            raise RuntimeError("asset request has not been loaded")
        return self.request


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def tail_text(path: Path, *, max_chars: int = 2000) -> str:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return ""
    return text[-max_chars:].replace("\n", "\\n")


def dedupe(values: Iterable[str]) -> list[str]:
    result: list[str] = []
    for value in values:
        if value not in result:
            result.append(value)
    return result


TRELLIS_TEXT_ADAPTER = r'''
from __future__ import annotations

import argparse
import os

os.environ.setdefault("SPCONV_ALGO", "native")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--output-glb", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--seed", type=int, default=9)
    parser.add_argument("--simplify", type=float, default=0.95)
    parser.add_argument("--texture-size", type=int, default=1024)
    args = parser.parse_args()

    from trellis.pipelines import TrellisTextTo3DPipeline
    from trellis.utils import postprocessing_utils

    pipeline = TrellisTextTo3DPipeline.from_pretrained(args.model)
    pipeline.cuda()
    outputs = pipeline.run(args.prompt, seed=args.seed)
    glb = postprocessing_utils.to_glb(
        outputs["gaussian"][0],
        outputs["mesh"][0],
        simplify=args.simplify,
        texture_size=args.texture_size,
    )
    glb.export(args.output_glb)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
'''


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Generate optional AdaptSim static props with Trellis on the A100 worker.")
    parser.add_argument("--asset-request", required=True, help="Local path or gs:// URI to an asset_generation_request JSON file.")
    parser.add_argument("--gcs-root", default=DEFAULT_GCS_ROOT, help="GCS capture root, for example gs://bucket/prefix.")
    parser.add_argument("--work-root", type=Path, default=DEFAULT_WORK_ROOT, help="Local worker data root.")
    parser.add_argument("--prop-kind", default=DEFAULT_PROPKIND, help="Static prop kind. Known presets: barricade, cover, debris; custom values are allowed.")
    parser.add_argument("--prompt", default=None, help="Prompt for dynamic Trellis generation. Overrides request notes/simple prompt.")
    parser.add_argument("--asset-label", default=None, help="Stable label used to derive the draft asset_id for custom props.")
    parser.add_argument("--display-name", default=None, help="Display name for the draft asset card.")
    parser.add_argument("--bounds-m", default=None, help="Approximate x,y,z meter bounds for the draft asset card.")
    parser.add_argument("--trellis-backend", default="auto", choices=["auto", "command", "python"], help="How to invoke Trellis.")
    parser.add_argument("--trellis-command", default=None, help="External command template that writes {output_glb}.")
    parser.add_argument("--trellis-python", default=None, help="Python executable with Microsoft TRELLIS installed.")
    parser.add_argument("--trellis-model", default=os.environ.get("ADAPTSIM_TRELLIS_MODEL", DEFAULT_TRELLIS_MODEL))
    parser.add_argument("--seed", type=int, default=9)
    parser.add_argument("--simplify", type=float, default=DEFAULT_TRELLIS_SIMPLIFY)
    parser.add_argument("--texture-size", type=int, default=DEFAULT_TRELLIS_TEXTURE_SIZE)
    parser.add_argument("--timeout-s", type=int, default=DEFAULT_TIMEOUT_S)
    parser.add_argument("--lock-file", type=Path, default=DEFAULT_LOCK_FILE)
    parser.add_argument("--no-lock", action="store_true", help="Disable the single-GPU lock for tests.")
    parser.add_argument("--vm-instance", default=os.environ.get("ADAPTSIM_VM_INSTANCE", ""))
    parser.add_argument("--zone", default=os.environ.get("ADAPTSIM_VM_ZONE", "us-east1-b"))
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        config = WorkerConfig(
            asset_request=args.asset_request,
            gcs_root=args.gcs_root,
            work_root=args.work_root,
            prop_kind=args.prop_kind,
            prompt=args.prompt,
            asset_label=args.asset_label,
            display_name=args.display_name,
            bounds_m=args.bounds_m,
            trellis_backend=args.trellis_backend,
            trellis_command=args.trellis_command,
            trellis_python=args.trellis_python,
            trellis_model=args.trellis_model,
            seed=args.seed,
            simplify=args.simplify,
            texture_size=args.texture_size,
            timeout_s=args.timeout_s,
            lock_file=args.lock_file,
            no_lock=args.no_lock,
            vm_instance=args.vm_instance,
            zone=args.zone,
        )
        worker = AssetGenerationWorker(config)
        return worker.run()
    except WorkerFailure as exc:
        return exc.exit_code
    except ValueError as exc:
        parser.error(str(exc))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
