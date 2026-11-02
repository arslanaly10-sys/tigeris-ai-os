# TIGERIS AI OS images (D-122). Build from the repository root:
#   docker build -f deploy/Dockerfile --target api -t tigeris-api .
#   docker build -f deploy/Dockerfile --target web -t tigeris-web .
# Behind a TLS-inspecting proxy, add its CA for the build only (it is not kept in the image):
#   docker build --secret id=extra_ca,src=/path/to/proxy-ca.pem ...
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=secret,id=extra_ca,required=false \
    NODE_EXTRA_CA_CERTS=$([ -f /run/secrets/extra_ca ] && echo /run/secrets/extra_ca) pnpm install --frozen-lockfile
COPY . .

# The API runs its TypeScript with tsx, as in development; migrations and seed use the same image.
FROM deps AS api
ENV NODE_ENV=production API_HOST=0.0.0.0 API_PORT=4000
# The uploads volume takes this directory's owner, so the non-root API can write evidence files.
RUN mkdir -p /var/tigeris/uploads && chown node:node /var/tigeris/uploads
USER node
EXPOSE 4000
HEALTHCHECK CMD node -e "fetch('http://127.0.0.1:4000/api/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# No package manager at runtime (it would try to download itself): run tsx from the installed packages.
WORKDIR /app/apps/api
ENV NODE_USE_ENV_PROXY=1
CMD ["node_modules/.bin/tsx", "src/server.ts"]

FROM deps AS web-build
RUN --mount=type=secret,id=extra_ca,required=false \
    NODE_EXTRA_CA_CERTS=$([ -f /run/secrets/extra_ca ] && echo /run/secrets/extra_ca) pnpm --filter @tigeris/web build

# Static files behind nginx, which also forwards /api to the API service. Fonts are self-hosted (no CDN).
FROM nginxinc/nginx-unprivileged:1.27-alpine AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
