/**
 * Cron group tools for MCP server
 */

import { z } from 'zod';
import * as api from '../lib/api.js';

export const cronGroupTools = [
  {
    name: 'hookbase_list_cron_groups',
    description: 'List cron job groups. Groups organize cron jobs in the dashboard and can be referenced via group_id when creating/updating jobs.',
    inputSchema: z.object({}).strict(),
    handler: async () => {
      const result = await api.getCronGroups();
      if (result.error) return { error: result.error };
      return { groups: result.data?.groups };
    },
  },
  {
    name: 'hookbase_get_cron_group',
    description: 'Get a single cron group by ID or slug.',
    inputSchema: z.object({
      group_id: z.string().describe('Group ID or slug'),
    }).strict(),
    handler: async (args: { group_id: string }) => {
      const result = await api.getCronGroup(args.group_id);
      if (result.error) return { error: result.error };
      return { group: result.data?.group };
    },
  },
  {
    name: 'hookbase_create_cron_group',
    description: 'Create a cron group. Slug is derived from the name. New groups are appended to the end of the sort order.',
    inputSchema: z.object({
      name: z.string(),
      description: z.string().optional(),
    }).strict(),
    handler: async (args: { name: string; description?: string }) => {
      const result = await api.createCronGroup(args);
      if (result.error) return { error: result.error };
      return { message: 'Cron group created', group: result.data?.group };
    },
  },
  {
    name: 'hookbase_update_cron_group',
    description: 'Update a cron group\'s name, description, sort order, or collapsed state.',
    inputSchema: z.object({
      group_id: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      sort_order: z.number().optional(),
      is_collapsed: z.boolean().optional(),
    }).strict(),
    handler: async (args: {
      group_id: string;
      name?: string;
      description?: string;
      sort_order?: number;
      is_collapsed?: boolean;
    }) => {
      const result = await api.updateCronGroup(args.group_id, {
        name: args.name,
        description: args.description,
        sortOrder: args.sort_order,
        isCollapsed: args.is_collapsed,
      });
      if (result.error) return { error: result.error };
      return { message: 'Cron group updated', group: result.data?.group };
    },
  },
  {
    name: 'hookbase_delete_cron_group',
    description: 'Delete a cron group. Jobs in this group are not deleted; their group_id is set to null.',
    inputSchema: z.object({
      group_id: z.string(),
    }).strict(),
    handler: async (args: { group_id: string }) => {
      const result = await api.deleteCronGroup(args.group_id);
      if (result.error) return { error: result.error };
      return { message: 'Cron group deleted' };
    },
  },
];
