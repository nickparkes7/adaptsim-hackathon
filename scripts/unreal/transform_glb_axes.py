#!/usr/bin/env python3
"""Rewrite GLB mesh coordinates for Unreal Interchange import.

AdaptSim reconstruction meshes are authored as meters, Z-up, X-forward.
Unreal's glTF/GLB import path treats glTF Y as vertical. For these generated
meshes, writing positions as (x, z, y) lets Unreal import them as
(x, y, z) in centimeters after the existing import scale.
"""

from __future__ import annotations

import argparse
import json
import struct
from pathlib import Path
from typing import Any


GLB_MAGIC = 0x46546C67
JSON_CHUNK = b"JSON"
BIN_CHUNK = b"BIN\x00"
FLOAT = 5126
UNSIGNED_SHORT = 5123
UNSIGNED_INT = 5125


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--mode",
        choices=("xzy", "xz-neg-y"),
        default="xzy",
        help="Position transform. xzy maps source (x,y,z) to glTF (x,z,y).",
    )
    parser.add_argument("--flip-winding", choices=("auto", "yes", "no"), default="auto")
    return parser.parse_args()


def pad_bytes(data: bytes, pad: bytes) -> bytes:
    remainder = len(data) % 4
    return data if remainder == 0 else data + pad * (4 - remainder)


def read_glb(path: Path) -> tuple[dict[str, Any], bytearray]:
    data = path.read_bytes()
    if len(data) < 28:
        raise ValueError(f"{path} is too small to be a GLB")
    magic, version, total_length = struct.unpack_from("<III", data, 0)
    if magic != GLB_MAGIC or version != 2 or total_length != len(data):
        raise ValueError(f"{path} is not a valid GLB v2")
    offset = 12
    json_payload = None
    binary_payload = None
    while offset < len(data):
        chunk_length, chunk_type = struct.unpack_from("<I4s", data, offset)
        offset += 8
        payload = data[offset : offset + chunk_length]
        offset += chunk_length
        if chunk_type == JSON_CHUNK:
            json_payload = payload
        elif chunk_type == BIN_CHUNK:
            binary_payload = payload
    if json_payload is None or binary_payload is None:
        raise ValueError(f"{path} must contain JSON and BIN chunks")
    return json.loads(json_payload.decode("utf-8")), bytearray(binary_payload)


def write_glb(path: Path, gltf: dict[str, Any], binary: bytearray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    json_payload = pad_bytes(json.dumps(gltf, separators=(",", ":"), ensure_ascii=True).encode("utf-8"), b" ")
    binary_payload = pad_bytes(bytes(binary), b"\x00")
    total_length = 12 + 8 + len(json_payload) + 8 + len(binary_payload)
    with path.open("wb") as stream:
        stream.write(struct.pack("<III", GLB_MAGIC, 2, total_length))
        stream.write(struct.pack("<I4s", len(json_payload), JSON_CHUNK))
        stream.write(json_payload)
        stream.write(struct.pack("<I4s", len(binary_payload), BIN_CHUNK))
        stream.write(binary_payload)


def accessor_buffer(gltf: dict[str, Any], accessor_index: int) -> tuple[int, int, int]:
    accessor = gltf["accessors"][accessor_index]
    if accessor.get("componentType") != FLOAT or accessor.get("type") != "VEC3":
        raise ValueError(f"POSITION accessor {accessor_index} must be FLOAT VEC3")
    view = gltf["bufferViews"][accessor["bufferView"]]
    if view.get("byteStride") not in (None, 12):
        raise ValueError(f"POSITION accessor {accessor_index} has unsupported byteStride {view.get('byteStride')}")
    offset = int(view.get("byteOffset", 0)) + int(accessor.get("byteOffset", 0))
    return offset, int(accessor["count"]), 12


def index_buffer(gltf: dict[str, Any], accessor_index: int) -> tuple[int, int, int, str]:
    accessor = gltf["accessors"][accessor_index]
    view = gltf["bufferViews"][accessor["bufferView"]]
    component_type = accessor.get("componentType")
    if component_type == UNSIGNED_SHORT:
        return int(view.get("byteOffset", 0)) + int(accessor.get("byteOffset", 0)), int(accessor["count"]), 2, "<H"
    if component_type == UNSIGNED_INT:
        return int(view.get("byteOffset", 0)) + int(accessor.get("byteOffset", 0)), int(accessor["count"]), 4, "<I"
    raise ValueError(f"indices accessor {accessor_index} has unsupported component type {component_type}")


def transform_position(point: tuple[float, float, float], mode: str) -> tuple[float, float, float]:
    x, y, z = point
    if mode == "xzy":
        return x, z, y
    return x, z, -y


def transform_positions(gltf: dict[str, Any], binary: bytearray, mode: str) -> int:
    transformed = set()
    for mesh in gltf.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            position_accessor = primitive.get("attributes", {}).get("POSITION")
            if position_accessor is None or position_accessor in transformed:
                continue
            offset, count, stride = accessor_buffer(gltf, int(position_accessor))
            mins = [float("inf"), float("inf"), float("inf")]
            maxs = [float("-inf"), float("-inf"), float("-inf")]
            for index in range(count):
                cursor = offset + index * stride
                point = struct.unpack_from("<fff", binary, cursor)
                fixed = transform_position(point, mode)
                struct.pack_into("<fff", binary, cursor, *fixed)
                for axis, value in enumerate(fixed):
                    mins[axis] = min(mins[axis], value)
                    maxs[axis] = max(maxs[axis], value)
            accessor = gltf["accessors"][int(position_accessor)]
            accessor["min"] = [round(value, 7) for value in mins]
            accessor["max"] = [round(value, 7) for value in maxs]
            transformed.add(position_accessor)
    return len(transformed)


def flip_triangle_winding(gltf: dict[str, Any], binary: bytearray) -> int:
    flipped = 0
    for mesh in gltf.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            index_accessor = primitive.get("indices")
            if index_accessor is None:
                continue
            offset, count, component_size, fmt = index_buffer(gltf, int(index_accessor))
            if count % 3:
                continue
            for triangle in range(count // 3):
                a = offset + triangle * 3 * component_size
                b = a + component_size
                c = b + component_size
                ib = struct.unpack_from(fmt, binary, b)[0]
                ic = struct.unpack_from(fmt, binary, c)[0]
                struct.pack_into(fmt, binary, b, ic)
                struct.pack_into(fmt, binary, c, ib)
                flipped += 1
    return flipped


def main() -> int:
    args = parse_args()
    gltf, binary = read_glb(args.input)
    count = transform_positions(gltf, binary, args.mode)
    if count == 0:
        raise ValueError("No POSITION accessors were transformed")
    should_flip = args.flip_winding == "yes" or (args.flip_winding == "auto" and args.mode in {"xzy", "xz-neg-y"})
    flipped = flip_triangle_winding(gltf, binary) if should_flip else 0
    asset = gltf.setdefault("asset", {})
    generator = asset.get("generator") or "unknown"
    asset["generator"] = f"{generator}; AdaptSim transform_glb_axes mode={args.mode} flipped={flipped}"
    write_glb(args.output, gltf, binary)
    print(json.dumps({"input": str(args.input), "output": str(args.output), "position_accessors": count, "triangles_flipped": flipped}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
