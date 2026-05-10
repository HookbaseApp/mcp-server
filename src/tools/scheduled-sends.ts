/**
 * Scheduled send tools for MCP server (one-shot future webhook sends)
 */

import { z } from 'zod';
import * as api from '../lib/api.js';

const statusEnum = z.enum(['pending', 'sending', 'sent', 'failed', 'cancelled']);

export const scheduledSendTools = [
  {
    name: 'hookbase_list_scheduled_sends',
    description: 'List one-shot scheduled HTTP sends. Optionally filter by status (pending | sending | sent | failed | cancelled). Paginated.',
    inputSchema: z.object({
      status: statusEnum.optional(),
      page: z.number().int().min(1).optional(),
      page_size: z.number().int().min(1).max(100).optional().describe('Default 20'),
    }).strict(),
    handler: async (args: { status?: api.ScheduledSendStatus; page?: number; page_size?: number }) => {
      const result = await api.getScheduledSends({
        status: args.status,
        page: args.page,
        pageSize: args.page_size,
      });
      if (result.error) return { error: result.error };
      return result.data;
    },
  },
  {
    name: 'hookbase_get_scheduled_send',
    description: 'Get a single scheduled send including its current status, response, and error info.',
    inputSchema: z.object({ send_id: z.string() }).strict(),
    handler: async (args: { send_id: string }) => {
      const result = await api.getScheduledSend(args.send_id);
      if (result.error) return { error: result.error };
      return { scheduledSend: result.data?.scheduledSend };
    },
  },
  {
    name: 'hookbase_create_scheduled_send',
    description:
      'Schedule a one-shot HTTP request to fire at a future time. URL must be http or https. scheduled_for must be a future ISO-8601 timestamp. Default method POST. headers and payload are arbitrary objects (JSON-encoded server-side).',
    inputSchema: z.object({
      url: z.string().url(),
      scheduled_for: z.string().describe('ISO-8601 timestamp; must be in the future'),
      name: z.string().max(200).optional(),
      description: z.string().max(1000).optional(),
      method: z.string().optional().describe('Default "POST"'),
      headers: z.record(z.string(), z.string()).optional(),
      payload: z.unknown().optional(),
      timezone: z.string().optional().describe('Default "UTC" — display only; scheduled_for is the source of truth'),
      max_attempts: z.number().int().min(1).max(10).optional().describe('Default 3'),
    }).strict(),
    handler: async (args: {
      url: string;
      scheduled_for: string;
      name?: string;
      description?: string;
      method?: string;
      headers?: Record<string, string>;
      payload?: unknown;
      timezone?: string;
      max_attempts?: number;
    }) => {
      const result = await api.createScheduledSend({
        url: args.url,
        scheduledFor: args.scheduled_for,
        name: args.name,
        description: args.description,
        method: args.method,
        headers: args.headers,
        payload: args.payload,
        timezone: args.timezone,
        maxAttempts: args.max_attempts,
      });
      if (result.error) return { error: result.error };
      return { message: 'Scheduled send created', scheduledSend: result.data?.scheduledSend };
    },
  },
  {
    name: 'hookbase_update_scheduled_send',
    description: 'Update a scheduled send. Only allowed while status is "pending". Pass any subset of fields to change.',
    inputSchema: z.object({
      send_id: z.string(),
      name: z.string().max(200).optional(),
      description: z.string().max(1000).optional(),
      url: z.string().url().optional(),
      method: z.string().optional(),
      headers: z.record(z.string(), z.string()).optional(),
      payload: z.unknown().optional(),
      scheduled_for: z.string().optional().describe('ISO-8601, must be in the future'),
      timezone: z.string().optional(),
      max_attempts: z.number().int().min(1).max(10).optional(),
    }).strict(),
    handler: async (args: {
      send_id: string;
      name?: string;
      description?: string;
      url?: string;
      method?: string;
      headers?: Record<string, string>;
      payload?: unknown;
      scheduled_for?: string;
      timezone?: string;
      max_attempts?: number;
    }) => {
      const result = await api.updateScheduledSend(args.send_id, {
        name: args.name,
        description: args.description,
        url: args.url,
        method: args.method,
        headers: args.headers,
        payload: args.payload,
        scheduledFor: args.scheduled_for,
        timezone: args.timezone,
        maxAttempts: args.max_attempts,
      });
      if (result.error) return { error: result.error };
      return { message: 'Scheduled send updated', scheduledSend: result.data?.scheduledSend };
    },
  },
  {
    name: 'hookbase_cancel_scheduled_send',
    description: 'Cancel a pending or failed scheduled send. Sent or already-cancelled sends cannot be cancelled.',
    inputSchema: z.object({ send_id: z.string() }).strict(),
    handler: async (args: { send_id: string }) => {
      const result = await api.cancelScheduledSend(args.send_id);
      if (result.error) return { error: result.error };
      return { message: 'Scheduled send cancelled' };
    },
  },
  {
    name: 'hookbase_send_scheduled_send_now',
    description: 'Trigger a pending or failed scheduled send immediately, bypassing its scheduled_for time. Returns the live HTTP response status and latency.',
    inputSchema: z.object({ send_id: z.string() }).strict(),
    handler: async (args: { send_id: string }) => {
      const result = await api.sendScheduledSendNow(args.send_id);
      if (result.error) return { error: result.error };
      return result.data;
    },
  },
];
