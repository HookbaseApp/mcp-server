/**
 * Notification channel tools for MCP server
 */

import { z } from 'zod';
import * as api from '../lib/api.js';

const channelTypeEnum = z.enum(['email', 'slack', 'webhook', 'teams', 'pagerduty', 'discord']);

export const notificationChannelTools = [
  {
    name: 'hookbase_list_notification_channels',
    description: 'List notification channels (email, Slack, webhook, Teams, PagerDuty, Discord). Sensitive fields like webhook URLs and PagerDuty routing keys are masked in the response.',
    inputSchema: z.object({}).strict(),
    handler: async () => {
      const result = await api.getNotificationChannels();
      if (result.error) return { error: result.error };
      return { channels: result.data?.channels };
    },
  },
  {
    name: 'hookbase_get_notification_channel',
    description: 'Get a single notification channel. Sensitive fields are masked in the response.',
    inputSchema: z.object({
      channel_id: z.string(),
    }).strict(),
    handler: async (args: { channel_id: string }) => {
      const result = await api.getNotificationChannel(args.channel_id);
      if (result.error) return { error: result.error };
      return { channel: result.data?.channel };
    },
  },
  {
    name: 'hookbase_create_notification_channel',
    description:
      'Create a notification channel. config shape depends on type:\n' +
      '- email: { addresses: ["a@b.com", ...] }\n' +
      '- slack: { webhookUrl }\n' +
      '- discord: { webhookUrl }\n' +
      '- teams: { webhookUrl }\n' +
      '- pagerduty: { routingKey, severity? }\n' +
      '- webhook: { url, secret? } (signed with HMAC-SHA256 if secret provided)\n' +
      'Requires the "notification_channels" feature on the org plan; admin or owner role required.',
    inputSchema: z.object({
      name: z.string().max(100),
      type: channelTypeEnum,
      config: z.record(z.string(), z.unknown()).describe('Channel-specific config — see tool description'),
    }).strict(),
    handler: async (args: {
      name: string;
      type: api.NotificationChannelType;
      config: Record<string, unknown>;
    }) => {
      const result = await api.createNotificationChannel(args);
      if (result.error) return { error: result.error };
      return { message: 'Notification channel created', channel: result.data?.channel };
    },
  },
  {
    name: 'hookbase_update_notification_channel',
    description: 'Update a notification channel. Pass any subset of name/config/is_active. Replacing config requires the same shape as create.',
    inputSchema: z.object({
      channel_id: z.string(),
      name: z.string().max(100).optional(),
      config: z.record(z.string(), z.unknown()).optional(),
      is_active: z.boolean().optional(),
    }).strict(),
    handler: async (args: {
      channel_id: string;
      name?: string;
      config?: Record<string, unknown>;
      is_active?: boolean;
    }) => {
      const result = await api.updateNotificationChannel(args.channel_id, {
        name: args.name,
        config: args.config,
        isActive: args.is_active,
      });
      if (result.error) return { error: result.error };
      return { message: 'Notification channel updated' };
    },
  },
  {
    name: 'hookbase_delete_notification_channel',
    description: 'Delete a notification channel. Alert rules referencing it will lose this channel from their notification list.',
    inputSchema: z.object({
      channel_id: z.string(),
    }).strict(),
    handler: async (args: { channel_id: string }) => {
      const result = await api.deleteNotificationChannel(args.channel_id);
      if (result.error) return { error: result.error };
      return { message: 'Notification channel deleted' };
    },
  },
];
