#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME_SCRIPT="${SCRIPT_DIR}/adaptsim-pixel-streaming.sh"

VM_NAME="${ADAPTSIM_VM_NAME:-linux-pixel-streaming}"
VM_ZONE="${ADAPTSIM_VM_ZONE:-us-east1-d}"
GCP_PROJECT="${ADAPTSIM_GCP_PROJECT:-gecko-dev-fde}"

usage() {
  cat <<'EOF'
Usage:
  vm_pixel_streaming.sh status
  vm_pixel_streaming.sh launch-horror-corridor
  vm_pixel_streaming.sh restart [launch options]
  vm_pixel_streaming.sh stop [all|signalling|unreal]

Runs scripts/pixel-streaming/adaptsim-pixel-streaming.sh on the L4
linux-pixel-streaming VM via gcloud compute ssh --tunnel-through-iap.
EOF
}

if [[ ! -f "${RUNTIME_SCRIPT}" ]]; then
  printf 'ERROR: missing runtime script at %s\n' "${RUNTIME_SCRIPT}" >&2
  exit 1
fi

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

if ! command -v gcloud >/dev/null 2>&1; then
  printf 'ERROR: gcloud is required for local VM Pixel Streaming control.\n' >&2
  exit 1
fi

quote_arg() {
  printf '%q' "$1"
}

remote_command="env"
forward_env=(
  UE
  PROJECT
  UPROJECT
  PS_WEB
  ADAPTSIM_PIXEL_STREAMING_STATE_DIR
  ADAPTSIM_PS_PUBLIC_URL
  ADAPTSIM_PS_LOCAL_URL
  ADAPTSIM_PS_STREAMER_PORT
  ADAPTSIM_PS_PLAYER_PORT
  ADAPTSIM_PS_SFU_PORT
  ADAPTSIM_PS_WEBRTC_MIN_PORT
  ADAPTSIM_PS_WEBRTC_MAX_PORT
  ADAPTSIM_PS_DISABLE_TRANSMIT_AUDIO
  ADAPTSIM_PS_DISABLE_RECEIVE_AUDIO
  ADAPTSIM_PS_TURN_CREDENTIALS_FILE
  ADAPTSIM_PS_TURN_URLS
  ADAPTSIM_PS_TURN_USERNAME
  ADAPTSIM_PS_TURN_CREDENTIAL
  ADAPTSIM_PS_STUN_URLS
  ADAPTSIM_PS_ICE_TRANSPORT_POLICY
  ADAPTSIM_PS_AUTO_PEER_OPTIONS
  ADAPTSIM_PS_CONSOLE_MESSAGES
  ADAPTSIM_PS_LOG_CONFIG
  ADAPTSIM_SCENARIO_MANIFEST
  ADAPTSIM_SEMANTIC_ENVIRONMENT
  ADAPTSIM_MAP_PATH
  ADAPTSIM_DEMO_INPUT_START
  ADAPTSIM_DEMO_HOLD_SECONDS
)

for env_name in "${forward_env[@]}"; do
  if [[ -n "${!env_name+x}" ]]; then
    remote_command+=" ${env_name}=$(quote_arg "${!env_name}")"
  fi
done

remote_command+=" bash -s --"
for arg in "$@"; do
  remote_command+=" $(quote_arg "${arg}")"
done

gcloud compute ssh \
  --zone "${VM_ZONE}" \
  "${VM_NAME}" \
  --project "${GCP_PROJECT}" \
  --tunnel-through-iap \
  --command "${remote_command}" < "${RUNTIME_SCRIPT}"
