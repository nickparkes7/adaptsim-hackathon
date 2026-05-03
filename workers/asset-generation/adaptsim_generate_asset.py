#!/usr/bin/env python3
from __future__ import annotations

import argparse
import contextlib
import dataclasses
import hashlib
import importlib.util
import json
import os
import re
import shlex
import shutil
import socket
import struct
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
ASSET_CARD_CATEGORIES = {
    "adversary_role",
    "static_prop",
    "equipment",
    "effect",
    "objective_marker",
    "training_marker",
    "threat_vector",
}
THREAT_DOMAINS = {"air", "ground", "maritime", "equipment", "personnel", "unknown"}
THREAT_CATEGORIES = {
    "dismounted_personnel",
    "uav",
    "fpv_drone",
    "quadcopter",
    "ugv",
    "vehicle",
    "usv",
    "weapon_equipment",
    "sensor_payload",
}
MOVEMENT_DOMAINS = {"ground", "air", "water", "interior"}
TACTICAL_ROLES = {"recon", "harassment", "ambush", "patrol", "breach", "overwatch", "decoy"}
TRELLIS_RETRYABLE_CODES_FOR_DEMO_CACHE = {
    "trellis_unavailable",
    "trellis_executable_missing",
    "trellis_timeout",
    "trellis_command_failed",
    "trellis_python_adapter_failed",
}

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
    allow_cached_demo_output: bool = False
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
    negative_prompt: str | None = None
    target_format: str = "glb"
    output_prefix: str | None = None


@dataclasses.dataclass(slots=True)
class NormalizedBatchRequest:
    request_id: str
    capture_id: str
    session_id: str
    requester_id: str
    requested_at: str
    input_fingerprint: str
    source_database_path: str
    model: str | None
    assets: list[dict[str, Any]]
    raw: dict[str, Any]


@dataclasses.dataclass(slots=True)
class StaticPropSpec:
    prop_kind: str
    asset_label: str
    display_name: str
    asset_category: str
    prompt: str
    bounds_m: dict[str, float]
    gameplay_tags: list[str]
    capabilities: list[str]
    equipment: list[str]
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


def first_text(source: dict[str, Any], *keys: str) -> str:
    for key in keys:
        value = source.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def clamp_text(value: Any, max_length: int, fallback: str = "") -> str:
    text = str(value).strip() if value is not None else ""
    return (text or fallback)[:max_length]


def truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in {"1", "true", "yes", "y", "on"}


def normalize_asset_card_category(value: Any, *, fallback: str = "static_prop") -> str:
    category = sanitize_identifier(str(value or ""), fallback=fallback)
    return category if category in ASSET_CARD_CATEGORIES else fallback


def parse_bounds_from_scale_text(text: str) -> dict[str, float] | None:
    if not text.strip():
        return None
    lowered = text.lower()
    axis_patterns = {
        "x": r"(?:x|width|wide|w)\D{0,24}(\d+(?:\.\d+)?)\s*(?:m|meter|meters)\b|(\d+(?:\.\d+)?)\s*(?:m|meter|meters)\s*(?:wide|width|w)\b",
        "y": r"(?:y|depth|deep|d)\D{0,24}(\d+(?:\.\d+)?)\s*(?:m|meter|meters)\b|(\d+(?:\.\d+)?)\s*(?:m|meter|meters)\s*(?:deep|depth|d)\b",
        "z": r"(?:z|height|tall|h)\D{0,24}(\d+(?:\.\d+)?)\s*(?:m|meter|meters)\b|(\d+(?:\.\d+)?)\s*(?:m|meter|meters)\s*(?:tall|height|h)\b",
    }
    bounds: dict[str, float] = {}
    for axis, pattern in axis_patterns.items():
        match = re.search(pattern, lowered)
        if not match:
            continue
        value = next(group for group in match.groups() if group)
        bounds[axis] = float(value)
    if set(bounds) == {"x", "y", "z"} and all(value > 0 for value in bounds.values()):
        return bounds
    values = [float(value) for value in re.findall(r"(\d+(?:\.\d+)?)\s*(?:m|meter|meters)\b", lowered)]
    if len(values) >= 3 and all(value > 0 for value in values[:3]):
        return {"x": values[0], "y": values[1], "z": values[2]}
    return None


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
        self.cached_demo_info: dict[str, Any] | None = None

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
                    payload, request_path = self.load_request_payload(log_stream, bootstrap_dir)
                    if payload.get("contract_type") == "trellis_asset_generation_request":
                        return self.run_batch(payload, request_path, bootstrap_log_path, log_stream)
                    self.initialize_single_request(payload, request_path, log_stream)
                    self.run_loaded_single_asset(bootstrap_log_path, log_stream)
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

    def load_request_payload(self, log_stream: Any, bootstrap_dir: Path) -> tuple[dict[str, Any], Path]:
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
        self.log(log_stream, f"Asset request loaded from {source}")
        return payload, request_path

    def load_request(self, log_stream: Any, bootstrap_dir: Path) -> None:
        payload, request_path = self.load_request_payload(log_stream, bootstrap_dir)
        self.initialize_single_request(payload, request_path, log_stream)

    def initialize_single_request(self, payload: dict[str, Any], request_path: Path, log_stream: Any) -> None:
        self.request = self.normalize_request(payload, request_path)
        self.request_path = request_path
        self.capture_prefix = capture_prefix(self.config.gcs_root, self.request.capture_id)
        self.run_prefix = f"{self.capture_prefix}asset-generation/{self.request.request_id}/"
        self.log(log_stream, f"Normalized single asset request {self.request.request_id}")

    def run_loaded_single_asset(self, bootstrap_log_path: Path, log_stream: Any) -> None:
        self.prepare_run_paths()
        if bootstrap_log_path != self.log_path:
            self.log_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(bootstrap_log_path, self.log_path)
        with self.log_path.open("a", encoding="utf-8") as run_log:
            self.log(run_log, f"Loaded request {self.require_request().request_id}")
            self.generate_asset(run_log)
            self.publish_success(run_log)

    def run_batch(
        self,
        payload: dict[str, Any],
        request_path: Path,
        bootstrap_log_path: Path,
        log_stream: Any,
    ) -> int:
        batch = self.normalize_batch_request(payload, request_path)
        assert self.storage is not None

        self.capture_prefix = capture_prefix(self.config.gcs_root, batch.capture_id)
        batch_prefix = f"{self.capture_prefix}asset-generation/{batch.request_id}/"
        batch_work_dir = (
            self.config.work_root.expanduser()
            / batch.capture_id
            / "asset-generation"
            / batch.request_id
        ).resolve()
        requests_dir = batch_work_dir / "requests"
        logs_dir = batch_work_dir / "logs"
        requests_dir.mkdir(parents=True, exist_ok=True)
        logs_dir.mkdir(parents=True, exist_ok=True)
        batch_request_path = batch_work_dir / "trellis_request.json"
        batch_result_path = batch_work_dir / "asset_generation_result.json"
        batch_report_path = batch_work_dir / "trellis_asset_generation_batch_report.json"
        batch_log_path = logs_dir / "asset-generation-batch.log"
        shutil.copy2(bootstrap_log_path, batch_log_path)
        write_json(batch_request_path, payload)

        request_uri = f"{batch_prefix}trellis_request.json"
        result_uri = f"{batch_prefix}asset_generation_result.json"
        report_uri = f"{batch_prefix}trellis_asset_generation_batch_report.json"
        log_uri = f"{batch_prefix}logs/asset-generation-batch.log"

        asset_reports: list[dict[str, Any]] = []
        generated_assets: list[dict[str, Any]] = []
        warnings: list[str] = []
        errors: list[str] = []

        with batch_log_path.open("a", encoding="utf-8") as batch_log:
            self.log(
                batch_log,
                f"Loaded Trellis batch request {batch.request_id} with {len(batch.assets)} asset candidate(s)",
            )
            for index, asset in enumerate(batch.assets):
                child_payload = self.single_asset_payload_from_batch(batch, asset, index, batch_prefix)
                child_request_path = requests_dir / f"{child_payload['request_id']}.json"
                write_json(child_request_path, child_payload)
                child_config = self.config_for_batch_asset(child_payload)
                child = AssetGenerationWorker(child_config, self.storage)
                try:
                    child.initialize_single_request(child_payload, child_request_path, batch_log)
                    child.run_prefix = f"{batch_prefix}assets/{child.asset_id()}/"
                    child.run_loaded_single_asset(batch_log_path, batch_log)
                    child_result = load_json(child.result_path)
                    child_report = load_json(child.report_path)
                    generated_assets.extend(child_result.get("generated_assets", []))
                    warnings.extend(child_result.get("warnings", []))
                    asset_reports.append(
                        self.batch_asset_report_entry(
                            child,
                            child_payload,
                            status="succeeded",
                            result=child_result,
                            report=child_report,
                            error=None,
                        )
                    )
                except WorkerFailure as exc:
                    child.publish_failure_best_effort(exc, batch_log)
                    child_result = load_json(child.result_path) if child.result_path.exists() else {}
                    child_report = load_json(child.report_path) if child.report_path.exists() else {}
                    errors.append(f"{child_payload['request_id']}: {exc.code}: {exc.message}")
                    warnings.extend(child_result.get("warnings", []))
                    asset_reports.append(
                        self.batch_asset_report_entry(
                            child,
                            child_payload,
                            status="failed",
                            result=child_result,
                            report=child_report,
                            error={
                                "code": exc.code,
                                "message": exc.message,
                                "phase": exc.phase,
                                "retryable": exc.retryable,
                            },
                        )
                    )
                    self.log(batch_log, f"Asset {child_payload['request_id']} failed: {exc.code}: {exc.message}")

        status = "failed" if errors else "succeeded"
        if generated_assets:
            warnings.append(
                "Generated GLB artifact URIs are listed in trellis_asset_generation_batch_report.json and per-asset reports."
            )
        result = self.build_batch_result(
            batch,
            status=status,
            generated_assets=generated_assets,
            warnings=warnings,
            errors=errors,
        )
        write_json(batch_result_path, result)
        report = self.build_batch_report(
            batch,
            status=status,
            artifacts={
                "request_uri": request_uri,
                "asset_generation_result_uri": result_uri,
                "report_uri": report_uri,
                "log_uri": log_uri,
            },
            assets=asset_reports,
            error=None if not errors else {"code": "trellis_batch_failed", "messages": errors},
        )
        write_json(batch_report_path, report)

        self.storage.upload_file(batch_request_path, request_uri, required=False)
        self.storage.upload_file(batch_result_path, result_uri, required=False)
        self.storage.upload_file(batch_report_path, report_uri, required=False)
        self.storage.upload_file(batch_log_path, log_uri, required=False)

        print(
            json.dumps(
                {
                    "status": status,
                    "request_id": batch.request_id,
                    "capture_id": batch.capture_id,
                    "asset_count": len(batch.assets),
                    "succeeded": sum(1 for asset in asset_reports if asset["status"] == "succeeded"),
                    "failed": sum(1 for asset in asset_reports if asset["status"] == "failed"),
                    "report_uri": report_uri,
                }
            )
        )
        if errors:
            raise WorkerFailure(
                "trellis_batch_failed",
                f"{len(errors)} of {len(batch.assets)} Trellis asset generation candidate(s) failed. "
                f"See {report_uri} for per-asset diagnostics.",
                phase="generating_asset",
                retryable=True,
                exit_code=34,
            )
        return 0

    def normalize_batch_request(self, payload: dict[str, Any], request_path: Path) -> NormalizedBatchRequest:
        if payload.get("contract_type") != "trellis_asset_generation_request":
            raise WorkerFailure(
                "invalid_trellis_batch_request",
                "batch request contract_type must be trellis_asset_generation_request",
                phase="loading_request",
                retryable=False,
                exit_code=22,
            )
        assets = payload.get("assets")
        if not isinstance(assets, list) or not assets:
            raise WorkerFailure(
                "invalid_trellis_batch_request",
                f"trellis_asset_generation_request {request_path} must include a nonempty assets[] array",
                phase="loading_request",
                retryable=False,
                exit_code=22,
            )
        if not all(isinstance(asset, dict) for asset in assets):
            raise WorkerFailure(
                "invalid_trellis_batch_request",
                "trellis_asset_generation_request assets[] entries must be objects",
                phase="loading_request",
                retryable=False,
                exit_code=22,
            )
        session_id = sanitize_identifier(str(payload.get("session_id") or payload.get("capture_id") or "trellis_session"), fallback="session")
        capture_id = sanitize_identifier(str(payload.get("capture_id") or session_id), fallback="capture")
        request_id = sanitize_identifier(str(payload.get("request_id") or f"trellis_{session_id}"), fallback="trellis_request")
        requester_id = sanitize_identifier(str(payload.get("requester_id") or "local_control_api"), fallback="requester")
        return NormalizedBatchRequest(
            request_id=request_id,
            capture_id=capture_id,
            session_id=session_id,
            requester_id=requester_id,
            requested_at=str(payload.get("requested_at") or iso_now()),
            input_fingerprint=str(payload.get("input_fingerprint") or ""),
            source_database_path=str(payload.get("source_database_path") or ""),
            model=str(payload.get("model")) if payload.get("model") else None,
            assets=assets,
            raw=payload,
        )

    def single_asset_payload_from_batch(
        self,
        batch: NormalizedBatchRequest,
        asset: dict[str, Any],
        index: int,
        batch_prefix: str,
    ) -> dict[str, Any]:
        source_asset_id = str(asset.get("source_asset_id") or "").strip()
        asset_id = sanitize_identifier(
            str(asset.get("asset_id") or source_asset_id or f"trellis_asset_{index + 1:02d}"),
            fallback="trellis_asset",
        )
        request_id = sanitize_identifier(
            str(asset.get("request_id") or f"{batch.request_id}_{index + 1:02d}_{asset_id}"),
            fallback="asset_request",
        )
        prompt = first_text(asset, "prompt", "generation_prompt", "detailed_prompt")
        if not prompt:
            raise WorkerFailure(
                "invalid_trellis_asset_candidate",
                f"asset candidate {asset_id} is missing prompt or generation_prompt",
                phase="loading_request",
                retryable=False,
                exit_code=22,
            )
        target_format = str(asset.get("target_format") or "glb").lower()
        if target_format != "glb":
            raise WorkerFailure(
                "unsupported_trellis_target_format",
                f"asset candidate {asset_id} requested target_format={target_format!r}; only glb is supported",
                phase="loading_request",
                retryable=False,
                exit_code=22,
            )
        display_name = str(asset.get("display_name") or title_from_identifier(asset_id))[:96]
        prop_kind = sanitize_identifier(
            str(asset.get("prop_kind") or asset.get("asset_kind") or asset.get("kind") or source_asset_id or asset_id),
            fallback="static_prop",
        )
        output_prefix = str(asset.get("output_prefix") or f"{batch_prefix}assets/{asset_id}/")
        bounds_m = asset.get("bounds_m")
        if bounds_m is None:
            bounds_m = parse_bounds_from_scale_text(str(asset.get("scale_descriptor") or ""))
        scale_note = str(asset.get("scale_note") or asset.get("scale_descriptor") or "Target scale is generated from the Trellis request and pending Unreal import review.")
        pivot_note = str(asset.get("pivot_note") or "Expected Unreal import pivot is bottom-center after review.")
        collision_note = str(asset.get("collision_note") or "Use simple or convex collision before whitelisting for spawning.")
        source: dict[str, Any] = {
            "trellis_batch_request_id": batch.request_id,
            "trellis_session_id": batch.session_id,
            "input_fingerprint": batch.input_fingerprint,
            "source_database_path": batch.source_database_path,
            "source_asset_id": source_asset_id,
            "candidate_index": index,
            "output_prefix": output_prefix,
            "target_format": target_format,
            "negative_prompt": str(asset.get("negative_prompt") or ""),
            "visual_descriptor": asset.get("visual_descriptor"),
            "geometry_descriptor": asset.get("geometry_descriptor"),
            "material_descriptor": asset.get("material_descriptor"),
            "texture_descriptor": asset.get("texture_descriptor"),
            "scale_descriptor": asset.get("scale_descriptor"),
            "scene_context": asset.get("scene_context"),
            "detail_checklist": asset.get("detail_checklist") if isinstance(asset.get("detail_checklist"), list) else [],
            "safety_notes": asset.get("safety_notes") if isinstance(asset.get("safety_notes"), list) else [],
        }
        threat_metadata = asset.get("threat_metadata") if isinstance(asset.get("threat_metadata"), dict) else None
        if threat_metadata and batch.source_database_path and not threat_metadata.get("source_database_path"):
            threat_metadata = {**threat_metadata, "source_database_path": batch.source_database_path}
        return {
            "request_id": request_id,
            "capture_id": batch.capture_id,
            "requested_at": batch.requested_at,
            "requester_id": batch.requester_id,
            "prop_kind": prop_kind,
            "asset_id": asset_id,
            "asset_category": normalize_asset_card_category(
                asset.get("asset_category") or asset.get("category"),
                fallback="equipment" if threat_metadata else "static_prop",
            ),
            "asset_label": str(asset.get("asset_label") or asset_id),
            "display_name": display_name,
            "prompt": prompt,
            "visual_generation_prompt": str(asset.get("visual_generation_prompt") or prompt),
            "threat_category": str(asset.get("threat_category") or ""),
            "movement_domain": str(asset.get("movement_domain") or ""),
            "tactical_role": str(asset.get("tactical_role") or ""),
            "runtime_binding_hint": str(asset.get("runtime_binding_hint") or ""),
            "spawn_affordances": asset.get("spawn_affordances") if isinstance(asset.get("spawn_affordances"), list) else [],
            "behavior_profile_candidates": asset.get("behavior_profile_candidates")
            if isinstance(asset.get("behavior_profile_candidates"), list)
            else [],
            "safety_note": str(asset.get("safety_note") or "non-operational training simulation"),
            "negative_prompt": str(asset.get("negative_prompt") or ""),
            "target_format": target_format,
            "output_prefix": output_prefix,
            "bounds_m": bounds_m,
            "scale_note": scale_note[:220],
            "pivot_note": pivot_note[:220],
            "collision_note": collision_note[:220],
            "gameplay_tags": asset.get("gameplay_tags") if isinstance(asset.get("gameplay_tags"), list) else ["prop", "static_prop"],
            "capabilities": asset.get("capabilities") if isinstance(asset.get("capabilities"), list) else [],
            "equipment": asset.get("equipment") if isinstance(asset.get("equipment"), list) else [],
            "preferred_affordances": asset.get("preferred_affordances") if isinstance(asset.get("preferred_affordances"), list) else [],
            "constraints": asset.get("constraints") if isinstance(asset.get("constraints"), list) else [
                "requires_collision",
                "requires_scale_review",
                "requires_pivot_review",
            ],
            "collision_profile": asset.get("collision_profile") or "block_all",
            "threat_metadata": threat_metadata,
            "allow_cached_demo_output": truthy(asset.get("allow_cached_demo_output")),
            "cached_demo_key": str(asset.get("cached_demo_key") or ""),
            "outputs_requested": ["asset_card"],
            "source": source,
            "model": asset.get("model") or batch.model,
            "texture_size": asset.get("texture_size"),
        }

    def config_for_batch_asset(self, payload: dict[str, Any]) -> WorkerConfig:
        config = dataclasses.replace(self.config)
        texture_size = payload.get("texture_size")
        if isinstance(texture_size, int) and texture_size > 0:
            config.texture_size = texture_size
        model = payload.get("model")
        if isinstance(model, str) and model.strip() and self.config.trellis_model == DEFAULT_TRELLIS_MODEL:
            config.trellis_model = model.strip()
        return config

    def batch_asset_report_entry(
        self,
        child: "AssetGenerationWorker",
        payload: dict[str, Any],
        *,
        status: str,
        result: dict[str, Any],
        report: dict[str, Any],
        error: dict[str, Any] | None,
    ) -> dict[str, Any]:
        return {
            "request_id": payload["request_id"],
            "asset_id": child.asset_id() if child.request is not None else payload.get("asset_id"),
            "display_name": payload.get("display_name"),
            "status": status,
            "target_format": payload.get("target_format", "glb"),
            "output_prefix": payload.get("output_prefix"),
            "source": payload.get("source", {}),
            "result": result,
            "report": report,
            "error": error,
        }

    def build_batch_result(
        self,
        batch: NormalizedBatchRequest,
        *,
        status: str,
        generated_assets: list[dict[str, Any]],
        warnings: list[str],
        errors: list[str],
    ) -> dict[str, Any]:
        payload = {
            "contract_type": "asset_generation_result",
            "schema_version": "1.0",
            "request_id": batch.request_id,
            "capture_id": batch.capture_id,
            "generated_at": iso_now(),
            "status": status,
            "generated_assets": generated_assets,
            "warnings": dedupe(warnings)[:32],
            "errors": errors[:32],
        }
        return AssetGenerationResult.model_validate(payload).model_dump(mode="json")

    def build_batch_report(
        self,
        batch: NormalizedBatchRequest,
        *,
        status: str,
        artifacts: dict[str, Any],
        assets: list[dict[str, Any]],
        error: dict[str, Any] | None,
    ) -> dict[str, Any]:
        effective_model = batch.model if batch.model and self.config.trellis_model == DEFAULT_TRELLIS_MODEL else self.config.trellis_model
        return {
            "contract_type": "trellis_asset_generation_batch_report",
            "schema_version": "0.1",
            "request_id": batch.request_id,
            "capture_id": batch.capture_id,
            "session_id": batch.session_id,
            "status": status,
            "generated_at": iso_now(),
            "worker": {
                "worker_id": "a100_trellis_asset_generation",
                "vm_instance": self.config.vm_instance or socket.gethostname() or "a100-instance-02",
                "zone": self.config.zone,
                "tool_versions": self.tool_versions(),
            },
            "source_database_path": batch.source_database_path,
            "input_fingerprint": batch.input_fingerprint,
            "trellis": {
                "backend": self.selected_backend_label(),
                "requested_model": batch.model,
                "model": effective_model,
                "seed": self.config.seed,
                "simplify": self.config.simplify,
            },
            "artifacts": artifacts,
            "gcs_paths": {
                "batch_prefix": artifacts["request_uri"].rsplit("trellis_request.json", 1)[0],
                "request": artifacts["request_uri"],
                "asset_generation_result": artifacts["asset_generation_result_uri"],
                "batch_report": artifacts["report_uri"],
                "batch_log": artifacts["log_uri"],
                "glbs": [
                    asset.get("report", {}).get("artifacts", {}).get("glb_uri")
                    for asset in assets
                    if asset.get("report", {}).get("artifacts", {}).get("glb_uri")
                ],
                "asset_cards": [
                    asset.get("report", {}).get("artifacts", {}).get("asset_card_uri")
                    for asset in assets
                    if asset.get("report", {}).get("artifacts", {}).get("asset_card_uri")
                ],
            },
            "assets": assets,
            "fallback_paths_touched": [],
            "error": error,
        }

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
        target_format = str(payload.get("target_format") or "glb").lower()
        if target_format != "glb":
            raise WorkerFailure(
                "unsupported_trellis_target_format",
                f"simple asset request target_format={target_format!r}; only glb is supported",
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
            negative_prompt=payload.get("negative_prompt") if isinstance(payload.get("negative_prompt"), str) else None,
            target_format=target_format,
            output_prefix=payload.get("output_prefix") if isinstance(payload.get("output_prefix"), str) else None,
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
        try:
            self.run_trellis(prompt, request.negative_prompt or "", log_stream)
        except WorkerFailure as exc:
            if not self.should_use_cached_demo_output(exc):
                raise
            self.write_cached_demo_output(exc, log_stream)
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

    def run_trellis(self, prompt: str, negative_prompt: str, log_stream: Any) -> None:
        command_template = self.config.trellis_command or os.environ.get("ADAPTSIM_TRELLIS_COMMAND")
        backend = self.config.trellis_backend
        if backend in {"auto", "command"} and command_template:
            argv = self.expand_trellis_command(command_template, prompt, negative_prompt)
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
                "--negative-prompt",
                negative_prompt,
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

    def expand_trellis_command(self, template: str, prompt: str, negative_prompt: str) -> list[str]:
        request = self.require_request()
        values = {
            "prompt": prompt,
            "negative_prompt": negative_prompt,
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

    def should_use_cached_demo_output(self, failure: WorkerFailure) -> bool:
        if failure.code not in TRELLIS_RETRYABLE_CODES_FOR_DEMO_CACHE:
            return False
        request = self.require_request()
        return (
            self.config.allow_cached_demo_output
            or truthy(os.environ.get("ADAPTSIM_ALLOW_CACHED_DEMO_OUTPUTS"))
            or truthy(request.raw.get("allow_cached_demo_output"))
            or truthy(request.raw.get("cached_demo_output"))
        )

    def write_cached_demo_output(self, failure: WorkerFailure, log_stream: Any) -> None:
        request = self.require_request()
        threat_metadata = self.normalized_threat_metadata()
        cache_key = self.demo_cache_key(threat_metadata)
        self.glb_path.parent.mkdir(parents=True, exist_ok=True)
        write_demo_glb(self.glb_path, cache_key=cache_key, label=self.asset_id())
        self.cached_demo_info = {
            "used": True,
            "cache_key": cache_key,
            "reason_code": failure.code,
            "reason": failure.message[:500],
            "requested_trellis_model": self.config.trellis_model,
            "threat_domain": threat_metadata.get("threat_domain") if threat_metadata else "unknown",
            "threat_category": threat_metadata.get("threat_category") if threat_metadata else request.prop_kind,
        }
        self.warnings.append(
            f"Cached demo GLB was used because Trellis did not complete ({failure.code}); rerun on the A100 for final Trellis output."
        )
        self.log(
            log_stream,
            f"Using cached demo GLB for {request.request_id}: {failure.code}: {failure.message}",
        )

    def demo_cache_key(self, threat_metadata: dict[str, Any] | None) -> str:
        raw_key = self.require_request().raw.get("cached_demo_key")
        if isinstance(raw_key, str) and raw_key.strip():
            return sanitize_identifier(raw_key, fallback="generic")
        haystack = " ".join(
            str(value or "")
            for value in [
                self.require_request().prop_kind,
                self.asset_id(),
                threat_metadata.get("threat_domain") if threat_metadata else "",
                threat_metadata.get("threat_category") if threat_metadata else "",
                threat_metadata.get("platform_family") if threat_metadata else "",
            ]
        ).lower()
        if any(token in haystack for token in ["quadcopter", "fpv", "drone", "uav", "uas", "air"]):
            return "fpv_quadcopter"
        if any(token in haystack for token in ["ugv", "ground", "vehicle", "rover", "cart"]):
            return "light_ugv"
        if any(token in haystack for token in ["weapon", "equipment", "kit", "case", "sensor"]):
            return "equipment_visual"
        return "generic_static_prop"

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
        threat_metadata = self.normalized_threat_metadata()
        if threat_metadata:
            description = clamp_text(
                (
                    f"Trellis-generated draft {threat_metadata['threat_domain']} threat visual mesh for AdaptSim: "
                    f"{threat_metadata['platform_family']}. {spec.scale_note} {spec.pivot_note} {spec.collision_note}"
                ),
                500,
            )
        else:
            description = clamp_text(
                (
                    f"Trellis-generated draft static prop for AdaptSim. {spec.scale_note} "
                    f"{spec.pivot_note} {spec.collision_note}"
                ),
                500,
            )
        card = {
            "contract_type": "asset_card",
            "schema_version": "1.0",
            "asset_id": self.asset_id(),
            "category": spec.asset_category,
            "display_name": spec.display_name,
            "description": description,
            "unreal_asset_path": None,
            "spawn_policy": "never_spawn",
            "gameplay_tags": spec.gameplay_tags,
            "capabilities": spec.capabilities,
            "equipment": spec.equipment,
            "preferred_affordances": spec.preferred_affordances,
            "constraints": spec.constraints,
            "behavior_profiles": [],
            "likelihood_modifiers": {},
            "collision_profile": spec.collision_profile,
            "bounds_m": spec.bounds_m,
            "ingestion_status": "prototype",
            "threat_metadata": threat_metadata,
            "threat_category": self.asset_card_threat_category(threat_metadata),
            "movement_domain": self.asset_card_movement_domain(threat_metadata),
            "tactical_role": self.asset_card_tactical_role(),
            "visual_generation_prompt": clamp_text(
                self.require_request().raw.get("visual_generation_prompt") or spec.prompt,
                1200,
            ),
            "runtime_binding_hint": clamp_text(
                self.require_request().raw.get("runtime_binding_hint"),
                300,
                "Static visual mesh prototype; bind to reviewed Unreal actor or existing adversary runtime after import.",
            ),
            "spawn_affordances": unique_tokens(self.require_request().raw.get("spawn_affordances"), fallback=[]),
            "behavior_profile_candidates": unique_tokens(
                self.require_request().raw.get("behavior_profile_candidates"),
                fallback=[],
            ),
            "safety_note": "non-operational training simulation",
        }
        return AssetCard.model_validate(card).model_dump(mode="json")

    def asset_card_threat_category(self, threat_metadata: dict[str, Any] | None) -> str | None:
        raw = self.require_request().raw
        token = sanitize_identifier(
            str(raw.get("threat_category") or (threat_metadata or {}).get("threat_category") or ""),
            fallback="threat",
        )
        if token in THREAT_CATEGORIES:
            return token
        domain = (threat_metadata or {}).get("threat_domain")
        prop_kind = self.require_request().prop_kind
        haystack = f"{token} {domain or ''} {prop_kind}".lower()
        if any(value in haystack for value in ["fpv", "quadcopter"]):
            return "fpv_drone"
        if any(value in haystack for value in ["drone", "uav", "air"]):
            return "uav"
        if any(value in haystack for value in ["ugv", "rover"]):
            return "ugv"
        if any(value in haystack for value in ["ground", "vehicle"]):
            return "vehicle"
        if any(value in haystack for value in ["weapon", "equipment", "sensor"]):
            return "weapon_equipment"
        return None

    def asset_card_movement_domain(self, threat_metadata: dict[str, Any] | None) -> str | None:
        raw = self.require_request().raw
        token = sanitize_identifier(str(raw.get("movement_domain") or ""), fallback="domain")
        if token in MOVEMENT_DOMAINS:
            return token
        domain = (threat_metadata or {}).get("threat_domain")
        if domain == "air":
            return "air"
        if domain == "maritime":
            return "water"
        if domain in {"ground", "equipment"}:
            return "ground"
        return None

    def asset_card_tactical_role(self) -> str | None:
        raw = self.require_request().raw
        token = sanitize_identifier(str(raw.get("tactical_role") or ""), fallback="role")
        if token in TACTICAL_ROLES:
            return token
        return None

    def normalized_threat_metadata(self) -> dict[str, Any] | None:
        request = self.require_request()
        raw = request.raw
        metadata = raw.get("threat_metadata")
        if not isinstance(metadata, dict):
            return None
        domain = sanitize_identifier(str(metadata.get("threat_domain") or metadata.get("domain") or "unknown"), fallback="unknown")
        if domain not in THREAT_DOMAINS:
            domain = "unknown"
        threat_id = sanitize_identifier(
            str(metadata.get("threat_id") or metadata.get("id") or raw.get("source_asset_id") or self.asset_id()),
            fallback="threat",
        )
        source_asset_id = metadata.get("source_asset_id") or raw.get("source_asset_id") or raw.get("source", {}).get("source_asset_id")
        source_asset_id = sanitize_identifier(str(source_asset_id), fallback="source_asset") if source_asset_id else None
        source_database_path = (
            metadata.get("source_database_path")
            or raw.get("source", {}).get("source_database_path")
            or raw.get("source_database_path")
        )
        try:
            demo_priority = int(metadata.get("demo_priority", 0))
        except (TypeError, ValueError):
            demo_priority = 0
        demo_priority = max(0, min(10, demo_priority))
        return {
            "threat_id": threat_id,
            "threat_domain": domain,
            "threat_category": sanitize_identifier(
                str(metadata.get("threat_category") or metadata.get("category") or request.prop_kind),
                fallback="threat",
            ),
            "platform_family": clamp_text(
                metadata.get("platform_family") or metadata.get("platform") or title_from_identifier(request.prop_kind),
                96,
                title_from_identifier(request.prop_kind),
            ),
            "training_role": clamp_text(
                metadata.get("training_role"),
                180,
                "Visual recognition training cue; no operational behavior is encoded in the mesh.",
            ),
            "visual_fidelity_goal": clamp_text(
                metadata.get("visual_fidelity_goal"),
                240,
                "Recognizable silhouette, approximate scale, and non-functional external details for demo review.",
            ),
            "source_asset_id": source_asset_id,
            "source_database_path": clamp_text(source_database_path, 500) if source_database_path else None,
            "source_rationale": clamp_text(metadata.get("source_rationale"), 500) if metadata.get("source_rationale") else None,
            "demo_priority": demo_priority,
            "runtime_note": clamp_text(
                metadata.get("runtime_note"),
                240,
                (
                    "Visual prototype only; runtime behavior, collision, scale, and spawn whitelist "
                    "require Unreal review."
                ),
            ),
        }

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
            f"Generated GLB is published at {glb_uri}."
        )
        result = self.build_result(
            status="succeeded",
            generated_assets=[
                {
                    "artifact_type": "asset_card",
                    "artifact_id": self.asset_id(),
                    "gcs_uri": asset_card_uri,
                    "unreal_asset_path": None,
                },
                {
                    "artifact_type": "generated_glb",
                    "artifact_id": self.asset_id(),
                    "gcs_uri": glb_uri,
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
            "asset_category": spec.asset_category,
            "threat_metadata": self.normalized_threat_metadata(),
            "prompt": spec.prompt,
            "negative_prompt": request.negative_prompt or "",
            "target_format": request.target_format,
            "output_prefix": request.output_prefix or self.run_prefix,
            "trellis": {
                "backend": self.selected_backend_label(),
                "model": self.config.trellis_model,
                "seed": self.config.seed,
                "simplify": self.config.simplify,
                "texture_size": self.config.texture_size,
            },
            "artifacts": artifacts,
            "gcs_paths": {
                "output_prefix": request.output_prefix or self.run_prefix,
                "glb": artifacts.get("glb_uri"),
                "asset_card": artifacts.get("asset_card_uri"),
                "asset_generation_result": artifacts.get("asset_generation_result_uri"),
                "report": artifacts.get("report_uri"),
                "log": artifacts.get("log_uri"),
                "trellis_log": artifacts.get("trellis_log_uri"),
            },
            "files": files,
            "cached_demo_output": self.cached_demo_info or {"used": False},
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

        asset_category = normalize_asset_card_category(
            raw.get("asset_category") or raw.get("category"),
            fallback="equipment" if isinstance(raw.get("threat_metadata"), dict) else "static_prop",
        )

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
        if isinstance(raw.get("threat_metadata"), dict) and "threat_vector" not in gameplay_tags:
            gameplay_tags.append("threat_vector")

        capabilities = unique_tokens(
            raw.get("capabilities", preset["capabilities"] if preset else []),
            fallback=[],
        )
        equipment = unique_tokens(raw.get("equipment"), fallback=[])
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
            asset_category=asset_category,
            prompt=prompt[:1000],
            bounds_m=bounds_m,
            gameplay_tags=gameplay_tags,
            capabilities=capabilities,
            equipment=equipment,
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
        raw_asset_id = request.raw.get("asset_id")
        if isinstance(raw_asset_id, str) and raw_asset_id.strip():
            return sanitize_identifier(raw_asset_id, fallback="prop_trellis_asset")
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


def add_box(
    vertices: list[tuple[float, float, float]],
    indices: list[int],
    *,
    center: tuple[float, float, float],
    size: tuple[float, float, float],
) -> None:
    cx, cy, cz = center
    sx, sy, sz = (component / 2.0 for component in size)
    base = len(vertices)
    vertices.extend(
        [
            (cx - sx, cy - sy, cz - sz),
            (cx + sx, cy - sy, cz - sz),
            (cx + sx, cy + sy, cz - sz),
            (cx - sx, cy + sy, cz - sz),
            (cx - sx, cy - sy, cz + sz),
            (cx + sx, cy - sy, cz + sz),
            (cx + sx, cy + sy, cz + sz),
            (cx - sx, cy + sy, cz + sz),
        ]
    )
    indices.extend(
        base + index
        for index in [
            0,
            1,
            2,
            0,
            2,
            3,
            4,
            6,
            5,
            4,
            7,
            6,
            0,
            4,
            5,
            0,
            5,
            1,
            1,
            5,
            6,
            1,
            6,
            2,
            2,
            6,
            7,
            2,
            7,
            3,
            3,
            7,
            4,
            3,
            4,
            0,
        ]
    )


def demo_mesh(cache_key: str) -> tuple[list[tuple[float, float, float]], list[int], list[float]]:
    vertices: list[tuple[float, float, float]] = []
    indices: list[int] = []
    key = cache_key.lower()
    if key == "fpv_quadcopter":
        add_box(vertices, indices, center=(0, 0, 0.08), size=(0.34, 0.18, 0.08))
        add_box(vertices, indices, center=(0.0, 0.0, 0.07), size=(0.74, 0.035, 0.035))
        add_box(vertices, indices, center=(0.0, 0.0, 0.07), size=(0.035, 0.74, 0.035))
        for x in (-0.36, 0.36):
            for y in (-0.36, 0.36):
                add_box(vertices, indices, center=(x, y, 0.08), size=(0.18, 0.18, 0.018))
        add_box(vertices, indices, center=(0.2, 0.0, 0.14), size=(0.08, 0.12, 0.06))
        return vertices, indices, [0.18, 0.2, 0.23, 1.0]
    if key == "light_ugv":
        add_box(vertices, indices, center=(0, 0, 0.32), size=(0.9, 0.52, 0.28))
        add_box(vertices, indices, center=(0.14, 0, 0.52), size=(0.42, 0.42, 0.16))
        for x in (-0.32, 0.32):
            for y in (-0.32, 0.32):
                add_box(vertices, indices, center=(x, y, 0.18), size=(0.2, 0.12, 0.22))
        add_box(vertices, indices, center=(0.48, 0, 0.36), size=(0.08, 0.24, 0.1))
        return vertices, indices, [0.22, 0.28, 0.22, 1.0]
    if key == "equipment_visual":
        add_box(vertices, indices, center=(0, 0, 0.26), size=(0.75, 0.32, 0.28))
        add_box(vertices, indices, center=(0, 0, 0.43), size=(0.34, 0.08, 0.08))
        add_box(vertices, indices, center=(-0.32, 0, 0.12), size=(0.08, 0.36, 0.08))
        add_box(vertices, indices, center=(0.32, 0, 0.12), size=(0.08, 0.36, 0.08))
        return vertices, indices, [0.25, 0.24, 0.2, 1.0]
    add_box(vertices, indices, center=(0, 0, 0.5), size=(1.0, 0.55, 0.75))
    return vertices, indices, [0.3, 0.32, 0.34, 1.0]


def align_bytes(data: bytes, pad: bytes = b" ") -> bytes:
    padding = (-len(data)) % 4
    return data + pad * padding


def write_demo_glb(path: Path, *, cache_key: str, label: str) -> None:
    vertices, indices, base_color = demo_mesh(cache_key)
    position_bytes = b"".join(struct.pack("<fff", *vertex) for vertex in vertices)
    position_bytes = align_bytes(position_bytes, b"\x00")
    index_offset = len(position_bytes)
    index_bytes = b"".join(struct.pack("<H", index) for index in indices)
    binary_chunk = align_bytes(position_bytes + index_bytes, b"\x00")
    xs = [vertex[0] for vertex in vertices]
    ys = [vertex[1] for vertex in vertices]
    zs = [vertex[2] for vertex in vertices]
    gltf = {
        "asset": {"version": "2.0", "generator": "AdaptSim cached demo threat asset"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"name": label, "mesh": 0}],
        "materials": [
            {
                "name": f"{label}_mat",
                "pbrMetallicRoughness": {
                    "baseColorFactor": base_color,
                    "metallicFactor": 0.12,
                    "roughnessFactor": 0.86,
                },
            }
        ],
        "meshes": [
            {
                "name": label,
                "primitives": [
                    {
                        "attributes": {"POSITION": 0},
                        "indices": 1,
                        "material": 0,
                        "mode": 4,
                    }
                ],
            }
        ],
        "buffers": [{"byteLength": len(binary_chunk)}],
        "bufferViews": [
            {
                "buffer": 0,
                "byteOffset": 0,
                "byteLength": len(position_bytes),
                "target": 34962,
            },
            {
                "buffer": 0,
                "byteOffset": index_offset,
                "byteLength": len(index_bytes),
                "target": 34963,
            },
        ],
        "accessors": [
            {
                "bufferView": 0,
                "componentType": 5126,
                "count": len(vertices),
                "type": "VEC3",
                "min": [min(xs), min(ys), min(zs)],
                "max": [max(xs), max(ys), max(zs)],
            },
            {
                "bufferView": 1,
                "componentType": 5123,
                "count": len(indices),
                "type": "SCALAR",
            },
        ],
    }
    json_chunk = align_bytes(json.dumps(gltf, separators=(",", ":")).encode("utf-8"), b" ")
    total_length = 12 + 8 + len(json_chunk) + 8 + len(binary_chunk)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as stream:
        stream.write(struct.pack("<4sII", b"glTF", 2, total_length))
        stream.write(struct.pack("<I4s", len(json_chunk), b"JSON"))
        stream.write(json_chunk)
        stream.write(struct.pack("<I4s", len(binary_chunk), b"BIN\x00"))
        stream.write(binary_chunk)


TRELLIS_TEXT_ADAPTER = r'''
from __future__ import annotations

import argparse
import inspect
import os

os.environ.setdefault("SPCONV_ALGO", "native")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--negative-prompt", default="")
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
    run_kwargs = {"seed": args.seed}
    signature = inspect.signature(pipeline.run)
    if args.negative_prompt and (
        "negative_prompt" in signature.parameters
        or any(parameter.kind == inspect.Parameter.VAR_KEYWORD for parameter in signature.parameters.values())
    ):
        run_kwargs["negative_prompt"] = args.negative_prompt
    outputs = pipeline.run(args.prompt, **run_kwargs)
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
    parser.add_argument("--asset-request", required=True, help="Local path or gs:// URI to an asset_generation_request or trellis_asset_generation_request JSON file.")
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
    parser.add_argument(
        "--allow-cached-demo-output",
        action="store_true",
        help="Use cached demo GLBs for marked demo requests if Trellis is unavailable or times out.",
    )
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
            allow_cached_demo_output=args.allow_cached_demo_output,
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
