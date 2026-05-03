# A100 Trellis Asset Generation Worker

Target CLI:

```bash
workers/asset-generation/adaptsim-generate-asset \
  --asset-request PATH_OR_GCS_URI \
  --gcs-root gs://aiscanners-hackathon2025/adaptsim-captures
```

This worker is optional. It generates a draft static prop candidate on the A100
from a prompt and publishes artifacts under:

```text
gs://aiscanners-hackathon2025/adaptsim-captures/captures/<capture_id>/asset-generation/<request_id>/
  static-props/
    prop_trellis_<kind>_<hash>.glb
    prop_trellis_<kind>_<hash>.asset_card.json
  asset_generation_result.json
  trellis_static_prop_report.json
  logs/
```

The generated asset card is intentionally a draft:

- `category: "static_prop"`
- `ingestion_status: "prototype"`
- `spawn_policy: "never_spawn"`

That keeps the main MVP and existing fallback prop paths independent from
Trellis output until Unreal import, scale, pivot, collision, and whitelist review
are complete.

`barricade`, `debris`, and `cover` are only demo presets with default prompts
and metadata. Custom `prop_kind`, `prompt`, `asset_label`, `display_name`,
`bounds_m`, and tag fields are supported through the simple local JSON request,
or through CLI overrides when using the stricter existing contract.

## Request Shape

Prefer the existing `asset_generation_request` contract:

```json
{
  "contract_type": "asset_generation_request",
  "schema_version": "1.0",
  "request_id": "trellis_barricade_001",
  "capture_id": "safety_park",
  "requested_at": "2026-05-03T00:00:00Z",
  "requester_id": "asset_worker",
  "source": {
    "reconstruction_manifest_uri": "gs://aiscanners-hackathon2025/adaptsim-captures/captures/safety_park/unreal-import/reconstruction_manifest.json"
  },
  "outputs_requested": ["asset_card"],
  "notes": "Optional. Add prompt: ... to override the default barricade prompt."
}
```

For local experiments, the worker also accepts a simple JSON object with
`request_id`, `capture_id`, optional `prompt`, and optional static-prop metadata:

```json
{
  "request_id": "simple_generator_001",
  "capture_id": "safety_park",
  "prop_kind": "portable_generator",
  "asset_label": "portable_generator",
  "display_name": "Generated Portable Generator",
  "prompt": "A rugged portable generator prop with handles, isolated",
  "bounds_m": {"x": 0.9, "y": 0.55, "z": 0.65},
  "gameplay_tags": ["prop", "equipment", "static_prop"],
  "capabilities": ["occupy_space"],
  "preferred_affordances": ["room"]
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
export ADAPTSIM_TRELLIS_COMMAND='/path/to/python /path/to/run_trellis_prop.py --prompt {prompt} --output-glb {output_glb} --model {model} --seed {seed}'
```

Supported command placeholders:

```text
{prompt} {output_glb} {work_dir} {asset_id} {request_json}
{model} {seed} {simplify} {texture_size} {capture_id} {request_id}
```

If Trellis dependencies or model weights are unavailable, the command exits
nonzero, writes `asset_generation_result.json` with `status: "failed"`, writes a
`trellis_static_prop_report.json`, and does not modify fallback asset cards or
paths.
