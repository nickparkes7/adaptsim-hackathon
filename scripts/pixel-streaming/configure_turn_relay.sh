#!/usr/bin/env bash
set -euo pipefail

STATE_DIR="${ADAPTSIM_PIXEL_STREAMING_STATE_DIR:-${HOME}/adaptsim-pixelstreaming}"
CREDENTIALS_FILE="${ADAPTSIM_PS_TURN_CREDENTIALS_FILE:-${STATE_DIR}/turn_credentials.env}"
TURN_USER="${ADAPTSIM_PS_TURN_USERNAME:-adaptsim}"
TURN_REALM="${ADAPTSIM_PS_TURN_REALM:-adaptsim}"
TURN_LISTEN_PORT="${ADAPTSIM_PS_TURN_LISTEN_PORT:-443}"
TURN_MIN_PORT="${ADAPTSIM_PS_TURN_MIN_PORT:-19302}"
TURN_MAX_PORT="${ADAPTSIM_PS_TURN_MAX_PORT:-19303}"
TURN_CONFIG="${ADAPTSIM_PS_TURN_CONFIG:-/etc/turnserver.conf}"
TURN_DEFAULT="${ADAPTSIM_PS_TURN_DEFAULT:-/etc/default/coturn}"
TURN_OVERRIDE_DIR="${ADAPTSIM_PS_TURN_OVERRIDE_DIR:-/etc/systemd/system/coturn.service.d}"
TURN_OVERRIDE_FILE="${TURN_OVERRIDE_DIR}/adaptsim-low-port.conf"
TURN_ROTATE="${ADAPTSIM_PS_TURN_ROTATE:-0}"

metadata() {
  local path="$1"
  curl -fsS -H "Metadata-Flavor: Google" "http://metadata.google.internal/computeMetadata/v1/${path}"
}

PUBLIC_IP="${ADAPTSIM_PS_PUBLIC_IP:-$(metadata instance/network-interfaces/0/access-configs/0/external-ip)}"
PRIVATE_IP="${ADAPTSIM_PS_PRIVATE_IP:-$(metadata instance/network-interfaces/0/ip)}"

if [[ -z "${PUBLIC_IP}" || -z "${PRIVATE_IP}" ]]; then
  printf 'ERROR: could not resolve VM public/private IPs. Set ADAPTSIM_PS_PUBLIC_IP and ADAPTSIM_PS_PRIVATE_IP explicitly.\n' >&2
  exit 1
fi

mkdir -p "${STATE_DIR}"
chmod 700 "${STATE_DIR}"

turn_password="${ADAPTSIM_PS_TURN_CREDENTIAL:-}"
if [[ -z "${turn_password}" && "${TURN_ROTATE}" != "1" && -f "${CREDENTIALS_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "${CREDENTIALS_FILE}"
  set +a
  turn_password="${ADAPTSIM_PS_TURN_CREDENTIAL:-}"
fi
if [[ -z "${turn_password}" ]]; then
  turn_password="$(openssl rand -hex 18)"
fi

tmp_credentials="$(mktemp)"
cat > "${tmp_credentials}" <<EOF
ADAPTSIM_PS_TURN_URLS='turn:${PUBLIC_IP}:${TURN_LISTEN_PORT}?transport=udp,turn:${PUBLIC_IP}:${TURN_LISTEN_PORT}?transport=tcp'
ADAPTSIM_PS_TURN_USERNAME='${TURN_USER}'
ADAPTSIM_PS_TURN_CREDENTIAL='${turn_password}'
ADAPTSIM_PS_ICE_TRANSPORT_POLICY='relay'
ADAPTSIM_PS_STUN_URLS=''
EOF
install -m 0600 "${tmp_credentials}" "${CREDENTIALS_FILE}"
rm -f "${tmp_credentials}"

backup=""
if sudo test -f "${TURN_CONFIG}"; then
  backup="${TURN_CONFIG}.adaptsim-backup-$(date -u +%Y%m%dT%H%M%SZ)"
  sudo cp -a "${TURN_CONFIG}" "${backup}"
fi

tmp_config="$(mktemp)"
if sudo test -f "${TURN_CONFIG}"; then
  sudo awk '
    /^# BEGIN ADAPTSIM PIXEL STREAMING TURN$/ { skip=1; next }
    /^# END ADAPTSIM PIXEL STREAMING TURN$/ { skip=0; next }
    !skip { print }
  ' "${TURN_CONFIG}" > "${tmp_config}"
fi
cat >> "${tmp_config}" <<EOF
# BEGIN ADAPTSIM PIXEL STREAMING TURN
listening-port=${TURN_LISTEN_PORT}
alt-listening-port=0
listening-ip=${PRIVATE_IP}
relay-ip=${PRIVATE_IP}
external-ip=${PUBLIC_IP}/${PRIVATE_IP}
realm=${TURN_REALM}
fingerprint
lt-cred-mech
user=${TURN_USER}:${turn_password}
min-port=${TURN_MIN_PORT}
max-port=${TURN_MAX_PORT}
no-tls
no-dtls
no-multicast-peers
# END ADAPTSIM PIXEL STREAMING TURN
EOF

turn_group="root"
if getent group turnserver >/dev/null; then
  turn_group="turnserver"
fi
sudo install -o root -g "${turn_group}" -m 0640 "${tmp_config}" "${TURN_CONFIG}"
rm -f "${tmp_config}"

printf 'TURNSERVER_ENABLED=1\n' | sudo tee "${TURN_DEFAULT}" >/dev/null

sudo mkdir -p "${TURN_OVERRIDE_DIR}"
sudo tee "${TURN_OVERRIDE_FILE}" >/dev/null <<'EOF'
[Service]
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
NoNewPrivileges=no
EOF

sudo systemctl daemon-reload
sudo systemctl enable coturn >/dev/null
sudo systemctl restart coturn
sleep 1
systemctl is-active coturn >/dev/null
sudo ss -luntp | grep -Eq "turnserver.*:${TURN_LISTEN_PORT}"

printf 'Configured AdaptSim TURN relay on %s:%s with relay allocation ports %s-%s.\n' "${PUBLIC_IP}" "${TURN_LISTEN_PORT}" "${TURN_MIN_PORT}" "${TURN_MAX_PORT}"
printf 'Credentials file: %s\n' "${CREDENTIALS_FILE}"
if [[ -n "${backup}" ]]; then
  printf 'Previous coturn config backup: %s\n' "${backup}"
fi
