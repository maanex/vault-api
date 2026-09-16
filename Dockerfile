FROM oven/bun:alpine

WORKDIR /app

RUN apk add --no-cache git bash nodejs npm

RUN git clone https://github.com/vrtmrz/obsidian-livesync.git \
    && cd obsidian-livesync \
    && npm install \
    && npm run build -w self-hosted-livesync-cli

COPY package.json ./
RUN bun install

COPY src ./src
COPY start.sh ./
RUN chmod +x start.sh

EXPOSE 3063

CMD ["./start.sh"]