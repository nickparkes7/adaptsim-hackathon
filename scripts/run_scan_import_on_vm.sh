#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/run_scan_import_on_vm.sh /vm/absolute/path/to/scan.glb [scan_id] [-- extra importer args]

The scan path must already exist on the linux-pixel-streaming VM. Extra importer
args are passed through to import_scanned_scene.py after "--".
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || $# -lt 1 ]]; then
  usage
  exit 0
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_SCRIPT="$REPO_ROOT/unreal/Content/Python/AdaptSim/import_scanned_scene.py"

VM_NAME="${ADAPTSIM_VM_NAME:-linux-pixel-streaming}"
VM_ZONE="${ADAPTSIM_VM_ZONE:-us-east1-d}"
GCP_PROJECT="${ADAPTSIM_GCP_PROJECT:-gecko-dev-fde}"
UE_ROOT="${ADAPTSIM_UE_ROOT:-/home/nicholas.parkes/tools/unreal/UnrealEngine-5.7.4}"
UE_PROJECT_ROOT="${ADAPTSIM_UE_PROJECT_ROOT:-/home/nicholas.parkes/Documents/Unreal Projects/AdaptSim}"
UPROJECT="$UE_PROJECT_ROOT/AdaptSim.uproject"
VM_CONTENT_DIR="$UE_PROJECT_ROOT/Content/Python/AdaptSim"
VM_SCRIPT="$VM_CONTENT_DIR/import_scanned_scene.py"

SCAN_SOURCE="$1"
shift || true

SCAN_ID=""
if [[ $# -gt 0 && "${1:-}" != "--" ]]; then
  SCAN_ID="$1"
  shift || true
fi

EXTRA_ARGS=()
if [[ "${1:-}" == "--" ]]; then
  shift
  EXTRA_ARGS=("$@")
fi

if [[ ! -f "$LOCAL_SCRIPT" ]]; then
  echo "Missing local importer: $LOCAL_SCRIPT" >&2
  exit 1
fi

q() {
  printf '%q' "$1"
}

GCP_BASE=(gcloud compute --project "$GCP_PROJECT")
SSH_BASE=("${GCP_BASE[@]}" ssh --zone "$VM_ZONE" "$VM_NAME" --tunnel-through-iap)
SCP_BASE=("${GCP_BASE[@]}" scp --zone "$VM_ZONE" --tunnel-through-iap)

"${SCP_BASE[@]}" "$LOCAL_SCRIPT" "$VM_NAME:/tmp/import_scanned_scene.py"
"${SSH_BASE[@]}" --command "mkdir -p $(q "$VM_CONTENT_DIR")"
"${SSH_BASE[@]}" --command "cp /tmp/import_scanned_scene.py $(q "$VM_SCRIPT")"

SCRIPT_ARGS=(--source "$SCAN_SOURCE")
if [[ -n "$SCAN_ID" ]]; then
  SCRIPT_ARGS+=(--scan-id "$SCAN_ID")
fi
SCRIPT_ARGS+=("${EXTRA_ARGS[@]}")

SCANWRIGHT_ARGS="$(printf ' %q' "${SCRIPT_ARGS[@]}")"
SCANWRIGHT_ARGS="${SCANWRIGHT_ARGS# }"
SCANWRIGHT_ARGS_B64="$(printf '%s' "$SCANWRIGHT_ARGS" | base64 | tr -d '\n')"

REMOTE_CMD="$(q "$UE_ROOT/Engine/Binaries/Linux/UnrealEditor-Cmd") $(q "$UPROJECT") -unattended -nop4 -nosplash -nullrhi -ExecutePythonScript=$(q "$VM_SCRIPT") -ScanwrightArgsB64=$(q "$SCANWRIGHT_ARGS_B64") -log"

"${SSH_BASE[@]}" --command "$REMOTE_CMD"
