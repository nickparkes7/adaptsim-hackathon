# AdaptSim Web App Integration Spec

This is the web integration contract for the hackathon MVP where the frontend
creates captures, uploads images directly to GCS, starts the generated threat
asset database, hands Trellis threat visuals to the A100 path, shows the
gameplay intelligence layer, launches an Unreal Pixel Streaming session, and
retrieves telemetry plus AAR artifacts.

For the persistent photo reconstruction plan and VM handoff details, see
`docs/photo_reconstruction_pipeline.md`.

For the input-bound generated asset database and Trellis relay path, see
`docs/generative_asset_pipeline.md`.

## Current Frontend Surface

The AdaptSim frontend now lives in this repo:

```text
apps/web/
```

It is a React + Vite app. Local commands:

```bash
npm --workspace @adaptsim/web run dev
npm --workspace @adaptsim/web run check
```

Key frontend files:

- `apps/web/src/App.jsx`: renders the capture-to-simulation lane above the
  existing workbench.
- `apps/web/src/components/CaptureSimulationFlow.jsx`: capture creation, direct
  GCS upload, reconstruction polling, generated asset database status, Trellis
  threat visual status, threat injection plan, scenario launch, Pixel Streaming
  embed/link, telemetry, artifacts, and AAR preview.
- `apps/web/src/lib/adaptsimApi.js`: live API client plus
  `VITE_ADAPTSIM_API_MODE=mock` and `auto` mock-fallback support.
- `apps/web/src/lib/adaptsimWorkbench.js`: partner workbench/intake flow for
  source analysis and generated threat asset database production.

## Existing Demo Inputs

The preferred three-minute demo path presents the cached `safety_park` capture
and threat-injection layer from these existing files:

- Scene: `contracts/examples/semantic_environments/safety_park.json`
- Scenario: `contracts/examples/scenario_manifests/safety_park_mvp_001.json`
- Threat asset database:
  `contracts/examples/generated_asset_databases/threat_vector_asset_database.json`
- Threat injection plan:
  `contracts/examples/gameplay_intelligence/safety_park/threat_injection_plan.json`
- Paired generated scenario:
  `contracts/examples/gameplay_intelligence/safety_park/scenario_manifest.json`

The horror corridor remains the legacy Unreal/ScenarioDirector fallback proof:

- Scene: `contracts/examples/semantic_environments/scanned_hallway_alpha.json`
- Scenarios:
  - `contracts/examples/scenario_manifests/scan_hallway_delay_001.json`
  - `contracts/examples/scenario_manifests/scan_hallway_observer_002.json`
- Telemetry: `contracts/examples/telemetry/mock_hallway_delay_log.json`
- AAR: `contracts/examples/aar/mock_hallway_delay_log_aar.md`

For user-facing labels, treat `safety_park` as the cached generated-environment
MVP and `scan_hallway_alpha` as the horror corridor / scanned hallway fallback.

## Frontend Runtime Expectations

The frontend should use:

- `VITE_ADAPTSIM_API_BASE`, default `http://127.0.0.1:8787/api/v1`
- `VITE_ADAPTSIM_SCENE_ID`, default `scan_hallway_alpha`; set to
  `safety_park` for the cached golden demo path.
- `VITE_ADAPTSIM_CACHED_SCENE_ID`, default `safety_park`.
- `VITE_ADAPTSIM_FAST_FORWARD_RECONSTRUCTION`, default `1`. Set to `0` to
  default the UI to live fVDB reconstruction instead of the presenter
  checkpoint.
- `VITE_ADAPTSIM_API_MODE`, optional `live`, `mock`, or `auto`.

The frontend should not hard-code the Pixel Streaming URL. It should ask the backend for a stream URL after launch.

For a local demo, the backend can be configured with:

- `ADAPTSIM_PIXEL_STREAM_URL=http://127.0.0.1:8080/`

That URL should point at whatever local tunnel, reverse proxy, or Pixel Streaming web server exposes the `linux-pixel-streaming` Unreal VM. If the Pixel Streaming service is exposed on a different local port, change only the backend setting and keep the frontend unchanged.

## Minimal UI Flow

Existing scene playback flow:

1. Scene detail view calls `GET /scenes/{scene_id}/status`.
2. Scenario panel calls `GET /scenes/{scene_id}/scenarios`.
3. Threat intelligence panel calls
   `GET /scenes/{scene_id}/threat-injection-plan`. If the live endpoint is not
   available and mock fallback is enabled, the frontend uses the checked-in
   safety-park fixture.
4. User selects a scenario and clicks launch.
5. Frontend calls `POST /scenes/{scene_id}/scenarios/{scenario_id}/launch`.
6. Frontend polls `GET /runs/{run_id}/stream` until `stream.status` is `ready`.
7. Frontend embeds `stream.embed_url` in an iframe or opens it in a new tab.
8. During or after the run, frontend reads `GET /runs/{run_id}/telemetry`.
9. After completion, frontend reads `GET /runs/{run_id}/artifacts` and `GET /runs/{run_id}/aar`.

Photo reconstruction flow:

1. User creates a capture with display name, environment notes, expected image count, and scale hint.
2. Frontend calls `POST /captures`.
3. Frontend calls `POST /captures/{capture_id}/upload-urls`.
4. Browser uploads images directly to GCS using signed URLs.
5. In live reconstruction mode, frontend calls
   `POST /captures/{capture_id}/submit` with `start_reconstruction: true`.
6. In presenter fast-forward mode, frontend calls the same submit endpoint with
   `start_reconstruction: false`, records the uploaded source capture as
   `uploaded`, then loads the verified cached checkpoint
   `VITE_ADAPTSIM_CACHED_SCENE_ID`.
7. Frontend polls `GET /captures/{capture_id}/status`.
8. A100 worker produces splat and mesh artifacts under GCS.
9. When the control API observes `ready_for_unreal_import`, it writes
   `importing_unreal` and triggers the L4 Unreal worker.
10. L4 Unreal worker imports `unreal-import/scene_mesh.glb`.
11. Frontend switches to scene playback once status is `ready`.

Generative asset flow:

1. User finishes dropping photos, videos, or source data.
2. Frontend immediately calls `POST /api/generative-assets/sessions`.
3. Backend stores a unique local session under `.adaptsim/generated-sessions/`.
4. Backend calls OpenAI GPT-5.5 through the Responses API to produce a structured
   generated threat-vector asset database.
5. Backend writes `asset_database.json`.
6. Backend writes `trellis_request.json` with
   `contract_type: "trellis_asset_generation_request"`.
7. Direct A100 worker invocation is the canonical MVP handoff. If
   `TRELLIS_VM_ENDPOINT` is configured, the backend can also relay the same
   request to a VM-side service with `POST {TRELLIS_VM_ENDPOINT}/generate-assets`.

Current implementation note: the frontend already calls
`GET /scenes/{scene_id}/threat-injection-plan` and falls back to the
checked-in safety-park fixture when the live endpoint is absent or returns
`404`/server errors in mock-fallback mode. A server-side implementation should
serve `contracts/examples/gameplay_intelligence/<scene_id>/threat_injection_plan.json`
or a capture-specific planner output from the same contract.

## Minimal API Contract

All responses use JSON except direct artifact downloads. IDs should match the existing contract examples.

### `GET /scenes/{scene_id}/status`

Returns the current scene compilation and stream readiness status.

Required response fields:

```json
{
  "scene_id": "scan_hallway_alpha",
  "display_name": "Horror Corridor",
  "status": "ready",
  "source_scan_id": "scan_hallway_alpha_raw",
  "unreal_level_path": "/Game/Maps/L_ScannedHallwayAlpha",
  "updated_at": "2026-05-02T16:45:00-07:00",
  "anchor_count": 7,
  "scenario_count": 2,
  "stream": {
    "status": "available",
    "provider": "unreal_pixel_streaming"
  },
  "artifacts": {
    "semantic_environment_url": "/api/v1/artifacts/semantic_environments/scan_hallway_alpha"
  }
}
```

Allowed `status` values: `uploading`, `reconstructing`, `compiled`, `ready`, `failed`.

Allowed `stream.status` values: `unavailable`, `available`, `launching`, `ready`, `failed`.

### `GET /scenes/{scene_id}/threat-injection-plan`

Returns the gameplay intelligence plan for the scene. This endpoint is required
for full live mode; the frontend currently has fixture fallback for
`safety_park`.

Required response fields:

```json
{
  "contract_type": "threat_injection_plan",
  "scene_id": "safety_park",
  "objective": "Move from entry to exit while identifying aerial reconnaissance and delayed contact.",
  "scene_affordances": [],
  "threat_assets": [],
  "injection_sequence": [],
  "runtime_constraints": []
}
```

### `POST /captures`

Creates a capture record and returns a stable `capture_id`.

Request:

```json
{
  "display_name": "Training Hallway May 3",
  "operator_id": "hackathon_demo",
  "environment_type": "indoor_hallway",
  "expected_image_count": 120,
  "scale_hint": {
    "type": "known_distance",
    "label": "door width",
    "distance_m": 0.91
  },
  "notes": "Phone photos captured around the hallway with overlapping passes."
}
```

Response:

```json
{
  "capture_id": "training_hallway_may_3",
  "status": "created",
  "gcs_prefix": "gs://aiscanners-hackathon2025/adaptsim-captures/captures/training_hallway_may_3/"
}
```

### `POST /captures/{capture_id}/upload-urls`

Returns signed URLs for direct browser uploads to GCS. The browser should use
these URLs directly; images should not be proxied through the A100.

MVP signing configuration for the control API:

```text
GCS_BUCKET=aiscanners-hackathon2025
GCS_CAPTURE_PREFIX=adaptsim-captures
GCS_SIGNING_SERVICE_ACCOUNT=photogrammetry-test@gecko-dev-fde.iam.gserviceaccount.com
GCS_SIGNING_REGION=us
```

Development should use local Application Default Credentials, for example
`gcloud auth application-default login`, then impersonate the signing service
account. Do not expect an `adaptsim-url-signer` service account; it could not be
created with the current user's IAM permissions. Browser upload CORS is checked
in at `infra/gcp/gcs-cors.json` and has already been applied to the bucket.

Request:

```json
{
  "files": [
    {
      "filename": "IMG_0001.jpg",
      "content_type": "image/jpeg",
      "size_bytes": 4521120
    }
  ]
}
```

Response:

```json
{
  "capture_id": "training_hallway_may_3",
  "uploads": [
    {
      "filename": "IMG_0001.jpg",
      "method": "PUT",
      "upload_url": "https://storage.googleapis.com/...",
      "gcs_uri": "gs://aiscanners-hackathon2025/adaptsim-captures/captures/training_hallway_may_3/raw/images/IMG_0001.jpg",
      "expires_at": "2026-05-03T05:30:00Z"
    }
  ]
}
```

### `POST /captures/{capture_id}/submit`

Marks upload complete and queues reconstruction.

Request:

```json
{
  "uploaded_image_count": 120,
  "start_reconstruction": true
}
```

Response:

```json
{
  "capture_id": "training_hallway_may_3",
  "status": "queued_reconstruction",
  "status_url": "/api/v1/captures/training_hallway_may_3/status"
}
```

### `GET /captures/{capture_id}/status`

Returns reconstruction and Unreal-import status.

Required response fields:

```json
{
  "capture_id": "training_hallway_may_3",
  "display_name": "Training Hallway May 3",
  "status": "extracting_mesh",
  "updated_at": "2026-05-03T05:12:00Z",
  "gcs_prefix": "gs://aiscanners-hackathon2025/adaptsim-captures/captures/training_hallway_may_3/",
  "progress": {
    "phase": "extracting_mesh",
    "message": "Running FVDB DLNR mesh extraction.",
    "percent": 62
  },
  "sfm": {
    "input_images": 120,
    "registered_images": 93
  },
  "artifacts": {
    "splat_usdz_url": null,
    "mesh_preview_url": null,
    "unreal_mesh_url": null
  },
  "unreal": {
    "status": "not_started",
    "level_path": null
  }
}
```

Allowed capture `status` values:

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

Automatic Unreal handoff:

- `GET /captures/{capture_id}/status`,
  `GET /scenes/{capture_id}/status`, and
  `GET /scenes/{capture_id}/scenarios` are orchestration-safe polling points.
- If `ADAPTSIM_ENABLE_WORKER_TRIGGERS=1` and the capture status is
  `ready_for_unreal_import`, the control API persists `importing_unreal` with
  `unreal.status: "importing"` before it triggers L4.
- The default L4 trigger runs on the `linux-pixel-streaming` VM:

```bash
workers/l4-unreal-import/adaptsim-import-capture --capture-id {capture_id} --gcs-root {gcs_root}
```

- Override the remote import command with `ADAPTSIM_L4_IMPORT_COMMAND`. The
  command can use `{capture_id}` and `{gcs_root}` placeholders.
- If the SSH trigger cannot start the L4 worker, the control API writes
  `status: "failed"`, `unreal.status: "failed"`, and
  `error.code: "unreal_import_trigger_failed"` to `status.json`.
- The control API must not report a capture-backed scene as playable until the
  capture is `ready`, `unreal.status` is `ready`, a level path is present, and
  both `unreal_import_report_uri` and `semantic_environment_uri` are present.
  The L4 worker is responsible for writing `ready` only after
  `unreal/import_report.json` and `unreal/semantic_environment.json` have been
  generated and uploaded.

### `GET /captures/{capture_id}/artifacts`

Returns links for raw, reconstruction, and Unreal import artifacts.

Required response fields:

```json
{
  "capture_id": "training_hallway_may_3",
  "artifacts": [
    {
      "artifact_type": "splat_usdz",
      "content_type": "model/vnd.usdz+zip",
      "gcs_uri": "gs://aiscanners-hackathon2025/adaptsim-captures/captures/training_hallway_may_3/reconstruction/splat.usdz",
      "url": "/api/v1/captures/training_hallway_may_3/artifacts/splat_usdz"
    },
    {
      "artifact_type": "unreal_mesh_glb",
      "content_type": "model/gltf-binary",
      "gcs_uri": "gs://aiscanners-hackathon2025/adaptsim-captures/captures/training_hallway_may_3/unreal-import/scene_mesh.glb",
      "url": "/api/v1/captures/training_hallway_may_3/artifacts/unreal_mesh_glb"
    }
  ]
}
```

### `GET /scenes/{scene_id}/scenarios`

Returns a compact list for the scene detail page. Full manifests can be fetched with `manifest_url`.

Required response fields:

```json
{
  "scene_id": "scan_hallway_alpha",
  "scenarios": [
    {
      "scenario_id": "scan_hallway_delay_001",
      "display_name": "Side Room Delay Contact",
      "status": "ready",
      "training_objective": "Detect and respond to delayed contact from an occluded side room while preserving movement discipline through the hallway.",
      "event_count": 1,
      "severity_max": 0.78,
      "manifest_url": "/api/v1/scenarios/scan_hallway_delay_001/manifest"
    }
  ]
}
```

Allowed scenario `status` values: `draft`, `validating`, `ready`, `rejected`, `failed`.

### `POST /scenes/{scene_id}/scenarios/{scenario_id}/launch`

Starts or attaches to a Pixel Streaming run for one scenario.

Request:

```json
{
  "operator_id": "hackathon_demo",
  "mode": "stream",
  "reuse_warm_session": true
}
```

Response:

```json
{
  "run_id": "run_hallway_delay_001",
  "scene_id": "scan_hallway_alpha",
  "scenario_id": "scan_hallway_delay_001",
  "status": "launching",
  "stream": {
    "status": "launching",
    "embed_url": null,
    "poll_url": "/api/v1/runs/run_hallway_delay_001/stream"
  }
}
```

Allowed launch `status` values: `queued`, `launching`, `ready`, `running`, `completed`, `failed`.

### `GET /runs/{run_id}/stream`

Returns the current stream status and the URL to embed once ready.

Ready response:

```json
{
  "run_id": "run_hallway_delay_001",
  "status": "ready",
  "stream": {
    "status": "ready",
    "provider": "unreal_pixel_streaming",
    "embed_url": "http://127.0.0.1:8080/?run_id=run_hallway_delay_001",
    "signaling_url": "ws://127.0.0.1:8080/signalling",
    "expires_at": "2026-05-02T18:45:00-07:00"
  }
}
```

The frontend should use `stream.embed_url` directly as the iframe `src`. If the browser blocks iframe embedding, the same URL should be opened in a new tab.

### `GET /runs/{run_id}/telemetry?tail=50`

Returns recent telemetry events. Use the existing `telemetry_log` contract shape, optionally with a truncated `events` array when `tail` is present.

Required response fields:

```json
{
  "contract_type": "telemetry_log",
  "schema_version": "1.0",
  "run_id": "run_hallway_delay_001",
  "scenario_id": "scan_hallway_delay_001",
  "events": []
}
```

### `GET /runs/{run_id}/artifacts`

Returns immutable artifact links for the completed run.

Required response fields:

```json
{
  "run_id": "run_hallway_delay_001",
  "artifacts": [
    {
      "artifact_type": "telemetry_log",
      "content_type": "application/json",
      "url": "/api/v1/runs/run_hallway_delay_001/telemetry"
    },
    {
      "artifact_type": "after_action_review",
      "content_type": "text/markdown",
      "url": "/api/v1/runs/run_hallway_delay_001/aar"
    }
  ]
}
```

### `GET /runs/{run_id}/aar`

Returns the markdown AAR. The simple path is `text/markdown`; JSON is acceptable if the frontend prefers:

```json
{
  "run_id": "run_hallway_delay_001",
  "scenario_id": "scan_hallway_delay_001",
  "content_type": "text/markdown",
  "markdown": "# After Action Review: run_hallway_delay_001\n\n..."
}
```

## Mock Fixture

`docs/mock_horror_corridor_api.json` contains ready-to-serve mock responses for the endpoints above. A frontend can load that file directly while the backend is being built, or a tiny mock server can return its keyed responses.

## Backend Notes

- Reuse the existing contract examples instead of inventing new shapes.
- Keep scenario manifests immutable after launch; create a new `run_id` for every launch attempt.
- Treat Pixel Streaming session orchestration as a backend responsibility.
- Return only backend-approved stream URLs to the browser.
- The AAR should be generated from telemetry and scenario context, not from unvalidated frontend state.
