#!/usr/bin/env python3
"""Print selected Unreal material properties for debugging automation scripts."""

from __future__ import annotations

import os

import unreal


MATERIAL_PATH = os.environ.get(
    "ADAPTSIM_MATERIAL_PATH",
    "/Game/AdaptSim/Scans/safety_park_full_visual/Materials/M_SafetyParkFullVisual_DebugVisible",
)


def main() -> None:
    material = unreal.EditorAssetLibrary.load_asset(MATERIAL_PATH)
    if not material:
        raise RuntimeError(f"Could not load {MATERIAL_PATH}")
    unreal.log(f"[AdaptSimInspectMaterial] path={material.get_path_name()}")
    for prop in (
        "shading_model",
        "shading_models",
        "two_sided",
        "use_material_attributes",
        "blend_mode",
        "material_domain",
        "used_with_nanite",
        "b_used_with_nanite",
    ):
        try:
            unreal.log(f"[AdaptSimInspectMaterial] {prop}={material.get_editor_property(prop)}")
        except Exception as exc:
            unreal.log_warning(f"[AdaptSimInspectMaterial] {prop}: {exc}")

    editing = unreal.MaterialEditingLibrary
    for prop_name in ("MP_BASE_COLOR", "MP_EMISSIVE_COLOR", "MP_ROUGHNESS", "MP_METALLIC"):
        material_prop = getattr(unreal.MaterialProperty, prop_name, None)
        if material_prop is None:
            continue
        try:
            node = editing.get_material_property_input_node(material, material_prop)
            unreal.log(f"[AdaptSimInspectMaterial] {prop_name}_node={node.get_class().get_name() if node else None}")
        except Exception as exc:
            unreal.log_warning(f"[AdaptSimInspectMaterial] {prop_name}_node: {exc}")


if __name__ == "__main__":
    main()
