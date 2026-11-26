#!/usr/bin/env sh
set -eu

export PUBLIC_PORT="${PORT:-8080}"
export API_INTERNAL_PORT="${API_INTERNAL_PORT:-3001}"
export WS_PORT="${WS_PORT:-9001}"

# Avoid port collision if cloud provider sets PORT equal to API_INTERNAL_PORT
if [ "$PUBLIC_PORT" = "$API_INTERNAL_PORT" ]; then
  export API_INTERNAL_PORT=3002
fi

echo "[Cloud] Starting Danmakrew unified container"
echo "  -> Public Nginx port : ${PUBLIC_PORT}"
echo "  -> Internal API port : ${API_INTERNAL_PORT}"
echo "  -> Internal WS port  : ${WS_PORT}"

envsubst '${PUBLIC_PORT} ${API_INTERNAL_PORT} ${WS_PORT}' \
  < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf

nginx -t

# Start Node.js Backend (Fastify HTTP + uWebSockets.js)
(
  cd /app/Backend
  exec env PORT="${API_INTERNAL_PORT}" HOST="127.0.0.1" WS_PORT="${WS_PORT}" node src/index.js
) &
NODE_PID=$!

# Wait briefly for Fastify to initialize Neon PostgreSQL and listen
TRIES=0
while [ "$TRIES" -lt 40 ]; do
  if ! kill -0 "$NODE_PID" 2>/dev/null; then
    echo "[Cloud] Backend exited unexpectedly during startup." >&2
    exit 1
  fi
  if curl -fsS "http://127.0.0.1:${API_INTERNAL_PORT}/api/health" >/dev/null 2>&1; then
    echo "[Cloud] Backend is healthy on 127.0.0.1:${API_INTERNAL_PORT}"
    break
  fi
  TRIES=$((TRIES + 1))
  sleep 0.5
done

# Start Nginx in foreground
nginx -g "daemon off;" &
NGINX_PID=$!

cleanup() {
  echo "[Cloud] Shutting down..."
  kill -TERM "$NGINX_PID" "$NODE_PID" 2>/dev/null || true
  wait "$NGINX_PID" "$NODE_PID" 2>/dev/null || true
}
trap cleanup INT TERM

# Exit if either process dies so the cloud orchestrator restarts cleanly
while kill -0 "$NODE_PID" 2>/dev/null && kill -0 "$NGINX_PID" 2>/dev/null; do
  sleep 2
done

echo "[Cloud] A core process exited; stopping container." >&2
cleanup
exit 1

