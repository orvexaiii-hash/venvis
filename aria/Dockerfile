FROM node:22-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY server/ ./server/
COPY scripts/ ./scripts/

VOLUME ["/app/data"]

ENV NODE_ENV=production
ENV DB_PATH=/app/data/aria.db
ENV AUTH_DIR=/app/data/auth
ENV GOOGLE_CLIENT_ID=
ENV GOOGLE_CLIENT_SECRET=
ENV GOOGLE_CALLBACK_URL=

CMD ["node", "server/index.mjs"]
