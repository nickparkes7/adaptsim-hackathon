#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REMOTE_SCRIPT="${SCRIPT_DIR}/configure_turn_relay.sh"

VM_NAME="${ADAPTSIM_VM_NAME:-linux-pixel-streaming}"
VM_ZONE="${ADAPTSIM_VM_ZONE:-us-east1-d}"
GCP_PROJECT="${ADAPTSIM_GCP_PROJECT:-gecko-dev-fde}"

if [[ ! -f "${REMOTE_SCRIPT}" ]]; then
  printf 'ERROR: missing TURN relay setup script at %s\n' "${REMOTE_SCRIPT}" >&2
  exit 1
fi

if ! command -v gcloud >/dev/null 2>&1; then
  printf 'ERROR: gcloud is required for VM TURN relay setup.\n' >&2
  exit 1
fi

quote_arg() {
  printf '%q' "$1"
}

remote_command="env"
forward_env=(
  ADAPTSIM_PIXEL_STREAMING_STATE_DIR
  ADAPTSIM_PS_TURN_CREDENTIALS_FILE
  ADAPTSIM_PS_TURN_USERNAME
  ADAPTSIM_PS_TURN_CREDENTIAL
  ADAPTSIM_PS_TURN_REALM
  ADAPTSIM_PS_TURN_LISTEN_PORT
  ADAPTSIM_PS_TURN_MIN_PORT
  ADAPTSIM_PS_TURN_MAX_PORT
  ADAPTSIM_PS_TURN_CONFIG
  ADAPTSIM_PS_TURN_DEFAULT
  ADAPTSIM_PS_TURN_OVERRIDE_DIR
  ADAPTSIM_PS_TURN_ROTATE
  ADAPTSIM_PS_PUBLIC_IP
  ADAPTSIM_PS_PRIVATE_IP
)

for env_name in "${forward_env[@]}"; do
  if [[ -n "${!env_name+x}" ]]; then
    remote_command+=" ${env_name}=$(quote_arg "${!env_name}")"
  fi
done
remote_command+=" bash -s"

gcloud compute ssh \
  --zone "${VM_ZONE}" \
  "${VM_NAME}" \
  --project "${GCP_PROJECT}" \
  --tunnel-through-iap \
  --command "${remote_command}" < "${REMOTE_SCRIPT}"
