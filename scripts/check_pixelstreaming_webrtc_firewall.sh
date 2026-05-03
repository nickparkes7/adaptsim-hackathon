#!/usr/bin/env bash
set -euo pipefail

PERMANENT_RULE="${ADAPTSIM_WEBRTC_FIREWALL_RULE:-adaptsim-pixelstreaming-webrtc}"
WORKAROUND_RULE="${ADAPTSIM_WEBRTC_WORKAROUND_RULE:-pixel-streaming-hc}"
HOST_PROJECT="${ADAPTSIM_WEBRTC_FIREWALL_PROJECT:-gecko-enterprise-dev-host}"
NETWORK="${ADAPTSIM_WEBRTC_NETWORK:-dev-network}"
TARGET_TAG="${ADAPTSIM_WEBRTC_TARGET_TAG:-stun-turn-server}"
PERMANENT_PORT_RANGE="${ADAPTSIM_WEBRTC_PORT_RANGE:-49152-49200}"
WORKAROUND_PORTS="${ADAPTSIM_WEBRTC_WORKAROUND_PORTS:-19302,19303}"
RELAY_UDP_RULE="${ADAPTSIM_WEBRTC_RELAY_UDP_RULE:-turn-server-dtls}"
RELAY_TCP_RULE="${ADAPTSIM_WEBRTC_RELAY_TCP_RULE:-pixel-streaming-http-access}"
RELAY_UDP_TARGET_TAG="${ADAPTSIM_WEBRTC_RELAY_UDP_TARGET_TAG:-}"
RELAY_TCP_TARGET_TAG="${ADAPTSIM_WEBRTC_RELAY_TCP_TARGET_TAG:-http-server}"
RELAY_PORT="${ADAPTSIM_WEBRTC_RELAY_PORT:-443}"
PUBLIC_IP="${ADAPTSIM_PIXEL_STREAMING_PUBLIC_IP:-34.139.126.187}"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

echo "Checking Pixel Streaming WebRTC firewall paths:"
echo "  project:          ${HOST_PROJECT}"
echo "  network:          ${NETWORK}"
echo "  target tag:       ${TARGET_TAG}"
echo "  relay udp rule:   ${RELAY_UDP_RULE} udp ${RELAY_PORT}"
echo "  relay tcp rule:   ${RELAY_TCP_RULE} tcp ${RELAY_PORT}"
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
if target_tag and target_tag not in target_tags:
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

print_relay_config() {
  cat <<EOF
Use relay-only Pixel Streaming ICE:
  ADAPTSIM_PS_TURN_URLS='turn:${PUBLIC_IP}:${RELAY_PORT}?transport=udp,turn:${PUBLIC_IP}:${RELAY_PORT}?transport=tcp'
  ADAPTSIM_PS_TURN_USERNAME='<stored in turn_credentials.env>'
  ADAPTSIM_PS_TURN_CREDENTIAL='<stored in turn_credentials.env>'
  ADAPTSIM_PS_ICE_TRANSPORT_POLICY='relay'
  ADAPTSIM_PS_STUN_URLS=''
EOF
}

relay_udp_json="${tmp_dir}/relay-udp.json"
relay_udp_err="${tmp_dir}/relay-udp.err"
relay_udp_ok=0
if describe_rule "${RELAY_UDP_RULE}" "${relay_udp_json}" "${relay_udp_err}"; then
  if validate_rule "${relay_udp_json}" "${RELAY_UDP_TARGET_TAG}" "${NETWORK}" "INGRESS" "udp:${RELAY_PORT}"; then
    relay_udp_ok=1
  else
    echo "INCOMPLETE_RELAY_UDP: ${RELAY_UDP_RULE} exists but is not demo-ready."
    validate_rule "${relay_udp_json}" "${RELAY_UDP_TARGET_TAG}" "${NETWORK}" "INGRESS" "udp:${RELAY_PORT}" || true
    echo
  fi
else
  echo "MISSING_RELAY_UDP: ${RELAY_UDP_RULE}"
  sed 's/^/  /' "${relay_udp_err}" || true
  echo
fi

relay_tcp_json="${tmp_dir}/relay-tcp.json"
relay_tcp_err="${tmp_dir}/relay-tcp.err"
relay_tcp_ok=0
if describe_rule "${RELAY_TCP_RULE}" "${relay_tcp_json}" "${relay_tcp_err}"; then
  if validate_rule "${relay_tcp_json}" "${RELAY_TCP_TARGET_TAG}" "${NETWORK}" "INGRESS" "tcp:${RELAY_PORT}"; then
    relay_tcp_ok=1
  else
    echo "INCOMPLETE_RELAY_TCP: ${RELAY_TCP_RULE} exists but is not demo-ready."
    validate_rule "${relay_tcp_json}" "${RELAY_TCP_TARGET_TAG}" "${NETWORK}" "INGRESS" "tcp:${RELAY_PORT}" || true
    echo
  fi
else
  echo "MISSING_RELAY_TCP: ${RELAY_TCP_RULE}"
  sed 's/^/  /' "${relay_tcp_err}" || true
  echo
fi

if [[ "${relay_udp_ok}" -eq 1 && "${relay_tcp_ok}" -eq 1 ]]; then
  echo "OK_RELAY: TURN relay on ${PUBLIC_IP}:${RELAY_PORT} has UDP/TCP firewall coverage."
  echo "This is the preferred shared-VPC path; it avoids direct Unreal WebRTC candidates on 49152+ ports."
  print_relay_config
  exit 0
fi

permanent_json="${tmp_dir}/permanent.json"
permanent_err="${tmp_dir}/permanent.err"
if describe_rule "${PERMANENT_RULE}" "${permanent_json}" "${permanent_err}"; then
  if validate_rule "${permanent_json}" "${TARGET_TAG}" "${NETWORK}" "INGRESS" "udp:${PERMANENT_PORT_RANGE},tcp:${PERMANENT_PORT_RANGE}"; then
    echo "OK_DIRECT_WIDE_PORT: ${PERMANENT_RULE} is present for udp/tcp ${PERMANENT_PORT_RANGE}."
    echo "This is a direct WebRTC path; prefer OK_RELAY on shared VPCs when TURN is configured."
    echo "Direct-path Unreal launch flags:"
    echo "  -PixelStreamingWebRTCMinPort=${PERMANENT_PORT_RANGE%-*}"
    echo "  -PixelStreamingWebRTCMaxPort=${PERMANENT_PORT_RANGE#*-}"
    exit 0
  fi

  echo "INCOMPLETE_DIRECT_WIDE_PORT: ${PERMANENT_RULE} exists but is not demo-ready."
  validate_rule "${permanent_json}" "${TARGET_TAG}" "${NETWORK}" "INGRESS" "udp:${PERMANENT_PORT_RANGE},tcp:${PERMANENT_PORT_RANGE}" || true
  echo
else
  echo "MISSING_DIRECT_WIDE_PORT: ${PERMANENT_RULE}"
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
    echo "For the no-admin durable path, configure the TURN relay and launch with iceTransportPolicy=relay:"
    echo "  scripts/pixel-streaming/vm_configure_turn_relay.sh"
    echo "  scripts/pixel-streaming/vm_pixel_streaming.sh restart"
    echo
    echo "Admin-only wide-port cleanup is still optional. Admin command:"
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
echo "No direct WebRTC firewall path exists."
echo
echo "No-admin durable path:"
echo "  scripts/pixel-streaming/vm_configure_turn_relay.sh"
echo "  scripts/pixel-streaming/vm_pixel_streaming.sh restart"
echo
echo "Or ask a GCP network admin to create the wide-port direct-media rule:"
print_permanent_command
echo
echo "Until a direct firewall path or relay-only TURN path exists, Pixel Streaming may stall at: WEBRTC CONNECTION NEGOTIATED"
exit 2
