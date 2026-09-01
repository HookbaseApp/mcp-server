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
    description: 'List all routes in the organization. A route connects one source to one destination and is what actually causes webhooks to be forwarded — a source and destination alone deliver nothing until a route links them. Use hookbase_get_route for one route\'s full filter/transform configuration.',
    inputSchema: z.object({}).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: async () => {
      const result = await api.getRoutes();
      if (result.error) {
        return { error: result.error };
      }
      return {
        routes: result.data?.routes.map(r => ({
          id: r.id,
          name: r.name,
          sourceId: r.sourceId,
          sourceName: r.sourceName,
          destinationId: r.destinationId,
          destinationName: r.destinationName,
          filterId: r.filterId,
          transformId: r.transformId,
          priority: r.priority,
          isActive: r.isActive,
          createdAt: r.createdAt,
        })),
      };
    },
  },
  {
    name: 'hookbase_get_route',
    description: 'Get full detail for a single route, including its filter, transform, and priority. Returns IDs for the source/destination/filter/transform it references — use hookbase_get_source, hookbase_get_destination, etc. to look up their own details.',
    inputSchema: z.object({
      route_id: z.string().describe('The ID of the route to retrieve'),
    }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
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
          sourceId: r.sourceId,
          sourceName: r.sourceName,
          destinationId: r.destinationId,
          // GET /:id spreads the raw fn_route_get row, which exposes destName (not destinationName).
          destinationName: r.destinationName ?? r.destName,
          filterId: r.filterId,
          transformId: r.transformId,
          schemaId: r.schemaId,
          priority: r.priority,
          isActive: r.isActive,
          createdAt: r.createdAt,
        } : null,
      };
    },
  },
  {
    name: 'hookbase_create_route',
    description: 'Create a new route connecting one source to one destination — this is what actually causes webhooks to be forwarded; a source and destination alone deliver nothing. The route is active immediately (is_active defaults to true) and starts matching newly incoming webhooks right away, not events already received before it existed. Optionally scope which webhooks are forwarded with filter_id (an existing, reusable filter) or filter_conditions (a one-off inline filter — pass at most one of the two), and reshape the payload in flight with transform_id. When multiple routes match the same event, priority controls delivery order (lower number = higher priority).',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
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
          sourceId: r.sourceId,
          destinationId: r.destinationId,
        } : null,
      };
    },
  },
  {
    name: 'hookbase_update_route',
    description: 'Update an existing route\'s source, destination, filter, transform, priority, or active state. Only the fields you provide are changed; omitted fields keep their current value. Changing source_id or destination_id repoints the route immediately, affecting the next incoming webhook — it does not retroactively re-deliver past events. Set is_active=false to pause forwarding without deleting the route or losing its delivery history; use hookbase_delete_route only when you want the route gone permanently.',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
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
    description: 'Permanently delete a route and its own delivery history — this cannot be undone. Does not affect the source, destination, filter, or transform it references, only the route linkage itself. To stop forwarding temporarily while keeping the route and its history, use hookbase_update_route with is_active=false instead.',
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
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
