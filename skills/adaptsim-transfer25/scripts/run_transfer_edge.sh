#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 || $# -gt 3 ]]; then
  echo "Usage: $0 <spec-json> <output-dir> [resolution]" >&2
  echo "Run this inside the Cosmos Transfer2.5 container where /workspace and /models exist." >&2
  exit 64
fi

spec_json="$1"
output_dir="$2"
resolution="${3:-480}"
checkpoint="/models/Cosmos-Transfer2.5-2B/distilled/general/edge/41f07f13-f2e4-4e34-ba4c-86f595acbc20_ema_bf16.pt"

PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True \
python /workspace/examples/inference.py \
  -i "$spec_json" \
  -o "$output_dir" \
  --model=edge \
  --checkpoint-path "$checkpoint" \
  --resolution "$resolution" \
  --disable-guardrails \
  --offload-guardrail-models
