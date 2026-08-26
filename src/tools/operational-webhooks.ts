/**
 * Operational webhook tools for MCP server
 *
 * Operational webhooks are meta-webhooks scoped to a webhook application —
 * they notify the application owner of delivery-health events (exhausted
 * messages, circuit breaker state changes, endpoint disabled) and, if
 * subscribed, endpoint CRUD events, separately from the actual outbound
 * webhook traffic to that application's endpoints.
 */

import { z } from 'zod';
import * as api from '../lib/api.js';

export const operationalWebhookTools = [
  {
    name: 'hookbase_list_operational_webhooks',
    description: 'List operational webhooks configured for a webhook application.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: z.object({
      application_id: z.string().describe('The webhook application ID'),
    }).strict(),
    handler: async (args: { application_id: string }) => {
      const result = await api.getOperationalWebhooks(args.application_id);
      if (result.error) return { error: result.error };
      return { operationalWebhooks: result.data?.data ?? [] };
    },
  },
  {
    name: 'hookbase_get_operational_webhook',
    description: 'Get details for a single operational webhook, including delivery counters and last error.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: z.object({
      application_id: z.string().describe('The webhook application ID'),
      webhook_id: z.string().describe('The operational webhook ID'),
    }).strict(),
    handler: async (args: { application_id: string; webhook_id: string }) => {
      const result = await api.getOperationalWebhook(args.application_id, args.webhook_id);
      if (result.error) return { error: result.error };
      return { operationalWebhook: result.data?.data };
    },
  },
  {
    name: 'hookbase_create_operational_webhook',
    description: 'Create an operational webhook for an application. Returns a whsec_-prefixed signing secret shown only once — save it immediately.',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    inputSchema: z.object({
      application_id: z.string().describe('The webhook application ID'),
      url: z.string().url().describe('URL to notify (HTTPS required, except localhost for development)'),
      description: z.string().optional(),
      on_message_exhausted: z.boolean().optional().describe('Notify when a message exhausts all delivery attempts (default: true)'),
      on_circuit_breaker_open: z.boolean().optional().describe('Notify when an endpoint\'s circuit breaker opens (default: true)'),
      on_circuit_breaker_close: z.boolean().optional().describe('Notify when an endpoint\'s circuit breaker closes (default: false)'),
      on_endpoint_disabled: z.boolean().optional().describe('Notify when an endpoint is disabled (default: true)'),
      on_endpoint_created: z.boolean().optional().describe('Notify when an endpoint is created (default: false)'),
      on_endpoint_updated: z.boolean().optional().describe('Notify when an endpoint is updated (default: false)'),
      on_endpoint_deleted: z.boolean().optional().describe('Notify when an endpoint is deleted (default: false)'),
    }).strict(),
    handler: async (args: {
      application_id: string;
      url: string;
      description?: string;
      on_message_exhausted?: boolean;
      on_circuit_breaker_open?: boolean;
      on_circuit_breaker_close?: boolean;
      on_endpoint_disabled?: boolean;
      on_endpoint_created?: boolean;
      on_endpoint_updated?: boolean;
      on_endpoint_deleted?: boolean;
    }) => {
      const result = await api.createOperationalWebhook(args.application_id, {
        url: args.url,
        description: args.description,
        onMessageExhausted: args.on_message_exhausted,
        onCircuitBreakerOpen: args.on_circuit_breaker_open,
        onCircuitBreakerClose: args.on_circuit_breaker_close,
        onEndpointDisabled: args.on_endpoint_disabled,
        onEndpointCreated: args.on_endpoint_created,
        onEndpointUpdated: args.on_endpoint_updated,
        onEndpointDeleted: args.on_endpoint_deleted,
      });
      if (result.error) return { error: result.error };
      return {
        message: 'Operational webhook created — save the signing secret now, it will not be shown again',
        operationalWebhook: result.data?.data,
      };
    },
  },
  {
    name: 'hookbase_update_operational_webhook',
    description: 'Update an operational webhook\'s URL, description, subscribed event flags, or enabled state. Pass only the fields you want to change.',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: z.object({
      application_id: z.string().describe('The webhook application ID'),
      webhook_id: z.string().describe('The operational webhook ID'),
      url: z.string().url().optional(),
      description: z.string().nullable().optional(),
      on_message_exhausted: z.boolean().optional(),
      on_circuit_breaker_open: z.boolean().optional(),
      on_circuit_breaker_close: z.boolean().optional(),
      on_endpoint_disabled: z.boolean().optional(),
      on_endpoint_created: z.boolean().optional(),
      on_endpoint_updated: z.boolean().optional(),
      on_endpoint_deleted: z.boolean().optional(),
      is_enabled: z.boolean().optional(),
    }).strict(),
    handler: async (args: {
      application_id: string;
      webhook_id: string;
      url?: string;
      description?: string | null;
      on_message_exhausted?: boolean;
      on_circuit_breaker_open?: boolean;
      on_circuit_breaker_close?: boolean;
      on_endpoint_disabled?: boolean;
      on_endpoint_created?: boolean;
      on_endpoint_updated?: boolean;
      on_endpoint_deleted?: boolean;
      is_enabled?: boolean;
    }) => {
      const result = await api.updateOperationalWebhook(args.application_id, args.webhook_id, {
        url: args.url,
        description: args.description,
        onMessageExhausted: args.on_message_exhausted,
        onCircuitBreakerOpen: args.on_circuit_breaker_open,
        onCircuitBreakerClose: args.on_circuit_breaker_close,
        onEndpointDisabled: args.on_endpoint_disabled,
        onEndpointCreated: args.on_endpoint_created,
        onEndpointUpdated: args.on_endpoint_updated,
        onEndpointDeleted: args.on_endpoint_deleted,
        isEnabled: args.is_enabled,
      });
      if (result.error) return { error: result.error };
      return { message: 'Operational webhook updated', operationalWebhook: result.data?.data };
    },
  },
  {
    name: 'hookbase_delete_operational_webhook',
    description: 'Delete an operational webhook. Does not affect the application\'s actual outbound endpoints or traffic.',
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    inputSchema: z.object({
      application_id: z.string().describe('The webhook application ID'),
      webhook_id: z.string().describe('The operational webhook ID to delete'),
    }).strict(),
    handler: async (args: { application_id: string; webhook_id: string }) => {
      const result = await api.deleteOperationalWebhook(args.application_id, args.webhook_id);
      if (result.error) return { error: result.error };
      return { message: 'Operational webhook deleted successfully' };
    },
  },
  {
    name: 'hookbase_get_operational_webhook_logs',
    description: 'Get recent delivery logs for an operational webhook, for debugging why notifications aren\'t arriving.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: z.object({
      application_id: z.string().describe('The webhook application ID'),
      webhook_id: z.string().describe('The operational webhook ID'),
      limit: z.number().optional().describe('Maximum number of log entries (default 50, max 100)'),
    }).strict(),
    handler: async (args: { application_id: string; webhook_id: string; limit?: number }) => {
      const result = await api.getOperationalWebhookLogs(args.application_id, args.webhook_id, args.limit);
      if (result.error) return { error: result.error };
      return { logs: result.data?.data ?? [] };
    },
  },
  {
    name: 'hookbase_test_operational_webhook',
    description: 'Send a test event of every operational webhook type to verify connectivity and signature handling. Makes a real HTTP request to the configured URL for each type.',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    inputSchema: z.object({
      application_id: z.string().describe('The webhook application ID'),
      webhook_id: z.string().describe('The operational webhook ID to test'),
    }).strict(),
    handler: async (args: { application_id: string; webhook_id: string }) => {
      const result = await api.testOperationalWebhook(args.application_id, args.webhook_id);
      if (result.error) return { error: result.error };
      return result.data;
    },
  },
  {
    name: 'hookbase_rotate_operational_webhook_secret',
    description: 'Rotate the signing secret for an operational webhook. Takes effect immediately (no grace period) — the new secret is returned once and must be saved.',
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    inputSchema: z.object({
      application_id: z.string().describe('The webhook application ID'),
      webhook_id: z.string().describe('The operational webhook ID'),
    }).strict(),
    handler: async (args: { application_id: string; webhook_id: string }) => {
      const result = await api.rotateOperationalWebhookSecret(args.application_id, args.webhook_id);
      if (result.error) return { error: result.error };
      return {
        message: 'Signing secret rotated — save it now, it will not be shown again',
        secret: result.data?.data.secret,
      };
    },
  },
];
