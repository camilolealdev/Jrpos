# Stage 1: build the frontend static assets.
# Uses yarn (not npm) to match exactly what the existing Vercel deploys use —
# `npm ci` is strict about peer deps and fails on react-day-picker's React 19
# mismatch, which yarn classic tolerates (already proven working in prod).
  FROM node:20-alpine AS build
  WORKDIR /app
  COPY frontend/package.json frontend/package-lock.json* ./
  RUN npm ci --legacy-peer-deps || npm install --legacy-peer-deps
  COPY frontend/ .
  RUN CI=false npm run build

# Stage 2: serve the static build + reverse-proxy /api to the backend,
# both from the same origin (avoids the cross-site cookie issue the
# split Vercel deployment had).
FROM caddy:2-alpine
COPY --from=build /app/build /srv
COPY Caddyfile /etc/caddy/Caddyfile
