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


@pytest.fixture
def server_trellis_request() -> dict[str, Any]:
    return {
        "contract_type": "trellis_asset_generation_request",
        "schema_version": "1.0",
        "request_id": "trellis_asset_server_session",
        "capture_id": "asset_server_session",
        "session_id": "asset_server_session",
        "requested_at": datetime.now(timezone.utc).isoformat(),
        "requester_id": "local_control_api",
        "input_fingerprint": "abc123",
        "source_database_path": "/tmp/adaptsim/generated-sessions/asset_server_session/asset_database.json",
        "gcs_root": GCS_ROOT,
        "model": "microsoft/TRELLIS-text-large",
        "batch_output_prefix": f"{GCS_ROOT}/captures/asset_server_session/asset-generation/trellis_asset_server_session/",
        "assets": [
            {
                "asset_id": "portable_generator_candidate",
                "request_id": "trellis_asset_server_session_1_portable_generator_candidate",
                "display_name": "Generated Portable Generator",
                "source_asset_id": "portable_generator",
                "prop_kind": "portable_generator",
                "asset_label": "portable_generator_candidate",
                "prompt": "A rugged portable generator prop with handles, rubber feet, metal frame, isolated",
                "negative_prompt": "people, readable real-world logos",
                "target_format": "glb",
                "texture_size": 1024,
                "output_prefix": f"{GCS_ROOT}/captures/asset_server_session/asset-generation/trellis_asset_server_session/assets/portable_generator_candidate/",
                "bounds_m": {"x": 0.9, "y": 0.55, "z": 0.65},
                "scale_descriptor": "Approximately 0.9 m wide, 0.55 m deep, and 0.65 m tall.",
                "gameplay_tags": ["prop", "equipment", "static_prop"],
                "capabilities": ["occupy_space"],
                "preferred_affordances": ["room"],
                "constraints": ["requires_collision", "requires_scale_review", "requires_pivot_review"],
                "collision_profile": "block_all",
                "safety_notes": ["Prototype only until Unreal import review."],
            },
            {
                "asset_id": "folding_warning_sign_candidate",
                "request_id": "trellis_asset_server_session_2_folding_warning_sign_candidate",
                "display_name": "Generated Folding Warning Sign",
                "source_asset_id": "folding_warning_sign",
                "prop_kind": "folding_warning_sign",
                "asset_label": "folding_warning_sign_candidate",
                "prompt": "A yellow folding caution sign prop with scuffed plastic panels and hinge detail, isolated",
                "negative_prompt": "people, readable text",
                "target_format": "glb",
                "texture_size": 1024,
                "output_prefix": f"{GCS_ROOT}/captures/asset_server_session/asset-generation/trellis_asset_server_session/assets/folding_warning_sign_candidate/",
                "bounds_m": {"x": 0.45, "y": 0.35, "z": 0.8},
                "gameplay_tags": ["prop", "training_marker", "static_prop"],
                "capabilities": ["mark_area"],
                "preferred_affordances": ["hallway"],
                "constraints": ["requires_collision", "requires_scale_review", "requires_pivot_review"],
                "collision_profile": "block_all",
                "safety_notes": [],
            },
        ],
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


def fake_trellis_script(tmp_path: Path, *, prompt_assertion: str | None = None) -> Path:
    fake_trellis = tmp_path / "fake_trellis.py"
    assertion = f'assert "{prompt_assertion}" in args.prompt\n' if prompt_assertion else ""
    fake_trellis.write_text(
        f"""#!/usr/bin/env python3
from pathlib import Path
import argparse
parser = argparse.ArgumentParser()
parser.add_argument("--prompt", required=False, default="")
parser.add_argument("--negative-prompt", default="")
parser.add_argument("--output-glb", required=True)
args, _ = parser.parse_known_args()
{assertion}out = Path(args.output_glb)
out.parent.mkdir(parents=True, exist_ok=True)
out.write_bytes(b"glTF\\x02\\x00\\x00\\x00\\x0c\\x00\\x00\\x00")
""",
        encoding="utf-8",
    )
    fake_trellis.chmod(0o755)
    return fake_trellis


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


def test_server_trellis_request_generates_multiple_assets(
    tmp_path: Path,
    server_trellis_request: dict[str, Any],
) -> None:
    remote = tmp_path / "remote"
    request_path = write_request(tmp_path, server_trellis_request)
    fake_trellis = fake_trellis_script(tmp_path)
    worker = asset_worker.AssetGenerationWorker(
        make_config(
            tmp_path,
            request_path,
            trellis_backend="command",
            trellis_command=f"{sys.executable} {fake_trellis} --prompt {{prompt}} --negative-prompt {{negative_prompt}} --output-glb {{output_glb}}",
        ),
        FakeStorage(remote),
    )

    assert worker.run() == 0

    base = run_prefix(remote, "asset_server_session", "trellis_asset_server_session")
    glbs = list((base / "assets").glob("*/static-props/*.glb"))
    cards = list((base / "assets").glob("*/static-props/*.asset_card.json"))
    assert len(glbs) == 2
    assert len(cards) == 2
    batch_result = json.loads((base / "asset_generation_result.json").read_text(encoding="utf-8"))
    batch_report = json.loads((base / "trellis_asset_generation_batch_report.json").read_text(encoding="utf-8"))
    assert batch_result["status"] == "succeeded"
    assert len([asset for asset in batch_result["generated_assets"] if asset["artifact_type"] == "asset_card"]) == 2
    assert len([asset for asset in batch_result["generated_assets"] if asset["artifact_type"] == "generated_glb"]) == 2
    assert batch_report["status"] == "succeeded"
    assert len(batch_report["assets"]) == 2
    assert len(batch_report["gcs_paths"]["glbs"]) == 2
    assert (base / "trellis_request.json").exists()
    for card_path in cards:
        card = json.loads(card_path.read_text(encoding="utf-8"))
        assert card["ingestion_status"] == "prototype"
        assert card["spawn_policy"] == "never_spawn"


def test_server_trellis_request_supports_custom_non_preset_prop_kind(
    tmp_path: Path,
    server_trellis_request: dict[str, Any],
) -> None:
    remote = tmp_path / "remote"
    server_trellis_request["assets"] = [server_trellis_request["assets"][0]]
    request_path = write_request(tmp_path, server_trellis_request)
    fake_trellis = fake_trellis_script(tmp_path, prompt_assertion="portable generator")
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

    base = run_prefix(remote, "asset_server_session", "trellis_asset_server_session")
    card_path = next((base / "assets").glob("*/static-props/*.asset_card.json"))
    report_path = next((base / "assets").glob("*/trellis_static_prop_report.json"))
    card = json.loads(card_path.read_text(encoding="utf-8"))
    report = json.loads(report_path.read_text(encoding="utf-8"))
    assert card["asset_id"] == "portable_generator_candidate"
    assert card["display_name"] == "Generated Portable Generator"
    assert card["bounds_m"] == {"x": 0.9, "y": 0.55, "z": 0.65}
    assert "equipment" in card["gameplay_tags"]
    assert report["prop_kind"] == "portable_generator"
    assert report["negative_prompt"] == "people, readable real-world logos"
    assert report["target_format"] == "glb"


def test_threat_vector_batch_uses_cached_demo_glbs_when_trellis_is_unavailable(tmp_path: Path) -> None:
    remote = tmp_path / "remote"
    request = {
        "contract_type": "trellis_asset_generation_request",
        "schema_version": "1.0",
        "request_id": "trellis_threat_demo",
        "capture_id": "threat_demo",
        "session_id": "threat_demo",
        "requested_at": datetime.now(timezone.utc).isoformat(),
        "requester_id": "local_control_api",
        "input_fingerprint": "threat-demo",
        "source_database_path": "/tmp/adaptsim/generated-sessions/threat_demo/asset_database.json",
        "gcs_root": GCS_ROOT,
        "model": "microsoft/TRELLIS.2-4B",
        "assets": [
            {
                "asset_id": "fpv_quadcopter_visual",
                "request_id": "trellis_threat_demo_1_fpv_quadcopter_visual",
                "display_name": "FPV Quadcopter Visual",
                "source_asset_id": "fpv_quadcopter_asset",
                "asset_category": "threat_vector",
                "prop_kind": "fpv_drone",
                "asset_label": "fpv_quadcopter_visual",
                "prompt": "A compact FPV quadcopter training visual with four ductless propeller guards and a rectangular battery pack, inert exterior only.",
                "visual_generation_prompt": "A compact FPV quadcopter training visual, static and inert.",
                "negative_prompt": "people, insignia, weapon mechanics",
                "target_format": "glb",
                "texture_size": 1024,
                "bounds_m": {"x": 0.75, "y": 0.75, "z": 0.18},
                "gameplay_tags": ["threat_vector", "air", "fpv_drone"],
                "capabilities": ["visual_recognition"],
                "preferred_affordances": ["open_floor"],
                "constraints": ["requires_collision", "requires_scale_review", "requires_pivot_review"],
                "collision_profile": "block_all",
                "threat_category": "fpv_drone",
                "movement_domain": "air",
                "tactical_role": "recon",
                "runtime_binding_hint": "Static mesh visual reviewed before any Unreal runtime binding.",
                "spawn_affordances": ["open_floor"],
                "behavior_profile_candidates": [],
                "safety_note": "non-operational training simulation",
                "equipment": ["battery_pack", "camera_shell"],
                "threat_metadata": {
                    "threat_id": "fpv_quadcopter_visual",
                    "threat_domain": "air",
                    "threat_category": "fpv_drone",
                    "platform_family": "Small FPV quadcopter",
                    "training_role": "Air threat visual recognition cue.",
                    "visual_fidelity_goal": "Recognizable quadcopter silhouette and battery/camera block.",
                    "source_asset_id": "fpv_quadcopter_asset",
                    "source_database_path": "/tmp/adaptsim/generated-sessions/threat_demo/asset_database.json",
                    "source_rationale": "Generic demo fallback air threat.",
                    "demo_priority": 10,
                    "runtime_note": "Visual prototype only; use reviewed Unreal runtime before spawning.",
                },
                "allow_cached_demo_output": True,
                "cached_demo_key": "fpv_quadcopter",
                "safety_notes": ["Prototype visual only."],
            },
            {
                "asset_id": "light_ugv_visual",
                "request_id": "trellis_threat_demo_2_light_ugv_visual",
                "display_name": "Light UGV Visual",
                "source_asset_id": "light_ugv_asset",
                "asset_category": "threat_vector",
                "prop_kind": "ugv",
                "asset_label": "light_ugv_visual",
                "prompt": "A small light UGV training visual with low rectangular chassis, four rugged wheels, and a simple sensor mast, inert exterior only.",
                "visual_generation_prompt": "A light UGV training visual, static and inert.",
                "negative_prompt": "people, insignia, weapon mechanics",
                "target_format": "glb",
                "texture_size": 1024,
                "bounds_m": {"x": 0.9, "y": 0.55, "z": 0.55},
                "gameplay_tags": ["threat_vector", "ground", "ugv"],
                "capabilities": ["visual_recognition"],
                "preferred_affordances": ["vehicle_route"],
                "constraints": ["requires_collision", "requires_scale_review", "requires_pivot_review"],
                "collision_profile": "block_all",
                "threat_category": "ugv",
                "movement_domain": "ground",
                "tactical_role": "patrol",
                "runtime_binding_hint": "Static mesh visual reviewed before any Unreal runtime binding.",
                "spawn_affordances": ["vehicle_route"],
                "behavior_profile_candidates": [],
                "safety_note": "non-operational training simulation",
                "equipment": ["sensor_payload"],
                "threat_metadata": {
                    "threat_id": "light_ugv_visual",
                    "threat_domain": "ground",
                    "threat_category": "ugv",
                    "platform_family": "Light ground UGV",
                    "training_role": "Ground vehicle/equipment visual recognition cue.",
                    "visual_fidelity_goal": "Recognizable small wheeled UGV silhouette and sensor block.",
                    "source_asset_id": "light_ugv_asset",
                    "source_database_path": "/tmp/adaptsim/generated-sessions/threat_demo/asset_database.json",
                    "source_rationale": "Generic demo fallback ground threat.",
                    "demo_priority": 10,
                    "runtime_note": "Visual prototype only; use reviewed Unreal runtime before spawning.",
                },
                "allow_cached_demo_output": True,
                "cached_demo_key": "light_ugv",
                "safety_notes": ["Prototype visual only."],
            },
        ],
    }
    request_path = write_request(tmp_path, request)
    worker = asset_worker.AssetGenerationWorker(
        make_config(tmp_path, request_path, trellis_backend="command"),
        FakeStorage(remote),
    )

    assert worker.run() == 0

    base = run_prefix(remote, "threat_demo", "trellis_threat_demo")
    glbs = sorted((base / "assets").glob("*/static-props/*.glb"))
    cards = sorted((base / "assets").glob("*/static-props/*.asset_card.json"))
    batch_report = json.loads((base / "trellis_asset_generation_batch_report.json").read_text(encoding="utf-8"))
    assert len(glbs) == 2
    assert len(cards) == 2
    assert {path.read_bytes()[:4] for path in glbs} == {b"glTF"}
    assert len(batch_report["gcs_paths"]["glbs"]) == 2
    domains = set()
    for card_path in cards:
        card = json.loads(card_path.read_text(encoding="utf-8"))
        assert card["category"] == "threat_vector"
        assert card["spawn_policy"] == "never_spawn"
        assert card["threat_metadata"]["runtime_note"].startswith("Visual prototype")
        domains.add(card["threat_metadata"]["threat_domain"])
    assert {"air", "ground"} <= domains
    assert all(asset["report"]["cached_demo_output"]["used"] for asset in batch_report["assets"])


def test_server_trellis_request_missing_backend_fails_clearly(
    tmp_path: Path,
    server_trellis_request: dict[str, Any],
) -> None:
    remote = tmp_path / "remote"
    server_trellis_request["assets"] = [server_trellis_request["assets"][0]]
    request_path = write_request(tmp_path, server_trellis_request)
    worker = asset_worker.AssetGenerationWorker(
        make_config(tmp_path, request_path, trellis_backend="command"),
        FakeStorage(remote),
    )

    with pytest.raises(asset_worker.WorkerFailure) as raised:
        worker.run()

    assert raised.value.code == "trellis_batch_failed"
    base = run_prefix(remote, "asset_server_session", "trellis_asset_server_session")
    batch_result = json.loads((base / "asset_generation_result.json").read_text(encoding="utf-8"))
    batch_report = json.loads((base / "trellis_asset_generation_batch_report.json").read_text(encoding="utf-8"))
    per_asset_result_path = next((base / "assets").glob("*/asset_generation_result.json"))
    per_asset_result = json.loads(per_asset_result_path.read_text(encoding="utf-8"))
    assert batch_result["status"] == "failed"
    assert "trellis_unavailable" in batch_result["errors"][0]
    assert batch_report["assets"][0]["error"]["code"] == "trellis_unavailable"
    assert per_asset_result["status"] == "failed"
    assert "trellis_unavailable" in per_asset_result["errors"][0]
    assert not list((base / "assets").glob("*/static-props/*.glb"))


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
