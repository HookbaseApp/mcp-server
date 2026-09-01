/**
 * Tunnel tools for MCP server
 */

import { z } from 'zod';
import * as api from '../lib/api.js';

export const tunnelTools = [
  {
    name: 'hookbase_list_tunnels',
    description: 'List all localhost tunnels in the organization. A tunnel exposes a public URL that forwards webhooks to a developer\'s local machine once connected via the Hookbase CLI. This list only shows the last-known status; use hookbase_get_tunnel_status for a tunnel\'s current live connection state.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: z.object({}).strict(),
    handler: async () => {
      const result = await api.getTunnels();
      if (result.error) {
        return { error: result.error };
      }
      return {
        tunnels: result.data?.tunnels.map(t => ({
          id: t.id,
          name: t.name,
          subdomain: t.subdomain,
          status: t.status,
          totalRequests: t.totalRequests,
          lastConnectedAt: t.lastConnectedAt,
          createdAt: t.createdAt,
        })),
      };
    },
  },
  {
    name: 'hookbase_create_tunnel',
    description: 'Create a new localhost tunnel for local development — webhooks sent to the tunnel\'s public URL are forwarded to your machine once you connect with the Hookbase CLI (`hookbase tunnel connect <tunnel-id>`). Creating the tunnel only reserves the subdomain and URL; it stays disconnected until the CLI process actually connects. Use hookbase_get_tunnel_status afterward to confirm it is live.',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    inputSchema: z.object({
      name: z.string().describe('Display name for the tunnel'),
      subdomain: z.string().optional().describe('Custom subdomain (auto-generated if not provided)'),
    }).strict(),
    handler: async (args: { name: string; subdomain?: string }) => {
      const result = await api.createTunnel(args.name, args.subdomain);
      if (result.error) {
        return { error: result.error };
      }
      const t = result.data?.tunnel;
      return {
        message: 'Tunnel created successfully',
        tunnel: t ? {
          id: t.id,
          name: t.name,
          subdomain: t.subdomain,
        } : null,
        tunnelUrl: result.data?.tunnelUrl,
        wsUrl: result.data?.wsUrl,
        instructions: 'Use the Hookbase CLI to connect: hookbase tunnel connect <tunnel-id>',
      };
    },
  },
  {
    name: 'hookbase_get_tunnel_status',
    description: 'Check whether a tunnel\'s CLI connection is currently live, plus its request count and last-connected time. Use this to confirm a tunnel is actually receiving traffic after running `hookbase tunnel connect` — a tunnel can exist (hookbase_create_tunnel) without ever being connected.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: z.object({
      tunnel_id: z.string().describe('The ID of the tunnel to check'),
    }).strict(),
    handler: async (args: { tunnel_id: string }) => {
      const result = await api.getTunnelStatus(args.tunnel_id);
      if (result.error) {
        return { error: result.error };
      }
      const t = result.data?.tunnel;
      return {
        tunnel: t ? {
          id: t.id,
          name: t.name,
          subdomain: t.subdomain,
          status: t.status,
          totalRequests: t.totalRequests,
          lastConnectedAt: t.lastConnectedAt,
        } : null,
        liveStatus: result.data?.liveStatus,
      };
    },
  },
  {
    name: 'hookbase_delete_tunnel',
    description: 'Permanently delete a localhost tunnel — force-disconnects any live CLI connection immediately, frees its subdomain for reuse, and deletes its request log. This cannot be undone; any webhooks arriving afterward will fail to reach your local server.',
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    inputSchema: z.object({
      tunnel_id: z.string().describe('The ID of the tunnel to delete'),
    }).strict(),
    handler: async (args: { tunnel_id: string }) => {
      const result = await api.deleteTunnel(args.tunnel_id);
      if (result.error) {
        return { error: result.error };
      }
      return { message: 'Tunnel deleted successfully' };
    },
  },
];
