# Vault Api

This is an api server for your Obsidian vault.
It uses the [Self-hosted LiveSync](https://github.com/vrtmrz/obsidian-livesync) plugin to sync an up-to-date version of your vault in the docker container and provides some apis for accessing your data.
Idea being that you can host this on a device that's not your main workstation.


## Qs

**Obsidian?** — <https://obsidian.md/>

**Why the community livesync plugin?** — Because that's what I use and it works

**Why folder name not configureable?** — Because it works for me, see Roadmap though


## Apis

**/birthdays/:MM-DD?** — Goes to your `/People` folder, searches all notes with the `birthday` property and returns all for the day.


## Roadmap

- Better caching / indexing (maybe through sqlite or something)
- In-vault config: make it so that you can configure apis, paths, attribute names, etc through a file in the vault, e.g. `/.config/api`
- More apis: tbd
- MCP / RAG endpoints
- Proactive daily summaries, e.g. create and push a daily digest note (also llm powered probably)


## Runtime Configuration

At container runtime, provide only these env vars for LiveSync configuration:

- `LIVESYNC_COUCHDB_URI`
- `LIVESYNC_COUCHDB_USER`
- `LIVESYNC_COUCHDB_PASSWORD`
- `LIVESYNC_COUCHDB_DBNAME`
- `LIVESYNC_PASSPHRASE`

The container entrypoint generates `/app/livesync.conf.json` from those env vars and starts the LiveSync CLI automatically.

Example:

```bash
docker run --rm -p 3063:3063 \
	-e LIVESYNC_COUCHDB_URI="http://couchdb:5984" \
	-e LIVESYNC_COUCHDB_USER="admin" \
	-e LIVESYNC_COUCHDB_PASSWORD="secret" \
	-e LIVESYNC_COUCHDB_DBNAME="obsidian-livesync" \
	-e LIVESYNC_PASSPHRASE="your-passphrase" \
	ghcr.io/maanex/vault-api:main
```