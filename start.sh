#!/bin/bash

set -euo pipefail

VAULT_DIR="${VAULT_DIR:-/app/vault}"
mkdir -p "${VAULT_DIR}/.livesync"

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

const vaultDir = process.env.VAULT_DIR || "/app/vault";

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
	disableCheckingConfigMismatch: true,
	isConfigured: true
};

writeFileSync(`${vaultDir}/.livesync/settings.json`, JSON.stringify(settings, null, 2), "utf-8");
'

# Auto-resolve any potential remote lock on fresh or existing instances
node /app/obsidian-livesync/src/apps/cli/dist/index.cjs "${VAULT_DIR}" mark-resolved >/dev/null 2>&1 || true

# Start the LiveSync continuous synchronization daemon
node /app/obsidian-livesync/src/apps/cli/dist/index.cjs "${VAULT_DIR}" daemon &

# Start the API server
cd /app
exec bun run src/index.ts