#!/usr/bin/env python3
"""Validate an imported AdaptSim scene/map inside Unreal Editor Python."""

from __future__ import annotations

import argparse
import base64
import json
import os
import shlex
import sys
from pathlib import Path

try:
    import unreal
except ImportError:
    unreal = None


def log(message: str) -> None:
    if unreal:
        unreal.log(f"[AdaptSimValidate] {message}")
    else:
        print(f"[AdaptSimValidate] {message}")


def fail(message: str) -> None:
    if unreal:
        unreal.log_error(f"[AdaptSimValidate] {message}")
    raise RuntimeError(message)


def command_args() -> list[str]:
    env_args_b64 = os.environ.get("ADAPTSIM_VALIDATE_ARGS_B64")
    if env_args_b64:
        return shlex.split(base64.b64decode(env_args_b64).decode("utf-8"))

    argv = sys.argv[1:]
    if any(arg.startswith("--") for arg in argv):
        return argv

    if not unreal:
        return argv

    try:
        tokens = shlex.split(unreal.SystemLibrary.get_command_line())
    except Exception:
        return argv

    for index, token in enumerate(tokens):
        marker = "-AdaptSimValidateArgsB64"
        if token == marker and index + 1 < len(tokens):
            return shlex.split(base64.b64decode(tokens[index + 1]).decode("utf-8"))
        if token.startswith(f"{marker}="):
            return shlex.split(base64.b64decode(token.split("=", 1)[1]).decode("utf-8"))
    return argv


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--map-path", required=True)
    parser.add_argument("--content-path", required=True)
    parser.add_argument("--scan-id")
    parser.add_argument("--scan-label")
    parser.add_argument("--min-materials", type=int, default=1)
    parser.add_argument("--min-textures", type=int, default=1)
    parser.add_argument("--min-semantic-placeholders", type=int, default=4)
    parser.add_argument("--require-collision", dest="require_collision", action="store_true")
    parser.add_argument("--no-require-collision", dest="require_collision", action="store_false")
    parser.add_argument("--require-nanite", action="store_true")
    parser.add_argument("--report-json")
    parser.set_defaults(require_collision=True)
    return parser.parse_args(command_args())


def asset_exists(path: str) -> bool:
    try:
        return bool(unreal.EditorAssetLibrary.does_asset_exist(path))
    except Exception:
        return bool(unreal.load_asset(path))


def load_level(level_path: str) -> None:
    level_subsystem = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    if level_subsystem and hasattr(level_subsystem, "load_level"):
        if not level_subsystem.load_level(level_path):
            fail(f"Could not load level {level_path}")
        return
    if hasattr(unreal, "EditorLevelLibrary") and hasattr(unreal.EditorLevelLibrary, "load_level"):
        if not unreal.EditorLevelLibrary.load_level(level_path):
            fail(f"Could not load level {level_path}")
        return
    fail("No editor level-loading API is available.")


def get_assets_by_path(path: str) -> list:
    registry = unreal.AssetRegistryHelpers.get_asset_registry()
    try:
        return list(registry.get_assets_by_path(path, recursive=True))
    except TypeError:
        return list(registry.get_assets_by_path(path, True))


def class_name(asset_data) -> str:
    try:
        return str(asset_data.asset_class_path.asset_name)
    except Exception:
        try:
            return str(asset_data.asset_class)
        except Exception:
            return ""


def package_name(asset_data) -> str:
    try:
        return str(asset_data.package_name)
    except Exception:
        try:
            return str(asset_data.object_path).split(".", 1)[0]
        except Exception:
            return ""


def load_asset(asset_data):
    try:
        return asset_data.get_asset()
    except Exception:
        path = package_name(asset_data)
        if not path:
            return None
        try:
            return unreal.EditorAssetLibrary.load_asset(path)
        except Exception:
            try:
                return unreal.load_asset(path)
            except Exception:
                return None


def all_level_actors() -> list:
    actor_subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    if actor_subsystem and hasattr(actor_subsystem, "get_all_level_actors"):
        return list(actor_subsystem.get_all_level_actors())
    if hasattr(unreal, "EditorLevelLibrary") and hasattr(unreal.EditorLevelLibrary, "get_all_level_actors"):
        return list(unreal.EditorLevelLibrary.get_all_level_actors())
    return []


def actor_label(actor) -> str:
    try:
        return actor.get_actor_label()
    except Exception:
        return actor.get_name()


def actor_class_name(actor) -> str:
    try:
        return actor.get_class().get_name()
    except Exception:
        return type(actor).__name__


def try_get_editor_property(obj, property_name: str, default=None):
    try:
        return obj.get_editor_property(property_name)
    except Exception:
        return default


def has_material_slots(static_mesh) -> bool:
    static_materials = try_get_editor_property(static_mesh, "static_materials", None)
    if static_materials:
        return True
    try:
        return static_mesh.get_num_sections(0) > 0
    except Exception:
        return False


def mesh_collision_configured(static_mesh) -> bool:
    body_setup = try_get_editor_property(static_mesh, "body_setup", None)
    if not body_setup:
        return False
    flag = try_get_editor_property(body_setup, "collision_trace_flag", None)
    if flag is not None:
        flag_text = str(flag)
        return "DEFAULT" not in flag_text.upper()
    try:
        return bool(body_setup.get_editor_property("agg_geom"))
    except Exception:
        return True


def mesh_nanite_enabled(static_mesh) -> bool:
    nanite_settings = try_get_editor_property(static_mesh, "nanite_settings", None)
    if not nanite_settings:
        return False
    enabled = try_get_editor_property(nanite_settings, "enabled", None)
    if enabled is None:
        enabled = try_get_editor_property(nanite_settings, "b_enabled", False)
    return bool(enabled)


def write_report(path: str | None, payload: dict) -> None:
    if not path:
        return
    report_path = Path(path)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def expected_scan_label(args) -> str:
    if args.scan_label:
        return args.scan_label
    if args.scan_id:
        return f"Scan_{args.scan_id}"
    return "Scan_horror_corridor"


def main() -> None:
    if unreal is None:
        fail("This script must run inside Unreal Editor Python.")

    args = parse_args()
    errors = []
    level_exists = asset_exists(args.map_path)
    if not level_exists:
        errors.append(f"Level asset missing: {args.map_path}")

    assets = get_assets_by_path(args.content_path)
    counts = {}
    assets_by_class = {}
    for asset in assets:
        cls = class_name(asset)
        counts[cls] = counts.get(cls, 0) + 1
        assets_by_class.setdefault(cls, []).append(asset)

    static_mesh_data = assets_by_class.get("StaticMesh", [])
    material_count = counts.get("MaterialInstanceConstant", 0) + counts.get("Material", 0)
    texture_count = counts.get("Texture2D", 0)
    static_meshes = [mesh for mesh in (load_asset(asset) for asset in static_mesh_data) if mesh]
    static_mesh_paths = [package_name(asset) for asset in static_mesh_data if package_name(asset)]
    material_paths = [
        package_name(asset)
        for cls in ("Material", "MaterialInstanceConstant")
        for asset in assets_by_class.get(cls, [])
        if package_name(asset)
    ]
    texture_paths = [package_name(asset) for asset in assets_by_class.get("Texture2D", []) if package_name(asset)]

    if len(static_mesh_data) < 1:
        errors.append(f"No StaticMesh assets found under {args.content_path}")
    materials_assigned = False
    if args.min_materials > 0:
        materials_assigned = material_count >= args.min_materials
    materials_assigned = materials_assigned or material_count > 0 or any(has_material_slots(mesh) for mesh in static_meshes)
    if not materials_assigned:
        errors.append(f"No material assets or material slots found under {args.content_path}")
    if texture_count < args.min_textures:
        errors.append(
            f"Expected at least {args.min_textures} Texture2D assets under {args.content_path}, found {texture_count}"
        )

    collision_configured = any(mesh_collision_configured(mesh) for mesh in static_meshes)
    if args.require_collision and not collision_configured:
        errors.append("No imported StaticMesh appears to have non-default collision configured")

    nanite_enabled = any(mesh_nanite_enabled(mesh) for mesh in static_meshes)
    if args.require_nanite and not nanite_enabled:
        errors.append("No imported StaticMesh appears to have Nanite enabled")

    actors = []
    labels = {}
    if level_exists:
        load_level(args.map_path)
        actors = all_level_actors()
        labels = {actor_label(actor): actor for actor in actors}

    scan_label = expected_scan_label(args)
    required_labels = [
        scan_label,
        "AdaptSim_PlayerStart",
        "AdaptSim_KeyLight",
        "AdaptSim_NavMeshBounds",
    ]
    for label in required_labels:
        if label not in labels:
            errors.append(f"Required level actor missing: {label}")

    semantic_placeholders = [
        actor for actor in actors if actor_label(actor).startswith("AdaptSim_Semantic_")
    ]
    if len(semantic_placeholders) < args.min_semantic_placeholders:
        errors.append(
            f"Expected at least {args.min_semantic_placeholders} semantic placeholders, "
            f"found {len(semantic_placeholders)}"
        )

    validation = {
        "level_exists": level_exists,
        "static_mesh_count": len(static_mesh_data),
        "materials_assigned": materials_assigned,
        "collision_configured": collision_configured,
        "nanite_enabled": nanite_enabled,
        "player_start_present": "AdaptSim_PlayerStart" in labels,
        "navmesh_bounds_present": "AdaptSim_NavMeshBounds" in labels,
        "semantic_placeholders_present": len(semantic_placeholders) >= args.min_semantic_placeholders,
    }
    actor_summary = [
        f"{actor_label(actor)}:{actor_class_name(actor)}"
        for actor in actors
        if actor_label(actor).startswith("AdaptSim_") or actor_label(actor).startswith("Scan_")
    ]
    write_report(
        args.report_json,
        {
            "status": "failed" if errors else "passed",
            "errors": errors,
            "map_path": args.map_path,
            "content_path": args.content_path,
            "scan_label": scan_label,
            "asset_counts": counts,
            "static_mesh_paths": static_mesh_paths,
            "material_paths": material_paths,
            "texture_paths": texture_paths,
            "required_actor_labels": required_labels,
            "present_actor_labels": sorted(labels),
            "semantic_placeholder_count": len(semantic_placeholders),
            "validation": validation,
        },
    )
    if errors:
        fail("; ".join(errors))

    log(f"Level exists: {args.map_path}")
    log(f"Asset counts under {args.content_path}: {counts}")
    log(f"Scaffold actors: {', '.join(sorted(actor_summary))}")
    log("Validation completed.")


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:
        if unreal:
            unreal.log_error(f"[AdaptSimValidate] Failed: {exc}")
        else:
            print(f"[AdaptSimValidate][ERROR] {exc}")
        raise
