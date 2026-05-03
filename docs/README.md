# AdaptSim Docs

Start here when resuming project context.

## Current Plans

- `photo_reconstruction_pipeline.md`: persistent plan for frontend image upload,
  GCS handoff, A100 FVDB reconstruction, L4 Unreal import, repo layout, parallel
  workstreams, next tasks, and open questions.
- `web_app_integration_spec.md`: frontend/API contract for demo playback plus
  capture upload, signed upload URLs, reconstruction status, and artifacts.
- `scan_import_runbook.md`: Unreal scan import commands, including GCS handoff
  from A100-generated `scene_mesh.glb` to the L4 Unreal VM.
- `demo_runbook.md`: current integrated horror corridor demo path for Unreal,
  ScenarioDirector, telemetry, AAR, and Pixel Streaming.

## Fixtures

- `mock_horror_corridor_api.json`: ready-to-serve mock responses for frontend
  scene/scenario/run/AAR endpoints.

## VM Reference

The compact VM and bucket baseline lives in:

```text
.agents/skills/adaptsim-vm-operator/references/vm-baseline.md
```
