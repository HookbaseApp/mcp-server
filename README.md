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

## Available Tools (52)

### Inbound Webhooks

#### Sources
- `hookbase_list_sources` - List all webhook sources
- `hookbase_get_source` - Get source details
- `hookbase_create_source` - Create new source
- `hookbase_update_source` - Update source config

#### Destinations
- `hookbase_list_destinations` - List all destinations
- `hookbase_get_destination` - Get destination details
- `hookbase_create_destination` - Create new destination
- `hookbase_test_destination` - Test destination connectivity

#### Routes
- `hookbase_list_routes` - List all routes
- `hookbase_get_route` - Get route details
- `hookbase_create_route` - Create source→destination route

#### Events
- `hookbase_list_events` - Query events with filters
- `hookbase_get_event` - Get event with payload & deliveries
- `hookbase_get_event_debug` - Get cURL command to replay event

#### Deliveries
- `hookbase_list_deliveries` - Query deliveries
- `hookbase_get_delivery` - Get delivery details with response
- `hookbase_replay_delivery` - Retry a failed delivery
- `hookbase_bulk_replay` - Retry multiple failed deliveries

#### Tunnels
- `hookbase_list_tunnels` - List localhost tunnels
- `hookbase_create_tunnel` - Create new tunnel
- `hookbase_get_tunnel_status` - Check tunnel connection

#### Cron
- `hookbase_list_cron_jobs` - List scheduled jobs
- `hookbase_trigger_cron` - Manually trigger a job

#### Analytics
- `hookbase_get_analytics` - Get dashboard metrics

### Outbound Webhooks

Send webhooks to your customers' endpoints with built-in retries, signature verification, and circuit breakers.

#### Webhook Applications
Applications represent a customer or integration that receives your outbound webhooks.
- `hookbase_list_applications` - List webhook applications
- `hookbase_get_application` - Get application details and statistics
- `hookbase_create_application` - Create new application
- `hookbase_update_application` - Update application config or disable
- `hookbase_delete_application` - Delete application (cascades to endpoints)

#### Webhook Endpoints
Endpoints are the URLs where webhooks are delivered.
- `hookbase_list_endpoints` - List endpoints with filters
- `hookbase_get_endpoint` - Get endpoint details with circuit breaker state
- `hookbase_create_endpoint` - Create endpoint (returns signing secret)
- `hookbase_update_endpoint` - Update endpoint URL or config
- `hookbase_delete_endpoint` - Delete endpoint
- `hookbase_rotate_endpoint_secret` - Rotate signing secret with grace period
- `hookbase_reset_endpoint_circuit` - Reset circuit breaker to closed state

#### Webhook Subscriptions
Subscriptions connect endpoints to the event types they should receive.
- `hookbase_list_subscriptions` - List subscriptions
- `hookbase_get_subscription` - Get subscription details
- `hookbase_create_subscription` - Subscribe endpoint to event type
- `hookbase_update_subscription` - Update filter or transform
- `hookbase_delete_subscription` - Remove subscription

#### Event Types
Event types define the kinds of webhooks you can send.
- `hookbase_list_event_types` - List event type definitions
- `hookbase_get_event_type` - Get event type with schema
- `hookbase_create_event_type` - Create event type (e.g., "order.created")
- `hookbase_update_event_type` - Update or deprecate event type
- `hookbase_delete_event_type` - Delete event type

#### Send Events & Track Messages
- `hookbase_send_event` - Send webhook event to subscribed endpoints
- `hookbase_list_outbound_messages` - List delivery records
- `hookbase_get_outbound_message` - Get message details
- `hookbase_get_message_attempts` - Get delivery attempt history
- `hookbase_replay_message` - Replay failed message
- `hookbase_get_outbound_stats` - Get delivery statistics by status

## Example Prompts

Once configured, you can ask Claude things like:

### Inbound Webhooks
- "List all my webhook sources"
- "Show me failed deliveries from the last hour"
- "Create a new source for Stripe webhooks"
- "What's my webhook success rate for the last 24 hours?"
- "Replay all failed deliveries for the payment-service destination"
- "Test my Slack notification destination"
- "Create a route from my GitHub source to my CI/CD destination"

### Outbound Webhooks
- "Create a webhook application for Acme Corp"
- "Add an endpoint https://acme.com/webhooks to the Acme application"
- "Create an event type called order.created for order events"
- "Subscribe Acme's endpoint to order.created events"
- "Send a test order.created event with this payload: {orderId: '123', total: 99.99}"
- "Show me all failed outbound messages"
- "Replay the failed message to Acme's endpoint"
- "What's the circuit breaker status for Acme's endpoint?"
- "Reset the circuit breaker for endpoint X"
- "Rotate the signing secret for Acme's endpoint with a 2-hour grace period"
- "List all endpoints that have their circuit breaker open"
- "Get delivery statistics for outbound webhooks"

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
