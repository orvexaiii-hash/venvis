FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y \
    ca-certificates \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY server/ ./server/
COPY scripts/ ./scripts/

VOLUME ["/app/data"]

ENV NODE_ENV=production
ENV DB_PATH=/app/data/aria.db
ENV AUTH_DIR=/app/data/auth

EXPOSE 8765

CMD ["node", "server/index.mjs"]
