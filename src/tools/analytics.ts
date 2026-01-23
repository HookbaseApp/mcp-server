/**
 * Analytics tools for MCP server
 */

import { z } from 'zod';
import * as api from '../lib/api.js';

export const analyticsTools = [
  {
    name: 'hookbase_get_analytics',
    description: 'Get dashboard analytics and metrics for the organization, including event counts, delivery success rates, and top sources/destinations.',
    inputSchema: z.object({
      range: z.enum(['1h', '24h', '7d', '30d']).optional().describe('Time range for analytics (default: 24h)'),
    }).strict(),
    handler: async (args: { range?: '1h' | '24h' | '7d' | '30d' }) => {
      const result = await api.getDashboardAnalytics(args.range || '24h');
      if (result.error) {
        return { error: result.error };
      }
      const data = result.data;
      return {
        range: args.range || '24h',
        overview: data?.overview ? {
          totalEvents: data.overview.totalEvents,
          totalDeliveries: data.overview.totalDeliveries,
          successfulDeliveries: data.overview.successfulDeliveries,
          failedDeliveries: data.overview.failedDeliveries,
          successRate: `${(data.overview.successRate * 100).toFixed(1)}%`,
          avgResponseTime: `${data.overview.avgResponseTime.toFixed(0)}ms`,
        } : null,
        topSources: data?.topSources?.map(s => ({
          id: s.id,
          name: s.name,
          slug: s.slug,
          eventCount: s.eventCount,
        })),
        topDestinations: data?.topDestinations?.map(d => ({
          id: d.id,
          name: d.name,
          deliveryCount: d.deliveryCount,
          successRate: `${(d.successRate * 100).toFixed(1)}%`,
        })),
        eventsByHour: data?.eventsByHour,
        deliveriesByStatus: data?.deliveriesByStatus,
      };
    },
  },
];
