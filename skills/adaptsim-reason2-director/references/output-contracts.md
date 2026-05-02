# Reason2 And Director Output Contracts

## Reason2 Analysis Sections

Preserve these sections when possible:

```text
scene_summary
plausible_hazards
likely_propagation_paths
occlusions_and_visibility_limits
trainee_safe_actions
trainee_unsafe_actions
good_world_modification_prompts
```

## Scenario Director JSON

Use this shape for stub and GPT-backed director outputs:

```json
{
  "event_type": "blocked_egress",
  "world_modification_prompt": "Visibility drops near the main doorway while debris partially blocks the primary exit route.",
  "training_objective": "Assess whether the trainee recognizes the degraded exit route and chooses an alternate safe path.",
  "expected_trainee_actions": [
    "Report degraded visibility",
    "Avoid moving blindly through the blocked exit",
    "Identify or request an alternate egress route"
  ],
  "director_mode": "stub_deterministic",
  "trigger_condition": "Start after the trainee approaches the primary doorway."
}
```

## Transfer-Friendly Prompt Pattern

Good prompts:

- Name the setting.
- Name the visual hazard.
- Specify where it begins.
- Preserve geometry.
- State the visual progression.

Example:

```text
An industrial training corridor and valve-room entrance. Smoke begins seeping from an overhead ventilation duct near the doorway. The scene remains physically grounded, realistic, and consistent with the original corridor geometry. Visibility gradually degrades near the exit while walls, floor, pipes, signage, and doorway remain structurally unchanged.
```

Avoid prompts that require editing the splat, changing mesh topology, inventing offscreen causal systems, or destroying the scene layout.
