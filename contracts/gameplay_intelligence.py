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
    GeneratedAssetDatabase,
    GeneratedAssetDatabaseCard,
    ScenarioManifest,
    SemanticAnchor,
    SemanticEnvironment,
    ThreatInjectionPlan,
)
from contracts.scenario_planner import (
    DEFAULT_GENERATED_AT,
    AnchorIndex,
    PlannerError,
    build_manifest,
    choose_fallback_anchor,
    choose_trigger_anchor,
    default_example_dir,
    dump_manifest,
    load_asset_cards,
    load_behavior_profiles,
    load_environment,
    load_json,
    stable_identifier,
    title_from_identifier,
)


DEFAULT_PLANNER_ID = "planner_gameplay_intelligence"
DEFAULT_GENERATED_DATABASE = (
    Path(__file__).resolve().parent / "examples" / "generated_asset_databases" / "threat_vector_asset_database.json"
)


def load_generated_asset_database(path: Path) -> GeneratedAssetDatabase:
    try:
        return GeneratedAssetDatabase.model_validate(load_json(path))
    except ValidationError as exc:
        raise PlannerError(f"{path}: generated_asset_database validation failed: {exc}") from exc


def path_ref(path: Path) -> str:
    repo_root = Path(__file__).resolve().parents[1]
    resolved = path.resolve()
    try:
        return str(resolved.relative_to(repo_root))
    except ValueError:
        return str(resolved)


def anchor_tags(anchor: SemanticAnchor) -> list[str]:
    tags = list(anchor.tags)
    if anchor.anchor_type not in tags:
        tags.insert(0, anchor.anchor_type)
    return tags


def generated_threat_score(index: AnchorIndex, asset: GeneratedAssetDatabaseCard) -> tuple[int, int, str]:
    environment_tags = index.environment_tags
    matching_affordances = set(asset.spawn_affordances).intersection(environment_tags)
    score = len(matching_affordances) * 10
    if asset.movement_domain == "air" and "line_of_sight" in environment_tags:
        score += 6
    if asset.movement_domain == "ground" and {"hallway", "entry_point"}.intersection(environment_tags):
        score += 3
    if asset.tactical_role in {"recon", "patrol"}:
        score += 2
    return score, asset.threat_metadata.demo_priority, asset.asset_id


def choose_generated_threat(
    environment: SemanticEnvironment,
    generated_database: GeneratedAssetDatabase,
) -> GeneratedAssetDatabaseCard:
    index = AnchorIndex(environment)
    candidates = [asset for asset in generated_database.asset_cards if asset.category == "threat_vector"]
    if not candidates:
        raise PlannerError("generated asset database does not contain any threat_vector asset cards")
    return max(candidates, key=lambda asset: generated_threat_score(index, asset))


def choose_entry_anchor(index: AnchorIndex, asset: GeneratedAssetDatabaseCard) -> SemanticAnchor:
    if asset.movement_domain == "air" or "line_of_sight" in asset.spawn_affordances:
        anchor = index.first_anchor(
            preferred_ids=("observation_point", "hallway_center", "entry"),
            any_tags=("line_of_sight", "observation_point", "hallway", "entry_point"),
            require_reachable=False,
        )
        if anchor:
            return anchor

    if asset.movement_domain == "ground":
        anchor = index.first_anchor(
            preferred_ids=("entry", "hallway_center", "chokepoint"),
            any_tags=("vehicle_route", "open_floor", "hallway", "entry_point"),
        )
        if anchor:
            return anchor

    anchor = index.first_anchor(
        preferred_ids=("entry", "hallway_center", "observation_point"),
        any_tags=("spawn_zone", "line_of_sight", "hallway", "entry_point"),
        require_reachable=False,
    )
    if not anchor:
        raise PlannerError("could not choose an entry anchor for a generated threat asset")
    return anchor


def plausible_factor_strings(
    environment: SemanticEnvironment,
    entry_anchor: SemanticAnchor,
    trigger_anchor: SemanticAnchor,
    fallback_anchor: SemanticAnchor,
    asset: GeneratedAssetDatabaseCard,
) -> list[str]:
    factors = [
        (
            f"{entry_anchor.anchor_id} is tagged with {', '.join(anchor_tags(entry_anchor)[:4])}, "
            f"which matches the {asset.movement_domain} {asset.tactical_role} cue."
        ),
        (
            f"{trigger_anchor.anchor_id} gives ScenarioDirector a deterministic trigger before the trainee "
            "fully commits through the chokepoint."
        ),
        (
            f"{fallback_anchor.anchor_id} remains reachable, so the vignette can pressure recognition "
            "without sealing the route."
        ),
        (
            f"{asset.asset_id} is a generated {asset.threat_category} training visual, so the plan uses it "
            "as non-operational cue metadata until Unreal review whitelists the mesh."
        ),
    ]
    if environment.unreal_level_path:
        factors.append(f"The event is bound to {environment.unreal_level_path} through semantic anchors, not raw coordinates.")
    return factors


def build_threat_injection_plan(
    environment: SemanticEnvironment,
    generated_database: GeneratedAssetDatabase,
    *,
    scenario_id: str | None = None,
    generated_at: str = DEFAULT_GENERATED_AT,
    planner_id: str = DEFAULT_PLANNER_ID,
    semantic_environment_ref: str,
    threat_asset_database_ref: str,
    generated_asset_database_ref: str,
    linked_scenario_manifest: str | None = None,
) -> ThreatInjectionPlan:
    index = AnchorIndex(environment)
    generated_threat = choose_generated_threat(environment, generated_database)
    entry_anchor = choose_entry_anchor(index, generated_threat)
    trigger_anchor = choose_trigger_anchor(index) or entry_anchor
    fallback_anchor = choose_fallback_anchor(index)

    final_scenario_id = scenario_id or stable_identifier(environment.environment_id, "mvp_001")
    injection_id = stable_identifier(f"{environment.environment_id}_{generated_threat.asset_id}", "inject_001")
    trainee_objective = (
        "Recognize the generated FPV threat cue as the trainee reaches the chokepoint, "
        "avoid fixation, identify the ambush contact, and preserve the exit fallback route."
    )
    success_criteria = [
        "Generated FPV cue is presented as a recognition inject tied to a semantic anchor.",
        "Trainee detects or reports the air-threat cue before advancing through the contact area.",
        "Trainee responds to the follow-on contact without blocking or losing the fallback route.",
        "ScenarioDirector telemetry can connect trigger, cue, contact, and outcome events.",
    ]
    trigger_data = {
        "trigger_type": "trainee_enters_anchor",
        "anchor_id": trigger_anchor.anchor_id,
    }
    plan_data: dict[str, Any] = {
        "contract_type": "threat_injection_plan",
        "schema_version": "1.0",
        "plan_id": stable_identifier(environment.environment_id, "threat_injection_plan_001"),
        "scenario_id": final_scenario_id,
        "environment_id": environment.environment_id,
        "planner_id": planner_id,
        "generated_at": generated_at,
        "semantic_environment_ref": semantic_environment_ref,
        "threat_asset_database_ref": threat_asset_database_ref,
        "generated_asset_database_ref": generated_asset_database_ref,
        "scenario_director_constraints": [
            "Scenario manifest event asset_id values remain limited to reviewed ScenarioDirector whitelist assets.",
            "Generated threat-vector assets stay metadata-only until Unreal import validates mesh, scale, collision, and /Game path.",
            "ScenarioDirector must recheck NavMesh, collision, line of sight, route availability, and avoid tags before runtime spawning.",
            "Likelihood values are scenario sampling weights under training assumptions, not calibrated intelligence truth.",
        ],
        "vignette_summary": (
            "The safety_park trainee moves from entry toward the central chokepoint. "
            f"A generated {generated_threat.display_name} cue appears from {entry_anchor.anchor_id} as a reconnaissance warning, "
            "then the whitelisted adversary contact opens from concealment and repositions toward the exit route."
        ),
        "trainee_objective": trainee_objective,
        "assumptions": [
            "The safety_park semantic environment is a placeholder scan import with deterministic tactical anchors.",
            "The generated FPV asset is a non-operational visual recognition cue and is not directly spawned as an actor.",
            "Reviewed fallback assets provide runtime behavior while generated threat metadata carries the vignette context.",
        ],
        "threats": [
            {
                "injection_id": injection_id,
                "generated_asset_id": generated_threat.asset_id,
                "generated_asset_display_name": generated_threat.display_name,
                "threat_category": generated_threat.threat_category,
                "movement_domain": generated_threat.movement_domain,
                "tactical_role": generated_threat.tactical_role,
                "scenario_event_id": "mvp_contact_001",
                "plausibility_factors": plausible_factor_strings(
                    environment,
                    entry_anchor,
                    trigger_anchor,
                    fallback_anchor,
                    generated_threat,
                ),
                "entry_anchor_id": entry_anchor.anchor_id,
                "entry_anchor_tags": anchor_tags(entry_anchor),
                "action_summary": (
                    "Present a short generated FPV reconnaissance cue from the observation line, then use the "
                    "existing ambush behavior to force recognition, communication, cover use, and fallback discipline."
                ),
                "trainee_objective": trainee_objective,
                "trigger": trigger_data,
                "success_criteria": success_criteria,
                "scenario_director_binding": [
                    "metadata_only_generated_visual_until_whitelisted",
                    "runtime_contact_uses_adversary_rifleman_irregular",
                    "contact_triggered_from_chokepoint_anchor",
                    "fallback_route_checked_against_exit_anchor",
                ],
            }
        ],
        "success_criteria": success_criteria,
        "linked_scenario_manifest": linked_scenario_manifest,
    }
    try:
        return ThreatInjectionPlan.model_validate(plan_data)
    except ValidationError as exc:
        raise PlannerError(f"generated threat_injection_plan did not validate: {exc}") from exc


def enrich_manifest_with_plan(manifest: ScenarioManifest, plan: ThreatInjectionPlan) -> ScenarioManifest:
    data = manifest.model_dump(mode="json", exclude_none=True)
    threat = plan.threats[0]
    data["planner_id"] = plan.planner_id
    data["display_name"] = f"{title_from_identifier(plan.environment_id)} Threat Vignette"
    data["training_objective"] = plan.trainee_objective

    assumptions = list(data["assumptions"])
    assumptions.extend(
        [
            (
                f"Generated threat asset {threat.generated_asset_id} is bound as vignette metadata and remains "
                "non-spawnable until Unreal review whitelists it."
            ),
            "The runtime contact still uses reviewed ScenarioDirector whitelist assets for spawn safety.",
        ]
    )
    deduped_assumptions: list[str] = []
    for assumption in assumptions:
        if assumption not in deduped_assumptions:
            deduped_assumptions.append(assumption)
    data["assumptions"] = deduped_assumptions[:12]

    for event in data["events"]:
        parameters = event.setdefault("parameters", {})
        if event["event_id"] == "mvp_barricade_001":
            parameters["vignette_role"] = "slow_scan_before_generated_threat_cue"
        if event["event_id"] == threat.scenario_event_id:
            parameters["threat_injection_id"] = threat.injection_id
            parameters["generated_threat_asset_id"] = threat.generated_asset_id
            parameters["generated_threat_category"] = threat.threat_category
            parameters["generated_threat_entry_anchor"] = threat.entry_anchor_id
            parameters["generated_threat_binding"] = "metadata_only_until_whitelisted"
            event["rationale"] = (
                f"{event['rationale']} The generated {threat.generated_asset_display_name} cue makes the contact "
                "a recognition vignette while keeping runtime spawning on reviewed assets."
            )

    try:
        return ScenarioManifest.model_validate(data)
    except ValidationError as exc:
        raise PlannerError(f"enriched scenario_manifest did not validate: {exc}") from exc


def dump_plan(plan: ThreatInjectionPlan) -> str:
    return json.dumps(plan.model_dump(mode="json", exclude_none=True), indent=2) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Build a gameplay intelligence layer from a semantic_environment, reviewed runtime assets, "
            "and generated threat-vector asset database."
        )
    )
    parser.add_argument("semantic_environment", help="Input semantic_environment JSON file")
    parser.add_argument(
        "--generated-asset-database",
        default=str(DEFAULT_GENERATED_DATABASE),
        help="Input generated_asset_database JSON file.",
    )
    parser.add_argument(
        "--asset-card-dir",
        action="append",
        default=[str(default_example_dir("asset_cards"))],
        help="Directory containing reviewed ScenarioDirector asset_card JSON files. May be repeated.",
    )
    parser.add_argument(
        "--behavior-profile-dir",
        action="append",
        default=[str(default_example_dir("behavior_profiles"))],
        help="Directory containing behavior_profile JSON files. May be repeated.",
    )
    parser.add_argument("--scenario-id", help="Override scenario_id")
    parser.add_argument(
        "--generated-at",
        default=DEFAULT_GENERATED_AT,
        help=f"Output generated_at timestamp. Default: {DEFAULT_GENERATED_AT}",
    )
    parser.add_argument("--planner-id", default=DEFAULT_PLANNER_ID, help=f"Planner id. Default: {DEFAULT_PLANNER_ID}")
    parser.add_argument("--output-dir", help="Directory for threat_injection_plan.json and scenario_manifest.json")
    parser.add_argument("--plan-output", help="Explicit threat_injection_plan JSON output path")
    parser.add_argument("--manifest-output", help="Explicit scenario_manifest JSON output path")
    args = parser.parse_args()

    try:
        environment_path = Path(args.semantic_environment).resolve()
        generated_database_path = Path(args.generated_asset_database).resolve()
        output_dir = Path(args.output_dir).resolve() if args.output_dir else None
        plan_output = Path(args.plan_output).resolve() if args.plan_output else None
        manifest_output = Path(args.manifest_output).resolve() if args.manifest_output else None
        if output_dir:
            plan_output = plan_output or output_dir / "threat_injection_plan.json"
            manifest_output = manifest_output or output_dir / "scenario_manifest.json"

        environment = load_environment(environment_path)
        generated_database = load_generated_asset_database(generated_database_path)
        asset_paths = [Path(path).resolve() for path in args.asset_card_dir]
        profile_paths = [Path(path).resolve() for path in args.behavior_profile_dir]
        assets = load_asset_cards(asset_paths)
        profiles = load_behavior_profiles(profile_paths)

        scenario_id = args.scenario_id or stable_identifier(environment.environment_id, "mvp_001")
        linked_manifest_ref = path_ref(manifest_output) if manifest_output else None
        plan = build_threat_injection_plan(
            environment,
            generated_database,
            scenario_id=scenario_id,
            generated_at=args.generated_at,
            planner_id=args.planner_id,
            semantic_environment_ref=path_ref(environment_path),
            threat_asset_database_ref=", ".join(path_ref(path) for path in asset_paths),
            generated_asset_database_ref=path_ref(generated_database_path),
            linked_scenario_manifest=linked_manifest_ref,
        )
        base_manifest = build_manifest(
            environment,
            assets,
            profiles,
            scenario_id=scenario_id,
            display_name=f"{title_from_identifier(environment.environment_id)} Threat Vignette",
            generated_at=args.generated_at,
            planner_id=args.planner_id,
        )
        manifest = enrich_manifest_with_plan(base_manifest, plan)

        if plan_output:
            plan_output.parent.mkdir(parents=True, exist_ok=True)
            plan_output.write_text(dump_plan(plan), encoding="utf-8")
            print(f"OK: wrote threat_injection_plan {plan.plan_id} to {plan_output}")
        else:
            print(dump_plan(plan), end="")

        if manifest_output:
            manifest_output.parent.mkdir(parents=True, exist_ok=True)
            manifest_output.write_text(dump_manifest(manifest), encoding="utf-8")
            print(f"OK: wrote scenario_manifest {manifest.scenario_id} to {manifest_output}")
        elif not plan_output:
            print(dump_manifest(manifest), end="")
    except PlannerError as exc:
        print(f"GAMEPLAY INTELLIGENCE FAILED: {exc}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
