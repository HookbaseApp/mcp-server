/**
 * Source tools for MCP server
 */

import { z } from 'zod';
import * as api from '../lib/api.js';

export const sourceTools = [
  {
    name: 'hookbase_list_sources',
    description: 'List all webhook sources in the organization. Sources are endpoints that receive incoming webhooks.',
    inputSchema: z.object({}).strict(),
    handler: async () => {
      const result = await api.getSources();
      if (result.error) {
        return { error: result.error };
      }
      return {
        sources: result.data?.sources.map(s => ({
          id: s.id,
          name: s.name,
          slug: s.slug,
          provider: s.provider,
          isActive: s.is_active === 1,
          transientMode: s.transientMode ?? s.transient_mode === 1,
          eventCount: s.event_count ?? s.eventCount ?? 0,
          routeCount: s.route_count ?? s.routeCount ?? 0,
          createdAt: s.created_at,
        })),
      };
    },
  },
  {
    name: 'hookbase_get_source',
    description: 'Get detailed information about a specific webhook source, including its configuration and statistics.',
    inputSchema: z.object({
      source_id: z.string().describe('The ID of the source to retrieve'),
    }).strict(),
    handler: async (args: { source_id: string }) => {
      const result = await api.getSource(args.source_id);
      if (result.error) {
        return { error: result.error };
      }
      const s = result.data?.source;
      return {
        source: s ? {
          id: s.id,
          name: s.name,
          slug: s.slug,
          provider: s.provider,
          description: s.description,
          signingSecret: s.signing_secret,
          rejectInvalidSignatures: s.reject_invalid_signatures,
          rateLimitPerMinute: s.rate_limit_per_minute,
          isActive: s.is_active === 1,
          transientMode: s.transientMode ?? s.transient_mode === 1,
          eventCount: s.event_count ?? s.eventCount ?? 0,
          routeCount: s.route_count ?? s.routeCount ?? 0,
          createdAt: s.created_at,
        } : null,
      };
    },
  },
  {
    name: 'hookbase_create_source',
    description: 'Create a new webhook source. Sources receive incoming webhooks and can be connected to destinations via routes.',
    inputSchema: z.object({
      name: z.string().describe('Display name for the source'),
      slug: z.string().describe('URL-safe identifier (e.g., "github-webhooks")'),
      provider: z.string().optional().describe('Webhook provider for signature verification (e.g., "github", "stripe", "shopify")'),
      description: z.string().optional().describe('Optional description of the source'),
      reject_invalid_signatures: z.boolean().optional().describe('Whether to reject webhooks with invalid signatures'),
      rate_limit_per_minute: z.number().optional().describe('Maximum webhooks per minute (rate limiting)'),
      transient_mode: z.boolean().optional().describe('Enable transient mode - payloads never stored at rest (HIPAA/GDPR compliance). Disables replay and payload viewing.'),
    }).strict(),
    handler: async (args: {
      name: string;
      slug: string;
      provider?: string;
      description?: string;
      reject_invalid_signatures?: boolean;
      rate_limit_per_minute?: number;
      transient_mode?: boolean;
    }) => {
      const result = await api.createSource(args.name, args.slug, args.provider, {
        description: args.description,
        rejectInvalidSignatures: args.reject_invalid_signatures,
        rateLimitPerMinute: args.rate_limit_per_minute,
        transientMode: args.transient_mode,
      });
      if (result.error) {
        return { error: result.error };
      }
      const s = result.data?.source;
      return {
        message: 'Source created successfully',
        source: s ? {
          id: s.id,
          name: s.name,
          slug: s.slug,
          provider: s.provider,
          signingSecret: s.signing_secret,
        } : null,
      };
    },
  },
  {
    name: 'hookbase_update_source',
    description: 'Update an existing webhook source configuration.',
    inputSchema: z.object({
      source_id: z.string().describe('The ID of the source to update'),
      name: z.string().optional().describe('New display name'),
      description: z.string().optional().describe('New description'),
      is_active: z.boolean().optional().describe('Enable or disable the source'),
      provider: z.string().optional().describe('Update webhook provider'),
      reject_invalid_signatures: z.boolean().optional().describe('Whether to reject invalid signatures'),
      rate_limit_per_minute: z.number().optional().describe('Maximum webhooks per minute'),
      transient_mode: z.boolean().optional().describe('Enable transient mode - payloads never stored at rest (HIPAA/GDPR compliance)'),
    }).strict(),
    handler: async (args: {
      source_id: string;
      name?: string;
      description?: string;
      is_active?: boolean;
      provider?: string;
      reject_invalid_signatures?: boolean;
      rate_limit_per_minute?: number;
      transient_mode?: boolean;
    }) => {
      const result = await api.updateSource(args.source_id, {
        name: args.name,
        description: args.description,
        isActive: args.is_active,
        provider: args.provider,
        rejectInvalidSignatures: args.reject_invalid_signatures,
        rateLimitPerMinute: args.rate_limit_per_minute,
        transientMode: args.transient_mode,
      });
      if (result.error) {
        return { error: result.error };
      }
      return { message: 'Source updated successfully', source: result.data?.source };
    },
  },
  {
    name: 'hookbase_delete_source',
    description: 'Delete a webhook source. This will also delete all associated routes.',
    inputSchema: z.object({
      source_id: z.string().describe('The ID of the source to delete'),
    }).strict(),
    handler: async (args: { source_id: string }) => {
      const result = await api.deleteSource(args.source_id);
      if (result.error) {
        return { error: result.error };
      }
      return { message: 'Source deleted successfully' };
    },
  },
];
