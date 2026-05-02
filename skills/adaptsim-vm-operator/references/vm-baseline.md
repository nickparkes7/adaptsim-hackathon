# VM Baseline

## Identity

```text
Project root on VM: ~/adaptsim
GCP project: gecko-dev-fde
Zone: us-east1-b
Instance: a100-instance-02
```

## Agent SSH Command

```bash
gcloud compute ssh --zone "us-east1-b" "a100-instance-02" --tunnel-through-iap --project "gecko-dev-fde"
```

## Confirmed Shape

```text
GPU: NVIDIA A100-SXM4-40GB
OS: Ubuntu 24.04
Driver after upgrade: 580.126.20
Docker GPU runtime: working
CUDA 12.8.1 container: working
```

## Layout

```text
~/adaptsim/
  repos/        cloned runtime repos
  models/       Hugging Face model downloads
  data/
    captures/   input images / captured frames
    outputs/    generated analysis and videos
    transfer_test/
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
tail -f ~/adaptsim/repos/cosmos-transfer2.5/outputs/distilled/edge/console.log
tail -f ~/adaptsim/data/outputs/corridor_transfer/console.log
```
