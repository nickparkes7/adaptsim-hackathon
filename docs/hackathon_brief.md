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
RealityScan mobile capture
-> USDZ / OBJ / GLB scene export
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

Use the RealityScan mobile app for the short-term demo.

The output is a real-world scene mesh imported into Unreal. This replaces the previous fVDB/COLMAP/Gaussian-splat reconstruction path for now.

Expected scene import work:

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

- RealityScan mobile app.
- USDZ, OBJ, GLB, or FBX export depending on the cleanest Unreal path.
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

### Removed From Short-Term Demo Stack

These are no longer part of the current demo plan:

- fVDB Reality Capture.
- COLMAP.
- Cosmos Reason2.
- Cosmos Transfer2.5.
- Cosmos Predict2.5.
- Gaussian splat rendering as the main runtime representation.

They may be revisited later, but they are not needed for the current RealityScan + Unreal path.

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

## Why This Wins

AdaptSim is compelling because it makes training local, repeatable, and variable.

The environment is real. The trainee recognizes the actual hallway, room, facility, or building.

The scenario is not a fixed authored level. The system can vary adversary placement, intent, timing, and behavior across repetitions.

The simulation is inspectable. Unreal owns the physics and telemetry, so the after-action review can point to what happened rather than narrating a generated video.

The model usage is practical. Models reduce authoring burden by extracting assets, proposing plausible adversary courses of action, generating props, and reviewing performance. They do not replace the game engine.

The product story is clear: scan the world, generate the threat space, rehearse repeatedly, and close the loop from field lessons into training faster.
