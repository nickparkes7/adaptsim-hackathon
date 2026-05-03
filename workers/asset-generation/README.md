# A100 Trellis Asset Generation Worker

Target CLI:

```bash
workers/asset-generation/adaptsim-generate-asset \
  --asset-request PATH_OR_GCS_URI \
  --gcs-root gs://aiscanners-hackathon2025/adaptsim-captures
```

This worker is the first-class A100 path for Trellis threat-vector visual
generation. It generates draft GLB candidates from GPT-5.5/database prompts and
publishes artifacts under:

```text
gs://aiscanners-hackathon2025/adaptsim-captures/captures/<capture_id>/asset-generation/<request_id>/
  static-props/
    <asset_id>.glb
    <asset_id>.asset_card.json
  asset_generation_result.json
  trellis_static_prop_report.json
  logs/
```

`static-props/` and `trellis_static_prop_report.json` are legacy compatibility
names in the current worker. Their contents are threat-vector visuals and review
metadata, not generic props.

The generated asset card is intentionally a draft:

- `category: "static_prop"` for legacy prop requests, or `category:
  "threat_vector"` for server-generated threat visuals
- `ingestion_status: "prototype"`
- `spawn_policy: "never_spawn"`

That keeps the main MVP and existing fallback asset paths independent from
Trellis output until Unreal import, scale, pivot, collision, and whitelist review
are complete.

`barricade`, `debris`, and `cover` are legacy regression presets with default
prompts and metadata for old single-asset tests. Server-generated
`trellis_asset_generation_request` payloads should carry threat-vector visuals
instead: UAV / FPV drone / quadcopter visuals, UGV or vehicle visuals, USV
visuals where water affordances exist, inert weapon/equipment visuals, sensor
or payload visuals, and dismounted personnel metadata for the existing Unreal
adversary runtime. The legacy `prop_kind` field is a technical identifier in
that path, not a decorative prop category.
Custom `prop_kind`, `prompt`, `asset_label`, `display_name`, `bounds_m`, and tag
fields are still supported through the simple local JSON request, or through CLI
overrides when using the stricter existing contract.

## Request Shape

Prefer the server-generated batch request. This is the canonical bridge from
`asset_database.json` to Trellis:

```json
{
  "contract_type": "trellis_asset_generation_request",
  "schema_version": "1.0",
  "request_id": "trellis_safety_park_001",
  "capture_id": "safety_park",
  "session_id": "asset_safety_park_demo",
  "requested_at": "2026-05-03T00:00:00Z",
  "requester_id": "local_control_api",
  "model": "microsoft/TRELLIS.2-4B",
  "batch_output_prefix": "gs://aiscanners-hackathon2025/adaptsim-captures/captures/safety_park/asset-generation/trellis_safety_park_001/",
  "assets": [
    {
      "asset_id": "fpv_quadcopter_recon_visual",
      "display_name": "FPV Recon Quadcopter Visual",
      "threat_category": "uav",
      "movement_domain": "air",
      "tactical_role": "recon",
      "prop_kind": "fpv_quadcopter",
      "asset_label": "fpv_quadcopter_recon_visual",
      "prompt": "Non-operational training visual of a compact FPV quadcopter shell with four ductless rotors, protective camera housing, exposed but inert frame geometry, dark composite arms, worn matte finish, and no real unit markings.",
      "negative_prompt": "no working weapon, no targeting UI, no real unit markings, no explosive detail",
      "bounds_m": {"x": 0.45, "y": 0.45, "z": 0.18},
      "runtime_binding_hint": "simple_drone_patrol",
      "allow_cached_demo_output": true,
      "cached_demo_key": "fpv_quadcopter"
    }
  ]
}
```

For legacy compatibility, the worker still accepts the older
`asset_generation_request` contract and a simple local JSON object with
`request_id`, `capture_id`, optional `prompt`, and optional technical metadata:

```json
{
  "request_id": "simple_fpv_visual_001",
  "capture_id": "safety_park",
  "prop_kind": "fpv_quadcopter",
  "asset_label": "fpv_quadcopter_recon_visual",
  "display_name": "FPV Recon Quadcopter Visual",
  "prompt": "Non-operational training visual of a compact FPV quadcopter shell, isolated for Unreal import review.",
  "bounds_m": {"x": 0.45, "y": 0.45, "z": 0.18},
  "gameplay_tags": ["threat_vector", "uav", "training_visual"],
  "capabilities": ["visual_detection_cue"],
  "preferred_affordances": ["open_sky", "tree_line"]
}
```

The same dynamic path can be driven from an `asset_generation_request` by putting
`prompt: ...` in `notes` or passing `--prompt`, `--prop-kind`,
`--asset-label`, `--display-name`, and `--bounds-m` at the CLI.

## Trellis Invocation

Default `--trellis-backend auto` first uses `ADAPTSIM_TRELLIS_COMMAND` when set,
then tries the Microsoft TRELLIS text pipeline from the current Python
environment.

Use a prepared command when Trellis lives in a separate checkout or conda env:

```bash
export ADAPTSIM_TRELLIS_COMMAND='/path/to/python /path/to/run_trellis_asset.py --prompt {prompt} --negative-prompt {negative_prompt} --output-glb {output_glb} --model {model} --seed {seed}'
```

Supported command placeholders:

```text
{prompt} {negative_prompt} {output_glb} {work_dir} {asset_id} {request_json}
{model} {seed} {simplify} {texture_size} {capture_id} {request_id}
```

If Trellis dependencies or model weights are unavailable, the command exits
nonzero, writes `asset_generation_result.json` with `status: "failed"`, writes a
`trellis_static_prop_report.json`, and does not modify fallback asset cards or
paths.

For demos, a server-generated threat candidate can explicitly set
`allow_cached_demo_output: true` with `cached_demo_key` (`fpv_quadcopter`,
`light_ugv`, or `equipment_visual`). When Trellis is unavailable or times out,
the worker publishes that cached GLB, keeps the card `never_spawn`, and records
the cache use in `trellis_static_prop_report.json`.
