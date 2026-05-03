#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from hashlib import sha1
from pathlib import Path
from typing import Any, Iterable

from pydantic import ValidationError

if __package__ is None or __package__ == "":
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from contracts.models import (
    AssetCard,
    BehaviorProfile,
    ScenarioManifest,
    SemanticAnchor,
    SemanticEnvironment,
)


DEFAULT_GENERATED_AT = "2026-05-03T00:00:00Z"
DEFAULT_PLANNER_ID = "planner_mvp_deterministic"
REQUIRED_FALLBACK_ASSET_IDS = (
    "prop_light_barricade",
    "adversary_rifleman_irregular",
)
STATIC_BLOCKING_PROFILE = "static_blocking_obstacle"
AMBUSH_PROFILE = "ambush_then_reposition"
OBSERVER_PROFILE = "observe_and_withdraw"


class PlannerError(ValueError):
    pass


@dataclass(frozen=True)
class AnchorIndex:
    environment: SemanticEnvironment

    @property
    def anchors_by_id(self) -> dict[str, SemanticAnchor]:
        return {anchor.anchor_id: anchor for anchor in self.environment.anchors}

    @property
    def environment_tags(self) -> set[str]:
        tags: set[str] = set()
        for anchor in self.environment.anchors:
            tags.add(anchor.anchor_type)
            tags.update(anchor.tags)
        return tags

    def has_tags(self, tags: Iterable[str]) -> bool:
        return set(tags).issubset(self.environment_tags)

    def first_anchor(
        self,
        *,
        preferred_ids: Iterable[str] = (),
        all_tags: Iterable[str] = (),
        any_tags: Iterable[str] = (),
        anchor_types: Iterable[str] = (),
        require_reachable: bool = True,
    ) -> SemanticAnchor | None:
        all_tag_set = set(all_tags)
        any_tag_set = set(any_tags)
        type_set = set(anchor_types)

        def matches(anchor: SemanticAnchor) -> bool:
            if require_reachable and not anchor.navmesh_reachable:
                return False
            anchor_tags = set(anchor.tags)
            anchor_tags.add(anchor.anchor_type)
            if all_tag_set and not all_tag_set.issubset(anchor_tags):
                return False
            if any_tag_set and not any_tag_set.intersection(anchor_tags):
                return False
            if type_set and anchor.anchor_type not in type_set:
                return False
            return True

        anchors_by_id = self.anchors_by_id
        for anchor_id in preferred_ids:
            anchor = anchors_by_id.get(anchor_id)
            if anchor and matches(anchor):
                return anchor

        for anchor in self.environment.anchors:
            if matches(anchor):
                return anchor
        return None


def load_json(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise PlannerError(f"{path}: invalid JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise PlannerError(f"{path}: top-level JSON value must be an object")
    return data


def iter_json_files(paths: Iterable[Path]) -> list[Path]:
    files: list[Path] = []
    for path in paths:
        if path.is_dir():
            files.extend(sorted(path.glob("*.json")))
        elif path.is_file():
            files.append(path)
        else:
            raise PlannerError(f"{path}: path does not exist")
    return files


def load_environment(path: Path) -> SemanticEnvironment:
    try:
        return SemanticEnvironment.model_validate(load_json(path))
    except ValidationError as exc:
        raise PlannerError(f"{path}: semantic_environment validation failed: {exc}") from exc


def load_asset_cards(paths: Iterable[Path]) -> dict[str, AssetCard]:
    assets: dict[str, AssetCard] = {}
    for path in iter_json_files(paths):
        data = load_json(path)
        if data.get("contract_type") != "asset_card":
            continue
        try:
            asset = AssetCard.model_validate(data)
        except ValidationError as exc:
            raise PlannerError(f"{path}: asset_card validation failed: {exc}") from exc
        if asset.asset_id in assets:
            raise PlannerError(f"duplicate asset_card asset_id: {asset.asset_id}")
        assets[asset.asset_id] = asset
    return assets


def load_behavior_profiles(paths: Iterable[Path]) -> dict[str, BehaviorProfile]:
    profiles: dict[str, BehaviorProfile] = {}
    for path in iter_json_files(paths):
        data = load_json(path)
        if data.get("contract_type") != "behavior_profile":
            continue
        try:
            profile = BehaviorProfile.model_validate(data)
        except ValidationError as exc:
            raise PlannerError(f"{path}: behavior_profile validation failed: {exc}") from exc
        if profile.behavior_profile_id in profiles:
            raise PlannerError(f"duplicate behavior_profile_id: {profile.behavior_profile_id}")
        profiles[profile.behavior_profile_id] = profile
    return profiles


def require_asset(assets: dict[str, AssetCard], asset_id: str) -> AssetCard:
    asset = assets.get(asset_id)
    if not asset:
        raise PlannerError(f"missing reviewed fallback asset card: {asset_id}")
    if asset.spawn_policy != "scenario_director_whitelist":
        raise PlannerError(f"fallback asset {asset_id} is not whitelisted for ScenarioDirector spawning")
    return asset


def require_profile(
    profiles: dict[str, BehaviorProfile],
    asset: AssetCard,
    profile_id: str,
) -> BehaviorProfile:
    profile = profiles.get(profile_id)
    if not profile:
        raise PlannerError(f"missing behavior profile: {profile_id}")
    if profile_id not in asset.behavior_profiles:
        raise PlannerError(f"asset {asset.asset_id} does not allow behavior profile {profile_id}")
    if asset.category not in profile.applies_to_categories:
        raise PlannerError(f"behavior profile {profile_id} does not apply to asset category {asset.category}")
    return profile


def stable_identifier(base: str, suffix: str) -> str:
    cleaned = "".join(char if char.isalnum() or char == "_" else "_" for char in base.lower())
    cleaned = cleaned.strip("_") or "scenario"
    candidate = f"{cleaned}_{suffix}"
    if len(candidate) <= 64:
        return candidate
    digest = sha1(candidate.encode("utf-8")).hexdigest()[:8]
    return f"{cleaned[: 64 - len(digest) - 1]}_{digest}"


def title_from_identifier(identifier: str) -> str:
    return " ".join(part.capitalize() for part in identifier.split("_") if part)


def scenario_weight(asset: AssetCard, tags: Iterable[str], base: float) -> float:
    weight = base
    tag_set = set(tags)
    for tag in sorted(tag_set):
        weight *= asset.likelihood_modifiers.get(tag, 1.0)
    if "fallback_route" in tag_set:
        weight *= asset.likelihood_modifiers.get("has_fallback_route", 1.0)
    return round(max(0.05, min(0.95, weight)), 2)


def anchor_tag_set(anchor: SemanticAnchor) -> set[str]:
    tags = set(anchor.tags)
    tags.add(anchor.anchor_type)
    return tags


def required_tags_from_anchor(anchor: SemanticAnchor, candidates: list[str], *, minimum: int = 1) -> list[str]:
    available = anchor_tag_set(anchor)
    tags = [tag for tag in candidates if tag in available]
    if len(tags) < minimum:
        raise PlannerError(
            f"anchor {anchor.anchor_id} is missing enough placement tags; "
            f"needed at least {minimum} of {candidates}, found {tags}"
        )
    return tags


def build_barricade_event(index: AnchorIndex, asset: AssetCard) -> dict[str, Any]:
    barricade_anchor = index.first_anchor(
        preferred_ids=("chokepoint", "door_side_room", "hallway_center", "hallway_main"),
        any_tags=("chokepoint", "near_chokepoint", "hallway"),
    )
    if barricade_anchor is None:
        raise PlannerError("could not find a reachable hallway/chokepoint anchor for prop_light_barricade")
    require_tags = required_tags_from_anchor(
        barricade_anchor,
        ["chokepoint", "near_chokepoint", "hallway"],
        minimum=1,
    )

    avoid_tags = ["no_spawn_zone"] if "no_spawn_zone" in index.environment_tags else []
    return {
        "event_id": "mvp_barricade_001",
        "event_type": "static_prop_spawn",
        "asset_id": asset.asset_id,
        "count": 1,
        "intent": "shape_movement",
        "required_tags": require_tags,
        "avoid_tags": avoid_tags,
        "severity": 0.4,
        "likelihood": scenario_weight(asset, require_tags, 0.34),
        "likelihood_basis": "scenario_likelihood_under_assumptions",
        "behavior_profile": STATIC_BLOCKING_PROFILE,
        "trigger": {
            "trigger_type": "on_scenario_start",
        },
        "rationale": (
            f"{barricade_anchor.anchor_id} provides a deterministic placement hint for a light barricade "
            "that shapes movement while ScenarioDirector keeps a traversable route open."
        ),
        "parameters": {
            "anchor_hint": barricade_anchor.anchor_id,
            "leave_clear_width_m": 1.1,
            "require_route_check": True,
        },
    }


def choose_fallback_anchor(index: AnchorIndex) -> SemanticAnchor:
    fallback = index.first_anchor(
        preferred_ids=("exit", "exit_rear"),
        any_tags=("fallback_route", "exit"),
        anchor_types=("exit",),
    )
    if fallback is None:
        fallback = index.first_anchor(any_tags=("fallback_route",))
    if fallback is None:
        raise PlannerError("could not find a reachable exit or fallback_route anchor")
    return fallback


def choose_trigger_anchor(index: AnchorIndex) -> SemanticAnchor | None:
    return index.first_anchor(
        preferred_ids=("chokepoint", "hallway_center", "hallway_main", "entry", "entry_primary"),
        any_tags=("chokepoint", "near_chokepoint", "hallway", "entry_point"),
    )


def choose_adversary_plan(index: AnchorIndex, asset: AssetCard) -> tuple[str, list[str], SemanticAnchor]:
    if index.has_tags(("concealment", "near_chokepoint", "fallback_route")):
        anchor = (
            index.first_anchor(preferred_ids=("ambush_point",), any_tags=("ambush_point",))
            or index.first_anchor(all_tags=("concealment", "fallback_route"))
            or index.first_anchor(all_tags=("concealment", "cover", "line_of_sight"))
            or index.first_anchor(all_tags=("concealment", "cover"))
            or index.first_anchor(any_tags=("concealment",))
        )
        if anchor is None:
            raise PlannerError("could not find a reachable concealment anchor for adversary placement")
        required = required_tags_from_anchor(
            anchor,
            ["ambush_point", "concealment", "cover", "fallback_route", "line_of_sight"],
            minimum=2 if "ambush_point" in anchor_tag_set(anchor) else 1,
        )
        return AMBUSH_PROFILE, required, anchor

    if index.has_tags(("line_of_sight", "cover", "fallback_route")):
        anchor = (
            index.first_anchor(preferred_ids=("observation_point",), any_tags=("observation_point",))
            or index.first_anchor(all_tags=("line_of_sight", "cover"))
            or index.first_anchor(all_tags=("line_of_sight",))
        )
        if anchor is None:
            raise PlannerError("could not find a reachable line_of_sight anchor for adversary placement")
        required = required_tags_from_anchor(
            anchor,
            ["observation_point", "line_of_sight", "cover", "fallback_route"],
            minimum=1,
        )
        return OBSERVER_PROFILE, required, anchor

    raise PlannerError(
        "semantic environment needs either concealment+near_chokepoint+fallback_route "
        "or line_of_sight+cover+fallback_route for the MVP adversary event"
    )


def build_adversary_event(index: AnchorIndex, asset: AssetCard) -> dict[str, Any]:
    behavior_profile, require_tags, adversary_anchor = choose_adversary_plan(index, asset)
    fallback_anchor = choose_fallback_anchor(index)
    trigger_anchor = choose_trigger_anchor(index)
    avoid_tags = ["trainee_visible"]
    if "no_spawn_zone" in index.environment_tags:
        avoid_tags.append("no_spawn_zone")

    trigger: dict[str, Any]
    if trigger_anchor:
        trigger = {
            "trigger_type": "trainee_enters_anchor",
            "anchor_id": trigger_anchor.anchor_id,
        }
    else:
        trigger = {
            "trigger_type": "timer_elapsed",
            "delay_s": 6.0,
        }

    is_ambush = behavior_profile == AMBUSH_PROFILE
    return {
        "event_id": "mvp_contact_001",
        "event_type": "adversary_contact",
        "asset_id": asset.asset_id,
        "count": 2 if is_ambush else 1,
        "intent": "delay_and_reposition" if is_ambush else "observe_and_withdraw",
        "required_tags": require_tags,
        "avoid_tags": avoid_tags,
        "severity": 0.74 if is_ambush else 0.56,
        "likelihood": scenario_weight(asset, require_tags, 0.32 if is_ambush else 0.3),
        "likelihood_basis": "scenario_likelihood_under_assumptions",
        "behavior_profile": behavior_profile,
        "trigger": trigger,
        "rationale": (
            f"{adversary_anchor.anchor_id} supplies the deterministic adversary placement hint, "
            f"and {fallback_anchor.anchor_id} supplies the fallback route for the training inject."
        ),
        "max_distance_to_trainee_m": 18.0 if is_ambush else 20.0,
        "parameters": {
            "anchor_hint": adversary_anchor.anchor_id,
            "fallback_anchor_hint": fallback_anchor.anchor_id,
            "minimum_separation_m": 6.0,
            "reposition_after_contact_s": 5.0,
            "withdraw_when_detected": not is_ambush,
        },
    }


def build_manifest(
    environment: SemanticEnvironment,
    assets: dict[str, AssetCard],
    profiles: dict[str, BehaviorProfile],
    *,
    scenario_id: str | None = None,
    display_name: str | None = None,
    generated_at: str = DEFAULT_GENERATED_AT,
    planner_id: str = DEFAULT_PLANNER_ID,
) -> ScenarioManifest:
    index = AnchorIndex(environment)
    prop_asset = require_asset(assets, "prop_light_barricade")
    adversary_asset = require_asset(assets, "adversary_rifleman_irregular")
    require_profile(profiles, prop_asset, STATIC_BLOCKING_PROFILE)
    require_profile(profiles, adversary_asset, AMBUSH_PROFILE)
    require_profile(profiles, adversary_asset, OBSERVER_PROFILE)

    final_scenario_id = scenario_id or stable_identifier(environment.environment_id, "mvp_001")
    final_display_name = display_name or f"{title_from_identifier(environment.environment_id)} MVP Deterministic"
    events = [
        build_barricade_event(index, prop_asset),
        build_adversary_event(index, adversary_asset),
    ]
    manifest_data = {
        "contract_type": "scenario_manifest",
        "schema_version": "1.0",
        "scenario_id": final_scenario_id,
        "environment_id": environment.environment_id,
        "display_name": final_display_name,
        "planner_id": planner_id,
        "generated_at": generated_at,
        "training_objective": (
            "Move through the imported scene, recognize a deterministic movement-shaping obstacle, "
            "detect adversary contact, and preserve a viable fallback or exit route."
        ),
        "assumptions": [
            "The semantic environment export identifies reachable hallway, chokepoint or observation, cover/concealment, and fallback affordances.",
            "ScenarioDirector will perform final NavMesh, collision, line-of-sight, and route-safety checks before runtime spawning.",
            "Fallback assets are reviewed whitelisted ScenarioDirector assets: prop_light_barricade and adversary_rifleman_irregular.",
            "Likelihood values are deterministic scenario sampling weights under these training assumptions, not calibrated intelligence truth.",
        ],
        "likelihood_semantics": "scenario_likelihood_under_assumptions_not_calibrated_intelligence_truth",
        "required_asset_ids": list(REQUIRED_FALLBACK_ASSET_IDS),
        "events": events,
    }
    try:
        return ScenarioManifest.model_validate(manifest_data)
    except ValidationError as exc:
        raise PlannerError(f"generated scenario_manifest did not validate: {exc}") from exc


def dump_manifest(manifest: ScenarioManifest) -> str:
    data = manifest.model_dump(mode="json", exclude_none=True)
    return json.dumps(data, indent=2) + "\n"


def default_example_dir(name: str) -> Path:
    return Path(__file__).resolve().parent / "examples" / name


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Emit one deterministic MVP scenario_manifest from a semantic_environment plus "
            "reviewed AdaptSim asset cards and behavior profiles."
        )
    )
    parser.add_argument("semantic_environment", help="Input semantic_environment JSON file")
    parser.add_argument(
        "--asset-card-dir",
        action="append",
        default=[str(default_example_dir("asset_cards"))],
        help="Directory containing asset_card JSON files. May be repeated.",
    )
    parser.add_argument(
        "--asset-card",
        action="append",
        default=[],
        help="Specific asset_card JSON file. May be repeated.",
    )
    parser.add_argument(
        "--behavior-profile-dir",
        action="append",
        default=[str(default_example_dir("behavior_profiles"))],
        help="Directory containing behavior_profile JSON files. May be repeated.",
    )
    parser.add_argument(
        "--behavior-profile",
        action="append",
        default=[],
        help="Specific behavior_profile JSON file. May be repeated.",
    )
    parser.add_argument("--scenario-id", help="Override generated scenario_id")
    parser.add_argument("--display-name", help="Override generated display_name")
    parser.add_argument(
        "--generated-at",
        default=DEFAULT_GENERATED_AT,
        help=f"Manifest generated_at timestamp. Default: {DEFAULT_GENERATED_AT}",
    )
    parser.add_argument("--planner-id", default=DEFAULT_PLANNER_ID, help=f"Planner id. Default: {DEFAULT_PLANNER_ID}")
    parser.add_argument("-o", "--output", help="Output scenario_manifest JSON path. Defaults to stdout.")
    args = parser.parse_args()

    try:
        environment = load_environment(Path(args.semantic_environment).resolve())
        asset_paths = [Path(path).resolve() for path in args.asset_card_dir + args.asset_card]
        profile_paths = [Path(path).resolve() for path in args.behavior_profile_dir + args.behavior_profile]
        assets = load_asset_cards(asset_paths)
        profiles = load_behavior_profiles(profile_paths)
        manifest = build_manifest(
            environment,
            assets,
            profiles,
            scenario_id=args.scenario_id,
            display_name=args.display_name,
            generated_at=args.generated_at,
            planner_id=args.planner_id,
        )
        output = dump_manifest(manifest)
        if args.output:
            output_path = Path(args.output).resolve()
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(output, encoding="utf-8")
            print(f"OK: wrote scenario_manifest {manifest.scenario_id} to {output_path}")
        else:
            print(output, end="")
    except PlannerError as exc:
        print(f"SCENARIO PLANNER FAILED: {exc}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
