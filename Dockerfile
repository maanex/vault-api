FROM oven/bun:1-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    bash \
    nodejs \
    npm \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

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