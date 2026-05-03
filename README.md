# AdaptSim Prototype Workspace

This workspace now tracks the updated AdaptSim hackathon direction: turn a real scanned environment into a reusable Unreal Engine training space, generate doctrine-informed scenario manifests, execute them through an inspectable runtime, and close the loop with telemetry-backed after-action review.

The current source-of-truth brief lives at [`hackathon_brief.md`](hackathon_brief.md).

## Updated Product Thesis

AdaptSim should be a hybrid system:

- RealityScan or similar mobile capture provides the recognizable real environment.
- Unreal Engine remains the authoritative runtime for geometry, collision, navigation, rendering, AI behavior, and telemetry.
- Models help interpret messy inputs, extract asset and behavior candidates, propose scenario hypotheses, normalize strict JSON, generate offline static assets, and summarize after-action review.
- The planning layer outputs scenario manifests; it does not directly control frame-by-frame simulation.

## Current Local Pieces

- `hackathon_brief.md`: updated hackathon brief pulled from GitHub.
- `skills/adaptsim-vm-operator/`: VM notes now centered on the Unreal/pixel-streaming path, with A100 as optional compute.
- `index.html`, `app.js`, `styles.css`: browser prototype for geospatial baseline exploration, OSINT-backed extractable model summaries, public reference-site overlays, and map-source experimentation. Treat this as reusable UI scaffolding, not the current product center.
- `data/snapshot-profiles.json` and `data/workbench-data.json`: legacy starter data retained for reference.
- `cosmos-container-setup.md`: legacy Cosmos setup notes. Cosmos is no longer in the short-term demo stack.

## MVP Target From The Brief

Build the smallest demo that proves the updated story:

1. Capture one indoor environment with RealityScan.
2. Import the scene into Unreal with corrected scale, origin, orientation, materials, collision, and NavMesh.
3. Add a lightweight semantic layer for rooms, doors, chokepoints, cover, exits, spawn zones, fallback routes, and no-spawn zones.
4. Define a small adversary asset and intent database.
5. Produce a strict scenario manifest JSON contract.
6. Implement an Unreal `ScenarioDirector` that validates manifests, maps assets to whitelisted Blueprints, queries tagged anchors/EQS/NavMesh, rejects invalid spawn requests, executes at least two variants, and logs telemetry.
7. Generate an after-action review from trainee telemetry.

## What To Defer

The updated brief explicitly removes these from the short-term demo path:

- fVDB Reality Capture.
- COLMAP.
- Cosmos Reason2.
- Cosmos Transfer2.5.
- Cosmos Predict2.5.
- Gaussian splat rendering as the primary runtime.
- Fully automatic semantic scene parsing.
- Runtime text-to-3D generation inside Unreal.
- Calibrated real-world threat prediction.

## Recommended Next Build Sequence

1. Convert the browser prototype from a global country snapshot tool into a local scan/scenario workbench.
2. Add JSON Schema or Pydantic contracts for semantic tags, asset cards, scenario manifests, and telemetry events.
3. Seed two or three adversary asset cards and three to five behavior profiles.
4. Build a small manifest generator that takes environment tags plus asset cards and emits two playable scenario variants.
5. Create the Unreal `ScenarioDirector` path with manifest validation before adding more model automation.
6. Add a telemetry export contract and an AAR prompt/schema that references exact events, delays, movement, contacts, and missed indicators.
7. Keep optional model-generated 3D assets offline, with an Unreal ingestion checklist for scale, pivot, collision, materials, Gameplay Tags, and spawnability.

## How To Run The Existing Browser Prototype

Serve the repo locally:

```bash
npm start
```

Then open `http://127.0.0.1:8787`.

You can also use a tiny static server:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

Run a lightweight syntax check before handing changes over:

```bash
npm run check
```

Generated database exports are intentionally left out of Git. Recreate SQLite, CSV, JSON bundle, manifest, and zip outputs locally with `npm run export-db` when needed.

Run randomized photo-geolocation checks through the same local backend endpoint used by the app:

```bash
npm run check:geo -- --samples 8
```

For Google Street View, use the official Static API rather than scraping Maps pages:

```bash
GOOGLE_MAPS_API_KEY=... npm run check:geo -- --google-streetview --samples 4
```

## Photo Geolocation Fallback

The browser prototype now treats submitted photos as location evidence in layers:

- Embedded EXIF GPS is used first when present.
- Local forensic/OCR tooling, including the bundled Tesseract.js path, extracts interpretable cues from filenames, strings, text, signage, landmarks, architecture, and terrain.
- Readable place names are matched against `data/open-place-evidence.json` before generic geocoders, so sourced records such as a signed guest house or restaurant can resolve even when global geocoders miss or misroute the venue.
- If reliable GPS is absent, the local backend queries Wikimedia Commons geotagged media for coordinate-bearing reference images that match those interpreted cues, then returns sourced candidates and evidence links to the UI.

This is not a single canonical GeoGuessr database. It is an open evidence connector that can be extended with larger open-access visual-geolocation datasets such as OpenStreetView-5M when a local image/vector index is available. Disable the Commons lookup with `OPEN_GEO_IMAGE_LOOKUP=0`; set `COMMONS_USER_AGENT` if running repeated local tests.

## Safety And Data Boundaries

AdaptSim should stay focused on training simulation and controlled scenario rehearsal. The project should avoid live operational targeting, live force locations, tactical routing, readiness inference, or claims that scenario likelihoods are calibrated intelligence predictions.

Scenario likelihoods should be described as likelihoods under explicit assumptions for training variety, not as real-world predictions.
