# VM Baseline

## Identity

```text
GCP project: gecko-dev-fde
Default VM: linux-pixel-streaming
Default zone: us-east1-d
Default purpose: Unreal Engine / Pixel Streaming runtime / interactive graphics / demo stability
Compute VM: a100-instance-02
Compute zone: us-east1-b
Compute purpose: fVDB reconstruction worker / heavy CUDA batch work / offline asset generation
Project root on compute VM: ~/adaptsim
```

## Shared Capture Bucket

```text
Bucket: gs://aiscanners-hackathon2025
Prefix: gs://aiscanners-hackathon2025/adaptsim-captures/
Bucket project: fde-playground
VM project: gecko-dev-fde
Requester Pays: disabled
Bucket location: US
```

Cross-project storage is intentional for the reconstruction pipeline. The bucket
lives in `fde-playground`; the A100 and L4 VMs live in `gecko-dev-fde`.
Access is controlled through bucket IAM.

The following VM service accounts have `roles/storage.objectAdmin` on the
bucket and were smoke-tested from the VMs on 2026-05-03 UTC:

```text
A100 a100-instance-02:
  navsus-compute-service-account@gecko-dev-fde.iam.gserviceaccount.com
  access check: gs://aiscanners-hackathon2025/adaptsim-captures/_access_checks/a100-instance-02.txt

L4 linux-pixel-streaming:
  photogrammetry-test@gecko-dev-fde.iam.gserviceaccount.com
  access check: gs://aiscanners-hackathon2025/adaptsim-captures/_access_checks/linux-pixel-streaming.txt
```

## Control API Signed Upload URLs

For MVP browser uploads, the control API should use local Application Default
Credentials and impersonate the existing service account below. A dedicated
`adaptsim-url-signer` service account could not be created with the current
user's IAM permissions, so future agents should not assume it exists.

```text
GCS_BUCKET=aiscanners-hackathon2025
GCS_CAPTURE_PREFIX=adaptsim-captures
GCS_SIGNING_SERVICE_ACCOUNT=photogrammetry-test@gecko-dev-fde.iam.gserviceaccount.com
GCS_SIGNING_REGION=us
```

Required local auth:

```bash
gcloud auth application-default login
```

The active local principal must be able to impersonate
`photogrammetry-test@gecko-dev-fde.iam.gserviceaccount.com`. A signed URL PUT
probe succeeded with that service account and `--region=us`. Use the explicit
region when signing because auto-detection can fail under impersonation for the
US multi-region bucket. Do not use
`navsus-compute-service-account@gecko-dev-fde.iam.gserviceaccount.com` for
local signed URL generation unless IAM changes; the local user could not
impersonate it during setup.

Browser upload CORS is checked in at `infra/gcp/gcs-cors.json` and was applied
to `gs://aiscanners-hackathon2025` on 2026-05-03 UTC.

## L4 Unreal / Pixel Streaming SSH Command

```bash
gcloud compute ssh --zone "us-east1-d" "linux-pixel-streaming" --project "gecko-dev-fde" --tunnel-through-iap
```

Use this for Unreal Engine, Pixel Streaming, scenario runtime, interactive graphics, telemetry/AAR demo flow, and streaming troubleshooting.

## A100 Reconstruction Worker SSH Command

```bash
gcloud compute ssh --zone "us-east1-b" "a100-instance-02" --tunnel-through-iap --project "gecko-dev-fde"
```

Use this for fVDB reconstruction, heavy CUDA batch jobs, offline asset generation, model experiments, and GPU-worker setup.

## VM Selection

```text
A100 VM = reconstruction worker
L4 VM   = Unreal + Pixel Streaming runtime
GCS = handoff layer
```

Keep reconstruction and Pixel Streaming on separate machines when both VMs are available. The L4 can run fVDB, but do not run reconstruction and Pixel Streaming on the same L4 at the same time. If the L4 is the only available GPU, stop or avoid starting the Unreal stream, run fVDB sequentially, hand off artifacts, then restart Unreal/Pixel Streaming.

Use this artifact layout for worker/runtime handoff:

```text
gs://aiscanners-hackathon2025/adaptsim-captures/captures/<capture_id>/raw/
gs://aiscanners-hackathon2025/adaptsim-captures/captures/<capture_id>/sfm/
gs://aiscanners-hackathon2025/adaptsim-captures/captures/<capture_id>/reconstruction/
gs://aiscanners-hackathon2025/adaptsim-captures/captures/<capture_id>/unreal-import/
gs://aiscanners-hackathon2025/adaptsim-captures/captures/<capture_id>/unreal/
gs://aiscanners-hackathon2025/adaptsim-captures/captures/<capture_id>/logs/
gs://aiscanners-hackathon2025/adaptsim-captures/captures/<capture_id>/status.json
```

Operational rationale:

- fVDB wants CUDA compute and memory and can saturate the GPU during reconstruction.
- Pixel Streaming wants real-time rendering plus hardware video encode.
- L4 has NVENC and is the preferred streaming/runtime GPU.
- A100 is excellent for reconstruction but has no NVENC, so avoid using it for Pixel Streaming.
- FVDB exports splats to PLY/USDZ, while DLNR mesh extraction produces a mesh PLY that still needs conversion/postprocessing for Unreal import.

Persistent plan:

- `docs/photo_reconstruction_pipeline.md`

Source anchors for future hardware guidance checks:

- fVDB install docs: https://openvdb.github.io/fvdb-core/reality-capture/installation.html
- Epic Pixel Streaming reference: https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-pixel-streaming-reference?application_version=5.6
- NVIDIA L4 specs: https://www.nvidia.com/en-us/data-center/l4/
- NVIDIA Video Encode/Decode Matrix: https://developer.nvidia.com/video-encode-decode-support-matrix

## Confirmed Compute Shape

```text
GPU: NVIDIA A100-SXM4-40GB
OS: Ubuntu 24.04
Driver after upgrade: 580.126.20
Docker GPU runtime: working
CUDA 12.8.1 container: working
```

## Confirmed Default Unreal VM Shape

```text
GPU: NVIDIA L4
OS: Ubuntu 22.04
Docker CLI access: `nicholas.parkes` is in the `docker` group
Docker smoke test: `docker ps` and `docker run --rm hello-world` work without `sudo` as of 2026-05-02 22:45 UTC
```

## Layout

```text
Default Unreal VM:
  Use for Unreal Engine, Pixel Streaming, interactive graphics, and L4 workstation-style work.

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
