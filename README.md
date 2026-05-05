# AdaptSim

AdaptSim turns real places into repeatable training simulations.

The project was created for the 2026 National Security Hackathon. It explores a practical scene-to-simulation workflow: capture an environment, reconstruct or import it into Unreal, add semantic understanding such as rooms, doors, chokepoints, cover, exits, and spawn zones, generate doctrine-informed scenario variants, run those scenarios in a real-time simulation, and produce an after-action review from telemetry.

Project demo video: [Loom walkthrough](https://www.loom.com/share/277f5654db6f42ed8a00a99a47fa1dff)

## Mission

Training teams often have to choose between physical simulation that is expensive and hard to vary, or digital simulation that is repeatable but slow to author. AdaptSim is aimed at the gap between those two modes.

The goal is to let a user scan a hallway, facility, room, industrial site, or other training environment and quickly turn it into a reusable Unreal training space. Instead of hand-authoring every scenario, AdaptSim combines a semantic environment layer, an inspectable asset and behavior database, and structured scenario manifests so trainees can rehearse multiple plausible conditions in the same recognizable place.

The core idea is simple:

```text
scan the world
-> compile the scene
-> generate the threat space
-> rehearse repeatedly
-> review what happened
```

## What It Does

AdaptSim currently brings together several working pieces:

- A React web app for capture intake, scenario selection, Pixel Streaming launch, telemetry, and AAR preview.
- A local Node control API that serves scenario, capture, asset-generation, stream, telemetry, and AAR endpoints.
- Contract examples for semantic environments, generated threat-vector asset databases, threat injection plans, scenario manifests, telemetry, and after-action reviews.
- Worker scripts for photo reconstruction, generated asset handoff, Unreal import, and Pixel Streaming operations.
- A public-source military disposition database used as a safe, inspectable foundation for simulation-relevant entities, assets, capabilities, and assumptions.
- Unreal project scripts and runtime contracts for importing scanned scenes and executing structured scenario manifests.

The preferred demo path uses the cached `safety_park` scene, generated threat-vector assets, a threat-injection plan, A100/L4 worker handoff artifacts, and Unreal Pixel Streaming. The older horror-corridor path remains a fast fallback proof for ScenarioDirector, adversary spawning, telemetry, deterministic AAR generation, and streaming.

## How The Pieces Fit Together

```text
apps/web
  Operator interface for capture upload, generated assets, scenario launch,
  stream viewing, telemetry, and AAR review.

server
  Local control API. It serves checked-in demo contracts, coordinates capture
  and asset-generation flows, exposes stream status, and reads telemetry/AAR
  artifacts.

contracts
  Shared JSON schemas, examples, validators, telemetry fixtures, and AAR
  generation helpers. These are the handoff language between the web app,
  workers, Unreal, and review tooling.

workers
  Background jobs for reconstruction, mesh conversion, generated asset handoff,
  and Unreal import orchestration.

unreal
  Editor/runtime scripts used to import scanned scenes, create semantic
  environment outputs, and run scenario manifests inside the AdaptSim Unreal
  shell.

military_disposition_db
  Public-source, safety-bounded data layer for simulation entities, assets,
  capabilities, model variables, and scenario overlays.

docs
  Product framing, demo runbooks, web/API integration notes, reconstruction
  pipeline details, generated asset pipeline notes, and VM operations context.
```

In product terms, Unreal is the stable simulation runtime. AdaptSim is the compiler around it: it turns messy real-world inputs into validated scene artifacts, semantic annotations, asset cards, scenario manifests, and review outputs.

## Start Here

Install dependencies:

```bash
npm install
```

Run the web app and API bridge in two terminals:

```bash
npm run dev
npm run dev:api
```

Open:

```text
http://127.0.0.1:5173
```

The Vite app proxies `/api/*` to the local Node API bridge at `http://127.0.0.1:8787`.

For the Safety Park Pixel Streaming demo, start the full local demo stack:

```bash
npm run demo:start
```

Useful demo commands:

```bash
npm run demo:status
npm run demo:logs
npm run demo:stop
```

To build the frontend and serve it through the Node bridge:

```bash
npm run build
npm start
```

Then open:

```text
http://127.0.0.1:8787
```

## Common Workflows

Validate the main web and server checks:

```bash
npm run check
```

Validate contracts and AAR generation directly:

```bash
python3 contracts/validate_contracts.py contracts/examples
python3 -m unittest contracts.test_aar_generator
```

Regenerate the disposition index after updating `military_disposition_db`:

```bash
npm run build-disposition-index
```

Run randomized photo-geolocation checks through the same local backend endpoint used by the app:

```bash
npm run check:geo -- --samples 8
```

## Key Docs

- [Hackathon brief](docs/hackathon_brief.md): mission, product thesis, scope, pipeline, safety boundaries, and roadmap.
- [Web app integration spec](docs/web_app_integration_spec.md): frontend surface, API expectations, capture flow, generated assets, Pixel Streaming, telemetry, and AAR flow.
- [Demo runbook](docs/demo_runbook.md): current Safety Park MVP path, fallback path, VM notes, and verification commands.
- [Photo reconstruction pipeline](docs/photo_reconstruction_pipeline.md): browser upload, GCS handoff, A100 reconstruction, mesh conversion, and L4 Unreal import.
- [Generative asset pipeline](docs/generative_asset_pipeline.md): generated threat-vector database and Trellis asset-generation handoff.
- [Contracts](contracts/README.md): schema and artifact contracts shared by app, workers, Unreal, and review tooling.

## Safety Boundary

AdaptSim is for controlled training simulation and scenario rehearsal. It should avoid live operational targeting, live force locations, tactical routing, readiness inference, sensor exploitation workflows, operational payload behavior, or claims that scenario likelihoods are calibrated intelligence predictions.

The system should keep a clear separation between observed facts, training assumptions, and generated scenario hypotheses. Scenario likelihoods are rehearsal assumptions, not ground-truth intelligence estimates.
