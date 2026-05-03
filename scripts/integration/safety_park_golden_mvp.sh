#!/usr/bin/env bash
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${REPO_ROOT}"

CAPTURE_ID="${ADAPTSIM_CAPTURE_ID:-safety_park}"
SCENARIO_ID="${ADAPTSIM_SCENARIO_ID:-safety_park_mvp_001}"
GCP_PROJECT="${ADAPTSIM_GCP_PROJECT:-gecko-dev-fde}"
GCS_ROOT="${ADAPTSIM_GCS_ROOT:-gs://aiscanners-hackathon2025/adaptsim-captures}"
A100_INSTANCE="${ADAPTSIM_A100_INSTANCE:-a100-instance-02}"
A100_ZONE="${ADAPTSIM_A100_ZONE:-us-east1-b}"
L4_INSTANCE="${ADAPTSIM_L4_INSTANCE:-linux-pixel-streaming}"
L4_ZONE="${ADAPTSIM_L4_ZONE:-us-east1-d}"
API_HOST="${ADAPTSIM_API_HOST:-127.0.0.1}"
API_PORT="${ADAPTSIM_API_PORT:-18787}"
API_BASE_URL="http://${API_HOST}:${API_PORT}"
STREAM_READY_TIMEOUT_SECONDS="${ADAPTSIM_STREAM_READY_TIMEOUT_SECONDS:-240}"
STREAM_POLL_SECONDS="${ADAPTSIM_STREAM_POLL_SECONDS:-10}"

RUN_ID="safety_park_golden_$(date -u '+%Y%m%dT%H%M%SZ')"
CAPTURE_PREFIX="${GCS_ROOT%/}/captures/${CAPTURE_ID}/"
SCENARIO_GCS_URI="${CAPTURE_PREFIX}scenario_manifests/${SCENARIO_ID}.json"
REMOTE_RUN_ROOT="/home/nicholas.parkes/adaptsim/integration-runs/${RUN_ID}"
REMOTE_REPO="${REMOTE_RUN_ROOT}/repo"
L4_CAPTURE_ROOT="/home/nicholas.parkes/adaptsim/data/captures/${CAPTURE_ID}"
A100_CAPTURE_ROOT="/home/nicholas.parkes/adaptsim/data/captures/${CAPTURE_ID}"
L4_SCENARIO_PATH="${L4_CAPTURE_ROOT}/scenario_manifests/${SCENARIO_ID}.json"
L4_SEMANTIC_ENVIRONMENT_PATH="${L4_CAPTURE_ROOT}/unreal/semantic_environment.json"
L4_PIXEL_SCRIPT="${REMOTE_REPO}/scripts/pixel-streaming/adaptsim-pixel-streaming.sh"
A100_GOLDEN_DATASET_DIR="${ADAPTSIM_A100_GOLDEN_DATASET_DIR:-/home/nicholas.parkes/adaptsim/fvdb_safety_park_runs/fvdb_safety_park_20260502_060531/data/safety_park}"
A100_DLNR_TRUNCATION_MARGIN_M="${ADAPTSIM_A100_DLNR_TRUNCATION_MARGIN_M:-0.5}"

LOCAL_LOG_DIR="${ADAPTSIM_LOCAL_LOG_DIR:-${REPO_ROOT}/.adaptsim/integration-logs/${RUN_ID}}"
REPORT_DIR="${ADAPTSIM_REPORT_DIR:-${REPO_ROOT}/docs/integration_logs}"
REPORT_PATH="${REPORT_DIR}/${RUN_ID}.md"
COMMAND_LOG="${LOCAL_LOG_DIR}/commands.log"
RESULTS_LOG="${LOCAL_LOG_DIR}/results.tsv"
ARTIFACT_DIR="${LOCAL_LOG_DIR}/artifacts"
SERVER_LOG="${LOCAL_LOG_DIR}/api-server.log"
BUNDLE_PATH="${LOCAL_LOG_DIR}/repo-bundle.tgz"
BUNDLE_GCS_URI="${CAPTURE_PREFIX}logs/integration/${RUN_ID}/repo-bundle.tgz"

SERVER_PID=""
OVERALL_STATUS="FAIL"
RUN_API_ID=""
STREAM_STATUS_JSON="${ARTIFACT_DIR}/stream-status.json"

mkdir -p "${LOCAL_LOG_DIR}" "${ARTIFACT_DIR}" "${REPORT_DIR}"
: > "${COMMAND_LOG}"
: > "${RESULTS_LOG}"

slugify() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9._-' '-' | sed 's/^-*//; s/-*$//; s/--*/-/g'
}

record_command() {
  local label="$1"
  shift
  {
    printf '\n[%s]\n' "${label}"
    printf '$'
    printf ' %q' "$@"
    printf '\n'
  } >> "${COMMAND_LOG}"
}

record_shell_command() {
  local label="$1"
  local command="$2"
  {
    printf '\n[%s]\n' "${label}"
    printf '$ %s\n' "${command}"
  } >> "${COMMAND_LOG}"
}

record_result() {
  local status="$1"
  local label="$2"
  local log_path="${3:-}"
  printf '%s\t%s\t%s\n' "${status}" "${label}" "${log_path}" >> "${RESULTS_LOG}"
}

fail() {
  local message="$1"
  printf 'FAIL: %s\n' "${message}" >&2
  record_result "FAIL" "${message}" ""
  exit 1
}

run_cmd() {
  local label="$1"
  shift
  local log_path="${LOCAL_LOG_DIR}/$(slugify "${label}").log"
  local exit_code=0
  printf '==> %s\n' "${label}"
  record_command "${label}" "$@"
  if "$@" > "${log_path}" 2>&1; then
    record_result "PASS" "${label}" "${log_path}"
    return 0
  else
    exit_code=$?
    record_result "FAIL" "${label}" "${log_path}"
    printf 'Command failed for step "%s" with exit %s. Log: %s\n' "${label}" "${exit_code}" "${log_path}" >&2
    tail -n 80 "${log_path}" >&2 || true
    exit "${exit_code}"
  fi
}

run_shell() {
  local label="$1"
  local command="$2"
  local log_path="${LOCAL_LOG_DIR}/$(slugify "${label}").log"
  local exit_code=0
  printf '==> %s\n' "${label}"
  record_shell_command "${label}" "${command}"
  if bash -lc "${command}" > "${log_path}" 2>&1; then
    record_result "PASS" "${label}" "${log_path}"
    return 0
  else
    exit_code=$?
    record_result "FAIL" "${label}" "${log_path}"
    printf 'Command failed for step "%s" with exit %s. Log: %s\n' "${label}" "${exit_code}" "${log_path}" >&2
    tail -n 80 "${log_path}" >&2 || true
    exit "${exit_code}"
  fi
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command not found on PATH: $1"
}

remote_ssh() {
  local label="$1"
  local zone="$2"
  local instance="$3"
  local remote_script="$4"
  run_cmd "${label}" \
    gcloud --quiet compute ssh \
      --zone "${zone}" \
      "${instance}" \
      --project "${GCP_PROJECT}" \
      --tunnel-through-iap \
      --command "${remote_script}"
}

remote_scp_to() {
  local label="$1"
  local zone="$2"
  local instance="$3"
  local source="$4"
  local destination="$5"
  run_cmd "${label}" \
    gcloud --quiet compute scp \
      --zone "${zone}" \
      --project "${GCP_PROJECT}" \
      --tunnel-through-iap \
      "${source}" \
      "${instance}:${destination}"
}

write_report() {
  local completed_at
  completed_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  {
    printf '# Safety Park Golden MVP Verification\n\n'
    printf -- '- Result: `%s`\n' "${OVERALL_STATUS}"
    printf -- '- Completed at: `%s`\n' "${completed_at}"
    printf -- '- Capture id: `%s`\n' "${CAPTURE_ID}"
    printf -- '- Scenario id: `%s`\n' "${SCENARIO_ID}"
    printf -- '- API run id: `%s`\n' "${RUN_API_ID:-not-created}"
    printf -- '- Local log dir: `%s`\n\n' "${LOCAL_LOG_DIR}"

    printf '## GCS Paths\n\n'
    printf -- '- Capture prefix: `%s`\n' "${CAPTURE_PREFIX}"
    printf -- '- Metadata: `%sraw/metadata.json`\n' "${CAPTURE_PREFIX}"
    printf -- '- Status: `%sstatus.json`\n' "${CAPTURE_PREFIX}"
    printf -- '- Scenario manifest: `%s`\n' "${SCENARIO_GCS_URI}"
    printf -- '- Scene mesh GLB: `%sunreal-import/scene_mesh.glb`\n' "${CAPTURE_PREFIX}"
    printf -- '- Reconstruction manifest: `%sunreal-import/reconstruction_manifest.json`\n' "${CAPTURE_PREFIX}"
    printf -- '- Import report: `%sunreal/import_report.json`\n' "${CAPTURE_PREFIX}"
    printf -- '- Semantic environment: `%sunreal/semantic_environment.json`\n' "${CAPTURE_PREFIX}"
    printf -- '- A100 logs prefix: `%slogs/`\n' "${CAPTURE_PREFIX}"
    printf -- '- Verifier bundle: `%s`\n' "${BUNDLE_GCS_URI}"
    printf -- '- L4 import log: `%sunreal/logs/import.log`\n\n' "${CAPTURE_PREFIX}"

    printf '## VM Paths\n\n'
    printf -- '- A100 staged repo: `%s` on `%s/%s`\n' "${REMOTE_REPO}" "${GCP_PROJECT}" "${A100_INSTANCE}"
    printf -- '- A100 golden dataset: `%s`\n' "${A100_GOLDEN_DATASET_DIR}"
    printf -- '- A100 DLNR truncation margin m: `%s`\n' "${A100_DLNR_TRUNCATION_MARGIN_M}"
    printf -- '- L4 staged repo: `%s` on `%s/%s`\n' "${REMOTE_REPO}" "${GCP_PROJECT}" "${L4_INSTANCE}"
    printf -- '- Per-run Python env: `%s/venv`\n' "${REMOTE_RUN_ROOT}"
    printf -- '- A100 capture root: `%s`\n' "${A100_CAPTURE_ROOT}"
    printf -- '- L4 capture root: `%s`\n' "${L4_CAPTURE_ROOT}"
    printf -- '- L4 scenario manifest: `%s`\n' "${L4_SCENARIO_PATH}"
    printf -- '- L4 semantic environment: `%s`\n' "${L4_SEMANTIC_ENVIRONMENT_PATH}"
    printf -- '- A100 worker log: `/home/nicholas.parkes/adaptsim/data/captures/%s/logs/a100-reconstruction.log`\n' "${CAPTURE_ID}"
    printf -- '- A100 FVDB log: `/home/nicholas.parkes/adaptsim/data/captures/%s/logs/fvdb_frgs.log`\n' "${CAPTURE_ID}"
    printf -- '- A100 mesh postprocess log: `/home/nicholas.parkes/adaptsim/data/captures/%s/logs/mesh_postprocess.log`\n' "${CAPTURE_ID}"
    printf -- '- L4 import log: `/home/nicholas.parkes/adaptsim/data/captures/%s/unreal/logs/import.log`\n' "${CAPTURE_ID}"
    printf -- '- Pixel Streaming signalling log: `/home/nicholas.parkes/adaptsim-pixelstreaming/wilbur.log`\n'
    printf -- '- Pixel Streaming Unreal log: `/home/nicholas.parkes/adaptsim-pixelstreaming/unreal-pixelstreaming.log`\n\n'

    printf '## Step Results\n\n'
    printf '| Result | Step | Log |\n'
    printf '| --- | --- | --- |\n'
    if [[ -s "${RESULTS_LOG}" ]]; then
      while IFS=$'\t' read -r status label log_path; do
        printf '| `%s` | %s | `%s` |\n' "${status}" "${label}" "${log_path}"
      done < "${RESULTS_LOG}"
    fi
    printf '\n## Exact Commands\n\n'
    printf '```bash\n'
    cat "${COMMAND_LOG}"
    printf '```\n'
  } > "${REPORT_PATH}"
}

cleanup() {
  local exit_code=$?
  if [[ -n "${SERVER_PID}" ]]; then
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
    wait "${SERVER_PID}" >/dev/null 2>&1 || true
  fi
  if [[ "${exit_code}" -eq 0 ]]; then
    OVERALL_STATUS="PASS"
  fi
  write_report
  printf 'Verification report: %s\n' "${REPORT_PATH}"
  exit "${exit_code}"
}
trap cleanup EXIT

require_command gcloud
require_command python3
require_command node
require_command curl
require_command tar

[[ "${CAPTURE_ID}" == "safety_park" ]] || fail "This golden verifier is only defined for capture_id safety_park."
[[ -f "contracts/examples/capture_metadata/safety_park_golden.json" ]] || fail "Missing safety_park metadata fixture."
[[ -f "contracts/examples/capture_status/safety_park_queued.json" ]] || fail "Missing safety_park queued status fixture."
[[ -f "contracts/examples/scenario_manifests/${SCENARIO_ID}.json" ]] || fail "Missing scenario manifest fixture ${SCENARIO_ID}."

run_cmd "validate local contracts" python3 contracts/validate_contracts.py contracts/examples

run_cmd "bundle verifier code for VMs" env COPYFILE_DISABLE=1 tar --no-xattrs -czf "${BUNDLE_PATH}" \
  contracts \
  workers \
  unreal \
  scripts/pixel-streaming

run_cmd "upload verifier bundle to GCS" \
  gcloud --quiet --project "${GCP_PROJECT}" storage cp \
    "${BUNDLE_PATH}" \
    "${BUNDLE_GCS_URI}"

STAGE_REMOTE_SCRIPT=$(cat <<EOF
set -euo pipefail
rm -rf '${REMOTE_REPO}'
mkdir -p '${REMOTE_REPO}'
gcloud --quiet storage cp '${BUNDLE_GCS_URI}' '/tmp/${RUN_ID}-repo.tgz'
tar -xzf '/tmp/${RUN_ID}-repo.tgz' -C '${REMOTE_REPO}'
chmod +x '${REMOTE_REPO}/workers/a100-reconstruction/adaptsim-reconstruct'
chmod +x '${REMOTE_REPO}/workers/l4-unreal-import/adaptsim-import-capture'
chmod +x '${REMOTE_REPO}/workers/l4-unreal-import/adaptsim-convert-mesh'
chmod +x '${REMOTE_REPO}/scripts/pixel-streaming/adaptsim-pixel-streaming.sh'
if python3 -m venv '${REMOTE_RUN_ROOT}/venv' >/tmp/${RUN_ID}-venv.log 2>&1; then
  '${REMOTE_RUN_ROOT}/venv/bin/python' -m pip install --upgrade pip >>/tmp/${RUN_ID}-venv.log 2>&1
  '${REMOTE_RUN_ROOT}/venv/bin/python' -m pip install -r '${REMOTE_REPO}/contracts/requirements.txt' >>/tmp/${RUN_ID}-venv.log 2>&1
else
  rm -rf '${REMOTE_RUN_ROOT}/venv'
  python3 -m pip install --user --break-system-packages -r '${REMOTE_REPO}/contracts/requirements.txt'
fi
EOF
)
remote_ssh "stage verifier repo on A100" "${A100_ZONE}" "${A100_INSTANCE}" "${STAGE_REMOTE_SCRIPT}"
remote_ssh "stage verifier repo on L4" "${L4_ZONE}" "${L4_INSTANCE}" "${STAGE_REMOTE_SCRIPT}"

run_cmd "seed safety_park metadata to GCS" \
  gcloud --quiet --project "${GCP_PROJECT}" storage cp \
    "contracts/examples/capture_metadata/safety_park_golden.json" \
    "${CAPTURE_PREFIX}raw/metadata.json"

run_cmd "seed safety_park queued status to GCS" \
  gcloud --quiet --project "${GCP_PROJECT}" storage cp \
    "contracts/examples/capture_status/safety_park_queued.json" \
    "${CAPTURE_PREFIX}status.json"

run_cmd "upload safety_park scenario manifest to GCS" \
  gcloud --quiet --project "${GCP_PROJECT}" storage cp \
    "contracts/examples/scenario_manifests/${SCENARIO_ID}.json" \
    "${SCENARIO_GCS_URI}"

RECONSTRUCT_REMOTE_SCRIPT=$(cat <<EOF
set -euo pipefail
cd '${REMOTE_REPO}'
export PATH='${REMOTE_RUN_ROOT}/venv/bin':"\$PATH"
export PYTHONPATH='${REMOTE_REPO}':"\${PYTHONPATH:-}"
export ADAPTSIM_MESH_CONVERTER='${REMOTE_REPO}/workers/l4-unreal-import/adaptsim-convert-mesh'
mkdir -p '${REMOTE_RUN_ROOT}/prior-a100-capture'
for name in reconstruction unreal-import logs; do
  if [ -e '${A100_CAPTURE_ROOT}'/"\${name}" ]; then
    mv '${A100_CAPTURE_ROOT}'/"\${name}" '${REMOTE_RUN_ROOT}/prior-a100-capture/'"\${name}-\$(date -u +%Y%m%dT%H%M%SZ)"
  fi
done
workers/a100-reconstruction/adaptsim-reconstruct \\
  --capture-id '${CAPTURE_ID}' \\
  --gcs-root '${GCS_ROOT}' \\
  --dataset-mode golden \\
  --golden-dataset-dir '${A100_GOLDEN_DATASET_DIR}' \\
  --dlnr-truncation-margin-m '${A100_DLNR_TRUNCATION_MARGIN_M}'
EOF
)
remote_ssh "run A100 safety_park reconstruction" "${A100_ZONE}" "${A100_INSTANCE}" "${RECONSTRUCT_REMOTE_SCRIPT}"

run_cmd "download scene_mesh.glb from GCS" \
  gcloud --quiet --project "${GCP_PROJECT}" storage cp \
    "${CAPTURE_PREFIX}unreal-import/scene_mesh.glb" \
    "${ARTIFACT_DIR}/scene_mesh.glb"

run_cmd "download reconstruction_manifest from GCS" \
  gcloud --quiet --project "${GCP_PROJECT}" storage cp \
    "${CAPTURE_PREFIX}unreal-import/reconstruction_manifest.json" \
    "${ARTIFACT_DIR}/reconstruction_manifest.json"

run_cmd "verify reconstruction artifacts" python3 -c '
import json
import pathlib
import sys

glb_path = pathlib.Path(sys.argv[1])
manifest_path = pathlib.Path(sys.argv[2])
capture_id = sys.argv[3]
if glb_path.stat().st_size <= 0:
    raise SystemExit("scene_mesh.glb is empty")
if glb_path.read_bytes()[:4] != b"glTF":
    raise SystemExit("scene_mesh.glb does not have GLB magic")
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
if manifest.get("contract_type") != "reconstruction_manifest":
    raise SystemExit("wrong reconstruction manifest contract_type")
if manifest.get("capture_id") != capture_id:
    raise SystemExit("reconstruction manifest capture_id mismatch")
artifact_types = {item.get("artifact_type") for item in manifest.get("artifacts", [])}
required = {"unreal_mesh_glb", "reconstruction_manifest"}
missing = sorted(required - artifact_types)
if missing:
    raise SystemExit(f"reconstruction manifest missing artifacts: {missing}")
' "${ARTIFACT_DIR}/scene_mesh.glb" "${ARTIFACT_DIR}/reconstruction_manifest.json" "${CAPTURE_ID}"

IMPORT_REMOTE_SCRIPT=$(cat <<EOF
set -euo pipefail
cd '${REMOTE_REPO}'
export PATH='${REMOTE_RUN_ROOT}/venv/bin':"\$PATH"
export PYTHONPATH='${REMOTE_REPO}':"\${PYTHONPATH:-}"
workers/l4-unreal-import/adaptsim-import-capture \\
  --capture-id '${CAPTURE_ID}' \\
  --gcs-root '${GCS_ROOT}' \\
  --final-phase ready
EOF
)
remote_ssh "run L4 Unreal import" "${L4_ZONE}" "${L4_INSTANCE}" "${IMPORT_REMOTE_SCRIPT}"

run_cmd "download import_report from GCS" \
  gcloud --quiet --project "${GCP_PROJECT}" storage cp \
    "${CAPTURE_PREFIX}unreal/import_report.json" \
    "${ARTIFACT_DIR}/import_report.json"

run_cmd "download semantic_environment from GCS" \
  gcloud --quiet --project "${GCP_PROJECT}" storage cp \
    "${CAPTURE_PREFIX}unreal/semantic_environment.json" \
    "${ARTIFACT_DIR}/semantic_environment.json"

run_cmd "verify Unreal import artifacts" python3 -c '
import json
import pathlib
import sys

report = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
semantic = json.loads(pathlib.Path(sys.argv[2]).read_text(encoding="utf-8"))
capture_id = sys.argv[3]
if report.get("contract_type") != "unreal_import_report":
    raise SystemExit("wrong import report contract_type")
if report.get("capture_id") != capture_id:
    raise SystemExit("import report capture_id mismatch")
if report.get("status") != "ready":
    raise SystemExit("import report status is {!r}, not ready".format(report.get("status")))
if not report.get("level_path"):
    raise SystemExit("import report missing level_path")
if semantic.get("contract_type") != "semantic_environment":
    raise SystemExit("wrong semantic environment contract_type")
if semantic.get("environment_id") != capture_id:
    raise SystemExit("semantic environment_id mismatch")
if len(semantic.get("anchors") or []) < 4:
    raise SystemExit("semantic environment has too few anchors")
' "${ARTIFACT_DIR}/import_report.json" "${ARTIFACT_DIR}/semantic_environment.json" "${CAPTURE_ID}"

SYNC_L4_CAPTURE_SCRIPT=$(cat <<EOF
set -euo pipefail
mkdir -p '${L4_CAPTURE_ROOT}/scenario_manifests'
gcloud --quiet storage cp '${SCENARIO_GCS_URI}' '${L4_SCENARIO_PATH}'
test -s '${L4_SCENARIO_PATH}'
test -s '${L4_SEMANTIC_ENVIRONMENT_PATH}'
EOF
)
remote_ssh "sync scenario manifest to L4 capture root" "${L4_ZONE}" "${L4_INSTANCE}" "${SYNC_L4_CAPTURE_SCRIPT}"

printf '==> start local AdaptSim API for endpoint verification\n'
record_shell_command "start local AdaptSim API" "PORT=${API_PORT} HOST=${API_HOST} ADAPTSIM_ENABLE_WORKER_TRIGGERS=1 ADAPTSIM_WORKER_TRIGGER_TIMEOUT_MS=120000 ADAPTSIM_L4_STATUS_TIMEOUT_MS=60000 ADAPTSIM_GCP_PROJECT=${GCP_PROJECT} ADAPTSIM_L4_REPO_ROOT=${REMOTE_REPO} node server/index.js > ${SERVER_LOG} 2>&1 &"
(
  export PORT="${API_PORT}"
  export HOST="${API_HOST}"
  export ADAPTSIM_ENABLE_WORKER_TRIGGERS=1
  export ADAPTSIM_WORKER_TRIGGER_TIMEOUT_MS=120000
  export ADAPTSIM_L4_STATUS_TIMEOUT_MS=60000
  export ADAPTSIM_GCP_PROJECT="${GCP_PROJECT}"
  export ADAPTSIM_L4_REPO_ROOT="${REMOTE_REPO}"
  export ADAPTSIM_L4_INSTANCE="${L4_INSTANCE}"
  export ADAPTSIM_L4_ZONE="${L4_ZONE}"
  export ADAPTSIM_PIXEL_STREAM_URL="http://34.139.126.187/player.html"
  node server/index.js
) > "${SERVER_LOG}" 2>&1 &
SERVER_PID=$!

for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS "${API_BASE_URL}/api/v1/health" > "${ARTIFACT_DIR}/api-health.json" 2>> "${SERVER_LOG}"; then
    record_result "PASS" "start local AdaptSim API" "${SERVER_LOG}"
    break
  fi
  sleep 1
done
[[ -s "${ARTIFACT_DIR}/api-health.json" ]] || fail "AdaptSim API did not become healthy on ${API_BASE_URL}; see ${SERVER_LOG}"

run_cmd "verify scenario manifest endpoint" \
  curl -fsS "${API_BASE_URL}/api/v1/scenarios/${SCENARIO_ID}/manifest" \
    -o "${ARTIFACT_DIR}/scenario_manifest_api.json"

run_cmd "verify scenario manifest payload" python3 -c '
import json
import pathlib
import sys

payload = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
scenario_id = sys.argv[2]
capture_id = sys.argv[3]
if payload.get("contract_type") != "scenario_manifest":
    raise SystemExit("wrong scenario manifest contract_type")
if payload.get("scenario_id") != scenario_id:
    raise SystemExit("scenario_id mismatch")
if payload.get("environment_id") != capture_id:
    raise SystemExit("environment_id mismatch")
if not payload.get("events"):
    raise SystemExit("scenario manifest has no events")
' "${ARTIFACT_DIR}/scenario_manifest_api.json" "${SCENARIO_ID}" "${CAPTURE_ID}"

LAUNCH_BODY="${ARTIFACT_DIR}/launch-body.json"
python3 -c '
import json
import sys

path, scenario_gcs, semantic_gcs = sys.argv[1:4]
body = {
    "scenario_manifest_path": scenario_gcs,
    "semantic_environment_path": semantic_gcs,
}
with open(path, "w", encoding="utf-8") as handle:
    json.dump(body, handle, indent=2)
    handle.write("\n")
' "${LAUNCH_BODY}" "${SCENARIO_GCS_URI}" "${CAPTURE_PREFIX}unreal/semantic_environment.json"

run_cmd "launch Pixel Streaming through API" \
  curl -fsS -X POST \
    -H "Content-Type: application/json" \
    --data-binary "@${LAUNCH_BODY}" \
    "${API_BASE_URL}/api/v1/scenes/${CAPTURE_ID}/scenarios/${SCENARIO_ID}/launch" \
    -o "${ARTIFACT_DIR}/launch-response.json"

RUN_API_ID="$(python3 -c 'import json, pathlib, sys; print(json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))["run_id"])' "${ARTIFACT_DIR}/launch-response.json")"
[[ -n "${RUN_API_ID}" ]] || fail "Launch response did not include run_id."

printf '==> poll stream status endpoint for %s\n' "${RUN_API_ID}"
record_shell_command "poll stream status endpoint" "curl -fsS ${API_BASE_URL}/api/v1/runs/${RUN_API_ID}/stream -o ${STREAM_STATUS_JSON}"
deadline=$(( $(date +%s) + STREAM_READY_TIMEOUT_SECONDS ))
stream_ready="false"
while [[ "$(date +%s)" -le "${deadline}" ]]; do
  if curl -fsS "${API_BASE_URL}/api/v1/runs/${RUN_API_ID}/stream" -o "${STREAM_STATUS_JSON}" 2>> "${SERVER_LOG}"; then
    stream_ready="$(python3 -c 'import json, pathlib, sys; print(str(bool(json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")).get("stream", {}).get("embed_url"))).lower())' "${STREAM_STATUS_JSON}")"
    status_text="$(python3 -c 'import json, pathlib, sys; data=json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")); print(data.get("status") or data.get("stream", {}).get("status") or "")' "${STREAM_STATUS_JSON}")"
    printf '    stream status: %s ready=%s\n' "${status_text}" "${stream_ready}"
    if [[ "${stream_ready}" == "true" ]]; then
      break
    fi
  fi
  sleep "${STREAM_POLL_SECONDS}"
done
if [[ "${stream_ready}" != "true" ]]; then
  record_result "FAIL" "verify stream status endpoint" "${STREAM_STATUS_JSON}"
  fail "Stream endpoint did not report ready within ${STREAM_READY_TIMEOUT_SECONDS}s."
fi
record_result "PASS" "verify stream status endpoint" "${STREAM_STATUS_JSON}"

run_cmd "verify telemetry endpoint" \
  curl -fsS "${API_BASE_URL}/api/v1/runs/${RUN_API_ID}/telemetry?tail=5" \
    -o "${ARTIFACT_DIR}/telemetry.json"

run_cmd "verify telemetry payload" python3 -c '
import json
import pathlib
import sys

payload = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
run_id = sys.argv[2]
scenario_id = sys.argv[3]
if payload.get("contract_type") != "telemetry_log":
    raise SystemExit("wrong telemetry contract_type")
if payload.get("run_id") != run_id:
    raise SystemExit("telemetry run_id mismatch")
if payload.get("scenario_id") != scenario_id:
    raise SystemExit("telemetry scenario_id mismatch")
if not payload.get("events"):
    raise SystemExit("telemetry has no events")
' "${ARTIFACT_DIR}/telemetry.json" "${RUN_API_ID}" "${SCENARIO_ID}"

run_cmd "verify AAR endpoint" \
  curl -fsS "${API_BASE_URL}/api/v1/runs/${RUN_API_ID}/aar" \
    -o "${ARTIFACT_DIR}/aar.json"

run_cmd "verify AAR payload" python3 -c '
import json
import pathlib
import sys

payload = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
run_id = sys.argv[2]
scenario_id = sys.argv[3]
if payload.get("run_id") != run_id:
    raise SystemExit("AAR run_id mismatch")
if payload.get("scenario_id") != scenario_id:
    raise SystemExit("AAR scenario_id mismatch")
if payload.get("content_type") != "text/markdown":
    raise SystemExit("AAR content_type mismatch")
if "After Action Review" not in payload.get("markdown", ""):
    raise SystemExit("AAR markdown missing expected title")
' "${ARTIFACT_DIR}/aar.json" "${RUN_API_ID}" "${SCENARIO_ID}"

OVERALL_STATUS="PASS"
printf 'PASS: safety_park golden MVP verification completed.\n'
