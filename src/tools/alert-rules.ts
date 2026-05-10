/**
 * Alert rule tools for MCP server
 */

import { z } from 'zod';
import * as api from '../lib/api.js';

const triggerTypeEnum = z.enum([
  'source_silence',
  'failure_rate',
  'latency_threshold',
  'volume_spike',
  'volume_drop',
  'anomaly_volume',
  'schema_drift',
]);

export const alertRuleTools = [
  {
    name: 'hookbase_list_alert_rules',
    description: 'List configured alert rules. Each rule pairs a trigger condition (failure rate, source silence, latency, volume anomalies, schema drift) with one or more notification channels.',
    inputSchema: z.object({}).strict(),
    handler: async () => {
      const result = await api.getAlertRules();
      if (result.error) return { error: result.error };
      return { rules: result.data?.rules };
    },
  },
  {
    name: 'hookbase_get_alert_rule',
    description: 'Get a single alert rule including its trigger config and notification channel IDs.',
    inputSchema: z.object({
      rule_id: z.string(),
    }).strict(),
    handler: async (args: { rule_id: string }) => {
      const result = await api.getAlertRule(args.rule_id);
      if (result.error) return { error: result.error };
      return { rule: result.data?.rule };
    },
  },
  {
    name: 'hookbase_create_alert_rule',
    description:
      'Create an alert rule. trigger_config shape depends on trigger_type:\n' +
      '- source_silence: { type, sourceId?, silenceMinutes }\n' +
      '- failure_rate: { type, destinationId?, thresholdPercent, windowMinutes }\n' +
      '- latency_threshold: { type, destinationId?, thresholdMs, windowMinutes }\n' +
      '- volume_spike: { type, sourceId?, maxEvents, windowMinutes }\n' +
      '- volume_drop: { type, sourceId?, minEvents, windowMinutes }\n' +
      '- anomaly_volume: { type, sourceId, direction?, zThreshold?, windowMinutes?, minBaselineSamples? } (Pro+ only)\n' +
      '- schema_drift: { type, sourceId, alertOn? } (Pro+ only)\n' +
      'The "type" field inside trigger_config must equal trigger_type.',
    inputSchema: z.object({
      name: z.string().max(100),
      trigger_type: triggerTypeEnum,
      trigger_config: z
        .record(z.string(), z.unknown())
        .describe('Discriminated config matching trigger_type — see tool description'),
      notification_channel_ids: z.array(z.string()).min(1).describe('IDs of notification channels to fire'),
      cooldown_minutes: z.number().int().min(1).max(1440).optional().describe('Default 30'),
    }).strict(),
    handler: async (args: {
      name: string;
      trigger_type: api.AlertTriggerType;
      trigger_config: Record<string, unknown>;
      notification_channel_ids: string[];
      cooldown_minutes?: number;
    }) => {
      const result = await api.createAlertRule({
        name: args.name,
        triggerType: args.trigger_type,
        triggerConfig: { ...args.trigger_config, type: args.trigger_type },
        notificationChannels: args.notification_channel_ids,
        cooldownMinutes: args.cooldown_minutes,
      });
      if (result.error) return { error: result.error };
      return { message: 'Alert rule created', rule: result.data?.rule };
    },
  },
  {
    name: 'hookbase_update_alert_rule',
    description: 'Update an alert rule. Pass only fields you want to change.',
    inputSchema: z.object({
      rule_id: z.string(),
      name: z.string().max(100).optional(),
      trigger_config: z.record(z.string(), z.unknown()).optional(),
      notification_channel_ids: z.array(z.string()).min(1).optional(),
      cooldown_minutes: z.number().int().min(1).max(1440).optional(),
      is_active: z.boolean().optional(),
    }).strict(),
    handler: async (args: {
      rule_id: string;
      name?: string;
      trigger_config?: Record<string, unknown>;
      notification_channel_ids?: string[];
      cooldown_minutes?: number;
      is_active?: boolean;
    }) => {
      const result = await api.updateAlertRule(args.rule_id, {
        name: args.name,
        triggerConfig: args.trigger_config,
        notificationChannels: args.notification_channel_ids,
        cooldownMinutes: args.cooldown_minutes,
        isActive: args.is_active,
      });
      if (result.error) return { error: result.error };
      return { message: 'Alert rule updated' };
    },
  },
  {
    name: 'hookbase_delete_alert_rule',
    description: 'Delete an alert rule.',
    inputSchema: z.object({
      rule_id: z.string(),
    }).strict(),
    handler: async (args: { rule_id: string }) => {
      const result = await api.deleteAlertRule(args.rule_id);
      if (result.error) return { error: result.error };
      return { message: 'Alert rule deleted' };
    },
  },
  {
    name: 'hookbase_test_alert_rule',
    description: 'Fire a test notification through all channels attached to this alert rule. Useful for verifying channel configuration.',
    inputSchema: z.object({
      rule_id: z.string(),
    }).strict(),
    handler: async (args: { rule_id: string }) => {
      const result = await api.testAlertRule(args.rule_id);
      if (result.error) return { error: result.error };
      return result.data;
    },
  },
];
