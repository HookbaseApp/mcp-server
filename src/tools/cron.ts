/**
 * Cron job tools for MCP server
 */

import { z } from 'zod';
import * as api from '../lib/api.js';

export const cronTools = [
  {
    name: 'hookbase_list_cron_jobs',
    description: 'List all scheduled cron jobs in the organization. Cron jobs make HTTP requests on a schedule.',
    inputSchema: z.object({}).strict(),
    handler: async () => {
      const result = await api.getCronJobs();
      if (result.error) {
        return { error: result.error };
      }
      return {
        cronJobs: result.data?.cronJobs.map(j => ({
          id: j.id,
          name: j.name,
          description: j.description,
          cronExpression: j.cron_expression,
          timezone: j.timezone,
          url: j.url,
          method: j.method,
          isActive: j.is_active === 1,
          lastRunAt: j.last_run_at,
          nextRunAt: j.next_run_at,
          consecutiveFailures: j.consecutive_failures ?? 0,
          createdAt: j.created_at,
        })),
      };
    },
  },
  {
    name: 'hookbase_create_cron_job',
    description: 'Create a new scheduled cron job that makes HTTP requests on a schedule.',
    inputSchema: z.object({
      name: z.string().describe('Display name for the cron job'),
      cron_expression: z.string().describe('Cron expression (e.g., "0 * * * *" for hourly, "0 0 * * *" for daily)'),
      url: z.string().url().describe('URL to request when the job runs'),
      method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional().describe('HTTP method (default: POST)'),
      headers: z.record(z.string()).optional().describe('Custom headers to include'),
      payload: z.string().optional().describe('Request body (for POST/PUT/PATCH)'),
      timezone: z.string().optional().describe('Timezone for the schedule (default: UTC)'),
      timeout_ms: z.number().optional().describe('Request timeout in milliseconds (default: 30000)'),
      description: z.string().optional().describe('Optional description'),
    }).strict(),
    handler: async (args: {
      name: string;
      cron_expression: string;
      url: string;
      method?: string;
      headers?: Record<string, string>;
      payload?: string;
      timezone?: string;
      timeout_ms?: number;
      description?: string;
    }) => {
      const result = await api.createCronJob({
        name: args.name,
        cronExpression: args.cron_expression,
        url: args.url,
        method: args.method,
        headers: args.headers,
        payload: args.payload,
        timezone: args.timezone,
        timeoutMs: args.timeout_ms,
        description: args.description,
      });
      if (result.error) {
        return { error: result.error };
      }
      const j = result.data?.cronJob;
      return {
        message: 'Cron job created successfully',
        cronJob: j ? {
          id: j.id,
          name: j.name,
          cronExpression: j.cron_expression,
          url: j.url,
          nextRunAt: j.next_run_at,
        } : null,
      };
    },
  },
  {
    name: 'hookbase_delete_cron_job',
    description: 'Delete a scheduled cron job.',
    inputSchema: z.object({
      job_id: z.string().describe('The ID of the cron job to delete'),
    }).strict(),
    handler: async (args: { job_id: string }) => {
      const result = await api.deleteCronJob(args.job_id);
      if (result.error) {
        return { error: result.error };
      }
      return { message: 'Cron job deleted successfully' };
    },
  },
  {
    name: 'hookbase_trigger_cron',
    description: 'Manually trigger a cron job immediately, regardless of its schedule.',
    inputSchema: z.object({
      job_id: z.string().describe('The ID of the cron job to trigger'),
    }).strict(),
    handler: async (args: { job_id: string }) => {
      const result = await api.triggerCronJob(args.job_id);
      if (result.error) {
        return { error: result.error };
      }
      const exec = result.data?.execution;
      return {
        message: exec?.status === 'success' ? 'Cron job executed successfully' : 'Cron job execution failed',
        execution: exec ? {
          id: exec.id,
          status: exec.status,
          responseStatus: exec.responseStatus,
          latencyMs: exec.latencyMs,
          error: exec.error,
        } : null,
      };
    },
  },
];
