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
    name: 'hookbase_get_cron_job',
    description: 'Get full details for a single cron job, including schedule, target URL, headers/payload, and last/next run times.',
    inputSchema: z.object({
      job_id: z.string().describe('Cron job ID'),
    }).strict(),
    handler: async (args: { job_id: string }) => {
      const result = await api.getCronJob(args.job_id);
      if (result.error) return { error: result.error };
      return { cronJob: result.data?.cronJob };
    },
  },
  {
    name: 'hookbase_update_cron_job',
    description: 'Update a cron job. Pass only the fields you want to change. Changing cron_expression or timezone recalculates next run time.',
    inputSchema: z.object({
      job_id: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      cron_expression: z.string().optional(),
      timezone: z.string().optional(),
      url: z.string().url().optional(),
      method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
      headers: z.record(z.string(), z.string()).optional(),
      payload: z.string().optional(),
      timeout_ms: z.number().optional(),
      is_active: z.boolean().optional(),
      notify_on_failure: z.boolean().optional(),
      notify_on_success: z.boolean().optional(),
      notify_emails: z.string().optional().describe('Comma-separated email addresses'),
      group_id: z.string().nullable().optional().describe('Cron group ID, or null to remove from group'),
    }).strict(),
    handler: async (args: {
      job_id: string;
      name?: string;
      description?: string;
      cron_expression?: string;
      timezone?: string;
      url?: string;
      method?: string;
      headers?: Record<string, string>;
      payload?: string;
      timeout_ms?: number;
      is_active?: boolean;
      notify_on_failure?: boolean;
      notify_on_success?: boolean;
      notify_emails?: string;
      group_id?: string | null;
    }) => {
      const result = await api.updateCronJob(args.job_id, {
        name: args.name,
        description: args.description,
        cronExpression: args.cron_expression,
        timezone: args.timezone,
        url: args.url,
        method: args.method,
        headers: args.headers,
        payload: args.payload,
        timeoutMs: args.timeout_ms,
        isActive: args.is_active,
        notifyOnFailure: args.notify_on_failure,
        notifyOnSuccess: args.notify_on_success,
        notifyEmails: args.notify_emails,
        groupId: args.group_id,
      });
      if (result.error) return { error: result.error };
      return { message: 'Cron job updated' };
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
