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

**/tasks** — Returns upcoming non-completed tasks (tagged `#task`, not in `Templates/`, with `due <= now() + 72h`), ordered by `due` ASC and `file.name` ASC. Fields returned: `name`, `due`, `category`, `folder`.

**/mcp** — Model Context Protocol (MCP) server over SSE / HTTP streaming.

---

## 🤖 MCP Server & 2FA Protected Files

The `/mcp` endpoint exposes an extensible MCP server compliant with standard Model Context Protocol clients (Claude Desktop, Cursor, AI agents).

### Available MCP Tools

* **`read_note`**: Reads complete markdown and frontmatter metadata of a specific note. Enforces 2FA protection.
* **`search_notes`**: Searches across note content and titles. Redacts snippets for protected notes until unlocked.
* **`list_files`**: Lists notes and directories, indicating `isProtected: true/false`.
* **`get_tasks`**: Retrieves upcoming non-completed tasks due within 72 hours.
* **`get_birthdays`**: Queries birthdays from `/People`.
* **`unlock_session`**: Unlocks access to protected files for the current session using a 6-digit TOTP code.

### 🛡️ 2FA Protected Files (Blob Schema)

Configure protected file patterns in `.env` via `PROTECTED_FILE_PATTERNS` or in the vault at `.config/protected-patterns.json`:

```env
PROTECTED_FILE_PATTERNS=Private/**,*.secret.md,Finances/**
AUTH_TOTP_SECRET=JBSWY3DPEHPK3PXP
AUTH_SESSION_TTL_MINUTES=5
```

When an agent tool attempts to access any file matching a protected glob pattern without an unlocked session, the server throws a standardized error:
```
ProtectedAccessError: Access to protected file '<path>' requires 2FA authentication.
Please ask the user for their 6-digit authenticator code and execute the 'unlock_session' tool with the code to unlock access for this session.
```

The user provides their standard 6-digit authenticator code (Google Authenticator, 1Password, etc.), and the agent invokes `unlock_session(code)` to unlock access for `AUTH_SESSION_TTL_MINUTES` (default: 5 minutes).

### ➕ Adding New Tools

To add a new tool, create a new file in `src/mcp/tools/your_tool.ts` using `createTool(...)` and export it in `src/mcp/registry.ts`. All tools automatically inherit session context and security guard helpers.


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

### Docker Compose (Recommended)

1. Copy `.env.example` to `.env` and fill in your CouchDB details and encryption passphrase:
   ```bash
   cp .env.example .env
   ```

2. Start the service:
   ```bash
   docker compose up -d
   ```

The vault data and local sync cache will be persisted in the `vault_data` Docker volume.

### Docker Run

```bash
docker run -d \
	--name vault-api \
	-p 3063:3063 \
	-v vault_data:/app/vault \
	-e LIVESYNC_COUCHDB_URI="https://couchdb.example.com/obsidian" \
	-e LIVESYNC_COUCHDB_USER="admin" \
	-e LIVESYNC_COUCHDB_PASSWORD="secret" \
	-e LIVESYNC_COUCHDB_DBNAME="obsidian-livesync" \
	-e LIVESYNC_PASSPHRASE="your-passphrase" \
	ghcr.io/maanex/vault-api:main
```