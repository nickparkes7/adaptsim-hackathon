from __future__ import annotations

import importlib.util
import json
import struct
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


MODULE_PATH = Path(__file__).resolve().parents[1] / "adaptsim_convert_mesh.py"
WRAPPER_PATH = Path(__file__).resolve().parents[1] / "adaptsim-convert-mesh"
SPEC = importlib.util.spec_from_file_location("adaptsim_convert_mesh", MODULE_PATH)
assert SPEC and SPEC.loader
converter = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = converter
SPEC.loader.exec_module(converter)


GCS_ROOT = "gs://aiscanners-hackathon2025/adaptsim-captures"


def metadata(capture_id: str, *, scale_type: str = "unknown") -> dict[str, Any]:
    return {
        "contract_type": "capture_metadata",
        "schema_version": "1.0",
        "capture_id": capture_id,
        "display_name": f"{capture_id} capture",
        "operator_id": "test_operator",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "environment_type": "test_area",
        "expected_image_count": 4,
        "uploaded_image_count": 4,
        "scale_hint": {
            "type": scale_type,
            "label": "test marker" if scale_type != "unknown" else None,
            "distance_m": 1.0 if scale_type != "unknown" else None,
            "confidence": "operator_provided" if scale_type != "unknown" else "unknown",
        },
        "notes": None,
        "gcs_prefix": f"{GCS_ROOT}/captures/{capture_id}/",
    }


def sfm_report(capture_id: str) -> dict[str, Any]:
    return {
        "capture_id": capture_id,
        "image_count": 4,
        "registered_image_count": 3,
        "sparse_point_count": 12,
    }


def write_inputs(tmp_path: Path, capture_id: str, source_mesh: Path) -> tuple[Path, Path, Path, Path]:
    metadata_path = tmp_path / "raw" / "metadata.json"
    sfm_path = tmp_path / "sfm" / "colmap" / "report.json"
    output_glb = tmp_path / "unreal-import" / "scene_mesh.glb"
    manifest_path = tmp_path / "unreal-import" / "reconstruction_manifest.json"
    metadata_path.parent.mkdir(parents=True)
    sfm_path.parent.mkdir(parents=True)
    metadata_path.write_text(json.dumps(metadata(capture_id)), encoding="utf-8")
    sfm_path.write_text(json.dumps(sfm_report(capture_id)), encoding="utf-8")
    source_mesh.parent.mkdir(parents=True, exist_ok=True)
    return metadata_path, sfm_path, output_glb, manifest_path


def assert_valid_glb(path: Path) -> None:
    data = path.read_bytes()
    assert data[:4] == b"glTF"
    version, declared_length = struct.unpack("<II", data[4:12])
    assert version == 2
    assert declared_length == len(data)
    assert len(data) > 32


def test_wrapper_converts_ascii_ply_and_writes_handoff_artifacts(tmp_path: Path) -> None:
    capture_id = "mesh_case"
    source_mesh = tmp_path / "reconstruction" / "mesh_dlnr.ply"
    source_mesh.parent.mkdir(parents=True)
    source_mesh.write_text(
        "\n".join(
            [
                "ply",
                "format ascii 1.0",
                "element vertex 4",
                "property float x",
                "property float y",
                "property float z",
                "property uchar red",
                "property uchar green",
                "property uchar blue",
                "element face 1",
                "property list uchar int vertex_indices",
                "end_header",
                "0 0 0 255 0 0",
                "1 0 0 0 255 0",
                "1 1 0 0 0 255",
                "0 1 1 255 255 255",
                "4 0 1 2 3",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    metadata_path, sfm_path, output_glb, manifest_path = write_inputs(tmp_path, capture_id, source_mesh)

    proc = subprocess.run(
        [
            str(WRAPPER_PATH),
            "--capture-id",
            capture_id,
            "--source-mesh",
            str(source_mesh),
            "--output-glb",
            str(output_glb),
            "--manifest-output",
            str(manifest_path),
            "--gcs-prefix",
            f"{GCS_ROOT}/captures/{capture_id}/",
            "--metadata",
            str(metadata_path),
            "--sfm-report",
            str(sfm_path),
            "--max-decimated-faces",
            "1",
            "--max-collision-faces",
            "1",
        ],
        text=True,
        capture_output=True,
        check=False,
    )

    assert proc.returncode == 0, proc.stderr
    assert_valid_glb(output_glb)
    assert_valid_glb(output_glb.with_name("scene_mesh_decimated.glb"))
    assert (output_glb.parent / "collision_proxy.obj").stat().st_size > 0
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert manifest["contract_type"] == "reconstruction_manifest"
    assert manifest["capture_id"] == capture_id
    assert manifest["source_mesh"]["vertices"] == 4
    assert manifest["source_mesh"]["faces"] == 2
    assert manifest["collision_proxy"]["faces"] == 1
    artifact_types = {artifact["artifact_type"] for artifact in manifest["artifacts"]}
    assert {
        "raw_metadata",
        "sfm_report",
        "mesh_dlnr_ply",
        "unreal_mesh_glb",
        "unreal_mesh_decimated_glb",
        "collision_proxy_obj",
        "reconstruction_manifest",
    }.issubset(artifact_types)
    assert any("Transform assumption" in warning for warning in manifest["warnings"])


def test_binary_little_endian_ply_is_supported(tmp_path: Path) -> None:
    capture_id = "binary_mesh"
    source_mesh = tmp_path / "reconstruction" / "mesh_dlnr.ply"
    header = (
        "ply\n"
        "format binary_little_endian 1.0\n"
        "element vertex 3\n"
        "property float x\n"
        "property float y\n"
        "property float z\n"
        "element face 1\n"
        "property list uchar int vertex_indices\n"
        "end_header\n"
    ).encode("ascii")
    body = b"".join(
        [
            struct.pack("<fff", 0.0, 0.0, 0.0),
            struct.pack("<fff", 1.0, 0.0, 0.0),
            struct.pack("<fff", 0.0, 2.0, 1.0),
            struct.pack("<Biii", 3, 0, 1, 2),
        ]
    )
    source_mesh.parent.mkdir(parents=True)
    source_mesh.write_bytes(header + body)
    metadata_path, sfm_path, output_glb, manifest_path = write_inputs(tmp_path, capture_id, source_mesh)

    rc = converter.main(
        [
            "--capture-id",
            capture_id,
            "--source-mesh",
            str(source_mesh),
            "--output-glb",
            str(output_glb),
            "--manifest-output",
            str(manifest_path),
            "--gcs-prefix",
            f"{GCS_ROOT}/captures/{capture_id}/",
            "--metadata",
            str(metadata_path),
            "--sfm-report",
            str(sfm_path),
        ]
    )

    assert rc == 0
    assert_valid_glb(output_glb)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert manifest["source_mesh"]["vertices"] == 3
    assert manifest["source_mesh"]["faces"] == 1
    assert manifest["source_mesh"]["bounds_m"]["size_m"] == {"x": 1.0, "y": 2.0, "z": 1.0}


def test_missing_source_fails_with_named_error(tmp_path: Path, capsys: Any) -> None:
    capture_id = "bad_mesh"
    source_mesh = tmp_path / "reconstruction" / "missing.ply"
    metadata_path, sfm_path, output_glb, manifest_path = write_inputs(tmp_path, capture_id, source_mesh)
    source_mesh.unlink(missing_ok=True)

    rc = converter.main(
        [
            "--capture-id",
            capture_id,
            "--source-mesh",
            str(source_mesh),
            "--output-glb",
            str(output_glb),
            "--manifest-output",
            str(manifest_path),
            "--gcs-prefix",
            f"{GCS_ROOT}/captures/{capture_id}/",
            "--metadata",
            str(metadata_path),
            "--sfm-report",
            str(sfm_path),
        ]
    )

    captured = capsys.readouterr()
    assert rc == 2
    assert "source_mesh_missing" in captured.err
    assert not output_glb.exists()
    assert not manifest_path.exists()
