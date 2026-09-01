/**
 * Event tools for MCP server
 */

import { z } from 'zod';
import * as api from '../lib/api.js';
import { getConfig } from '../lib/config.js';

export const eventTools = [
  {
    name: 'hookbase_list_events',
    description: 'Query webhook events with optional filters. An event is one inbound webhook received by a source, before routing — use hookbase_list_deliveries instead to see outbound forwarding attempts for an event. Results are sorted newest first and support pagination via limit/offset. search matches against the event payload only, not headers. For polling new events as they arrive, use hookbase_tail_events instead of repeatedly increasing offset here. Follow up on a specific row with hookbase_get_event for the full payload and its deliveries.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: z.object({
      limit: z.number().optional().describe('Maximum number of events to return (default: 50; no enforced maximum, but very large values may be slow)'),
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
          sourceId: e.sourceId,
          sourceName: e.sourceName,
          eventType: e.eventType,
          signatureValid: e.signatureValid,
          status: e.status,
          deliveryCount: e.deliveryStats?.total ?? 0,
          receivedAt: e.receivedAt,
        })),
        total: result.data?.total,
        hasMore: result.data?.hasMore,
      };
    },
  },
  {
    name: 'hookbase_tail_events',
    description: 'Poll for events newer than a previous call, for lightweight monitoring. Not a live stream (MCP tool calls are request/response, not push) - call it repeatedly, each time passing the newestReceivedAt from the prior response as since. Returns the most recent `limit` matching events at/after since, newest first; if more than `limit` new events arrived between polls, older ones within that window are omitted - poll more often or raise limit to avoid gaps. Omit since on the first call to get a starting snapshot.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: z.object({
      source_id: z.string().optional().describe('Filter to events from this source only'),
      since: z.string().optional().describe('ISO 8601 timestamp - only return events received at or after this time. Pass the previous response\'s newestReceivedAt to continue tailing forward. Omit for an initial snapshot of the most recent events.'),
      limit: z.number().optional().describe('Maximum number of events to return (default 25, cap 100)'),
    }).strict(),
    handler: async (args: { source_id?: string; since?: string; limit?: number }) => {
      const limit = Math.min(args.limit ?? 25, 100);
      const result = await api.getEvents({
        sourceId: args.source_id,
        fromDate: args.since,
        limit,
      });
      if (result.error) {
        return { error: result.error };
      }
      const events = result.data?.events ?? [];
      return {
        events: events.map(e => ({
          id: e.id,
          sourceId: e.sourceId,
          sourceName: e.sourceName,
          eventType: e.eventType,
          signatureValid: e.signatureValid,
          status: e.status,
          deliveryCount: e.deliveryStats?.total ?? 0,
          receivedAt: e.receivedAt,
        })),
        // Events come back newest-first; pass this as `since` on the next call to continue tailing.
        newestReceivedAt: events[0]?.receivedAt ?? args.since ?? null,
        truncated: result.data?.hasMore ?? false,
      };
    },
  },
  {
    name: 'hookbase_get_event',
    description: 'Get detailed information about a specific event, including the full payload and all delivery attempts.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: z.object({
      event_id: z.string().describe('The ID of the event to retrieve'),
    }).strict(),
    handler: async (args: { event_id: string }) => {
      const result = await api.getEvent(args.event_id);
      if (result.error) {
        return { error: result.error };
      }
      const e = result.data?.event;
      // payload and deliveries are top-level siblings of `event` on the response, not nested in it.
      const deliveries = result.data?.deliveries;
      return {
        event: e ? {
          id: e.id,
          sourceId: e.sourceId,
          sourceName: e.sourceName,
          eventType: e.eventType,
          headers: e.headers,
          payload: result.data?.payload,
          signatureValid: e.signatureValid,
          status: e.status,
          deliveryCount: deliveries?.length ?? 0,
          receivedAt: e.receivedAt,
          deliveries: deliveries?.map(d => ({
            id: d.id,
            destinationName: d.destinationName,
            status: d.status,
            attemptCount: d.attemptCount,
            responseStatus: d.responseStatus,
            responseTimeMs: d.latencyMs,
            errorMessage: d.errorMessage,
            completedAt: d.deliveredAt,
          })),
        } : null,
      };
    },
  },
  {
    name: 'hookbase_get_event_debug',
    description: 'Generate a cURL command that reproduces how an event originally arrived, for debugging. This is read-only — it makes no outbound calls itself. Running the generated command re-ingests the payload as a brand-new event; it does not replay or retry the original delivery (use hookbase_replay_delivery for that).',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: z.object({
      event_id: z.string().describe('The ID of the event to generate cURL for'),
    }).strict(),
    handler: async (args: { event_id: string }) => {
      const result = await api.getEvent(args.event_id);
      if (result.error) {
        return { error: result.error };
      }
      // The get-event API returns camelCase fields, and `payload` sits at the top level of
      // the response (a sibling of `event`), not inside it. Read that real shape instead of
      // the stale snake_case type — reading e.source_id gave `undefined`, which made this
      // tool fetch source "undefined" and 500.
      const data = result.data as {
        event?: { id?: string; sourceId?: string; sourceName?: string; headers?: Record<string, string> | string };
        payload?: unknown;
      } | undefined;
      const e = data?.event;
      if (!e) {
        return { error: 'Event not found' };
      }
      if (!e.sourceId) {
        return { error: 'Event has no associated source' };
      }

      const config = getConfig();
      const sourceResult = await api.getSource(e.sourceId);
      if (sourceResult.error) {
        return { error: `Failed to fetch source: ${sourceResult.error}` };
      }
      const source = sourceResult.data?.source;
      if (!source) {
        return { error: 'Source not found' };
      }

      // Build cURL reproducing how the event arrived. Ingest route: <METHOD> /ingest/:orgSlug/:sourceSlug.
      // `headers` comes back from the API as a JSON STRING — parse it first. (Iterating the raw
      // string enumerated it character-by-character and emitted ~89 junk `-H '0: {'` flags.)
      const ingestUrl = `${config.apiUrl}/ingest/${config.orgSlug}/${source.slug}`;
      const headers: Record<string, string> =
        typeof e.headers === 'string'
          ? ((): Record<string, string> => { try { return JSON.parse(e.headers as string); } catch { return {}; } })()
          : (e.headers ?? {});

      // Verb the webhook arrived with — ingest records it under the ':method' pseudo-header.
      const method = String(headers[':method'] || 'POST').toUpperCase();
      const bodiless = method === 'GET' || method === 'HEAD' || method === 'DELETE';

      // Drop pseudo-headers (':method' et al — stored metadata, not sendable) and hop-by-hop noise.
      const headerFlags = Object.entries(headers)
        .filter(([k]) => !k.startsWith(':')
          && !['host', 'content-length'].includes(k.toLowerCase())
          && !k.toLowerCase().startsWith('x-forwarded'))
        .map(([k, v]) => ` \\\n  -H '${k}: ${v}'`)
        .join('');

      const payload = data?.payload;
      let curlCmd: string;
      if (bodiless) {
        // Bodiless verbs carry their payload in the query string, not a request body.
        const qs = payload && typeof payload === 'object' && !Array.isArray(payload)
          ? new URLSearchParams(
              Object.entries(payload as Record<string, unknown>).flatMap(([k, v]) =>
                Array.isArray(v)
                  ? v.map((x) => [k, String(x)] as [string, string])
                  : [[k, String(v)] as [string, string]],
              ),
            ).toString()
          : '';
        curlCmd = `curl -X ${method} '${ingestUrl}${qs ? `?${qs}` : ''}'${headerFlags}`;
      } else {
        curlCmd = `curl -X ${method} '${ingestUrl}'${headerFlags}`;
        if (payload !== undefined && payload !== null) {
          const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
          curlCmd += ` \\\n  -d '${payloadStr.replace(/'/g, "'\\''")}'`;
        }
      }

      return {
        eventId: e.id,
        sourceName: e.sourceName,
        curl: curlCmd,
        note: 'Running this command re-ingests the payload as a new event; it does not replay or retry the original delivery.',
      };
    },
  },
];
