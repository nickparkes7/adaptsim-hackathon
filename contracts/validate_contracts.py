#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from pydantic import ValidationError

if __package__ is None or __package__ == "":
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from contracts.models import (
    CONTRACT_MODELS,
    AfterActionReviewInput,
    AssetCard,
    BehaviorProfile,
    SemanticEnvironment,
    TelemetryLog,
)


DYNAMIC_AVOID_TAGS = {
    "occupied",
    "trainee_visible",
    "unsafe_runtime_position",
}


def iter_json_files(path: Path) -> list[Path]:
    if path.is_file():
        return [path]
    files: list[Path] = []
    for candidate in sorted(path.rglob("*.json")):
        if "schemas" in candidate.parts:
            continue
        files.append(candidate)
    return files


def load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"{path}: invalid JSON: {exc}") from exc


def validate_file(path: Path) -> Any:
    data = load_json(path)
    if not isinstance(data, dict):
        raise ValueError(f"{path}: top-level JSON value must be an object")
    contract_type = data.get("contract_type")
    if contract_type not in CONTRACT_MODELS:
        expected = ", ".join(sorted(CONTRACT_MODELS))
        raise ValueError(f"{path}: unknown or missing contract_type {contract_type!r}; expected one of {expected}")
    model = CONTRACT_MODELS[contract_type]
    try:
        return model.model_validate(data)
    except ValidationError as exc:
        raise ValueError(f"{path}: {exc}") from exc


def unique_by(items: list[Any], attr: str, label: str) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for item in items:
        key = getattr(item, attr)
        if key in result:
            raise ValueError(f"duplicate {label}: {key}")
        result[key] = item
    return result


def cross_validate(objects: list[Any]) -> None:
    asset_cards = unique_by([o for o in objects if isinstance(o, AssetCard)], "asset_id", "asset_id")
    profiles = unique_by(
        [o for o in objects if isinstance(o, BehaviorProfile)],
        "behavior_profile_id",
        "behavior_profile_id",
    )
    environments = unique_by(
        [o for o in objects if isinstance(o, SemanticEnvironment)],
        "environment_id",
        "environment_id",
    )
    telemetry_logs = [o for o in objects if isinstance(o, TelemetryLog)]
    aar_inputs = [o for o in objects if isinstance(o, AfterActionReviewInput)]

    for asset in asset_cards.values():
        for profile_id in asset.behavior_profiles:
            if profile_id not in profiles:
                raise ValueError(f"asset {asset.asset_id} references missing behavior_profile {profile_id}")

    for obj in objects:
        if getattr(obj, "contract_type", None) != "scenario_manifest":
            continue
        scenario = obj
        if scenario.environment_id not in environments:
            raise ValueError(f"scenario {scenario.scenario_id} references missing environment {scenario.environment_id}")
        environment = environments[scenario.environment_id]
        anchors = {anchor.anchor_id: anchor for anchor in environment.anchors}
        environment_tags = set()
        for anchor in environment.anchors:
            environment_tags.add(anchor.anchor_type)
            environment_tags.update(anchor.tags)

        for asset_id in scenario.required_asset_ids:
            asset = asset_cards.get(asset_id)
            if not asset:
                raise ValueError(f"scenario {scenario.scenario_id} requires unknown asset_id {asset_id}")
            if asset.spawn_policy != "scenario_director_whitelist":
                raise ValueError(f"scenario {scenario.scenario_id} requires non-spawnable asset_id {asset_id}")

        for event in scenario.events:
            asset = asset_cards.get(event.asset_id)
            if not asset:
                raise ValueError(f"event {event.event_id} references unknown asset_id {event.asset_id}")
            if asset.spawn_policy != "scenario_director_whitelist":
                raise ValueError(f"event {event.event_id} references non-spawnable asset_id {event.asset_id}")
            profile = profiles.get(event.behavior_profile)
            if not profile:
                raise ValueError(f"event {event.event_id} references missing behavior_profile {event.behavior_profile}")
            if event.behavior_profile not in asset.behavior_profiles:
                raise ValueError(
                    f"event {event.event_id} uses behavior_profile {event.behavior_profile} "
                    f"not allowed by asset {event.asset_id}"
                )
            if asset.category not in profile.applies_to_categories:
                raise ValueError(
                    f"event {event.event_id} profile {event.behavior_profile} does not apply to {asset.category}"
                )
            missing_required_tags = set(event.required_tags) - environment_tags
            if missing_required_tags:
                raise ValueError(
                    f"event {event.event_id} required_tags not present in environment "
                    f"{environment.environment_id}: {sorted(missing_required_tags)}"
                )
            unknown_avoid_tags = set(event.avoid_tags) - environment_tags - DYNAMIC_AVOID_TAGS
            if unknown_avoid_tags:
                raise ValueError(f"event {event.event_id} avoid_tags are unknown: {sorted(unknown_avoid_tags)}")
            if event.trigger.anchor_id and event.trigger.anchor_id not in anchors:
                raise ValueError(f"event {event.event_id} trigger references unknown anchor {event.trigger.anchor_id}")

    scenarios = {
        getattr(o, "scenario_id"): o
        for o in objects
        if getattr(o, "contract_type", None) == "scenario_manifest"
    }
    for log in telemetry_logs:
        if log.scenario_id not in scenarios:
            raise ValueError(f"telemetry log {log.run_id} references missing scenario {log.scenario_id}")
        scenario = scenarios[log.scenario_id]
        scenario_event_ids = {event.event_id for event in scenario.events}
        for event in log.events:
            if event.asset_id:
                asset = asset_cards.get(event.asset_id)
                if not asset:
                    raise ValueError(f"telemetry event {event.event_id} references unknown asset_id {event.asset_id}")
                if asset.spawn_policy != "scenario_director_whitelist":
                    raise ValueError(
                        f"telemetry event {event.event_id} references non-spawnable asset_id {event.asset_id}"
                    )
            if event.scenario_event_id and event.scenario_event_id not in scenario_event_ids:
                raise ValueError(
                    f"telemetry event {event.event_id} references unknown scenario_event_id "
                    f"{event.scenario_event_id}"
                )

    for aar in aar_inputs:
        if aar.scenario_id not in scenarios:
            raise ValueError(f"AAR input {aar.run_id} references missing scenario {aar.scenario_id}")
        scenario = scenarios[aar.scenario_id]
        if aar.environment_id != scenario.environment_id:
            raise ValueError(
                f"AAR input {aar.run_id} environment_id {aar.environment_id} does not match scenario "
                f"{scenario.environment_id}"
            )


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate AdaptSim contract JSON files.")
    parser.add_argument(
        "path",
        nargs="?",
        default=str(Path(__file__).resolve().parent / "examples"),
        help="JSON file or directory of JSON examples to validate.",
    )
    parser.add_argument(
        "--no-cross-check",
        action="store_true",
        help="Only validate each file against its model; skip cross-file references.",
    )
    args = parser.parse_args()

    path = Path(args.path).resolve()
    files = iter_json_files(path)
    if not files:
        print(f"No JSON files found under {path}", file=sys.stderr)
        return 1

    objects: list[Any] = []
    errors: list[str] = []
    for file_path in files:
        try:
            objects.append(validate_file(file_path))
        except ValueError as exc:
            errors.append(str(exc))

    if not errors and not args.no_cross_check and len(files) > 1:
        try:
            cross_validate(objects)
        except ValueError as exc:
            errors.append(str(exc))

    if errors:
        print("CONTRACT VALIDATION FAILED", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    counts: dict[str, int] = {}
    for obj in objects:
        counts[getattr(obj, "contract_type")] = counts.get(getattr(obj, "contract_type"), 0) + 1
    summary = ", ".join(f"{key}={value}" for key, value in sorted(counts.items()))
    print(f"OK: validated {len(files)} file(s): {summary}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

