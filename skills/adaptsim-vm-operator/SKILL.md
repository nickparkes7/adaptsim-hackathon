---
name: adaptsim-vm-operator
description: "Operate, connect to, and sanity-check the AdaptSim hackathon A100 GCP VM for this repository only. Use when working in /Users/nicholas.parkes/Repos/adaptsim-hackathon or the ~/adaptsim VM mirror on VM startup or SSH, gcloud IAP connection, NVIDIA A100 40GB checks, CUDA or Docker GPU runtime validation, Hugging Face token setup, disk or GPU monitoring, root-owned output cleanup, or VM environment debugging."
---

# Adaptsim Vm Operator

## Overview

Use this skill to connect to and verify the AdaptSim A100 VM before running the demo, Reason2, Transfer2.5, or fVDB work. Load `references/vm-baseline.md` for the compact environment checklist.

## Repo Scope

Apply this skill only to:

```text
Local repo: /Users/nicholas.parkes/Repos/adaptsim-hackathon
VM root:    ~/adaptsim
GCP project: gecko-dev-fde
Zone:        us-east1-b
Instance:    a100-instance-02
```

## Agent VM Command

Use this exact command to start or connect to the VM programmatically via an agent:

```bash
gcloud compute ssh --zone "us-east1-b" "a100-instance-02" --tunnel-through-iap --project "gecko-dev-fde"
```

The same command is also stored in `scripts/start_adaptsim_vm_ssh.sh`.

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
GPU: NVIDIA A100-SXM4-40GB
OS: Ubuntu 24.04
Driver after upgrade: 580.126.20
Docker GPU runtime: working
CUDA 12.8.1 container: working
```

## Common Tasks

- Confirm Hugging Face auth with `hf auth whoami`.
- Export Docker token with `export HF_TOKEN="$(cat ~/.cache/huggingface/token)"`.
- Watch GPU with `watch -n 1 nvidia-smi`.
- Check model/cache disk use with `du -sh ~/adaptsim/models/*` and `du -sh ~/.cache/huggingface/hub`.
- Fix root-owned container outputs with `sudo chown -R nicholas.parkes:nicholas.parkes <path>`.

## Guardrails

- Do not delete VM files, Docker images, model caches, or captures unless the user explicitly asks.
- Remember Docker `--rm` removes only the temporary container after exit.
- Docker pins CUDA userspace, but the host NVIDIA driver still determines CUDA support.
- Prefer fixing the root cause of environment failures over rebuilding large images.
