# @githumbi/grabby-server

> MCP server for grabby — query grabbed elements from AI coding agents

<!-- Demo GIF placeholder: record a short screen capture showing a grab in the browser followed by an AI agent query returning the result, then replace this comment with: ![Demo: grabbing an element in the browser and querying it from an AI agent](./demo.gif) -->

This MCP (Model Context Protocol) server lets AI coding agents like Claude Code, Cursor, and Windsurf access your grabby history. It runs a single process that provides both:

- **MCP tools** over stdio for AI agent queries
- **HTTP webhook** on port 3456 to receive grabs from the browser

## Quick setup

Run this in your project root:

```bash
npx @githumbi/grabby add mcp
```

This writes the MCP server entry to `.mcp.json` in your project root — the standard config file that Claude Code, Cursor, Windsurf, and other MCP-compatible editors all read automatically. Commit this file so your teammates get the same setup.

Then **restart your editor** to activate the MCP connection.

## Manual setup

### Project-scoped (recommended)

Add to `.mcp.json` in your project root. This works in Claude Code, Cursor, Windsurf, and any editor that supports the MCP standard:

```json
{
  "mcpServers": {
    "grabby": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@githumbi/grabby-server@latest"]
    }
  }
}
```

### Claude Code — global (all projects)

To register it globally instead of per-project, use the Claude Code CLI:

```bash
claude mcp add grabby -- npx -y @githumbi/grabby-server@latest
```

This adds the server to your user-level Claude config rather than `.mcp.json`, so it's available in every project without needing the file.

### Docker

If you prefer to run the server in a container rather than via npx, add this to `.mcp.json`:

```json
{
  "mcpServers": {
    "grabby": {
      "type": "stdio",
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "-p", "3456:3456",
        "-v", "grabby-history:/data",
        "ghcr.io/githumbi/grabby-server:latest"
      ]
    }
  }
}
```

The `-v grabby-history:/data` flag uses a named Docker volume so history persists across container restarts without needing a host path. Create it once before first use:

```bash
docker volume create grabby-history
```

> **Note:** Only use one entry (`grabby` or `grabby-docker`) at a time. If both are registered, only one will bind port 3456 — the other will log a warning and continue serving MCP tools without receiving new grabs.

### Claude Desktop

Add to your Claude Desktop config:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "grabby": {
      "command": "npx",
      "args": ["-y", "@githumbi/grabby-server@latest"]
    }
  }
}
```

### Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GRABBY_HISTORY_PATH` | Path to the history file | `~/.grabby/history.json` |
| `GRABBY_PORT` | Webhook listener port | `3456` |

## How it works

```
Browser (grabby)
  → built-in webhook plugin POSTs to http://localhost:3456/grab
  → saved to ~/.grabby/history.json

AI agent (Claude, Cursor, etc.)
  → MCP tool call over stdio
  → reads ~/.grabby/history.json
  → returns results
```

The webhook plugin is built into `@githumbi/grabby` and auto-registers when your app starts. No manual plugin setup needed. If the MCP server isn't running, the POST silently fails and copying still works normally.

Both the MCP tools and webhook run inside the same server process. The MCP tools work even if port 3456 is already in use (e.g. multiple editor windows open) — only the webhook listener is affected.

To disable the webhook plugin, pass `mcpWebhook: false` to `provideGrabby()`.

## MCP tools

### `grabby_search`

Search grab history by text, component name, or file path.

| Parameter | Type | Description |
|-----------|------|-------------|
| `query` | string | Search term — matches HTML, component name, file path, selector |
| `componentName` | string | Filter by component name (partial match) |
| `filePath` | string | Filter by file path (partial match) |
| `limit` | number | Max results (default: 10) |

### `grabby_recent`

Get the most recently grabbed elements.

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | number | Number of results (default: 5) |

### `grabby_get`

Get a single grab entry by ID.

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | The grab entry ID |

### `grabby_stats`

Summary of your grab history: total count, unique components, unique files, and activity in the last 24h / 7d.

## Example usage

Once configured, you can ask your AI agent things like:

- "Show me the last 5 elements I grabbed"
- "Search my grabby history for button components"
- "What components have I grabbed from the auth module?"

## License

MIT
