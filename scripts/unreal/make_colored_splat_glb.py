#!/usr/bin/env python3
"""Convert the Safety Park colored point reconstruction into a renderable GLB.

The capture GLB contains millions of colored vertices, but its triangle soup is
not a reliable runtime surface in Unreal. This script samples source vertices
and emits small colored cross-card splats so Pixel Streaming has visible,
deterministic scene composition.
"""

from __future__ import annotations

import argparse
import json
import struct
from pathlib import Path
from typing import Any

import numpy as np


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
    parser.add_argument("--points", type=int, default=120_000)
    parser.add_argument("--splat-size-m", type=float, default=0.22)
    parser.add_argument("--color-exposure", type=float, default=1.0)
    parser.add_argument("--color-gamma", type=float, default=1.0)
    parser.add_argument("--color-saturation", type=float, default=1.0)
    parser.add_argument(
        "--sample-luma-power",
        type=float,
        default=1.0,
        help="Brightness weighting for point sampling. Use 0 for uniform sampling.",
    )
    parser.add_argument(
        "--sample-luma-floor",
        type=float,
        default=0.08,
        help="Minimum luma weight when sample-luma-power is above 0.",
    )
    parser.add_argument("--seed", type=int, default=17)
    return parser.parse_args()


def pad(data: bytes, pad_byte: bytes) -> bytes:
    remainder = len(data) % 4
    return data if remainder == 0 else data + pad_byte * (4 - remainder)


def read_glb(path: Path) -> tuple[dict[str, Any], bytes]:
    data = path.read_bytes()
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
    dtype = {FLOAT: np.float32, UNSIGNED_BYTE: np.uint8, UNSIGNED_INT: np.uint32}[component_type]
    offset = int(view.get("byteOffset", 0)) + int(accessor.get("byteOffset", 0))
    stride = int(view.get("byteStride", 0)) or np.dtype(dtype).itemsize * components
    item_size = np.dtype(dtype).itemsize * components
    if stride != item_size:
        rows = [
            np.frombuffer(binary[offset + index * stride : offset + index * stride + item_size], dtype=dtype, count=components)
            for index in range(count)
        ]
        arr = np.vstack(rows)
    else:
        arr = np.frombuffer(binary, dtype=dtype, count=count * components, offset=offset)
        arr = arr.reshape(count, components) if components > 1 else arr.reshape(count)
    if accessor.get("normalized") and dtype == np.uint8:
        arr = arr.astype(np.float32) / 255.0
    return arr


def ue_to_gltf(points_ue: np.ndarray) -> np.ndarray:
    return points_ue[:, [0, 2, 1]]


def build_splats(points_ue: np.ndarray, colors: np.ndarray, size_m: float) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    half = float(size_m) * 0.5
    offsets = np.array(
        [
            [(-half, -half, 0.0), (half, -half, 0.0), (half, half, 0.0), (-half, half, 0.0)],
            [(-half, 0.0, -half), (half, 0.0, -half), (half, 0.0, half), (-half, 0.0, half)],
            [(0.0, -half, -half), (0.0, half, -half), (0.0, half, half), (0.0, -half, half)],
        ],
        dtype=np.float32,
    ).reshape(12, 3)
    local_faces = np.array(
        [
            [0, 1, 2], [0, 2, 3],
            [4, 5, 6], [4, 6, 7],
            [8, 9, 10], [8, 10, 11],
        ],
        dtype=np.uint32,
    )

    count = int(points_ue.shape[0])
    vertices_ue = points_ue[:, None, :] + offsets[None, :, :]
    vertices_gltf = ue_to_gltf(vertices_ue.reshape(count * 12, 3)).astype(np.float32)
    vertex_colors = np.repeat(colors[:, None, :], 12, axis=1).reshape(count * 12, 4)
    bases = (np.arange(count, dtype=np.uint32) * 12)[:, None, None]
    faces = (local_faces[None, :, :] + bases).reshape(count * 6, 3)
    return vertices_gltf, vertex_colors, faces


def adjust_colors(colors: np.ndarray, exposure: float, gamma: float, saturation: float) -> np.ndarray:
    adjusted = colors.copy()
    rgb = np.clip(adjusted[:, :3], 0.0, 1.0)
    if gamma > 0.0 and abs(gamma - 1.0) > 1e-6:
        rgb = np.power(rgb, gamma)
    if abs(exposure - 1.0) > 1e-6:
        rgb = rgb * exposure
    if abs(saturation - 1.0) > 1e-6:
        luma = (0.2126 * rgb[:, 0] + 0.7152 * rgb[:, 1] + 0.0722 * rgb[:, 2])[:, None]
        rgb = luma + (rgb - luma) * saturation
    adjusted[:, :3] = np.clip(rgb, 0.0, 1.0)
    return adjusted


def write_glb(path: Path, points: np.ndarray, colors: np.ndarray, faces: np.ndarray) -> None:
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

    gltf = {
        "asset": {"version": "2.0", "generator": "AdaptSim make_colored_splat_glb.py"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": "SafetyParkSplatVisual"}],
        "meshes": [
            {
                "name": "SafetyParkSplatVisual",
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
                "name": "AdaptSim_VertexColor_DoubleSided",
                "doubleSided": True,
                "pbrMetallicRoughness": {
                    "baseColorFactor": [1.0, 1.0, 1.0, 1.0],
                    "metallicFactor": 0.0,
                    "roughnessFactor": 0.8,
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
                "min": points.min(axis=0).astype(float).tolist(),
                "max": points.max(axis=0).astype(float).tolist(),
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
    points = accessor_array(gltf, binary, int(primitive["attributes"]["POSITION"])).astype(np.float32, copy=False)
    colors = accessor_array(gltf, binary, int(primitive["attributes"]["COLOR_0"])).astype(np.float32, copy=False)
    if colors.max() > 1.5:
        colors = colors / 255.0
    if colors.shape[1] == 3:
        colors = np.column_stack([colors, np.ones(len(colors), dtype=np.float32)])
    colors = adjust_colors(colors, float(args.color_exposure), float(args.color_gamma), float(args.color_saturation))

    rng = np.random.default_rng(int(args.seed))
    sample_count = min(int(args.points), len(points))
    luma = 0.2126 * colors[:, 0] + 0.7152 * colors[:, 1] + 0.0722 * colors[:, 2]
    sample_luma_power = max(0.0, float(args.sample_luma_power))
    if sample_luma_power > 0.0:
        weights = np.clip(luma, max(0.0, float(args.sample_luma_floor)), 1.0)
        if abs(sample_luma_power - 1.0) > 1e-6:
            weights = np.power(weights, sample_luma_power)
        weights = weights / weights.sum()
    else:
        weights = None
    indices = rng.choice(len(points), size=sample_count, replace=False, p=weights)
    vertices, vertex_colors, faces = build_splats(points[indices], colors[indices], float(args.splat_size_m))
    write_glb(args.output, vertices, vertex_colors, faces)
    print(json.dumps({
        "input": str(args.input),
        "output": str(args.output),
        "sampled_points": int(sample_count),
        "vertices": int(vertices.shape[0]),
        "faces": int(faces.shape[0]),
        "splat_size_m": float(args.splat_size_m),
        "color_exposure": float(args.color_exposure),
        "color_gamma": float(args.color_gamma),
        "color_saturation": float(args.color_saturation),
        "sample_luma_power": sample_luma_power,
        "sample_luma_floor": float(args.sample_luma_floor),
        "bounds_min": [float(v) for v in vertices.min(axis=0)],
        "bounds_max": [float(v) for v in vertices.max(axis=0)],
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
