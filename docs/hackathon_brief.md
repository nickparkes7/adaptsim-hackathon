# AdaptSim Hackathon Brief

## Motivation

Military and industrial training is still constrained by two brittle modes.

Physical simulation is expensive, fixed in place, and hard to reset. Live-fire ranges, wet trainers, mockups, and rehearsals can be valuable, but they usually produce limited repetitions against a small number of preplanned situations.

Digital simulation has the opposite problem. It is easier to repeat, but useful scenarios still require teams of designers, engineers, and subject matter experts to author specific environments, assets, decision trees, and failure modes in advance. The long tail of real-world situations is rarely represented.

The result is a gap between the schoolhouse and the field. Training often certifies that a team can pass a known standard, but it does not always expose how individuals and teams adapt under ambiguous, changing, high-pressure conditions.

AdaptSim is aimed at that gap: quickly turn a real environment into a reusable training space, then generate doctrine-informed adversarial scenarios that vary across repetitions while remaining physically grounded in the scanned space.

## Current Product Thesis

AdaptSim is not trying to make a fully neural game engine. The near-term product should use generative models where they are strongest and Unreal Engine where it is strongest.

Generative models should help interpret messy inputs:

- What does this scanned environment afford tactically?
- What assets, intents, and behaviors are implied by training documents and intelligence-style inputs?
- What plausible adversary courses of action should a trainee rehearse?
- What happened during the run, and how should the trainee be debriefed?

Unreal Engine should remain the authoritative simulation runtime:

- Stable geometry, collision, navigation, and rendering.
- Repeatable scenario execution.
- AI perception, movement, animation, effects, and telemetry.
- Inspectable state for after-action review.

The project is strongest as a hybrid system: model-driven scenario generation compiled into a real-time Unreal training simulation.

## Demo Goal

Show that a team can:

1. Capture a real environment with a phone.
2. Import that environment into Unreal.
3. Generate or select adversarial assets from a doctrine-informed asset database.
4. Run a planner that converts adversary assets and intent into scenario events.
5. Spawn and execute those events dynamically inside the scanned environment.
6. Let a trainee repeat the environment under different plausible conditions.
7. Produce an after-action review from trainee telemetry.

The demo should feel like: "this hallway was scanned this morning, and now I can rehearse multiple adversary behaviors in it."

## Proposed Pipeline

```text
Photo capture or direct scan export
-> object storage capture bundle
-> A100 reconstruction worker for raw photos
-> Unreal-ready mesh artifact
-> Unreal level import
-> semantic tagging of rooms, doors, chokepoints, cover, exits, and spawn zones
-> asset and intent database
-> optional generated 3D assets
-> adversary planner
-> scenario manifest JSON
-> Unreal ScenarioDirector
-> interactive training run
-> telemetry and after-action review
```

## Core System Components

### 1. Reality Capture

There are two capture paths:

- Direct mesh import from tools such as RealityScan, using USDZ, OBJ, GLB, or FBX when a mesh already exists.
- Photo reconstruction from uploaded images, using COLMAP/GLOMAP plus fVDB Reality Capture on the A100 worker.

The direct mesh path remains useful as a fallback and demo shortcut. The active
photo reconstruction plan is documented in `docs/photo_reconstruction_pipeline.md`.

Expected reconstruction and scene import work:

- Store raw images and metadata in GCS.
- Solve camera poses and sparse points before fVDB reconstruction.
- Export FVDB splats to PLY/USDZ for preview/interchange.
- Extract a triangle mesh with FVDB DLNR meshing.
- Convert the mesh to an Unreal-friendly artifact such as GLB/FBX/OBJ.
- Clean up scale, origin, orientation, materials, and collision.
- Add or generate a NavMesh.
- Add semantic anchors and volumes for tactical reasoning.
- Keep the scan as the recognizable environment the trainee cares about.

### 2. Semantic Environment Layer

The scene mesh alone is not enough for reasoning. AdaptSim needs a lightweight semantic layer over the imported environment.

Examples:

- `room`
- `hallway`
- `door`
- `window`
- `entry_point`
- `exit`
- `cover`
- `concealment`
- `chokepoint`
- `line_of_sight`
- `fallback_route`
- `no_spawn_zone`
- `objective_area`

For the hackathon, this can be manually annotated in Unreal with tagged actors, volumes, and splines. Later, VLMs or editor tools can propose these labels automatically.

### 3. Asset And Intent Database

This is the middle layer that matters most.

Instead of hand-authoring complete scenarios, the system stores reusable adversarial assets, capabilities, constraints, intents, and likelihood modifiers.

Example asset card:

```json
{
  "asset_id": "adversary_rifleman_irregular",
  "category": "adversary_role",
  "render_asset": "/Game/Actors/BP_Adversary_Rifleman",
  "capabilities": ["move", "observe", "hide", "suppress", "withdraw"],
  "equipment": ["rifle"],
  "preferred_affordances": ["cover", "concealment", "line_of_sight_to_entry"],
  "constraints": ["requires_navmesh", "spawn_out_of_initial_view"],
  "behavior_profiles": ["ambush", "delay", "reposition_after_contact"],
  "likelihood_modifiers": {
    "near_chokepoint": 1.4,
    "exposed_open_area": 0.5,
    "has_fallback_route": 1.2
  }
}
```

The database can be seeded from military training documents, doctrine, SME input, and controlled scenario templates. Models can help extract and normalize this material, but the resulting database should be explicit and inspectable.

### 4. Generated 3D Assets

Use Trellis/Trellis.2 or a comparable text/image-to-3D model as an offline asset factory, not as the live simulator.

Good generation targets:

- Obstacles.
- Barricades.
- Debris.
- Props.
- Equipment.
- Training markers.
- Static threat objects.
- Concealment and cover objects.

Be cautious with:

- Fully rigged humans.
- Weapons that need exact animation handling.
- Anything that requires precise collision or safety-critical geometry.

Generated assets should pass through an Unreal ingestion step:

- Import as GLB/FBX/OBJ where practical.
- Normalize scale and pivot.
- Generate collision.
- Set materials.
- Add Gameplay Tags.
- Mark whether the asset is spawnable, interactable, cover, concealment, obstacle, or decorative.

### 5. Adversary Planner

The planner converts the environment, asset cards, and adversary intent into a scenario manifest.

It should generate hypotheses like:

- "Use occluded side room to delay detection."
- "Place one observer with line of sight to the primary entrance."
- "Use a fallback route after contact."
- "Create uncertainty at the first chokepoint."
- "Place a tripwire only where the trainee path is likely but not unavoidable."

The planner should not directly spawn assets or control actors frame by frame. It should output structured scenario intent.

Example output:

```json
{
  "scenario_id": "scan_hallway_delay_001",
  "training_objective": "Detect and respond to delayed contact from an occluded side room.",
  "events": [
    {
      "event_type": "adversary_contact",
      "likelihood": 0.36,
      "severity": 0.78,
      "intent": "delay_and_disrupt",
      "asset_id": "adversary_rifleman_irregular",
      "count": 2,
      "spawn_constraints": {
        "required_tags": ["concealment", "near_chokepoint"],
        "avoid_tags": ["trainee_visible", "no_spawn_zone"],
        "max_distance_to_trainee_m": 20
      },
      "behavior_profile": "ambush_then_reposition",
      "trigger": "trainee_enters_hallway",
      "rationale": "The side room provides concealment, short engagement distance, and a fallback route."
    }
  ]
}
```

Likelihoods should be described as scenario likelihoods under assumptions, not as calibrated intelligence predictions.

### 6. Unreal ScenarioDirector

Unreal receives the scenario manifest and compiles it into gameplay.

Responsibilities:

- Validate event JSON.
- Map `asset_id` to whitelisted Blueprint classes or imported meshes.
- Query tagged anchors, Smart Objects, NavMesh, and EQS.
- Reject invalid spawn requests.
- Spawn actors, props, and effects.
- Assign StateTree, Behavior Tree, or Gameplay Ability profiles.
- Bind triggers.
- Log trainee and adversary telemetry.

This is where the abstract plan becomes a playable sim.

Runtime systems to use:

- NavMesh for movement feasibility.
- Gameplay Tags for semantic asset and environment lookup.
- EQS for choosing context-aware positions.
- Smart Objects for reusable tactical affordances.
- StateTree or Behavior Trees for behavior execution.
- AI Perception for sight, hearing, and contact.
- Niagara for smoke, sparks, dust, fire, and atmosphere.
- Gameplay Ability System for reusable actions like suppress, breach, plant, withdraw, or signal.

## Model Strategy

Use models for interpretation, generation, and review. Do not use them as the authoritative runtime.

Useful model roles:

- Extract asset and behavior candidates from documents.
- Summarize scanned scene screenshots into environment affordances.
- Generate scenario hypotheses and rationale.
- Normalize outputs into strict JSON schemas.
- Generate static 3D asset candidates from descriptions.
- Produce after-action review from telemetry.

Avoid using models for:

- Collision.
- Navigation.
- Line-of-sight truth.
- Hit detection.
- Frame-by-frame adversary control.
- Runtime physics.
- Unvalidated probability claims.

## Tech Stack

### Capture And Scene

- Direct scan export from tools such as RealityScan when a mesh already exists.
- Uploaded image sets stored in GCS for asynchronous reconstruction.
- COLMAP or GLOMAP for image pose solving.
- fVDB Reality Capture on the A100 worker for splats and mesh extraction.
- USDZ, OBJ, GLB, or FBX depending on the cleanest Unreal import path.
- Unreal Engine as the interactive runtime.

### Unreal Runtime

- Static Mesh import and cleanup.
- Nanite where appropriate for scanned geometry.
- Collision and NavMesh.
- Gameplay Tags.
- Smart Objects.
- EQS.
- StateTree or Behavior Trees.
- AI Perception.
- Niagara.
- Gameplay Ability System where reusable actions justify it.
- Telemetry logging for after-action review.

### Planning And Data

- JSON Schema or Pydantic contracts for asset cards and scenario manifests.
- A small planning service or Unreal subsystem that can score affordances and sample scenario variants.
- Optional Python service for Monte Carlo sampling, graph analysis, and document-processing utilities.
- Graph representation of rooms, doors, corridors, chokepoints, sightlines, and fallback routes.

### Models

- LLM/VLM with structured JSON output for scenario reasoning, document extraction, and AAR.
- Trellis/Trellis.2 or comparable 3D generation for offline static asset creation.
- Optional local model path later for airgapped deployments.

### Current Boundaries

These are in scope for the photo reconstruction pipeline:

- COLMAP or GLOMAP for pose solving from uploaded images.
- fVDB Reality Capture on the A100 worker.
- FVDB splat PLY/USDZ artifacts for preview/interchange.
- FVDB DLNR mesh extraction followed by mesh conversion for Unreal import.

These are not the authoritative runtime representation:

- Gaussian splat rendering as the main Unreal gameplay surface.
- Raw FVDB output without Unreal collision, NavMesh, and semantic validation.

Cosmos Reason2, Cosmos Transfer2.5, and Cosmos Predict2.5 remain exploratory
model experiments and are not required for the photo-to-Unreal reconstruction path.

## MVP Scope

The hackathon MVP should not try to solve every part of autonomous scenario generation.

Build this:

- One scanned indoor environment.
- One imported Unreal level.
- A small set of tagged tactical affordances.
- A small adversary asset database.
- A small set of generated or marketplace/imported props.
- One generic adversary character class.
- Three to five reusable behavior profiles.
- A scenario manifest schema.
- A ScenarioDirector that spawns and executes at least two scenario variants.
- Telemetry capture and AAR output.

Defer this:

- Fully automatic semantic scene parsing.
- Fully automatic rigged character generation.
- Runtime text-to-3D generation inside Unreal.
- Full doctrine-scale asset database.
- Calibrated real-world threat prediction.
- Full multi-agent learned behavior.

## V2 Product Vision: Scene-To-Simulation Compiler

The larger AdaptSim product is a scene-to-simulation compiler.

The product should not claim that a model creates a complete Unreal game from scratch. Instead, AdaptSim should ship with a reusable Unreal simulation shell, then automatically compile new scene-specific inputs into that shell:

- Reconstructed environment geometry.
- Semantic environment annotations.
- Mission and location context.
- Asset and behavior databases.
- Scenario manifests.
- Training telemetry and after-action review.

In this framing, Unreal is the stable runtime and AdaptSim is the compiler that turns messy real-world inputs into playable training instances.

### V2 End-To-End Workflow

The target user flow:

1. A user opens the AdaptSim web app and creates a new training scene.
2. The user uploads a set of images, video frames, or scan artifacts from the target environment.
3. The frontend sends those inputs to a secure backend job system.
4. A GPU worker reconstructs the scene using fVDB Reality Capture or a comparable reconstruction backend.
5. The reconstruction pipeline emits a mesh, textures, metadata, camera alignment, and quality reports.
6. A scene compiler normalizes scale, origin, materials, collision, and navigation surfaces.
7. A semantic pass proposes rooms, doors, chokepoints, cover, exits, spawn zones, and no-spawn zones.
8. A data extraction service reads approved military, industrial, or customer-specific source material and produces explicit asset cards, behavior profiles, constraints, and scenario templates.
9. A scenario planner combines the semantic environment, asset database, and training objective into one or more strict scenario manifests.
10. Unreal Editor or a commandlet imports the compiled scene package into the prebuilt AdaptSim simulation shell.
11. The web app launches or connects to a Pixel Streaming session for that generated training instance.
12. Telemetry from the run feeds an after-action review and can update future scenario recommendations.

### Upload And Job Architecture

The frontend should not stream large image sets through the main application server.

A production path should use:

- `POST /captures` to create a capture job and receive signed upload URLs.
- Direct browser upload to object storage such as GCS, S3, or an on-prem equivalent.
- Resumable or chunked upload support for large image sets and weak networks.
- Stored metadata for capture device, EXIF, operator notes, location labels, classification markings, and access-control policy.
- `POST /captures/{capture_id}/complete` to enqueue reconstruction.
- Job status over polling, server-sent events, or WebSockets.
- Immutable artifact paths for raw inputs, reconstruction outputs, semantic outputs, scenario manifests, and AAR outputs.

This design keeps the web app responsive while the expensive GPU and Unreal work happens in background workers.

### Automated Unreal Generation Model

The automated Unreal step should be treated as content compilation, not game authoring.

Prebuilt once:

- AdaptSim Unreal project.
- Import commandlets and editor Python scripts.
- ScenarioDirector.
- Asset whitelist and spawn registry.
- Generic adversary classes.
- Behavior Tree, StateTree, EQS, Smart Object, and perception components.
- Telemetry and replay hooks.
- Pixel Streaming launch harness.

Generated per scene:

- Imported mesh and materials.
- Scene level.
- Collision settings.
- NavMesh bounds and validation results.
- Lighting and camera defaults.
- Semantic anchors and volumes.
- Scenario manifests.
- Spawn placements, props, and tactical affordance markers.

This means a new training instance can be generated without a designer manually creating a fresh Unreal game. However, the automation depends on a well-tested Unreal shell and constrained content contracts.

### Asset And Data Layer

The V2 asset database should be explicit, inspectable, and source-linked.

Inputs may include:

- Doctrine and training documents.
- Customer-specific operating procedures.
- Facility documentation.
- Asset inventories.
- Intelligence-style summaries approved for the training context.
- SME-authored constraints and likelihood modifiers.

Model extraction can help transform these sources into structured records, but the system should preserve:

- Source provenance.
- Confidence and review state.
- Access-control labels.
- Schema validation.
- Human override paths.
- Clear separation between observed facts, training assumptions, and generated scenario hypotheses.

The planner should output scenario likelihoods as assumptions for rehearsal, not calibrated real-world predictions.

### Local And On-Prem Future

The near-term implementation can run reconstruction and Unreal generation on a GPU VM, then stream the result to the browser.

The longer-term defense or industrial deployment story should allow the same pipeline to run on local infrastructure:

- On-prem GPU workstation or server.
- Local object storage.
- Local model endpoints.
- Local Unreal build and Pixel Streaming stack.
- No requirement to send sensitive imagery or documents to a third-party service.

The web app can remain the operator interface even when compute moves from cloud to on-prem.

### Hard Product Problems

The hardest parts of V2 are not the web UI or basic Unreal import.

The hardest parts are:

- Reconstruction quality under bad lighting, reflective surfaces, blank walls, thin objects, and incomplete image coverage.
- Scale, origin, and orientation consistency across captures.
- Generating collision and navigation that are safe enough for simulation.
- Automatically identifying meaningful tactical semantics from geometry and images.
- Validating that generated spawn points are reachable, believable, and not visible at scenario start unless intended.
- Converting proprietary documents into useful asset cards without hallucinated capabilities or unsupported claims.
- Keeping model outputs explainable and reviewable.
- Managing GPU scheduling, Pixel Streaming sessions, cold starts, and per-customer isolation.
- Securing raw imagery, source documents, generated artifacts, telemetry, and AAR outputs.
- Avoiding overclaims: AdaptSim can generate training hypotheses, not ground-truth intelligence predictions.

### V2 Roadmap

The roadmap should move from constrained automation to broader autonomy:

1. Accept direct `GLB`, `OBJ`, `USD`, or RealityScan exports and compile them into playable Unreal scenes.
2. Add robust image upload, artifact storage, and asynchronous job tracking.
3. Add fVDB reconstruction as a background GPU worker.
4. Add mesh postprocessing from FVDB mesh PLY to Unreal-ready GLB/FBX/OBJ artifacts.
5. Add document extraction into validated asset cards and behavior profiles.
6. Add automatic scenario generation with strict schema validation and Unreal feasibility checks.
7. Add Pixel Streaming session orchestration from the web app.
8. Add on-prem deployment mode for sensitive environments.

## Why This Wins

AdaptSim is compelling because it makes training local, repeatable, and variable.

The environment is real. The trainee recognizes the actual hallway, room, facility, or building.

The scenario is not a fixed authored level. The system can vary adversary placement, intent, timing, and behavior across repetitions.

The simulation is inspectable. Unreal owns the physics and telemetry, so the after-action review can point to what happened rather than narrating a generated video.

The model usage is practical. Models reduce authoring burden by extracting assets, proposing plausible adversary courses of action, generating props, and reviewing performance. They do not replace the game engine.

The product story is clear: scan the world, generate the threat space, rehearse repeatedly, and close the loop from field lessons into training faster.
