/**
 * Tunnel tools for MCP server
 */

import { z } from 'zod';
import * as api from '../lib/api.js';

export const tunnelTools = [
  {
    name: 'hookbase_list_tunnels',
    description: 'List all localhost tunnels in the organization. Tunnels allow forwarding webhooks to local development servers.',
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
          totalRequests: t.total_requests,
          lastConnectedAt: t.last_connected_at,
          createdAt: t.created_at,
        })),
      };
    },
  },
  {
    name: 'hookbase_create_tunnel',
    description: 'Create a new localhost tunnel. The tunnel can be connected using the Hookbase CLI to forward webhooks to your local server.',
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
    description: 'Check the connection status of a tunnel. Shows whether the tunnel is connected and live statistics.',
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
          totalRequests: t.total_requests,
          lastConnectedAt: t.last_connected_at,
        } : null,
        liveStatus: result.data?.liveStatus,
      };
    },
  },
  {
    name: 'hookbase_delete_tunnel',
    description: 'Delete a localhost tunnel.',
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
