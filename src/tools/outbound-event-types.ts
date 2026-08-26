/**
 * Event type tools for MCP server
 * Define the types of events that can be sent via outbound webhooks
 */

import { z } from 'zod';
import * as api from '../lib/api.js';

export const eventTypeTools = [
  {
    name: 'hookbase_list_event_types',
    description: 'List event types defined in the organization. Event types define the different kinds of webhook events that can be sent.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: z.object({
      category: z.string().optional().describe('Filter by category'),
      is_enabled: z.boolean().optional().describe('Filter by enabled status'),
      search: z.string().optional().describe('Search by event type name'),
      limit: z.number().optional().describe('Maximum number of results (default 50, max 100)'),
      cursor: z.string().optional().describe('Pagination cursor for next page'),
    }).strict(),
    handler: async (args: {
      category?: string;
      is_enabled?: boolean;
      search?: string;
      limit?: number;
      cursor?: string;
    }) => {
      const result = await api.getEventTypes({
        category: args.category,
        isEnabled: args.is_enabled,
        search: args.search,
        limit: args.limit,
        cursor: args.cursor,
      });
      if (result.error) {
        return { error: result.error };
      }
      return {
        eventTypes: result.data?.data?.map(et => ({
          id: et.id,
          name: et.name,
          displayName: et.displayName,
          description: et.description,
          category: et.category,
          isEnabled: et.isEnabled === 1 || et.isEnabled === true,
          isDeprecated: et.isDeprecated === 1 || et.isDeprecated === true,
          isPublic: et.isPublic === 1 || et.isPublic === true,
          subscriptionCount: et.subscriptionCount,
          createdAt: et.createdAt,
        })) ?? [],
        pagination: result.data?.pagination,
      };
    },
  },
  {
    name: 'hookbase_get_event_type',
    description: 'Get detailed information about an event type, including its JSON schema and example payload.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: z.object({
      event_type_id: z.string().describe('The ID of the event type'),
    }).strict(),
    handler: async (args: { event_type_id: string }) => {
      const result = await api.getEventType(args.event_type_id);
      if (result.error) {
        return { error: result.error };
      }
      const et = result.data?.data;
      return {
        eventType: et ? {
          id: et.id,
          name: et.name,
          displayName: et.displayName,
          description: et.description,
          category: et.category,
          schema: et.schema,
          schemaVersion: et.schemaVersion,
          examplePayload: et.examplePayload,
          documentationUrl: et.documentationUrl,
          isEnabled: et.isEnabled === 1 || et.isEnabled === true,
          isDeprecated: et.isDeprecated === 1 || et.isDeprecated === true,
          deprecatedAt: et.deprecatedAt,
          deprecatedMessage: et.deprecatedMessage,
          isPublic: et.isPublic === 1 || et.isPublic === true,
          publishedAt: et.publishedAt,
          subscriptionCount: et.subscriptionCount,
          createdAt: et.createdAt,
          updatedAt: et.updatedAt,
        } : null,
      };
    },
  },
  {
    name: 'hookbase_create_event_type',
    description: 'Create a new event type. Event types define the structure and meaning of webhook events.',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    inputSchema: z.object({
      name: z.string().describe('Event type name (lowercase, dot-separated, e.g., "order.created")'),
      display_name: z.string().optional().describe('Human-readable name'),
      description: z.string().optional().describe('Description of when this event is triggered'),
      category: z.string().optional().describe('Category for grouping (e.g., "orders", "users")'),
      schema: z.string().optional().describe('JSON Schema for payload validation'),
      example_payload: z.string().optional().describe('Example payload as JSON string'),
      documentation_url: z.string().optional().describe('URL to event documentation'),
      is_enabled: z.boolean().optional().describe('Enable the event type (default true)'),
    }).strict(),
    handler: async (args: {
      name: string;
      display_name?: string;
      description?: string;
      category?: string;
      schema?: string;
      example_payload?: string;
      documentation_url?: string;
      is_enabled?: boolean;
    }) => {
      const result = await api.createEventType({
        name: args.name,
        displayName: args.display_name,
        description: args.description,
        category: args.category,
        schema: args.schema,
        examplePayload: args.example_payload,
        documentationUrl: args.documentation_url,
        isEnabled: args.is_enabled,
      });
      if (result.error) {
        return { error: result.error };
      }
      return {
        message: 'Event type created successfully',
        eventType: result.data?.data,
      };
    },
  },
  {
    name: 'hookbase_update_event_type',
    description: 'Update an event type. Deprecating it (is_deprecated) is advisory only — it does not block new subscriptions or stop delivery to existing ones; use is_enabled to actually disable it.',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: z.object({
      event_type_id: z.string().describe('The ID of the event type to update'),
      display_name: z.string().optional().describe('New human-readable name'),
      description: z.string().optional().describe('New description'),
      category: z.string().optional().describe('New category (null to remove)'),
      schema: z.string().optional().describe('New JSON Schema (null to remove)'),
      example_payload: z.string().optional().describe('New example payload (null to remove)'),
      documentation_url: z.string().optional().describe('New documentation URL (null to remove)'),
      is_enabled: z.boolean().optional().describe('Enable or disable the event type'),
      is_deprecated: z.boolean().optional().describe('Mark as deprecated'),
      deprecated_message: z.string().optional().describe('Message explaining deprecation'),
      is_public: z.boolean().optional().describe('Publish (true) or unpublish (false) this event type in the public event catalog (see hookbase_get_public_catalog)'),
    }).strict(),
    handler: async (args: {
      event_type_id: string;
      display_name?: string;
      description?: string;
      category?: string;
      schema?: string;
      example_payload?: string;
      documentation_url?: string;
      is_enabled?: boolean;
      is_deprecated?: boolean;
      deprecated_message?: string;
      is_public?: boolean;
    }) => {
      const result = await api.updateEventType(args.event_type_id, {
        displayName: args.display_name,
        description: args.description,
        category: args.category,
        schema: args.schema,
        examplePayload: args.example_payload,
        documentationUrl: args.documentation_url,
        isEnabled: args.is_enabled,
        isDeprecated: args.is_deprecated,
        deprecatedMessage: args.deprecated_message,
        isPublic: args.is_public,
      });
      if (result.error) {
        return { error: result.error };
      }
      return { message: 'Event type updated successfully', eventType: result.data?.data };
    },
  },
  {
    name: 'hookbase_delete_event_type',
    description: 'Delete an event type. Cascades to delete every subscription referencing it, so subscribed endpoints stop receiving these events immediately — not reversible.',
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    inputSchema: z.object({
      event_type_id: z.string().describe('The ID of the event type to delete'),
    }).strict(),
    handler: async (args: { event_type_id: string }) => {
      const result = await api.deleteEventType(args.event_type_id);
      if (result.error) {
        return { error: result.error };
      }
      return { message: 'Event type deleted successfully' };
    },
  },
];
