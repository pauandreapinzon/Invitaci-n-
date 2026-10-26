# Imagen de la API. El contexto de build es la raiz del monorepo.
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/clinical-engine/package.json packages/clinical-engine/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @medfollow/api --workspace @medfollow/clinical-engine --include-workspace-root

COPY packages/clinical-engine packages/clinical-engine
COPY apps/api apps/api
RUN npm run build -w @medfollow/clinical-engine \
  && npx prisma generate --schema apps/api/prisma/schema.prisma \
  && npm run build -w @medfollow/api

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules node_modules
COPY --from=build /app/package.json package.json
COPY --from=build /app/packages/clinical-engine/dist packages/clinical-engine/dist
COPY --from=build /app/packages/clinical-engine/package.json packages/clinical-engine/package.json
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/apps/api/prisma apps/api/prisma

USER node
EXPOSE 3000
# Las migraciones se aplican al arrancar para que el contenedor sea autosuficiente.
CMD ["sh", "-c", "npx prisma migrate deploy --schema apps/api/prisma/schema.prisma && node apps/api/dist/main.js"]
