#!/usr/bin/env python3
"""Create a runtime-friendly colored GLB from the Safety Park reconstruction.

The generated capture mesh is a single GLB with POSITION, COLOR_0, and indices.
This script performs quadric simplification, transfers vertex color by nearest
source vertex, rewrites axes for Unreal's glTF importer, and emits a compact
GLB that imports as a normal StaticMesh without relying on Nanite.
"""

from __future__ import annotations

import argparse
import json
import struct
from pathlib import Path
from typing import Any

import fast_simplification
import numpy as np
from scipy.spatial import cKDTree


GLB_MAGIC = 0x46546C67
JSON_CHUNK = b"JSON"
BIN_CHUNK = b"BIN\x00"
FLOAT = 5126
UNSIGNED_BYTE = 5121
UNSIGNED_INT = 5125
ARRAY_BUFFER = 34962
ELEMENT_ARRAY_BUFFER = 34963


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--target-faces", type=int, default=1_200_000)
    parser.add_argument("--aggression", type=float, default=5.0)
    parser.add_argument("--mode", choices=("xzy", "xz-neg-y"), default="xzy")
    parser.add_argument("--flip-winding", choices=("yes", "no"), default="yes")
    return parser.parse_args()


def pad(data: bytes, pad_byte: bytes) -> bytes:
    remainder = len(data) % 4
    return data if remainder == 0 else data + pad_byte * (4 - remainder)


def read_glb(path: Path) -> tuple[dict[str, Any], bytes]:
    data = path.read_bytes()
    if len(data) < 28:
        raise ValueError(f"{path} is too small to be a GLB")
    magic, version, total_length = struct.unpack_from("<III", data, 0)
    if magic != GLB_MAGIC or version != 2 or total_length != len(data):
        raise ValueError(f"{path} is not a valid GLB v2")
    offset = 12
    gltf = None
    binary = None
    while offset < len(data):
        chunk_length, chunk_type = struct.unpack_from("<I4s", data, offset)
        offset += 8
        payload = data[offset : offset + chunk_length]
        offset += chunk_length
        if chunk_type == JSON_CHUNK:
            gltf = json.loads(payload.decode("utf-8"))
        elif chunk_type == BIN_CHUNK:
            binary = payload
    if gltf is None or binary is None:
        raise ValueError("GLB must contain JSON and BIN chunks")
    return gltf, binary


def accessor_array(gltf: dict[str, Any], binary: bytes, accessor_index: int) -> np.ndarray:
    accessor = gltf["accessors"][accessor_index]
    view = gltf["bufferViews"][accessor["bufferView"]]
    component_type = accessor["componentType"]
    accessor_type = accessor["type"]
    count = int(accessor["count"])
    components = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[accessor_type]
    dtype_by_component = {
        FLOAT: np.float32,
        UNSIGNED_BYTE: np.uint8,
        UNSIGNED_INT: np.uint32,
    }
    dtype = dtype_by_component.get(component_type)
    if dtype is None:
        raise ValueError(f"Unsupported accessor component type: {component_type}")
    offset = int(view.get("byteOffset", 0)) + int(accessor.get("byteOffset", 0))
    stride = int(view.get("byteStride", 0)) or np.dtype(dtype).itemsize * components
    item_size = np.dtype(dtype).itemsize * components
    if stride != item_size:
        rows = []
        for index in range(count):
            start = offset + index * stride
            rows.append(np.frombuffer(binary[start : start + item_size], dtype=dtype, count=components))
        return np.vstack(rows)
    arr = np.frombuffer(binary, dtype=dtype, count=count * components, offset=offset)
    if components == 1:
        return arr.reshape(count)
    return arr.reshape(count, components)


def transform_positions(points: np.ndarray, mode: str) -> np.ndarray:
    if mode == "xzy":
        return points[:, [0, 2, 1]]
    transformed = points[:, [0, 2, 1]].copy()
    transformed[:, 2] *= -1.0
    return transformed


def write_output(path: Path, points: np.ndarray, colors: np.ndarray, faces: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    points = np.asarray(points, dtype=np.float32)
    colors = np.asarray(np.clip(colors, 0.0, 1.0) * 255.0 + 0.5, dtype=np.uint8)
    faces = np.asarray(faces, dtype=np.uint32)

    point_blob = pad(points.tobytes(order="C"), b"\x00")
    color_blob = pad(colors.tobytes(order="C"), b"\x00")
    index_blob = pad(faces.reshape(-1).tobytes(order="C"), b"\x00")

    point_offset = 0
    color_offset = point_offset + len(point_blob)
    index_offset = color_offset + len(color_blob)
    binary = point_blob + color_blob + index_blob

    mins = points.min(axis=0).astype(float).tolist()
    maxs = points.max(axis=0).astype(float).tolist()
    gltf = {
        "asset": {"version": "2.0", "generator": "AdaptSim simplify_colored_glb.py"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": "SafetyParkRuntimeVisual"}],
        "meshes": [
            {
                "name": "SafetyParkRuntimeVisual",
                "primitives": [
                    {
                        "attributes": {"POSITION": 0, "COLOR_0": 1},
                        "indices": 2,
                        "material": 0,
                        "mode": 4,
                    }
                ],
            }
        ],
        "materials": [
            {
                "name": "AdaptSim_VertexColor",
                "doubleSided": True,
                "pbrMetallicRoughness": {
                    "baseColorFactor": [1.0, 1.0, 1.0, 1.0],
                    "metallicFactor": 0.0,
                    "roughnessFactor": 0.9,
                },
            }
        ],
        "buffers": [{"byteLength": len(binary)}],
        "bufferViews": [
            {"buffer": 0, "byteOffset": point_offset, "byteLength": len(point_blob), "target": ARRAY_BUFFER},
            {"buffer": 0, "byteOffset": color_offset, "byteLength": len(color_blob), "target": ARRAY_BUFFER},
            {"buffer": 0, "byteOffset": index_offset, "byteLength": len(index_blob), "target": ELEMENT_ARRAY_BUFFER},
        ],
        "accessors": [
            {
                "bufferView": 0,
                "componentType": FLOAT,
                "count": int(points.shape[0]),
                "type": "VEC3",
                "min": mins,
                "max": maxs,
            },
            {
                "bufferView": 1,
                "componentType": UNSIGNED_BYTE,
                "count": int(colors.shape[0]),
                "type": "VEC4",
                "normalized": True,
            },
            {
                "bufferView": 2,
                "componentType": UNSIGNED_INT,
                "count": int(faces.size),
                "type": "SCALAR",
                "min": [0],
                "max": [int(faces.max()) if faces.size else 0],
            },
        ],
    }

    json_blob = pad(json.dumps(gltf, separators=(",", ":"), ensure_ascii=True).encode("utf-8"), b" ")
    bin_blob = pad(binary, b"\x00")
    total_length = 12 + 8 + len(json_blob) + 8 + len(bin_blob)
    with path.open("wb") as stream:
        stream.write(struct.pack("<III", GLB_MAGIC, 2, total_length))
        stream.write(struct.pack("<I4s", len(json_blob), JSON_CHUNK))
        stream.write(json_blob)
        stream.write(struct.pack("<I4s", len(bin_blob), BIN_CHUNK))
        stream.write(bin_blob)


def main() -> int:
    args = parse_args()
    gltf, binary = read_glb(args.input)
    primitive = gltf["meshes"][0]["primitives"][0]
    points = accessor_array(gltf, binary, int(primitive["attributes"]["POSITION"])).astype(np.float64, copy=False)
    colors = accessor_array(gltf, binary, int(primitive["attributes"]["COLOR_0"])).astype(np.float32, copy=False)
    faces = accessor_array(gltf, binary, int(primitive["indices"])).astype(np.int32, copy=False).reshape(-1, 3)
    target_faces = min(int(args.target_faces), int(faces.shape[0]))

    print(json.dumps({
        "phase": "loaded",
        "vertices": int(points.shape[0]),
        "faces": int(faces.shape[0]),
        "target_faces": target_faces,
    }))
    simplified_points, simplified_faces = fast_simplification.simplify(
        points,
        faces,
        target_count=target_faces,
        agg=float(args.aggression),
        verbose=True,
    )

    print(json.dumps({
        "phase": "simplified",
        "vertices": int(simplified_points.shape[0]),
        "faces": int(simplified_faces.shape[0]),
    }))
    tree = cKDTree(points)
    _distances, nearest = tree.query(simplified_points, workers=-1)
    simplified_colors = colors[nearest]
    unreal_points = transform_positions(simplified_points.astype(np.float32, copy=False), args.mode)
    output_faces = simplified_faces[:, [0, 2, 1]] if args.flip_winding == "yes" else simplified_faces
    write_output(args.output, unreal_points, simplified_colors, output_faces)
    print(json.dumps({
        "phase": "written",
        "output": str(args.output),
        "vertices": int(simplified_points.shape[0]),
        "faces": int(simplified_faces.shape[0]),
        "bounds_min": [float(v) for v in unreal_points.min(axis=0)],
        "bounds_max": [float(v) for v in unreal_points.max(axis=0)],
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
