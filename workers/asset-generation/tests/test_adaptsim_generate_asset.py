from __future__ import annotations

import importlib.util
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pytest


MODULE_PATH = Path(__file__).resolve().parents[1] / "adaptsim_generate_asset.py"
SPEC = importlib.util.spec_from_file_location("adaptsim_generate_asset", MODULE_PATH)
assert SPEC and SPEC.loader
asset_worker = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = asset_worker
SPEC.loader.exec_module(asset_worker)


GCS_ROOT = "gs://aiscanners-hackathon2025/adaptsim-captures"


class FakeStorage:
    def __init__(self, remote_root: Path) -> None:
        self.remote_root = remote_root

    def _local(self, uri: str) -> Path:
        prefix = f"{GCS_ROOT}/"
        assert uri.startswith(prefix), uri
        return self.remote_root / uri[len(prefix) :]

    def download_file(self, uri: str, destination: Path, *, required: bool = True) -> bool:
        source = self._local(uri)
        if not source.exists():
            if required:
                raise asset_worker.StorageError(f"missing {uri}")
            return False
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
        return True

    def upload_file(self, source: Path, uri: str, *, required: bool = True) -> bool:
        if not source.exists():
            if required:
                raise asset_worker.StorageError(f"missing local {source}")
            return False
        destination = self._local(uri)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
        return True


def contract_request(request_id: str = "trellis_barricade_001", capture_id: str = "safety_park") -> dict[str, Any]:
    return {
        "contract_type": "asset_generation_request",
        "schema_version": "1.0",
        "request_id": request_id,
        "capture_id": capture_id,
        "requested_at": datetime.now(timezone.utc).isoformat(),
        "requester_id": "asset_worker",
        "source": {
            "reconstruction_manifest_uri": f"{GCS_ROOT}/captures/{capture_id}/unreal-import/reconstruction_manifest.json"
        },
        "outputs_requested": ["asset_card"],
        "notes": None,
    }


def write_request(tmp_path: Path, payload: dict[str, Any]) -> Path:
    path = tmp_path / "request.json"
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def make_config(tmp_path: Path, request_path: Path, **overrides: Any) -> Any:
    values = {
        "asset_request": str(request_path),
        "gcs_root": GCS_ROOT,
        "work_root": tmp_path / "work",
        "no_lock": True,
    }
    values.update(overrides)
    return asset_worker.WorkerConfig(**values)


def run_prefix(remote: Path, capture_id: str, request_id: str) -> Path:
    return remote / "captures" / capture_id / "asset-generation" / request_id


def test_missing_trellis_fails_with_result_and_report(tmp_path: Path) -> None:
    remote = tmp_path / "remote"
    request_path = write_request(tmp_path, contract_request())
    worker = asset_worker.AssetGenerationWorker(
        make_config(tmp_path, request_path, trellis_backend="command"),
        FakeStorage(remote),
    )

    with pytest.raises(asset_worker.WorkerFailure) as raised:
        worker.run()

    assert raised.value.code == "trellis_unavailable"
    base = run_prefix(remote, "safety_park", "trellis_barricade_001")
    result = json.loads((base / "asset_generation_result.json").read_text(encoding="utf-8"))
    report = json.loads((base / "trellis_static_prop_report.json").read_text(encoding="utf-8"))
    assert result["status"] == "failed"
    assert "Fallback prop asset cards" in result["warnings"][0]
    assert report["status"] == "failed"
    assert report["fallback_paths_touched"] == []
    assert not list((base / "static-props").glob("*.glb"))


def test_fake_trellis_command_publishes_glb_asset_card_and_result(tmp_path: Path) -> None:
    remote = tmp_path / "remote"
    request_path = write_request(tmp_path, contract_request())
    fake_trellis = tmp_path / "fake_trellis.py"
    fake_trellis.write_text(
        """#!/usr/bin/env python3
from pathlib import Path
import argparse
parser = argparse.ArgumentParser()
parser.add_argument("--output-glb", required=True)
args, _ = parser.parse_known_args()
out = Path(args.output_glb)
out.parent.mkdir(parents=True, exist_ok=True)
out.write_bytes(b"glTF\\x02\\x00\\x00\\x00\\x0c\\x00\\x00\\x00")
""",
        encoding="utf-8",
    )
    fake_trellis.chmod(0o755)
    worker = asset_worker.AssetGenerationWorker(
        make_config(
            tmp_path,
            request_path,
            trellis_backend="command",
            trellis_command=f"{sys.executable} {fake_trellis} --output-glb {{output_glb}}",
        ),
        FakeStorage(remote),
    )

    assert worker.run() == 0

    base = run_prefix(remote, "safety_park", "trellis_barricade_001")
    glbs = list((base / "static-props").glob("*.glb"))
    cards = list((base / "static-props").glob("*.asset_card.json"))
    assert len(glbs) == 1
    assert len(cards) == 1
    card = json.loads(cards[0].read_text(encoding="utf-8"))
    result = json.loads((base / "asset_generation_result.json").read_text(encoding="utf-8"))
    report = json.loads((base / "trellis_static_prop_report.json").read_text(encoding="utf-8"))
    assert card["category"] == "static_prop"
    assert card["ingestion_status"] == "prototype"
    assert card["spawn_policy"] == "never_spawn"
    assert "bottom-center" in card["description"]
    assert result["status"] == "succeeded"
    assert result["generated_assets"][0]["artifact_type"] == "asset_card"
    assert any("Generated GLB is published" in warning for warning in result["warnings"])
    assert report["scale_pivot_collision_notes"]["collision"].startswith("Use simple")


def test_simple_local_request_can_override_prompt_and_prop_kind(tmp_path: Path) -> None:
    remote = tmp_path / "remote"
    request_path = write_request(
        tmp_path,
        {
            "request_id": "simple_cover_001",
            "capture_id": "safety_park",
            "prop_kind": "cover",
            "prompt": "A compact blue portable cover panel, isolated",
        },
    )
    fake_trellis = tmp_path / "fake_trellis.py"
    fake_trellis.write_text(
        """#!/usr/bin/env python3
from pathlib import Path
import argparse
parser = argparse.ArgumentParser()
parser.add_argument("--prompt", required=True)
parser.add_argument("--output-glb", required=True)
args = parser.parse_args()
assert "blue portable cover" in args.prompt
Path(args.output_glb).write_bytes(b"glTF\\x02\\x00\\x00\\x00\\x0c\\x00\\x00\\x00")
""",
        encoding="utf-8",
    )
    fake_trellis.chmod(0o755)
    worker = asset_worker.AssetGenerationWorker(
        make_config(
            tmp_path,
            request_path,
            trellis_backend="command",
            trellis_command=f"{sys.executable} {fake_trellis} --prompt {{prompt}} --output-glb {{output_glb}}",
        ),
        FakeStorage(remote),
    )

    assert worker.run() == 0
    base = run_prefix(remote, "safety_park", "simple_cover_001")
    report = json.loads((base / "trellis_static_prop_report.json").read_text(encoding="utf-8"))
    assert report["prop_kind"] == "cover"
    assert report["request_contract_validated"] is False
    assert "blue portable cover" in report["prompt"]


def test_custom_prompt_driven_prop_is_not_limited_to_presets(tmp_path: Path) -> None:
    remote = tmp_path / "remote"
    request_path = write_request(
        tmp_path,
        {
            "request_id": "simple_generator_001",
            "capture_id": "safety_park",
            "prop_kind": "portable_generator",
            "asset_label": "portable_generator",
            "display_name": "Generated Portable Generator",
            "prompt": "A rugged portable generator prop with handles, isolated",
            "bounds_m": {"x": 0.9, "y": 0.55, "z": 0.65},
            "gameplay_tags": ["prop", "equipment", "static_prop"],
            "capabilities": ["occupy_space"],
            "preferred_affordances": ["room"],
        },
    )
    fake_trellis = tmp_path / "fake_trellis.py"
    fake_trellis.write_text(
        """#!/usr/bin/env python3
from pathlib import Path
import argparse
parser = argparse.ArgumentParser()
parser.add_argument("--prompt", required=True)
parser.add_argument("--output-glb", required=True)
args = parser.parse_args()
assert "portable generator" in args.prompt
Path(args.output_glb).write_bytes(b"glTF\\x02\\x00\\x00\\x00\\x0c\\x00\\x00\\x00")
""",
        encoding="utf-8",
    )
    fake_trellis.chmod(0o755)
    worker = asset_worker.AssetGenerationWorker(
        make_config(
            tmp_path,
            request_path,
            trellis_backend="command",
            trellis_command=f"{sys.executable} {fake_trellis} --prompt {{prompt}} --output-glb {{output_glb}}",
        ),
        FakeStorage(remote),
    )

    assert worker.run() == 0
    base = run_prefix(remote, "safety_park", "simple_generator_001")
    card_path = next((base / "static-props").glob("*.asset_card.json"))
    card = json.loads(card_path.read_text(encoding="utf-8"))
    report = json.loads((base / "trellis_static_prop_report.json").read_text(encoding="utf-8"))
    assert card["asset_id"].startswith("prop_trellis_portable_generator_")
    assert card["display_name"] == "Generated Portable Generator"
    assert card["bounds_m"] == {"x": 0.9, "y": 0.55, "z": 0.65}
    assert "equipment" in card["gameplay_tags"]
    assert report["prop_kind"] == "portable_generator"
