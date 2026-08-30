# Build the Vite SPA, serve with Caddy carrying the security headers from the
# repo's Caddyfile — replaces the nixpacks static build whose nginx config was
# only ever header-patched by hand inside the running container (see
# Caddyfile note). Same pattern as gp.emsden.studio / brew.keitaemsden.com.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /usr/share/caddy/
EXPOSE 80
