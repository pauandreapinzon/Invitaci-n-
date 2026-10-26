# Imagen del dashboard. El contexto de build es la raiz del monorepo.
FROM node:20-alpine AS build
WORKDIR /app
ARG NEXT_PUBLIC_API_URL=http://localhost:3000/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

COPY package.json package-lock.json ./
COPY packages/clinical-engine/package.json packages/clinical-engine/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @medfollow/web --include-workspace-root

COPY apps/web apps/web
RUN npm run build -w @medfollow/web

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules node_modules
COPY --from=build /app/package.json package.json
COPY --from=build /app/apps/web/.next apps/web/.next
COPY --from=build /app/apps/web/public apps/web/public
COPY --from=build /app/apps/web/package.json apps/web/package.json
COPY --from=build /app/apps/web/next.config.mjs apps/web/next.config.mjs

USER node
EXPOSE 3001
CMD ["npm", "run", "start", "-w", "@medfollow/web"]
