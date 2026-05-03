# AdaptSim Contracts

This directory holds the hackathon MVP contracts between the web/control API, GCS capture store, A100 reconstruction worker, L4 Unreal import worker, asset database, semantic environment export, planner, Unreal ScenarioDirector, telemetry, and AAR.

The Pydantic models in `contracts/models.py` are the maintainable source of truth. JSON Schema files in `contracts/schemas/` are generated from those models so non-Python code can validate the same shapes.

## Contract Files

- `asset_card`: reviewed asset metadata. Spawnable assets must use `spawn_policy: "scenario_director_whitelist"` and include a reviewed `/Game/...` Unreal asset path.
- `behavior_profile`: planner and runtime behavior names, with the Unreal StateTree, Behavior Tree, Smart Object, or ability asset that implements the profile.
- `capture_metadata`: raw capture metadata written by the control API at `raw/metadata.json`. Owner: web/control API.
- `capture_status`: pollable capture lifecycle status at `status.json` and the matching frontend status response. Owner: control API, updated by A100 and L4 workers.
- `reconstruction_manifest`: A100 output manifest for SfM/FVDB/mesh postprocessing artifacts under `unreal-import/reconstruction_manifest.json`. Owner: A100 reconstruction worker.
- `unreal_import_report`: L4 Unreal import and validation report under `unreal/import_report.json`. Owner: L4 Unreal import worker.
- `asset_generation_request`: minimal request to derive semantic environments, asset cards, or scenario manifests from a reconstructed/imported capture. Owner: control API or planner service.
- `asset_generation_result`: generated-asset references and errors for the request above. Owner: asset/planner generation service.
- `generated_asset_database`: GPT-5.5 output from source intake. Generated cards must be threat-vector assets with `threat_category`, `movement_domain`, `tactical_role`, `visual_generation_prompt`, `runtime_binding_hint`, `spawn_affordances`, `behavior_profile_candidates`, `safety_note: "non-operational training simulation"`, and review-oriented `threat_metadata`.
- `threat_injection_plan`: gameplay intelligence output that explains why generated threat cues are plausible in a semantic environment, where they enter, what they do, trainee objectives, triggers, success criteria, and the ScenarioDirector constraints that keep generated assets metadata-only until review.
- `semantic_anchor`: one tagged room, hallway, door, cover item, exit, no-spawn zone, or other tactical affordance.
- `semantic_environment`: one scanned Unreal level plus anchors and graph edges.
- `scenario_manifest`: planner output consumed by Unreal. Each event includes rationale, trigger, required tags, avoid tags, severity, scenario likelihood under assumptions, and behavior profile.
- `telemetry_event`: one runtime fact emitted by Unreal.
- `after_action_review_input`: bounded input for AAR generation from objectives, assumptions, rubric, and telemetry.

## Capture Reconstruction Contracts

The MVP capture contracts use the verified GCS handoff configuration:

```text
GCS_BUCKET=aiscanners-hackathon2025
GCS_CAPTURE_PREFIX=adaptsim-captures
GCS_SIGNING_SERVICE_ACCOUNT=photogrammetry-test@gecko-dev-fde.iam.gserviceaccount.com
GCS_SIGNING_REGION=us
```

For a capture ID such as `safety_park`, every contract expects the root prefix:

```text
gs://aiscanners-hackathon2025/adaptsim-captures/captures/safety_park/
```

`capture_status.status` and `capture_status.progress.phase` use the shared lifecycle vocabulary from the photo reconstruction docs:

```text
created
uploading
uploaded
queued_reconstruction
validating_images
sfm_solving
sfm_failed
reconstructing_splat
exporting_splat
extracting_mesh
postprocessing_mesh
ready_for_unreal_import
importing_unreal
imported_unreal
ready
failed
```

The A100 worker should publish `reconstruction_manifest` after producing the Unreal-facing mesh artifacts. The L4 worker should publish `unreal_import_report` after import and validation, including level path, imported assets, validation checks, import log URI, and semantic environment URI when available.

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

The checked-in generated asset database fixture is:

- `contracts/examples/generated_asset_databases/threat_vector_asset_database.json`

It intentionally shows threat-vector assets instead of generic props: dismounted
personnel, FPV/quadcopter, UGV/vehicle, USV, inert weapon/equipment visual, and
sensor/payload visual.

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

For imported captures, generate a capture-specific MVP manifest from the capture's own `semantic_environment`; do not return the fixed `scan_hallway_*` manifests for a reconstructed capture:

```bash
python3 contracts/scenario_planner.py /path/to/captures/<capture_id>/unreal/semantic_environment.json \
  --output /path/to/captures/<capture_id>/scenario_manifests/<capture_id>_mvp_001.json
```

The checked-in safety-park MVP pair is:

- Semantic environment: `contracts/examples/semantic_environments/safety_park.json`
- Scenario manifest: `contracts/examples/scenario_manifests/safety_park_mvp_001.json`
- Scenario ID: `safety_park_mvp_001`

Generate the gameplay intelligence layer for the safety-park demo:

```bash
python3 contracts/gameplay_intelligence.py contracts/examples/semantic_environments/safety_park.json \
  --output-dir contracts/examples/gameplay_intelligence/safety_park
```

This writes:

- `contracts/examples/gameplay_intelligence/safety_park/threat_injection_plan.json`
- `contracts/examples/gameplay_intelligence/safety_park/scenario_manifest.json`

The plan may reference generated threat-vector assets such as `fpv_quadcopter_asset` for the vignette. The paired scenario manifest keeps runtime `asset_id` values limited to whitelisted ScenarioDirector assets, carrying generated threat asset IDs only as metadata until Unreal review makes them spawnable.

## Unreal Usage

The ScenarioDirector should validate the manifest before runtime compilation, then resolve every `asset_id` through an explicit whitelist map built from reviewed asset cards, for example `TMap<FName, TSubclassOf<AActor>>` or a data asset keyed by `asset_id`. Unreal should reject any event whose asset is absent from the whitelist, whose behavior profile is not supported, whose required tags cannot be matched by anchors, whose avoid tags would be violated, or whose final spawn candidate fails NavMesh, collision, line-of-sight, or gameplay safety checks. Runtime telemetry should be emitted as `telemetry_event` objects and handed to AAR with the scenario assumptions intact.

## Boundary

The contracts make the planner responsible for explicit scenario intent, assumptions, and rationale; make the asset database responsible for reviewed spawnable IDs and behavior compatibility; make the semantic environment responsible for stable tags and anchors over the scanned level; make Unreal responsible for all physical truth and actual spawning; and make AAR responsible for interpreting only validated manifest context plus telemetry facts.
