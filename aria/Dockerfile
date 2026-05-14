FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y \
    chromium \
    ca-certificates \
    fonts-liberation \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

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
