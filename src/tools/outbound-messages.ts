/**
 * Outbound message tools for MCP server
 * Send events and track delivery messages
 */

import { z } from 'zod';
import * as api from '../lib/api.js';

export const outboundMessageTools = [
  {
    name: 'hookbase_send_event',
    description: 'Send a webhook event to all subscribed endpoints. The event is queued for delivery to matching subscriptions. Use labels for filtering which subscriptions receive the event.',
    inputSchema: z.object({
      event_type: z.string().describe('Event type name (e.g., "order.created")'),
      payload: z.unknown().describe('Event payload (any JSON-serializable data)'),
      application_id: z.string().optional().describe('Target a specific application only'),
      endpoint_id: z.string().optional().describe('Target a specific endpoint only'),
      idempotency_key: z.string().optional().describe('Unique key to prevent duplicate delivery'),
      labels: z.record(z.string()).optional().describe('Labels for filtering subscriptions (e.g., {"environment": "production", "region": "us-east"})'),
      metadata: z.record(z.unknown()).optional().describe('Additional metadata for the event'),
    }).strict(),
    handler: async (args: {
      event_type: string;
      payload: unknown;
      application_id?: string;
      endpoint_id?: string;
      idempotency_key?: string;
      labels?: Record<string, string>;
      metadata?: Record<string, unknown>;
    }) => {
      const result = await api.sendOutboundEvent({
        eventType: args.event_type,
        payload: args.payload,
        applicationId: args.application_id,
        endpointId: args.endpoint_id,
        idempotencyKey: args.idempotency_key,
        labels: args.labels,
        metadata: args.metadata,
      });
      if (result.error) {
        return { error: result.error };
      }
      return {
        message: 'Event sent successfully',
        eventId: result.data?.data.eventId,
        messagesQueued: result.data?.data.messagesQueued,
        endpoints: result.data?.data.endpoints,
      };
    },
  },
  {
    name: 'hookbase_list_outbound_messages',
    description: 'List outbound message delivery records. Messages track the delivery status of each event to each endpoint.',
    inputSchema: z.object({
      status: z.enum(['pending', 'processing', 'success', 'failed', 'exhausted']).optional().describe('Filter by delivery status'),
      event_type: z.string().optional().describe('Filter by event type name'),
      application_id: z.string().optional().describe('Filter by application ID'),
      endpoint_id: z.string().optional().describe('Filter by endpoint ID'),
      limit: z.number().optional().describe('Maximum number of results (default 50, max 100)'),
      cursor: z.string().optional().describe('Pagination cursor for next page'),
    }).strict(),
    handler: async (args: {
      status?: 'pending' | 'processing' | 'success' | 'failed' | 'exhausted';
      event_type?: string;
      application_id?: string;
      endpoint_id?: string;
      limit?: number;
      cursor?: string;
    }) => {
      const result = await api.getOutboundMessages({
        status: args.status,
        eventType: args.event_type,
        applicationId: args.application_id,
        endpointId: args.endpoint_id,
        limit: args.limit,
        cursor: args.cursor,
      });
      if (result.error) {
        return { error: result.error };
      }
      return {
        messages: result.data?.data?.map(msg => ({
          id: msg.id,
          eventId: msg.eventId,
          eventType: msg.eventType,
          applicationId: msg.applicationId,
          applicationName: msg.applicationName,
          endpointId: msg.endpointId,
          endpointUrl: msg.endpointUrl,
          status: msg.status,
          attempts: msg.attempts,
          maxAttempts: msg.maxAttempts,
          lastResponseStatus: msg.lastResponseStatus,
          lastErrorMessage: msg.lastErrorMessage,
          createdAt: msg.createdAt,
          completedAt: msg.completedAt,
        })) ?? [],
        pagination: result.data?.pagination,
      };
    },
  },
  {
    name: 'hookbase_get_outbound_message',
    description: 'Get detailed information about an outbound message delivery.',
    inputSchema: z.object({
      message_id: z.string().describe('The ID of the message'),
    }).strict(),
    handler: async (args: { message_id: string }) => {
      const result = await api.getOutboundMessage(args.message_id);
      if (result.error) {
        return { error: result.error };
      }
      return { outboundMessage: result.data?.data };
    },
  },
  {
    name: 'hookbase_get_message_attempts',
    description: 'Get the delivery attempt history for an outbound message. Shows each attempt with response details.',
    inputSchema: z.object({
      message_id: z.string().describe('The ID of the message'),
    }).strict(),
    handler: async (args: { message_id: string }) => {
      const result = await api.getOutboundMessageAttempts(args.message_id);
      if (result.error) {
        return { error: result.error };
      }
      return {
        attempts: result.data?.data?.map(attempt => ({
          id: attempt.id,
          attemptNumber: attempt.attemptNumber,
          status: attempt.status,
          responseStatus: attempt.responseStatus,
          responseTimeMs: attempt.responseTimeMs,
          responseBody: attempt.responseBody,
          errorMessage: attempt.errorMessage,
          createdAt: attempt.createdAt,
        })) ?? [],
      };
    },
  },
  {
    name: 'hookbase_replay_message',
    description: 'Replay a failed or exhausted message. Creates a new delivery attempt for the original event payload.',
    inputSchema: z.object({
      message_id: z.string().describe('The ID of the message to replay'),
    }).strict(),
    handler: async (args: { message_id: string }) => {
      const result = await api.replayOutboundMessage(args.message_id);
      if (result.error) {
        return { error: result.error };
      }
      return {
        message: 'Message queued for replay',
        originalMessageId: result.data?.data.originalMessageId,
        newMessageId: result.data?.data.newMessageId,
        status: result.data?.data.status,
      };
    },
  },
  {
    name: 'hookbase_get_outbound_stats',
    description: 'Get delivery statistics for outbound webhooks. Shows counts by status (pending, success, failed, etc.).',
    inputSchema: z.object({}).strict(),
    handler: async () => {
      const result = await api.getOutboundStats();
      if (result.error) {
        return { error: result.error };
      }
      return {
        stats: result.data?.data,
      };
    },
  },
];
