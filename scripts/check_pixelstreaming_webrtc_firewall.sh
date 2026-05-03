#!/usr/bin/env bash
set -euo pipefail

PERMANENT_RULE="${ADAPTSIM_WEBRTC_FIREWALL_RULE:-adaptsim-pixelstreaming-webrtc}"
WORKAROUND_RULE="${ADAPTSIM_WEBRTC_WORKAROUND_RULE:-pixel-streaming-hc}"
HOST_PROJECT="${ADAPTSIM_WEBRTC_FIREWALL_PROJECT:-gecko-enterprise-dev-host}"
NETWORK="${ADAPTSIM_WEBRTC_NETWORK:-dev-network}"
TARGET_TAG="${ADAPTSIM_WEBRTC_TARGET_TAG:-stun-turn-server}"
PERMANENT_PORT_RANGE="${ADAPTSIM_WEBRTC_PORT_RANGE:-49152-49200}"
WORKAROUND_PORTS="${ADAPTSIM_WEBRTC_WORKAROUND_PORTS:-19302,19303}"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

echo "Checking Pixel Streaming WebRTC firewall paths:"
echo "  project:          ${HOST_PROJECT}"
echo "  network:          ${NETWORK}"
echo "  target tag:       ${TARGET_TAG}"
echo "  permanent rule:   ${PERMANENT_RULE} udp/tcp ${PERMANENT_PORT_RANGE}"
echo "  workaround rule:  ${WORKAROUND_RULE} udp ${WORKAROUND_PORTS}"
echo

describe_rule() {
  local rule_name="$1"
  local output_path="$2"
  local error_path="$3"
  gcloud compute firewall-rules describe "${rule_name}" \
    --project "${HOST_PROJECT}" \
    --format=json > "${output_path}" 2> "${error_path}"
}

validate_rule() {
  local json_path="$1"
  local target_tag="$2"
  local network="$3"
  local direction="$4"
  local required_csv="$5"

  python3 - "${json_path}" "${target_tag}" "${network}" "${direction}" "${required_csv}" <<'PY'
import json
import sys

path, target_tag, network_name, expected_direction, required_csv = sys.argv[1:]
with open(path, "r", encoding="utf-8") as handle:
    rule = json.load(handle)

allowed = rule.get("allowed", [])
target_tags = set(rule.get("targetTags", []))
disabled = bool(rule.get("disabled", False))
direction = rule.get("direction")
network = rule.get("network", "").rstrip("/").split("/")[-1]

def port_entry_covers(entry_ports, required_port):
    for entry in entry_ports:
        if "-" in entry:
            start, end = entry.split("-", 1)
            if int(start) <= required_port <= int(end):
                return True
        elif int(entry) == required_port:
            return True
    return False

def requirement_met(protocol, required_ports):
    for entry in allowed:
        if entry.get("IPProtocol") != protocol:
            continue
        entry_ports = entry.get("ports", [])
        if not required_ports:
            return True
        if all(port_entry_covers(entry_ports, port) for port in required_ports):
            return True
    return False

def expand_ports(port_expr):
    ports = []
    for raw in port_expr.split("+"):
        if "-" in raw:
            start, end = raw.split("-", 1)
            ports.extend(range(int(start), int(end) + 1))
        else:
            ports.append(int(raw))
    return ports

problems = []
if disabled:
    problems.append("rule is disabled")
if direction != expected_direction:
    problems.append(f"direction is {direction!r}, expected {expected_direction}")
if network != network_name:
    problems.append(f"network is {network!r}, expected {network_name!r}")
if target_tag not in target_tags:
    problems.append(f"missing target tag {target_tag!r}")

for requirement in required_csv.split(","):
    protocol, port_expr = requirement.split(":", 1)
    required_ports = expand_ports(port_expr)
    if not requirement_met(protocol, required_ports):
        problems.append(f"missing {protocol}:{port_expr}")

if problems:
    for problem in problems:
        print(f"  - {problem}")
    sys.exit(1)
PY
}

print_permanent_command() {
  cat <<EOF
gcloud compute firewall-rules create ${PERMANENT_RULE} \\
  --project ${HOST_PROJECT} \\
  --network ${NETWORK} \\
  --direction INGRESS \\
  --priority 1000 \\
  --action ALLOW \\
  --rules udp:${PERMANENT_PORT_RANGE},tcp:${PERMANENT_PORT_RANGE} \\
  --source-ranges 0.0.0.0/0 \\
  --target-tags ${TARGET_TAG}
EOF
}

permanent_json="${tmp_dir}/permanent.json"
permanent_err="${tmp_dir}/permanent.err"
if describe_rule "${PERMANENT_RULE}" "${permanent_json}" "${permanent_err}"; then
  if validate_rule "${permanent_json}" "${TARGET_TAG}" "${NETWORK}" "INGRESS" "udp:${PERMANENT_PORT_RANGE},tcp:${PERMANENT_PORT_RANGE}"; then
    echo "OK_PERMANENT: ${PERMANENT_RULE} is present for udp/tcp ${PERMANENT_PORT_RANGE}."
    echo "Use Unreal launch flags:"
    echo "  -PixelStreamingWebRTCMinPort=${PERMANENT_PORT_RANGE%-*}"
    echo "  -PixelStreamingWebRTCMaxPort=${PERMANENT_PORT_RANGE#*-}"
    exit 0
  fi

  echo "INCOMPLETE_PERMANENT: ${PERMANENT_RULE} exists but is not demo-ready."
  validate_rule "${permanent_json}" "${TARGET_TAG}" "${NETWORK}" "INGRESS" "udp:${PERMANENT_PORT_RANGE},tcp:${PERMANENT_PORT_RANGE}" || true
  echo
else
  echo "MISSING_PERMANENT: ${PERMANENT_RULE}"
  sed 's/^/  /' "${permanent_err}" || true
  echo
fi

workaround_json="${tmp_dir}/workaround.json"
workaround_err="${tmp_dir}/workaround.err"
if describe_rule "${WORKAROUND_RULE}" "${workaround_json}" "${workaround_err}"; then
  workaround_required="udp:${WORKAROUND_PORTS//,/+}"
  if validate_rule "${workaround_json}" "${TARGET_TAG}" "${NETWORK}" "INGRESS" "${workaround_required}"; then
    echo "OK_WORKAROUND: ${WORKAROUND_RULE} is present for udp ${WORKAROUND_PORTS}."
    echo "This confirms the legacy no-admin firewall path. UE 5.7 PixelStreaming2 may still advertise 49152+ ICE candidates; verify wilbur.log during a live browser test."
    echo "Use Unreal launch flags:"
    echo "  -PixelStreamingWebRTCMinPort=${WORKAROUND_PORTS%%,*}"
    echo "  -PixelStreamingWebRTCMaxPort=${WORKAROUND_PORTS##*,}"
    echo "  -PixelStreamingWebRTCDisableTransmitAudio=true"
    echo "  -PixelStreamingWebRTCDisableReceiveAudio=true"
    echo
    echo "Permanent wide-port cleanup is still optional/recommended. Admin command:"
    print_permanent_command
    exit 0
  fi

  echo "INCOMPLETE_WORKAROUND: ${WORKAROUND_RULE} exists but is not demo-ready."
  validate_rule "${workaround_json}" "${TARGET_TAG}" "${NETWORK}" "INGRESS" "${workaround_required}" || true
  echo
else
  echo "MISSING_WORKAROUND: ${WORKAROUND_RULE}"
  sed 's/^/  /' "${workaround_err}" || true
  echo
fi

echo "NO_WORKING_WEBRTC_FIREWALL_PATH"
echo
echo "Ask a GCP network admin to create the permanent wide-port rule:"
print_permanent_command
echo
echo "Until either the permanent or workaround path exists, Pixel Streaming may stall at: WEBRTC CONNECTION NEGOTIATED"
exit 2
