FROM node:22-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

# Mount a persistent disk at /data so campaigns and the Google token survive redeploys
ENV NODE_ENV=production DATA_DIR=/data PORT=5000
VOLUME /data
EXPOSE 5000

CMD ["node", "server/index.js"]
