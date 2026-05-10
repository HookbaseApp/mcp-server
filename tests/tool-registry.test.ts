import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { sourceTools } from '../src/tools/sources.js';
import { destinationTools } from '../src/tools/destinations.js';
import { routeTools } from '../src/tools/routes.js';
import { eventTools } from '../src/tools/events.js';
import { deliveryTools } from '../src/tools/deliveries.js';
import { tunnelTools } from '../src/tools/tunnels.js';
import { cronTools } from '../src/tools/cron.js';
import { cronGroupTools } from '../src/tools/cron-groups.js';
import { analyticsTools } from '../src/tools/analytics.js';
import { filterTools } from '../src/tools/filters.js';
import { transformTools } from '../src/tools/transforms.js';
import { schemaTools } from '../src/tools/schemas.js';
import { alertRuleTools } from '../src/tools/alert-rules.js';
import { notificationChannelTools } from '../src/tools/notification-channels.js';
import { outboundTools } from '../src/tools/outbound.js';
import { eventTypeTools } from '../src/tools/outbound-event-types.js';
import { outboundMessageTools } from '../src/tools/outbound-messages.js';
import { auditLogTools } from '../src/tools/audit-logs.js';
import { apiKeyTools } from '../src/tools/api-keys.js';
import { redactionPolicyTools } from '../src/tools/redaction-policies.js';
import { scheduledSendTools } from '../src/tools/scheduled-sends.js';
import { webhookAnalyticsTools } from '../src/tools/webhook-analytics.js';
import { binTools } from '../src/tools/bins.js';

const allTools = [
  ...sourceTools,
  ...destinationTools,
  ...routeTools,
  ...eventTools,
  ...deliveryTools,
  ...tunnelTools,
  ...cronTools,
  ...cronGroupTools,
  ...analyticsTools,
  ...filterTools,
  ...transformTools,
  ...schemaTools,
  ...alertRuleTools,
  ...notificationChannelTools,
  ...outboundTools,
  ...eventTypeTools,
  ...outboundMessageTools,
  ...webhookAnalyticsTools,
  ...apiKeyTools,
  ...auditLogTools,
  ...redactionPolicyTools,
  ...scheduledSendTools,
  ...binTools,
];

describe('tool registry', () => {
  it('every tool has a unique hookbase_ prefixed name', () => {
    const names = allTools.map(t => t.name);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    expect(dupes).toEqual([]);
    for (const name of names) {
      expect(name).toMatch(/^hookbase_/);
    }
  });

  it('every tool has a non-empty description', () => {
    for (const tool of allTools) {
      expect(tool.description.length).toBeGreaterThan(10);
    }
  });

  it('every tool inputSchema is a Zod object', () => {
    for (const tool of allTools) {
      expect(tool.inputSchema).toBeInstanceOf(z.ZodObject);
    }
  });

  it('README tool count matches registered count', async () => {
    const fs = await import('node:fs/promises');
    const readme = await fs.readFile(new URL('../README.md', import.meta.url), 'utf8');
    const match = readme.match(/Available Tools \((\d+)\)/);
    expect(match, 'README missing "Available Tools (N)" header').not.toBeNull();
    expect(Number(match![1])).toBe(allTools.length);
  });
});
