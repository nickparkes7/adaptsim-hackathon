#!/usr/bin/env bash
set -euo pipefail

DEFAULT_UE="/home/nicholas.parkes/tools/unreal/UnrealEngine-5.7.4"
DEFAULT_PROJECT="/home/nicholas.parkes/Documents/Unreal Projects/AdaptSim"
DEFAULT_MAP_PATH="/Game/AdaptSim/Maps/L_HorrorCorridor_Imported"
DEFAULT_SCENARIO_MANIFEST_REL="Saved/AdaptSimContractExamples/scenario_manifests/horror_corridor_ambush_delay_001.json"
DEFAULT_SEMANTIC_ENVIRONMENT_REL="Saved/AdaptSimContractExamples/semantic_environments/horror_corridor_imported.json"

UE="${UE:-${DEFAULT_UE}}"
PROJECT="${PROJECT:-${DEFAULT_PROJECT}}"
UPROJECT="${UPROJECT:-${PROJECT}/AdaptSim.uproject}"
PS_WEB="${PS_WEB:-${UE}/Engine/Plugins/Media/PixelStreaming2/Resources/WebServers/SignallingWebServer}"

STATE_DIR="${ADAPTSIM_PIXEL_STREAMING_STATE_DIR:-${HOME}/adaptsim-pixelstreaming}"
SIGNALLING_PID_FILE="${ADAPTSIM_PS_SIGNALLING_PID_FILE:-${STATE_DIR}/wilbur.pid}"
SIGNALLING_LOG_FILE="${ADAPTSIM_PS_SIGNALLING_LOG_FILE:-${STATE_DIR}/wilbur.log}"
UNREAL_PID_FILE="${ADAPTSIM_PS_UNREAL_PID_FILE:-${STATE_DIR}/unreal.pid}"
UNREAL_LOG_FILE="${ADAPTSIM_PS_UNREAL_LOG_FILE:-${STATE_DIR}/unreal-pixelstreaming.log}"
LAST_LAUNCH_FILE="${ADAPTSIM_PS_LAST_LAUNCH_FILE:-${STATE_DIR}/last-launch.json}"
STATUS_FILE="${ADAPTSIM_PS_STATUS_FILE:-${STATE_DIR}/status.json}"
PEER_OPTIONS_FILE="${ADAPTSIM_PS_PEER_OPTIONS_FILE:-${STATE_DIR}/peer_options.json}"
TURN_CREDENTIALS_FILE="${ADAPTSIM_PS_TURN_CREDENTIALS_FILE:-${STATE_DIR}/turn_credentials.env}"

if [[ -f "${TURN_CREDENTIALS_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "${TURN_CREDENTIALS_FILE}"
  set +a
fi

STREAMER_PORT="${ADAPTSIM_PS_STREAMER_PORT:-8888}"
PLAYER_PORT="${ADAPTSIM_PS_PLAYER_PORT:-80}"
SFU_PORT="${ADAPTSIM_PS_SFU_PORT:-8889}"
PUBLIC_PLAYER_URL="${ADAPTSIM_PS_PUBLIC_URL:-http://34.139.126.187/player.html}"
LOCAL_PLAYER_URL="${ADAPTSIM_PS_LOCAL_URL:-http://127.0.0.1:${PLAYER_PORT}/player.html}"

WEBRTC_MIN_PORT="${ADAPTSIM_PS_WEBRTC_MIN_PORT:-19302}"
WEBRTC_MAX_PORT="${ADAPTSIM_PS_WEBRTC_MAX_PORT:-19303}"
WEBRTC_MIN_BITRATE="${ADAPTSIM_PS_WEBRTC_MIN_BITRATE:-3000000}"
WEBRTC_MAX_BITRATE="${ADAPTSIM_PS_WEBRTC_MAX_BITRATE:-10000000}"
DISABLE_TRANSMIT_AUDIO="${ADAPTSIM_PS_DISABLE_TRANSMIT_AUDIO:-true}"
DISABLE_RECEIVE_AUDIO="${ADAPTSIM_PS_DISABLE_RECEIVE_AUDIO:-true}"
ENCODER_CODEC="${ADAPTSIM_PS_ENCODER_CODEC:-H264}"
ENCODER_MAX_BITRATE="${ADAPTSIM_PS_ENCODER_MAX_BITRATE:-10000000}"
ENCODER_TARGET_BITRATE="${ADAPTSIM_PS_ENCODER_TARGET_BITRATE:-}"
STUN_URLS="${ADAPTSIM_PS_STUN_URLS-stun:stun.l.google.com:19302}"
TURN_URLS="${ADAPTSIM_PS_TURN_URLS:-}"
TURN_USERNAME="${ADAPTSIM_PS_TURN_USERNAME:-}"
TURN_CREDENTIAL="${ADAPTSIM_PS_TURN_CREDENTIAL:-}"
ICE_TRANSPORT_POLICY="${ADAPTSIM_PS_ICE_TRANSPORT_POLICY:-}"
AUTO_PEER_OPTIONS="${ADAPTSIM_PS_AUTO_PEER_OPTIONS:-1}"
CONSOLE_MESSAGES="${ADAPTSIM_PS_CONSOLE_MESSAGES:-auto}"
LOG_CONFIG="${ADAPTSIM_PS_LOG_CONFIG:-auto}"
RES_X="${ADAPTSIM_PS_RES_X:-1280}"
RES_Y="${ADAPTSIM_PS_RES_Y:-720}"
DEMO_HOLD_SECONDS="${ADAPTSIM_DEMO_HOLD_SECONDS:-25}"

SIGNALLING_PATTERN="dist/index.js.*--streamer_port ${STREAMER_PORT}.*--player_port ${PLAYER_PORT}"
UNREAL_PATTERN="UnrealEditor.*PixelStreamingConnectionURL=ws://127.0.0.1:${STREAMER_PORT}"

LAUNCH_MAP="${ADAPTSIM_MAP_PATH:-${DEFAULT_MAP_PATH}}"
LAUNCH_SCENARIO_MANIFEST="${ADAPTSIM_SCENARIO_MANIFEST:-${PROJECT}/${DEFAULT_SCENARIO_MANIFEST_REL}}"
LAUNCH_SEMANTIC_ENVIRONMENT="${ADAPTSIM_SEMANTIC_ENVIRONMENT:-${PROJECT}/${DEFAULT_SEMANTIC_ENVIRONMENT_REL}}"
LAUNCH_DEMO_INPUT_START="${ADAPTSIM_DEMO_INPUT_START:-true}"
LAUNCH_DEMO_AUTO_PRESS_1="${ADAPTSIM_DEMO_AUTO_PRESS_1:-true}"
EXTRA_UNREAL_ARGS=()

usage() {
  cat <<'EOF'
Usage:
  adaptsim-pixel-streaming.sh status
  adaptsim-pixel-streaming.sh start [launch options]
  adaptsim-pixel-streaming.sh restart [launch options]
  adaptsim-pixel-streaming.sh launch-horror-corridor [launch options]
  adaptsim-pixel-streaming.sh start-signalling
  adaptsim-pixel-streaming.sh start-unreal [launch options]
  adaptsim-pixel-streaming.sh stop [all|signalling|unreal]

Launch options:
  --map PATH                    Unreal map path. Default: /Game/AdaptSim/Maps/L_HorrorCorridor_Imported
  --scenario-manifest PATH      Scenario manifest JSON path on the VM.
  --semantic-environment PATH   Semantic environment JSON path on the VM.
  --no-scenario-flags           Launch without AdaptSim manifest/environment flags.
  --demo-input-start            Add -AdaptSimDemoInputStart. This is the default.
  --no-demo-input-start         Do not add -AdaptSimDemoInputStart.
  --demo-auto-press-1           Add -AdaptSimDemoAutoPress1. This is the default.
  --no-demo-auto-press-1        Do not auto-start the scenario from the demo controller.
  --hold-seconds SECONDS        Demo hold window. Default: 25.
  --extra-unreal-arg ARG        Append one raw Unreal CLI argument. Repeatable.

Environment overrides:
  UE, PROJECT, UPROJECT, PS_WEB
  ADAPTSIM_PIXEL_STREAMING_STATE_DIR
  ADAPTSIM_PS_PUBLIC_URL
  ADAPTSIM_PS_RES_X / ADAPTSIM_PS_RES_Y
  ADAPTSIM_PS_WEBRTC_MIN_PORT / ADAPTSIM_PS_WEBRTC_MAX_PORT
  ADAPTSIM_PS_WEBRTC_MIN_BITRATE / ADAPTSIM_PS_WEBRTC_MAX_BITRATE
  ADAPTSIM_PS_ENCODER_CODEC
  ADAPTSIM_PS_ENCODER_MAX_BITRATE / ADAPTSIM_PS_ENCODER_TARGET_BITRATE
  ADAPTSIM_PS_TURN_URLS / ADAPTSIM_PS_TURN_USERNAME / ADAPTSIM_PS_TURN_CREDENTIAL
  ADAPTSIM_PS_ICE_TRANSPORT_POLICY
  ADAPTSIM_PS_TURN_CREDENTIALS_FILE
  ADAPTSIM_PS_CONSOLE_MESSAGES (auto, off, basic, verbose, formatted)
  ADAPTSIM_PS_LOG_CONFIG (auto, true, false)

Status is emitted as JSON on stdout and also written to:
  $ADAPTSIM_PIXEL_STREAMING_STATE_DIR/status.json
EOF
}

info() {
  printf '%s\n' "$*" >&2
}

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

ensure_state_dir() {
  mkdir -p "${STATE_DIR}"
}

read_pid_file() {
  local pid_file="$1"
  if [[ ! -s "${pid_file}" ]]; then
    return 1
  fi

  local pid
  pid="$(tr -d '[:space:]' < "${pid_file}")"
  if [[ ! "${pid}" =~ ^[0-9]+$ ]]; then
    return 1
  fi
  printf '%s\n' "${pid}"
}

pid_running() {
  local pid="$1"
  [[ -n "${pid}" ]] || return 1
  kill -0 "${pid}" >/dev/null 2>&1
}

pid_cmdline() {
  local pid="$1"
  if [[ -r "/proc/${pid}/cmdline" ]]; then
    tr '\0' ' ' < "/proc/${pid}/cmdline"
    return 0
  fi

  ps -p "${pid}" -o command= 2>/dev/null || true
}

pid_matches_signalling() {
  local pid="$1"
  local cmdline
  cmdline="$(pid_cmdline "${pid}")"
  [[ "${cmdline}" == *"dist/index.js"* && "${cmdline}" == *"--streamer_port ${STREAMER_PORT}"* && "${cmdline}" == *"--player_port ${PLAYER_PORT}"* ]]
}

pid_matches_unreal() {
  local pid="$1"
  local cmdline
  cmdline="$(pid_cmdline "${pid}")"
  [[ "${cmdline}" == *"UnrealEditor"* && "${cmdline}" == *"PixelStreamingConnectionURL=ws://127.0.0.1:${STREAMER_PORT}"* ]]
}

pid_matches_component() {
  local component="$1"
  local pid="$2"
  case "${component}" in
    signalling) pid_matches_signalling "${pid}" ;;
    unreal) pid_matches_unreal "${pid}" ;;
    *) return 1 ;;
  esac
}

discover_pid() {
  local pattern="$1"
  command_exists pgrep || return 1

  local candidates
  candidates="$(pgrep -f "${pattern}" 2>/dev/null || true)"
  while IFS= read -r candidate; do
    [[ -n "${candidate}" ]] || continue
    [[ "${candidate}" == "$$" || "${candidate}" == "${BASHPID}" ]] && continue
    if pid_running "${candidate}"; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  done <<< "${candidates}"

  return 1
}

component_snapshot() {
  local component="$1"
  local pid_file="$2"
  local pattern="$3"
  local pid=""
  local pid_source="none"
  local pid_file_pid=""
  local stale_pid_file="false"

  if pid_file_pid="$(read_pid_file "${pid_file}" 2>/dev/null)"; then
    if pid_running "${pid_file_pid}" && pid_matches_component "${component}" "${pid_file_pid}"; then
      pid="${pid_file_pid}"
      pid_source="pid_file"
    else
      stale_pid_file="true"
    fi
  elif [[ -e "${pid_file}" ]]; then
    stale_pid_file="true"
  fi

  if [[ -z "${pid}" ]]; then
    local discovered_pid
    if discovered_pid="$(discover_pid "${pattern}" 2>/dev/null)"; then
      pid="${discovered_pid}"
      pid_source="process_table"
    fi
  fi

  printf '%s|%s|%s|%s\n' "${pid}" "${pid_source}" "${pid_file_pid}" "${stale_pid_file}"
}

is_http_ready() {
  command_exists curl || return 1
  curl -fsS --max-time 2 "${LOCAL_PLAYER_URL}" -o /dev/null >/dev/null 2>&1
}

is_streamer_registered() {
  command_exists ss || return 1
  ss -Htn state established "( sport = :${STREAMER_PORT} )" 2>/dev/null | grep -q .
}

status_value_for_component() {
  local running="$1"
  local stale="$2"
  local ready_probe="${3:-true}"

  if [[ "${running}" == "true" && "${ready_probe}" == "true" ]]; then
    printf 'ready\n'
  elif [[ "${running}" == "true" ]]; then
    printf 'running\n'
  elif [[ "${stale}" == "true" ]]; then
    printf 'stale\n'
  else
    printf 'stopped\n'
  fi
}

emit_status() {
  ensure_state_dir

  local signalling_snapshot unreal_snapshot
  signalling_snapshot="$(component_snapshot "signalling" "${SIGNALLING_PID_FILE}" "${SIGNALLING_PATTERN}")"
  unreal_snapshot="$(component_snapshot "unreal" "${UNREAL_PID_FILE}" "${UNREAL_PATTERN}")"

  local signalling_pid signalling_pid_source signalling_pid_file_pid signalling_stale
  local unreal_pid unreal_pid_source unreal_pid_file_pid unreal_stale
  IFS='|' read -r signalling_pid signalling_pid_source signalling_pid_file_pid signalling_stale <<< "${signalling_snapshot}"
  IFS='|' read -r unreal_pid unreal_pid_source unreal_pid_file_pid unreal_stale <<< "${unreal_snapshot}"

  local signalling_running="false"
  local unreal_running="false"
  local signalling_http_ready="false"
  local signalling_streamer_ready="false"

  [[ -n "${signalling_pid}" ]] && signalling_running="true"
  [[ -n "${unreal_pid}" ]] && unreal_running="true"
  if is_http_ready; then
    signalling_http_ready="true"
  fi
  if is_streamer_registered; then
    signalling_streamer_ready="true"
  fi

  local signalling_status unreal_status overall_status ready
  signalling_status="$(status_value_for_component "${signalling_running}" "${signalling_stale}" "${signalling_http_ready}")"
  unreal_status="$(status_value_for_component "${unreal_running}" "${unreal_stale}" "${signalling_streamer_ready}")"

  ready="false"
  if [[ "${signalling_running}" == "true" && "${unreal_running}" == "true" && "${signalling_http_ready}" == "true" && "${signalling_streamer_ready}" == "true" ]]; then
    overall_status="ready"
    ready="true"
  elif [[ "${signalling_running}" == "false" && "${unreal_running}" == "false" && "${signalling_stale}" == "false" && "${unreal_stale}" == "false" ]]; then
    overall_status="stopped"
  elif [[ "${signalling_stale}" == "true" || "${unreal_stale}" == "true" ]]; then
    overall_status="partial"
  else
    overall_status="launching"
  fi

  export STATUS_FILE
  export OVERALL_STATUS="${overall_status}"
  export READY="${ready}"
  export GENERATED_AT
  GENERATED_AT="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  export STATE_DIR SIGNALLING_PID_FILE SIGNALLING_LOG_FILE UNREAL_PID_FILE UNREAL_LOG_FILE LAST_LAUNCH_FILE
  export PEER_OPTIONS_FILE TURN_CREDENTIALS_FILE
  export STREAMER_PORT PLAYER_PORT SFU_PORT LOCAL_PLAYER_URL PUBLIC_PLAYER_URL
  export WEBRTC_MIN_PORT WEBRTC_MAX_PORT WEBRTC_MIN_BITRATE WEBRTC_MAX_BITRATE
  export DISABLE_TRANSMIT_AUDIO DISABLE_RECEIVE_AUDIO ENCODER_CODEC ENCODER_MAX_BITRATE ENCODER_TARGET_BITRATE
  export STUN_URLS TURN_URLS ICE_TRANSPORT_POLICY
  export UE PROJECT UPROJECT PS_WEB
  export SIGNALLING_PID="${signalling_pid}"
  export SIGNALLING_PID_SOURCE="${signalling_pid_source}"
  export SIGNALLING_PID_FILE_PID="${signalling_pid_file_pid}"
  export SIGNALLING_STALE="${signalling_stale}"
  export SIGNALLING_RUNNING="${signalling_running}"
  export SIGNALLING_STATUS="${signalling_status}"
  export SIGNALLING_HTTP_READY="${signalling_http_ready}"
  export SIGNALLING_STREAMER_READY="${signalling_streamer_ready}"
  export UNREAL_PID="${unreal_pid}"
  export UNREAL_PID_SOURCE="${unreal_pid_source}"
  export UNREAL_PID_FILE_PID="${unreal_pid_file_pid}"
  export UNREAL_STALE="${unreal_stale}"
  export UNREAL_RUNNING="${unreal_running}"
  export UNREAL_STATUS="${unreal_status}"

  python3 - <<'PY'
import json
import os


def as_bool(name):
    return os.environ.get(name) == "true"


def as_int(name):
    value = os.environ.get(name, "")
    if value == "":
        return None
    try:
        return int(value)
    except ValueError:
        return value

def csv_list(name):
    return [item.strip() for item in os.environ.get(name, "").split(",") if item.strip()]


last_launch = None
last_launch_path = os.environ["LAST_LAUNCH_FILE"]
try:
    with open(last_launch_path, "r", encoding="utf-8") as handle:
        last_launch = json.load(handle)
except (FileNotFoundError, json.JSONDecodeError, OSError):
    last_launch = None

data = {
    "schema_version": 1,
    "generated_at": os.environ["GENERATED_AT"],
    "status": os.environ["OVERALL_STATUS"],
    "ready": as_bool("READY"),
    "provider": "unreal_pixel_streaming",
    "last_launch": last_launch,
    "urls": {
        "player": os.environ["PUBLIC_PLAYER_URL"],
        "local_player": os.environ["LOCAL_PLAYER_URL"],
    },
    "ports": {
        "streamer": as_int("STREAMER_PORT"),
        "player": as_int("PLAYER_PORT"),
        "sfu": as_int("SFU_PORT"),
        "webrtc_min": as_int("WEBRTC_MIN_PORT"),
        "webrtc_max": as_int("WEBRTC_MAX_PORT"),
    },
    "paths": {
        "state_dir": os.environ["STATE_DIR"],
        "status_file": os.environ["STATUS_FILE"],
        "last_launch_file": os.environ["LAST_LAUNCH_FILE"],
        "peer_options_file": os.environ["PEER_OPTIONS_FILE"],
        "turn_credentials_file": os.environ["TURN_CREDENTIALS_FILE"],
        "ue": os.environ["UE"],
        "project": os.environ["PROJECT"],
        "uproject": os.environ["UPROJECT"],
        "signalling_web_server": os.environ["PS_WEB"],
    },
    "components": {
        "signalling": {
            "status": os.environ["SIGNALLING_STATUS"],
            "running": as_bool("SIGNALLING_RUNNING"),
            "pid": as_int("SIGNALLING_PID"),
            "pid_source": os.environ["SIGNALLING_PID_SOURCE"],
            "pid_file_pid": as_int("SIGNALLING_PID_FILE_PID"),
            "stale_pid_file": as_bool("SIGNALLING_STALE"),
            "pid_file": os.environ["SIGNALLING_PID_FILE"],
            "log_file": os.environ["SIGNALLING_LOG_FILE"],
            "http_ready": as_bool("SIGNALLING_HTTP_READY"),
            "streamer_connected": as_bool("SIGNALLING_STREAMER_READY"),
        },
        "unreal": {
            "status": os.environ["UNREAL_STATUS"],
            "running": as_bool("UNREAL_RUNNING"),
            "pid": as_int("UNREAL_PID"),
            "pid_source": os.environ["UNREAL_PID_SOURCE"],
            "pid_file_pid": as_int("UNREAL_PID_FILE_PID"),
            "stale_pid_file": as_bool("UNREAL_STALE"),
            "pid_file": os.environ["UNREAL_PID_FILE"],
            "log_file": os.environ["UNREAL_LOG_FILE"],
        },
    },
    "launch_flags": {
        "disable_transmit_audio": as_bool("DISABLE_TRANSMIT_AUDIO"),
        "disable_receive_audio": as_bool("DISABLE_RECEIVE_AUDIO"),
        "encoder_codec": os.environ["ENCODER_CODEC"],
        "webrtc_min_bitrate": as_int("WEBRTC_MIN_BITRATE"),
        "webrtc_max_bitrate": as_int("WEBRTC_MAX_BITRATE"),
        "encoder_max_bitrate": as_int("ENCODER_MAX_BITRATE"),
        "encoder_target_bitrate": as_int("ENCODER_TARGET_BITRATE"),
    },
    "ice": {
        "transport_policy": os.environ["ICE_TRANSPORT_POLICY"] or ("relay" if os.environ["TURN_URLS"] else "all"),
        "turn_configured": bool(os.environ["TURN_URLS"]),
        "turn_urls": csv_list("TURN_URLS"),
        "stun_urls": csv_list("STUN_URLS"),
        "peer_options_file": os.environ["PEER_OPTIONS_FILE"],
    },
    "stream": {
        "status": "ready" if as_bool("READY") else (
            "waiting_for_streamer"
            if as_bool("SIGNALLING_RUNNING") and as_bool("UNREAL_RUNNING") and as_bool("SIGNALLING_HTTP_READY")
            else "launching"
        ),
        "streamer_connected": as_bool("SIGNALLING_STREAMER_READY"),
    },
}

status_file = os.environ["STATUS_FILE"]
tmp_file = f"{status_file}.tmp"
with open(tmp_file, "w", encoding="utf-8") as handle:
    json.dump(data, handle, indent=2)
    handle.write("\n")
os.replace(tmp_file, status_file)
print(json.dumps(data, indent=2))
PY
}

require_unreal_paths() {
  local editor="${UE}/Engine/Binaries/Linux/UnrealEditor"
  [[ -x "${editor}" ]] || die "UnrealEditor is not executable at ${editor}"
  [[ -f "${UPROJECT}" ]] || die "Unreal project file does not exist at ${UPROJECT}"
}

require_signalling_paths() {
  [[ -d "${PS_WEB}" ]] || die "Pixel Streaming signalling server directory does not exist at ${PS_WEB}"
  [[ -f "${PS_WEB}/dist/index.js" ]] || die "Pixel Streaming signalling server entrypoint is missing at ${PS_WEB}/dist/index.js"
  command_exists node || die "node is not available on PATH"
}

validate_launch_inputs() {
  [[ -n "${LAUNCH_MAP}" ]] || die "map path cannot be empty"
  if [[ -n "${LAUNCH_SCENARIO_MANIFEST}" && ! -f "${LAUNCH_SCENARIO_MANIFEST}" ]]; then
    die "scenario manifest does not exist at ${LAUNCH_SCENARIO_MANIFEST}"
  fi
  if [[ -n "${LAUNCH_SEMANTIC_ENVIRONMENT}" && ! -f "${LAUNCH_SEMANTIC_ENVIRONMENT}" ]]; then
    die "semantic environment does not exist at ${LAUNCH_SEMANTIC_ENVIRONMENT}"
  fi
}

ensure_peer_options_file() {
  ensure_state_dir
  if [[ "${AUTO_PEER_OPTIONS}" == "0" ]]; then
    return 0
  fi

  if [[ -z "${TURN_URLS}" && -f "${PEER_OPTIONS_FILE}" ]]; then
    return 0
  fi

  export PEER_OPTIONS_FILE TURN_URLS TURN_USERNAME TURN_CREDENTIAL STUN_URLS ICE_TRANSPORT_POLICY
  python3 - <<'PY'
import json
import os


def csv_list(name):
    return [item.strip() for item in os.environ.get(name, "").split(",") if item.strip()]


turn_urls = csv_list("TURN_URLS")
stun_urls = csv_list("STUN_URLS")
username = os.environ.get("TURN_USERNAME", "")
credential = os.environ.get("TURN_CREDENTIAL", "")
policy = os.environ.get("ICE_TRANSPORT_POLICY", "") or ("relay" if turn_urls else "all")

if policy not in {"all", "relay"}:
    raise SystemExit(f"ADAPTSIM_PS_ICE_TRANSPORT_POLICY must be 'all' or 'relay', got {policy!r}")

ice_servers = []
if turn_urls:
    if not username or not credential:
        raise SystemExit("TURN URLs are configured, but ADAPTSIM_PS_TURN_USERNAME or ADAPTSIM_PS_TURN_CREDENTIAL is missing.")
    ice_servers.append({
        "urls": turn_urls,
        "username": username,
        "credential": credential,
    })

if stun_urls and policy != "relay":
    ice_servers.append({"urls": stun_urls})

if not ice_servers:
    raise SystemExit("No ICE servers are configured for Pixel Streaming peer options.")

peer_options = {
    "iceServers": ice_servers,
    "iceTransportPolicy": policy,
}

path = os.environ["PEER_OPTIONS_FILE"]
tmp_path = f"{path}.tmp"
with open(tmp_path, "w", encoding="utf-8") as handle:
    json.dump(peer_options, handle, indent=2)
    handle.write("\n")
os.replace(tmp_path, path)
os.chmod(path, 0o600)
PY
}

terminate_pid() {
  local pid="$1"
  local label="$2"
  pid_running "${pid}" || return 0

  info "Stopping ${label} pid ${pid}"
  kill "${pid}" >/dev/null 2>&1 || true
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
    if ! pid_running "${pid}"; then
      return 0
    fi
    sleep 0.2
  done

  info "Force stopping ${label} pid ${pid}"
  kill -KILL "${pid}" >/dev/null 2>&1 || true
}

stop_by_pid_file() {
  local component="$1"
  local pid_file="$2"
  local label="$3"

  local pid
  if pid="$(read_pid_file "${pid_file}" 2>/dev/null)"; then
    if pid_running "${pid}" && pid_matches_component "${component}" "${pid}"; then
      terminate_pid "${pid}" "${label}"
    elif pid_running "${pid}"; then
      info "Skipping ${label} pid file ${pid_file}; pid ${pid} does not look like AdaptSim ${component}"
    fi
  fi

  rm -f "${pid_file}"
}

stop_by_pattern() {
  local pattern="$1"
  local label="$2"
  command_exists pgrep || return 0

  local pids
  pids="$(pgrep -f "${pattern}" 2>/dev/null || true)"
  while IFS= read -r pid; do
    [[ -n "${pid}" ]] || continue
    [[ "${pid}" == "$$" || "${pid}" == "${BASHPID}" ]] && continue
    terminate_pid "${pid}" "${label}"
  done <<< "${pids}"
}

stop_signalling() {
  ensure_state_dir
  stop_by_pid_file "signalling" "${SIGNALLING_PID_FILE}" "signalling"
  stop_by_pattern "${SIGNALLING_PATTERN}" "signalling"
}

stop_unreal() {
  ensure_state_dir
  stop_by_pid_file "unreal" "${UNREAL_PID_FILE}" "Unreal Pixel Streaming"
  stop_by_pattern "${UNREAL_PATTERN}" "Unreal Pixel Streaming"
}

adopt_existing_process_if_present() {
  local component="$1"
  local pid_file="$2"
  local pattern="$3"

  local snapshot pid pid_source ignored_pid_file_pid ignored_stale
  snapshot="$(component_snapshot "${component}" "${pid_file}" "${pattern}")"
  IFS='|' read -r pid pid_source ignored_pid_file_pid ignored_stale <<< "${snapshot}"

  if [[ -n "${pid}" ]]; then
    printf '%s\n' "${pid}" > "${pid_file}"
    info "Using existing ${component} pid ${pid} from ${pid_source}"
    return 0
  fi

  return 1
}

start_signalling_impl() {
  ensure_state_dir
  require_signalling_paths
  ensure_peer_options_file

  if adopt_existing_process_if_present "signalling" "${SIGNALLING_PID_FILE}" "${SIGNALLING_PATTERN}"; then
    return 0
  fi

  local peer_options_args=()
  if [[ -f "${PEER_OPTIONS_FILE}" ]]; then
    peer_options_args=(--peer_options_file "${PEER_OPTIONS_FILE}")
  else
    info "No peer options file found at ${PEER_OPTIONS_FILE}; starting signalling without --peer_options_file"
  fi

  local log_config_args=()
  case "${LOG_CONFIG}" in
    true|1|yes)
      log_config_args=(--log_config)
      ;;
    false|0|no)
      ;;
    auto)
      if [[ -z "${TURN_URLS}" ]]; then
        log_config_args=(--log_config)
      fi
      ;;
    *)
      die "ADAPTSIM_PS_LOG_CONFIG must be auto, true, or false; got ${LOG_CONFIG}"
      ;;
  esac

  local console_messages="${CONSOLE_MESSAGES}"
  local console_messages_args=()
  case "${console_messages}" in
    auto)
      if [[ -n "${TURN_URLS}" ]]; then
        console_messages="off"
      else
        console_messages="verbose"
      fi
      ;;
    off|false|0|no)
      console_messages="off"
      ;;
    basic|verbose|formatted)
      ;;
    *)
      die "ADAPTSIM_PS_CONSOLE_MESSAGES must be auto, off, basic, verbose, or formatted; got ${CONSOLE_MESSAGES}"
      ;;
  esac
  if [[ "${console_messages}" != "off" ]]; then
    console_messages_args=(--console_messages "${console_messages}")
  fi

  local launcher=(env "PATH=${PATH}")
  if [[ "${PLAYER_PORT}" =~ ^[0-9]+$ && "${PLAYER_PORT}" -lt 1024 && "${EUID}" -ne 0 ]]; then
    command_exists sudo || die "sudo is required to bind Pixel Streaming player port ${PLAYER_PORT}"
    launcher=(sudo -n env "PATH=${PATH}")
  fi

  info "Starting Pixel Streaming signalling server on player port ${PLAYER_PORT}"
  : > "${SIGNALLING_LOG_FILE}"
  (
    cd "${PS_WEB}"
    nohup "${launcher[@]}" node ./dist/index.js \
      --streamer_port "${STREAMER_PORT}" \
      --player_port "${PLAYER_PORT}" \
      --sfu_port "${SFU_PORT}" \
      --serve \
      --https_redirect \
      "${console_messages_args[@]}" \
      "${log_config_args[@]}" \
      --http_root www \
      --homepage player.html \
      "${peer_options_args[@]}" \
      > "${SIGNALLING_LOG_FILE}" 2>&1 &
    printf '%s\n' "$!" > "${SIGNALLING_PID_FILE}"
  )

  sleep 1
  local pid
  if ! pid="$(read_pid_file "${SIGNALLING_PID_FILE}" 2>/dev/null)" || ! pid_running "${pid}"; then
    die "signalling server failed to stay running; see ${SIGNALLING_LOG_FILE}"
  fi
}

write_last_launch() {
  ensure_state_dir
  export LAST_LAUNCH_FILE
  export LAUNCH_MAP LAUNCH_SCENARIO_MANIFEST LAUNCH_SEMANTIC_ENVIRONMENT LAUNCH_DEMO_INPUT_START LAUNCH_DEMO_AUTO_PRESS_1
  export DEMO_HOLD_SECONDS RES_X RES_Y
  export WEBRTC_MIN_PORT WEBRTC_MAX_PORT WEBRTC_MIN_BITRATE WEBRTC_MAX_BITRATE
  export DISABLE_TRANSMIT_AUDIO DISABLE_RECEIVE_AUDIO ENCODER_CODEC ENCODER_MAX_BITRATE ENCODER_TARGET_BITRATE
  export TURN_URLS STUN_URLS ICE_TRANSPORT_POLICY PEER_OPTIONS_FILE
  export STREAMER_PORT PUBLIC_PLAYER_URL LOCAL_PLAYER_URL
  export UPDATED_AT
  UPDATED_AT="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

  python3 - <<'PY'
import json
import os


def as_bool(name):
    return os.environ.get(name) == "true"


def csv_list(name):
    return [item.strip() for item in os.environ.get(name, "").split(",") if item.strip()]


data = {
    "updated_at": os.environ["UPDATED_AT"],
    "map": os.environ["LAUNCH_MAP"],
    "scenario_manifest": os.environ["LAUNCH_SCENARIO_MANIFEST"] or None,
    "semantic_environment": os.environ["LAUNCH_SEMANTIC_ENVIRONMENT"] or None,
    "demo_input_start": as_bool("LAUNCH_DEMO_INPUT_START"),
    "demo_auto_press_1": as_bool("LAUNCH_DEMO_AUTO_PRESS_1"),
    "demo_hold_seconds": os.environ["DEMO_HOLD_SECONDS"],
    "resolution": {
        "x": os.environ["RES_X"],
        "y": os.environ["RES_Y"],
    },
    "pixel_streaming": {
        "connection_url": f"ws://127.0.0.1:{os.environ['STREAMER_PORT']}",
        "webrtc_min_port": os.environ["WEBRTC_MIN_PORT"],
        "webrtc_max_port": os.environ["WEBRTC_MAX_PORT"],
        "webrtc_min_bitrate": os.environ["WEBRTC_MIN_BITRATE"],
        "webrtc_max_bitrate": os.environ["WEBRTC_MAX_BITRATE"],
        "disable_transmit_audio": as_bool("DISABLE_TRANSMIT_AUDIO"),
        "disable_receive_audio": as_bool("DISABLE_RECEIVE_AUDIO"),
        "encoder_codec": os.environ["ENCODER_CODEC"],
        "encoder_max_bitrate": os.environ["ENCODER_MAX_BITRATE"],
        "encoder_target_bitrate": os.environ["ENCODER_TARGET_BITRATE"] or None,
        "public_player_url": os.environ["PUBLIC_PLAYER_URL"],
        "local_player_url": os.environ["LOCAL_PLAYER_URL"],
        "ice_transport_policy": os.environ["ICE_TRANSPORT_POLICY"] or ("relay" if os.environ["TURN_URLS"] else "all"),
        "turn_configured": bool(os.environ["TURN_URLS"]),
        "turn_urls": csv_list("TURN_URLS"),
        "stun_urls": csv_list("STUN_URLS"),
        "peer_options_file": os.environ["PEER_OPTIONS_FILE"],
    },
}

path = os.environ["LAST_LAUNCH_FILE"]
tmp_path = f"{path}.tmp"
with open(tmp_path, "w", encoding="utf-8") as handle:
    json.dump(data, handle, indent=2)
    handle.write("\n")
os.replace(tmp_path, path)
PY
}

start_unreal_impl() {
  ensure_state_dir
  require_unreal_paths
  validate_launch_inputs

  if adopt_existing_process_if_present "unreal" "${UNREAL_PID_FILE}" "${UNREAL_PATTERN}"; then
    return 0
  fi

  local editor="${UE}/Engine/Binaries/Linux/UnrealEditor"
  local unreal_args=(
    "${UPROJECT}"
    "${LAUNCH_MAP}"
    -game
    -RenderOffscreen
    -Unattended
    -nop4
    -nosplash
    -ForceRes
    "-ResX=${RES_X}"
    "-ResY=${RES_Y}"
    -AudioMixer
    "-ExecCmds=DisableAllScreenMessages"
    "-PixelStreamingConnectionURL=ws://127.0.0.1:${STREAMER_PORT}"
    "-PixelStreamingWebRTCMinPort=${WEBRTC_MIN_PORT}"
    "-PixelStreamingWebRTCMaxPort=${WEBRTC_MAX_PORT}"
    "-PixelStreamingWebRTCMinBitrate=${WEBRTC_MIN_BITRATE}"
    "-PixelStreamingWebRTCMaxBitrate=${WEBRTC_MAX_BITRATE}"
    "-PixelStreamingWebRTCDisableTransmitAudio=${DISABLE_TRANSMIT_AUDIO}"
    "-PixelStreamingWebRTCDisableReceiveAudio=${DISABLE_RECEIVE_AUDIO}"
    "-PixelStreamingEncoderCodec=${ENCODER_CODEC}"
    "-PixelStreamingEncoderMaxBitrate=${ENCODER_MAX_BITRATE}"
  )

  if [[ -n "${ENCODER_TARGET_BITRATE}" ]]; then
    unreal_args+=("-PixelStreamingEncoderTargetBitrate=${ENCODER_TARGET_BITRATE}")
  fi

  if [[ -n "${LAUNCH_SCENARIO_MANIFEST}" ]]; then
    unreal_args+=("-AdaptSimScenarioManifest=${LAUNCH_SCENARIO_MANIFEST}")
  fi
  if [[ -n "${LAUNCH_SEMANTIC_ENVIRONMENT}" ]]; then
    unreal_args+=("-AdaptSimSemanticEnvironment=${LAUNCH_SEMANTIC_ENVIRONMENT}")
  fi
  if [[ "${LAUNCH_DEMO_INPUT_START}" == "true" ]]; then
    unreal_args+=(-AdaptSimDemoInputStart)
    unreal_args+=("-AdaptSimDemoHoldSeconds=${DEMO_HOLD_SECONDS}")
  fi
  if [[ "${LAUNCH_DEMO_AUTO_PRESS_1}" == "true" ]]; then
    unreal_args+=(-AdaptSimDemoAutoPress1)
  fi
  if [[ "${#EXTRA_UNREAL_ARGS[@]}" -gt 0 ]]; then
    unreal_args+=("${EXTRA_UNREAL_ARGS[@]}")
  fi

  info "Starting Unreal Pixel Streaming for ${LAUNCH_MAP}"
  : > "${UNREAL_LOG_FILE}"
  nohup "${editor}" "${unreal_args[@]}" > "${UNREAL_LOG_FILE}" 2>&1 &
  printf '%s\n' "$!" > "${UNREAL_PID_FILE}"

  sleep 1
  local pid
  if ! pid="$(read_pid_file "${UNREAL_PID_FILE}" 2>/dev/null)" || ! pid_running "${pid}"; then
    die "Unreal Pixel Streaming failed to stay running; see ${UNREAL_LOG_FILE}"
  fi

  write_last_launch
}

parse_launch_args() {
  LAUNCH_MAP="${ADAPTSIM_MAP_PATH:-${DEFAULT_MAP_PATH}}"
  LAUNCH_SCENARIO_MANIFEST="${ADAPTSIM_SCENARIO_MANIFEST:-${PROJECT}/${DEFAULT_SCENARIO_MANIFEST_REL}}"
  LAUNCH_SEMANTIC_ENVIRONMENT="${ADAPTSIM_SEMANTIC_ENVIRONMENT:-${PROJECT}/${DEFAULT_SEMANTIC_ENVIRONMENT_REL}}"
  LAUNCH_DEMO_INPUT_START="${ADAPTSIM_DEMO_INPUT_START:-true}"
  LAUNCH_DEMO_AUTO_PRESS_1="${ADAPTSIM_DEMO_AUTO_PRESS_1:-true}"
  DEMO_HOLD_SECONDS="${ADAPTSIM_DEMO_HOLD_SECONDS:-${DEMO_HOLD_SECONDS}}"
  EXTRA_UNREAL_ARGS=()

  while [[ "$#" -gt 0 ]]; do
    case "$1" in
      --map)
        [[ "$#" -ge 2 ]] || die "--map requires a value"
        LAUNCH_MAP="$2"
        shift 2
        ;;
      --scenario-manifest)
        [[ "$#" -ge 2 ]] || die "--scenario-manifest requires a value"
        LAUNCH_SCENARIO_MANIFEST="$2"
        shift 2
        ;;
      --semantic-environment)
        [[ "$#" -ge 2 ]] || die "--semantic-environment requires a value"
        LAUNCH_SEMANTIC_ENVIRONMENT="$2"
        shift 2
        ;;
      --no-scenario-flags)
        LAUNCH_SCENARIO_MANIFEST=""
        LAUNCH_SEMANTIC_ENVIRONMENT=""
        shift
        ;;
      --demo-input-start)
        LAUNCH_DEMO_INPUT_START="true"
        shift
        ;;
      --no-demo-input-start)
        LAUNCH_DEMO_INPUT_START="false"
        shift
        ;;
      --demo-auto-press-1)
        LAUNCH_DEMO_AUTO_PRESS_1="true"
        shift
        ;;
      --no-demo-auto-press-1)
        LAUNCH_DEMO_AUTO_PRESS_1="false"
        shift
        ;;
      --hold-seconds)
        [[ "$#" -ge 2 ]] || die "--hold-seconds requires a value"
        DEMO_HOLD_SECONDS="$2"
        shift 2
        ;;
      --extra-unreal-arg)
        [[ "$#" -ge 2 ]] || die "--extra-unreal-arg requires a value"
        EXTRA_UNREAL_ARGS+=("$2")
        shift 2
        ;;
      --help|-h)
        usage
        exit 0
        ;;
      *)
        die "unknown launch option: $1"
        ;;
    esac
  done
}

command_start() {
  parse_launch_args "$@"
  start_signalling_impl
  start_unreal_impl
  emit_status
}

command_restart() {
  parse_launch_args "$@"
  stop_unreal
  stop_signalling
  start_signalling_impl
  start_unreal_impl
  emit_status
}

command_stop() {
  local component="${1:-all}"
  case "${component}" in
    all)
      stop_unreal
      stop_signalling
      ;;
    signalling)
      stop_signalling
      ;;
    unreal)
      stop_unreal
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      die "unknown stop component: ${component}"
      ;;
  esac
  emit_status
}

main() {
  local command="${1:-status}"
  if [[ "$#" -gt 0 ]]; then
    shift
  fi

  case "${command}" in
    status)
      [[ "$#" -eq 0 ]] || die "status does not accept arguments"
      emit_status
      ;;
    start)
      command_start "$@"
      ;;
    restart)
      command_restart "$@"
      ;;
    launch-horror-corridor|restart-horror-corridor)
      command_restart "$@"
      ;;
    start-signalling)
      [[ "$#" -eq 0 ]] || die "start-signalling does not accept arguments"
      start_signalling_impl
      emit_status
      ;;
    start-unreal)
      parse_launch_args "$@"
      start_unreal_impl
      emit_status
      ;;
    stop)
      command_stop "$@"
      ;;
    help|--help|-h)
      usage
      ;;
    *)
      die "unknown command: ${command}"
      ;;
  esac
}

main "$@"
