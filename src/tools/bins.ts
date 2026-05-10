/**
 * Test webhook bin tools for MCP server.
 *
 * Bins are ephemeral, anonymous webhook collectors at /api/bin — useful for
 * quickly capturing requests during integration testing. They are NOT
 * org-scoped: anyone with the binId can read/post to it.
 */

import { z } from 'zod';
import * as api from '../lib/api.js';

export const binTools = [
  {
    name: 'hookbase_create_bin',
    description: 'Create a new test webhook bin. Returns a public ingest URL that captures any HTTP request sent to it. Bins expire after a fixed TTL. Rate-limited to 10 per IP per day.',
    inputSchema: z.object({}).strict(),
    handler: async () => {
      const result = await api.createBin();
      if (result.error) return { error: result.error };
      return result.data;
    },
  },
  {
    name: 'hookbase_get_bin',
    description: 'Get a bin\'s metadata, current event count, configured response, and the 50 most recent captured events (summary form).',
    inputSchema: z.object({ bin_id: z.string() }).strict(),
    handler: async (args: { bin_id: string }) => {
      const result = await api.getBin(args.bin_id);
      if (result.error) return { error: result.error };
      return result.data;
    },
  },
  {
    name: 'hookbase_list_bin_events',
    description: 'List captured events in a bin (summary view, paginated). Use hookbase_get_bin_event for a single event\'s headers and body.',
    inputSchema: z.object({
      bin_id: z.string(),
      limit: z.number().int().min(1).max(100).optional().describe('Default 50'),
      offset: z.number().int().min(0).optional(),
    }).strict(),
    handler: async (args: { bin_id: string; limit?: number; offset?: number }) => {
      const result = await api.getBinEvents(args.bin_id, { limit: args.limit, offset: args.offset });
      if (result.error) return { error: result.error };
      return result.data;
    },
  },
  {
    name: 'hookbase_get_bin_event',
    description: 'Get a single bin event with full headers and body. Body is fetched from R2 if it was offloaded.',
    inputSchema: z.object({
      bin_id: z.string(),
      event_id: z.string(),
    }).strict(),
    handler: async (args: { bin_id: string; event_id: string }) => {
      const result = await api.getBinEvent(args.bin_id, args.event_id);
      if (result.error) return { error: result.error };
      return result.data;
    },
  },
  {
    name: 'hookbase_update_bin_response',
    description: 'Configure the response a bin returns to incoming webhook requests. status_code clamped to 100–599, body capped at 10KB. Useful for simulating different upstream behavior during integration testing.',
    inputSchema: z.object({
      bin_id: z.string(),
      status_code: z.number().int().min(100).max(599).optional().describe('Default 200'),
      headers: z.record(z.string(), z.string()).optional(),
      body: z.string().max(10000).optional(),
    }).strict(),
    handler: async (args: { bin_id: string; status_code?: number; headers?: Record<string, string>; body?: string }) => {
      const result = await api.updateBinResponse(args.bin_id, {
        statusCode: args.status_code,
        headers: args.headers,
        body: args.body,
      });
      if (result.error) return { error: result.error };
      return result.data;
    },
  },
];
