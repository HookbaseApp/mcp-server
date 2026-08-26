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
git clone https://github.com/HookbaseApp/mcp-server.git
cd mcp-server
npm install
npm run build
```

## Remote / Hosted (HTTP)

The `npx` setup above runs the server **locally over stdio** — great for Claude Desktop and Cursor, which spawn a local process. Clients that can't spawn a process (ChatGPT connectors, Claude on the web, and connector directories) need a **remote URL** instead.

For those, Hookbase exposes the same tools over a stateless [Streamable HTTP](https://modelcontextprotocol.io/specification/basic/transports) endpoint. No install — just a URL and your API key:

```
POST https://mcp.hookbase.app/mcp
Authorization: Bearer whr_live_your_key_here
```

Add it as a remote MCP connector:

```json
{
  "mcpServers": {
    "hookbase": {
      "url": "https://mcp.hookbase.app/mcp",
      "headers": {
        "Authorization": "Bearer whr_live_your_key_here"
      }
    }
  }
}
```

- **Auth** is your `whr_` API key as a bearer token. The organization is resolved from the key.
- If the key belongs to **multiple organizations**, add an `X-Hookbase-Org-Id` header to pick one.
- The endpoint is stateless (no sessions) and CORS-enabled for browser-based clients.

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `HOOKBASE_API_KEY` | Yes | Your Hookbase API key (starts with `whr_`) |
| `HOOKBASE_ORG_ID` | No | Organization ID (only needed if you have multiple orgs) |
| `HOOKBASE_API_URL` | No | API URL override (default: https://api.hookbase.app) |
| `HOOKBASE_NO_CACHE` | No | Set to `1` to disable the org-resolution cache |

The organization is automatically detected from your API key. The result is cached at `~/.config/hookbase/mcp.json` (or `$XDG_CONFIG_HOME/hookbase/mcp.json`) so subsequent boots skip the `/api/auth/me` round-trip. Delete the file to force a refresh.

## Available Tools (142)

### Inbound Webhooks

#### Sources
- `hookbase_list_sources` - List all webhook sources
- `hookbase_get_source` - Get source details
- `hookbase_create_source` - Create new source
- `hookbase_update_source` - Update source config
- `hookbase_delete_source` - Delete a source (cascades to its routes, their deliveries, and every event ever ingested through it)
- `hookbase_rotate_source_secret` - Rotate signing secret (no grace period - old secret stops working immediately)

#### Destinations
- `hookbase_list_destinations` - List all destinations
- `hookbase_get_destination` - Get destination details
- `hookbase_create_destination` - Create new destination
- `hookbase_update_destination` - Update destination config
- `hookbase_delete_destination` - Delete a destination (cascades to its routes and their deliveries, including pending/queued ones)
- `hookbase_test_destination` - Test destination connectivity

#### Routes
- `hookbase_list_routes` - List all routes
- `hookbase_get_route` - Get route details
- `hookbase_create_route` - Create source→destination route
- `hookbase_update_route` - Update route config
- `hookbase_delete_route` - Delete a route (only its own delivery history; source/destination/filter/transform are untouched)

#### Events
- `hookbase_list_events` - Query events with filters
- `hookbase_tail_events` - Poll for events newer than a previous call (lightweight monitoring, not a live stream)
- `hookbase_get_event` - Get event with payload & deliveries
- `hookbase_get_event_debug` - Get cURL command to replay event

#### Deliveries
- `hookbase_list_deliveries` - Query deliveries
- `hookbase_get_delivery` - Get delivery details with response
- `hookbase_replay_delivery` - Retry a failed delivery
- `hookbase_bulk_replay` - Retry multiple failed deliveries (up to 100 IDs)
- `hookbase_replay_with_edit` - Replay one delivery with one-shot payload/destination/transform/header overrides
- `hookbase_list_delivery_clusters` - List failure clusters aggregated by fingerprint (route + destination + status + normalized error)
- `hookbase_replay_cluster` - Replay every delivery matching a cluster fingerprint in one call

#### Tunnels
- `hookbase_list_tunnels` - List localhost tunnels
- `hookbase_create_tunnel` - Create new tunnel
- `hookbase_get_tunnel_status` - Check tunnel connection
- `hookbase_delete_tunnel` - Delete a tunnel (disconnects any live connection and its request log)

#### Cron
- `hookbase_list_cron_jobs` - List scheduled jobs
- `hookbase_get_cron_job` - Get a single cron job
- `hookbase_create_cron_job` - Create a scheduled job
- `hookbase_update_cron_job` - Update a scheduled job
- `hookbase_delete_cron_job` - Delete a scheduled job
- `hookbase_trigger_cron` - Manually trigger a job

#### Cron Groups
- `hookbase_list_cron_groups` - List cron groups
- `hookbase_get_cron_group` - Get a cron group
- `hookbase_create_cron_group` - Create a cron group
- `hookbase_update_cron_group` - Rename / reorder / collapse a group
- `hookbase_delete_cron_group` - Delete a group (jobs become ungrouped)

#### API Pollers
For upstream APIs that only expose a REST endpoint to poll (no webhooks) — re-emits new/changed items as inbound events.
- `hookbase_list_api_pollers` - List API pollers
- `hookbase_get_api_poller` - Get a single poller
- `hookbase_create_api_poller` - Create a poller (schedule + target URL + response parsing)
- `hookbase_update_api_poller` - Update a poller
- `hookbase_delete_api_poller` - Delete a poller
- `hookbase_trigger_api_poller` - Manually run a poller immediately

#### Analytics
- `hookbase_get_analytics` - Get dashboard metrics

### Routing Primitives

These define the filters, transforms, and schemas you attach to routes via `filter_id`, `transform_id`, and `schema_id`.

#### Filters
- `hookbase_list_filters` - List filter definitions
- `hookbase_get_filter` - Get a filter with conditions
- `hookbase_create_filter` - Create a reusable filter
- `hookbase_update_filter` - Update name / conditions / logic
- `hookbase_delete_filter` - Delete a filter

#### Transforms
- `hookbase_list_transforms` - List transforms (JSONata / XSLT / Liquid / JS)
- `hookbase_get_transform` - Get a transform's source code
- `hookbase_create_transform` - Create a transform (server-side validated)
- `hookbase_update_transform` - Update a transform
- `hookbase_delete_transform` - Delete a transform
- `hookbase_test_transform` - Run a transform against a sample payload

#### Schemas
- `hookbase_list_schemas` - List JSON Schema definitions
- `hookbase_get_schema` - Get a schema
- `hookbase_create_schema` - Create a JSON Schema
- `hookbase_update_schema` - Update a schema
- `hookbase_delete_schema` - Delete a schema
- `hookbase_validate_against_schema` - Validate a payload against a stored schema

### Alerts & Notifications

#### Alert Rules
- `hookbase_list_alert_rules` - List alert rules
- `hookbase_get_alert_rule` - Get an alert rule
- `hookbase_create_alert_rule` - Create a rule (silence / failure rate / latency / volume / anomaly / schema drift)
- `hookbase_update_alert_rule` - Update a rule
- `hookbase_delete_alert_rule` - Delete a rule
- `hookbase_test_alert_rule` - Fire a test notification through all attached channels

#### Notification Channels
- `hookbase_list_notification_channels` - List channels (sensitive fields masked)
- `hookbase_get_notification_channel` - Get a channel
- `hookbase_create_notification_channel` - Create channel (email / slack / webhook / teams / pagerduty / discord)
- `hookbase_update_notification_channel` - Update name / config / active state
- `hookbase_delete_notification_channel` - Delete a channel

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
- `hookbase_update_event_type` - Update, deprecate, or publish/unpublish an event type to the public catalog
- `hookbase_delete_event_type` - Delete event type

#### Public Event Catalog
Read-only, unauthenticated docs surface for an org's published (`is_public`) event types — lets integrators browse event names/schemas without dashboard access.
- `hookbase_get_public_catalog` - List published event types (defaults to your org; any org_slug works)
- `hookbase_get_public_catalog_event_type` - Get schema + example payload for one published event type

#### Send Events & Track Messages
- `hookbase_send_event` - Send webhook event to subscribed endpoints
- `hookbase_list_outbound_messages` - List delivery records
- `hookbase_get_outbound_message` - Get message details
- `hookbase_get_message_attempts` - Get delivery attempt history
- `hookbase_replay_message` - Replay failed message
- `hookbase_get_outbound_stats` - Get delivery statistics by status

#### Webhook Analytics
- `hookbase_get_webhook_analytics` - Status counts, success rate, latency percentiles, top failing endpoints, error types, DLQ reasons, chart series
- `hookbase_get_webhook_endpoint_analytics` - Per-endpoint stats with circuit-breaker state and recent attempts

#### Operational Webhooks
Meta-webhooks, scoped to an application, that notify you of delivery-health events (exhausted messages, circuit breaker open/close, endpoint disabled) and optionally endpoint CRUD — separate from the application's actual outbound traffic.
- `hookbase_list_operational_webhooks` - List operational webhooks for an application
- `hookbase_get_operational_webhook` - Get details and delivery counters
- `hookbase_create_operational_webhook` - Create one (signing secret returned once)
- `hookbase_update_operational_webhook` - Update URL, subscribed events, or enabled state
- `hookbase_delete_operational_webhook` - Delete one
- `hookbase_get_operational_webhook_logs` - Get recent delivery logs
- `hookbase_test_operational_webhook` - Send a test event of every type
- `hookbase_rotate_operational_webhook_secret` - Rotate signing secret (no grace period)

### Org Administration

#### API Keys
- `hookbase_list_api_keys` - List API keys (key prefix only, never raw)
- `hookbase_create_api_key` - Create API key (raw key returned ONCE — store immediately)
- `hookbase_delete_api_key` - Revoke an API key

#### Audit Logs
- `hookbase_list_audit_logs` - Query org audit log entries with filters
- `hookbase_list_audit_log_actions` - List distinct action types in audit log
- `hookbase_list_audit_log_users` - List distinct users in audit log

#### Redaction Policies
Strip or mask sensitive fields from payloads before storage and/or delivery.
- `hookbase_list_redaction_policies` - List policies (optionally filter by source)
- `hookbase_get_redaction_policy` - Get a policy with its full ruleset
- `hookbase_create_redaction_policy` - Create a policy (rules: path / field_name / regex_value / header → redact / mask / hash / remove)
- `hookbase_update_redaction_policy` - Update a policy (PUT — full state)
- `hookbase_delete_redaction_policy` - Delete a policy
- `hookbase_preview_redaction_policy` - Preview a ruleset against a sample payload without saving

#### Scheduled Sends
One-shot HTTP requests scheduled for a future time.
- `hookbase_list_scheduled_sends` - List scheduled sends with status filter
- `hookbase_get_scheduled_send` - Get a scheduled send
- `hookbase_create_scheduled_send` - Schedule an HTTP request
- `hookbase_update_scheduled_send` - Update a pending scheduled send
- `hookbase_cancel_scheduled_send` - Cancel a pending or failed send
- `hookbase_send_scheduled_send_now` - Trigger immediately, ignoring scheduled_for

#### Test Webhook Bins
Ephemeral, anonymous webhook collectors for ad-hoc integration testing (not org-scoped — anyone with the bin ID can read).
- `hookbase_create_bin` - Create a new bin (rate-limited 10/IP/day)
- `hookbase_get_bin` - Get bin metadata + 50 most recent events
- `hookbase_list_bin_events` - Paginated event list (summary)
- `hookbase_get_bin_event` - Get a single event with full headers and body
- `hookbase_update_bin_response` - Configure the response the bin returns to incoming requests

#### Signature Testing
- `hookbase_verify_signature` - Check whether a webhook signature matches a payload and secret, using the same logic as inbound ingest verification

## Available Resources

In addition to tools, the server exposes read-only **resources** at stable URIs that AI assistants can fetch directly. Resources support listing, so clients can enumerate the available items per template.

- `hookbase://sources/{sourceId}/ingest-url` — Public ingest URL for an inbound source. POST a webhook body here to push it through the source's routes.
- `hookbase://tunnels/{tunnelId}/ws-url` — WebSocket URL for a tunnel client to connect to. **Embeds the tunnel auth token — treat as a secret.** If the token is no longer available, regenerate it via the tunnel API.
- `hookbase://endpoints/{endpointId}` — Outbound webhook endpoint metadata: URL, circuit-breaker state, lifetime delivery counters, and recent activity timestamps.

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

## Debugging with the MCP Inspector

Want to try the tools out before wiring the server into a client? The [MCP Inspector](https://github.com/modelcontextprotocol/inspector) opens a browser UI where you can list and call tools and read resources against your real org:

```bash
HOOKBASE_API_KEY=whr_... npx -y @modelcontextprotocol/inspector npx -y @hookbase/mcp-server
```

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
