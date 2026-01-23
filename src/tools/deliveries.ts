/**
 * Delivery tools for MCP server
 */

import { z } from 'zod';
import * as api from '../lib/api.js';

export const deliveryTools = [
  {
    name: 'hookbase_list_deliveries',
    description: 'Query webhook deliveries with optional filters. Deliveries represent attempts to forward webhooks to destinations.',
    inputSchema: z.object({
      limit: z.number().optional().describe('Maximum number of deliveries to return (default: 20, max: 100)'),
      offset: z.number().optional().describe('Number of deliveries to skip for pagination'),
      event_id: z.string().optional().describe('Filter by event ID'),
      destination_id: z.string().optional().describe('Filter by destination ID'),
      status: z.enum(['pending', 'success', 'failed', 'retrying']).optional().describe('Filter by delivery status'),
    }).strict(),
    handler: async (args: {
      limit?: number;
      offset?: number;
      event_id?: string;
      destination_id?: string;
      status?: string;
    }) => {
      const result = await api.getDeliveries({
        limit: args.limit,
        offset: args.offset,
        eventId: args.event_id,
        destinationId: args.destination_id,
        status: args.status,
      });
      if (result.error) {
        return { error: result.error };
      }
      return {
        deliveries: result.data?.deliveries.map(d => ({
          id: d.id,
          eventId: d.event_id,
          routeId: d.route_id,
          destinationId: d.destination_id,
          destinationName: d.destination_name,
          routeName: d.route_name,
          status: d.status,
          attemptCount: d.attempt_count,
          maxAttempts: d.max_attempts,
          responseStatus: d.response_status,
          responseTimeMs: d.response_time_ms,
          errorMessage: d.error_message,
          nextRetryAt: d.next_retry_at,
          completedAt: d.completed_at,
          createdAt: d.created_at,
        })),
        total: result.data?.total,
        hasMore: result.data?.hasMore,
      };
    },
  },
  {
    name: 'hookbase_get_delivery',
    description: 'Get detailed information about a specific delivery, including the response body and error details.',
    inputSchema: z.object({
      delivery_id: z.string().describe('The ID of the delivery to retrieve'),
    }).strict(),
    handler: async (args: { delivery_id: string }) => {
      const result = await api.getDelivery(args.delivery_id);
      if (result.error) {
        return { error: result.error };
      }
      const d = result.data?.delivery;
      return {
        delivery: d ? {
          id: d.id,
          eventId: d.event_id,
          routeId: d.route_id,
          destinationId: d.destination_id,
          destinationName: d.destination_name,
          routeName: d.route_name,
          status: d.status,
          attemptCount: d.attempt_count,
          maxAttempts: d.max_attempts,
          responseStatus: d.response_status,
          responseTimeMs: d.response_time_ms,
          responseBody: d.response_body,
          errorMessage: d.error_message,
          nextRetryAt: d.next_retry_at,
          completedAt: d.completed_at,
          createdAt: d.created_at,
        } : null,
      };
    },
  },
  {
    name: 'hookbase_replay_delivery',
    description: 'Retry a failed delivery. This will re-send the original webhook payload to the destination.',
    inputSchema: z.object({
      delivery_id: z.string().describe('The ID of the delivery to replay'),
    }).strict(),
    handler: async (args: { delivery_id: string }) => {
      const result = await api.replayDelivery(args.delivery_id);
      if (result.error) {
        return { error: result.error };
      }
      return {
        message: 'Delivery replayed successfully',
        delivery: result.data?.delivery ? {
          id: result.data.delivery.id,
          status: result.data.delivery.status,
          attemptCount: result.data.delivery.attempt_count,
        } : null,
      };
    },
  },
  {
    name: 'hookbase_bulk_replay',
    description: 'Retry multiple failed deliveries at once. Useful for recovering from destination outages.',
    inputSchema: z.object({
      delivery_ids: z.array(z.string()).min(1).max(100).describe('Array of delivery IDs to replay'),
    }).strict(),
    handler: async (args: { delivery_ids: string[] }) => {
      const result = await api.bulkReplayDeliveries(args.delivery_ids);
      if (result.error) {
        return { error: result.error };
      }
      return {
        message: `Replayed ${result.data?.replayed} deliveries`,
        replayed: result.data?.replayed,
        failed: result.data?.failed,
      };
    },
  },
];
