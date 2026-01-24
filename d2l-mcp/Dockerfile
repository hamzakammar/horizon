FROM node:20-alpine

# Install Playwright system dependencies for Alpine
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    udev \
    ttf-opensans \
    bash

WORKDIR /app

COPY package*.json ./
RUN npm ci --production && \
    npx playwright install chromium && \
    npx playwright install chromium-headless-shell || true

COPY dist ./dist
COPY scripts ./scripts

ENV NODE_ENV=production
ENV MCP_TRANSPORT=http

EXPOSE 3000

CMD ["npm", "start"]
