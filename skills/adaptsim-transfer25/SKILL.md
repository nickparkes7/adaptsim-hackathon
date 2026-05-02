---
name: adaptsim-transfer25
description: "Prepare, run, debug, and verify Cosmos Transfer2.5 distilled edge threat-video generation for the AdaptSim hackathon repo only. Use when working in /Users/nicholas.parkes/Repos/adaptsim-hackathon or the ~/adaptsim VM mirror on edge control videos, smoke or hazard world-modification prompts, Transfer2.5 Docker runtime, 480p OOM workarounds, checkpoint paths, video specs, ffmpeg probes, or generated threat clips."
---

# Adaptsim Transfer2.5

## Overview

Use this skill to turn a rendered or captured view into an edge-conditioned Cosmos Transfer2.5 threat video for the AdaptSim demo. Load `references/transfer-runtime.md` for exact commands and known pitfalls.

## Repo Scope

Apply this skill only to:

```text
Local repo: /Users/nicholas.parkes/Repos/adaptsim-hackathon
VM root:    ~/adaptsim
Runtime:    ~/adaptsim/repos/cosmos-transfer2.5
```

## Golden Path

1. Start or enter the Transfer container from `~/adaptsim/repos/cosmos-transfer2.5`.
2. Use Python 3.10 inside the Transfer repo.
3. Generate or verify the input video and edge control video.
4. Write a spec JSON that references local files beside the spec.
5. Run `examples/inference.py` with the distilled edge checkpoint.
6. Verify output with `ffprobe` or frame extraction.
7. Fix root-owned outputs with `sudo chown -R` if needed.

## Defaults

- Prefer distilled `edge`.
- Prefer 480p for corridor tests on the A100 40GB.
- Preserve the 93-frame distilled path: 16 FPS for 5.8125 seconds.
- Use `PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True` for corridor generation.
- Disable guardrails for hackathon local testing with `--disable-guardrails --offload-guardrail-models`.
- Do not attempt to edit splats or meshes directly during the hackathon; render or capture a view, then transfer that video.

## Bundled Scripts

- `scripts/make_edge_control_video.sh`: create a fixed-duration input video and edge control video from a still image.
- `scripts/probe_video.sh`: inspect dimensions, duration, frame rate, and frame count.
- `scripts/run_transfer_edge.sh`: run `examples/inference.py` from inside the Transfer container.

Read scripts before adapting them. They are intentionally small wrappers around the known commands, not a general Transfer2.5 framework.

## Failure Handling

- If 720p OOMs, switch to 848x480 and add `--resolution 480`.
- If `flash-attn` wheels fail, confirm the repo uses Python 3.10.
- If Git LFS sample assets are pointer files, run `git lfs pull`.
- If Docker outputs are root-owned, chown the output directory.
- If CUDA fails in Docker, verify host driver and Docker GPU runtime with `$adaptsim-vm-operator`.
