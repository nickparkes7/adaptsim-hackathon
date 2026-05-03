# AdaptSim Generative Asset Pipeline

Last updated: 2026-05-03.

This document describes the two-part workflow that turns uploaded user source
material into a local generated threat-vector asset database and then into
Trellis-ready 3D visual generation jobs.

## Phase 1: Input-Bound Asset Database

The browser prepares this phase as soon as a user finishes adding source files,
then starts generation from Step 04 after the user completes the final check.

```text
Source upload complete
-> Step 04 final check
-> POST /api/generative-assets/sessions
-> local session folder
-> OpenAI Responses API with GPT-5.5
-> asset_database.json
-> intake-agent progress update
```

The local server creates a unique session id from the upload manifest and a
SHA-256 input fingerprint. By default sessions are stored outside Git:

```text
.adaptsim/generated-sessions/<session_id>/
  input_manifest.json
  session.json
  asset_database.json
  trellis_request.json
```

`input_manifest.json` keeps traceability to the specific source file names,
sizes, timestamps, GPS fixes, and available vision/forensic summaries. Raw
uploaded files are not committed to Git. Image data may be included in the
OpenAI request for the first few uploaded images, but the persistent local
session stores the trace manifest and generated database rather than raw image
payloads.

The model call is intentionally generative rather than deterministic. It uses
`OPENAI_ASSET_MODEL`, defaulting to `gpt-5.5`, and structured JSON output for a
`generated_asset_database` object. The database is threat-vector focused, not a
decorative prop list. Asset cards classify each generated asset with
`threat_category`, `movement_domain`, `tactical_role`,
`visual_generation_prompt`, `runtime_binding_hint`, `spawn_affordances`,
`behavior_profile_candidates`, and `safety_note: "non-operational training
simulation"`. The strict server schema also preserves `threat_metadata` and
demo-cache hints used by the local Trellis handoff.

The expected coverage is UAV / FPV drone / quadcopter assets, UGV or vehicle
assets, USV assets when the source context has water or maritime affordances,
inert weapon/equipment visuals, sensor or payload visuals, and dismounted
personnel metadata for the existing Unreal adversary runtime. Trellis candidates
must include detailed visual descriptors:
silhouette, major components, proportions, dimensions in meters, material stack,
texture and color notes, weathering, scene context, and a detail checklist that
should be preserved by the 3D model generator.

Required environment:

```bash
OPENAI_API_KEY=...
OPENAI_ASSET_MODEL=gpt-5.5
OPENAI_ASSET_REASONING_EFFORT=low
ADAPTSIM_SESSION_DIR=.adaptsim/generated-sessions
```

If `OPENAI_API_KEY` is absent, the session is still created and traceable, but
generation is marked failed with a configuration message. No deterministic
fallback database is silently substituted.

## Phase 2: Trellis A100 Generation Request

After `asset_database.json` is generated, the server creates a Trellis request
from `trellis_candidates` and writes:

```text
trellis_request.json
```

This request is the contract for the A100 worker or an optional VM-side relay
service. It contains:

- `contract_type: "trellis_asset_generation_request"`
- `request_id`
- `capture_id`, currently the generated asset session id for local-control
  sessions
- `session_id`
- `requested_at`
- `requester_id: "local_control_api"`
- `input_fingerprint`
- `model: "microsoft/TRELLIS.2-4B"`
- `batch_output_prefix`
- `assets[]` with asset id, display name, threat category, movement domain,
  tactical role, visual generation prompt, runtime binding hint, spawn
  affordances, behavior profile candidates, visual, geometry, material,
  texture, scale, and scene descriptors, a detail checklist, negative prompt,
  target format, resolution, texture size, structured `threat_metadata`, cached
  demo fallback hints, source asset-card metadata, output prefix, and safety
  notes

The same `trellis_request.json` is directly consumable by the A100 worker:

```bash
cd ~/adaptsim
export PATH="$HOME/.local/bin:$PATH"
hf auth whoami

workers/asset-generation/adaptsim-generate-asset \
  --asset-request /path/to/trellis_request.json \
  --gcs-root gs://aiscanners-hackathon2025/adaptsim-captures \
  --work-root ~/adaptsim/data/captures
```

The A100 does not require `OPENAI_API_KEY`; GPT-5.5 generation is complete
before the worker receives the request.

If `TRELLIS_VM_ENDPOINT` is configured, the server relays the request to:

```text
POST {TRELLIS_VM_ENDPOINT}/generate-assets
```

with optional:

```bash
TRELLIS_VM_API_KEY=...
```

If the endpoint is not configured, AdaptSim keeps the request locally with
status `awaiting_vm_endpoint`. Direct A100 worker invocation is the canonical
MVP handoff; `TRELLIS_VM_ENDPOINT` remains an optional HTTP relay for a service
that accepts the same `trellis_asset_generation_request` and queues/runs the
same worker-side generation.

## VM Expectations

The A100 worker should run real Trellis on the GPU and publish generated threat
visual assets, result JSON, reports, and logs to GCS. The relay contract assumes
offline GLB generation, followed by Unreal ingestion and review.

Published batch layout:

```text
gs://aiscanners-hackathon2025/adaptsim-captures/captures/<capture_id>/asset-generation/<request_id>/
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

The `static-props/` directory and `trellis_static_prop_report.json` filename are
legacy compatibility names retained by the current worker and tests. Their
contents are threat-vector visual assets and draft review metadata, not generic
environment props.

The batch report lists concrete GCS paths for the request, result, report, log,
every generated GLB, and every generated asset card. Each per-asset
`asset_generation_result.json` references both the `asset_card` and the
`generated_glb` artifact.

Suggested VM response:

```json
{
  "job_id": "trellis_asset_...",
  "status": "queued",
  "assets": [
    {
      "asset_id": "fpv_quadcopter_recon_visual",
      "status": "queued",
      "output_uri": "gs://.../captures/<capture_id>/asset-generation/<request_id>/assets/fpv_quadcopter_recon_visual/static-props/fpv_quadcopter_recon_visual.glb"
    }
  ]
}
```

## Safety And Product Boundary

The generated database is an authoring aid, not authoritative live-world
intelligence. Generated assets should stay `spawn_policy: "never_spawn"` until
reviewed and mapped to an Unreal `/Game/...` path. The GPT-5.5 prompt now
rejects generic barricades, crates, caution signs, objective placards, and
decorative set dressing as the primary database output. Trellis candidates
should be non-operational visual training assets: UAV/FPV/quadcopter shells,
UGV/vehicle shells, relevant USV hulls, inert weapon/equipment exteriors, and
sensor/payload housings. Dismounted personnel stay as metadata for the existing
Unreal adversary runtime unless a reviewed rigged asset is already available.

Fully rigged humans, identifiable faces, real unit markings, precise weapon
mechanics, targeting aids, sensor exploitation detail, and safety-critical
geometry stay outside the automatic Trellis path.

Relevant upstream references:

- OpenAI GPT-5.5 supports text and image input, Responses API, streaming, tools,
  and structured outputs.
- TRELLIS.2-4B is an offline image-to-3D model with Linux, CUDA, and NVIDIA GPU
  requirements, and the Hugging Face page notes it is not deployed by an
  inference provider.
