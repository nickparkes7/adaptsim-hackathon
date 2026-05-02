# Transfer2.5 Runtime Notes

## Runtime Paths

```text
VM root:       ~/adaptsim
Transfer repo: ~/adaptsim/repos/cosmos-transfer2.5
Model root:    ~/adaptsim/models/Cosmos-Transfer2.5-2B
Checkpoint:    /models/Cosmos-Transfer2.5-2B/distilled/general/edge/41f07f13-f2e4-4e34-ba4c-86f595acbc20_ema_bf16.pt
```

## Container

Start from the host:

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

Expected successes include `torch v2.7.0+cu128`, `flash_attn`, `natten`, and `flash_attn_func`.

## Official Sample

```bash
cd /workspace
git config --global --add safe.directory /workspace
git lfs install
git lfs pull

python examples/inference.py \
  -i assets/robot_example/distilled/edge/robot_edge_spec.json \
  -o outputs/distilled/edge \
  --model=edge \
  --checkpoint-path /models/Cosmos-Transfer2.5-2B/distilled/general/edge/41f07f13-f2e4-4e34-ba4c-86f595acbc20_ema_bf16.pt \
  --disable-guardrails \
  --offload-guardrail-models
```

## Safe Corridor 480p Run

Use 848x480, 16 FPS, 5.8125 seconds, 93 frames:

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
```

Run inference:

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

## Verification

```bash
ffprobe -v error -select_streams v:0 \
  -show_entries stream=width,height,nb_frames,r_frame_rate,duration \
  -of default=noprint_wrappers=1 \
  data/transfer_test_480/corridor_input.mp4
```

Expected:

```text
width=848
height=480
r_frame_rate=16/1
nb_frames=93
```

Fix host ownership after container output:

```bash
sudo chown -R nicholas.parkes:nicholas.parkes \
  /home/nicholas.parkes/adaptsim/data/outputs/corridor_transfer_480
```
