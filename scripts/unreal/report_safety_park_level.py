#!/usr/bin/env python3
"""Print Safety Park level actor, mesh, and camera state for render debugging."""

from __future__ import annotations

import unreal


MAP_PATH = "/Game/AdaptSim/Maps/L_Reconstructed_safety_park"


def log(message: str) -> None:
    unreal.log(f"[AdaptSimSafetyParkReport] {message}")


def load_level() -> None:
    subsystem = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    if subsystem and hasattr(subsystem, "load_level") and subsystem.load_level(MAP_PATH):
        return
    if unreal.EditorLevelLibrary.load_level(MAP_PATH):
        return
    raise RuntimeError(f"Could not load {MAP_PATH}")


def all_actors() -> list:
    subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    if subsystem and hasattr(subsystem, "get_all_level_actors"):
        return list(subsystem.get_all_level_actors())
    return list(unreal.EditorLevelLibrary.get_all_level_actors())


def actor_label(actor) -> str:
    try:
        return actor.get_actor_label()
    except Exception:
        return actor.get_name()


def bool_prop(obj, name: str):
    try:
        return obj.get_editor_property(name)
    except Exception:
        return "<missing>"


def component_bounds(component) -> str:
    try:
        origin, extent = component.get_local_bounds()
        return f"local_origin={origin} local_extent={extent}"
    except Exception as exc:
        return f"local_bounds_error={exc}"


def describe_actor(actor) -> None:
    label = actor_label(actor)
    loc = actor.get_actor_location()
    rot = actor.get_actor_rotation()
    scale = actor.get_actor_scale3d()
    hidden_game = bool_prop(actor, "hidden")
    hidden_editor = bool_prop(actor, "is_temporarily_hidden_in_editor")
    log(f"actor label={label} class={actor.get_class().get_name()} loc={loc} rot={rot} scale={scale} hidden={hidden_game} editor_hidden={hidden_editor}")
    component = actor.get_component_by_class(unreal.StaticMeshComponent)
    if component:
        mesh = component.static_mesh
        visible = bool_prop(component, "visible")
        hidden_component = bool_prop(component, "hidden_in_game")
        material = component.get_material(0) if component.get_num_materials() else None
        mesh_path = mesh.get_path_name() if mesh else "None"
        material_path = material.get_path_name() if material else "None"
        log(f"  component visible={visible} hidden_in_game={hidden_component} mesh={mesh_path} material={material_path} {component_bounds(component)}")
        if mesh:
            try:
                bounds = mesh.get_bounds()
                log(f"  mesh bounds origin={bounds.origin} extent={bounds.box_extent} sphere={bounds.sphere_radius}")
            except Exception as exc:
                log(f"  mesh bounds error={exc}")


def main() -> None:
    load_level()
    for actor in all_actors():
        label = actor_label(actor)
        if label.startswith("Scan_") or label.startswith("AdaptSim_"):
            describe_actor(actor)


if __name__ == "__main__":
    main()
