#!/usr/bin/env python3
"""Assign an unmistakable visible material to the Safety Park scan.

This is a diagnostic/fallback script for the Pixel Streaming scene. It avoids
lighting, texture, and vertex-color uncertainty so the audit can prove whether
the imported mesh itself is renderable.
"""

from __future__ import annotations

import os

import unreal


MAP_PATH = "/Game/AdaptSim/Maps/L_Reconstructed_safety_park"
SCAN_LABEL = "Scan_safety_park"
DEBUG_MATERIAL_PATH = "/Game/AdaptSim/Scans/safety_park_full_visual/Materials/M_SafetyParkFullVisual_DebugVisible"


def log(message: str) -> None:
    unreal.log(f"[AdaptSimSafetyParkDebugMaterial] {message}")


def warn(message: str) -> None:
    unreal.log_warning(f"[AdaptSimSafetyParkDebugMaterial] {message}")


def set_prop(obj, prop: str, value) -> bool:
    try:
        obj.set_editor_property(prop, value)
        return True
    except Exception:
        return False


def mark_dirty(obj) -> None:
    try:
        obj.mark_package_dirty()
    except Exception:
        pass
    try:
        obj.post_edit_change()
    except Exception:
        pass


def connect_property(editing, material, expression, material_property) -> bool:
    for output_name in ("", "RGB", "RGBA", "Color"):
        try:
            if not editing.connect_material_property(expression, output_name, material_property):
                continue
            if editing.get_material_property_input_node(material, material_property):
                return True
        except Exception:
            continue
    return False


def ensure_debug_material():
    material = unreal.EditorAssetLibrary.load_asset(DEBUG_MATERIAL_PATH)
    if not material:
        package_path, asset_name = DEBUG_MATERIAL_PATH.rsplit("/", 1)
        factory = unreal.MaterialFactoryNew()
        material = unreal.AssetToolsHelpers.get_asset_tools().create_asset(asset_name, package_path, unreal.Material, factory)
        if not material:
            raise RuntimeError(f"Could not create {DEBUG_MATERIAL_PATH}")

    editing = unreal.MaterialEditingLibrary
    try:
        editing.delete_all_material_expressions(material)
    except Exception as exc:
        warn(f"Could not clear material expressions: {exc}")

    set_prop(material, "two_sided", True)
    for prop in ("used_with_nanite", "b_used_with_nanite", "bUsedWithNanite", "use_with_nanite"):
        set_prop(material, prop, True)
    if hasattr(unreal, "MaterialShadingModel"):
        set_prop(material, "shading_model", unreal.MaterialShadingModel.MSM_UNLIT)

    color = editing.create_material_expression(material, unreal.MaterialExpressionConstant3Vector, -360, 0)
    set_prop(color, "constant", unreal.LinearColor(0.42, 0.68, 0.36, 1.0))
    if not connect_property(editing, material, color, unreal.MaterialProperty.MP_EMISSIVE_COLOR):
        raise RuntimeError("Could not connect debug color to emissive")
    connect_property(editing, material, color, unreal.MaterialProperty.MP_BASE_COLOR)

    roughness = editing.create_material_expression(material, unreal.MaterialExpressionConstant, -360, 180)
    set_prop(roughness, "r", 0.9)
    editing.connect_material_property(roughness, "", unreal.MaterialProperty.MP_ROUGHNESS)

    editing.layout_material_expressions(material)
    editing.recompile_material(material)
    mark_dirty(material)
    unreal.EditorAssetLibrary.save_loaded_asset(material, only_if_is_dirty=False)
    log(f"Ready material {material.get_path_name()}")
    return material


def disable_nanite(static_mesh) -> None:
    settings = static_mesh.get_editor_property("nanite_settings")
    changed = False
    for prop in ("enabled", "b_enabled"):
        changed = set_prop(settings, prop, False) or changed
    if hasattr(unreal, "EditorStaticMeshLibrary") and hasattr(unreal.EditorStaticMeshLibrary, "set_nanite_settings"):
        try:
            unreal.EditorStaticMeshLibrary.set_nanite_settings(static_mesh, settings, apply_changes=True)
        except TypeError:
            unreal.EditorStaticMeshLibrary.set_nanite_settings(static_mesh, settings, True)
    else:
        set_prop(static_mesh, "nanite_settings", settings)
    mark_dirty(static_mesh)
    unreal.EditorAssetLibrary.save_loaded_asset(static_mesh, only_if_is_dirty=False)
    log(f"Disabled Nanite on {static_mesh.get_path_name()} changed={changed}")


def load_level() -> None:
    subsystem = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    if subsystem and hasattr(subsystem, "load_level"):
        if subsystem.load_level(MAP_PATH):
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


def find_scan_actor():
    for actor in all_actors():
        if actor_label(actor) == SCAN_LABEL:
            return actor
    raise RuntimeError(f"Could not find {SCAN_LABEL}")


def main() -> None:
    material = ensure_debug_material()
    load_level()
    scan = find_scan_actor()
    component = scan.get_component_by_class(unreal.StaticMeshComponent)
    if not component:
        raise RuntimeError(f"{SCAN_LABEL} has no StaticMeshComponent")
    mesh = component.static_mesh
    if not mesh:
        raise RuntimeError(f"{SCAN_LABEL} has no static mesh")

    if os.environ.get("ADAPTSIM_DISABLE_NANITE", "").lower() in {"1", "true", "yes"}:
        disable_nanite(mesh)

    try:
        scan.set_actor_hidden_in_game(False)
        scan.set_is_temporarily_hidden_in_editor(False)
    except Exception:
        pass
    set_prop(scan, "hidden", False)
    set_prop(scan, "hidden_in_game", False)
    set_prop(component, "visible", True)
    set_prop(component, "hidden_in_game", False)

    static_materials = mesh.get_editor_property("static_materials")
    for static_material in static_materials:
        set_prop(static_material, "material_interface", material)
    for index in range(max(1, len(static_materials))):
        mesh.set_material(index, material)
        component.set_material(index, material)
    mark_dirty(mesh)
    mark_dirty(component)
    unreal.EditorAssetLibrary.save_loaded_asset(mesh, only_if_is_dirty=False)

    subsystem = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    if subsystem and hasattr(subsystem, "save_current_level"):
        subsystem.save_current_level()
    else:
        unreal.EditorLevelLibrary.save_current_level()
    log(f"Assigned debug material to {mesh.get_path_name()} and saved {MAP_PATH}")


if __name__ == "__main__":
    main()
