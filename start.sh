#!/bin/bash

set -euo pipefail

mkdir -p /app/vault

required_vars=(
	LIVESYNC_COUCHDB_URI
	LIVESYNC_COUCHDB_USER
	LIVESYNC_COUCHDB_PASSWORD
	LIVESYNC_COUCHDB_DBNAME
	LIVESYNC_PASSPHRASE
)

for var in "${required_vars[@]}"; do
	if [[ -z "${!var:-}" ]]; then
		echo "Missing required environment variable: ${var}" >&2
		exit 1
	fi
done

bun -e '
import { writeFileSync } from "node:fs";

const settings = {
	couchDB_URI: process.env.LIVESYNC_COUCHDB_URI,
	couchDB_USER: process.env.LIVESYNC_COUCHDB_USER,
	couchDB_PASSWORD: process.env.LIVESYNC_COUCHDB_PASSWORD,
	couchDB_DBNAME: process.env.LIVESYNC_COUCHDB_DBNAME,
	liveSync: true,
	syncOnSave: true,
	syncOnStart: true,
	encrypt: true,
	passphrase: process.env.LIVESYNC_PASSPHRASE,
	usePluginSync: false,
	useIndexedDBAdapter: false,
	isConfigured: true
};

writeFileSync("/app/livesync.conf.json", JSON.stringify(settings, null, 2), "utf-8");
'

cd /app/obsidian-livesync
bun run src/apps/cli/index.ts /app/vault --settings /app/livesync.conf.json daemon &

cd /app
bun run src/index.ts