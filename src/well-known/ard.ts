/**
 * Agentic Resource Discovery (ARD) manifest — https://agenticresourcediscovery.org/spec/
 *
 * Lists the agentic resources this Worker actually serves — the MCP server and the A2A agent —
 * so discovery services can index them. Each entry references the card that already describes it
 * (`url`), so the manifest never restates details that could drift from the cards themselves.
 *
 * Served at /.well-known/ard.json (the spec's path) and at /.well-known/ai-catalog.json, its
 * predecessor path, which the spec says consumers treat as an equivalent entry source.
 * `specVersion` and `host` are the predecessor (AI Catalog 1.0) envelope, which consumers of
 * ai-catalog.json validate; ARD ignores top-level members other than `entries`, so one document
 * satisfies both.
 */

export interface ArdEntry {
  identifier: string;
  displayName: string;
  type: string;
  url: string;
  description: string;
  version: string;
  representativeQueries: string[];
  capabilities?: string[];
  tags?: string[];
}

export interface ArdManifest {
  specVersion: '1.0';
  host: { identifier: string; displayName: string };
  entries: ArdEntry[];
}

/**
 * `origin` is the origin this Worker serves from (https://mcp.hookbase.app); `a2aSkillIds` are
 * the agent card's skill ids, passed in so the two documents always agree.
 */
export function buildArdManifest(origin: string, version: string, a2aSkillIds: string[]): ArdManifest {
  return {
    specVersion: '1.0',
    host: { identifier: 'hookbase.app', displayName: 'Hookbase' },
    entries: [
      {
        identifier: 'urn:air:hookbase.app:mcp:hookbase',
        displayName: 'Hookbase MCP Server',
        type: 'application/mcp-server-card+json',
        url: `${origin}/mcp/server-card`,
        description:
          'Remote MCP server for Hookbase, a webhook relay: manage sources, destinations, routes, transforms, deliveries, replays and tunnels. Authenticates with a Hookbase API key (whr_) as a Bearer token.',
        version,
        representativeQueries: [
          'list my webhook sources and destinations',
          'why did my webhook delivery fail',
          'replay failed webhook deliveries',
          'route incoming Stripe webhooks to my API',
        ],
        tags: ['webhooks', 'webhook relay', 'integrations'],
      },
      {
        identifier: 'urn:air:hookbase.app:a2a:hookbase',
        displayName: 'Hookbase Agent',
        type: 'application/a2a-agent-card+json',
        url: `${origin}/.well-known/agent-card.json`,
        description:
          'A2A agent for Hookbase webhook delivery status: check a delivery, list recent deliveries, and list sources. Authenticates with a Hookbase API key (whr_) as a Bearer token.',
        version,
        representativeQueries: [
          'check the status of a webhook delivery',
          'show my recent webhook deliveries',
          'which webhook sources do I have',
        ],
        capabilities: a2aSkillIds,
        tags: ['webhooks', 'webhook relay'],
      },
    ],
  };
}
