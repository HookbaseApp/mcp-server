/**
 * Route tools for MCP server
 */

import { z } from 'zod';
import * as api from '../lib/api.js';

const filterConditionSchema = z.object({
  field: z.string().describe('JSON path to the field (e.g., "body.event", "headers.x-event-type")'),
  operator: z.enum(['equals', 'not_equals', 'contains', 'starts_with', 'ends_with', 'exists', 'not_exists', 'greater_than', 'less_than', 'regex'])
    .describe('Comparison operator for the filter condition'),
  value: z.string().optional().describe('Value to compare against (not needed for exists/not_exists)'),
}).strict();

export const routeTools = [
  {
    name: 'hookbase_list_routes',
    description: 'List all routes in the organization. Routes connect sources to destinations and define how webhooks are processed.',
    inputSchema: z.object({}).strict(),
    handler: async () => {
      const result = await api.getRoutes();
      if (result.error) {
        return { error: result.error };
      }
      return {
        routes: result.data?.routes.map(r => ({
          id: r.id,
          name: r.name,
          sourceId: r.source_id,
          sourceName: r.source_name,
          destinationId: r.destination_id,
          destinationName: r.destination_name,
          filterId: r.filter_id,
          transformId: r.transform_id,
          priority: r.priority,
          isActive: r.is_active === 1,
          deliveryCount: r.delivery_count ?? 0,
          createdAt: r.created_at,
        })),
      };
    },
  },
  {
    name: 'hookbase_get_route',
    description: 'Get detailed information about a specific route, including filter and transform configuration.',
    inputSchema: z.object({
      route_id: z.string().describe('The ID of the route to retrieve'),
    }).strict(),
    handler: async (args: { route_id: string }) => {
      const result = await api.getRoute(args.route_id);
      if (result.error) {
        return { error: result.error };
      }
      const r = result.data?.route;
      return {
        route: r ? {
          id: r.id,
          name: r.name,
          sourceId: r.source_id,
          sourceName: r.source_name,
          destinationId: r.destination_id,
          destinationName: r.destination_name,
          filterId: r.filter_id,
          transformId: r.transform_id,
          schemaId: r.schema_id,
          priority: r.priority,
          isActive: r.is_active === 1,
          deliveryCount: r.delivery_count ?? 0,
          createdAt: r.created_at,
        } : null,
      };
    },
  },
  {
    name: 'hookbase_create_route',
    description: 'Create a new route connecting a source to a destination. Optionally add filters to control which webhooks are forwarded.',
    inputSchema: z.object({
      name: z.string().describe('Display name for the route'),
      source_id: z.string().describe('ID of the source to receive webhooks from'),
      destination_id: z.string().describe('ID of the destination to forward webhooks to'),
      filter_id: z.string().optional().describe('ID of an existing filter to apply'),
      filter_conditions: z.object({
        logic: z.enum(['AND', 'OR']).describe('How to combine conditions'),
        conditions: z.array(filterConditionSchema).describe('Filter conditions to evaluate'),
      }).strict().optional().describe('Inline filter conditions (alternative to filter_id)'),
      transform_id: z.string().optional().describe('ID of a transform to apply to the payload'),
      priority: z.number().optional().describe('Route priority (lower = higher priority, default: 0)'),
      is_active: z.boolean().optional().describe('Whether the route is active (default: true)'),
    }).strict(),
    handler: async (args: {
      name: string;
      source_id: string;
      destination_id: string;
      filter_id?: string;
      filter_conditions?: { logic: 'AND' | 'OR'; conditions: api.FilterCondition[] };
      transform_id?: string;
      priority?: number;
      is_active?: boolean;
    }) => {
      const result = await api.createRoute({
        name: args.name,
        sourceId: args.source_id,
        destinationId: args.destination_id,
        filterId: args.filter_id,
        filterConditions: args.filter_conditions,
        transformId: args.transform_id,
        priority: args.priority,
        isActive: args.is_active,
      });
      if (result.error) {
        return { error: result.error };
      }
      const r = result.data?.route;
      return {
        message: 'Route created successfully',
        route: r ? {
          id: r.id,
          name: r.name,
          sourceId: r.source_id,
          destinationId: r.destination_id,
        } : null,
      };
    },
  },
  {
    name: 'hookbase_update_route',
    description: 'Update an existing route configuration.',
    inputSchema: z.object({
      route_id: z.string().describe('The ID of the route to update'),
      name: z.string().optional().describe('New display name'),
      source_id: z.string().optional().describe('New source ID'),
      destination_id: z.string().optional().describe('New destination ID'),
      filter_id: z.string().nullable().optional().describe('Filter ID (set to null to remove)'),
      transform_id: z.string().nullable().optional().describe('Transform ID (set to null to remove)'),
      priority: z.number().optional().describe('Route priority'),
      is_active: z.boolean().optional().describe('Enable or disable the route'),
    }).strict(),
    handler: async (args: {
      route_id: string;
      name?: string;
      source_id?: string;
      destination_id?: string;
      filter_id?: string | null;
      transform_id?: string | null;
      priority?: number;
      is_active?: boolean;
    }) => {
      const result = await api.updateRoute(args.route_id, {
        name: args.name,
        sourceId: args.source_id,
        destinationId: args.destination_id,
        filterId: args.filter_id,
        transformId: args.transform_id,
        priority: args.priority,
        isActive: args.is_active,
      });
      if (result.error) {
        return { error: result.error };
      }
      return { message: 'Route updated successfully', route: result.data?.route };
    },
  },
  {
    name: 'hookbase_delete_route',
    description: 'Delete a route.',
    inputSchema: z.object({
      route_id: z.string().describe('The ID of the route to delete'),
    }).strict(),
    handler: async (args: { route_id: string }) => {
      const result = await api.deleteRoute(args.route_id);
      if (result.error) {
        return { error: result.error };
      }
      return { message: 'Route deleted successfully' };
    },
  },
];
