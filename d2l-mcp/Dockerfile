FROM node:20-bullseye

# Install Playwright dependencies
RUN npx -y playwright@latest install --with-deps chromium

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]