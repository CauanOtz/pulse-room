#!/usr/bin/env bash
set -euo pipefail

: "${PUBLIC_IP:?PUBLIC_IP is required}"
: "${LIVEKIT_DOMAIN:?LIVEKIT_DOMAIN is required}"
: "${LIVEKIT_API_KEY:?LIVEKIT_API_KEY is required}"
: "${LIVEKIT_API_SECRET:?LIVEKIT_API_SECRET is required}"

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y ca-certificates curl docker.io docker-compose-v2 ufw
systemctl enable --now docker

cat > /etc/sysctl.d/99-livekit.conf <<'EOF'
net.core.rmem_max = 5000000
net.core.wmem_max = 5000000
EOF
sysctl --system >/dev/null

install -d -m 0750 /opt/pulse-room-livekit
install -d -m 0755 /opt/pulse-room-livekit/caddy-data
install -d -m 0755 /opt/pulse-room-livekit/caddy-config

cat > /opt/pulse-room-livekit/livekit.yaml <<EOF
port: 7880
rtc:
  tcp_port: 7881
  udp_port: 7882
  use_external_ip: false
  node_ip: ${PUBLIC_IP}
keys:
  "${LIVEKIT_API_KEY}": "${LIVEKIT_API_SECRET}"
room:
  empty_timeout: 300
  departure_timeout: 20
logging:
  level: info
EOF

cat > /opt/pulse-room-livekit/Caddyfile <<EOF
${LIVEKIT_DOMAIN} {
  reverse_proxy 127.0.0.1:7880
}
EOF

cat > /opt/pulse-room-livekit/docker-compose.yml <<'EOF'
services:
  livekit:
    image: livekit/livekit-server:v1.13.5
    command: ["--config", "/etc/livekit.yaml"]
    network_mode: host
    restart: unless-stopped
    volumes:
      - ./livekit.yaml:/etc/livekit.yaml:ro

  caddy:
    image: caddy:2.10-alpine
    network_mode: host
    restart: unless-stopped
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - ./caddy-data:/data
      - ./caddy-config:/config
EOF

chmod 0600 /opt/pulse-room-livekit/livekit.yaml

ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 7881/tcp
ufw allow 7882/udp
ufw --force enable

cd /opt/pulse-room-livekit
docker compose pull
docker compose up -d
docker compose ps
