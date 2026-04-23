FROM node:22-slim

RUN apt-get update && apt-get install -y \
    python3 python3-pip \
    iputils-ping \
    --no-install-recommends \
  && pip3 install edge-tts --break-system-packages \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY server/ ./server/
COPY client/ ./client/

RUN mkdir -p /data

ENV DB_PATH=/data/venvis.db

EXPOSE 3000

CMD ["node", "server/index.mjs"]
