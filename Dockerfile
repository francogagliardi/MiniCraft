# ---- deps ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm install --omit=dev

# ---- runtime ----
FROM node:20-alpine
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY server/server.js ./
COPY index.html ./

ENV PORT=3000 \
    MINICRAFT_DIR=/app \
    WORLD_FILE=/data/world.json

EXPOSE 3000
VOLUME ["/data"]

CMD ["node", "server.js"]
