FROM oven/bun:alpine

WORKDIR /app

RUN apk add --no-cache git bash

RUN git clone https://github.com/vrtmrz/obsidian-livesync.git \
    && cd obsidian-livesync \
    && bun install

COPY package.json ./
RUN bun install

COPY src ./src
COPY start.sh ./
RUN chmod +x start.sh

EXPOSE 3000

CMD ["./start.sh"]