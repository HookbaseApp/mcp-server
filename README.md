# Hookbase MCP Server

An MCP (Model Context Protocol) server that exposes the Hookbase webhook relay API as tools for AI assistants like Claude.

## Quick Start

### 1. Get your API key

Get your API key from the [Hookbase dashboard](https://www.hookbase.app) under Settings → API Keys.

### 2. Add to Claude Desktop

Add to your Claude Desktop config file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Linux**: `~/.config/claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "hookbase": {
      "command": "npx",
      "args": ["-y", "@hookbase/mcp-server"],
      "env": {
        "HOOKBASE_API_KEY": "whr_live_your_key_here"
      }
    }
  }
}
```

### 3. Restart Claude Desktop

Restart Claude Desktop to load the MCP server. You can now ask Claude to manage your webhooks!

## Alternative Installation

### Global install

```bash
npm install -g @hookbase/mcp-server
```

Then use in Claude Desktop config:

```json
{
  "mcpServers": {
    "hookbase": {
      "command": "hookbase-mcp",
      "env": {
        "HOOKBASE_API_KEY": "whr_live_your_key_here"
      }
    }
  }
}
```

### From source

```bash
git clone https://github.com/hookbase/hookbase.git
cd hookbase/mcp-server
npm install
npm run build
```

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `HOOKBASE_API_KEY` | Yes | Your Hookbase API key (starts with `whr_`) |
| `HOOKBASE_ORG_ID` | No | Organization ID (only needed if you have multiple orgs) |
| `HOOKBASE_API_URL` | No | API URL override (default: https://api.hookbase.app) |

The organization is automatically detected from your API key.

## Available Tools (24)

### Sources
- `hookbase_list_sources` - List all webhook sources
- `hookbase_get_source` - Get source details
- `hookbase_create_source` - Create new source
- `hookbase_update_source` - Update source config

### Destinations
- `hookbase_list_destinations` - List all destinations
- `hookbase_get_destination` - Get destination details
- `hookbase_create_destination` - Create new destination
- `hookbase_test_destination` - Test destination connectivity

### Routes
- `hookbase_list_routes` - List all routes
- `hookbase_get_route` - Get route details
- `hookbase_create_route` - Create source→destination route

### Events
- `hookbase_list_events` - Query events with filters
- `hookbase_get_event` - Get event with payload & deliveries
- `hookbase_get_event_debug` - Get cURL command to replay event

### Deliveries
- `hookbase_list_deliveries` - Query deliveries
- `hookbase_get_delivery` - Get delivery details with response
- `hookbase_replay_delivery` - Retry a failed delivery
- `hookbase_bulk_replay` - Retry multiple failed deliveries

### Tunnels
- `hookbase_list_tunnels` - List localhost tunnels
- `hookbase_create_tunnel` - Create new tunnel
- `hookbase_get_tunnel_status` - Check tunnel connection

### Cron
- `hookbase_list_cron_jobs` - List scheduled jobs
- `hookbase_trigger_cron` - Manually trigger a job

### Analytics
- `hookbase_get_analytics` - Get dashboard metrics

## Example Prompts

Once configured, you can ask Claude things like:

- "List all my webhook sources"
- "Show me failed deliveries from the last hour"
- "Create a new source for Stripe webhooks"
- "What's my webhook success rate for the last 24 hours?"
- "Replay all failed deliveries for the payment-service destination"
- "Test my Slack notification destination"
- "Create a route from my GitHub source to my CI/CD destination"

## Troubleshooting

### "Missing HOOKBASE_API_KEY"
Make sure your API key is set in the `env` section of your Claude Desktop config.

### "Invalid API key"
Check that your API key starts with `whr_` and is valid in the Hookbase dashboard.

### "Multiple organizations found"
If you belong to multiple organizations, add `HOOKBASE_ORG_ID` to your env config.

### Server not appearing in Claude
1. Check the config file path is correct for your OS
2. Ensure the JSON is valid (no trailing commas)
3. Restart Claude Desktop completely

## License

MIT
