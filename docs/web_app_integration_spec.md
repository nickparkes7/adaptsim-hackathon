# AdaptSim Web App Integration Spec

This is the minimal web integration contract for the hackathon demo where a web app shows the scanned horror corridor scene, lists available scenarios, launches an Unreal Pixel Streaming session, and retrieves telemetry plus AAR artifacts.

For the persistent photo reconstruction plan and VM handoff details, see
`docs/photo_reconstruction_pipeline.md`.

For the input-bound generated asset database and Trellis relay path, see
`docs/generative_asset_pipeline.md`.

## Frontend Repo Search

No dedicated AdaptSim frontend was found locally.

Searched under `/Users/nicholas.parkes/Repos` for frontend manifests and AdaptSim-specific text. This repo has no `package.json`, `vite.config.*`, `next.config.*`, `src/`, `app/`, or route/component tree for a web app.

Nearby web projects inspected:

| Path | Framework / run command | Result |
| --- | --- | --- |
| `/Users/nicholas.parkes/Repos/_personal/Neptune/neptune-console` | React + Vite, `npm run dev` | Maritime telemetry console, not AdaptSim. |
| `/Users/nicholas.parkes/Repos/hull-localization/digital-twin` | React + Vite + Three.js, `npm run dev` | Hull localization digital twin, not AdaptSim. |
| `/Users/nicholas.parkes/Repos/core/symphony-dashboard` | React + Vite, `npm run dev` or `npm run dev:full` | Symphony dashboard, not AdaptSim. |
| `/Users/nicholas.parkes/Repos/core/fulcrum-build/app/fulcrum-ux` | SvelteKit + Vite, `yarn dev` | Fulcrum robot/inspection UI, not AdaptSim. |
| `/Users/nicholas.parkes/Repos/fulcrum-emat-deploy/frontend` | None found | Directory contains only `.DS_Store`. |

Because no matching frontend repo was confirmed, this repo should remain the source of truth for the API shape and demo fixtures until the actual web app is provided.

## Existing Demo Inputs

The frontend can present the horror corridor demo from these existing files:

- Scene: `contracts/examples/semantic_environments/scanned_hallway_alpha.json`
- Scenarios:
  - `contracts/examples/scenario_manifests/scan_hallway_delay_001.json`
  - `contracts/examples/scenario_manifests/scan_hallway_observer_002.json`
- Telemetry: `contracts/examples/telemetry/mock_hallway_delay_log.json`
- AAR: `contracts/examples/aar/mock_hallway_delay_log_aar.md`

For user-facing labels, treat `scan_hallway_alpha` as the horror corridor / scanned hallway scene.

## Frontend Runtime Expectations

The frontend should use:

- `VITE_ADAPTSIM_API_BASE`, default `http://127.0.0.1:8787/api/v1`
- `VITE_ADAPTSIM_SCENE_ID`, default `scan_hallway_alpha`

The frontend should not hard-code the Pixel Streaming URL. It should ask the backend for a stream URL after launch.

For a local demo, the backend can be configured with:

- `ADAPTSIM_PIXEL_STREAM_URL=http://127.0.0.1:8080/`

That URL should point at whatever local tunnel, reverse proxy, or Pixel Streaming web server exposes the `linux-pixel-streaming` Unreal VM. If the Pixel Streaming service is exposed on a different local port, change only the backend setting and keep the frontend unchanged.

## Minimal UI Flow

Existing scene playback flow:

1. Scene detail view calls `GET /scenes/{scene_id}/status`.
2. Scenario panel calls `GET /scenes/{scene_id}/scenarios`.
3. User selects a scenario and clicks launch.
4. Frontend calls `POST /scenes/{scene_id}/scenarios/{scenario_id}/launch`.
5. Frontend polls `GET /runs/{run_id}/stream` until `stream.status` is `ready`.
6. Frontend embeds `stream.embed_url` in an iframe or opens it in a new tab.
7. During or after the run, frontend reads `GET /runs/{run_id}/telemetry`.
8. After completion, frontend reads `GET /runs/{run_id}/artifacts` and `GET /runs/{run_id}/aar`.

Photo reconstruction flow:

1. User creates a capture with display name, environment notes, expected image count, and scale hint.
2. Frontend calls `POST /captures`.
3. Frontend calls `POST /captures/{capture_id}/upload-urls`.
4. Browser uploads images directly to GCS using signed URLs.
5. Frontend calls `POST /captures/{capture_id}/submit`.
6. Frontend polls `GET /captures/{capture_id}/status`.
7. A100 worker produces splat and mesh artifacts under GCS.
8. L4 Unreal worker imports `unreal-import/scene_mesh.glb`.
9. Frontend switches to scene playback once status is `ready`.

Generative asset flow:

1. User finishes dropping photos, videos, or source data.
2. Frontend immediately calls `POST /api/generative-assets/sessions`.
3. Backend stores a unique local session under `.adaptsim/generated-sessions/`.
4. Backend calls OpenAI GPT-5.5 through the Responses API to produce a structured
   generated asset database.
5. Backend writes `asset_database.json`.
6. Backend writes `trellis_request.json` and relays it to the Trellis VM only if
   `TRELLIS_VM_ENDPOINT` is configured.

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
