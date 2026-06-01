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
  {
    name: 'hookbase_replay_with_edit',
    description:
      'Replay a failed delivery with one-shot overrides. Use this to recover from a broken transform, ' +
      'a wrong destination URL, or a missing header without permanently changing the route. Set persist_transform=true ' +
      'to save the new transform code to the route after a successful replay. Always replay one delivery first as a probe ' +
      'before bulk replays — the response includes the new delivery ID so you can poll its status.',
    inputSchema: z.object({
      delivery_id: z.string().describe('The ID of the original failed delivery to replay'),
      modified_payload: z.unknown().optional().describe('Edited payload to use instead of the original event payload'),
      destination_override: z.string().optional().describe(
        'Destination id or slug to send the replay to instead of the route\'s normal destination. Must belong to the same organization.',
      ),
      transform_override: z.object({
        code: z.string().describe('The new transform code (JSONata or JavaScript). Max 64KB.'),
        type: z.enum(['jsonata', 'javascript']).optional().describe('Transform language (default: route\'s current type)'),
        input_format: z.string().optional(),
        output_format: z.string().optional(),
      }).optional().describe('One-shot transform applied to this replay only, unless persist_transform=true'),
      headers_override: z.record(z.string(), z.string()).optional().describe(
        'Outbound HTTP headers to send instead of/in addition to the destination\'s configured headers. ' +
        'Cannot set host, content-length, transfer-encoding, or connection. Max 50 entries.',
      ),
      persist_transform: z.boolean().optional().describe(
        'When true and transform_override is set, the new code is saved to the route\'s transform after replay. ' +
        'Only works when the route already has a transform attached.',
      ),
    }).strict(),
    handler: async (args: {
      delivery_id: string;
      modified_payload?: unknown;
      destination_override?: string;
      transform_override?: { code: string; type?: string; input_format?: string; output_format?: string };
      headers_override?: Record<string, string>;
      persist_transform?: boolean;
    }) => {
      const transformOverride = args.transform_override ? {
        code: args.transform_override.code,
        type: args.transform_override.type,
        inputFormat: args.transform_override.input_format,
        outputFormat: args.transform_override.output_format,
      } : undefined;
      const result = await api.replayDeliveryWithEdit(args.delivery_id, {
        modifiedPayload: args.modified_payload,
        destinationOverride: args.destination_override,
        transformOverride,
        headersOverride: args.headers_override,
        persistTransform: args.persist_transform,
      });
      if (result.error) {
        return { error: result.error };
      }
      return result.data;
    },
  },
  {
    name: 'hookbase_list_delivery_clusters',
    description:
      'List recent failure clusters — distinct failure patterns aggregated by fingerprint (route + destination + status + normalized error). ' +
      'Use this as the entry point when investigating an incident: one cluster row = one root cause, regardless of how many deliveries failed. ' +
      'Returns up to 100 clusters in the chosen time window.',
    inputSchema: z.object({
      since_hours: z.number().int().min(1).max(24 * 30).optional().describe('Window in hours (default 24, max 720 / 30 days)'),
      limit: z.number().int().min(1).max(200).optional().describe('Max clusters to return (default 50)'),
    }).strict(),
    handler: async (args: { since_hours?: number; limit?: number }) => {
      const result = await api.listDeliveryClusters({
        sinceHours: args.since_hours,
        limit: args.limit,
      });
      if (result.error) {
        return { error: result.error };
      }
      return {
        since: result.data?.since,
        sinceHours: result.data?.sinceHours,
        clusters: result.data?.clusters.map(c => ({
          fingerprint: c.fingerprint,
          count: c.count,
          affectedEventCount: c.affectedEventCount,
          firstSeen: c.firstSeen,
          lastSeen: c.lastSeen,
          sampleDeliveryId: c.sampleDeliveryId,
          routeName: c.routeName,
          destinationName: c.destinationName,
          responseStatus: c.responseStatus,
          errorMessageExcerpt: c.errorMessageExcerpt,
          rcaCategory: c.rcaCategory,
        })),
      };
    },
  },
  {
    name: 'hookbase_replay_cluster',
    description:
      'Replay every failed delivery matching a cluster fingerprint with one round trip. ' +
      'Same override shape as hookbase_replay_with_edit. Use this after diagnosing a cluster with hookbase_list_delivery_clusters ' +
      'and probing the fix on a single delivery with hookbase_replay_with_edit. ' +
      'persist_transform requires every delivery in the cluster to share a single route.',
    inputSchema: z.object({
      fingerprint: z.string().describe('The cluster fingerprint hash returned by hookbase_list_delivery_clusters'),
      destination_override: z.string().optional(),
      transform_override: z.object({
        code: z.string(),
        type: z.enum(['jsonata', 'javascript']).optional(),
        input_format: z.string().optional(),
        output_format: z.string().optional(),
      }).optional(),
      headers_override: z.record(z.string(), z.string()).optional(),
      persist_transform: z.boolean().optional(),
      limit: z.number().int().min(1).max(2000).optional().describe('Max cluster deliveries to replay (default 500, hard cap 2000)'),
    }).strict(),
    handler: async (args: {
      fingerprint: string;
      destination_override?: string;
      transform_override?: { code: string; type?: string; input_format?: string; output_format?: string };
      headers_override?: Record<string, string>;
      persist_transform?: boolean;
      limit?: number;
    }) => {
      const transformOverride = args.transform_override ? {
        code: args.transform_override.code,
        type: args.transform_override.type,
        inputFormat: args.transform_override.input_format,
        outputFormat: args.transform_override.output_format,
      } : undefined;
      const result = await api.replayDeliveryCluster(args.fingerprint, {
        destinationOverride: args.destination_override,
        transformOverride,
        headersOverride: args.headers_override,
        persistTransform: args.persist_transform,
        limit: args.limit,
      });
      if (result.error) {
        return { error: result.error };
      }
      return result.data;
    },
  },
];
