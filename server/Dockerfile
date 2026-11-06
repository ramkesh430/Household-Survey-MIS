# Build context: repository root (needs ../shared)
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY shared/ ./shared/
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev && npm cache clean --force && mkdir -p /backups && chown node:node /backups
COPY server/ ./server/
WORKDIR /app/server
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1
CMD ["node", "src/index.js"]
