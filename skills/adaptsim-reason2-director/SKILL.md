---
name: adaptsim-reason2-director
description: "Analyze AdaptSim hackathon scenes with Cosmos Reason2 and produce scenario director outputs for this repository only. Use when working in /Users/nicholas.parkes/Repos/adaptsim-hackathon or the ~/adaptsim VM mirror on Reason2 image or video analysis, plausible hazard enumeration, world-modification prompts, stub scenario JSON, GPT-5.5 scenario direction, or after-action-review schemas."
---

# Adaptsim Reason2 Director

## Overview

Use this skill to convert a scene frame or video into structured physical hazard analysis and then into a scenario director event. Load `references/output-contracts.md` for the expected section names and JSON shape.

## Repo Scope

Apply this skill only to:

```text
Local repo: /Users/nicholas.parkes/Repos/adaptsim-hackathon
VM root:    ~/adaptsim
```

## Working Commands

Run Reason2 analysis:

```bash
cd ~/adaptsim
source .venv/bin/activate
python scripts/analyze_scene.py data/captures/test_corridor.png \
  | tee data/outputs/test_corridor_reason2.txt
```

Run stub director:

```bash
cd ~/adaptsim
source .venv/bin/activate
python scripts/direct_scenario_stub.py \
  data/outputs/test_corridor_reason2.txt \
  --out data/outputs/test_corridor_scenario_stub.json
```

## Director Rules

- Ground hazards in visible geometry or Reason2-inferred spatial affordances.
- Prefer physically plausible threats: smoke, blocked egress, pipe failure, valve unresponsive, visibility loss, flooding, debris, or equipment casualty.
- Keep world-modification prompts visual and Transfer2.5-friendly.
- Preserve the original environment structure in prompts unless the task explicitly asks for destructive changes.
- Avoid inventing doctrine. For AAR, label doctrine-dependent claims as assumptions unless a doctrine source is provided.

## GPT-5.5 Path

The current OpenAI scenario director may be stubbed. When replacing it:

- Keep the same JSON contract as the stub.
- Use `gpt-5.5` as the model string if available.
- Make the OpenAI call stateless.
- Keep a local-model seam for future airgapped deployment.

## Output Expectations

Return paths and summarize only the fields that matter for the next stage: event type, prompt, training objective, expected trainee actions, and trigger condition.
