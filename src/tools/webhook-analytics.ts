/**
 * Outbound webhook analytics tools for MCP server
 */

import { z } from 'zod';
import * as api from '../lib/api.js';

const timeRangeEnum = z.enum(['1h', '24h', '7d', '30d']);

export const webhookAnalyticsTools = [
  {
    name: 'hookbase_get_webhook_analytics',
    description:
      'Get outbound webhook delivery analytics: status counts, success rate, latency percentiles, top failing endpoints, error type breakdown, DLQ reasons, and a time-bucketed chart series. Optionally filter by application_id and/or endpoint_id.',
    inputSchema: z.object({
      time_range: timeRangeEnum.optional().describe('Default "24h"'),
      application_id: z.string().optional(),
      endpoint_id: z.string().optional(),
    }).strict(),
    handler: async (args: { time_range?: api.WebhookAnalyticsTimeRange; application_id?: string; endpoint_id?: string }) => {
      const result = await api.getWebhookAnalytics({
        timeRange: args.time_range,
        applicationId: args.application_id,
        endpointId: args.endpoint_id,
      });
      if (result.error) return { error: result.error };
      return result.data;
    },
  },
  {
    name: 'hookbase_get_webhook_endpoint_analytics',
    description: 'Get analytics for a single outbound webhook endpoint: circuit-breaker state, lifetime totals, status counts, average response time, and the most recent 100 delivery attempts in the window.',
    inputSchema: z.object({
      endpoint_id: z.string(),
      time_range: timeRangeEnum.optional().describe('Default "24h"'),
    }).strict(),
    handler: async (args: { endpoint_id: string; time_range?: api.WebhookAnalyticsTimeRange }) => {
      const result = await api.getWebhookEndpointAnalytics(args.endpoint_id, args.time_range);
      if (result.error) return { error: result.error };
      return result.data;
    },
  },
];
