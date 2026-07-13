FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY web/package.json web/package-lock.json ./web/
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
  && find node_modules -type f \( -name '*.md' -o -name '*.map' -o -name 'LICENSE*' -o -name 'CHANGELOG*' \) -delete || true

FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/web/dist ./web/dist
COPY package.json ./
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack 2>/dev/null || true \
  && mkdir -p /app/data
EXPOSE 2023
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "dist/server.js", "--port", "2023"]
