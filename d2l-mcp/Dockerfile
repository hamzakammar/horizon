FROM node:20-alpine

# Install Playwright system dependencies for Alpine
RUN apk add --no-cache \
    chromium \
    chromium-chromedriver \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    udev \
    ttf-opensans \
    bash \
    libstdc++ \
    libgcc \
    xvfb \
    dbus

# Set environment variables for headless operation
ENV DISPLAY=:99
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for Playwright)
# Use Alpine's chromium, but also install Playwright's for fallback
RUN npm ci && \
    npx playwright install chromium-headless-shell --with-deps || true

# Remove devDependencies to reduce image size (but keep Playwright binaries)
# Note: We skip install-deps because we already installed Alpine packages manually above
RUN npm prune --production

COPY dist ./dist
COPY scripts ./scripts

ENV NODE_ENV=production
ENV MCP_TRANSPORT=http

EXPOSE 3000

CMD ["npm", "start"]
