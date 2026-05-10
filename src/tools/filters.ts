/**
 * Filter tools for MCP server
 */

import { z } from 'zod';
import * as api from '../lib/api.js';

const operatorEnum = z.enum([
  'equals',
  'not_equals',
  'contains',
  'starts_with',
  'ends_with',
  'exists',
  'not_exists',
  'greater_than',
  'less_than',
  'regex',
]);

const conditionSchema = z.object({
  field: z.string().describe('Dot-path into the payload (e.g. "data.amount")'),
  operator: operatorEnum,
  value: z.unknown().optional().describe('Comparison value (omit for exists/not_exists)'),
});

export const filterTools = [
  {
    name: 'hookbase_list_filters',
    description: 'List filter definitions in the organization. Filters are reusable condition sets attached to routes to gate which events are delivered.',
    inputSchema: z.object({
      page: z.number().optional(),
      page_size: z.number().optional().describe('Page size (max 100)'),
    }).strict(),
    handler: async (args: { page?: number; page_size?: number }) => {
      const result = await api.getFilters({ page: args.page, pageSize: args.page_size });
      if (result.error) return { error: result.error };
      return { filters: result.data?.filters, pagination: result.data?.pagination };
    },
  },
  {
    name: 'hookbase_get_filter',
    description: 'Get a filter definition including its conditions and AND/OR logic.',
    inputSchema: z.object({
      filter_id: z.string().describe('Filter ID or slug'),
    }).strict(),
    handler: async (args: { filter_id: string }) => {
      const result = await api.getFilter(args.filter_id);
      if (result.error) return { error: result.error };
      return { filter: result.data?.filter };
    },
  },
  {
    name: 'hookbase_create_filter',
    description: 'Create a reusable filter that can be attached to routes. A filter evaluates a list of conditions (combined via AND or OR) against incoming event payloads.',
    inputSchema: z.object({
      name: z.string(),
      description: z.string().optional(),
      slug: z.string().optional().describe('URL-safe identifier (auto-derived from name if omitted)'),
      conditions: z.array(conditionSchema).min(1),
      logic: z.enum(['AND', 'OR']).optional().describe('How conditions combine (default AND)'),
    }).strict(),
    handler: async (args: {
      name: string;
      description?: string;
      slug?: string;
      conditions: Array<{ field: string; operator: api.FilterOperator; value?: unknown }>;
      logic?: 'AND' | 'OR';
    }) => {
      const result = await api.createFilter(args);
      if (result.error) return { error: result.error };
      return { message: 'Filter created', filter: result.data?.filter };
    },
  },
  {
    name: 'hookbase_update_filter',
    description: 'Update a filter\'s name, description, conditions, or logic. Pass only the fields you want to change.',
    inputSchema: z.object({
      filter_id: z.string(),
      name: z.string().optional(),
      description: z.string().nullable().optional(),
      conditions: z.array(conditionSchema).optional(),
      logic: z.enum(['AND', 'OR']).optional(),
    }).strict(),
    handler: async (args: {
      filter_id: string;
      name?: string;
      description?: string | null;
      conditions?: Array<{ field: string; operator: api.FilterOperator; value?: unknown }>;
      logic?: 'AND' | 'OR';
    }) => {
      const { filter_id, ...rest } = args;
      const result = await api.updateFilter(filter_id, rest);
      if (result.error) return { error: result.error };
      return { message: 'Filter updated' };
    },
  },
  {
    name: 'hookbase_delete_filter',
    description: 'Delete a filter. Routes referencing it will have the reference cleared.',
    inputSchema: z.object({
      filter_id: z.string(),
    }).strict(),
    handler: async (args: { filter_id: string }) => {
      const result = await api.deleteFilter(args.filter_id);
      if (result.error) return { error: result.error };
      return { message: 'Filter deleted' };
    },
  },
];
