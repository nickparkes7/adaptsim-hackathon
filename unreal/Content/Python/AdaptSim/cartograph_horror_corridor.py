#!/usr/bin/env python3
"""Inspect and export the AdaptSim horror corridor semantic environment.

Run inside Unreal Editor Python. This intentionally supports TargetPoint
semantic placeholders because spawning ASemanticAnchor from null-RHI editor
runs has crashed on the current UE 5.7.4 Linux VM.
"""

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


DEFAULT_MAP_PATH = "/Game/AdaptSim/Maps/L_HorrorCorridor_Imported"
DEFAULT_CONTENT_PATH = "/Game/AdaptSim/Imported/horror_corridor"
DEFAULT_ENVIRONMENT_ID = "horror_corridor_imported"
DEFAULT_SOURCE_SCAN_ID = "horror_corridor_vr_room_baked"

SEMANTIC_ANCHOR_DEFS = [
    {
        "id": "entry",
        "display_name": "Entry",
        "type": "entry_point",
        "label": "AdaptSim_Semantic_Entry",
        "tags": ["entry_point", "hallway"],
        "links": ["hallway_center", "doorway"],
        "extent_m": [1.0, 1.0, 2.0],
        "notes": "Entry marker for the imported horror corridor scene.",
    },
    {
        "id": "exit",
        "display_name": "Exit",
        "type": "exit",
        "label": "AdaptSim_Semantic_Exit",
        "tags": ["exit", "hallway", "fallback_route"],
        "links": ["hallway_center", "chokepoint"],
        "extent_m": [1.0, 1.0, 2.0],
        "notes": "Exit marker for scenario goals and retreat routes.",
    },
    {
        "id": "hallway_center",
        "display_name": "Hallway Center",
        "type": "hallway",
        "label": "AdaptSim_Semantic_HallwayCenter",
        "tags": ["hallway", "navigation", "near_chokepoint"],
        "links": ["entry", "exit", "doorway", "cover", "chokepoint"],
        "extent_m": [2.5, 1.2, 2.2],
        "notes": "Central corridor anchor for routing, triggers, and visibility tests.",
    },
    {
        "id": "doorway",
        "display_name": "Doorway",
        "type": "door",
        "label": "AdaptSim_Semantic_Doorway",
        "tags": ["door", "transition", "near_chokepoint"],
        "links": ["entry", "hallway_center"],
        "extent_m": [1.0, 0.25, 2.1],
        "notes": "Doorway or threshold marker for breach and transition scenarios.",
    },
    {
        "id": "cover",
        "display_name": "Cover",
        "type": "cover",
        "label": "AdaptSim_Semantic_Cover",
        "tags": ["cover", "concealment", "spawnable"],
        "links": ["hallway_center", "ambush_point"],
        "extent_m": [1.2, 0.8, 1.0],
        "notes": "Cover affordance placeholder; verify final cover geometry visually before production use.",
    },
    {
        "id": "ambush_point",
        "display_name": "Ambush Point",
        "type": "spawn_zone",
        "label": "AdaptSim_Semantic_AmbushPoint",
        "tags": ["spawn_zone", "ambush_point", "adversary", "concealment"],
        "links": ["cover", "chokepoint", "observation_point"],
        "extent_m": [1.5, 1.5, 2.0],
        "notes": "Adversary spawn and ambush anchor for ScenarioDirector tests.",
    },
    {
        "id": "observation_point",
        "display_name": "Observation Point",
        "type": "line_of_sight",
        "label": "AdaptSim_Semantic_ObservationPoint",
        "tags": ["line_of_sight", "observation_point"],
        "links": ["hallway_center", "ambush_point"],
        "extent_m": [1.0, 1.0, 2.0],
        "notes": "Observation marker for line-of-sight and AAR camera work.",
    },
    {
        "id": "chokepoint",
        "display_name": "Chokepoint",
        "type": "chokepoint",
        "label": "AdaptSim_Semantic_Chokepoint",
        "tags": ["chokepoint", "near_cover", "near_chokepoint"],
        "links": ["hallway_center", "exit", "ambush_point"],
        "extent_m": [1.2, 1.0, 2.2],
        "notes": "Narrow-passage marker for trainee-entered triggers and adversary placement constraints.",
    },
]


def log(message: str) -> None:
    if unreal:
        unreal.log(f"[AdaptSimCartographer] {message}")
    else:
        print(f"[AdaptSimCartographer] {message}")


def fail(message: str) -> None:
    if unreal:
        unreal.log_error(f"[AdaptSimCartographer] {message}")
    raise RuntimeError(message)


def command_args() -> list[str]:
    env_args_b64 = os.environ.get("ADAPTSIM_CARTOGRAPHER_ARGS_B64")
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

    marker = "-AdaptSimCartographerArgsB64"
    for index, token in enumerate(tokens):
        if token == marker and index + 1 < len(tokens):
            return shlex.split(base64.b64decode(tokens[index + 1]).decode("utf-8"))
        if token.startswith(f"{marker}="):
            return shlex.split(base64.b64decode(token.split("=", 1)[1]).decode("utf-8"))
    return argv


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--map-path", default=DEFAULT_MAP_PATH)
    parser.add_argument("--content-path", default=DEFAULT_CONTENT_PATH)
    parser.add_argument("--environment-id", default=DEFAULT_ENVIRONMENT_ID)
    parser.add_argument("--source-scan-id", default=DEFAULT_SOURCE_SCAN_ID)
    parser.add_argument("--output")
    parser.add_argument("--report-output")
    parser.add_argument("--validate-only", action="store_true")
    return parser.parse_args(command_args())


def project_saved_path(*parts: str) -> str:
    if unreal:
        return str(Path(unreal.Paths.project_saved_dir()).joinpath(*parts))
    return str(Path("Saved").joinpath(*parts))


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


def vector_to_list(value) -> list[float]:
    return [round(float(value.x), 3), round(float(value.y), 3), round(float(value.z), 3)]


def rotator_to_list(value) -> list[float]:
    return [round(float(value.pitch), 3), round(float(value.yaw), 3), round(float(value.roll), 3)]


def location_m(actor) -> list[float]:
    loc = actor.get_actor_location()
    return [round(float(loc.x) * 0.01, 3), round(float(loc.y) * 0.01, 3), round(float(loc.z) * 0.01, 3)]


def rotation_deg(actor) -> list[float]:
    return rotator_to_list(actor.get_actor_rotation())


def actor_tags(actor) -> list[str]:
    try:
        return [str(tag) for tag in actor.get_editor_property("tags")]
    except Exception:
        try:
            return [str(tag) for tag in actor.tags]
        except Exception:
            return []


def get_assets_by_path(path: str) -> list:
    registry = unreal.AssetRegistryHelpers.get_asset_registry()
    try:
        return list(registry.get_assets_by_path(path, recursive=True))
    except TypeError:
        return list(registry.get_assets_by_path(path, True))


def asset_class_name(asset_data) -> str:
    try:
        return str(asset_data.asset_class_path.asset_name)
    except Exception:
        try:
            return str(asset_data.asset_class)
        except Exception:
            return ""


def find_component(actor, component_class):
    try:
        return actor.get_component_by_class(component_class)
    except Exception:
        return None


def enum_or_value(value) -> str:
    text = str(value)
    if "::" in text:
        return text.rsplit("::", 1)[1]
    return text


def inspect_mesh(scan_actor) -> dict:
    result = {
        "label": actor_label(scan_actor) if scan_actor else None,
        "class": actor_class_name(scan_actor) if scan_actor else None,
        "static_mesh": None,
        "materials": [],
        "component_collision_profile": None,
        "component_collision_enabled": None,
        "mesh_collision_trace_flag": None,
        "nanite_enabled": None,
        "bounds_origin_cm": None,
        "bounds_extent_cm": None,
    }
    if not scan_actor:
        return result

    component_class = getattr(unreal, "StaticMeshComponent", None)
    component = find_component(scan_actor, component_class) if component_class else None
    if not component:
        return result

    try:
        mesh = component.get_editor_property("static_mesh")
    except Exception:
        mesh = None

    if mesh:
        try:
            result["static_mesh"] = mesh.get_path_name()
        except Exception:
            result["static_mesh"] = mesh.get_name()

        try:
            materials = mesh.get_editor_property("static_materials")
            for material_slot in materials:
                material_interface = material_slot.get_editor_property("material_interface")
                if material_interface:
                    result["materials"].append(material_interface.get_path_name())
        except Exception:
            pass

        try:
            body_setup = mesh.get_editor_property("body_setup")
            if body_setup:
                result["mesh_collision_trace_flag"] = enum_or_value(
                    body_setup.get_editor_property("collision_trace_flag")
                )
        except Exception:
            pass

        try:
            nanite_settings = mesh.get_editor_property("nanite_settings")
            result["nanite_enabled"] = bool(nanite_settings.get_editor_property("enabled"))
        except Exception:
            pass

    try:
        result["component_collision_profile"] = str(component.get_editor_property("collision_profile_name"))
    except Exception:
        pass
    try:
        result["component_collision_enabled"] = enum_or_value(component.get_editor_property("collision_enabled"))
    except Exception:
        pass
    try:
        origin, extent = component.get_local_bounds()
        result["bounds_origin_cm"] = vector_to_list(origin)
        result["bounds_extent_cm"] = vector_to_list(extent)
    except Exception:
        pass

    return result


def make_anchor_record(actor, definition: dict) -> dict:
    tags = []
    for tag in [definition["type"], *definition["tags"]]:
        if tag not in tags:
            tags.append(tag)

    return {
        "contract_type": "semantic_anchor",
        "schema_version": "1.0",
        "anchor_id": definition["id"],
        "anchor_type": definition["type"],
        "display_name": definition["display_name"],
        "tags": tags,
        "transform": {
            "location_m": location_m(actor),
            "rotation_deg": rotation_deg(actor),
        },
        "extent_m": definition["extent_m"],
        "navmesh_reachable": True,
        "linked_anchor_ids": definition["links"],
        "notes": definition["notes"],
    }


def graph_edges(anchors: list[dict]) -> list[dict]:
    anchors_by_id = {anchor["anchor_id"]: anchor for anchor in anchors}
    edges = []
    seen = set()
    for anchor in anchors:
        from_id = anchor["anchor_id"]
        from_location = anchor["transform"]["location_m"]
        for to_id in anchor["linked_anchor_ids"]:
            edge_key = (from_id, to_id)
            if edge_key in seen:
                continue
            seen.add(edge_key)
            edge = {
                "from_anchor_id": from_id,
                "to_anchor_id": to_id,
                "relation": "connects",
            }
            linked = anchors_by_id.get(to_id)
            if linked:
                to_location = linked["transform"]["location_m"]
                edge["distance_m"] = round(
                    sum((from_location[i] - to_location[i]) ** 2 for i in range(3)) ** 0.5,
                    3,
                )
            edges.append(edge)
    return edges


def validate_contract_shape(environment: dict) -> list[str]:
    warnings = []
    anchor_ids = [anchor["anchor_id"] for anchor in environment["anchors"]]
    duplicate_ids = sorted({anchor_id for anchor_id in anchor_ids if anchor_ids.count(anchor_id) > 1})
    if duplicate_ids:
        warnings.append(f"duplicate anchor IDs: {duplicate_ids}")
    anchor_set = set(anchor_ids)
    for anchor in environment["anchors"]:
        if anchor["anchor_type"] not in anchor["tags"]:
            warnings.append(f"{anchor['anchor_id']} tags do not include anchor_type")
        for linked_anchor_id in anchor["linked_anchor_ids"]:
            if linked_anchor_id not in anchor_set:
                warnings.append(f"{anchor['anchor_id']} links to unknown anchor {linked_anchor_id}")
    return warnings


def main() -> None:
    if unreal is None:
        fail("This script must run inside Unreal Editor Python.")

    args = parse_args()
    output = args.output or project_saved_path("SemanticExports", "horror_corridor_imported.json")
    report_output = args.report_output or project_saved_path("SemanticExports", "horror_corridor_imported_report.json")

    if not unreal.EditorAssetLibrary.does_asset_exist(args.map_path):
        fail(f"Level asset missing: {args.map_path}")

    assets = get_assets_by_path(args.content_path)
    asset_counts = {}
    for asset in assets:
        class_name = asset_class_name(asset)
        asset_counts[class_name] = asset_counts.get(class_name, 0) + 1

    load_level(args.map_path)
    actors = all_level_actors()
    labels = {actor_label(actor): actor for actor in actors}

    required_labels = [
        "Scan_horror_corridor",
        "AdaptSim_PlayerStart",
        "AdaptSim_KeyLight",
        "AdaptSim_DemoCamera",
        "AdaptSim_NavMeshBounds",
    ]
    missing = [label for label in required_labels if label not in labels]
    if missing:
        fail(f"Required level actors missing: {missing}")

    anchors = []
    anchor_actor_summaries = []
    for definition in SEMANTIC_ANCHOR_DEFS:
        actor = labels.get(definition["label"])
        if not actor:
            fail(f"Semantic placeholder missing: {definition['label']}")
        anchors.append(make_anchor_record(actor, definition))
        anchor_actor_summaries.append(
            {
                "label": definition["label"],
                "actor_name": actor.get_name(),
                "actor_class": actor_class_name(actor),
                "actor_tags": actor_tags(actor),
                "anchor_id": definition["id"],
                "semantic_role": definition["type"],
                "location_cm": vector_to_list(actor.get_actor_location()),
                "rotation_deg": rotation_deg(actor),
            }
        )

    environment = {
        "contract_type": "semantic_environment",
        "schema_version": "1.0",
        "environment_id": args.environment_id,
        "source_scan_id": args.source_scan_id,
        "unreal_level_path": args.map_path,
        "coordinate_frame": "unreal_world_m",
        "units": "meters",
        "anchors": anchors,
        "graph_edges": graph_edges(anchors),
    }

    warnings = validate_contract_shape(environment)
    if warnings:
        fail("; ".join(warnings))

    adapt_sim_actor_summary = [
        {
            "label": actor_label(actor),
            "actor_name": actor.get_name(),
            "actor_class": actor_class_name(actor),
            "location_cm": vector_to_list(actor.get_actor_location()),
            "rotation_deg": rotation_deg(actor),
            "tags": actor_tags(actor),
        }
        for actor in actors
        if actor_label(actor).startswith("AdaptSim_") or actor_label(actor).startswith("Scan_")
    ]
    adapt_sim_actor_summary.sort(key=lambda item: item["label"])

    report = {
        "map_path": args.map_path,
        "content_path": args.content_path,
        "asset_counts": asset_counts,
        "scan_mesh": inspect_mesh(labels.get("Scan_horror_corridor")),
        "scaffold_actors": adapt_sim_actor_summary,
        "semantic_anchor_actor_kind": sorted({item["actor_class"] for item in anchor_actor_summaries}),
        "semantic_anchors": anchor_actor_summaries,
        "json_output": output,
        "validation": {
            "required_actor_labels_present": required_labels,
            "semantic_anchor_count": len(anchors),
            "contract_shape": "ok",
        },
    }

    if args.validate_only:
        log(f"Validation completed without writing JSON. Anchors: {len(anchors)}")
        return

    Path(output).parent.mkdir(parents=True, exist_ok=True)
    Path(report_output).parent.mkdir(parents=True, exist_ok=True)
    Path(output).write_text(json.dumps(environment, indent=2) + "\n", encoding="utf-8")
    Path(report_output).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    log(f"Level exists: {args.map_path}")
    log(f"Asset counts under {args.content_path}: {asset_counts}")
    log(f"Semantic anchors exported: {len(anchors)} ({', '.join(sorted(set(item['actor_class'] for item in anchor_actor_summaries)))})")
    log(f"Wrote semantic_environment JSON to {output}")
    log(f"Wrote cartography report JSON to {report_output}")


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:
        if unreal:
            unreal.log_error(f"[AdaptSimCartographer] Failed: {exc}")
        else:
            print(f"[AdaptSimCartographer][ERROR] {exc}")
        raise
