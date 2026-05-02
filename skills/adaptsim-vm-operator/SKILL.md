---
name: adaptsim-vm-operator
description: "Operate, connect to, and sanity-check the AdaptSim hackathon GCP VMs for this repository only. Use when working in /Users/nicholas.parkes/Repos/adaptsim-hackathon or a VM mirror on VM startup or SSH, the default Unreal Engine linux-pixel-streaming VM, the optional A100 compute VM, CUDA or Docker GPU runtime validation, asset-generation model setup, disk or GPU monitoring, root-owned output cleanup, or VM environment debugging."
---

# Adaptsim Vm Operator

## Overview

Use this skill to connect to and verify the AdaptSim hackathon VMs. Default to the Unreal Engine `linux-pixel-streaming` machine when the user asks which VM to start or asks to start the VM without specifying a target. Use the A100 machine only for optional heavy model experiments, offline asset generation, or batch processing. Load `references/vm-baseline.md` for the compact environment checklist.

## Repo Scope

Apply this skill only to:

```text
Local repo: /Users/nicholas.parkes/Repos/adaptsim-hackathon
VM root:    ~/adaptsim
GCP project: gecko-dev-fde
Default VM:  linux-pixel-streaming in us-east1-d
Compute VM:  a100-instance-02 in us-east1-b
```

## Default Agent VM Command

Use this exact command by default to start or connect to the Unreal Engine VM programmatically via an agent:

```bash
gcloud compute ssh --zone "us-east1-d" "linux-pixel-streaming" --project "gecko-dev-fde" --tunnel-through-iap
```

The same command is also stored in `scripts/start_adaptsim_vm_ssh.sh`.

## A100 Compute VM Command

Use this only when the user specifically asks for the A100 compute machine or heavy offline model work:

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
