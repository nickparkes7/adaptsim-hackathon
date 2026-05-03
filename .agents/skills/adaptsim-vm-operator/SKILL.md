---
name: adaptsim-vm-operator
description: "Operate, connect to, sanity-check, and choose between the AdaptSim hackathon GCP VMs for this repository only. Use when working in the AdaptSim repo or a VM mirror on VM startup or SSH, the L4 Unreal/Pixel Streaming runtime VM, the A100 fVDB reconstruction worker, CUDA or Docker GPU runtime validation, shared artifact handoff, asset-generation model setup, disk or GPU monitoring, root-owned output cleanup, or VM environment debugging."
---

# AdaptSim VM Operator

## Overview

Use this skill to connect to, verify, and choose between the AdaptSim hackathon VMs. The normal split is A100 for reconstruction work and L4 for Unreal Engine plus Pixel Streaming runtime. Load `references/vm-baseline.md` for the compact environment checklist.

## VM Selection Rules

Default to the L4 `linux-pixel-streaming` VM when the user asks to start or connect to the AdaptSim runtime, demo, Unreal Editor/runtime, Pixel Streaming, scenario playback, telemetry/AAR demo flow, or streaming troubleshooting.

Use the A100 `a100-instance-02` VM when the user asks for fVDB, reconstruction, heavy CUDA batch work, offline asset generation, model experiments, or GPU worker setup. Treat the A100 as the reconstruction worker, not the interactive streaming machine.

Do not plan to run reconstruction and Pixel Streaming on the same L4 at the same time. If the A100 is unavailable and the L4 is the only option, run fVDB sequentially: stop or avoid launching the Unreal stream, run reconstruction, hand off the artifacts, then restart Unreal/Pixel Streaming.

Preferred hackathon architecture:

```text
A100 VM = reconstruction worker
L4 VM   = Unreal + Pixel Streaming runtime
GCS = handoff layer
```

Expected handoff layout:

```text
gs://aiscanners-hackathon2025/adaptsim-captures/captures/<capture_id>/raw/
gs://aiscanners-hackathon2025/adaptsim-captures/captures/<capture_id>/sfm/
gs://aiscanners-hackathon2025/adaptsim-captures/captures/<capture_id>/reconstruction/
gs://aiscanners-hackathon2025/adaptsim-captures/captures/<capture_id>/unreal-import/
gs://aiscanners-hackathon2025/adaptsim-captures/captures/<capture_id>/unreal/
gs://aiscanners-hackathon2025/adaptsim-captures/captures/<capture_id>/logs/
gs://aiscanners-hackathon2025/adaptsim-captures/captures/<capture_id>/status.json
```

Reasoning: fVDB can saturate CUDA compute and GPU memory. Pixel Streaming needs real-time rendering plus hardware video encode. The L4 is the right streaming GPU because it has NVENC; the A100 is the right reconstruction GPU but should not be used for Pixel Streaming because it has no NVENC.

## Repo Scope

Apply this skill only to:

```text
Local repo: this AdaptSim workspace
VM root:    ~/adaptsim
GCP project: gecko-dev-fde
Default VM:  linux-pixel-streaming in us-east1-d
Compute VM:  a100-instance-02 in us-east1-b
```

## L4 Unreal / Pixel Streaming VM Command

Use this exact command by default to start or connect to the Unreal Engine and Pixel Streaming VM programmatically via an agent:

```bash
gcloud compute ssh --zone "us-east1-d" "linux-pixel-streaming" --project "gecko-dev-fde" --tunnel-through-iap
```

The same command is also stored in `scripts/start_adaptsim_vm_ssh.sh`.

## A100 Reconstruction Worker Command

Use this exact command when the user asks for the A100 compute machine, fVDB reconstruction, heavy offline model work, or batch asset generation:

```bash
gcloud compute ssh --zone "us-east1-b" "a100-instance-02" --tunnel-through-iap --project "gecko-dev-fde"
```

## Quick Checks

Run these after connecting:

```bash
nvidia-smi
docker ps
docker run --rm --gpus all nvidia/cuda:12.8.1-base-ubuntu24.04 nvidia-smi
df -h
free -h
```

Expected baseline:

```text
Default Unreal VM: linux-pixel-streaming, Ubuntu 22.04 + L4 GPU
Default Unreal VM Docker: `nicholas.parkes` is in the `docker` group; `docker ps` and `docker run --rm hello-world` work without `sudo` as of 2026-05-02 22:45 UTC
Compute VM:
GPU: NVIDIA A100-SXM4-40GB
OS: Ubuntu 24.04
Driver after upgrade: 580.126.20
Docker GPU runtime: working
CUDA 12.8.1 container: working
```

## Common Tasks

- Confirm Hugging Face auth with `hf auth whoami` when pulling gated/open model weights.
- Export Docker token with `export HF_TOKEN="$(cat ~/.cache/huggingface/token)"` when a container needs it.
- Watch GPU with `watch -n 1 nvidia-smi`.
- Check model/cache disk use with `du -sh ~/adaptsim/models/*` and `du -sh ~/.cache/huggingface/hub`.
- Fix root-owned container outputs with `sudo chown -R nicholas.parkes:nicholas.parkes <path>`.

## Guardrails

- Do not delete VM files, Docker images, model caches, or captures unless the user explicitly asks.
- Remember Docker `--rm` removes only the temporary container after exit.
- Docker pins CUDA userspace, but the host NVIDIA driver still determines CUDA support.
- Prefer fixing the root cause of environment failures over rebuilding large images.
