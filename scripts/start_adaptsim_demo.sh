#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

API_SESSION="${ADAPTSIM_API_SESSION:-adaptsim-api}"
WEB_SESSION="${ADAPTSIM_WEB_SESSION:-adaptsim-web}"
LOG_DIR="${ADAPTSIM_LOG_DIR:-${ROOT_DIR}/.adaptsim/logs}"
API_LOG="${ADAPTSIM_API_LOG:-${LOG_DIR}/dev-api.log}"
WEB_LOG="${ADAPTSIM_WEB_LOG:-${LOG_DIR}/dev-web.log}"

API_HOST="${ADAPTSIM_API_HOST:-127.0.0.1}"
API_PORT="${ADAPTSIM_API_PORT:-8787}"
WEB_HOST="${ADAPTSIM_WEB_HOST:-127.0.0.1}"
WEB_PORT="${ADAPTSIM_WEB_PORT:-5173}"

ADAPTSIM_PIXEL_STREAM_URL="${ADAPTSIM_PIXEL_STREAM_URL:-http://34.139.126.187/player.html}"
ADAPTSIM_GCP_PROJECT="${ADAPTSIM_GCP_PROJECT:-gecko-dev-fde}"
ADAPTSIM_L4_INSTANCE="${ADAPTSIM_L4_INSTANCE:-linux-pixel-streaming}"
ADAPTSIM_L4_ZONE="${ADAPTSIM_L4_ZONE:-us-east1-d}"
ADAPTSIM_L4_REPO_ROOT="${ADAPTSIM_L4_REPO_ROOT:-/home/nicholas.parkes/adaptsim/repos/adaptsim-hackathon}"

GCS_BUCKET="${GCS_BUCKET:-aiscanners-hackathon2025}"
GCS_CAPTURE_PREFIX="${GCS_CAPTURE_PREFIX:-adaptsim-captures}"
GCS_SIGNING_SERVICE_ACCOUNT="${GCS_SIGNING_SERVICE_ACCOUNT:-photogrammetry-test@gecko-dev-fde.iam.gserviceaccount.com}"
GCS_SIGNING_REGION="${GCS_SIGNING_REGION:-us}"

VITE_ADAPTSIM_SCENE_ID="${VITE_ADAPTSIM_SCENE_ID:-safety_park}"
VITE_ADAPTSIM_CACHED_SCENE_ID="${VITE_ADAPTSIM_CACHED_SCENE_ID:-safety_park}"
VITE_ADAPTSIM_FAST_FORWARD_RECONSTRUCTION="${VITE_ADAPTSIM_FAST_FORWARD_RECONSTRUCTION:-1}"
VITE_ADAPTSIM_API_MODE="${VITE_ADAPTSIM_API_MODE:-live}"
VITE_ADAPTSIM_API_BASE="${VITE_ADAPTSIM_API_BASE:-http://${API_HOST}:${API_PORT}/api/v1}"

SKIP_PREFLIGHT=0
OPEN_BROWSER=0
FOLLOW_LOGS=0
COMMAND="start"

usage() {
  cat <<'EOF'
Usage:
  scripts/start_adaptsim_demo.sh [start|restart|stop|status|logs] [options]

Commands:
  start       Start local API and frontend tmux sessions. Default.
  restart     Stop existing demo tmux sessions, then start them again.
  stop        Stop local API and frontend tmux sessions.
  status      Show local sessions, ports, and configured Pixel Streaming URL.
  logs        Follow API and frontend logs.

Options:
  --no-preflight   Skip L4/Pixel Streaming preflight checks.
  --open           Open the frontend in the default browser after startup.
  --follow         Follow logs after startup.
  -h, --help       Show this help.

Useful environment overrides:
  ADAPTSIM_PIXEL_STREAM_URL=http://34.139.126.187/player.html
  ADAPTSIM_API_PORT=8787
  ADAPTSIM_WEB_PORT=5173
  VITE_ADAPTSIM_SCENE_ID=safety_park
EOF
}

log() {
  printf '[adaptsim-demo] %s\n' "$*"
}

warn() {
  printf '[adaptsim-demo] WARN: %s\n' "$*" >&2
}

die() {
  printf '[adaptsim-demo] ERROR: %s\n' "$*" >&2
  exit 1
}

shell_quote() {
  printf '%q' "$1"
}

env_pair() {
  local key="$1"
  local value="$2"
  printf '%s=%q ' "$key" "$value"
}

have() {
  command -v "$1" >/dev/null 2>&1
}

session_exists() {
  tmux has-session -t "$1" >/dev/null 2>&1
}

port_listener() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN 2>/dev/null || true
}

require_tools() {
  have tmux || die "tmux is required. Install it or start API/frontend manually."
  have npm || die "npm is required."
  have node || die "node is required."
  have curl || die "curl is required."
}

assert_port_available() {
  local port="$1"
  local label="$2"
  local session="$3"
  local listener

  if session_exists "$session"; then
    return
  fi

  listener="$(port_listener "$port")"
  if [[ -n "$listener" ]]; then
    printf '%s\n' "$listener" >&2
    die "${label} port ${port} is already in use. Stop that process or run '${0} stop' if it is an AdaptSim tmux session."
  fi
}

wait_for_url() {
  local url="$1"
  local label="$2"
  local attempts="${3:-40}"

  for _ in $(seq 1 "$attempts"); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      log "${label} is ready: ${url}"
      return
    fi
    sleep 0.5
  done

  warn "${label} did not respond yet: ${url}"
}

run_preflight() {
  if [[ "$SKIP_PREFLIGHT" == "1" ]]; then
    log "Skipping L4/Pixel Streaming preflight."
    return
  fi

  log "Checking Pixel Streaming firewall path."
  if [[ -x "${ROOT_DIR}/scripts/check_pixelstreaming_webrtc_firewall.sh" ]]; then
    "${ROOT_DIR}/scripts/check_pixelstreaming_webrtc_firewall.sh" || warn "Firewall preflight reported a problem."
  else
    warn "Firewall preflight script is missing."
  fi

  log "Checking public Pixel Streaming player: ${ADAPTSIM_PIXEL_STREAM_URL}"
  curl -fsSI --max-time 8 "$ADAPTSIM_PIXEL_STREAM_URL" >/dev/null \
    || warn "Pixel Streaming player did not return HTTP success. The API launch can still try to restart the L4 runtime."

  if ! have gcloud; then
    warn "gcloud is not installed; skipping L4 VM status check."
    return
  fi

  log "Checking L4 VM status."
  local vm_status
  vm_status="$(gcloud compute instances describe "$ADAPTSIM_L4_INSTANCE" \
    --zone="$ADAPTSIM_L4_ZONE" \
    --project="$ADAPTSIM_GCP_PROJECT" \
    --format='value(status)' 2>/dev/null || true)"
  if [[ "$vm_status" != "RUNNING" ]]; then
    warn "L4 VM ${ADAPTSIM_L4_INSTANCE} is '${vm_status:-unknown}', not RUNNING."
    return
  fi

  log "Checking remote Pixel Streaming status."
  local status_output
  if status_output="$(gcloud compute ssh "$ADAPTSIM_L4_INSTANCE" \
    --zone="$ADAPTSIM_L4_ZONE" \
    --project="$ADAPTSIM_GCP_PROJECT" \
    --tunnel-through-iap \
    --command "cd $(shell_quote "$ADAPTSIM_L4_REPO_ROOT") && scripts/pixel-streaming/adaptsim-pixel-streaming.sh status" 2>&1)"; then
    if grep -q '"ready"[[:space:]]*:[[:space:]]*true' <<<"$status_output"; then
      log "L4 Pixel Streaming reports ready."
    else
      warn "L4 Pixel Streaming did not report ready. The API launch will attempt a restart when you enter the simulation."
      printf '%s\n' "$status_output"
    fi
  else
    warn "Could not query L4 Pixel Streaming status."
    printf '%s\n' "$status_output" >&2
  fi
}

stop_sessions() {
  if session_exists "$API_SESSION"; then
    tmux kill-session -t "$API_SESSION"
    log "Stopped ${API_SESSION}."
  fi
  if session_exists "$WEB_SESSION"; then
    tmux kill-session -t "$WEB_SESSION"
    log "Stopped ${WEB_SESSION}."
  fi
}

start_api() {
  if session_exists "$API_SESSION"; then
    log "API session already running: ${API_SESSION}"
    return
  fi

  local env_vars
  env_vars="$(
    env_pair HOST "$API_HOST"
    env_pair PORT "$API_PORT"
    env_pair GCS_BUCKET "$GCS_BUCKET"
    env_pair GCS_CAPTURE_PREFIX "$GCS_CAPTURE_PREFIX"
    env_pair GCS_SIGNING_SERVICE_ACCOUNT "$GCS_SIGNING_SERVICE_ACCOUNT"
    env_pair GCS_SIGNING_REGION "$GCS_SIGNING_REGION"
    env_pair ADAPTSIM_ENABLE_WORKER_TRIGGERS "1"
    env_pair ADAPTSIM_PIXEL_STREAM_URL "$ADAPTSIM_PIXEL_STREAM_URL"
    env_pair ADAPTSIM_GCP_PROJECT "$ADAPTSIM_GCP_PROJECT"
    env_pair ADAPTSIM_L4_INSTANCE "$ADAPTSIM_L4_INSTANCE"
    env_pair ADAPTSIM_L4_ZONE "$ADAPTSIM_L4_ZONE"
    env_pair ADAPTSIM_L4_REPO_ROOT "$ADAPTSIM_L4_REPO_ROOT"
    env_pair ADAPTSIM_WORKER_TRIGGER_TIMEOUT_MS "${ADAPTSIM_WORKER_TRIGGER_TIMEOUT_MS:-120000}"
    env_pair ADAPTSIM_L4_STATUS_TIMEOUT_MS "${ADAPTSIM_L4_STATUS_TIMEOUT_MS:-60000}"
  )"

  local command
  command="mkdir -p $(shell_quote "$LOG_DIR") && env ${env_vars}node server/index.js >> $(shell_quote "$API_LOG") 2>&1"
  tmux new-session -d -s "$API_SESSION" -c "$ROOT_DIR" "$command"
  log "Started API session ${API_SESSION}; log: ${API_LOG}"
}

start_web() {
  if session_exists "$WEB_SESSION"; then
    log "Frontend session already running: ${WEB_SESSION}"
    return
  fi

  local env_vars
  env_vars="$(
    env_pair VITE_ADAPTSIM_API_BASE "$VITE_ADAPTSIM_API_BASE"
    env_pair VITE_ADAPTSIM_API_MODE "$VITE_ADAPTSIM_API_MODE"
    env_pair VITE_ADAPTSIM_SCENE_ID "$VITE_ADAPTSIM_SCENE_ID"
    env_pair VITE_ADAPTSIM_CACHED_SCENE_ID "$VITE_ADAPTSIM_CACHED_SCENE_ID"
    env_pair VITE_ADAPTSIM_FAST_FORWARD_RECONSTRUCTION "$VITE_ADAPTSIM_FAST_FORWARD_RECONSTRUCTION"
  )"

  local command
  command="mkdir -p $(shell_quote "$LOG_DIR") && env ${env_vars}npm --workspace @adaptsim/web run dev -- --host $(shell_quote "$WEB_HOST") --port $(shell_quote "$WEB_PORT") >> $(shell_quote "$WEB_LOG") 2>&1"
  tmux new-session -d -s "$WEB_SESSION" -c "$ROOT_DIR" "$command"
  log "Started frontend session ${WEB_SESSION}; log: ${WEB_LOG}"
}

start_all() {
  require_tools
  mkdir -p "$LOG_DIR"
  assert_port_available "$API_PORT" "API" "$API_SESSION"
  assert_port_available "$WEB_PORT" "Frontend" "$WEB_SESSION"
  run_preflight
  start_api
  start_web
  wait_for_url "http://${API_HOST}:${API_PORT}/api/v1/scenes/${VITE_ADAPTSIM_SCENE_ID}/status" "API"
  wait_for_url "http://${WEB_HOST}:${WEB_PORT}" "Frontend"

  cat <<EOF

AdaptSim demo stack is up.
  Frontend:  http://${WEB_HOST}:${WEB_PORT}
  API:       http://${API_HOST}:${API_PORT}
  Stream:    ${ADAPTSIM_PIXEL_STREAM_URL}
  Sessions:  ${API_SESSION}, ${WEB_SESSION}

Stop with:
  scripts/start_adaptsim_demo.sh stop

Logs:
  scripts/start_adaptsim_demo.sh logs
EOF

  if [[ "$OPEN_BROWSER" == "1" ]]; then
    open "http://${WEB_HOST}:${WEB_PORT}" >/dev/null 2>&1 || true
  fi
  if [[ "$FOLLOW_LOGS" == "1" ]]; then
    follow_logs
  fi
}

show_status() {
  require_tools
  printf 'Sessions:\n'
  tmux list-sessions 2>/dev/null | grep -E "^(${API_SESSION}|${WEB_SESSION}):" || true
  printf '\nPorts:\n'
  port_listener "$API_PORT"
  port_listener "$WEB_PORT"
  printf '\nConfigured endpoints:\n'
  printf '  Frontend: %s\n' "http://${WEB_HOST}:${WEB_PORT}"
  printf '  API:      %s\n' "http://${API_HOST}:${API_PORT}"
  printf '  Stream:   %s\n' "$ADAPTSIM_PIXEL_STREAM_URL"
}

follow_logs() {
  mkdir -p "$LOG_DIR"
  touch "$API_LOG" "$WEB_LOG"
  tail -n 120 -f "$API_LOG" "$WEB_LOG"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    start|restart|stop|status|logs)
      COMMAND="$1"
      shift
      ;;
    --no-preflight)
      SKIP_PREFLIGHT=1
      shift
      ;;
    --open)
      OPEN_BROWSER=1
      shift
      ;;
    --follow)
      FOLLOW_LOGS=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Unknown argument: $1"
      ;;
  esac
done

case "$COMMAND" in
  start)
    start_all
    ;;
  restart)
    require_tools
    stop_sessions
    start_all
    ;;
  stop)
    require_tools
    stop_sessions
    ;;
  status)
    show_status
    ;;
  logs)
    follow_logs
    ;;
esac
