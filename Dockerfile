FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN rm -f .env
EXPOSE 3000
CMD ["node", "--experimental-sqlite", "--import", "tsx/esm", "src/server.ts"]