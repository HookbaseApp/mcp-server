/**
 * MCP Resources for Hookbase.
 *
 * Resources expose stable, addressable URIs that AI assistants can read
 * directly without going through a tool call. They are read-only.
 *
 *   hookbase://sources/{sourceId}/ingest-url    Public ingest URL for a source
 *   hookbase://tunnels/{tunnelId}/ws-url        Tunnel WebSocket URL (with auth token)
 *   hookbase://endpoints/{endpointId}           Outbound webhook endpoint metadata
 */

import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
  ReadResourceTemplateCallback,
  ResourceMetadata,
} from '@modelcontextprotocol/sdk/server/mcp.js';
import * as api from '../lib/api.js';
import { getConfig } from '../lib/config.js';

interface ResourceDef {
  name: string;
  template: ResourceTemplate;
  metadata: ResourceMetadata;
  read: ReadResourceTemplateCallback;
}

function jsonContents(uri: URL, value: unknown) {
  return {
    contents: [
      {
        uri: uri.href,
        mimeType: 'application/json',
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

export const hookbaseResources: ResourceDef[] = [
  {
    name: 'hookbase_source_ingest_url',
    template: new ResourceTemplate('hookbase://sources/{sourceId}/ingest-url', {
      list: async () => {
        const result = await api.getSources();
        const sources = result.data?.sources ?? [];
        return {
          resources: sources.map((s) => ({
            uri: `hookbase://sources/${s.id}/ingest-url`,
            name: `Ingest URL: ${s.name}`,
            description: `Public webhook ingest URL for source "${s.slug}"`,
            mimeType: 'application/json',
          })),
        };
      },
    }),
    metadata: {
      description:
        'Public ingest URL for an inbound source. POST a webhook payload here to deliver it through the source\'s configured routes.',
      mimeType: 'application/json',
    },
    read: async (uri, variables) => {
      const sourceId = String(variables.sourceId);
      const { apiUrl, orgSlug } = getConfig();
      const result = await api.getSource(sourceId);
      if (result.error || !result.data) {
        return jsonContents(uri, { error: result.error ?? 'Source not found' });
      }
      const source = result.data.source;
      const ingestUrl = `${apiUrl}/ingest/${orgSlug}/${source.slug}`;
      return jsonContents(uri, {
        sourceId: source.id,
        sourceSlug: source.slug,
        sourceName: source.name,
        ingestUrl,
        method: 'POST',
        notes:
          'Send the raw webhook body. If the source has a signing secret, include the provider\'s expected signature header so the request is verified.',
      });
    },
  },
  {
    name: 'hookbase_tunnel_ws_url',
    template: new ResourceTemplate('hookbase://tunnels/{tunnelId}/ws-url', {
      list: async () => {
        const result = await api.getTunnels();
        const tunnels = result.data?.tunnels ?? [];
        return {
          resources: tunnels.map((t) => ({
            uri: `hookbase://tunnels/${t.id}/ws-url`,
            name: `Tunnel WS: ${t.name}`,
            description: `WebSocket connection URL for tunnel "${t.subdomain}"`,
            mimeType: 'application/json',
          })),
        };
      },
    }),
    metadata: {
      description:
        'WebSocket URL a tunnel client connects to in order to receive forwarded requests. Embeds the tunnel\'s auth token — treat it as a secret.',
      mimeType: 'application/json',
    },
    read: async (uri, variables) => {
      const tunnelId = String(variables.tunnelId);
      const { apiUrl } = getConfig();
      const result = await api.getTunnel(tunnelId);
      if (result.error || !result.data) {
        return jsonContents(uri, { error: result.error ?? 'Tunnel not found' });
      }
      const tunnel = result.data.tunnel;
      if (!tunnel.auth_token) {
        return jsonContents(uri, {
          tunnelId: tunnel.id,
          subdomain: tunnel.subdomain,
          error:
            'auth_token not returned for this tunnel. Use hookbase tunnel regenerate to obtain a new wsUrl.',
        });
      }
      const host = apiUrl.replace(/^https?:\/\//, '');
      const wsUrl = `wss://${host}/tunnels/${tunnel.subdomain}/ws?tunnelId=${tunnel.id}&token=${tunnel.auth_token}`;
      return jsonContents(uri, {
        tunnelId: tunnel.id,
        name: tunnel.name,
        subdomain: tunnel.subdomain,
        status: tunnel.status,
        wsUrl,
        warning: 'wsUrl contains the tunnel auth token. Do not log or share it.',
      });
    },
  },
  {
    name: 'hookbase_outbound_endpoint',
    template: new ResourceTemplate('hookbase://endpoints/{endpointId}', {
      list: async () => {
        const result = await api.getWebhookEndpoints();
        const endpoints = result.data?.data ?? [];
        return {
          resources: endpoints.map((e) => ({
            uri: `hookbase://endpoints/${e.id}`,
            name: `Endpoint: ${e.url}`,
            description:
              e.description?.toString() ??
              `Outbound webhook endpoint for application ${e.applicationId}`,
            mimeType: 'application/json',
          })),
        };
      },
    }),
    metadata: {
      description:
        'Outbound webhook endpoint metadata: URL, circuit-breaker state, lifetime delivery counters, and recent activity timestamps.',
      mimeType: 'application/json',
    },
    read: async (uri, variables) => {
      const endpointId = String(variables.endpointId);
      const result = await api.getWebhookEndpoint(endpointId);
      if (result.error || !result.data) {
        return jsonContents(uri, { error: result.error ?? 'Endpoint not found' });
      }
      return jsonContents(uri, result.data.data);
    },
  },
];
