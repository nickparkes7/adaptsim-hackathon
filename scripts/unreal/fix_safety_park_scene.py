#!/usr/bin/env python3
"""Pin the safety park map to the corrected visual mesh/material."""

from __future__ import annotations

import math

import unreal


MAP_PATH = "/Game/AdaptSim/Maps/L_Reconstructed_safety_park"
SPLAT_RAW_MESH_PATH = "/Game/AdaptSim/Scans/safety_park_splat_raw/scene_mesh_splat_raw_240k_unreal_axes/StaticMeshes/SM_SafetyParkSplatRaw"
SPLAT_RAW_MATERIAL_PATH = "/Game/AdaptSim/Scans/safety_park_splat_raw/Materials/M_SafetyParkSplatRaw_VertexColor"
SPLAT_LIT_MESH_PATH = "/Game/AdaptSim/Scans/safety_park_splat_lit/scene_mesh_splat_lit_180k_unreal_axes/StaticMeshes/SM_SafetyParkSplatLit"
SPLAT_LIT_MATERIAL_PATH = "/Game/AdaptSim/Scans/safety_park_splat_lit/Materials/M_SafetyParkSplatLit_VertexColor"
SPLAT_BIG_MESH_PATH = "/Game/AdaptSim/Scans/safety_park_splat_big/scene_mesh_splat_big_120k_unreal_axes/StaticMeshes/SM_SafetyParkSplatBig"
SPLAT_BIG_MATERIAL_PATH = "/Game/AdaptSim/Scans/safety_park_splat_big/Materials/M_SafetyParkSplatBig_VertexColor"
SPLAT_MESH_PATH = "/Game/AdaptSim/Scans/safety_park_splat_visual/scene_mesh_splat_120k_unreal_axes/StaticMeshes/SM_SafetyParkSplatVisual"
SPLAT_MATERIAL_PATH = "/Game/AdaptSim/Scans/safety_park_splat_visual/Materials/M_SafetyParkSplatVisual_VertexColor"
FULL_MESH_PATH = "/Game/AdaptSim/Scans/safety_park_full_visual/scene_mesh_full_unreal_axes/StaticMeshes/SM_SafetyParkFullVisual"
FULL_MATERIAL_PATH = "/Game/AdaptSim/Scans/safety_park_full_visual/Materials/M_SafetyParkFullVisual_VertexColor"
RUNTIME_MESH_PATH = "/Game/AdaptSim/Scans/safety_park_runtime_nanite/scene_mesh_runtime_1200k_unreal_axes/StaticMeshes/SM_SafetyParkRuntimeNanite"
RUNTIME_MATERIAL_PATH = "/Game/AdaptSim/Scans/safety_park_runtime_nanite/Materials/M_SafetyParkRuntimeNanite_VertexColor"
DECIMATED_MESH_PATH = "/Game/AdaptSim/Scans/safety_park/scene_mesh_decimated_unreal_axes/StaticMeshes/SM_SafetyPark"
DECIMATED_MATERIAL_PATH = "/Game/AdaptSim/Scans/safety_park/Materials/M_SafetyPark_VertexColor"
SKY_BACKDROP_MATERIAL_PATH = "/Game/AdaptSim/Materials/M_AdaptSim_SafetyPark_SkyBackdrop"
SKY_BACKDROP_MESH_CANDIDATES = (
    "/Engine/EngineSky/SM_SkySphere",
    "/Engine/MapTemplates/Sky/SM_SkySphere",
    "/Engine/BasicShapes/Sphere",
    "/Engine/EngineMeshes/Sphere",
)
ENGINE_SKY_MATERIAL_CANDIDATES = (
    "/Engine/EngineSky/M_SimpleSkyDome",
    "/Engine/EngineSky/M_Sky_Panning_Clouds2",
    "/Engine/MapTemplates/Sky/M_Procedural_Sky_Daytime",
    "/Engine/EditorMaterials/AssetViewer/M_SkyBox",
)
SKY_BACKDROP_PLANE_MESH_CANDIDATES = (
    "/Engine/BasicShapes/Plane",
    "/Engine/EngineMeshes/Plane",
)
VERTEX_COLOR_EMISSIVE_MULTIPLIER = 220.0
ENABLE_EXPLICIT_SKY_BACKDROP = False
COLLISION_FLOOR_LABEL = "AdaptSim_CollisionFloor"


def log(message: str) -> None:
    unreal.log(f"[AdaptSimSafetyParkFix] {message}")


def warn(message: str) -> None:
    unreal.log_warning(f"[AdaptSimSafetyParkFix] {message}")


def load_asset(path: str):
    asset = unreal.EditorAssetLibrary.load_asset(path)
    if not asset:
        raise RuntimeError(f"Could not load asset {path}")
    return asset


def choose_visual_assets() -> tuple[str, str, bool]:
    if unreal.EditorAssetLibrary.does_asset_exist(SPLAT_RAW_MESH_PATH):
        return SPLAT_RAW_MESH_PATH, SPLAT_RAW_MATERIAL_PATH, False
    if unreal.EditorAssetLibrary.does_asset_exist(SPLAT_LIT_MESH_PATH):
        return SPLAT_LIT_MESH_PATH, SPLAT_LIT_MATERIAL_PATH, False
    if unreal.EditorAssetLibrary.does_asset_exist(SPLAT_BIG_MESH_PATH):
        return SPLAT_BIG_MESH_PATH, SPLAT_BIG_MATERIAL_PATH, False
    if unreal.EditorAssetLibrary.does_asset_exist(SPLAT_MESH_PATH):
        return SPLAT_MESH_PATH, SPLAT_MATERIAL_PATH, False
    if unreal.EditorAssetLibrary.does_asset_exist(RUNTIME_MESH_PATH):
        return RUNTIME_MESH_PATH, RUNTIME_MATERIAL_PATH, True
    if unreal.EditorAssetLibrary.does_asset_exist(FULL_MESH_PATH):
        return FULL_MESH_PATH, FULL_MATERIAL_PATH, True
    return DECIMATED_MESH_PATH, DECIMATED_MATERIAL_PATH, False


def make_rotator(pitch: float, yaw: float, roll: float = 0.0):
    return unreal.Rotator(float(roll), float(pitch), float(yaw))


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


def add_actor_tag(actor, tag: str) -> None:
    try:
        tags = list(actor.get_editor_property("tags"))
        name = unreal.Name(tag) if hasattr(unreal, "Name") else tag
        if name not in tags and tag not in [str(existing) for existing in tags]:
            tags.append(name)
            actor.set_editor_property("tags", tags)
            mark_dirty(actor)
    except Exception as exc:
        warn(f"Could not tag {actor_label(actor)} with {tag}: {exc}")


def connect_property(editing, material, expression, material_property) -> bool:
    for output_name in ("", "RGB", "RGBA", "Color"):
        try:
            if not editing.connect_material_property(expression, output_name, material_property):
                continue
            node = editing.get_material_property_input_node(material, material_property)
            if node:
                return True
        except Exception:
            continue
    return False


def connect_expression(editing, source, target, target_input: str) -> bool:
    for output_name in ("", "RGB", "RGBA", "Color"):
        try:
            if editing.connect_material_expressions(source, output_name, target, target_input):
                return True
        except Exception:
            continue
    return False


def configure_vertex_color_material(material_path: str):
    material = load_asset(material_path)
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

    vertex = editing.create_material_expression(material, unreal.MaterialExpressionVertexColor, -560, 0)
    emissive = vertex
    multiply_class = getattr(unreal, "MaterialExpressionMultiply", None)
    if multiply_class:
        multiplier = editing.create_material_expression(material, unreal.MaterialExpressionConstant, -560, 180)
        set_prop(multiplier, "r", VERTEX_COLOR_EMISSIVE_MULTIPLIER)
        multiply = editing.create_material_expression(material, multiply_class, -280, 0)
        if connect_expression(editing, vertex, multiply, "A") and connect_expression(editing, multiplier, multiply, "B"):
            emissive = multiply
        else:
            warn("Could not wire emissive multiplier; falling back to direct vertex color")
    if not connect_property(editing, material, emissive, unreal.MaterialProperty.MP_EMISSIVE_COLOR):
        raise RuntimeError("Could not connect VertexColor to emissive color")
    connect_property(editing, material, vertex, unreal.MaterialProperty.MP_BASE_COLOR)

    roughness = editing.create_material_expression(material, unreal.MaterialExpressionConstant, -360, 180)
    set_prop(roughness, "r", 0.85)
    editing.connect_material_property(roughness, "", unreal.MaterialProperty.MP_ROUGHNESS)

    metallic = editing.create_material_expression(material, unreal.MaterialExpressionConstant, -360, 320)
    set_prop(metallic, "r", 0.0)
    editing.connect_material_property(metallic, "", unreal.MaterialProperty.MP_METALLIC)

    editing.layout_material_expressions(material)
    editing.recompile_material(material)
    mark_dirty(material)
    unreal.EditorAssetLibrary.save_loaded_asset(material, only_if_is_dirty=False)
    log(f"Configured material {material_path}")
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
    if changed:
        mark_dirty(static_mesh)
        unreal.EditorAssetLibrary.save_loaded_asset(static_mesh, only_if_is_dirty=False)
    log(f"Nanite disabled on {static_mesh.get_path_name()}")


def assign_mesh_material(static_mesh, material) -> None:
    static_materials = static_mesh.get_editor_property("static_materials")
    for static_material in static_materials:
        set_prop(static_material, "material_interface", material)
    for index in range(max(1, len(static_materials))):
        static_mesh.set_material(index, material)
    mark_dirty(static_mesh)
    unreal.EditorAssetLibrary.save_loaded_asset(static_mesh, only_if_is_dirty=False)
    log(f"Assigned material to {static_mesh.get_path_name()}")


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


def find_actor(label: str):
    for actor in all_actors():
        if actor_label(actor) == label:
            return actor
    return None


def spawn_actor(actor_class, location, rotation, label: str):
    actor = None
    if hasattr(unreal, "EditorLevelLibrary"):
        actor = unreal.EditorLevelLibrary.spawn_actor_from_class(actor_class, unreal.Vector(*location), rotation)
    if not actor:
        subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
        if subsystem and hasattr(subsystem, "spawn_actor_from_class"):
            actor = subsystem.spawn_actor_from_class(actor_class, unreal.Vector(*location), rotation)
    if not actor:
        raise RuntimeError(f"Could not spawn {label}")
    try:
        actor.set_actor_label(label, mark_dirty=False)
    except TypeError:
        actor.set_actor_label(label)
    except Exception:
        pass
    return actor


def first_component(actor, component_class):
    try:
        return actor.get_component_by_class(component_class)
    except Exception:
        return None


def look_yaw(source, target) -> float:
    return math.degrees(math.atan2(target[1] - source[1], target[0] - source[0]))


def set_actor_location_rotation(actor, location, rotation) -> None:
    try:
        actor.set_actor_location(unreal.Vector(*location), sweep=False, teleport=True)
    except TypeError:
        actor.set_actor_location(unreal.Vector(*location), False, True)
    try:
        actor.set_actor_rotation(rotation, teleport_physics=True)
    except TypeError:
        actor.set_actor_rotation(rotation, True)


def configure_visual_post_process() -> None:
    volume = find_actor("AdaptSim_VisualPostProcess")
    if not volume:
        volume = spawn_actor(unreal.PostProcessVolume, (0.0, 0.0, 0.0), make_rotator(0.0, 0.0, 0.0), "AdaptSim_VisualPostProcess")
    set_prop(volume, "b_enabled", True)
    set_prop(volume, "enabled", True)
    set_prop(volume, "b_unbound", True)
    set_prop(volume, "unbound", True)
    set_prop(volume, "blend_weight", 1.0)
    settings = volume.get_editor_property("settings")

    auto_exposure = getattr(unreal, "AutoExposureMethod", None)
    if auto_exposure and hasattr(auto_exposure, "AEM_MANUAL"):
        set_prop(settings, "override_auto_exposure_method", True)
        set_prop(settings, "auto_exposure_method", auto_exposure.AEM_MANUAL)
    for prop, value in (
        ("override_auto_exposure_bias", True),
        ("auto_exposure_bias", 0.0),
        ("override_auto_exposure_min_brightness", True),
        ("auto_exposure_min_brightness", 1.0),
        ("override_auto_exposure_max_brightness", True),
        ("auto_exposure_max_brightness", 1.0),
        ("override_bloom_intensity", True),
        ("bloom_intensity", 0.0),
        ("override_vignette_intensity", True),
        ("vignette_intensity", 0.0),
    ):
        set_prop(settings, prop, value)
    if hasattr(unreal, "Vector4"):
        set_prop(settings, "override_color_saturation", True)
        set_prop(settings, "color_saturation", unreal.Vector4(1.0, 1.0, 1.0, 1.0))
        set_prop(settings, "override_color_contrast", True)
        set_prop(settings, "color_contrast", unreal.Vector4(1.0, 1.0, 1.0, 1.0))
    set_prop(volume, "settings", settings)
    mark_dirty(volume)
    log("Configured manual exposure and color stabilization")


def ensure_sky_backdrop_material():
    material = unreal.EditorAssetLibrary.load_asset(SKY_BACKDROP_MATERIAL_PATH)
    if not material:
        package_path, asset_name = SKY_BACKDROP_MATERIAL_PATH.rsplit("/", 1)
        factory = unreal.MaterialFactoryNew()
        material = unreal.AssetToolsHelpers.get_asset_tools().create_asset(asset_name, package_path, unreal.Material, factory)
        if not material:
            raise RuntimeError(f"Could not create {SKY_BACKDROP_MATERIAL_PATH}")

    editing = unreal.MaterialEditingLibrary
    try:
        editing.delete_all_material_expressions(material)
    except Exception as exc:
        warn(f"Could not clear sky material expressions: {exc}")

    set_prop(material, "two_sided", True)
    if hasattr(unreal, "MaterialShadingModel"):
        set_prop(material, "shading_model", unreal.MaterialShadingModel.MSM_UNLIT)

    color = editing.create_material_expression(material, unreal.MaterialExpressionConstant3Vector, -360, 0)
    set_prop(color, "constant", unreal.LinearColor(0.35, 0.50, 0.72, 1.0))
    if not connect_property(editing, material, color, unreal.MaterialProperty.MP_EMISSIVE_COLOR):
        raise RuntimeError("Could not connect sky backdrop color to emissive")
    connect_property(editing, material, color, unreal.MaterialProperty.MP_BASE_COLOR)

    editing.layout_material_expressions(material)
    editing.recompile_material(material)
    mark_dirty(material)
    unreal.EditorAssetLibrary.save_loaded_asset(material, only_if_is_dirty=False)
    return material


def load_first_asset(paths: tuple[str, ...]):
    for path in paths:
        asset = unreal.EditorAssetLibrary.load_asset(path)
        if asset:
            return asset
    return None


def choose_sky_backdrop_material():
    material = load_first_asset(ENGINE_SKY_MATERIAL_CANDIDATES)
    if material:
        return material
    warn("No engine sky material found; falling back to generated flat sky material")
    return ensure_sky_backdrop_material()


def configure_sky_backdrop() -> None:
    if not ENABLE_EXPLICIT_SKY_BACKDROP:
        for actor in all_actors():
            if not actor_label(actor).startswith("AdaptSim_SkyBackdrop"):
                continue
            try:
                actor.set_actor_hidden_in_game(True)
                actor.set_is_temporarily_hidden_in_editor(True)
            except Exception:
                pass
            component = first_component(actor, unreal.StaticMeshComponent)
            if component:
                set_prop(component, "visible", False)
                set_prop(component, "hidden_in_game", True)
                component.set_collision_enabled(unreal.CollisionEnabled.NO_COLLISION)
                mark_dirty(component)
            mark_dirty(actor)
        log("Disabled explicit sky backdrop actors; scan reconstruction remains the authoritative visual context")
        return

    sky_mesh = load_first_asset(SKY_BACKDROP_MESH_CANDIDATES)
    sky_material = choose_sky_backdrop_material()
    if not sky_mesh:
        warn("No engine sphere mesh found for sky backdrop")
    else:
        backdrop = find_actor("AdaptSim_SkyBackdrop")
        if not backdrop:
            backdrop = spawn_actor(unreal.StaticMeshActor, (0.0, 0.0, 0.0), make_rotator(0.0, 0.0, 0.0), "AdaptSim_SkyBackdrop")

        component = first_component(backdrop, unreal.StaticMeshComponent)
        if component:
            component.set_static_mesh(sky_mesh)
            component.set_material(0, sky_material)
            component.set_collision_profile_name("NoCollision")
            component.set_collision_enabled(unreal.CollisionEnabled.NO_COLLISION)
            try:
                component.set_can_ever_affect_navigation(False)
            except Exception:
                set_prop(component, "can_ever_affect_navigation", False)
            set_prop(component, "visible", True)
            set_prop(component, "hidden_in_game", False)
            try:
                backdrop.set_actor_hidden_in_game(False)
                backdrop.set_is_temporarily_hidden_in_editor(False)
            except Exception:
                pass
            set_actor_location_rotation(backdrop, (-175.0, 1018.75, 3000.0), make_rotator(0.0, 0.0, 0.0))
            backdrop.set_actor_scale3d(unreal.Vector(800.0, 800.0, 800.0))
            mark_dirty(component)
            mark_dirty(backdrop)
            log(f"Configured deterministic sky sphere with {sky_mesh.get_path_name()} and {sky_material.get_path_name()}")
        else:
            warn("Sky backdrop has no StaticMeshComponent")

    plane_mesh = load_first_asset(SKY_BACKDROP_PLANE_MESH_CANDIDATES)
    if not plane_mesh:
        warn("No engine plane mesh found for sky backdrop panels")
        return

    center_x = -175.0
    center_y = 1018.75
    wall_z = 20000.0
    distance = 42000.0
    scale = (900.0, 900.0, 1.0)
    panels = (
        ("North", (center_x, center_y + distance, wall_z), make_rotator(90.0, 0.0, 0.0), scale),
        ("South", (center_x, center_y - distance, wall_z), make_rotator(90.0, 0.0, 0.0), scale),
        ("East", (center_x + distance, center_y, wall_z), make_rotator(90.0, 90.0, 0.0), scale),
        ("West", (center_x - distance, center_y, wall_z), make_rotator(90.0, 90.0, 0.0), scale),
        ("Ceiling", (center_x, center_y, distance), make_rotator(0.0, 0.0, 0.0), (900.0, 900.0, 1.0)),
    )
    for suffix, location, rotation, actor_scale in panels:
        label = f"AdaptSim_SkyBackdrop_{suffix}"
        panel = find_actor(label)
        if not panel:
            panel = spawn_actor(unreal.StaticMeshActor, location, rotation, label)
        component = first_component(panel, unreal.StaticMeshComponent)
        if not component:
            warn(f"{label} has no StaticMeshComponent")
            continue
        component.set_static_mesh(plane_mesh)
        component.set_material(0, sky_material)
        component.set_collision_profile_name("NoCollision")
        component.set_collision_enabled(unreal.CollisionEnabled.NO_COLLISION)
        try:
            component.set_can_ever_affect_navigation(False)
        except Exception:
            set_prop(component, "can_ever_affect_navigation", False)
        set_prop(component, "visible", True)
        set_prop(component, "hidden_in_game", False)
        try:
            panel.set_actor_hidden_in_game(False)
            panel.set_is_temporarily_hidden_in_editor(False)
        except Exception:
            pass
        set_actor_location_rotation(panel, location, rotation)
        panel.set_actor_scale3d(unreal.Vector(*actor_scale))
        mark_dirty(component)
        mark_dirty(panel)
    log(f"Configured deterministic sky backdrop panels with {plane_mesh.get_path_name()}")


def configure_outdoor_visual_context() -> None:
    sky_class = getattr(unreal, "SkyAtmosphere", None)
    if sky_class:
        sky = find_actor("AdaptSim_SkyAtmosphere")
        if not sky:
            sky = spawn_actor(sky_class, (0.0, 0.0, 0.0), make_rotator(0.0, 0.0, 0.0), "AdaptSim_SkyAtmosphere")
        try:
            sky.set_actor_hidden_in_game(False)
            sky.set_is_temporarily_hidden_in_editor(False)
        except Exception:
            pass
        mark_dirty(sky)

    light = find_actor("AdaptSim_KeyLight")
    if light:
        component = first_component(light, unreal.DirectionalLightComponent)
        if component:
            set_prop(component, "intensity", 3.5)
            for prop in ("atmosphere_sun_light", "b_atmosphere_sun_light", "used_as_atmosphere_sun_light"):
                set_prop(component, prop, True)
            mark_dirty(component)
        set_actor_location_rotation(light, (-80.0, -120.0, 1400.0), make_rotator(-45.0, -35.0, 0.0))
        mark_dirty(light)

    sky_light = find_actor("AdaptSim_SkyLight")
    if sky_light:
        component = first_component(sky_light, unreal.SkyLightComponent)
        if component:
            set_prop(component, "intensity", 1.2)
            set_prop(component, "real_time_capture", True)
            mark_dirty(component)
        mark_dirty(sky_light)

    fog_class = getattr(unreal, "ExponentialHeightFog", None)
    if fog_class:
        fog = find_actor("AdaptSim_HeightFog")
        if not fog:
            fog = spawn_actor(fog_class, (0.0, 0.0, 0.0), make_rotator(0.0, 0.0, 0.0), "AdaptSim_HeightFog")
        component = first_component(fog, unreal.ExponentialHeightFogComponent)
        if component:
            set_prop(component, "fog_density", 0.002)
            set_prop(component, "fog_height_falloff", 0.18)
            set_prop(component, "fog_max_opacity", 0.35)
            if hasattr(unreal, "LinearColor"):
                set_prop(component, "fog_inscattering_color", unreal.LinearColor(0.45, 0.58, 0.68, 1.0))
            mark_dirty(component)
        mark_dirty(fog)

    configure_sky_backdrop()
    log("Configured outdoor sky, ambient light, and light fog context")


def configure_collision_floor() -> None:
    floor_mesh = load_first_asset(SKY_BACKDROP_PLANE_MESH_CANDIDATES)
    if not floor_mesh:
        warn("No engine plane mesh found for collision floor")
        return

    floor = find_actor(COLLISION_FLOOR_LABEL)
    if not floor:
        warn("Collision floor actor is missing in the editor map; runtime GameMode will create it without using viewport-dependent editor spawning")
        return

    component = first_component(floor, unreal.StaticMeshComponent)
    if not component:
        warn(f"{COLLISION_FLOOR_LABEL} has no StaticMeshComponent")
        return

    component.set_static_mesh(floor_mesh)
    component.set_collision_profile_name("BlockAll")
    component.set_collision_enabled(unreal.CollisionEnabled.QUERY_AND_PHYSICS)
    try:
        component.set_can_ever_affect_navigation(True)
    except Exception:
        set_prop(component, "can_ever_affect_navigation", True)
    set_prop(component, "visible", False)
    set_prop(component, "hidden_in_game", True)
    try:
        floor.set_actor_hidden_in_game(True)
        floor.set_is_temporarily_hidden_in_editor(True)
    except Exception:
        pass
    add_actor_tag(floor, "adaptsim_collision_floor")
    set_actor_location_rotation(floor, (-175.0, 0.0, 0.0), make_rotator(0.0, 0.0, 0.0))
    floor.set_actor_scale3d(unreal.Vector(90.0, 90.0, 1.0))
    mark_dirty(component)
    mark_dirty(floor)
    log("Configured invisible collision floor under the safety park runtime area")


def fix_level(static_mesh, material) -> None:
    subsystem = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    if subsystem and hasattr(subsystem, "load_level"):
        subsystem.load_level(MAP_PATH)
    else:
        unreal.EditorLevelLibrary.load_level(MAP_PATH)

    mesh_component_class = unreal.StaticMeshComponent
    scan = find_actor("Scan_safety_park")
    if not scan:
        raise RuntimeError("Scan_safety_park actor is missing")
    component = first_component(scan, mesh_component_class)
    if not component:
        raise RuntimeError("Scan_safety_park has no StaticMeshComponent")
    try:
        scan.set_actor_hidden_in_game(False)
        scan.set_is_temporarily_hidden_in_editor(False)
    except Exception:
        pass
    set_prop(scan, "hidden", False)
    set_prop(scan, "hidden_in_game", False)
    set_prop(component, "visible", True)
    set_prop(component, "hidden_in_game", False)
    component.set_static_mesh(static_mesh)
    component.set_material(0, material)
    component.set_collision_profile_name("BlockAll")
    component.set_collision_enabled(unreal.CollisionEnabled.QUERY_AND_PHYSICS)
    add_actor_tag(scan, "adaptsim_scan_environment")
    try:
        component.set_can_ever_affect_navigation(True)
    except Exception:
        set_prop(component, "can_ever_affect_navigation", True)
    set_actor_location_rotation(scan, (0.0, 0.0, 0.0), make_rotator(0.0, 0.0, 0.0))
    scan.set_actor_scale3d(unreal.Vector(1.0, 1.0, 1.0))
    log("Pinned Scan_safety_park to corrected visual mesh")

    for actor in all_actors():
        if actor is scan:
            continue
        label = actor_label(actor)
        if label.startswith("Scan_"):
            try:
                actor.set_actor_hidden_in_game(True)
                actor.set_is_temporarily_hidden_in_editor(True)
            except Exception:
                pass
            component = first_component(actor, mesh_component_class)
            if component:
                set_prop(component, "visible", False)
                set_prop(component, "hidden_in_game", True)
                component.set_collision_profile_name("NoCollision")
                component.set_collision_enabled(unreal.CollisionEnabled.NO_COLLISION)
                try:
                    component.set_can_ever_affect_navigation(False)
                except Exception:
                    set_prop(component, "can_ever_affect_navigation", False)
            add_actor_tag(actor, "adaptsim_scan_environment")
            log(f"Hid duplicate scan actor {label}")

    focus = (-175.0, 1018.75, 500.0)
    player_location = (-1200.0, -2400.0, 500.0)
    player = find_actor("AdaptSim_PlayerStart")
    if player:
        set_actor_location_rotation(player, player_location, make_rotator(0.0, look_yaw(player_location, focus), 0.0))
        log("Moved PlayerStart near the reconstructed park surface")

    camera_location = (-15000.0, -14000.0, 4200.0)
    camera = find_actor("AdaptSim_DemoCamera")
    if camera:
        pitch = math.degrees(math.atan2(focus[2] - camera_location[2], math.hypot(focus[0] - camera_location[0], focus[1] - camera_location[1])))
        set_actor_location_rotation(camera, camera_location, make_rotator(pitch, look_yaw(camera_location, focus), 0.0))
        set_prop(camera, "auto_activate_for_player", getattr(unreal.AutoReceiveInput, "DISABLED", 0))
        component = first_component(camera, unreal.CameraComponent)
        if component:
            set_prop(component, "field_of_view", 78.0)
        log("Updated overview camera and left it non-authoritative for player control")

    nav = find_actor("AdaptSim_NavMeshBounds")
    if nav:
        set_actor_location_rotation(nav, (-175.0, 1018.75, 1241.0), make_rotator(0.0, 0.0, 0.0))
        nav.set_actor_scale3d(unreal.Vector(400.0, 400.0, 60.0))
        log("Expanded NavMeshBounds around the visual mesh")

    configure_collision_floor()

    try:
        unreal.SystemLibrary.execute_console_command(None, "RebuildNavigation")
    except Exception as exc:
        warn(f"Navigation rebuild command failed: {exc}")

    configure_outdoor_visual_context()
    configure_visual_post_process()

    if subsystem and hasattr(subsystem, "save_current_level"):
        subsystem.save_current_level()
    else:
        unreal.EditorLevelLibrary.save_current_level()
    log(f"Saved {MAP_PATH}")


def main() -> None:
    mesh_path, material_path, is_full_mesh = choose_visual_assets()
    log(f"Selected visual mesh {mesh_path}")
    material = configure_vertex_color_material(material_path)
    mesh = load_asset(mesh_path)
    assign_mesh_material(mesh, material)
    if is_full_mesh:
        log("Keeping Nanite enabled for the selected visual mesh")
    else:
        disable_nanite(mesh)
    fix_level(mesh, material)
    probe_path = "/Game/AdaptSim/Scans/safety_park/Materials/M_Probe_VertexConnect"
    if unreal.EditorAssetLibrary.does_asset_exist(probe_path):
        unreal.EditorAssetLibrary.delete_asset(probe_path)
        log("Removed temporary material probe asset")


if __name__ == "__main__":
    main()
