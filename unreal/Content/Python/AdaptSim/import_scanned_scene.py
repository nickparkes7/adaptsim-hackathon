#!/usr/bin/env python3
"""Scanwright import automation for AdaptSim scanned scene meshes.

Run inside Unreal Editor with PythonScriptPlugin enabled. The script imports one
scan file into /Game/AdaptSim/Scans/<scan_id>, applies scan-friendly static mesh
defaults, and creates or updates the first demo map scaffold.
"""

from __future__ import annotations

import argparse
import base64
import math
import os
import re
import shlex
import sys
from dataclasses import dataclass
from pathlib import Path

try:
    import unreal
except ImportError:  # Allows local syntax checks outside Unreal.
    unreal = None


DEFAULT_DEST_ROOT = "/Game/AdaptSim/Scans"
DEFAULT_DEMO_LEVEL = "/Game/AdaptSim/Maps/L_ScannedDemo"
DEFAULT_NAV_EXTENT_CM = "2500,2500,600"
SUPPORTED_EXTENSIONS = {
    ".fbx",
    ".obj",
    ".gltf",
    ".glb",
    ".usd",
    ".usda",
    ".usdc",
    ".usdz",
}
FORMAT_PLUGIN_HINTS = {
    ".gltf": "GLTF/GLB import normally depends on the Interchange import stack.",
    ".glb": "GLTF/GLB import normally depends on the Interchange import stack.",
    ".usd": "USD import normally depends on the USDImporter plugin.",
    ".usda": "USD import normally depends on the USDImporter plugin.",
    ".usdc": "USD import normally depends on the USDImporter plugin.",
    ".usdz": "USDZ import normally depends on the USDImporter plugin.",
}
SEMANTIC_ANCHOR_DEFS = [
    {
        "id": "entry",
        "display_name": "Entry",
        "type": "entry_point",
        "label": "AdaptSim_Semantic_Entry",
        "location": (-420.0, 0.0, 90.0),
        "rotation": (0.0, 0.0, 0.0),
        "tags": ["entry_point", "hallway"],
        "links": ["hallway_center", "doorway"],
        "notes": "Placeholder entry marker for the imported horror corridor scene.",
    },
    {
        "id": "exit",
        "display_name": "Exit",
        "type": "exit",
        "label": "AdaptSim_Semantic_Exit",
        "location": (420.0, 0.0, 90.0),
        "rotation": (0.0, 180.0, 0.0),
        "tags": ["exit", "hallway"],
        "links": ["hallway_center", "chokepoint"],
        "notes": "Placeholder exit marker for scenario goals and retreat routes.",
    },
    {
        "id": "hallway_center",
        "display_name": "Hallway Center",
        "type": "hallway",
        "label": "AdaptSim_Semantic_HallwayCenter",
        "location": (0.0, 0.0, 100.0),
        "rotation": (0.0, 90.0, 0.0),
        "tags": ["hallway", "navigation"],
        "links": ["entry", "exit", "doorway", "cover"],
        "notes": "Central corridor anchor for patrol, routing, and visibility tests.",
    },
    {
        "id": "doorway",
        "display_name": "Doorway",
        "type": "door",
        "label": "AdaptSim_Semantic_Doorway",
        "location": (-150.0, 240.0, 100.0),
        "rotation": (0.0, 90.0, 0.0),
        "tags": ["door", "transition", "near_chokepoint"],
        "links": ["entry", "hallway_center"],
        "notes": "Placeholder doorway or threshold marker for breach/transition scenarios.",
    },
    {
        "id": "cover",
        "display_name": "Cover",
        "type": "cover",
        "label": "AdaptSim_Semantic_Cover",
        "location": (-120.0, -240.0, 80.0),
        "rotation": (0.0, 35.0, 0.0),
        "tags": ["cover", "spawnable"],
        "links": ["hallway_center", "ambush_point"],
        "notes": "Placeholder cover affordance; verify against final collision in-editor.",
    },
    {
        "id": "ambush_point",
        "display_name": "Ambush Point",
        "type": "spawn_zone",
        "label": "AdaptSim_Semantic_AmbushPoint",
        "location": (240.0, -140.0, 100.0),
        "rotation": (0.0, -120.0, 0.0),
        "tags": ["spawn_zone", "ambush_point", "adversary"],
        "links": ["cover", "chokepoint", "observation_point"],
        "notes": "Placeholder adversary spawn/ambush anchor for scenario director tests.",
    },
    {
        "id": "observation_point",
        "display_name": "Observation Point",
        "type": "line_of_sight",
        "label": "AdaptSim_Semantic_ObservationPoint",
        "location": (0.0, 340.0, 160.0),
        "rotation": (-10.0, -90.0, 0.0),
        "tags": ["line_of_sight", "observation_point"],
        "links": ["hallway_center", "ambush_point"],
        "notes": "Placeholder observation marker for line-of-sight and AAR camera work.",
    },
    {
        "id": "chokepoint",
        "display_name": "Chokepoint",
        "type": "chokepoint",
        "label": "AdaptSim_Semantic_Chokepoint",
        "location": (120.0, 0.0, 100.0),
        "rotation": (0.0, 90.0, 0.0),
        "tags": ["chokepoint", "near_cover"],
        "links": ["hallway_center", "exit", "ambush_point"],
        "notes": "Placeholder narrow-passage marker; reposition after visual inspection.",
    },
]


@dataclass
class ImportSettings:
    source: Path
    scan_id: str
    dest_root: str
    demo_level_path: str
    create_demo_level: bool
    replace_existing: bool
    enable_nanite: bool
    collision_mode: str
    import_materials: bool
    combine_meshes: bool
    actor_scale: float
    actor_location_cm: tuple[float, float, float]
    actor_rotation_deg: tuple[float, float, float]
    nav_extent_cm: tuple[float, float, float]
    scan_bounds_min_m: tuple[float, float, float] | None
    scan_bounds_max_m: tuple[float, float, float] | None
    spawn_all_static_meshes: bool
    create_semantic_anchors: bool
    semantic_anchor_mode: str
    save_assets: bool

    @property
    def destination_path(self) -> str:
        return f"{self.dest_root.rstrip('/')}/{self.scan_id}"

    @property
    def asset_name(self) -> str:
        return f"SM_{to_asset_token(self.scan_id)}"


def log(message: str) -> None:
    if unreal:
        unreal.log(f"[Scanwright] {message}")
    else:
        print(f"[Scanwright] {message}")


def warn(message: str) -> None:
    if unreal:
        unreal.log_warning(f"[Scanwright] {message}")
    else:
        print(f"[Scanwright][WARN] {message}")


def fail(message: str) -> None:
    if unreal:
        unreal.log_error(f"[Scanwright] {message}")
    raise RuntimeError(message)


def to_scan_id(value: str) -> str:
    token = re.sub(r"[^a-z0-9_]+", "_", value.lower()).strip("_")
    token = re.sub(r"_+", "_", token)
    if not token:
        token = "scan"
    if not token[0].isalpha():
        token = f"scan_{token}"
    return token[:64]


def to_asset_token(value: str) -> str:
    pieces = [piece for piece in re.split(r"[^a-zA-Z0-9]+", value) if piece]
    if not pieces:
        return "Scan"
    token = "".join(piece[:1].upper() + piece[1:] for piece in pieces)
    if not token[0].isalpha():
        token = f"Scan{token}"
    return token[:64]


def parse_csv3(value: str, label: str) -> tuple[float, float, float]:
    parts = [part.strip() for part in value.split(",")]
    if len(parts) != 3:
        raise argparse.ArgumentTypeError(f"{label} must be three comma-separated numbers")
    try:
        return (float(parts[0]), float(parts[1]), float(parts[2]))
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"{label} must contain only numbers") from exc


def parse_optional_csv3(value: str | None, label: str) -> tuple[float, float, float] | None:
    if value is None or str(value).strip() == "":
        return None
    return parse_csv3(str(value), label)


def unreal_command_args() -> list[str]:
    env_args_b64 = os.environ.get("ADAPTSIM_SCAN_ARGS_B64")
    if env_args_b64:
        return shlex.split(base64.b64decode(env_args_b64).decode("utf-8"))

    env_args = os.environ.get("ADAPTSIM_SCAN_ARGS")
    if env_args:
        return shlex.split(env_args)

    argv = sys.argv[1:]
    if any(arg.startswith("--") for arg in argv):
        return argv

    if not unreal:
        return argv

    try:
        command_line = unreal.SystemLibrary.get_command_line()
    except Exception:
        return argv

    tokens = shlex.split(command_line)
    for index, token in enumerate(tokens):
        for marker in ("-ScanwrightArgsB64", "-AdaptSimScanImportArgsB64"):
            if token == marker and index + 1 < len(tokens):
                return shlex.split(base64.b64decode(tokens[index + 1]).decode("utf-8"))
            if token.startswith(f"{marker}="):
                value = token.split("=", 1)[1]
                return shlex.split(base64.b64decode(value).decode("utf-8"))

        for marker in ("-ScanwrightArgs", "-AdaptSimScanImportArgs"):
            if token == marker and index + 1 < len(tokens):
                return shlex.split(tokens[index + 1])
            if token.startswith(f"{marker}="):
                return shlex.split(token.split("=", 1)[1])

    return argv


def parse_args() -> ImportSettings:
    parser = argparse.ArgumentParser(
        description="Import a scanned scene mesh and create/update the AdaptSim demo level."
    )
    parser.add_argument("--source", default=os.environ.get("ADAPTSIM_SCAN_SOURCE"))
    parser.add_argument("--scan-id", default=os.environ.get("ADAPTSIM_SCAN_ID"))
    parser.add_argument("--dest-root", default=os.environ.get("ADAPTSIM_SCAN_DEST_ROOT", DEFAULT_DEST_ROOT))
    parser.add_argument("--demo-level-path", default=os.environ.get("ADAPTSIM_DEMO_LEVEL", DEFAULT_DEMO_LEVEL))
    parser.add_argument("--create-demo-level", dest="create_demo_level", action="store_true")
    parser.add_argument("--no-demo-level", dest="create_demo_level", action="store_false")
    parser.add_argument("--replace-existing", action="store_true")
    parser.add_argument("--nanite", dest="enable_nanite", action="store_true")
    parser.add_argument("--no-nanite", dest="enable_nanite", action="store_false")
    parser.add_argument("--collision-mode", choices=("complex", "simple", "none"), default="complex")
    parser.add_argument("--import-materials", dest="import_materials", action="store_true")
    parser.add_argument("--no-import-materials", dest="import_materials", action="store_false")
    parser.add_argument("--combine-meshes", dest="combine_meshes", action="store_true")
    parser.add_argument("--no-combine-meshes", dest="combine_meshes", action="store_false")
    parser.add_argument("--scale", type=float, default=float(os.environ.get("ADAPTSIM_SCAN_SCALE", "1.0")))
    parser.add_argument("--location-cm", default=os.environ.get("ADAPTSIM_SCAN_LOCATION_CM", "0,0,0"))
    parser.add_argument("--rotation-deg", default=os.environ.get("ADAPTSIM_SCAN_ROTATION_DEG", "0,0,0"))
    parser.add_argument("--nav-extent-cm", default=os.environ.get("ADAPTSIM_NAV_EXTENT_CM", DEFAULT_NAV_EXTENT_CM))
    parser.add_argument("--scan-bounds-min-m", default=os.environ.get("ADAPTSIM_SCAN_BOUNDS_MIN_M"))
    parser.add_argument("--scan-bounds-max-m", default=os.environ.get("ADAPTSIM_SCAN_BOUNDS_MAX_M"))
    parser.add_argument("--spawn-all-static-meshes", dest="spawn_all_static_meshes", action="store_true")
    parser.add_argument("--spawn-first-static-mesh-only", dest="spawn_all_static_meshes", action="store_false")
    parser.add_argument("--semantic-anchors", dest="create_semantic_anchors", action="store_true")
    parser.add_argument("--no-semantic-anchors", dest="create_semantic_anchors", action="store_false")
    parser.add_argument(
        "--semantic-anchor-mode",
        choices=("adapt_sim", "target_point"),
        default=os.environ.get("ADAPTSIM_SEMANTIC_ANCHOR_MODE", "adapt_sim"),
        help="Use AdaptSim ASemanticAnchor actors, or safe TargetPoint placeholders for null-RHI runs.",
    )
    parser.add_argument("--save", dest="save_assets", action="store_true")
    parser.add_argument("--no-save", dest="save_assets", action="store_false")
    parser.set_defaults(
        create_demo_level=True,
        enable_nanite=True,
        import_materials=True,
        combine_meshes=True,
        spawn_all_static_meshes=True,
        create_semantic_anchors=True,
        save_assets=True,
    )

    args = parser.parse_args(unreal_command_args())
    if not args.source:
        parser.error("--source is required, or set ADAPTSIM_SCAN_SOURCE")

    source = Path(args.source).expanduser()
    scan_id = to_scan_id(args.scan_id or source.stem)
    extension = source.suffix.lower()
    if extension not in SUPPORTED_EXTENSIONS:
        parser.error(
            f"unsupported scan extension {extension!r}; expected one of "
            f"{', '.join(sorted(SUPPORTED_EXTENSIONS))}"
        )

    return ImportSettings(
        source=source,
        scan_id=scan_id,
        dest_root=args.dest_root.rstrip("/"),
        demo_level_path=args.demo_level_path.rstrip("/"),
        create_demo_level=args.create_demo_level,
        replace_existing=args.replace_existing,
        enable_nanite=args.enable_nanite,
        collision_mode=args.collision_mode,
        import_materials=args.import_materials,
        combine_meshes=args.combine_meshes,
        actor_scale=args.scale,
        actor_location_cm=parse_csv3(args.location_cm, "--location-cm"),
        actor_rotation_deg=parse_csv3(args.rotation_deg, "--rotation-deg"),
        nav_extent_cm=parse_csv3(args.nav_extent_cm, "--nav-extent-cm"),
        scan_bounds_min_m=parse_optional_csv3(args.scan_bounds_min_m, "--scan-bounds-min-m"),
        scan_bounds_max_m=parse_optional_csv3(args.scan_bounds_max_m, "--scan-bounds-max-m"),
        spawn_all_static_meshes=args.spawn_all_static_meshes,
        create_semantic_anchors=args.create_semantic_anchors,
        semantic_anchor_mode=args.semantic_anchor_mode,
        save_assets=args.save_assets,
    )


def require_unreal() -> None:
    if unreal is None:
        fail("This script must run inside Unreal Editor Python.")
    missing = []
    for symbol in ("AssetImportTask", "AssetToolsHelpers"):
        if not hasattr(unreal, symbol):
            missing.append(symbol)
    if missing:
        fail(
            "Unreal Python import APIs are unavailable. Enable PythonScriptPlugin "
            f"and editor import modules first. Missing: {', '.join(missing)}"
        )


def try_set_editor_property(obj, property_name: str, value) -> bool:
    try:
        obj.set_editor_property(property_name, value)
        return True
    except Exception:
        return False


def try_get_editor_property(obj, property_name: str, default=None):
    try:
        return obj.get_editor_property(property_name)
    except Exception:
        return default


def try_set_any_editor_property(obj, property_names: tuple[str, ...], value) -> bool:
    for property_name in property_names:
        if try_set_editor_property(obj, property_name, value):
            return True
    return False


def unreal_name(value: str):
    if hasattr(unreal, "Name"):
        try:
            return unreal.Name(value)
        except Exception:
            pass
    return value


def unreal_name_array(values: list[str]) -> list:
    return [unreal_name(value) for value in values]


def ensure_content_directory(path: str) -> None:
    if hasattr(unreal, "EditorAssetLibrary"):
        try:
            if not unreal.EditorAssetLibrary.does_directory_exist(path):
                unreal.EditorAssetLibrary.make_directory(path)
        except Exception as exc:
            warn(f"Could not create content directory {path}: {exc}")


def build_fbx_like_options(settings: ImportSettings):
    if not hasattr(unreal, "FbxImportUI"):
        return None

    options = unreal.FbxImportUI()
    try_set_editor_property(options, "import_mesh", True)
    try_set_editor_property(options, "import_as_skeletal", False)
    try_set_editor_property(options, "import_materials", settings.import_materials)
    try_set_editor_property(options, "import_textures", settings.import_materials)
    try_set_editor_property(options, "automated_import_should_detect_type", False)
    if hasattr(unreal, "FBXImportType"):
        try_set_editor_property(options, "mesh_type_to_import", unreal.FBXImportType.FBXIT_STATIC_MESH)

    static_data = try_get_editor_property(options, "static_mesh_import_data")
    if static_data:
        try_set_editor_property(static_data, "combine_meshes", settings.combine_meshes)
        try_set_editor_property(static_data, "auto_generate_collision", settings.collision_mode == "simple")
        try_set_editor_property(static_data, "generate_lightmap_u_vs", False)
        try_set_editor_property(static_data, "import_uniform_scale", 1.0)

    return options


def build_import_task(settings: ImportSettings):
    task = unreal.AssetImportTask()
    try_set_editor_property(task, "filename", str(settings.source))
    try_set_editor_property(task, "destination_path", settings.destination_path)
    try_set_editor_property(task, "destination_name", settings.asset_name)
    try_set_editor_property(task, "automated", True)
    try_set_editor_property(task, "replace_existing", settings.replace_existing)
    try_set_editor_property(task, "replace_existing_settings", settings.replace_existing)
    try_set_editor_property(task, "save", False)

    if settings.source.suffix.lower() in (".fbx", ".obj"):
        options = build_fbx_like_options(settings)
        if options:
            try_set_editor_property(task, "options", options)

    return task


def import_scan(settings: ImportSettings) -> list:
    if not settings.source.exists():
        fail(f"Input scan file does not exist on this machine: {settings.source}")

    extension = settings.source.suffix.lower()
    if extension in FORMAT_PLUGIN_HINTS:
        log(FORMAT_PLUGIN_HINTS[extension])

    ensure_content_directory(settings.dest_root)
    ensure_content_directory(settings.destination_path)
    task = build_import_task(settings)

    log(f"Importing {settings.source} into {settings.destination_path}")
    try:
        unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
    except Exception as exc:
        fail(f"Import task failed. Check format importer plugins for {extension}: {exc}")

    imported_paths = list(try_get_editor_property(task, "imported_object_paths", []) or [])
    if imported_paths:
        log("Imported objects: " + ", ".join(imported_paths))
    else:
        warn("Import completed without reported imported_object_paths; scanning destination folder.")

    static_meshes = collect_static_meshes(imported_paths, settings.destination_path)
    if not static_meshes:
        fail(
            "No StaticMesh assets were found after import. For GLB/GLTF/USD this usually means the "
            "matching importer plugin is disabled or the source was imported as a scene-only asset."
        )

    for mesh in static_meshes:
        configure_static_mesh(mesh, settings)

    return static_meshes


def load_asset(path: str):
    if hasattr(unreal, "EditorAssetLibrary"):
        try:
            return unreal.EditorAssetLibrary.load_asset(path)
        except Exception:
            pass
    try:
        return unreal.load_asset(path)
    except Exception:
        return None


def collect_static_meshes(imported_paths: list[str], destination_path: str) -> list:
    meshes = []
    seen = set()

    for path in imported_paths:
        asset = load_asset(path)
        package_path = canonical_asset_package_path(path)
        if is_static_mesh(asset) and package_path not in seen:
            meshes.append(asset)
            seen.add(package_path)

    try:
        registry = unreal.AssetRegistryHelpers.get_asset_registry()
        try:
            asset_data = registry.get_assets_by_path(destination_path, recursive=True)
        except TypeError:
            asset_data = registry.get_assets_by_path(destination_path, True)
        for data in asset_data:
            path = str(data.package_name)
            if path in seen:
                continue
            asset = data.get_asset()
            if is_static_mesh(asset):
                meshes.append(asset)
                seen.add(path)
    except Exception as exc:
        warn(f"Could not scan asset registry at {destination_path}: {exc}")

    return meshes


def canonical_asset_package_path(path: str) -> str:
    return str(path).split(".", 1)[0]


def is_static_mesh(asset) -> bool:
    if not asset or not hasattr(unreal, "StaticMesh"):
        return False
    try:
        return isinstance(asset, unreal.StaticMesh)
    except Exception:
        try:
            return asset.get_class().get_name() == "StaticMesh"
        except Exception:
            return False


def configure_static_mesh(mesh, settings: ImportSettings) -> None:
    log(f"Configuring StaticMesh {mesh.get_name()}")
    material = scan_visible_material(settings)
    if material:
        if assign_static_mesh_material(mesh, material):
            log(f"Assigned scan visible material to {mesh.get_name()}")
        else:
            warn(f"Could not assign scan visible material to {mesh.get_name()}")

    if settings.enable_nanite and not material_requires_nanite_disabled(material):
        if enable_nanite(mesh):
            log(f"Nanite enabled for {mesh.get_name()}")
        else:
            warn(
                f"Could not enable Nanite for {mesh.get_name()}; this may require "
                "EditorScriptingUtilities or a loaded static mesh editor module."
            )
    elif settings.enable_nanite:
        if disable_nanite(mesh):
            log(f"Nanite disabled for {mesh.get_name()} because the scan uses an engine vertex-color material")
        else:
            warn(f"Could not disable Nanite for {mesh.get_name()}; vertex-color material may render as default")
    else:
        if disable_nanite(mesh):
            log(f"Nanite disabled for {mesh.get_name()}")

    if settings.collision_mode != "none":
        if configure_collision(mesh, settings.collision_mode):
            log(f"Collision mode {settings.collision_mode} applied to {mesh.get_name()}")
        else:
            warn(
                f"Could not apply collision mode to {mesh.get_name()}; verify collision manually "
                "before navmesh/build checks."
            )

    try:
        mesh.mark_package_dirty()
        mesh.post_edit_change()
    except Exception:
        pass

    if settings.save_assets and hasattr(unreal, "EditorAssetLibrary"):
        try:
            unreal.EditorAssetLibrary.save_loaded_asset(mesh, only_if_is_dirty=False)
        except Exception as exc:
            warn(f"Could not save {mesh.get_name()}: {exc}")


def scan_vertex_color_material_path(settings: ImportSettings) -> tuple[str, str, str]:
    directory = f"{settings.destination_path}/Materials"
    asset_name = f"M_{to_asset_token(settings.scan_id)}_VertexColor"
    return directory, asset_name, f"{directory}/{asset_name}"


def engine_vertex_color_material():
    for material_path in (
        "/Engine/EngineDebugMaterials/VertexColorViewMode_ColorOnly",
        "/Engine/EngineDebugMaterials/VertexColorMaterial",
    ):
        material = load_asset(material_path)
        if material:
            log(f"Using engine vertex-color material {material_path}")
            return material
    return None


def scan_visible_material(settings: ImportSettings):
    material = ensure_scan_vertex_color_material(settings)
    if material:
        return material
    warn("Project vertex-color material was unavailable; falling back to engine debug material.")
    return engine_vertex_color_material()


def material_path_name(material) -> str:
    try:
        return str(material.get_path_name())
    except Exception:
        return ""


def material_requires_nanite_disabled(material) -> bool:
    return material_path_name(material).startswith("/Engine/EngineDebugMaterials/")


def ensure_scan_vertex_color_material(settings: ImportSettings):
    """Create/update the material that displays GLB COLOR_0 vertex data in Unreal."""
    directory, asset_name, material_path = scan_vertex_color_material_path(settings)
    material = load_asset(material_path)
    if not material:
        if not hasattr(unreal, "AssetToolsHelpers") or not hasattr(unreal, "MaterialFactoryNew"):
            warn("Unreal material factory APIs are unavailable; scan mesh may use importer fallback material.")
            return None
        ensure_content_directory(directory)
        try:
            material = unreal.AssetToolsHelpers.get_asset_tools().create_asset(
                asset_name,
                directory,
                unreal.Material,
                unreal.MaterialFactoryNew(),
            )
        except Exception as exc:
            warn(f"Could not create scan vertex-color material {material_path}: {exc}")
            return None

    configure_vertex_color_material(material)
    if settings.save_assets and hasattr(unreal, "EditorAssetLibrary"):
        try:
            unreal.EditorAssetLibrary.save_loaded_asset(material, only_if_is_dirty=False)
        except Exception as exc:
            warn(f"Could not save scan vertex-color material {material_path}: {exc}")
    return material


def configure_vertex_color_material(material) -> None:
    try_set_any_editor_property(material, ("two_sided", "bTwoSided"), True)
    shading_model = getattr(unreal, "MaterialShadingModel", None)
    if shading_model and hasattr(shading_model, "MSM_UNLIT"):
        try_set_editor_property(material, "shading_model", shading_model.MSM_UNLIT)
    try_set_any_editor_property(
        material,
        (
            "used_with_nanite",
            "b_used_with_nanite",
            "bUsedWithNanite",
            "use_with_nanite",
        ),
        True,
    )

    editing = getattr(unreal, "MaterialEditingLibrary", None)
    vertex_color_class = getattr(unreal, "MaterialExpressionVertexColor", None)
    material_property = getattr(unreal, "MaterialProperty", None)
    if not editing or not vertex_color_class or not material_property:
        warn("MaterialEditingLibrary or MaterialExpressionVertexColor is unavailable; material graph was not updated.")
        return

    try:
        if hasattr(editing, "delete_all_material_expressions"):
            editing.delete_all_material_expressions(material)
    except Exception as exc:
        warn(f"Could not clear existing material expressions for {material.get_name()}: {exc}")

    try:
        vertex_color = editing.create_material_expression(material, vertex_color_class, -360, 0)
    except Exception as exc:
        warn(f"Could not create VertexColor material expression for {material.get_name()}: {exc}")
        return

    base_color = getattr(material_property, "MP_BASE_COLOR", None)
    if base_color is not None:
        if not connect_expression_to_material_property(editing, vertex_color, base_color):
            warn(f"Could not connect VertexColor output to Base Color for {material.get_name()}")
    emissive_color = getattr(material_property, "MP_EMISSIVE_COLOR", None)
    if emissive_color is not None:
        if not connect_expression_to_material_property(editing, vertex_color, emissive_color):
            warn(f"Could not connect VertexColor output to Emissive Color for {material.get_name()}")

    constant_class = getattr(unreal, "MaterialExpressionConstant", None)
    if constant_class:
        roughness = getattr(material_property, "MP_ROUGHNESS", None)
        metallic = getattr(material_property, "MP_METALLIC", None)
        if roughness is not None:
            add_material_constant(editing, material, constant_class, roughness, 0.85, -360, 180)
        if metallic is not None:
            add_material_constant(editing, material, constant_class, metallic, 0.0, -360, 320)

    try:
        if hasattr(editing, "layout_material_expressions"):
            editing.layout_material_expressions(material)
    except Exception:
        pass
    try:
        if hasattr(editing, "recompile_material"):
            editing.recompile_material(material)
    except Exception:
        pass
    try:
        material.mark_package_dirty()
        material.post_edit_change()
    except Exception:
        pass


def connect_expression_to_material_property(editing, expression, material_property) -> bool:
    for output_name in ("", "RGB", "Color", "RGBA"):
        try:
            if not editing.connect_material_property(expression, output_name, material_property):
                continue
            try:
                node = editing.get_material_property_input_node(expression.get_outer(), material_property)
                if node:
                    return True
            except Exception:
                return True
        except Exception:
            continue
    return False


def add_material_constant(editing, material, constant_class, material_property, value: float, x: int, y: int) -> None:
    try:
        node = editing.create_material_expression(material, constant_class, x, y)
        try_set_editor_property(node, "r", value)
        editing.connect_material_property(node, "", material_property)
    except Exception:
        pass


def assign_static_mesh_material(mesh, material) -> bool:
    assigned = False
    slot_count = 1
    static_materials = try_get_editor_property(mesh, "static_materials", None)
    if static_materials:
        try:
            slot_count = max(slot_count, len(static_materials))
        except Exception:
            pass
        for static_material in static_materials:
            assigned = try_set_editor_property(static_material, "material_interface", material) or assigned

    try:
        section_count = mesh.get_num_sections(0)
        if section_count:
            slot_count = max(slot_count, int(section_count))
    except Exception:
        pass

    for index in range(slot_count):
        try:
            mesh.set_material(index, material)
            assigned = True
        except Exception:
            pass

    if assigned:
        try:
            mesh.mark_package_dirty()
            mesh.post_edit_change()
        except Exception:
            pass
    return assigned


def enable_nanite(static_mesh) -> bool:
    try:
        settings = try_get_editor_property(static_mesh, "nanite_settings")
        if not settings:
            return False
        changed = try_set_editor_property(settings, "enabled", True)
        changed = try_set_editor_property(settings, "b_enabled", True) or changed
        if not changed:
            return False

        if hasattr(unreal, "EditorStaticMeshLibrary") and hasattr(
            unreal.EditorStaticMeshLibrary, "set_nanite_settings"
        ):
            try:
                unreal.EditorStaticMeshLibrary.set_nanite_settings(static_mesh, settings, apply_changes=True)
            except TypeError:
                unreal.EditorStaticMeshLibrary.set_nanite_settings(static_mesh, settings, True)
        else:
            try_set_editor_property(static_mesh, "nanite_settings", settings)
        return True
    except Exception as exc:
        warn(f"Nanite setup error for {static_mesh.get_name()}: {exc}")
        return False


def disable_nanite(static_mesh) -> bool:
    try:
        settings = try_get_editor_property(static_mesh, "nanite_settings")
        if not settings:
            return False
        changed = try_set_editor_property(settings, "enabled", False)
        changed = try_set_editor_property(settings, "b_enabled", False) or changed

        if hasattr(unreal, "EditorStaticMeshLibrary") and hasattr(
            unreal.EditorStaticMeshLibrary, "set_nanite_settings"
        ):
            try:
                unreal.EditorStaticMeshLibrary.set_nanite_settings(static_mesh, settings, apply_changes=True)
            except TypeError:
                unreal.EditorStaticMeshLibrary.set_nanite_settings(static_mesh, settings, True)
        else:
            try_set_editor_property(static_mesh, "nanite_settings", settings)
        return changed
    except Exception as exc:
        warn(f"Nanite disable error for {static_mesh.get_name()}: {exc}")
        return False


def collision_trace_flag(mode: str):
    enum_value = {
        "complex": "CTF_USE_COMPLEX_AS_SIMPLE",
        "simple": "CTF_USE_SIMPLE_AND_COMPLEX",
    }.get(mode)
    if not enum_value or not hasattr(unreal, "CollisionTraceFlag"):
        return None
    try:
        return getattr(unreal.CollisionTraceFlag, enum_value)
    except Exception:
        return None


def configure_collision(static_mesh, mode: str) -> bool:
    flag = collision_trace_flag(mode)
    changed = False

    if flag and hasattr(unreal, "EditorStaticMeshLibrary") and hasattr(
        unreal.EditorStaticMeshLibrary, "set_collision_complexity"
    ):
        try:
            unreal.EditorStaticMeshLibrary.set_collision_complexity(static_mesh, flag)
            changed = True
        except Exception:
            changed = False

    body_setup = try_get_editor_property(static_mesh, "body_setup")
    if body_setup and flag:
        changed = try_set_editor_property(body_setup, "collision_trace_flag", flag) or changed

    return changed


def vector(values: tuple[float, float, float]):
    return unreal.Vector(values[0], values[1], values[2])


def rotator(values: tuple[float, float, float]):
    # Callers pass Unreal-style (pitch, yaw, roll). Unreal Python's positional
    # Rotator constructor takes (roll, pitch, yaw).
    return unreal.Rotator(values[2], values[0], values[1])


def get_actor_subsystem():
    if hasattr(unreal, "EditorActorSubsystem") and hasattr(unreal, "get_editor_subsystem"):
        try:
            return unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
        except Exception:
            return None
    return None


def get_level_subsystem():
    if hasattr(unreal, "LevelEditorSubsystem") and hasattr(unreal, "get_editor_subsystem"):
        try:
            return unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
        except Exception:
            return None
    return None


def resolve_unreal_class(symbol: str, *script_paths: str, required: bool = True):
    actor_class = getattr(unreal, symbol, None)
    if actor_class:
        return actor_class
    if hasattr(unreal, "load_class"):
        for script_path in script_paths:
            try:
                actor_class = unreal.load_class(None, script_path)
            except Exception:
                actor_class = None
            if actor_class:
                return actor_class
    if required:
        fail(f"Could not resolve Unreal class {symbol}; tried {', '.join(script_paths)}")
    return None


def load_or_create_level(level_path: str) -> bool:
    exists = False
    if hasattr(unreal, "EditorAssetLibrary"):
        try:
            exists = unreal.EditorAssetLibrary.does_asset_exist(level_path)
        except Exception:
            exists = False

    ensure_content_directory("/".join(level_path.split("/")[:-1]))
    level_subsystem = get_level_subsystem()

    if exists:
        log(f"Loading existing demo level {level_path}")
        if level_subsystem and hasattr(level_subsystem, "load_level"):
            return bool(level_subsystem.load_level(level_path))
        if hasattr(unreal, "EditorLevelLibrary") and hasattr(unreal.EditorLevelLibrary, "load_level"):
            return bool(unreal.EditorLevelLibrary.load_level(level_path))
        fail("Cannot load existing level; EditorScriptingUtilities/LevelEditorSubsystem is unavailable.")

    log(f"Creating demo level {level_path}")
    if level_subsystem and hasattr(level_subsystem, "new_level"):
        return bool(level_subsystem.new_level(level_path))
    if hasattr(unreal, "EditorLevelLibrary") and hasattr(unreal.EditorLevelLibrary, "new_level"):
        return bool(unreal.EditorLevelLibrary.new_level(level_path))
    fail("Cannot create level; enable EditorScriptingUtilities or expose LevelEditorSubsystem to Python.")


def all_level_actors() -> list:
    actor_subsystem = get_actor_subsystem()
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


def set_actor_label(actor, label: str) -> None:
    try:
        actor.set_actor_label(label, mark_dirty=True)
    except TypeError:
        try:
            actor.set_actor_label(label)
        except Exception:
            pass
    except Exception:
        pass


def find_actor(label: str):
    for actor in all_level_actors():
        if actor_label(actor) == label:
            return actor
    return None


def spawn_actor_from_class(actor_class, location, rotation, label: str):
    actor = None
    if hasattr(unreal, "EditorLevelLibrary") and hasattr(unreal.EditorLevelLibrary, "spawn_actor_from_class"):
        try:
            actor = unreal.EditorLevelLibrary.spawn_actor_from_class(actor_class, location, rotation)
        except Exception as exc:
            warn(f"EditorLevelLibrary spawn failed for {label}: {exc}")

    actor_subsystem = get_actor_subsystem()
    if not actor and actor_subsystem and hasattr(actor_subsystem, "spawn_actor_from_class"):
        actor = actor_subsystem.spawn_actor_from_class(actor_class, location, rotation)

    if not actor:
        fail(f"Could not spawn actor {label}; editor actor spawning API is unavailable.")
    set_actor_label(actor, label)
    return actor


def spawn_actor_from_object(asset, location, rotation, label: str):
    actor_subsystem = get_actor_subsystem()
    actor = None
    if actor_subsystem and hasattr(actor_subsystem, "spawn_actor_from_object"):
        actor = actor_subsystem.spawn_actor_from_object(asset, location, rotation)
    elif hasattr(unreal, "EditorLevelLibrary"):
        actor = unreal.EditorLevelLibrary.spawn_actor_from_object(asset, location, rotation)
    if not actor:
        static_mesh_actor_class = resolve_unreal_class("StaticMeshActor", "/Script/Engine.StaticMeshActor")
        static_mesh_component_class = resolve_unreal_class(
            "StaticMeshComponent", "/Script/Engine.StaticMeshComponent", required=False
        )
        actor = spawn_actor_from_class(static_mesh_actor_class, location, rotation, label)
        component = actor.get_component_by_class(static_mesh_component_class) if static_mesh_component_class else None
        if component:
            component.set_static_mesh(asset)
    set_actor_label(actor, label)
    return actor


def set_actor_transform(actor, settings: ImportSettings) -> None:
    try:
        actor.set_actor_location(vector(settings.actor_location_cm), sweep=False, teleport=True)
    except TypeError:
        actor.set_actor_location(vector(settings.actor_location_cm), False, True)
    except Exception:
        pass

    try:
        actor.set_actor_rotation(rotator(settings.actor_rotation_deg), teleport_physics=True)
    except TypeError:
        actor.set_actor_rotation(rotator(settings.actor_rotation_deg), True)
    except Exception:
        pass

    try:
        actor.set_actor_scale3d(unreal.Vector(settings.actor_scale, settings.actor_scale, settings.actor_scale))
    except Exception:
        pass


def configure_scan_actor(actor, mesh, settings: ImportSettings) -> None:
    static_mesh_component_class = resolve_unreal_class(
        "StaticMeshComponent", "/Script/Engine.StaticMeshComponent", required=False
    )
    component = actor.get_component_by_class(static_mesh_component_class) if static_mesh_component_class else None
    if component:
        try:
            component.set_static_mesh(mesh)
        except Exception:
            pass
        try:
            component.set_collision_profile_name("BlockAll")
        except Exception:
            pass
        if hasattr(unreal, "CollisionEnabled"):
            try:
                component.set_collision_enabled(unreal.CollisionEnabled.QUERY_AND_PHYSICS)
            except Exception:
                pass
        try:
            component.set_can_ever_affect_navigation(True)
        except Exception:
            pass
    set_actor_transform(actor, settings)


def upsert_scan_actors(meshes: list, settings: ImportSettings) -> None:
    selected_meshes = meshes if settings.spawn_all_static_meshes else meshes[:1]
    for index, mesh in enumerate(selected_meshes):
        label = f"Scan_{settings.scan_id}" if len(selected_meshes) == 1 else f"Scan_{settings.scan_id}_{index + 1:02d}"
        actor = find_actor(label)
        if actor:
            log(f"Updating existing scan actor {label}")
        else:
            log(f"Spawning scan actor {label}")
            actor = spawn_actor_from_object(mesh, vector(settings.actor_location_cm), rotator(settings.actor_rotation_deg), label)
        configure_scan_actor(actor, mesh, settings)


def ensure_actor(label: str, actor_class, location_cm, rotation_deg):
    actor = find_actor(label)
    if actor:
        try:
            actor.set_actor_location(vector(location_cm), sweep=False, teleport=True)
        except TypeError:
            try:
                actor.set_actor_location(vector(location_cm), False, True)
            except Exception:
                pass
        except Exception:
            pass
        try:
            actor.set_actor_rotation(rotator(rotation_deg), teleport_physics=True)
        except TypeError:
            try:
                actor.set_actor_rotation(rotator(rotation_deg), True)
            except Exception:
                pass
        except Exception:
            pass
        return actor
    return spawn_actor_from_class(actor_class, vector(location_cm), rotator(rotation_deg), label)


def first_component(actor, component_class):
    try:
        return actor.get_component_by_class(component_class)
    except Exception:
        return None


def enum_member(enum_class, token: str):
    if not enum_class:
        return None

    candidates = [
        token.upper(),
        token.replace("_", "").upper(),
        "".join(part[:1].upper() + part[1:] for part in token.split("_")),
    ]
    for candidate in candidates:
        try:
            if hasattr(enum_class, candidate):
                return getattr(enum_class, candidate)
        except Exception:
            pass

    for candidate in candidates:
        try:
            return enum_class(candidate)
        except Exception:
            pass

    return None


def auto_receive_player0():
    enum_class = getattr(unreal, "AutoReceiveInput", None)
    for token in ("player0", "player_0"):
        value = enum_member(enum_class, token)
        if value is not None:
            return value
    return None


def semantic_anchor_type_value(token: str):
    enum_class = getattr(unreal, "AdaptSimSemanticAnchorType", None)
    if not enum_class:
        enum_class = getattr(unreal, "EAdaptSimSemanticAnchorType", None)
    return enum_member(enum_class, token)


def resolve_semantic_anchor_class():
    target_point_class = resolve_unreal_class(
        "TargetPoint",
        "/Script/Engine.TargetPoint",
        required=False,
    )

    settings = CURRENT_IMPORT_SETTINGS
    if settings and settings.semantic_anchor_mode == "target_point":
        if target_point_class:
            warn("Using TargetPoint semantic placeholders instead of ASemanticAnchor actors.")
            return target_point_class, "target_point"
        warn("TargetPoint class is unavailable; falling back to AdaptSim semantic classes.")

    if settings and settings.semantic_anchor_mode == "adapt_sim" and running_null_rhi():
        if target_point_class:
            warn(
                "NullRHI editor placement crashes while spawning ASemanticAnchor in this engine build; "
                "using TargetPoint semantic placeholders."
            )
            return target_point_class, "target_point"

    anchor_class = resolve_unreal_class(
        "SemanticAnchor",
        "/Script/AdaptSim.SemanticAnchor",
        required=False,
    )
    if anchor_class:
        return anchor_class, "modern"

    legacy_class = resolve_unreal_class(
        "AdaptSimSemanticAnchor",
        "/Script/AdaptSim.AdaptSimSemanticAnchor",
        required=False,
    )
    if legacy_class:
        warn("Using legacy AAdaptSimSemanticAnchor; semantic export commandlet expects ASemanticAnchor.")
        return legacy_class, "legacy"

    warn("Semantic anchor class is unavailable; skipping AdaptSim semantic placeholders.")
    return None, "missing"


CURRENT_IMPORT_SETTINGS = None


def running_null_rhi() -> bool:
    try:
        return "-nullrhi" in unreal.SystemLibrary.get_command_line().lower()
    except Exception:
        return False


def configure_semantic_anchor(actor, definition: dict, class_kind: str) -> None:
    try:
        actor.set_actor_location(vector(definition["location"]), sweep=False, teleport=True)
    except TypeError:
        try:
            actor.set_actor_location(vector(definition["location"]), False, True)
        except Exception:
            pass
    except Exception:
        pass

    try:
        actor.set_actor_rotation(rotator(definition["rotation"]), teleport_physics=True)
    except TypeError:
        try:
            actor.set_actor_rotation(rotator(definition["rotation"]), True)
        except Exception:
            pass
    except Exception:
        pass

    try_set_any_editor_property(actor, ("anchor_id", "AnchorId"), unreal_name(definition["id"]))
    try_set_any_editor_property(actor, ("contract_tags", "ContractTags"), unreal_name_array(definition["tags"]))
    try_set_any_editor_property(actor, ("linked_anchor_ids", "LinkedAnchorIds"), unreal_name_array(definition["links"]))
    try_set_any_editor_property(actor, ("navmesh_reachable", "bNavmeshReachable"), True)

    if class_kind == "modern":
        anchor_type = semantic_anchor_type_value(definition["type"])
        if anchor_type:
            try_set_any_editor_property(actor, ("anchor_type", "AnchorType"), anchor_type)
        else:
            warn(f"Could not resolve semantic anchor enum value {definition['type']} for {definition['label']}")
        try_set_any_editor_property(actor, ("display_name", "DisplayName"), definition["display_name"])
        try_set_any_editor_property(actor, ("notes", "Notes"), definition["notes"])
    else:
        if class_kind == "legacy":
            try_set_any_editor_property(actor, ("anchor_type", "AnchorType"), unreal_name(definition["type"]))
            try_set_any_editor_property(actor, ("extent_meters", "ExtentMeters"), unreal.Vector(1.0, 1.0, 1.0))
        else:
            placeholder_tags = [
                "adapt_sim_semantic_placeholder",
                f"anchor_id_{definition['id']}",
                f"anchor_type_{definition['type']}",
            ] + definition["tags"] + definition["links"]
            try_set_any_editor_property(actor, ("tags", "Tags"), unreal_name_array(placeholder_tags))

    try:
        actor.mark_package_dirty()
    except Exception:
        pass


def upsert_semantic_anchors(settings: ImportSettings) -> None:
    if not settings.create_semantic_anchors:
        return

    anchor_class, class_kind = resolve_semantic_anchor_class()
    if not anchor_class:
        return

    log("Ensuring AdaptSim semantic anchor placeholders")
    for definition in SEMANTIC_ANCHOR_DEFS:
        actor = find_actor(definition["label"])
        if actor:
            log(f"Updating semantic anchor {definition['label']}")
        else:
            log(f"Spawning semantic anchor {definition['label']}")
            actor = spawn_actor_from_class(
                anchor_class,
                vector(definition["location"]),
                rotator(definition["rotation"]),
                definition["label"],
            )
        configure_semantic_anchor(actor, definition, class_kind)


def scan_layout_from_settings(settings: ImportSettings) -> dict[str, tuple[float, float, float]]:
    if settings.scan_bounds_min_m and settings.scan_bounds_max_m:
        min_cm = tuple(
            settings.actor_location_cm[index] + settings.scan_bounds_min_m[index] * 100.0 * settings.actor_scale
            for index in range(3)
        )
        max_cm = tuple(
            settings.actor_location_cm[index] + settings.scan_bounds_max_m[index] * 100.0 * settings.actor_scale
            for index in range(3)
        )
        low = tuple(min(min_cm[index], max_cm[index]) for index in range(3))
        high = tuple(max(min_cm[index], max_cm[index]) for index in range(3))
        center = tuple((low[index] + high[index]) / 2.0 for index in range(3))
        extent = tuple(max((high[index] - low[index]) / 2.0, 100.0) for index in range(3))
        return {"min": low, "max": high, "center": center, "extent": extent}

    nav_extent = (
        max(settings.nav_extent_cm[0] / 2.0, 400.0),
        max(settings.nav_extent_cm[1] / 2.0, 400.0),
        max(settings.nav_extent_cm[2] / 2.0, 200.0),
    )
    center = settings.actor_location_cm
    return {
        "min": tuple(center[index] - nav_extent[index] for index in range(3)),
        "max": tuple(center[index] + nav_extent[index] for index in range(3)),
        "center": center,
        "extent": nav_extent,
    }


def yaw_toward(source: tuple[float, float, float], target: tuple[float, float, float]) -> float:
    return math.degrees(math.atan2(target[1] - source[1], target[0] - source[0]))


def scaffold_positions(settings: ImportSettings) -> dict[str, tuple[float, float, float]]:
    layout = scan_layout_from_settings(settings)
    center = layout["center"]
    extent = layout["extent"]
    high = layout["max"]
    low = layout["min"]

    stand_off = max(800.0, min(max(extent[0], extent[1]) * 0.12, 2500.0))
    player = (
        center[0] - extent[0] - stand_off,
        center[1],
        max(low[2] + 180.0, min(high[2] + 180.0, center[2] + max(extent[2] * 0.35, 220.0))),
    )
    player_rotation = (0.0, yaw_toward(player, center), 0.0)

    camera = (
        center[0] - extent[0] * 0.85,
        center[1] - extent[1] * 0.85,
        high[2] + max(800.0, extent[2] * 0.25),
    )
    camera_rotation = (-32.0, yaw_toward(camera, center), 0.0)

    key_light = (
        center[0] - extent[0] * 0.2,
        center[1] - extent[1] * 0.3,
        high[2] + max(1200.0, extent[2] * 0.6),
    )
    nav_center = (
        center[0],
        center[1],
        (low[2] + high[2]) / 2.0,
    )
    return {
        "center": center,
        "extent": extent,
        "player": player,
        "player_rotation": player_rotation,
        "camera": camera,
        "camera_rotation": camera_rotation,
        "key_light": key_light,
        "nav_center": nav_center,
    }


def build_navigation_data() -> bool:
    try:
        if hasattr(unreal, "EditorLevelLibrary") and hasattr(unreal.EditorLevelLibrary, "build_paths"):
            unreal.EditorLevelLibrary.build_paths()
            return True
    except Exception as exc:
        warn(f"Could not build paths through EditorLevelLibrary: {exc}")
    try:
        if hasattr(unreal, "SystemLibrary"):
            unreal.SystemLibrary.execute_console_command(None, "RebuildNavigation")
            return True
    except Exception as exc:
        warn(f"Could not execute RebuildNavigation console command: {exc}")
    return False


def create_demo_scaffold(settings: ImportSettings, meshes: list) -> None:
    if not load_or_create_level(settings.demo_level_path):
        fail(f"Could not load or create demo level {settings.demo_level_path}")

    upsert_scan_actors(meshes, settings)
    positions = scaffold_positions(settings)

    player_start_class = resolve_unreal_class("PlayerStart", "/Script/Engine.PlayerStart")
    directional_light_class = resolve_unreal_class("DirectionalLight", "/Script/Engine.DirectionalLight")
    camera_actor_class = resolve_unreal_class("CameraActor", "/Script/Engine.CameraActor")
    nav_mesh_bounds_class = resolve_unreal_class(
        "NavMeshBoundsVolume",
        "/Script/NavigationSystem.NavMeshBoundsVolume",
        "/Script/Engine.NavMeshBoundsVolume",
    )
    directional_light_component_class = resolve_unreal_class(
        "DirectionalLightComponent", "/Script/Engine.DirectionalLightComponent", required=False
    )
    camera_component_class = resolve_unreal_class("CameraComponent", "/Script/Engine.CameraComponent", required=False)
    sky_light_class = resolve_unreal_class("SkyLight", "/Script/Engine.SkyLight", required=False)
    sky_light_component_class = resolve_unreal_class(
        "SkyLightComponent", "/Script/Engine.SkyLightComponent", required=False
    )

    player_start = ensure_actor(
        "AdaptSim_PlayerStart",
        player_start_class,
        positions["player"],
        positions["player_rotation"],
    )
    log(f"Ensured {actor_label(player_start)}")

    directional_light = ensure_actor(
        "AdaptSim_KeyLight",
        directional_light_class,
        positions["key_light"],
        (-45.0, -35.0, 0.0),
    )
    light_component = (
        first_component(directional_light, directional_light_component_class)
        if directional_light_component_class
        else None
    )
    if light_component:
        try_set_editor_property(light_component, "intensity", 6.0)
    log(f"Ensured {actor_label(directional_light)}")

    camera = ensure_actor(
        "AdaptSim_DemoCamera",
        camera_actor_class,
        positions["camera"],
        positions["camera_rotation"],
    )
    camera_component = first_component(camera, camera_component_class) if camera_component_class else None
    if camera_component:
        try_set_editor_property(camera_component, "field_of_view", 78.0)
    player0 = auto_receive_player0()
    if player0 is not None:
        if not try_set_editor_property(camera, "auto_activate_for_player", player0):
            warn("Could not set AdaptSim_DemoCamera auto_activate_for_player")
    log(f"Ensured {actor_label(camera)}")

    if sky_light_class:
        sky_light = ensure_actor(
            "AdaptSim_SkyLight",
            sky_light_class,
            (positions["center"][0], positions["center"][1], positions["camera"][2]),
            (0.0, 0.0, 0.0),
        )
        sky_component = (
            first_component(sky_light, sky_light_component_class)
            if sky_light_component_class
            else None
        )
        if sky_component:
            try_set_editor_property(sky_component, "intensity", 1.5)
        log(f"Ensured {actor_label(sky_light)}")

    nav_volume = ensure_actor(
        "AdaptSim_NavMeshBounds",
        nav_mesh_bounds_class,
        positions["nav_center"],
        (0.0, 0.0, 0.0),
    )
    try:
        nav_volume.set_actor_scale3d(
            unreal.Vector(
                settings.nav_extent_cm[0] / 100.0,
                settings.nav_extent_cm[1] / 100.0,
                settings.nav_extent_cm[2] / 100.0,
            )
        )
    except Exception:
        pass
    log(f"Ensured {actor_label(nav_volume)}")
    if build_navigation_data():
        log("Navigation data build requested for imported scan level")

    upsert_semantic_anchors(settings)

    if settings.save_assets:
        save_current_level()


def save_current_level() -> None:
    level_subsystem = get_level_subsystem()
    try:
        if level_subsystem and hasattr(level_subsystem, "save_current_level"):
            level_subsystem.save_current_level()
            return
        if hasattr(unreal, "EditorLevelLibrary") and hasattr(unreal.EditorLevelLibrary, "save_current_level"):
            unreal.EditorLevelLibrary.save_current_level()
    except Exception as exc:
        warn(f"Could not save current level: {exc}")


def save_import_directory(path: str) -> None:
    if not hasattr(unreal, "EditorAssetLibrary"):
        warn("EditorAssetLibrary unavailable; imported assets may remain unsaved.")
        return
    try:
        unreal.EditorAssetLibrary.save_directory(path, only_if_is_dirty=False, recursive=True)
    except TypeError:
        try:
            unreal.EditorAssetLibrary.save_directory(path, False, True)
        except Exception as exc:
            warn(f"Could not save import directory {path}: {exc}")
    except Exception as exc:
        warn(f"Could not save import directory {path}: {exc}")


def main() -> None:
    global CURRENT_IMPORT_SETTINGS
    require_unreal()
    settings = parse_args()
    CURRENT_IMPORT_SETTINGS = settings
    log(f"Scan id: {settings.scan_id}")
    log(f"Destination content path: {settings.destination_path}")

    meshes = import_scan(settings)
    if settings.save_assets:
        save_import_directory(settings.destination_path)

    if settings.create_demo_level:
        create_demo_scaffold(settings, meshes)

    log("Scan import automation completed.")


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:
        if unreal:
            unreal.log_error(f"[Scanwright] Failed: {exc}")
        else:
            print(f"[Scanwright][ERROR] {exc}")
        raise
