/**
 * A2A (Agent2Agent Protocol, v1.0) Agent Card builder.
 *
 * Pure function, mirroring the api/ repo's buildXxx(...) convention for
 * discovery documents (apiCatalog.ts, authMd.ts). Field names/shapes here are
 * verified against the generated wire types in a2aproject/a2a-js v1.1.0
 * (proto3-JSON), not the informal spec prose — several fields (securityRequirements
 * vs. the old v0.3.0 "security", the oneof-keyed securitySchemes shape) differ
 * from what a casual reading of the spec text would suggest.
 */

export interface AgentInterface {
  url: string;
  protocolBinding: 'JSONRPC';
  protocolVersion: string;
}

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  tags: string[];
  inputModes?: string[];
  outputModes?: string[];
}

export interface AgentCapabilities {
  streaming: boolean;
  pushNotifications: boolean;
  extensions: unknown[];
  extendedAgentCard: boolean;
}

export interface AgentCard {
  name: string;
  description: string;
  version: string;
  supportedInterfaces: AgentInterface[];
  capabilities: AgentCapabilities;
  defaultInputModes: string[];
  defaultOutputModes: string[];
  skills: AgentSkill[];
  provider?: { url: string; organization: string };
  documentationUrl?: string;
  securitySchemes: Record<string, unknown>;
  securityRequirements: Array<{ schemes: Record<string, { list: string[] }> }>;
}

const BEARER_SCHEME_NAME = 'hookbaseApiKey';

/**
 * Builds the Agent Card. `mcpUrl` is the origin the card is served from
 * (mcp.hookbase.app) — the /a2a JSON-RPC endpoint lives at the same origin.
 */
export function buildAgentCard(mcpUrl: string, version: string, skills: AgentSkill[]): AgentCard {
  return {
    name: 'Hookbase',
    description: 'Read-only access to Hookbase webhook-relay deliveries and sources.',
    version,
    supportedInterfaces: [{ url: `${mcpUrl}/a2a`, protocolBinding: 'JSONRPC', protocolVersion: '1.0' }],
    capabilities: { streaming: false, pushNotifications: false, extensions: [], extendedAgentCard: false },
    defaultInputModes: ['application/json'],
    defaultOutputModes: ['application/json'],
    skills,
    provider: { url: 'https://hookbase.app', organization: 'Hookbase' },
    documentationUrl: 'https://hookbase.app/docs',
    securitySchemes: {
      [BEARER_SCHEME_NAME]: {
        httpAuthSecurityScheme: {
          scheme: 'Bearer',
          bearerFormat: 'whr_ API key',
          description: 'Hookbase API key (whr_...) — same credential used for the REST API and MCP server.',
        },
      },
    },
    securityRequirements: [{ schemes: { [BEARER_SCHEME_NAME]: { list: [] } } }],
  };
}
