#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import json
import math
import os
import shlex
import sys
import time
from pathlib import Path

try:
    import unreal
except ImportError:  # pragma: no cover
    unreal = None


def log(message: str) -> None:
    if unreal:
        unreal.log(f"[AdaptSimSceneAudit] {message}")
    else:
        print(f"[AdaptSimSceneAudit] {message}")


def warn(message: str) -> None:
    if unreal:
        unreal.log_warning(f"[AdaptSimSceneAudit] {message}")
    else:
        print(f"[AdaptSimSceneAudit][WARN] {message}")


def fail(message: str) -> None:
    if unreal:
        unreal.log_error(f"[AdaptSimSceneAudit] {message}")
    raise RuntimeError(message)


def command_args(argv: list[str] | None = None) -> list[str]:
    env_args_b64 = os.environ.get("ADAPTSIM_SCENE_AUDIT_ARGS_B64")
    if env_args_b64:
        return shlex.split(base64.b64decode(env_args_b64).decode("utf-8"))
    env_args = os.environ.get("ADAPTSIM_SCENE_AUDIT_ARGS")
    if env_args:
        return shlex.split(env_args)
    return argv if argv is not None else sys.argv[1:]


def parse_args(argv: list[str] | None = None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--map-path", default="/Game/AdaptSim/Maps/L_Reconstructed_safety_park")
    parser.add_argument("--out-dir", default="/home/nicholas.parkes/adaptsim/scene-audits/latest")
    parser.add_argument("--width", type=int, default=960)
    parser.add_argument("--height", type=int, default=540)
    parser.add_argument("--min-nonblack", type=float, default=0.08)
    parser.add_argument("--min-luma-std", type=float, default=0.015)
    parser.add_argument("--min-color-std", type=float, default=0.006)
    parser.add_argument("--max-white", type=float, default=0.88)
    parser.add_argument("--no-fail", action="store_true")
    args, _unknown = parser.parse_known_args(command_args(argv))
    return args


def load_level(level_path: str) -> None:
    subsystem = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    if subsystem and hasattr(subsystem, "load_level"):
        if subsystem.load_level(level_path):
            return
    if hasattr(unreal, "EditorLevelLibrary") and hasattr(unreal.EditorLevelLibrary, "load_level"):
        if unreal.EditorLevelLibrary.load_level(level_path):
            return
    fail(f"Could not load level {level_path}")


def all_actors() -> list:
    subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    if subsystem and hasattr(subsystem, "get_all_level_actors"):
        return list(subsystem.get_all_level_actors())
    if hasattr(unreal, "EditorLevelLibrary"):
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


def vec_tuple(v) -> tuple[float, float, float]:
    return (float(v.x), float(v.y), float(v.z))


def rot_tuple(r) -> tuple[float, float, float]:
    return (float(r.pitch), float(r.yaw), float(r.roll))


def make_rotator(pitch: float, yaw: float, roll: float = 0.0):
    # Unreal Python exposes Rotator positional args as roll, pitch, yaw.
    return unreal.Rotator(float(roll), float(pitch), float(yaw))


def find_actor(label: str):
    for actor in all_actors():
        if actor_label(actor) == label:
            return actor
    return None


def get_component(actor, class_name: str):
    cls = getattr(unreal, class_name, None)
    if not actor or not cls:
        return None
    try:
        return actor.get_component_by_class(cls)
    except Exception:
        return None


def get_actor_bounds(actor) -> tuple[tuple[float, float, float], tuple[float, float, float]]:
    try:
        origin, extent = actor.get_actor_bounds(False)
        return vec_tuple(origin), vec_tuple(extent)
    except Exception:
        return vec_tuple(actor.get_actor_location()), (100.0, 100.0, 100.0)


def look_at_rotation(source: tuple[float, float, float], target: tuple[float, float, float]):
    dx = target[0] - source[0]
    dy = target[1] - source[1]
    dz = target[2] - source[2]
    yaw = math.degrees(math.atan2(dy, dx))
    distance_xy = max(math.hypot(dx, dy), 1.0)
    pitch = math.degrees(math.atan2(dz, distance_xy))
    return make_rotator(pitch, yaw, 0.0)


def spawn_actor(actor_class, location, rotation, label: str):
    actor = None
    if hasattr(unreal, "EditorLevelLibrary"):
        actor = unreal.EditorLevelLibrary.spawn_actor_from_class(actor_class, unreal.Vector(*location), rotation)
    if not actor:
        subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
        if subsystem and hasattr(subsystem, "spawn_actor_from_class"):
            actor = subsystem.spawn_actor_from_class(actor_class, unreal.Vector(*location), rotation)
    if not actor:
        fail(f"Could not spawn {label}")
    try:
        actor.set_actor_label(label, mark_dirty=False)
    except TypeError:
        actor.set_actor_label(label)
    except Exception:
        pass
    return actor


def property_path(obj) -> str | None:
    try:
        return obj.get_path_name() if obj else None
    except Exception:
        return None


def mesh_report(scan_actor) -> dict:
    component = get_component(scan_actor, "StaticMeshComponent")
    mesh = None
    if component:
        try:
            mesh = component.static_mesh
        except Exception:
            try:
                mesh = component.get_static_mesh()
            except Exception:
                mesh = None
    materials = []
    for index in range(8):
        material = None
        if component:
            try:
                material = component.get_material(index)
            except Exception:
                material = None
        if not material and mesh:
            try:
                material = mesh.get_material(index)
            except Exception:
                material = None
        if material:
            materials.append(property_path(material))
    nanite_enabled = None
    if mesh:
        try:
            settings = mesh.get_editor_property("nanite_settings")
            nanite_enabled = bool(
                getattr(settings, "enabled", False) or getattr(settings, "b_enabled", False)
            )
        except Exception:
            nanite_enabled = None
    origin, extent = get_actor_bounds(scan_actor)
    component_scale = None
    if component:
        try:
            component_scale = vec_tuple(component.get_component_scale())
        except Exception:
            try:
                component_scale = vec_tuple(component.get_editor_property("relative_scale3d"))
            except Exception:
                component_scale = None

    return {
        "actor": actor_label(scan_actor) if scan_actor else None,
        "mesh": property_path(mesh),
        "materials": materials,
        "nanite_enabled": nanite_enabled,
        "bounds_origin_cm": origin,
        "bounds_extent_cm": extent,
        "component_scale": component_scale,
    }


def linear_to_tuple(pixel):
    return (float(pixel.r), float(pixel.g), float(pixel.b), float(pixel.a))


def pixel_stats(world, rt, width: int, height: int) -> dict:
    pixels = unreal.RenderingLibrary.read_render_target_raw_pixel_area(world, rt, 0, 0, width - 1, height - 1, True)
    count = len(pixels)
    if not count:
        return {"count": 0, "nonblack_ratio": 0.0, "mean_luma": 0.0, "std_luma": 0.0}
    lumas = []
    nonblack = 0
    saturated = 0
    min_luma = 1e9
    max_luma = -1e9
    sum_luma = 0.0
    sum_sq = 0.0
    sum_rgb = [0.0, 0.0, 0.0]
    sum_sq_rgb = [0.0, 0.0, 0.0]
    sample_step = max(1, count // 200000)
    sampled = 0
    for index in range(0, count, sample_step):
        r, g, b, _a = linear_to_tuple(pixels[index])
        luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
        sampled += 1
        sum_luma += luma
        sum_sq += luma * luma
        for channel_index, value in enumerate((r, g, b)):
            sum_rgb[channel_index] += value
            sum_sq_rgb[channel_index] += value * value
        min_luma = min(min_luma, luma)
        max_luma = max(max_luma, luma)
        if luma > 0.025:
            nonblack += 1
        if r > 0.98 and g > 0.98 and b > 0.98:
            saturated += 1
    mean = sum_luma / sampled
    variance = max(sum_sq / sampled - mean * mean, 0.0)
    mean_rgb = [value / sampled for value in sum_rgb]
    std_rgb = [
        math.sqrt(max(sum_sq_rgb[index] / sampled - mean_rgb[index] * mean_rgb[index], 0.0))
        for index in range(3)
    ]
    return {
        "count": count,
        "sampled": sampled,
        "nonblack_ratio": nonblack / sampled,
        "white_ratio": saturated / sampled,
        "mean_luma": mean,
        "std_luma": math.sqrt(variance),
        "mean_rgb": mean_rgb,
        "std_rgb": std_rgb,
        "color_std": max(std_rgb) - min(std_rgb) + sum(std_rgb) / 3.0,
        "min_luma": min_luma,
        "max_luma": max_luma,
    }


def set_prop(obj, prop: str, value) -> bool:
    try:
        obj.set_editor_property(prop, value)
        return True
    except Exception:
        return False


def render_scene_capture(world, name: str, location, rotation, out_dir: Path, width: int, height: int) -> dict:
    scene_capture_class = getattr(unreal, "SceneCapture2D", None)
    if not scene_capture_class:
        fail("SceneCapture2D class is unavailable")
    capture_actor = spawn_actor(scene_capture_class, location, rotation, f"Audit_{name}")
    capture_component = get_component(capture_actor, "SceneCaptureComponent2D")
    if not capture_component:
        fail("SceneCaptureComponent2D component is unavailable")

    rt_format = getattr(unreal.TextureRenderTargetFormat, "RTF_RGBA8", None) or getattr(unreal.TextureRenderTargetFormat, "RTF_RGBA16F")
    rt = unreal.RenderingLibrary.create_render_target2d(world, width, height, rt_format, unreal.LinearColor(0, 0, 0, 1), False)
    set_prop(rt, "render_target_format", rt_format)
    set_prop(capture_component, "texture_target", rt)
    set_prop(capture_component, "fov_angle", 78.0)
    source_enum = getattr(unreal, "SceneCaptureSource", None)
    if source_enum:
        for token in ("SCS_FINAL_COLOR_LDR", "SCS_FINAL_COLOR_HDR"):
            value = getattr(source_enum, token, None)
            if value is not None:
                set_prop(capture_component, "capture_source", value)
                break
    set_prop(capture_component, "capture_every_frame", False)
    set_prop(capture_component, "capture_on_movement", False)
    try:
        capture_component.capture_scene()
    except Exception as exc:
        warn(f"capture_scene failed for {name}: {exc}")
    # Export and readback. The readback implicitly flushes the render target on editor builds.
    stats = pixel_stats(world, rt, width, height)
    unreal.RenderingLibrary.export_render_target(world, rt, str(out_dir), f"{name}.png")
    try:
        capture_actor.destroy_actor()
    except Exception:
        pass
    return {
        "name": name,
        "location_cm": tuple(float(x) for x in location),
        "rotation_deg": rot_tuple(rotation),
        "png": str(out_dir / f"{name}.png"),
        "stats": stats,
    }


def main() -> None:
    args = parse_args()
    if unreal is None:
        fail("This script must run inside Unreal Python")
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    load_level(args.map_path)
    world = unreal.EditorLevelLibrary.get_editor_world()
    actors = all_actors()
    actor_rows = []
    for actor in actors:
        label = actor_label(actor)
        if label.startswith("AdaptSim") or label.startswith("Scan") or "Adversary" in label:
            actor_rows.append({
                "label": label,
                "class": actor_class_name(actor),
                "location_cm": vec_tuple(actor.get_actor_location()),
                "rotation_deg": rot_tuple(actor.get_actor_rotation()),
            })
    scan_actor = find_actor("Scan_safety_park")
    if not scan_actor:
        scan_actor = next((a for a in actors if actor_label(a).startswith("Scan_")), None)
    if not scan_actor:
        fail("No Scan_* actor found in level")
    scan = mesh_report(scan_actor)
    center = scan["bounds_origin_cm"]
    extent = scan["bounds_extent_cm"]
    radius = max(extent[0], extent[1], 100.0)
    high_z = center[2] + max(extent[2], 100.0)

    camera_specs = []
    demo = find_actor("AdaptSim_DemoCamera")
    if demo:
        camera_specs.append(("demo_camera", vec_tuple(demo.get_actor_location()), demo.get_actor_rotation()))
    player = find_actor("AdaptSim_PlayerStart")
    if player:
        loc = vec_tuple(player.get_actor_location())
        camera_specs.append(("player_start", loc, look_at_rotation(loc, center)))
    oblique_loc = (center[0] - radius * 1.1, center[1] - radius * 1.1, high_z + max(radius * 0.42, 2500.0))
    overhead_loc = (center[0], center[1], high_z + max(radius * 1.4, 6000.0))
    camera_specs.append(("oblique_overview", oblique_loc, look_at_rotation(oblique_loc, center)))
    camera_specs.append(("overhead", overhead_loc, make_rotator(-90.0, 0.0, 0.0)))

    renders = []
    errors = []
    for name, location, rotation in camera_specs:
        try:
            render = render_scene_capture(world, name, location, rotation, out_dir, args.width, args.height)
            stats = render["stats"]
            if stats.get("nonblack_ratio", 0.0) < args.min_nonblack:
                errors.append(f"{name} nonblack ratio too low: {stats.get('nonblack_ratio'):.4f}")
            if stats.get("std_luma", 0.0) < args.min_luma_std:
                errors.append(f"{name} luma std too low: {stats.get('std_luma'):.4f}")
            if stats.get("color_std", 0.0) < args.min_color_std:
                errors.append(f"{name} color std too low: {stats.get('color_std'):.4f}")
            if stats.get("white_ratio", 0.0) > args.max_white:
                errors.append(f"{name} white ratio too high: {stats.get('white_ratio'):.4f}")
            renders.append(render)
        except Exception as exc:
            errors.append(f"{name} render failed: {exc}")
            warn(errors[-1])

    report = {
        "status": "failed" if errors else "passed",
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "map_path": args.map_path,
        "out_dir": str(out_dir),
        "scan": scan,
        "actors": sorted(actor_rows, key=lambda row: row["label"]),
        "renders": renders,
        "errors": errors,
    }
    report_path = out_dir / "scene_audit.json"
    report_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    log(f"Wrote scene audit report: {report_path}")
    if errors and not args.no_fail:
        fail("; ".join(errors))


if __name__ == "__main__":
    main()
