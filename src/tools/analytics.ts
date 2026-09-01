/**
 * Analytics tools for MCP server
 */

import { z } from 'zod';
import * as api from '../lib/api.js';

export const analyticsTools = [
  {
    name: 'hookbase_get_analytics',
    description: 'Get organization-wide dashboard metrics: event and delivery counts, delivery success rate, average response time, top sources/destinations by volume, and a delivery timeline, over the chosen time range (default 24h). This is aggregate, org-level reporting — for one endpoint\'s outbound-webhook stats use hookbase_get_webhook_endpoint_analytics, and for a single source/destination/delivery\'s own detail use hookbase_get_source / hookbase_get_destination / hookbase_get_delivery instead.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: z.object({
      range: z.enum(['1h', '24h', '7d', '30d']).optional().describe('Time range for analytics (default: 24h)'),
    }).strict(),
    handler: async (args: { range?: '1h' | '24h' | '7d' | '30d' }) => {
      const result = await api.getDashboardAnalytics(args.range || '24h');
      if (result.error) {
        return { error: result.error };
      }
      const data = result.data;
      // The dashboard endpoint returns snake_case OverviewStats and sources/destinations/timeline
      // collections. totalDeliveries and successRate are derived; success_rate is already 0-100.
      const successful = data?.overview?.successful_deliveries ?? 0;
      const failed = data?.overview?.failed_deliveries ?? 0;
      const totalDeliveries = successful + failed;
      return {
        range: args.range || '24h',
        overview: data?.overview ? {
          totalEvents: data.overview.total_events ?? 0,
          totalDeliveries,
          successfulDeliveries: successful,
          failedDeliveries: failed,
          successRate: totalDeliveries > 0 ? `${(successful / totalDeliveries * 100).toFixed(1)}%` : 'N/A',
          avgResponseTime: data.overview.avg_latency != null ? `${data.overview.avg_latency.toFixed(0)}ms` : 'N/A',
        } : null,
        topSources: data?.sources?.map(s => ({
          id: s.id,
          name: s.name,
          slug: s.slug,
          eventCount: s.event_count ?? 0,
        })),
        topDestinations: data?.destinations?.map(d => ({
          id: d.id,
          name: d.name,
          deliveryCount: d.total_deliveries ?? 0,
          successRate: d.success_rate != null ? `${d.success_rate.toFixed(1)}%` : 'N/A',
        })),
        eventsByHour: data?.timeline,
        deliveriesByStatus: data?.retries?.distribution,
      };
    },
  },
];
