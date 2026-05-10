/**
 * Audit log tools (read-only) for MCP server
 */

import { z } from 'zod';
import * as api from '../lib/api.js';

export const auditLogTools = [
  {
    name: 'hookbase_list_audit_logs',
    description:
      'List org audit log entries with optional filters. Admins/owners always have access; non-admins require the "audit_logs" feature on the plan. Filter by action, entityType, or userId.',
    inputSchema: z.object({
      limit: z.number().int().min(1).max(100).optional().describe('Default 50, max 100'),
      offset: z.number().int().min(0).optional(),
      action: z.string().optional().describe('Exact action string (see hookbase_list_audit_log_actions)'),
      entity_type: z.string().optional().describe('Exact entity_type string (e.g. "source", "destination")'),
      user_id: z.string().optional(),
    }).strict(),
    handler: async (args: { limit?: number; offset?: number; action?: string; entity_type?: string; user_id?: string }) => {
      const result = await api.getAuditLogs({
        limit: args.limit,
        offset: args.offset,
        action: args.action,
        entityType: args.entity_type,
        userId: args.user_id,
      });
      if (result.error) return { error: result.error };
      return result.data;
    },
  },
  {
    name: 'hookbase_list_audit_log_actions',
    description: 'List the distinct action types present in this org\'s audit log. Useful for discovering filter values.',
    inputSchema: z.object({}).strict(),
    handler: async () => {
      const result = await api.getAuditLogActions();
      if (result.error) return { error: result.error };
      return { actions: result.data?.actions };
    },
  },
  {
    name: 'hookbase_list_audit_log_users',
    description: 'List the distinct users who appear in this org\'s audit log. Useful for discovering user_id filter values.',
    inputSchema: z.object({}).strict(),
    handler: async () => {
      const result = await api.getAuditLogUsers();
      if (result.error) return { error: result.error };
      return { users: result.data?.users };
    },
  },
];
