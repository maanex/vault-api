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
