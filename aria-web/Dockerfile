FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y python3 make g++ --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ENV NODE_ENV=production
ENV PORT=3002

RUN npm run build

EXPOSE 3002

CMD ["npm", "start"]
