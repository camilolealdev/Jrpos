# Stage 1: build the frontend static assets
FROM node:20-alpine AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci || npm install
COPY frontend/ .
RUN npm run build

# Stage 2: serve the static build + reverse-proxy /api to the backend,
# both from the same origin (avoids the cross-site cookie issue the
# split Vercel deployment had).
FROM caddy:2-alpine
COPY --from=build /app/build /srv
COPY Caddyfile /etc/caddy/Caddyfile
