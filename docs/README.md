# AdaptSim Docs

Start here when resuming project context.

## Current Plans

- `photo_reconstruction_pipeline.md`: persistent plan for browser image upload,
  GCS handoff, A100 FVDB reconstruction, mesh conversion, L4 Unreal import,
  confirmed signed URL service account, cached demo expectations, and open
  questions.
- `web_app_integration_spec.md`: current React/Vite frontend and Control API
  contract for capture upload, signed GCS uploads, GPT-5.5 threat asset
  database generation, Trellis threat visual handoff, threat injection planning,
  Pixel Streaming launch, telemetry, and AAR.
- `generative_asset_pipeline.md`: GPT-5.5 generated threat-vector database to
  A100 Trellis request flow. Trellis is a first-class asset generation path for
  UAV, UGV, vehicle, USV, inert equipment, sensor/payload, and reviewed
  adversary-runtime bindings, not decorative prop generation.
- `trellis_asset_generation_worker.md`: A100 worker contract for consuming
  `trellis_asset_generation_request` batches and publishing GLB candidates,
  reports, and draft asset cards for Unreal review.
- `scan_import_runbook.md`: Unreal scan import commands, including GCS handoff
  from A100-generated `scene_mesh.glb` to the L4 Unreal VM, semantic environment
  output, and capture-specific scenario generation.
- `demo_runbook.md`: current three-minute safety-park golden MVP path plus the
  horror-corridor Unreal/ScenarioDirector/Pixel Streaming fallback proof.
- `hackathon_brief.md`: product framing and scope boundaries for the
  scene-to-simulation compiler.

## Fixtures

- `mock_horror_corridor_api.json`: ready-to-serve mock responses for legacy
  horror-corridor scene/scenario/run/AAR endpoints.
- `contracts/examples/generated_asset_databases/threat_vector_asset_database.json`:
  checked-in generated asset database shape for threat-vector assets.
- `contracts/examples/gameplay_intelligence/safety_park/`: threat injection plan
  and paired scenario manifest generated from the safety-park semantic
  environment.
- `contracts/examples/scenario_manifests/safety_park_mvp_001.json` and
  `contracts/examples/semantic_environments/safety_park.json`: cached demo
  scene intelligence pair.
- `docs/integration_logs/`: golden end-to-end verifier reports from
  `scripts/integration/safety_park_golden_mvp.sh`.

## VM Reference

The compact VM and bucket baseline lives in:

```text
.agents/skills/adaptsim-vm-operator/references/vm-baseline.md
```

The browser upload CORS config lives in:

```text
infra/gcp/gcs-cors.json
```
