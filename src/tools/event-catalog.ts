/**
 * Public event catalog tools for MCP server
 *
 * The catalog is Hookbase's unauthenticated docs surface for an org's
 * published event types (see hookbase_update_event_type's is_public flag).
 * These tools call that public endpoint directly by org slug — defaulting
 * to the caller's own org, but any org slug works, since the endpoint
 * requires no auth by design.
 */

import { z } from 'zod';
import * as api from '../lib/api.js';
import { getConfig } from '../lib/config.js';

export const eventCatalogTools = [
  {
    name: 'hookbase_get_public_catalog',
    description: 'List an organization\'s published event types as they appear in the public event catalog. Defaults to your own organization — pass org_slug to preview another org\'s catalog. Only event types marked is_public and is_enabled (see hookbase_update_event_type) appear here.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    inputSchema: z.object({
      org_slug: z.string().optional().describe('Organization slug to look up; defaults to your own organization'),
    }).strict(),
    handler: async (args: { org_slug?: string }) => {
      const orgSlug = args.org_slug ?? getConfig().orgSlug;
      const result = await api.getPublicCatalog(orgSlug);
      if (result.error) return { error: result.error };
      return result.data;
    },
  },
  {
    name: 'hookbase_get_public_catalog_event_type',
    description: 'Get full published detail (schema + example payload) for one event type from the public event catalog. Defaults to your own organization — pass org_slug to look up another org\'s catalog.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    inputSchema: z.object({
      event_type_name: z.string().describe('The event type name, e.g. "order.created"'),
      org_slug: z.string().optional().describe('Organization slug to look up; defaults to your own organization'),
    }).strict(),
    handler: async (args: { event_type_name: string; org_slug?: string }) => {
      const orgSlug = args.org_slug ?? getConfig().orgSlug;
      const result = await api.getPublicCatalogEventType(orgSlug, args.event_type_name);
      if (result.error) return { error: result.error };
      return result.data;
    },
  },
];
