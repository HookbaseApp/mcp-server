/**
 * Shared tool registry.
 *
 * The single source of truth for the Hookbase tool set, consumed by both
 * transports: the stdio server (src/server.ts) and the remote Streamable-HTTP
 * Worker (src/http/handler.ts). Each tool is transport-agnostic — its handler
 * reads per-request config via getConfig() and talks to the REST API.
 */

import { z } from 'zod';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';

import { sourceTools } from './sources.js';
import { destinationTools } from './destinations.js';
import { routeTools } from './routes.js';
import { eventTools } from './events.js';
import { deliveryTools } from './deliveries.js';
import { tunnelTools } from './tunnels.js';
import { cronTools } from './cron.js';
import { cronGroupTools } from './cron-groups.js';
import { analyticsTools } from './analytics.js';
import { filterTools } from './filters.js';
import { transformTools } from './transforms.js';
import { schemaTools } from './schemas.js';
import { alertRuleTools } from './alert-rules.js';
import { notificationChannelTools } from './notification-channels.js';
import { outboundTools } from './outbound.js';
import { eventTypeTools } from './outbound-event-types.js';
import { outboundMessageTools } from './outbound-messages.js';
import { auditLogTools } from './audit-logs.js';
import { apiKeyTools } from './api-keys.js';
import { redactionPolicyTools } from './redaction-policies.js';
import { scheduledSendTools } from './scheduled-sends.js';
import { webhookAnalyticsTools } from './webhook-analytics.js';
import { binTools } from './bins.js';

/** Shape every tool object conforms to. */
export interface HookbaseTool {
  name: string;
  description: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputSchema: z.ZodObject<any>;
  /** Behavioral hints (readOnlyHint, destructiveHint, idempotentHint, openWorldHint) per the MCP spec. */
  annotations?: ToolAnnotations;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (args: any) => Promise<unknown>;
}

export const allTools: HookbaseTool[] = [
  ...sourceTools,
  ...destinationTools,
  ...routeTools,
  ...eventTools,
  ...deliveryTools,
  ...tunnelTools,
  ...cronTools,
  ...cronGroupTools,
  ...analyticsTools,
  // Routing primitives
  ...filterTools,
  ...transformTools,
  ...schemaTools,
  // Alerts & notifications
  ...alertRuleTools,
  ...notificationChannelTools,
  // Outbound webhooks
  ...outboundTools,
  ...eventTypeTools,
  ...outboundMessageTools,
  ...webhookAnalyticsTools,
  // Org administration
  ...apiKeyTools,
  ...auditLogTools,
  ...redactionPolicyTools,
  ...scheduledSendTools,
  ...binTools,
] as HookbaseTool[];
