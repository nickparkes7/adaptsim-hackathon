# AdaptSim Photo Reconstruction Pipeline

Last updated: 2026-05-03 UTC.

This document is the persistent plan for the photogrammetry reconstruction slice
of AdaptSim. It covers how uploaded frontend images become an FVDB-derived mesh
on the A100 worker, how that mesh is handed to the L4 Unreal VM, and what code
belongs where.

## Core Decision

Use one code repo and one shared artifact store.

```text
Web frontend
-> AdaptSim control API
-> GCS capture bucket
-> A100 reconstruction worker
-> GCS reconstruction artifacts
-> L4 Unreal import worker
-> Unreal level/content
-> frontend status and Pixel Streaming launch
```

Do not make the browser upload directly to the A100 VM. Do not make the A100
push directly to the L4 VM as the primary handoff path. GCS is the durable
handoff layer between components.

## Current Verified Infrastructure

### GCS

```text
Bucket: gs://aiscanners-hackathon2025
Prefix: gs://aiscanners-hackathon2025/adaptsim-captures/
Bucket project: fde-playground
VM project: gecko-dev-fde
Requester Pays: disabled
Location: US
```

Cross-project storage is acceptable. Access is controlled by bucket IAM. The
following VM service accounts were granted `roles/storage.objectAdmin` on the
bucket and smoke-tested from the machines:

```text
A100: navsus-compute-service-account@gecko-dev-fde.iam.gserviceaccount.com
L4:   photogrammetry-test@gecko-dev-fde.iam.gserviceaccount.com
```

Verified access-check objects:

```text
gs://aiscanners-hackathon2025/adaptsim-captures/_access_checks/a100-instance-02.txt
gs://aiscanners-hackathon2025/adaptsim-captures/_access_checks/linux-pixel-streaming.txt
```

### A100 Reconstruction VM

```text
Instance: a100-instance-02
Zone: us-east1-b
Project: gecko-dev-fde
Purpose: FVDB reconstruction, COLMAP/GLOMAP, mesh postprocessing
GPU: NVIDIA A100-SXM4-40GB
Root: ~/adaptsim
FVDB env: ~/adaptsim/.venv-fvdb
```

Confirmed installed pieces:

- `frgs` is installed in `~/adaptsim/.venv-fvdb/bin/frgs`.
- `torch 2.10.0+cu130`
- `fvdb-core 0.4.0+pt210.cu130`
- `fvdb-reality-capture 0.4.0`
- CUDA COLMAP is installed at `/usr/local/bin/colmap`.
- Previous `safety_park` FVDB run produced splat PLY, splat USDZ, and DLNR mesh PLY.

### L4 Unreal / Pixel Streaming VM

```text
Instance: linux-pixel-streaming
Zone: us-east1-d
Project: gecko-dev-fde
Purpose: Unreal import, ScenarioDirector runtime, Pixel Streaming
GPU: NVIDIA L4
Unreal project: /home/nicholas.parkes/Documents/Unreal Projects/AdaptSim
Engine: /home/nicholas.parkes/tools/unreal/UnrealEngine-5.7.4
```

Existing import automation:

```text
Local: unreal/Content/Python/AdaptSim/import_scanned_scene.py
Helper: scripts/run_scan_import_on_vm.sh
VM target: /home/nicholas.parkes/Documents/Unreal Projects/AdaptSim/Content/Python/AdaptSim/import_scanned_scene.py
```

## Artifact Layout

Use this canonical object layout for every capture:

```text
gs://aiscanners-hackathon2025/adaptsim-captures/captures/{capture_id}/
  raw/
    images/
    metadata.json
  sfm/
    colmap/
    report.json
  reconstruction/
    splat.ply
    splat.usdz
    mesh_dlnr.ply
    report.json
  unreal-import/
    scene_mesh.glb
    scene_mesh_decimated.glb
    collision_proxy.obj
    reconstruction_manifest.json
  unreal/
    import_report.json
    semantic_environment.json
    logs/
  logs/
  status.json
```

The local worker layout on each VM should mirror this structure under
`~/adaptsim/data/captures/{capture_id}/` for debuggability.

## Important FVDB Distinction

FVDB can export Gaussian splats to PLY and USDZ directly:

```text
splat.ply
splat.usdz
```

FVDB mesh extraction produces a triangle mesh PLY:

```text
mesh_dlnr.ply
```

For Unreal, the mesh PLY still needs postprocessing into an Unreal-friendly
format such as GLB, FBX, OBJ, or polygon USD:

```text
mesh_dlnr.ply -> scene_mesh.glb
```

The USDZ splat artifact is still useful for preview/interchange, but it does
not replace the need for a clean triangle mesh artifact for collision, NavMesh,
Nanite, and ScenarioDirector placement.

## Repo Layout

Keep one monorepo with separate deployable packages:

```text
adaptsim-hackathon/
  contracts/
  docs/
  services/
    control-api/
  workers/
    a100-reconstruction/
    l4-unreal-import/
  frontend/
  unreal/
  infra/
    gcp/
    systemd/
    cors/
```

The VM is a deployment target, not a repo boundary. Both VMs should clone the
same repo and run only their relevant package:

```text
A100: ~/adaptsim/repos/adaptsim-hackathon/workers/a100-reconstruction
L4:   ~/adaptsim/repos/adaptsim-hackathon/workers/l4-unreal-import
```

Generated captures, images, splats, meshes, logs, and Unreal import outputs
belong in GCS, not Git.

## A100 Workstream

Purpose: turn uploaded image sets into reconstruction artifacts.

### A100-1: Reconstruction CLI

Build the first reliable interface as a CLI:

```bash
adaptsim-reconstruct \
  --capture-id CAPTURE_ID \
  --gcs-root gs://aiscanners-hackathon2025/adaptsim-captures
```

Responsibilities:

- Acquire a single-GPU job lock.
- Download `raw/images/` and `raw/metadata.json`.
- Create local run directories.
- Write `status.json` at each phase.
- Upload artifacts and logs back to GCS.
- Exit nonzero with useful failure codes.

Acceptance criteria:

- Can run on `a100-instance-02`.
- Can download a capture from GCS.
- Can write status and logs back to GCS.
- Fails cleanly when images are missing or insufficient.

### A100-2: Image Validation

Validate the raw upload before running expensive GPU work.

Checks:

- Minimum image count.
- Supported file types.
- Resolution and total pixel budget.
- Duplicate filenames/content.
- Basic blur/black-frame rejection.
- EXIF/camera metadata when present.
- Presence of scale hints or calibration metadata when required.

Output:

```text
raw/metadata.json
logs/image_validation.log
status.json phase = "validating_images" or "failed"
```

### A100-3: SfM / Pose Solving

FVDB consumes posed images and sparse points. Raw photos must go through SfM.

Initial path:

```text
raw/images/
-> COLMAP feature_extractor
-> COLMAP matcher
-> COLMAP mapper
-> COLMAP model_converter
-> sfm/colmap/
```

Use CUDA COLMAP already installed on the A100. GLOMAP can be evaluated later if
it proves faster or more robust for large image sets.

Acceptance criteria:

- `SfmScene.from_colmap(...)` can load the generated scene.
- Registered image count and sparse point count are written to `sfm/report.json`.
- The job fails early if too few images register.

### A100-4: FVDB Splat Reconstruction

Run FVDB against the COLMAP dataset.

Expected CLI shape:

```bash
source ~/adaptsim/.venv-fvdb/bin/activate
frgs reconstruct ./sfm/colmap -o ./reconstruction/splat.ply
frgs convert ./reconstruction/splat.ply ./reconstruction/splat.usdz
```

Acceptance criteria:

- `reconstruction/splat.ply` exists and loads.
- `reconstruction/splat.usdz` exists when conversion succeeds.
- Reconstruction logs and metrics are uploaded.

### A100-5: FVDB Mesh Extraction

Run DLNR mesh extraction:

```bash
frgs mesh-dlnr ./reconstruction/splat.ply \
  -o ./reconstruction/mesh_dlnr.ply \
  0.10
```

The truncation margin must become configurable because it depends on scene
scale and target mesh resolution.

Acceptance criteria:

- `reconstruction/mesh_dlnr.ply` exists and has nonzero vertices/faces.
- `reconstruction/report.json` records margin, vertex count, face count, and timing.

### A100-6: Mesh Postprocessing

Convert the FVDB mesh PLY into artifacts Unreal can import.

Target outputs:

```text
unreal-import/scene_mesh.glb
unreal-import/scene_mesh_decimated.glb
unreal-import/collision_proxy.obj
unreal-import/reconstruction_manifest.json
```

Open implementation questions:

- Pick the conversion toolchain: Blender CLI, Open3D/trimesh plus pygltflib,
  MeshLab, or another reliable PLY-to-GLB/FBX path.
- Decide decimation budgets for render mesh and collision proxy.
- Preserve vertex colors/materials where possible.
- Normalize axis, origin, and scale according to metadata.

Acceptance criteria:

- L4 Unreal importer can import `scene_mesh.glb`.
- Manifest includes source paths, scale, units, axis, bounds, and mesh counts.

### A100-7: Worker Service

After the CLI works, wrap it in a small worker service.

Minimum service behavior:

- One GPU job at a time.
- Pollable status.
- Log links.
- Retry from clean stage boundaries.
- No direct browser access.

For the hackathon, prefer a small FastAPI or process supervisor around the CLI
over a heavier distributed queue.

## L4 Workstream

Purpose: import A100 artifacts into Unreal and make the scene launchable.

### L4-1: Unreal Import CLI

Build a VM-local wrapper:

```bash
adaptsim-import-capture \
  --capture-id CAPTURE_ID \
  --gcs-root gs://aiscanners-hackathon2025/adaptsim-captures
```

Responsibilities:

- Download `unreal-import/scene_mesh.glb`.
- Download `unreal-import/reconstruction_manifest.json`.
- Run the Unreal Python importer.
- Upload import logs and `unreal/import_report.json`.
- Update `status.json`.

### L4-2: Extend Unreal Import Paths

The existing importer creates scan content and a demo level. Extend or wrap it
so new captures get stable per-capture paths:

```text
/Game/AdaptSim/Scans/{capture_id}/...
/Game/AdaptSim/Maps/L_Reconstructed_{capture_id}
```

The importer should continue to configure materials, Nanite, collision, player
start, lights, camera, navmesh bounds, and semantic placeholders.

### L4-3: Transform Handling

Use reconstruction metadata for:

- Scale.
- Origin.
- Up axis.
- Rotation.
- Player start placement.
- NavMesh bounds.
- Collision mode.

Until scale calibration is automated, the frontend should collect a known
distance or marker-based scale hint.

### L4-4: Headless Validation

Run an Unreal commandlet/Python validation after import.

Checks:

- Level asset exists.
- At least one static mesh exists.
- Materials/textures imported or fallback materials assigned.
- Collision configured.
- Nanite enabled where appropriate.
- Player start is present.
- NavMesh bounds are present.
- Semantic placeholders exist.

Output:

```text
unreal/import_report.json
unreal/logs/import.log
status.json phase = "imported_unreal" or "failed"
```

### L4-5: Semantic Environment Bootstrap

Generate or export a first semantic environment JSON after import.

Initial scope:

- Placeholder/manual-review anchors.
- Entry, exit, room/hall center, chokepoint, cover, no-spawn zone.
- Stable `environment_id` and `/Game/...` level path.

Later scope:

- Editor tool or VLM-assisted semantic proposal.
- NavMesh/visibility checks.
- ScenarioDirector readiness validation.

### L4-6: Pixel Streaming Readiness

Once the imported map validates, register it as launchable.

Frontend/control API should be able to ask:

```http
GET /scenes/{capture_id}/status
GET /scenes/{capture_id}/scenarios
POST /scenes/{capture_id}/scenarios/{scenario_id}/launch
```

## Frontend Workstream

Purpose: collect capture inputs, upload images, show reconstruction progress,
and launch the imported Unreal scene.

### FE-1: Capture Creation

UI should collect:

- Capture name.
- Environment type.
- Expected image count.
- Notes for scenario generation.
- Scale hint: known distance, marker size, or "unknown".
- Optional calibration marker metadata.

### FE-2: Direct-to-GCS Uploads

The browser should request signed upload URLs from the control API and upload
images directly to GCS:

```http
POST /captures
POST /captures/{capture_id}/upload-urls
POST /captures/{capture_id}/submit
```

Bucket CORS must allow the frontend origin and upload methods.

### FE-3: Capture Guidance

The UI should guide users before upload:

- Use high-overlap photos.
- Avoid motion blur.
- Capture all sides and corners.
- Include a known scale reference.
- Avoid featureless, reflective, or transparent surfaces where possible.
- Upload enough images for SfM to register.

### FE-4: Progress Page

Show status phases:

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

### FE-5: Artifact Preview

Expose useful intermediate artifacts:

- Raw image count.
- SfM registered image count.
- Splat USDZ link.
- Mesh preview/download link.
- Unreal import report.
- Semantic environment link.

### FE-6: Scene Launch

When status is `ready`, let the user:

- Open the Pixel Streaming scene.
- Choose or generate scenario manifests.
- Run a scenario.
- View telemetry and AAR artifacts.

## Control API Workstream

Purpose: coordinate the frontend, GCS, A100 worker, and L4 worker.

Minimum responsibilities:

- Create capture IDs.
- Write initial `status.json`.
- Issue signed upload URLs.
- Mark upload complete.
- Trigger A100 reconstruction.
- Trigger L4 import when A100 output is ready.
- Read and return capture status.
- Return artifact URLs.
- Return scene status for frontend routing.

Initial state can live in GCS JSON files. Add a database only when needed for
auth, multi-user ownership, or richer job history.

## Parallelization

Can start in parallel:

- GCS CORS and signed URL proof of concept.
- A100 reconstruction CLI skeleton.
- L4 import CLI wrapper.
- Frontend upload/status UI.
- Mesh postprocessing tool evaluation.
- Contract additions for capture status and reconstruction manifest.

Sequential critical path:

```text
frontend uploads images
-> A100 image validation
-> A100 SfM pose solving
-> A100 FVDB splat reconstruction
-> A100 FVDB mesh extraction
-> A100 mesh postprocessing
-> L4 Unreal import
-> L4 validation and semantic export
-> frontend Pixel Streaming launch
```

## Immediate Next Tasks

1. Add capture status and reconstruction manifest models under `contracts/`.
2. Add GCS CORS config under `infra/gcp/` and test browser-compatible signed uploads.
3. Build `workers/a100-reconstruction` CLI that can download a capture and write status/logs.
4. Add the COLMAP stage and verify `SfmScene.from_colmap(...)` loads the result.
5. Run FVDB on one real uploaded capture and publish `splat.ply`, `splat.usdz`, and `mesh_dlnr.ply`.
6. Pick and prove a mesh PLY-to-GLB conversion path.
7. Build `workers/l4-unreal-import` wrapper around `scripts/run_scan_import_on_vm.sh`.
8. Extend the Unreal import path to create capture-specific maps.

## Open Questions

- Which service will own signed URL generation: a new control API in this repo,
  or an existing backend/frontend project?
- What frontend origin(s) should bucket CORS allow?
- What scale calibration method is acceptable for the demo?
- Should A100 jobs be triggered by API calls, polling GCS status, or Pub/Sub
  object notifications?
- Which mesh postprocessing stack should be standardized?
- What polygon budgets are acceptable for Unreal render mesh and collision proxy?
