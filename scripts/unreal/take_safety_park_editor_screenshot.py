#!/usr/bin/env python3
"""Take a deterministic editor-rendered screenshot of the Safety Park map."""

from __future__ import annotations

import os
import time

import unreal


MAP_PATH = "/Game/AdaptSim/Maps/L_Reconstructed_safety_park"
CAMERA_LABEL = os.environ.get("ADAPTSIM_SCREENSHOT_CAMERA", "AdaptSim_DemoCamera")
OUT_FILE = os.environ.get("ADAPTSIM_SCREENSHOT_FILE", "/home/nicholas.parkes/adaptsim/scene-audits/editor-safety-park.png")
WIDTH = int(os.environ.get("ADAPTSIM_SCREENSHOT_WIDTH", "1280"))
HEIGHT = int(os.environ.get("ADAPTSIM_SCREENSHOT_HEIGHT", "720"))
DELAY_SECONDS = float(os.environ.get("ADAPTSIM_SCREENSHOT_DELAY", "5.0"))


def log(message: str) -> None:
    unreal.log(f"[AdaptSimEditorScreenshot] {message}")


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


def find_camera():
    for actor in all_actors():
        if actor_label(actor) == CAMERA_LABEL:
            return actor
    raise RuntimeError(f"Could not find camera {CAMERA_LABEL}")


def main() -> None:
    load_level()
    camera = find_camera()
    unreal.AutomationLibrary.finish_loading_before_screenshot()
    task = unreal.AutomationLibrary.take_high_res_screenshot(
        WIDTH,
        HEIGHT,
        OUT_FILE,
        camera=camera,
        delay=DELAY_SECONDS,
        force_game_view=True,
    )
    log(f"Requested screenshot {OUT_FILE} from {CAMERA_LABEL} delay={DELAY_SECONDS}s task={task}")
    # Give the editor task a chance to complete when this script is run from an
    # unattended editor process.
    deadline = time.time() + DELAY_SECONDS + 20.0
    while time.time() < deadline:
        done = False
        for method_name in ("is_task_done", "is_done", "is_complete"):
            method = getattr(task, method_name, None)
            if method:
                try:
                    done = bool(method())
                    break
                except Exception:
                    pass
        if done or os.path.exists(OUT_FILE):
            break
        time.sleep(0.25)
    log(f"Screenshot exists={os.path.exists(OUT_FILE)} path={OUT_FILE}")


if __name__ == "__main__":
    main()
