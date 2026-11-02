# TIGERIS AI OS images (D-122). Build from the repository root:
#   docker build -f deploy/Dockerfile --target api -t tigeris-api .
#   docker build -f deploy/Dockerfile --target web -t tigeris-web .
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile
COPY . .

# The API runs its TypeScript with tsx, as in development; migrations and seed use the same image.
FROM deps AS api
ENV NODE_ENV=production API_HOST=0.0.0.0 API_PORT=4000
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client && rm -rf /var/lib/apt/lists/*
USER node
EXPOSE 4000
HEALTHCHECK CMD node -e "fetch('http://127.0.0.1:4000/api/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["pnpm", "--filter", "@tigeris/api", "start"]

FROM deps AS web-build
RUN pnpm --filter @tigeris/web build

# Static files behind nginx, which also forwards /api to the API service. Fonts are self-hosted (no CDN).
FROM nginxinc/nginx-unprivileged:1.27-alpine AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
