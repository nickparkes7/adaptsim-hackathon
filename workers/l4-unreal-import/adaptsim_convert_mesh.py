#!/usr/bin/env python3
"""Convert AdaptSim reconstruction meshes into Unreal-importable GLB assets."""

from __future__ import annotations

import argparse
import dataclasses
import hashlib
import json
import math
import os
import re
import socket
import struct
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, BinaryIO, Iterable


REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

try:
    from contracts.models import ReconstructionManifest
except Exception:  # pragma: no cover - allows using the converter without repo deps.
    ReconstructionManifest = None  # type: ignore[assignment]


VERSION = "1.0.0"
CAPTURE_ID_RE = re.compile(r"^[a-z][a-z0-9_]{2,63}$")
DEFAULT_DECIMATED_FACE_BUDGET = 100_000
DEFAULT_COLLISION_FACE_BUDGET = 12_000
DEFAULT_DLNR_MARGIN_M = 0.10

CONTENT_TYPES = {
    ".json": "application/json",
    ".ply": "application/octet-stream",
    ".obj": "text/plain",
    ".glb": "model/gltf-binary",
}

PLY_SCALAR_TYPES: dict[str, tuple[str, int]] = {
    "char": ("b", 1),
    "int8": ("b", 1),
    "uchar": ("B", 1),
    "uint8": ("B", 1),
    "short": ("h", 2),
    "int16": ("h", 2),
    "ushort": ("H", 2),
    "uint16": ("H", 2),
    "int": ("i", 4),
    "int32": ("i", 4),
    "uint": ("I", 4),
    "uint32": ("I", 4),
    "float": ("f", 4),
    "float32": ("f", 4),
    "double": ("d", 8),
    "float64": ("d", 8),
}


class MeshConversionError(RuntimeError):
    def __init__(self, code: str, message: str, *, exit_code: int = 2) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.exit_code = exit_code


@dataclasses.dataclass(slots=True)
class MeshData:
    vertices: list[tuple[float, float, float]]
    faces: list[tuple[int, int, int]]
    colors: list[tuple[float, float, float, float]] | None
    source_format: str
    warnings: list[str] = dataclasses.field(default_factory=list)


@dataclasses.dataclass(slots=True)
class MeshStats:
    vertices: int
    faces: int
    center_m: tuple[float, float, float]
    size_m: tuple[float, float, float]


@dataclasses.dataclass(slots=True)
class PlyProperty:
    name: str
    data_type: str
    count_type: str | None = None
    item_type: str | None = None

    @property
    def is_list(self) -> bool:
        return self.count_type is not None


@dataclasses.dataclass(slots=True)
class PlyElement:
    name: str
    count: int
    properties: list[PlyProperty]


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Convert AdaptSim PLY/OBJ meshes to Unreal-ready GLB artifacts.")
    parser.add_argument("--version", action="version", version=f"adaptsim-convert-mesh {VERSION}")
    parser.add_argument("--capture-id", required=True)
    parser.add_argument("--source-mesh", type=Path, required=True)
    parser.add_argument("--output-glb", type=Path, required=True)
    parser.add_argument("--manifest-output", type=Path, required=True)
    parser.add_argument("--gcs-prefix", required=True)
    parser.add_argument("--metadata", type=Path, required=True)
    parser.add_argument("--sfm-report", type=Path, required=True)
    parser.add_argument("--decimated-output", type=Path, default=None)
    parser.add_argument("--collision-output", type=Path, default=None)
    parser.add_argument("--max-decimated-faces", type=int, default=DEFAULT_DECIMATED_FACE_BUDGET)
    parser.add_argument("--max-collision-faces", type=int, default=DEFAULT_COLLISION_FACE_BUDGET)
    parser.add_argument("--dlnr-truncation-margin-m", type=float, default=DEFAULT_DLNR_MARGIN_M)
    return parser.parse_args(argv)


def run_conversion(args: argparse.Namespace) -> dict[str, Any]:
    capture_id = args.capture_id
    if not CAPTURE_ID_RE.match(capture_id):
        raise MeshConversionError(
            "invalid_capture_id",
            "--capture-id must match ^[a-z][a-z0-9_]{2,63}$",
        )

    source_mesh = args.source_mesh.expanduser()
    output_glb = args.output_glb.expanduser()
    manifest_output = args.manifest_output.expanduser()
    metadata_path = args.metadata.expanduser()
    sfm_report_path = args.sfm_report.expanduser()
    decimated_output = (
        args.decimated_output.expanduser()
        if args.decimated_output
        else output_glb.with_name(default_decimated_name(output_glb))
    )
    collision_output = (
        args.collision_output.expanduser() if args.collision_output else output_glb.parent / "collision_proxy.obj"
    )

    require_existing_file(source_mesh, "source_mesh_missing")
    require_existing_file(metadata_path, "metadata_missing")
    require_existing_file(sfm_report_path, "sfm_report_missing")
    if output_glb.suffix.lower() != ".glb":
        raise MeshConversionError("invalid_output_glb", f"--output-glb must end in .glb: {output_glb}")
    if decimated_output.suffix.lower() != ".glb":
        raise MeshConversionError("invalid_decimated_output", f"--decimated-output must end in .glb: {decimated_output}")
    if collision_output.suffix.lower() != ".obj":
        raise MeshConversionError("invalid_collision_output", f"--collision-output must end in .obj: {collision_output}")
    if args.max_decimated_faces <= 0:
        raise MeshConversionError("invalid_decimated_budget", "--max-decimated-faces must be positive")
    if args.max_collision_faces <= 0:
        raise MeshConversionError("invalid_collision_budget", "--max-collision-faces must be positive")
    if args.dlnr_truncation_margin_m <= 0:
        raise MeshConversionError("invalid_dlnr_margin", "--dlnr-truncation-margin-m must be positive")

    gcs_prefix = normalize_gcs_prefix(args.gcs_prefix)
    if not gcs_prefix.rstrip("/").endswith(f"/captures/{capture_id}"):
        raise MeshConversionError(
            "gcs_prefix_mismatch",
            f"--gcs-prefix must point at captures/{capture_id}/: {gcs_prefix}",
        )

    metadata = load_json(metadata_path, "invalid_metadata")
    sfm_report = load_json(sfm_report_path, "invalid_sfm_report")
    mesh = load_mesh(source_mesh)
    validate_and_clean_mesh(mesh, source_mesh)

    output_glb.parent.mkdir(parents=True, exist_ok=True)
    write_glb(mesh, output_glb, name=f"{capture_id}_scene_mesh")
    require_nonempty_file(output_glb, "output_glb_empty")

    decimated_mesh = sample_mesh_by_faces(mesh, args.max_decimated_faces)
    if len(decimated_mesh.faces) < len(mesh.faces):
        decimated_mesh.warnings.append(
            f"scene_mesh_decimated.glb uses deterministic face sampling to cap render faces at {args.max_decimated_faces}."
        )
    else:
        decimated_mesh.warnings.append("scene_mesh_decimated.glb matches scene_mesh.glb because the mesh is within budget.")
    write_glb(decimated_mesh, decimated_output, name=f"{capture_id}_scene_mesh_decimated")
    require_nonempty_file(decimated_output, "decimated_glb_empty")

    collision_mesh = sample_mesh_by_faces(mesh, args.max_collision_faces)
    if len(collision_mesh.faces) < len(mesh.faces):
        collision_mesh.warnings.append(
            f"collision_proxy.obj uses deterministic face sampling to cap collision faces at {args.max_collision_faces}."
        )
    write_obj(collision_mesh, collision_output, name=f"{capture_id}_collision_proxy")
    require_nonempty_file(collision_output, "collision_proxy_empty")

    warnings = collect_warnings(mesh, decimated_mesh, collision_mesh, metadata)
    manifest = build_manifest(
        capture_id=capture_id,
        gcs_prefix=gcs_prefix,
        metadata=metadata,
        sfm_report=sfm_report,
        source_mesh=source_mesh,
        output_glb=output_glb,
        decimated_output=decimated_output,
        collision_output=collision_output,
        manifest_output=manifest_output,
        source_stats=mesh_stats(mesh),
        render_stats=mesh_stats(mesh),
        collision_stats=mesh_stats(collision_mesh),
        metadata_path=metadata_path,
        sfm_report_path=sfm_report_path,
        dlnr_truncation_margin_m=float(args.dlnr_truncation_margin_m),
        warnings=warnings,
    )
    manifest_output.parent.mkdir(parents=True, exist_ok=True)
    write_json(manifest_output, manifest)
    require_nonempty_file(manifest_output, "manifest_empty")
    return manifest


def default_decimated_name(output_glb: Path) -> str:
    if output_glb.name == "scene_mesh.glb":
        return "scene_mesh_decimated.glb"
    return f"{output_glb.stem}_decimated.glb"


def require_existing_file(path: Path, code: str) -> None:
    if not path.exists():
        raise MeshConversionError(code, f"required input does not exist: {path}")
    if not path.is_file():
        raise MeshConversionError(code, f"required input is not a file: {path}")
    if path.stat().st_size <= 0:
        raise MeshConversionError(code, f"required input is empty: {path}")


def require_nonempty_file(path: Path, code: str) -> None:
    if not path.exists() or path.stat().st_size <= 0:
        raise MeshConversionError(code, f"expected nonempty output was not written: {path}", exit_code=1)


def load_json(path: Path, code: str) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise MeshConversionError(code, f"could not read JSON {path}: {exc}") from exc
    if not isinstance(data, dict):
        raise MeshConversionError(code, f"expected JSON object in {path}")
    return data


def write_json(path: Path, payload: Any) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2, sort_keys=False) + "\n", encoding="utf-8")
    tmp.replace(path)


def load_mesh(path: Path) -> MeshData:
    suffix = path.suffix.lower()
    if suffix == ".ply":
        return read_ply_mesh(path)
    if suffix == ".obj":
        return read_obj_mesh(path)
    raise MeshConversionError("unsupported_mesh_format", f"unsupported source mesh format {suffix!r}; expected .ply or .obj")


def read_obj_mesh(path: Path) -> MeshData:
    vertices: list[tuple[float, float, float]] = []
    colors: list[tuple[float, float, float, float]] = []
    faces: list[tuple[int, int, int]] = []
    warnings: list[str] = []
    polygon_faces = 0

    with path.open("r", encoding="utf-8", errors="ignore") as stream:
        for line_no, line in enumerate(stream, start=1):
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            parts = stripped.split()
            record_type = parts[0]
            if record_type == "v":
                if len(parts) < 4:
                    raise MeshConversionError("invalid_obj_vertex", f"{path}:{line_no} has a vertex with fewer than 3 coordinates")
                try:
                    point = (float(parts[1]), float(parts[2]), float(parts[3]))
                except ValueError as exc:
                    raise MeshConversionError("invalid_obj_vertex", f"{path}:{line_no} has a nonnumeric vertex") from exc
                vertices.append(point)
                if len(parts) >= 7:
                    colors.append(normalize_color_values(parts[4:8]))
                elif colors:
                    colors.append((1.0, 1.0, 1.0, 1.0))
            elif record_type == "f":
                if len(parts) < 4:
                    warnings.append(f"Skipped degenerate OBJ face on line {line_no}.")
                    continue
                try:
                    indices = [parse_obj_vertex_index(token, len(vertices)) for token in parts[1:]]
                except ValueError as exc:
                    raise MeshConversionError("invalid_obj_face", f"{path}:{line_no} has an invalid face index: {exc}") from exc
                if len(indices) > 3:
                    polygon_faces += 1
                faces.extend(triangulate(indices))

    if polygon_faces:
        warnings.append(f"Triangulated {polygon_faces} OBJ polygon faces with more than 3 vertices.")
    return MeshData(vertices=vertices, faces=faces, colors=colors if colors else None, source_format="obj", warnings=warnings)


def parse_obj_vertex_index(token: str, vertex_count: int) -> int:
    value = token.split("/", 1)[0]
    if not value:
        raise ValueError(token)
    index = int(value)
    if index > 0:
        return index - 1
    if index < 0:
        return vertex_count + index
    raise ValueError("OBJ indices are 1-based; index 0 is invalid")


def normalize_color_values(values: Iterable[str]) -> tuple[float, float, float, float]:
    parsed = [float(value) for value in values]
    while len(parsed) < 4:
        parsed.append(1.0)
    rgba = parsed[:4]
    if any(value > 1.0 for value in rgba[:3]):
        rgba = [value / 255.0 if index < 3 else value for index, value in enumerate(rgba)]
    if rgba[3] > 1.0:
        rgba[3] = rgba[3] / 255.0
    return tuple(clamp(float(value), 0.0, 1.0) for value in rgba)  # type: ignore[return-value]


def read_ply_mesh(path: Path) -> MeshData:
    with path.open("rb") as stream:
        format_name, elements = read_ply_header(stream, path)
        if format_name == "ascii":
            return read_ascii_ply_body(stream, path, elements)
        if format_name in {"binary_little_endian", "binary_big_endian"}:
            return read_binary_ply_body(stream, path, elements, format_name)
    raise MeshConversionError("invalid_ply_format", f"{path} has unsupported PLY format {format_name!r}")


def read_ply_header(stream: BinaryIO, path: Path) -> tuple[str, list[PlyElement]]:
    first = stream.readline()
    if first.strip() != b"ply":
        raise MeshConversionError("invalid_ply_header", f"{path} does not start with a PLY header")

    format_name: str | None = None
    elements: list[PlyElement] = []
    current: PlyElement | None = None
    for raw_line in stream:
        try:
            line = raw_line.decode("ascii").strip()
        except UnicodeDecodeError as exc:
            raise MeshConversionError("invalid_ply_header", f"{path} has a non-ASCII PLY header") from exc
        if not line or line.startswith("comment") or line.startswith("obj_info"):
            continue
        parts = line.split()
        if parts[0] == "format":
            if len(parts) < 3 or parts[2] != "1.0":
                raise MeshConversionError("invalid_ply_header", f"{path} must use PLY format version 1.0")
            format_name = parts[1]
        elif parts[0] == "element":
            if len(parts) != 3:
                raise MeshConversionError("invalid_ply_header", f"{path} has malformed element declaration: {line}")
            try:
                count = int(parts[2])
            except ValueError as exc:
                raise MeshConversionError("invalid_ply_header", f"{path} has nonnumeric element count: {line}") from exc
            current = PlyElement(parts[1], count, [])
            elements.append(current)
        elif parts[0] == "property":
            if current is None:
                raise MeshConversionError("invalid_ply_header", f"{path} declares a property before any element")
            if len(parts) == 3:
                data_type = normalize_ply_type(parts[1], path)
                current.properties.append(PlyProperty(name=parts[2], data_type=data_type))
            elif len(parts) == 5 and parts[1] == "list":
                count_type = normalize_ply_type(parts[2], path)
                item_type = normalize_ply_type(parts[3], path)
                current.properties.append(
                    PlyProperty(name=parts[4], data_type="list", count_type=count_type, item_type=item_type)
                )
            else:
                raise MeshConversionError("invalid_ply_header", f"{path} has malformed property declaration: {line}")
        elif parts[0] == "end_header":
            break
    else:
        raise MeshConversionError("invalid_ply_header", f"{path} is missing end_header")

    if format_name is None:
        raise MeshConversionError("invalid_ply_header", f"{path} is missing a format declaration")
    if format_name not in {"ascii", "binary_little_endian", "binary_big_endian"}:
        raise MeshConversionError("invalid_ply_format", f"{path} has unsupported PLY format {format_name!r}")
    if not any(element.name == "vertex" for element in elements):
        raise MeshConversionError("invalid_ply_header", f"{path} has no vertex element")
    if not any(element.name == "face" for element in elements):
        raise MeshConversionError("invalid_ply_header", f"{path} has no face element")
    return format_name, elements


def normalize_ply_type(value: str, path: Path) -> str:
    lowered = value.lower()
    if lowered not in PLY_SCALAR_TYPES:
        raise MeshConversionError("unsupported_ply_property", f"{path} uses unsupported PLY property type {value!r}")
    return lowered


def read_ascii_ply_body(stream: BinaryIO, path: Path, elements: list[PlyElement]) -> MeshData:
    vertices: list[tuple[float, float, float]] = []
    colors: list[tuple[float, float, float, float]] = []
    faces: list[tuple[int, int, int]] = []
    warnings: list[str] = []
    polygon_faces = 0

    for element in elements:
        for record_index in range(element.count):
            raw_line = stream.readline()
            if not raw_line:
                raise MeshConversionError(
                    "truncated_ply",
                    f"{path} ended while reading {element.name} record {record_index + 1}/{element.count}",
                )
            line = raw_line.decode("utf-8", errors="ignore").strip()
            tokens = line.split()
            if element.name == "vertex":
                record = parse_ascii_ply_record(tokens, element, path)
                vertices.append(vertex_from_record(record, path))
                color = color_from_record(record)
                if color is not None:
                    colors.append(color)
                elif colors:
                    colors.append((1.0, 1.0, 1.0, 1.0))
            elif element.name == "face":
                record = parse_ascii_ply_record(tokens, element, path)
                indices = face_indices_from_record(record)
                if indices is None:
                    warnings.append("Skipped a PLY face record without vertex_indices.")
                    continue
                if len(indices) > 3:
                    polygon_faces += 1
                faces.extend(triangulate(indices))
            else:
                continue

    if polygon_faces:
        warnings.append(f"Triangulated {polygon_faces} PLY polygon faces with more than 3 vertices.")
    return MeshData(vertices=vertices, faces=faces, colors=colors if colors else None, source_format="ply", warnings=warnings)


def parse_ascii_ply_record(tokens: list[str], element: PlyElement, path: Path) -> dict[str, Any]:
    record: dict[str, Any] = {}
    cursor = 0
    for prop in element.properties:
        if prop.is_list:
            if cursor >= len(tokens):
                raise MeshConversionError("invalid_ply_body", f"{path} has a truncated list property {prop.name!r}")
            try:
                count = int(float(tokens[cursor]))
            except ValueError as exc:
                raise MeshConversionError("invalid_ply_body", f"{path} has a nonnumeric list count for {prop.name!r}") from exc
            cursor += 1
            values = tokens[cursor : cursor + count]
            if len(values) != count:
                raise MeshConversionError("invalid_ply_body", f"{path} has a truncated list property {prop.name!r}")
            record[prop.name] = [parse_ascii_scalar(value, prop.item_type or "int") for value in values]
            cursor += count
        else:
            if cursor >= len(tokens):
                raise MeshConversionError("invalid_ply_body", f"{path} has a truncated property {prop.name!r}")
            record[prop.name] = parse_ascii_scalar(tokens[cursor], prop.data_type)
            cursor += 1
    return record


def parse_ascii_scalar(value: str, data_type: str) -> int | float:
    fmt, _ = PLY_SCALAR_TYPES[data_type]
    if fmt in {"f", "d"}:
        return float(value)
    return int(float(value))


def read_binary_ply_body(stream: BinaryIO, path: Path, elements: list[PlyElement], format_name: str) -> MeshData:
    endian = "<" if format_name == "binary_little_endian" else ">"
    vertices: list[tuple[float, float, float]] = []
    colors: list[tuple[float, float, float, float]] = []
    faces: list[tuple[int, int, int]] = []
    warnings: list[str] = []
    polygon_faces = 0

    for element in elements:
        for record_index in range(element.count):
            if element.name == "vertex":
                record = read_binary_ply_record(stream, element, endian, path)
                vertices.append(vertex_from_record(record, path))
                color = color_from_record(record)
                if color is not None:
                    colors.append(color)
                elif colors:
                    colors.append((1.0, 1.0, 1.0, 1.0))
            elif element.name == "face":
                record = read_binary_ply_record(stream, element, endian, path)
                indices = face_indices_from_record(record)
                if indices is None:
                    warnings.append(f"Skipped PLY face record {record_index + 1} without vertex_indices.")
                    continue
                if len(indices) > 3:
                    polygon_faces += 1
                faces.extend(triangulate(indices))
            else:
                skip_binary_ply_record(stream, element, endian, path)

    if polygon_faces:
        warnings.append(f"Triangulated {polygon_faces} PLY polygon faces with more than 3 vertices.")
    return MeshData(vertices=vertices, faces=faces, colors=colors if colors else None, source_format="ply", warnings=warnings)


def read_binary_ply_record(stream: BinaryIO, element: PlyElement, endian: str, path: Path) -> dict[str, Any]:
    record: dict[str, Any] = {}
    for prop in element.properties:
        if prop.is_list:
            count = int(read_ply_scalar(stream, prop.count_type or "uchar", endian, path))
            record[prop.name] = [read_ply_scalar(stream, prop.item_type or "int", endian, path) for _ in range(count)]
        else:
            record[prop.name] = read_ply_scalar(stream, prop.data_type, endian, path)
    return record


def skip_binary_ply_record(stream: BinaryIO, element: PlyElement, endian: str, path: Path) -> None:
    for prop in element.properties:
        if prop.is_list:
            count = int(read_ply_scalar(stream, prop.count_type or "uchar", endian, path))
            _, item_size = PLY_SCALAR_TYPES[prop.item_type or "int"]
            skipped = stream.read(item_size * count)
            if len(skipped) != item_size * count:
                raise MeshConversionError("truncated_ply", f"{path} ended while skipping binary PLY list property {prop.name!r}")
        else:
            _, size = PLY_SCALAR_TYPES[prop.data_type]
            skipped = stream.read(size)
            if len(skipped) != size:
                raise MeshConversionError("truncated_ply", f"{path} ended while skipping binary PLY property {prop.name!r}")


def read_ply_scalar(stream: BinaryIO, data_type: str, endian: str, path: Path) -> int | float:
    fmt, size = PLY_SCALAR_TYPES[data_type]
    data = stream.read(size)
    if len(data) != size:
        raise MeshConversionError("truncated_ply", f"{path} ended while reading binary PLY scalar")
    return struct.unpack(endian + fmt, data)[0]


def vertex_from_record(record: dict[str, Any], path: Path) -> tuple[float, float, float]:
    missing = [name for name in ("x", "y", "z") if name not in record]
    if missing:
        raise MeshConversionError("invalid_ply_vertex", f"{path} vertex element is missing properties: {', '.join(missing)}")
    return (float(record["x"]), float(record["y"]), float(record["z"]))


def color_from_record(record: dict[str, Any]) -> tuple[float, float, float, float] | None:
    color_names = [
        ("red", "green", "blue", "alpha"),
        ("r", "g", "b", "a"),
        ("diffuse_red", "diffuse_green", "diffuse_blue", "diffuse_alpha"),
    ]
    for red_name, green_name, blue_name, alpha_name in color_names:
        if red_name in record and green_name in record and blue_name in record:
            values = [
                float(record[red_name]),
                float(record[green_name]),
                float(record[blue_name]),
                float(record.get(alpha_name, 255.0 if max(float(record[red_name]), float(record[green_name]), float(record[blue_name])) > 1.0 else 1.0)),
            ]
            if any(value > 1.0 for value in values[:3]):
                values[:3] = [value / 255.0 for value in values[:3]]
            if values[3] > 1.0:
                values[3] /= 255.0
            return tuple(clamp(value, 0.0, 1.0) for value in values)  # type: ignore[return-value]
    return None


def face_indices_from_record(record: dict[str, Any]) -> list[int] | None:
    for name in ("vertex_indices", "vertex_index", "vertices"):
        value = record.get(name)
        if isinstance(value, list):
            return [int(index) for index in value]
    for value in record.values():
        if isinstance(value, list):
            return [int(index) for index in value]
    return None


def triangulate(indices: list[int]) -> list[tuple[int, int, int]]:
    if len(indices) < 3:
        return []
    first = indices[0]
    triangles: list[tuple[int, int, int]] = []
    for cursor in range(1, len(indices) - 1):
        triangles.append((first, indices[cursor], indices[cursor + 1]))
    return triangles


def validate_and_clean_mesh(mesh: MeshData, path: Path) -> None:
    if not mesh.vertices:
        raise MeshConversionError("empty_mesh", f"{path} has no vertices")
    invalid_vertex = next(
        (
            index
            for index, vertex in enumerate(mesh.vertices)
            if len(vertex) != 3 or not all(math.isfinite(value) for value in vertex)
        ),
        None,
    )
    if invalid_vertex is not None:
        raise MeshConversionError("invalid_vertex", f"{path} has a non-finite vertex at index {invalid_vertex}")

    clean_faces: list[tuple[int, int, int]] = []
    degenerate_faces = 0
    for face in mesh.faces:
        if any(index < 0 or index >= len(mesh.vertices) for index in face):
            raise MeshConversionError("invalid_face_indices", f"{path} has a face referencing vertices outside 0..{len(mesh.vertices) - 1}")
        if len(set(face)) < 3:
            degenerate_faces += 1
            continue
        clean_faces.append(face)
    if degenerate_faces:
        mesh.warnings.append(f"Skipped {degenerate_faces} degenerate triangle faces.")
    mesh.faces = clean_faces
    if not mesh.faces:
        raise MeshConversionError("empty_mesh_faces", f"{path} has no usable triangle faces")

    if mesh.colors is not None and len(mesh.colors) != len(mesh.vertices):
        mesh.warnings.append("Source vertex color count did not match vertex count; vertex colors were dropped.")
        mesh.colors = None


def sample_mesh_by_faces(mesh: MeshData, max_faces: int) -> MeshData:
    if len(mesh.faces) <= max_faces:
        return MeshData(
            vertices=list(mesh.vertices),
            faces=list(mesh.faces),
            colors=list(mesh.colors) if mesh.colors is not None else None,
            source_format=mesh.source_format,
            warnings=[],
        )

    selected_faces = [
        mesh.faces[min(int(index * len(mesh.faces) / max_faces), len(mesh.faces) - 1)] for index in range(max_faces)
    ]
    remap: dict[int, int] = {}
    vertices: list[tuple[float, float, float]] = []
    colors: list[tuple[float, float, float, float]] = []
    faces: list[tuple[int, int, int]] = []
    for face in selected_faces:
        remapped: list[int] = []
        for old_index in face:
            new_index = remap.get(old_index)
            if new_index is None:
                new_index = len(vertices)
                remap[old_index] = new_index
                vertices.append(mesh.vertices[old_index])
                if mesh.colors is not None:
                    colors.append(mesh.colors[old_index])
            remapped.append(new_index)
        if len(set(remapped)) == 3:
            faces.append((remapped[0], remapped[1], remapped[2]))
    return MeshData(
        vertices=vertices,
        faces=faces,
        colors=colors if mesh.colors is not None else None,
        source_format=mesh.source_format,
        warnings=[],
    )


def write_glb(mesh: MeshData, path: Path, *, name: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    binary = bytearray()
    buffer_views: list[dict[str, Any]] = []
    accessors: list[dict[str, Any]] = []

    def append_view(data: bytes | bytearray, target: int) -> int:
        pad_binary(binary)
        offset = len(binary)
        binary.extend(data)
        view = {"buffer": 0, "byteOffset": offset, "byteLength": len(data), "target": target}
        buffer_views.append(view)
        return len(buffer_views) - 1

    position_blob = bytearray()
    for vertex in mesh.vertices:
        position_blob.extend(struct.pack("<fff", *vertex))
    position_view = append_view(position_blob, 34962)
    mins, maxs = mesh_min_max(mesh.vertices)
    position_accessor = len(accessors)
    accessors.append(
        {
            "bufferView": position_view,
            "byteOffset": 0,
            "componentType": 5126,
            "count": len(mesh.vertices),
            "type": "VEC3",
            "min": [round(value, 7) for value in mins],
            "max": [round(value, 7) for value in maxs],
        }
    )

    color_accessor: int | None = None
    if mesh.colors is not None:
        color_blob = bytearray()
        for color in mesh.colors:
            color_blob.extend(struct.pack("<ffff", *color))
        color_view = append_view(color_blob, 34962)
        color_accessor = len(accessors)
        accessors.append(
            {
                "bufferView": color_view,
                "byteOffset": 0,
                "componentType": 5126,
                "count": len(mesh.colors),
                "type": "VEC4",
            }
        )

    flat_indices = [index for face in mesh.faces for index in face]
    if len(mesh.vertices) <= 65_535:
        index_component_type = 5123
        index_blob = bytearray().join(struct.pack("<H", index) for index in flat_indices)
    else:
        index_component_type = 5125
        index_blob = bytearray().join(struct.pack("<I", index) for index in flat_indices)
    index_view = append_view(index_blob, 34963)
    index_accessor = len(accessors)
    accessors.append(
        {
            "bufferView": index_view,
            "byteOffset": 0,
            "componentType": index_component_type,
            "count": len(flat_indices),
            "type": "SCALAR",
            "min": [min(flat_indices)],
            "max": [max(flat_indices)],
        }
    )

    attributes: dict[str, int] = {"POSITION": position_accessor}
    if color_accessor is not None:
        attributes["COLOR_0"] = color_accessor

    gltf = {
        "asset": {"version": "2.0", "generator": f"AdaptSim mesh converter {VERSION}"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"name": safe_gltf_name(name), "mesh": 0}],
        "meshes": [
            {
                "name": safe_gltf_name(name),
                "primitives": [{"attributes": attributes, "indices": index_accessor, "material": 0, "mode": 4}],
            }
        ],
        "materials": [
            {
                "name": "AdaptSim_Default",
                "doubleSided": True,
                "pbrMetallicRoughness": {
                    "baseColorFactor": [1.0, 1.0, 1.0, 1.0],
                    "metallicFactor": 0.0,
                    "roughnessFactor": 0.85,
                },
            }
        ],
        "buffers": [{"byteLength": len(binary)}],
        "bufferViews": buffer_views,
        "accessors": accessors,
    }
    json_chunk = json.dumps(gltf, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    json_chunk = pad_bytes(json_chunk, b" ")
    bin_chunk = pad_bytes(bytes(binary), b"\x00")
    total_length = 12 + 8 + len(json_chunk) + 8 + len(bin_chunk)
    with path.open("wb") as stream:
        stream.write(struct.pack("<III", 0x46546C67, 2, total_length))
        stream.write(struct.pack("<I4s", len(json_chunk), b"JSON"))
        stream.write(json_chunk)
        stream.write(struct.pack("<I4s", len(bin_chunk), b"BIN\x00"))
        stream.write(bin_chunk)


def pad_binary(binary: bytearray) -> None:
    while len(binary) % 4:
        binary.append(0)


def pad_bytes(data: bytes, pad: bytes) -> bytes:
    remainder = len(data) % 4
    if remainder == 0:
        return data
    return data + pad * (4 - remainder)


def mesh_min_max(vertices: list[tuple[float, float, float]]) -> tuple[tuple[float, float, float], tuple[float, float, float]]:
    xs = [vertex[0] for vertex in vertices]
    ys = [vertex[1] for vertex in vertices]
    zs = [vertex[2] for vertex in vertices]
    return (min(xs), min(ys), min(zs)), (max(xs), max(ys), max(zs))


def safe_gltf_name(value: str) -> str:
    safe = "".join(character if character.isalnum() or character in {"_", "-"} else "_" for character in value)
    return safe[:96] or "AdaptSimMesh"


def write_obj(mesh: MeshData, path: Path, *, name: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "# AdaptSim collision proxy",
        f"o {safe_gltf_name(name)}",
    ]
    lines.extend(f"v {x:.7g} {y:.7g} {z:.7g}" for x, y, z in mesh.vertices)
    lines.extend(f"f {a + 1} {b + 1} {c + 1}" for a, b, c in mesh.faces)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def mesh_stats(mesh: MeshData) -> MeshStats:
    mins, maxs = mesh_min_max(mesh.vertices)
    size = tuple(max(maxs[index] - mins[index], 0.001) for index in range(3))
    center = tuple((mins[index] + maxs[index]) / 2.0 for index in range(3))
    return MeshStats(vertices=len(mesh.vertices), faces=len(mesh.faces), center_m=center, size_m=size)  # type: ignore[arg-type]


def stats_contract(stats: MeshStats) -> dict[str, Any]:
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


def collect_warnings(
    mesh: MeshData,
    decimated_mesh: MeshData,
    collision_mesh: MeshData,
    metadata: dict[str, Any],
) -> list[str]:
    warnings: list[str] = []
    warnings.extend(mesh.warnings)
    warnings.extend(decimated_mesh.warnings)
    warnings.extend(collision_mesh.warnings)
    warnings.append(
        "Transform assumption: source mesh coordinates are meters, Z-up, X-forward, right-handed; GLB vertices are not axis-converted."
    )
    warnings.append("Unreal import should apply transform_to_unreal.scale=100.0 to convert meters to centimeters.")
    scale_hint = metadata.get("scale_hint") if isinstance(metadata.get("scale_hint"), dict) else {}
    if scale_hint.get("type") == "unknown":
        warnings.append("Capture scale hint is unknown; unit scale is assumed from the reconstruction mesh.")
    elif scale_hint.get("confidence") == "operator_provided":
        warnings.append("Scale is operator-provided from capture metadata.")
    return dedupe_preserve_order(warnings)[:32]


def build_manifest(
    *,
    capture_id: str,
    gcs_prefix: str,
    metadata: dict[str, Any],
    sfm_report: dict[str, Any],
    source_mesh: Path,
    output_glb: Path,
    decimated_output: Path,
    collision_output: Path,
    manifest_output: Path,
    source_stats: MeshStats,
    render_stats: MeshStats,
    collision_stats: MeshStats,
    metadata_path: Path,
    sfm_report_path: Path,
    dlnr_truncation_margin_m: float,
    warnings: list[str],
) -> dict[str, Any]:
    image_count = int(
        sfm_report.get("image_count")
        or metadata.get("uploaded_image_count")
        or metadata.get("expected_image_count")
        or 1
    )
    registered_image_count = int(sfm_report.get("registered_image_count") or image_count)
    if registered_image_count > image_count:
        image_count = registered_image_count

    scale_hint = metadata.get("scale_hint") if isinstance(metadata.get("scale_hint"), dict) else {}
    origin = "operator_marker" if scale_hint.get("type") in {"known_distance", "calibration_marker"} else "unknown"
    sparse_point_count = sfm_report.get("sparse_point_count")
    if sparse_point_count is not None:
        sparse_point_count = int(sparse_point_count)

    manifest = {
        "contract_type": "reconstruction_manifest",
        "schema_version": "1.0",
        "capture_id": capture_id,
        "generated_at": utc_now(),
        "gcs_prefix": gcs_prefix,
        "worker": {
            "worker_id": "l4_unreal_import",
            "vm_instance": os.environ.get("ADAPTSIM_VM_INSTANCE") or socket.gethostname() or "local",
            "zone": os.environ.get("ADAPTSIM_VM_ZONE", "us-east1-d"),
            "tool_versions": {
                "python": sys.version.split()[0],
                "adaptsim_convert_mesh": VERSION,
            },
        },
        "raw_metadata_uri": gcs_join(gcs_prefix, "raw", "metadata.json"),
        "image_count": max(1, image_count),
        "registered_image_count": max(0, registered_image_count),
        "sparse_point_count": sparse_point_count,
        "reconstruction_method": "fvdb_frgs_dlnr_mesh",
        "dlnr_truncation_margin_m": dlnr_truncation_margin_m,
        "coordinate_frame": {
            "units": "meters",
            "up_axis": "z",
            "forward_axis": "x",
            "handedness": "right",
            "scale_to_meters": 1.0,
        },
        "transform_to_unreal": {
            "origin": origin,
            "scale": 100.0,
            "rotation_deg": [0.0, 0.0, 0.0],
            "translation_m": [0.0, 0.0, 0.0],
        },
        "source_mesh": stats_contract(source_stats),
        "render_mesh": stats_contract(render_stats),
        "collision_proxy": stats_contract(collision_stats),
        "artifacts": [
            artifact_entry("raw_metadata", metadata_path, gcs_join(gcs_prefix, "raw", "metadata.json")),
            artifact_entry("sfm_report", sfm_report_path, gcs_join(gcs_prefix, "sfm", "colmap", "report.json")),
            artifact_entry("mesh_dlnr_ply", source_mesh, gcs_join(gcs_prefix, "reconstruction", source_mesh.name)),
            artifact_entry("unreal_mesh_glb", output_glb, gcs_join(gcs_prefix, "unreal-import", output_glb.name)),
            artifact_entry(
                "unreal_mesh_decimated_glb",
                decimated_output,
                gcs_join(gcs_prefix, "unreal-import", decimated_output.name),
            ),
            artifact_entry("collision_proxy_obj", collision_output, gcs_join(gcs_prefix, "unreal-import", collision_output.name)),
            {
                "artifact_type": "reconstruction_manifest",
                "content_type": "application/json",
                "gcs_uri": gcs_join(gcs_prefix, "unreal-import", manifest_output.name),
                "size_bytes": None,
                "sha256": None,
            },
        ],
        "warnings": warnings,
    }
    if ReconstructionManifest is not None:
        try:
            manifest = ReconstructionManifest.model_validate(manifest).model_dump(mode="json")
        except Exception as exc:
            raise MeshConversionError(
                "manifest_validation_failed",
                f"generated reconstruction manifest failed contract validation: {exc}",
            ) from exc
    return manifest


def artifact_entry(artifact_type: str, path: Path, gcs_uri: str) -> dict[str, Any]:
    return {
        "artifact_type": artifact_type,
        "content_type": CONTENT_TYPES.get(path.suffix.lower(), "application/octet-stream"),
        "gcs_uri": gcs_uri,
        "size_bytes": path.stat().st_size if path.exists() else None,
        "sha256": sha256_file(path) if path.exists() else None,
    }


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalize_gcs_prefix(value: str) -> str:
    if not value.startswith("gs://"):
        raise MeshConversionError("invalid_gcs_prefix", f"--gcs-prefix must be a gs:// URI: {value}")
    return value.rstrip("/") + "/"


def gcs_join(root: str, *parts: str) -> str:
    uri = root.rstrip("/")
    for part in parts:
        uri += "/" + part.strip("/")
    return uri


def dedupe_preserve_order(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value and value not in seen:
            seen.add(value)
            result.append(value)
    return result


def clamp(value: float, lower: float, upper: float) -> float:
    return min(max(value, lower), upper)


def main(argv: list[str] | None = None) -> int:
    try:
        args = parse_args(argv)
        run_conversion(args)
        return 0
    except MeshConversionError as exc:
        print(f"ERROR {exc.code}: {exc.message}", file=sys.stderr)
        return exc.exit_code
    except Exception as exc:  # pragma: no cover - defensive CLI boundary.
        print(f"ERROR unexpected_mesh_converter_error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
