/**
 * MCP Server Card (SEP-2127 / io.modelcontextprotocol/server-card extension).
 *
 * Pure function, mirroring the a2a/agent-card.ts and api/ repo's buildXxx(...)
 * convention for discovery documents. Field shape verified against the
 * ratified extension's schema.ts (modelcontextprotocol/experimental-ext-server-card),
 * not the informal "serverInfo/capabilities/endpoint" shape some pre-ratification
 * blog posts and scanners describe — the ratified spec deliberately excludes
 * primitive capabilities (tools/resources/prompts) from the static card since
 * they vary by auth/session and must be discovered live via tools/list etc.
 *
 * Reserved location per the spec is `<streamable-http-url>/server-card`
 * (served here as GET /mcp/server-card); this repo also mirrors the document
 * at /.well-known/mcp/server-card.json, an unreserved path, for discovery
 * tooling that looks there.
 */

export interface ServerCardRemote {
  type: 'streamable-http' | 'sse';
  url: string;
  supportedProtocolVersions: string[];
}

export interface ServerCardRepository {
  url: string;
  source: string;
}

export interface ServerCard {
  $schema: string;
  name: string;
  version: string;
  description: string;
  title?: string;
  websiteUrl?: string;
  repository?: ServerCardRepository;
  remotes: ServerCardRemote[];
}

const SCHEMA_URL = 'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json';
const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

/**
 * Builds the Server Card. `mcpUrl` is the origin the card is served from
 * (mcp.hookbase.app) — the /mcp Streamable HTTP endpoint lives at the same origin.
 */
export function buildServerCard(mcpUrl: string, version: string): ServerCard {
  return {
    $schema: SCHEMA_URL,
    name: 'app.hookbase/mcp',
    version,
    description: 'Webhook relay: manage sources, destinations, routes, deliveries, and tunnels.',
    title: 'Hookbase',
    websiteUrl: 'https://hookbase.app',
    repository: { url: 'https://github.com/HookbaseApp/mcp-server', source: 'github' },
    remotes: [
      {
        type: 'streamable-http',
        url: `${mcpUrl}/mcp`,
        supportedProtocolVersions: SUPPORTED_PROTOCOL_VERSIONS,
      },
    ],
  };
}
