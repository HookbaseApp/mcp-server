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
          totalEvents: data.overview.totalEvents ?? 0,
          totalDeliveries: data.overview.totalDeliveries ?? 0,
          successfulDeliveries: data.overview.successfulDeliveries ?? 0,
          failedDeliveries: data.overview.failedDeliveries ?? 0,
          successRate: data.overview.successRate != null ? `${(data.overview.successRate * 100).toFixed(1)}%` : 'N/A',
          avgResponseTime: data.overview.avgResponseTime != null ? `${data.overview.avgResponseTime.toFixed(0)}ms` : 'N/A',
        } : null,
        topSources: data?.topSources?.map(s => ({
          id: s.id,
          name: s.name,
          slug: s.slug,
          eventCount: s.eventCount ?? 0,
        })),
        topDestinations: data?.topDestinations?.map(d => ({
          id: d.id,
          name: d.name,
          deliveryCount: d.deliveryCount ?? 0,
          successRate: d.successRate != null ? `${(d.successRate * 100).toFixed(1)}%` : 'N/A',
        })),
        eventsByHour: data?.eventsByHour,
        deliveriesByStatus: data?.deliveriesByStatus,
      };
    },
  },
];
