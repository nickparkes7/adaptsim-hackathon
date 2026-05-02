# VM Baseline

## Identity

```text
GCP project: gecko-dev-fde
Default VM: linux-pixel-streaming
Default zone: us-east1-d
Default purpose: Unreal Engine / pixel streaming / interactive graphics
Compute VM: a100-instance-02
Compute zone: us-east1-b
Compute purpose: optional heavy model experiments, offline asset generation, or batch processing
Project root on compute VM: ~/adaptsim
```

## Default Agent SSH Command

```bash
gcloud compute ssh --zone "us-east1-d" "linux-pixel-streaming" --project "gecko-dev-fde" --tunnel-through-iap
```

## A100 Compute SSH Command

```bash
gcloud compute ssh --zone "us-east1-b" "a100-instance-02" --tunnel-through-iap --project "gecko-dev-fde"
```

## Confirmed Compute Shape

```text
GPU: NVIDIA A100-SXM4-40GB
OS: Ubuntu 24.04
Driver after upgrade: 580.126.20
Docker GPU runtime: working
CUDA 12.8.1 container: working
```

## Layout

```text
Default Unreal VM:
  Use for Unreal Engine, pixel streaming, interactive graphics, and L4 workstation-style work.

Compute VM:
~/adaptsim/
  repos/        cloned runtime repos
  models/       Hugging Face model downloads
  data/
    captures/   scan exports, reference images, or captured frames
    outputs/    generated assets, manifests, logs, and run artifacts
  scripts/      local helper scripts
```

## Quick Checks

```bash
nvidia-smi
docker ps
docker run --rm --gpus all nvidia/cuda:12.8.1-base-ubuntu24.04 nvidia-smi
df -h
free -h
```

## Hugging Face

Minimum token permission:

```text
Read access to contents of all public gated repos you can access
```

Login and token path:

```bash
cd ~/adaptsim
source .venv/bin/activate
hf auth login
hf auth whoami
export HF_TOKEN="$(cat ~/.cache/huggingface/token)"
```

## Monitoring

```bash
watch -n 1 nvidia-smi
df -h
du -sh ~/adaptsim/models/*
du -sh ~/.cache/huggingface/hub
tail -f ~/adaptsim/data/outputs/*.log
```
