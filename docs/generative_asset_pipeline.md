# AdaptSim Generative Asset Pipeline

Last updated: 2026-05-03.

This document describes the two-part workflow that turns uploaded user source
material into a local generated asset database and then into Trellis-ready 3D
asset generation jobs.

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
`generated_asset_database` object. Trellis candidates must include detailed
static-object descriptors: silhouette, major components, proportions,
dimensions in meters, material stack, texture and color notes, weathering,
scene context, and a detail checklist that should be preserved by the 3D model
generator.

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

## Phase 2: Trellis VM Relay

After `asset_database.json` is generated, the server creates a Trellis request
from `trellis_candidates` and writes:

```text
trellis_request.json
```

This request is the contract for the VM-side service. It contains:

- `session_id`
- `input_fingerprint`
- `model: "microsoft/TRELLIS.2-4B"`
- `assets[]` with asset id, display name, detailed generation prompt, visual,
  geometry, material, texture, scale, and scene descriptors, a detail checklist,
  negative prompt, target format, resolution, texture size, output prefix, and
  safety notes

If `TRELLIS_VM_ENDPOINT` is configured, the server relays the request to:

```text
POST {TRELLIS_VM_ENDPOINT}/generate-assets
```

with optional:

```bash
TRELLIS_VM_API_KEY=...
```

If the endpoint is not configured, AdaptSim keeps the request locally with
status `awaiting_vm_endpoint`. This is expected while VM credentials are not
available.

## VM Expectations

The VM service should run TRELLIS.2-4B on the GPU worker and return job status,
not generated binary assets inline. The relay contract assumes offline static
asset generation, followed by Unreal ingestion and review.

Suggested VM response:

```json
{
  "job_id": "trellis_asset_...",
  "status": "queued",
  "assets": [
    {
      "asset_id": "prop_light_barricade",
      "status": "queued",
      "output_uri": "gs://.../generated-assets/<session_id>/prop_light_barricade/asset.glb"
    }
  ]
}
```

## Safety And Product Boundary

The generated database is an authoring aid, not authoritative live-world
intelligence. Generated assets should stay `spawn_policy: "never_spawn"` until
reviewed and mapped to an Unreal `/Game/...` path. Trellis candidates should
focus on static props, obstacles, markers, equipment, cover, concealment, and
decorative/training objects. Fully rigged humans, precise weapon mechanics, and
safety-critical geometry should stay outside the automatic Trellis path.

Relevant upstream references:

- OpenAI GPT-5.5 supports text and image input, Responses API, streaming, tools,
  and structured outputs.
- TRELLIS.2-4B is an offline image-to-3D model with Linux, CUDA, and NVIDIA GPU
  requirements, and the Hugging Face page notes it is not deployed by an
  inference provider.
