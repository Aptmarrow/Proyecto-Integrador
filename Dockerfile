# =============================================================================
# Danmakrew (NoMercyGames) — Unified Cloud Production Dockerfile
# Runs Frontend (static React + PixiJS), Backend API (Fastify), WebSockets
# (/signal & /game), and Swagger UI (/docs) behind a single Nginx entrypoint
# listening on $PORT (compatible with Azure, Render, Railway, and VPS).
# =============================================================================

# --- Stage 1: Build Frontend (React 19 + PixiJS + Web Workers + PWA) ---
FROM node:20-alpine AS frontend-builder
WORKDIR /app/Frontend

COPY Frontend/package*.json ./
RUN npm ci --legacy-peer-deps

COPY Frontend/ ./
ARG VITE_API_URL=/api
ARG VITE_WS_URL=same-origin
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_WS_URL=$VITE_WS_URL
RUN npm run build

# --- Stage 2: Install Backend production dependencies ---
FROM node:20-slim AS backend-deps
RUN apt-get update && \
    apt-get install -y --no-install-recommends git ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app/Backend
COPY Backend/package*.json ./
RUN npm ci --omit=dev

# --- Stage 3: Final unified runtime (Nginx + Node.js 20) ---
FROM node:20-slim AS runtime
RUN apt-get update && \
    apt-get install -y --no-install-recommends nginx gettext-base ca-certificates curl && \
    rm -rf /var/lib/apt/lists/* /etc/nginx/sites-enabled/default /etc/nginx/conf.d/default.conf

WORKDIR /app

# Backend runtime
COPY --from=backend-deps /app/Backend/node_modules ./Backend/node_modules
COPY Backend/package*.json ./Backend/
COPY Backend/contextbook.md ./Backend/contextbook.md
COPY Backend/src ./Backend/src
COPY Backend/docs ./Backend/docs
COPY Backend/scripts ./Backend/scripts

# Built Frontend static assets served by Nginx
COPY --from=frontend-builder /app/Frontend/dist /usr/share/nginx/html

# Nginx reverse proxy template + unified entrypoint
COPY deploy/nginx.cloud.conf.template /etc/nginx/templates/default.conf.template
COPY deploy/start-cloud.sh /app/start-cloud.sh
RUN chmod +x /app/start-cloud.sh

ENV NODE_ENV=production
ENV PORT=8080
ENV API_INTERNAL_PORT=3001
ENV WS_PORT=9001

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT:-8080}/api/health" >/dev/null || exit 1

CMD ["/app/start-cloud.sh"]

