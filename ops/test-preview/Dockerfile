FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY server ./server
COPY src/data ./src/data
COPY ops/test-preview ./ops/test-preview
COPY .test-preview-dist ./web
USER node
CMD ["node", "ops/test-preview/start.mjs"]
