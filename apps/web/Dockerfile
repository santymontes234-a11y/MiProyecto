# EcoMove Querétaro — imagen de producción del sitio web (Next.js, salida standalone).
# Se construye DESDE LA RAÍZ del monorepo (usa packages/shared y el package-lock raíz):
#   docker build -f apps/web/Dockerfile \
#     --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example.com/api/v1 \
#     --build-arg NEXT_PUBLIC_SITE_URL=https://example.com -t ecomove/web .
# Las variables NEXT_PUBLIC_* se incrustan en el bundle y en la CSP durante el build:
# cambiar el dominio exige reconstruir la imagen.

ARG NODE_IMAGE=node:22-bookworm-slim

# --- Dependencias (solo el workspace web + shared) ---
FROM ${NODE_IMAGE} AS deps
WORKDIR /repo
ENV npm_config_fund=false npm_config_audit=false npm_config_update_notifier=false
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --workspace=@ecomove/web --include-workspace-root=false --ignore-scripts \
 && npm cache clean --force

# --- Compilación ---
FROM ${NODE_IMAGE} AS build
WORKDIR /repo
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL} \
    NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_OUTPUT=standalone \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/web/node_modules ./apps/web/node_modules
COPY tsconfig.base.json package.json ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
RUN test -n "$NEXT_PUBLIC_API_BASE_URL" || (echo "Falta --build-arg NEXT_PUBLIC_API_BASE_URL" >&2; exit 1) \
 && npm run build --workspace=@ecomove/web

# --- Runtime mínimo, usuario sin privilegios ---
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
RUN groupadd --system --gid 10001 ecomove \
 && useradd --system --uid 10001 --gid ecomove --no-create-home --shell /usr/sbin/nologin ecomove
COPY --from=build --chown=root:root /repo/apps/web/.next/standalone ./
COPY --from=build --chown=root:root /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=root:root /repo/apps/web/public ./apps/web/public
# Next escribe su caché de ISR/imágenes aquí: único directorio con permisos de escritura.
RUN mkdir -p apps/web/.next/cache && chown -R ecomove:ecomove apps/web/.next/cache
USER ecomove
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/',{redirect:'manual'}).then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
