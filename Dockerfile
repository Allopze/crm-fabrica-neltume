# Producción (ADR-0005). Dev y test usan PostgreSQL local con `npm run dev` / `npm test`.
FROM node:24-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM deps AS build
COPY . .
RUN npm run build

# App: servidor standalone de Next.js, sin dependencias de desarrollo ni clave del LLM.
FROM node:24-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]

# Herramientas: migraciones y worker (usan tsx sobre el código fuente).
FROM deps AS herramientas
COPY --chown=node:node . .
USER node

FROM herramientas AS migrar
CMD ["sh", "-c", "npm run db:setup && npm run db:migrar"]

FROM herramientas AS worker
CMD ["npx", "tsx", "src/ai/worker.ts"]

# Compras desde Chipax (ADR-0021): mismo entorno de herramientas que el worker.
FROM herramientas AS compras
CMD ["npx", "tsx", "src/compras/servicio.ts"]
