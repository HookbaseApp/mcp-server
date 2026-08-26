/**
 * API Poller tools for MCP server
 *
 * For upstream APIs that don't push webhooks -- only expose a REST endpoint
 * to poll -- lets an org schedule a poll and have each new/changed item
 * re-emitted as a normal inbound event on one of their sources.
 */

import { z } from 'zod';
import * as api from '../lib/api.js';

export const apiPollerTools = [
  {
    name: 'hookbase_list_api_pollers',
    description: 'List all API pollers in the organization. Pollers make scheduled HTTP requests to a third-party API and re-emit new/changed items as inbound events.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: z.object({}).strict(),
    handler: async () => {
      const result = await api.getApiPollers();
      if (result.error) return { error: result.error };
      return { apiPollers: result.data?.apiPollers ?? [] };
    },
  },
  {
    name: 'hookbase_get_api_poller',
    description: 'Get full details for a single API poller, including its schedule, target URL, response parsing config, and last-run status.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: z.object({
      poller_id: z.string().describe('API poller ID'),
    }).strict(),
    handler: async (args: { poller_id: string }) => {
      const result = await api.getApiPoller(args.poller_id);
      if (result.error) return { error: result.error };
      return { apiPoller: result.data?.apiPoller };
    },
  },
  {
    name: 'hookbase_create_api_poller',
    description: 'Create a new API poller. On each scheduled run it makes an HTTP request to url, extracts a list of items from the JSON response (response_path), and emits each new item as an event on source_id. Items are deduped across runs by id_field.',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    inputSchema: z.object({
      name: z.string().describe('Display name for the poller'),
      source_id: z.string().describe('ID of the source to emit polled items into. The source must be provider "custom" (or have no signing secret) since polled items are signed with a generic HMAC scheme.'),
      url: z.string().url().describe('URL to poll'),
      cron_expression: z.string().describe('Cron expression for the poll schedule (e.g., "*/15 * * * *" for every 15 minutes)'),
      description: z.string().optional().describe('Optional description'),
      http_method: z.enum(['GET', 'POST', 'PUT']).optional().describe('HTTP method (default: GET)'),
      headers: z.record(z.string(), z.string()).optional().describe('Custom headers to include (e.g., an Authorization header)'),
      response_path: z.string().optional().describe('Dot path to the array of items within the JSON response body (e.g., "data.items"); omit if the response is itself the array'),
      id_field: z.string().optional().describe('Field on each item used to dedupe across runs (default: "id")'),
      event_type_field: z.string().optional().describe('Field on each item to use as the emitted event type; falls back to default_event_type when absent'),
      default_event_type: z.string().optional().describe('Event type to use when event_type_field is absent or unset on an item (default: "item.polled")'),
      timezone: z.string().optional().describe('Timezone for the cron schedule (default: UTC)'),
      is_active: z.boolean().optional().describe('Whether the poller runs on its schedule (default: true)'),
    }).strict(),
    handler: async (args: {
      name: string;
      source_id: string;
      url: string;
      cron_expression: string;
      description?: string;
      http_method?: string;
      headers?: Record<string, string>;
      response_path?: string;
      id_field?: string;
      event_type_field?: string;
      default_event_type?: string;
      timezone?: string;
      is_active?: boolean;
    }) => {
      const result = await api.createApiPoller({
        name: args.name,
        sourceId: args.source_id,
        url: args.url,
        cronExpression: args.cron_expression,
        description: args.description,
        httpMethod: args.http_method,
        headers: args.headers,
        responsePath: args.response_path,
        idField: args.id_field,
        eventTypeField: args.event_type_field,
        defaultEventType: args.default_event_type,
        timezone: args.timezone,
        isActive: args.is_active,
      });
      if (result.error) return { error: result.error };
      return { message: 'API poller created successfully', apiPoller: result.data?.apiPoller };
    },
  },
  {
    name: 'hookbase_update_api_poller',
    description: 'Update an API poller. Pass only the fields you want to change.',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: z.object({
      poller_id: z.string(),
      name: z.string().optional(),
      description: z.string().nullable().optional(),
      source_id: z.string().optional(),
      url: z.string().url().optional(),
      cron_expression: z.string().optional(),
      http_method: z.enum(['GET', 'POST', 'PUT']).optional(),
      headers: z.record(z.string(), z.string()).nullable().optional(),
      response_path: z.string().nullable().optional(),
      id_field: z.string().optional(),
      event_type_field: z.string().nullable().optional(),
      default_event_type: z.string().optional(),
      timezone: z.string().optional(),
      is_active: z.boolean().optional(),
    }).strict(),
    handler: async (args: {
      poller_id: string;
      name?: string;
      description?: string | null;
      source_id?: string;
      url?: string;
      cron_expression?: string;
      http_method?: string;
      headers?: Record<string, string> | null;
      response_path?: string | null;
      id_field?: string;
      event_type_field?: string | null;
      default_event_type?: string;
      timezone?: string;
      is_active?: boolean;
    }) => {
      const result = await api.updateApiPoller(args.poller_id, {
        name: args.name,
        description: args.description,
        sourceId: args.source_id,
        url: args.url,
        cronExpression: args.cron_expression,
        httpMethod: args.http_method,
        headers: args.headers,
        responsePath: args.response_path,
        idField: args.id_field,
        eventTypeField: args.event_type_field,
        defaultEventType: args.default_event_type,
        timezone: args.timezone,
        isActive: args.is_active,
      });
      if (result.error) return { error: result.error };
      return { message: 'API poller updated', apiPoller: result.data?.apiPoller };
    },
  },
  {
    name: 'hookbase_delete_api_poller',
    description: 'Delete an API poller. Does not affect the source it fed or events it already emitted.',
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    inputSchema: z.object({
      poller_id: z.string().describe('The ID of the API poller to delete'),
    }).strict(),
    handler: async (args: { poller_id: string }) => {
      const result = await api.deleteApiPoller(args.poller_id);
      if (result.error) return { error: result.error };
      return { message: 'API poller deleted successfully' };
    },
  },
  {
    name: 'hookbase_trigger_api_poller',
    description: 'Manually run an API poller immediately, regardless of its schedule. Makes a real HTTP request to the poller\'s target URL and emits any new items as events; never delays or skips the next scheduled run.',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    inputSchema: z.object({
      poller_id: z.string().describe('The ID of the API poller to trigger'),
    }).strict(),
    handler: async (args: { poller_id: string }) => {
      const result = await api.triggerApiPoller(args.poller_id);
      if (result.error) return { error: result.error };
      return { result: result.data?.result };
    },
  },
];
