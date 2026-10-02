# ---- deps ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

# ---- runtime ----
FROM node:20-alpine
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY server/server.js ./
COPY index.html ./
RUN mkdir -p /data

ENV PORT=3000 \
    MINICRAFT_DIR=/app \
    WORLD_FILE=/data/world.json

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD sh -c 'wget -qO- http://127.0.0.1:${PORT:-3000}/ > /dev/null 2>&1 || exit 1'

CMD ["node", "server.js"]
