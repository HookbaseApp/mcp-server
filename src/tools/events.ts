/**
 * Event tools for MCP server
 */

import { z } from 'zod';
import * as api from '../lib/api.js';
import { getConfig } from '../lib/config.js';

export const eventTools = [
  {
    name: 'hookbase_list_events',
    description: 'Query webhook events with optional filters. Events represent incoming webhooks received by sources.',
    inputSchema: z.object({
      limit: z.number().optional().describe('Maximum number of events to return (default: 20, max: 100)'),
      offset: z.number().optional().describe('Number of events to skip for pagination'),
      source_id: z.string().optional().describe('Filter by source ID'),
      status: z.enum(['delivered', 'failed', 'pending', 'partial', 'no_routes']).optional().describe('Filter by delivery status'),
      from_date: z.string().optional().describe('Filter events after this date (ISO 8601)'),
      to_date: z.string().optional().describe('Filter events before this date (ISO 8601)'),
      search: z.string().optional().describe('Search in event payload'),
    }).strict(),
    handler: async (args: {
      limit?: number;
      offset?: number;
      source_id?: string;
      status?: string;
      from_date?: string;
      to_date?: string;
      search?: string;
    }) => {
      const result = await api.getEvents({
        limit: args.limit,
        offset: args.offset,
        sourceId: args.source_id,
        status: args.status,
        fromDate: args.from_date,
        toDate: args.to_date,
        search: args.search,
      });
      if (result.error) {
        return { error: result.error };
      }
      return {
        events: result.data?.events.map(e => ({
          id: e.id,
          sourceId: e.source_id,
          sourceName: e.source_name,
          eventType: e.event_type,
          method: e.method,
          payloadSize: e.payload_size,
          signatureValid: e.signature_valid,
          status: e.status,
          deliveryCount: e.delivery_count ?? 0,
          receivedAt: e.received_at,
        })),
        total: result.data?.total,
        hasMore: result.data?.hasMore,
      };
    },
  },
  {
    name: 'hookbase_get_event',
    description: 'Get detailed information about a specific event, including the full payload and all delivery attempts.',
    inputSchema: z.object({
      event_id: z.string().describe('The ID of the event to retrieve'),
    }).strict(),
    handler: async (args: { event_id: string }) => {
      const result = await api.getEvent(args.event_id);
      if (result.error) {
        return { error: result.error };
      }
      const e = result.data?.event;
      return {
        event: e ? {
          id: e.id,
          sourceId: e.source_id,
          sourceName: e.source_name,
          eventType: e.event_type,
          method: e.method,
          path: e.path,
          headers: e.headers,
          payload: e.payload,
          payloadSize: e.payload_size,
          signatureValid: e.signature_valid,
          status: e.status,
          deliveryCount: e.delivery_count ?? 0,
          receivedAt: e.received_at,
          deliveries: e.deliveries?.map(d => ({
            id: d.id,
            destinationName: d.destination_name,
            status: d.status,
            attemptCount: d.attempt_count,
            responseStatus: d.response_status,
            responseTimeMs: d.response_time_ms,
            errorMessage: d.error_message,
            completedAt: d.completed_at,
          })),
        } : null,
      };
    },
  },
  {
    name: 'hookbase_get_event_debug',
    description: 'Generate a cURL command to replay an event for debugging purposes.',
    inputSchema: z.object({
      event_id: z.string().describe('The ID of the event to generate cURL for'),
    }).strict(),
    handler: async (args: { event_id: string }) => {
      const result = await api.getEvent(args.event_id);
      if (result.error) {
        return { error: result.error };
      }
      const e = result.data?.event;
      if (!e) {
        return { error: 'Event not found' };
      }

      const config = getConfig();
      const sourceResult = await api.getSource(e.source_id);
      if (sourceResult.error) {
        return { error: `Failed to fetch source: ${sourceResult.error}` };
      }
      const source = sourceResult.data?.source;
      if (!source) {
        return { error: 'Source not found' };
      }

      // Build cURL command
      const ingestUrl = `${config.apiUrl}/ingest/${source.slug}`;
      let curlCmd = `curl -X ${e.method || 'POST'} '${ingestUrl}'`;

      // Add headers
      if (e.headers) {
        for (const [key, value] of Object.entries(e.headers)) {
          if (!key.toLowerCase().startsWith('x-forwarded') && key.toLowerCase() !== 'host') {
            curlCmd += ` \\\n  -H '${key}: ${value}'`;
          }
        }
      }

      // Add payload
      if (e.payload) {
        const payloadStr = typeof e.payload === 'string' ? e.payload : JSON.stringify(e.payload);
        curlCmd += ` \\\n  -d '${payloadStr.replace(/'/g, "'\\''")}'`;
      }

      return {
        eventId: e.id,
        sourceName: e.source_name,
        curl: curlCmd,
        note: 'This cURL command will replay the event through the ingest endpoint.',
      };
    },
  },
];
