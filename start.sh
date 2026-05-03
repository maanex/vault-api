#!/bin/bash

mkdir -p /app/vault

cd /app/obsidian-livesync
bun run src/apps/cli/index.ts --config /app/livesync.conf.json watch /app/vault &

cd /app
bun run src/server.ts