#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME_SCRIPT="${SCRIPT_DIR}/adaptsim-pixel-streaming.sh"
VM_SCRIPT="${SCRIPT_DIR}/vm_pixel_streaming.sh"

UE_PATH="${UE:-/home/nicholas.parkes/tools/unreal/UnrealEngine-5.7.4}"
PROJECT_PATH="${PROJECT:-/home/nicholas.parkes/Documents/Unreal Projects/AdaptSim}"
UPROJECT_PATH="${UPROJECT:-${PROJECT_PATH}/AdaptSim.uproject}"
PS_WEB_PATH="${PS_WEB:-${UE_PATH}/Engine/Plugins/Media/PixelStreaming2/Resources/WebServers/SignallingWebServer}"

if [[ -x "${UE_PATH}/Engine/Binaries/Linux/UnrealEditor" && -f "${UPROJECT_PATH}" && -d "${PS_WEB_PATH}" ]]; then
  exec "${RUNTIME_SCRIPT}" launch-horror-corridor "$@"
fi

exec "${VM_SCRIPT}" launch-horror-corridor "$@"
