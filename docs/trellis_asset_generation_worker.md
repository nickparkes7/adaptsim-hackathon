# Trellis Threat-Vector Visual Worker Note

The MVP Trellis slice lives in `workers/asset-generation/` and is a first-class
generation path. It consumes either the existing single-asset
`asset_generation_request` contract or the local-control API's batch
`trellis_asset_generation_request` with `assets[]`, then publishes the existing
`asset_generation_result` contract for each asset plus a batch report.

The worker is prompt-driven. Legacy single-asset requests still expose
`prop_kind` for backward compatibility, but server-generated batch requests now
use it as a technical identifier for threat-vector visuals rather than as
decorative prop framing. The GPT-5.5 database should send UAV / FPV drone /
quadcopter visuals, UGV or vehicle visuals, USV visuals where water affordances
exist, inert weapon/equipment visuals, sensor or payload visuals, and
dismounted personnel metadata for the existing Unreal adversary runtime.

Generated asset cards are marked `ingestion_status: "prototype"` and
`spawn_policy: "never_spawn"` so ScenarioDirector cannot depend on them until a
human or import worker reviews the GLB, imports it into Unreal, sets a
`/Game/...` path, and whitelists it. Threat-vector metadata from the database,
including the structured `threat_metadata` object, `threat_category`,
`movement_domain`, `tactical_role`, `runtime_binding_hint`,
`spawn_affordances`, `behavior_profile_candidates`, and `safety_note`, is
preserved in the generated asset card and report for review.

Current single-asset output layout:

```text
captures/<capture_id>/asset-generation/<request_id>/
  static-props/<asset_id>.glb
  static-props/<asset_id>.asset_card.json
  asset_generation_result.json
  trellis_static_prop_report.json
  logs/
```

Server-generated batch requests write deterministic paths under the
capture/session prefix:

```text
captures/<capture_id>/asset-generation/<request_id>/
  trellis_request.json
  asset_generation_result.json
  trellis_asset_generation_batch_report.json
  logs/asset-generation-batch.log
  assets/<asset_id>/
    static-props/<asset_id>.glb
    static-props/<asset_id>.asset_card.json
    asset_generation_result.json
    trellis_static_prop_report.json
    logs/
```

The `static-props/` folder and `trellis_static_prop_report.json` filename are
legacy compatibility names. Treat them as artifact paths for Trellis-generated
threat-vector visuals; do not infer that the product is generating decorative
props or environmental set dressing.

The report includes explicit scale, pivot, and collision notes:

- Scale: preset meter bounds for the intended Unreal size.
- Pivot: bottom-center floor contact for ground assets, or an authored visual
  origin reviewed by Unreal for aerial/maritime assets.
- Collision: simple box, sphere, or convex blocking/query collision appropriate
  to the reviewed runtime binding before whitelisting.

The dynamic rendering/import boundary is still intentional: the A100 worker
produces GLB candidates and draft metadata; Unreal/L4 remains responsible for
actual runtime import/render validation, collision, scale, and whitelist
activation.

## A100 Command

The GPT-5.5 asset database generation stays on the local control API. The A100
does not need `OPENAI_API_KEY`; it only needs Trellis dependencies, Hugging Face
auth, GCS access, and the `trellis_request.json` file or URI.

On the A100:

```bash
cd ~/adaptsim
export PATH="$HOME/.local/bin:$PATH"
hf auth whoami

workers/asset-generation/adaptsim-generate-asset \
  --asset-request /path/to/trellis_request.json \
  --gcs-root gs://aiscanners-hackathon2025/adaptsim-captures \
  --work-root ~/adaptsim/data/captures
```

`--asset-request` can also be a `gs://.../trellis_request.json` URI. The default
backend uses `ADAPTSIM_TRELLIS_COMMAND` when set, otherwise it attempts the
Microsoft TRELLIS Python text pipeline using `ADAPTSIM_TRELLIS_PYTHON` or the
current Python. If Trellis is not installed/importable, or a command backend is
selected without a command, the worker writes failed per-asset and batch reports
with actionable diagnostics and exits nonzero.

For demo continuity, server-generated threat candidates may set
`allow_cached_demo_output: true` plus a `cached_demo_key` such as
`fpv_quadcopter`, `light_ugv`, or `equipment_visual`. In that marked case only,
the worker publishes a cached GLB if Trellis is unavailable or times out. The
per-asset report records `cached_demo_output.used: true`; rerun on the A100 for
final Trellis output.

Supported command placeholders for an external Trellis wrapper:

```text
{prompt} {negative_prompt} {output_glb} {work_dir} {asset_id} {request_json}
{model} {seed} {simplify} {texture_size} {capture_id} {request_id}
```

## Batch Request Bridge

`trellis_asset_generation_request` is the bridge from `asset_database.json` to
the worker. For each `assets[]` entry the worker derives:

- stable `asset_id`, display name, threat-vector category fields, prompt,
  negative prompt, and target format
- GLB artifact references in `asset_generation_result.json` and explicit GCS
  path lists in `trellis_asset_generation_batch_report.json`
- bounds from `bounds_m` or meter values in `scale_descriptor`
- scale, pivot, and collision notes for Unreal review
- source metadata linking back to the GPT-5.5 asset database and candidate
- deterministic output prefixes under
  `gs://aiscanners-hackathon2025/adaptsim-captures/captures/<capture_id>/asset-generation/<request_id>/`

Generated asset cards remain `ingestion_status: "prototype"` and
`spawn_policy: "never_spawn"` until Unreal import/review whitelists them.

The generated database fixture at
`contracts/examples/generated_asset_databases/threat_vector_asset_database.json`
shows the expected threat-vector shape.
