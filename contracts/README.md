# AdaptSim Contracts

This directory holds the hackathon MVP contracts between the asset database, semantic environment export, planner, Unreal ScenarioDirector, telemetry, and AAR.

The Pydantic models in `contracts/models.py` are the maintainable source of truth. JSON Schema files in `contracts/schemas/` are generated from those models so non-Python code can validate the same shapes.

## Contract Files

- `asset_card`: reviewed asset metadata. Spawnable assets must use `spawn_policy: "scenario_director_whitelist"` and include a reviewed `/Game/...` Unreal asset path.
- `behavior_profile`: planner and runtime behavior names, with the Unreal StateTree, Behavior Tree, Smart Object, or ability asset that implements the profile.
- `semantic_anchor`: one tagged room, hallway, door, cover item, exit, no-spawn zone, or other tactical affordance.
- `semantic_environment`: one scanned Unreal level plus anchors and graph edges.
- `scenario_manifest`: planner output consumed by Unreal. Each event includes rationale, trigger, required tags, avoid tags, severity, scenario likelihood under assumptions, and behavior profile.
- `telemetry_event`: one runtime fact emitted by Unreal.
- `after_action_review_input`: bounded input for AAR generation from objectives, assumptions, rubric, and telemetry.

## Validation

Install the only runtime dependency if needed:

```bash
python3 -m pip install -r contracts/requirements.txt
```

Regenerate JSON Schemas after editing `contracts/models.py`:

```bash
python3 contracts/export_json_schemas.py
```

Validate every example, including cross-file references:

```bash
python3 contracts/validate_contracts.py contracts/examples
```

Validate one file against its individual model:

```bash
python3 contracts/validate_contracts.py contracts/examples/scenario_manifests/scan_hallway_delay_001.json
```

The directory validation fails if a scenario references an unknown asset, a non-whitelisted asset, a behavior profile not allowed by that asset, a missing environment, a missing trigger anchor, or required semantic tags that are not present in the environment export.

## AAR Generator

Generate a concise deterministic markdown AAR from either a `telemetry_log` JSON file or an `after_action_review_input` JSON file:

```bash
python3 contracts/aar_generator.py contracts/examples/telemetry/mock_hallway_delay_log.json \
  --output contracts/examples/aar/mock_hallway_delay_log_aar.md
```

The generator validates the input against `contracts/models.py`, writes observed facts only from telemetry, and marks retry focus as deterministic telemetry-derived coaching. It does not require an LLM.

Run its unit tests:

```bash
python3 -m unittest contracts.test_aar_generator
```

## Planner Usage

The planner should load reviewed `asset_card`, `behavior_profile`, and `semantic_environment` JSON before it generates scenarios. It may score or sample candidate events, but it must output only a `scenario_manifest` with `asset_id` values from the reviewed asset cards, `behavior_profile` values allowed by those assets, and required tags that can be satisfied by the target environment. The `likelihood` field is a scenario sampling weight under the listed assumptions; it must not be presented as calibrated intelligence truth.

## Unreal Usage

The ScenarioDirector should validate the manifest before runtime compilation, then resolve every `asset_id` through an explicit whitelist map built from reviewed asset cards, for example `TMap<FName, TSubclassOf<AActor>>` or a data asset keyed by `asset_id`. Unreal should reject any event whose asset is absent from the whitelist, whose behavior profile is not supported, whose required tags cannot be matched by anchors, whose avoid tags would be violated, or whose final spawn candidate fails NavMesh, collision, line-of-sight, or gameplay safety checks. Runtime telemetry should be emitted as `telemetry_event` objects and handed to AAR with the scenario assumptions intact.

## Boundary

The contracts make the planner responsible for explicit scenario intent, assumptions, and rationale; make the asset database responsible for reviewed spawnable IDs and behavior compatibility; make the semantic environment responsible for stable tags and anchors over the scanned level; make Unreal responsible for all physical truth and actual spawning; and make AAR responsible for interpreting only validated manifest context plus telemetry facts.
