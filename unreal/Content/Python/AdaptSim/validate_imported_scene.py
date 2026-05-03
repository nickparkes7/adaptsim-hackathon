#!/usr/bin/env python3
"""Validate an imported AdaptSim scene/map inside Unreal Editor Python."""

from __future__ import annotations

import argparse
import base64
import os
import shlex
import sys

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
    parser.add_argument("--min-semantic-placeholders", type=int, default=4)
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


def main() -> None:
    if unreal is None:
        fail("This script must run inside Unreal Editor Python.")

    args = parse_args()
    if not asset_exists(args.map_path):
        fail(f"Level asset missing: {args.map_path}")

    assets = get_assets_by_path(args.content_path)
    counts = {}
    for asset in assets:
        counts[class_name(asset)] = counts.get(class_name(asset), 0) + 1

    if counts.get("StaticMesh", 0) < 1:
        fail(f"No StaticMesh assets found under {args.content_path}")
    if counts.get("MaterialInstanceConstant", 0) + counts.get("Material", 0) < 1:
        fail(f"No material assets found under {args.content_path}")
    if counts.get("Texture2D", 0) < 1:
        fail(f"No Texture2D assets found under {args.content_path}")

    load_level(args.map_path)
    actors = all_level_actors()
    labels = {actor_label(actor): actor for actor in actors}
    required_labels = [
        "Scan_horror_corridor",
        "AdaptSim_PlayerStart",
        "AdaptSim_KeyLight",
        "AdaptSim_NavMeshBounds",
    ]
    for label in required_labels:
        if label not in labels:
            fail(f"Required level actor missing: {label}")

    semantic_placeholders = [
        actor for actor in actors if actor_label(actor).startswith("AdaptSim_Semantic_")
    ]
    if len(semantic_placeholders) < args.min_semantic_placeholders:
        fail(
            f"Expected at least {args.min_semantic_placeholders} semantic placeholders, "
            f"found {len(semantic_placeholders)}"
        )

    actor_summary = [
        f"{actor_label(actor)}:{actor_class_name(actor)}"
        for actor in actors
        if actor_label(actor).startswith("AdaptSim_") or actor_label(actor).startswith("Scan_")
    ]
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
