---
name: adaptsim-demo-runner
description: "Run and coordinate the AdaptSim defense hackathon demo chain for this repository only. Use when working in /Users/nicholas.parkes/Repos/adaptsim-hackathon or its VM mirror on AdaptSim demo execution, artifact generation, demo flow validation, current progress, next demo steps, or connecting Reason2 analysis, scenario director JSON, and Cosmos Transfer2.5 outputs."
---

# Adaptsim Demo Runner

## Overview

Use this skill to keep the hackathon demo moving from available inputs to judge-visible artifacts. Treat the repo root docs as canonical:

- `../../hackathon_brief.md` for narrative, use cases, architecture, and judging story
- `../../adaptsim_hackathon_reference.md` for current VM state, commands, paths, and known workarounds
- `references/current-demo-chain.md` for the shortest operational checklist

## Repo Scope

Apply this skill only to the AdaptSim hackathon repo and its A100 VM workspace:

```text
Local repo: /Users/nicholas.parkes/Repos/adaptsim-hackathon
VM root:    ~/adaptsim
```

If a task concerns another repo or a generic training simulation project, do not use this skill unless the user explicitly asks.

## Demo Chain

Use the current working spine:

```text
scene image or captured frame
-> Cosmos Reason2 scene analysis
-> stub or OpenAI scenario director JSON
-> edge-control video generation
-> Cosmos Transfer2.5 distilled edge threat video
-> after-action-review or pitch artifact
```

Prefer proving the chain with the smallest reliable artifact before expanding fidelity. The current strongest proof points are:

- Reason2 works locally on the A100.
- Transfer2.5 official distilled edge sample generated successfully.
- CUDA 12.8 Docker stack works after the host driver upgrade.
- The 480p corridor Transfer2.5 workaround is the safe path after 720p OOM.

## Workflow

1. Read `references/current-demo-chain.md`.
2. Check whether the user wants execution, debugging, or planning.
3. For execution, verify the VM with `$adaptsim-vm-operator` if needed.
4. For scene analysis or scenario JSON, use `$adaptsim-reason2-director`.
5. For threat video generation, use `$adaptsim-transfer25`.
6. Return the highest-signal status: what ran, where outputs landed, what failed, and the next concrete action.

## Defaults

- Use the synthetic corridor path when proving mechanics.
- Use real captured frames as soon as a capture exists.
- Use 480p Transfer2.5 generation unless the user explicitly wants to retry 720p.
- Keep GPT-5.5 calls behind an interface; the current director path may still be stubbed.
- Treat fVDB/COLMAP as a later reconstruction lane unless the user asks for reconstruction.

## Output Expectations

When running or reporting the demo chain, include:

- Input path
- Analysis path
- Scenario JSON path
- Transfer spec path
- Generated video path
- Any known caveat, especially OOM, root ownership, missing HF token, or missing API key
