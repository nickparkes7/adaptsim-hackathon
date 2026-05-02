#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 || $# -gt 5 ]]; then
  echo "Usage: $0 <input-image> <output-dir> [width:height] [fps] [duration-seconds]" >&2
  exit 64
fi

input_image="$1"
output_dir="$2"
resolution="${3:-848:480}"
fps="${4:-16}"
duration="${5:-5.8125}"

mkdir -p "$output_dir"

ffmpeg -y \
  -loop 1 \
  -i "$input_image" \
  -vf "scale=${resolution},fps=${fps}" \
  -t "$duration" \
  -pix_fmt yuv420p \
  "$output_dir/corridor_input.mp4"

ffmpeg -y \
  -i "$output_dir/corridor_input.mp4" \
  -vf "edgedetect=low=0.05:high=0.18,format=yuv420p" \
  -an \
  "$output_dir/corridor_edge.mp4"
