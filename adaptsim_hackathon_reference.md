# AdaptSim Hackathon VM Reference

Living reference sheet for the A100 GCP VM setup and demo pipeline.

## VM Baseline

Project root on the VM:

```bash
~/adaptsim
```

Useful layout:

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

Confirmed VM shape:

```text
GPU: NVIDIA A100-SXM4-40GB
OS: Ubuntu 24.04
Driver after upgrade: 580.126.20
Docker GPU runtime: working
CUDA 12.8.1 container: working
```

Quick checks:

```bash
nvidia-smi
docker ps
docker run --rm --gpus all nvidia/cuda:12.8.1-base-ubuntu24.04 nvidia-smi
df -h
free -h
```

## Important Lessons

- Docker `--rm` removes the temporary container after it exits. It does not remove GPUs, files, images, or host state.
- Docker containers still use the host NVIDIA driver. Docker can pin CUDA userspace, but it cannot make an old host driver support newer CUDA.
- Cosmos Transfer2.5 setup requires CUDA 12.8-era support. The original `535` driver was too old for the official path; upgrading to `580` fixed it.
- Cosmos Transfer2.5’s repo currently needs Python 3.10 for the CUDA 12.8 `flash-attn` wheel, even if `.python-version` in the repo says something newer.
- Git LFS example assets initially appear as pointer files. Run `git lfs pull`.
- Container-created files may be owned by `root`; fix with `sudo chown -R`.

## Hugging Face Token

For model downloads, minimum token permission:

```text
Read access to contents of all public gated repos you can access
```

Login:

```bash
cd ~/adaptsim
source .venv/bin/activate
hf auth login
hf auth whoami
```

The token lives at:

```bash
~/.cache/huggingface/token
```

Pass it into Docker:

```bash
export HF_TOKEN="$(cat ~/.cache/huggingface/token)"
```

## Local Python Environment

Use the local `.venv` for orchestration and Cosmos Reason2 smoke tests, not for Transfer2.5.

```bash
cd ~/adaptsim
source "$HOME/.local/bin/env"
uv venv
source .venv/bin/activate
uv pip install -U "huggingface_hub" hf_transfer openai requests pillow opencv-python
```

For Cosmos Reason2 local inference, pin CUDA 12.1 PyTorch if needed:

```bash
uv pip uninstall -y torch torchvision torchaudio
uv pip install --force-reinstall \
  torch==2.5.1+cu121 \
  torchvision==0.20.1+cu121 \
  --index-url https://download.pytorch.org/whl/cu121

uv pip install -U git+https://github.com/huggingface/transformers accelerate qwen-vl-utils decord av
```

Verify:

```bash
python - <<'PY'
import torch
import torchvision
import transformers
print("torch", torch.__version__)
print("cuda available", torch.cuda.is_available())
print("gpu", torch.cuda.get_device_name(0) if torch.cuda.is_available() else None)
print("torchvision", torchvision.__version__)
print("transformers", transformers.__version__)
print("has Qwen3VL", hasattr(transformers, "Qwen3VLForConditionalGeneration"))
PY
```

Expected:

```text
cuda available True
gpu NVIDIA A100-SXM4-40GB
has Qwen3VL True
```

## Downloaded Models

### Cosmos Reason2 2B

Download:

```bash
cd ~/adaptsim
HF_HUB_ENABLE_HF_TRANSFER=1 hf download nvidia/Cosmos-Reason2-2B \
  --local-dir models/Cosmos-Reason2-2B
```

Notes:

- Model architecture: `Qwen3VLForConditionalGeneration`
- Input can be image or video plus text.
- For image input, use a normal local path, not `file://...`.

Working local model path:

```text
/home/nicholas.parkes/adaptsim/models/Cosmos-Reason2-2B
```

### Cosmos Transfer2.5 2B

Download:

```bash
cd ~/adaptsim
HF_HUB_ENABLE_HF_TRANSFER=1 hf download nvidia/Cosmos-Transfer2.5-2B \
  --local-dir models/Cosmos-Transfer2.5-2B
```

Useful distilled edge checkpoint:

```text
/models/Cosmos-Transfer2.5-2B/distilled/general/edge/41f07f13-f2e4-4e34-ba4c-86f595acbc20_ema_bf16.pt
```

## Cosmos Reason2 Scene Analysis

We created a synthetic corridor frame:

```text
~/adaptsim/data/captures/test_corridor.png
```

Working smoke test:

```bash
cd ~/adaptsim
source .venv/bin/activate
python scripts/reason2_image_smoke.py
```

Reusable analysis command:

```bash
python scripts/analyze_scene.py data/captures/test_corridor.png \
  | tee data/outputs/test_corridor_reason2.txt
```

The output is a structured scene analysis with sections like:

```text
scene_summary
plausible_hazards
likely_propagation_paths
occlusions_and_visibility_limits
trainee_safe_actions
trainee_unsafe_actions
good_world_modification_prompts
```

## Stub Scenario Director

OpenAI API is stubbed for now.

Run:

```bash
cd ~/adaptsim
source .venv/bin/activate

python scripts/direct_scenario_stub.py \
  data/outputs/test_corridor_reason2.txt \
  --out data/outputs/test_corridor_scenario_stub.json
```

Output shape:

```json
{
  "event_type": "blocked_egress",
  "world_modification_prompt": "Visibility drops near the main doorway while debris partially blocks the primary exit route.",
  "training_objective": "...",
  "expected_trainee_actions": ["..."],
  "director_mode": "stub_deterministic",
  "trigger_condition": "..."
}
```

Current demo spine:

```text
scene image -> Cosmos Reason2 scene analysis -> stub scenario director JSON
```

## Cosmos Transfer2.5 Runtime Repo

Clone:

```bash
cd ~/adaptsim/repos
git clone https://github.com/nvidia-cosmos/cosmos-transfer2.5.git
cd cosmos-transfer2.5
```

Buildx was required for the Dockerfile. If missing:

```bash
sudo apt install -y docker-buildx
# or
sudo apt install -y docker-buildx-plugin
docker buildx version
```

The repo Dockerfile uses BuildKit:

```bash
DOCKER_BUILDKIT=1 docker build -f Dockerfile -t cosmos-transfer25:cu128 .
```

But the repo tried Python 3.13 and failed because `flash-attn` only had `cp310` wheels. Working build workaround:

```bash
cd ~/adaptsim/repos

rm -rf cosmos-transfer2.5-build
cp -a cosmos-transfer2.5 cosmos-transfer2.5-build
cd cosmos-transfer2.5-build

printf '3.10\n' > .python-version
DOCKER_BUILDKIT=1 docker build -f Dockerfile -t cosmos-transfer25:cu128-py310 .
```

Confirm:

```bash
docker images | grep cosmos-transfer25
```

Expected image:

```text
cosmos-transfer25   cu128-py310
```

## Opening the Transfer Container

Use this container command for Transfer work:

```bash
cd ~/adaptsim/repos/cosmos-transfer2.5
export HF_TOKEN="$(cat ~/.cache/huggingface/token)"

docker run -it --gpus all --ipc=host --rm \
  -v "$PWD":/workspace \
  -v /home/nicholas.parkes/adaptsim:/adaptsim \
  -v /home/nicholas.parkes/adaptsim/models:/models \
  -v /home/nicholas.parkes/.cache:/root/.cache \
  -e HF_TOKEN="$HF_TOKEN" \
  cosmos-transfer25:cu128-py310
```

Inside the container:

```bash
cd /workspace
printf '3.10\n' > .python-version
uv sync --locked --extra=cu128
python scripts/check_environment.py
```

Expected environment successes include:

```text
torch v2.7.0+cu128
torchvision v0.22.0+cu128
transformer_engine
megatron.core
flash_attn
natten
flash_attn_func succeeds
```

If Git complains about the bind-mounted repo:

```bash
git config --global --add safe.directory /workspace
```

If LFS assets are pointers:

```bash
git lfs install
git lfs pull
```

## Official Transfer2.5 Distilled Edge Example

Inside container:

```bash
cd /workspace
git config --global --add safe.directory /workspace
git lfs install
git lfs pull
```

Verify sample files are real:

```bash
head -n 20 assets/robot_example/distilled/edge/robot_edge_spec.json
cat assets/robot_example/robot_prompt.txt
ls -lh assets/robot_example/robot_input.mp4 assets/robot_example/edge/robot_edge.mp4
```

Working command:

```bash
python examples/inference.py \
  -i assets/robot_example/distilled/edge/robot_edge_spec.json \
  -o outputs/distilled/edge \
  --model=edge \
  --checkpoint-path /models/Cosmos-Transfer2.5-2B/distilled/general/edge/41f07f13-f2e4-4e34-ba4c-86f595acbc20_ema_bf16.pt \
  --disable-guardrails \
  --offload-guardrail-models
```

Output:

```text
/workspace/outputs/distilled/edge/robot_edge.mp4
/workspace/outputs/distilled/edge/robot_edge_control_edge.mp4
/workspace/outputs/distilled/edge/robot_edge.json
/workspace/outputs/distilled/edge/config.yaml
/workspace/outputs/distilled/edge/console.log
```

On the host, because `/workspace` is bind-mounted:

```text
~/adaptsim/repos/cosmos-transfer2.5/outputs/distilled/edge/robot_edge.mp4
```

If output is root-owned:

```bash
sudo chown -R nicholas.parkes:nicholas.parkes \
  ~/adaptsim/repos/cosmos-transfer2.5/outputs
```

Open video on remote desktop:

```bash
firefox ~/adaptsim/repos/cosmos-transfer2.5/outputs/distilled/edge/robot_edge.mp4
```

If video playback is annoying, make JPG frames:

```bash
cd ~/adaptsim/repos/cosmos-transfer2.5
mkdir -p outputs/distilled/edge/frames
ffmpeg -y -i outputs/distilled/edge/robot_edge.mp4 -vf fps=1 outputs/distilled/edge/frames/frame_%03d.jpg
```

## Creating a Corridor Transfer Test

Install FFmpeg on host:

```bash
sudo apt update
sudo apt install -y ffmpeg
```

Create a 93-frame, 1280x720, 16 FPS video from the synthetic corridor image:

```bash
cd ~/adaptsim
mkdir -p data/transfer_test

ffmpeg -y \
  -loop 1 \
  -i data/captures/test_corridor.png \
  -vf "scale=1280:720,fps=16" \
  -t 5.8125 \
  -pix_fmt yuv420p \
  data/transfer_test/corridor_input.mp4
```

Create edge control video:

```bash
ffmpeg -y \
  -i data/transfer_test/corridor_input.mp4 \
  -vf "edgedetect=low=0.05:high=0.18,format=yuv420p" \
  -an \
  data/transfer_test/corridor_edge.mp4
```

Probe one file at a time:

```bash
ffprobe -v error -select_streams v:0 \
  -show_entries stream=width,height,nb_frames,r_frame_rate,duration \
  -of default=noprint_wrappers=1 \
  data/transfer_test/corridor_input.mp4

ffprobe -v error -select_streams v:0 \
  -show_entries stream=width,height,nb_frames,r_frame_rate,duration \
  -of default=noprint_wrappers=1 \
  data/transfer_test/corridor_edge.mp4
```

Expected:

```text
width=1280
height=720
r_frame_rate=16/1
nb_frames=93
```

Create prompt:

```bash
cat > data/transfer_test/corridor_prompt.txt <<'EOF'
An industrial training corridor and valve-room entrance. Smoke begins seeping from an overhead ventilation duct near the doorway. The scene remains physically grounded, realistic, and consistent with the original corridor geometry. Visibility gradually degrades near the exit while walls, floor, pipes, signage, and doorway remain structurally unchanged.
EOF
```

Create spec:

```bash
cat > data/transfer_test/corridor_edge_spec.json <<'EOF'
{
    "name": "corridor_smoke_edge",
    "prompt_path": "corridor_prompt.txt",
    "video_path": "corridor_input.mp4",
    "guidance": 3,
    "num_steps": 4,
    "seed": 7,
    "edge": {
        "control_path": "corridor_edge.mp4",
        "control_weight": 1.0
    }
}
EOF
```

Run corridor inference inside the Transfer container:

```bash
cd /adaptsim/data/transfer_test

python /workspace/examples/inference.py \
  -i corridor_edge_spec.json \
  -o /adaptsim/data/outputs/corridor_transfer \
  --model=edge \
  --checkpoint-path /models/Cosmos-Transfer2.5-2B/distilled/general/edge/41f07f13-f2e4-4e34-ba4c-86f595acbc20_ema_bf16.pt \
  --disable-guardrails \
  --offload-guardrail-models
```

On host after generation:

```bash
sudo chown -R nicholas.parkes:nicholas.parkes ~/adaptsim/data/outputs/corridor_transfer
firefox ~/adaptsim/data/outputs/corridor_transfer/corridor_smoke_edge.mp4
```

### 720p OOM and 480p Workaround

The synthetic corridor run OOMed at 1280x720 on the 40GB A100:

```text
torch.OutOfMemoryError
GPU total capacity: 39.49 GiB
Process memory in use: ~37.78 GiB
```

The official robot example worked, but the generated 720p corridor input caused the tokenizer path to exceed memory. The successful workaround is to run the corridor test at 480p while preserving the 93-frame distilled path.

Inside the Transfer container:

```bash
cd /adaptsim

mkdir -p data/transfer_test_480

ffmpeg -y \
  -loop 1 \
  -i data/captures/test_corridor.png \
  -vf "scale=848:480,fps=16" \
  -t 5.8125 \
  -pix_fmt yuv420p \
  data/transfer_test_480/corridor_input.mp4

ffmpeg -y \
  -i data/transfer_test_480/corridor_input.mp4 \
  -vf "edgedetect=low=0.05:high=0.18,format=yuv420p" \
  -an \
  data/transfer_test_480/corridor_edge.mp4

cp data/transfer_test/corridor_prompt.txt data/transfer_test_480/corridor_prompt.txt
```

Spec:

```bash
cat > data/transfer_test_480/corridor_edge_spec.json <<'EOF'
{
    "name": "corridor_smoke_edge_480",
    "prompt_path": "corridor_prompt.txt",
    "video_path": "corridor_input.mp4",
    "guidance": 3,
    "num_steps": 4,
    "seed": 7,
    "edge": {
        "control_path": "corridor_edge.mp4",
        "control_weight": 1.0
    }
}
EOF
```

Run:

```bash
cd /adaptsim/data/transfer_test_480

PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True \
python /workspace/examples/inference.py \
  -i corridor_edge_spec.json \
  -o /adaptsim/data/outputs/corridor_transfer_480 \
  --model=edge \
  --checkpoint-path /models/Cosmos-Transfer2.5-2B/distilled/general/edge/41f07f13-f2e4-4e34-ba4c-86f595acbc20_ema_bf16.pt \
  --resolution 480 \
  --disable-guardrails \
  --offload-guardrail-models
```

On host:

```bash
sudo chown -R nicholas.parkes:nicholas.parkes \
  /home/nicholas.parkes/adaptsim/data/outputs/corridor_transfer_480

firefox /home/nicholas.parkes/adaptsim/data/outputs/corridor_transfer_480/corridor_smoke_edge_480.mp4
```

## Monitoring

Watch GPU:

```bash
watch -n 1 nvidia-smi
```

Check disk:

```bash
df -h
du -sh ~/adaptsim/models/*
du -sh ~/.cache/huggingface/hub
```

Inspect logs:

```bash
tail -f ~/adaptsim/repos/cosmos-transfer2.5/outputs/distilled/edge/console.log
tail -f ~/adaptsim/data/outputs/corridor_transfer/console.log
```

## Current Working Demo Chain

Working today:

```text
1. Synthetic / captured scene image
2. Cosmos Reason2 scene analysis
3. Stub scenario director JSON
4. Edge-control video generation
5. Cosmos Transfer2.5 distilled edge video generation
```

Current strongest proof points:

```text
Reason2 works locally on A100.
Transfer2.5 official distilled edge sample generated successfully.
CUDA 12.8 Docker stack works after host driver upgrade.
```

Next likely work:

```text
1. Finish corridor_smoke_edge.mp4 generation.
2. Replace synthetic corridor with real captured frame/video.
3. Improve prompt/spec generation from scenario stub output.
4. Add OpenAI director when API key is available.
5. Consider reconstruction path: COLMAP/fvdb.
```

## fVDB Reality Capture

Docs:

```text
https://fvdb-reality-capture.readthedocs.io/latest/installation.html
```

Important requirements from the install docs:

```text
Linux only
Python 3.10-3.13
PyTorch 2.10.0
CUDA 12.8 or 13.0
NVIDIA driver 550+
Ampere or later GPU
```

Our VM after driver upgrade satisfies this:

```text
GPU: NVIDIA A100-SXM4-40GB
Driver: 580.126.20
Python used: 3.12.3
PyTorch installed for fvdb: 2.10.0+cu130
```

Installed fVDB Reality Capture into an isolated env:

```bash
cd ~/adaptsim
source "$HOME/.local/bin/env" 2>/dev/null || true

uv venv .venv-fvdb --python python3.12 --seed
source .venv-fvdb/bin/activate

python -m pip install \
  fvdb-reality-capture \
  fvdb-core==0.4.0+pt210.cu130 \
  --extra-index-url="https://d36m13axqqhiit.cloudfront.net/simple" \
  torch==2.10.0 \
  --extra-index-url https://download.pytorch.org/whl/cu130
```

Why `--seed` matters:

```text
The first uv venv did not include pip/ensurepip, so Ubuntu's system pip was accidentally used and hit PEP 668.
Recreating the env with `uv venv --seed` installed pip inside the env.
```

Verify install:

```bash
cd ~/adaptsim
source .venv-fvdb/bin/activate

python - <<'PY'
import torch
print("torch", torch.__version__)
print("cuda available", torch.cuda.is_available())
print("gpu", torch.cuda.get_device_name(0) if torch.cuda.is_available() else None)
import fvdb
print("fvdb import ok")
import fvdb_reality_capture
print("fvdb_reality_capture import ok")
PY

which frgs
frgs --help | head -n 80
```

Observed good output:

```text
torch 2.10.0+cu130
cuda available True
gpu NVIDIA A100-SXM4-40GB
fvdb import ok
fvdb_reality_capture import ok
/home/nicholas.parkes/adaptsim/.venv-fvdb/bin/frgs
```

Useful `frgs` commands shown by help:

```bash
frgs download --help
frgs reconstruct --help
frgs reconstruct-mcmc --help
frgs convert --help
frgs mesh-basic --help
frgs mesh-dlnr --help
```

Basic reconstruction shape from the CLI help:

```bash
# Reconstruct Gaussian splat radiance field from a COLMAP dataset
frgs reconstruct ./colmap_dataset -o ./output.ply

# Convert output formats
frgs convert input.ply output.usdz
```

Representation guidance:

```text
Splat: photoreal visual reconstruction/rendering layer.
Mesh: geometry, collision, navigation, spatial reasoning layer.
Video: scenario manifestation layer generated from rendered/captured views.
```

Do not try to make Transfer2.5 edit the splat or mesh directly during the hackathon. Render a view from the splat or capture a frame/video, then use Transfer2.5 to generate the scenario visual.
