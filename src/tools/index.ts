/**
 * Shared tool registry.
 *
 * The single source of truth for the Hookbase tool set, consumed by both
 * transports: the stdio server (src/server.ts) and the remote Streamable-HTTP
 * Worker (src/http/handler.ts). Each tool is transport-agnostic — its handler
 * reads per-request config via getConfig() and talks to the REST API.
 */

import { z } from '../lib/zod.js';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';

import { sourceTools } from './sources.js';
import { providerCatalogTools } from './provider-catalog.js';
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
import { signatureTools } from './signature.js';
import { apiPollerTools } from './api-pollers.js';
import { operationalWebhookTools } from './operational-webhooks.js';
import { eventCatalogTools } from './event-catalog.js';

/** Shape every tool object conforms to. */
export interface HookbaseTool {
  name: string;
  description: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputSchema: z.ZodObject<any>;
  /** Behavioral hints (readOnlyHint, destructiveHint, idempotentHint, openWorldHint) per the MCP spec. */
  annotations?: ToolAnnotations;
  /**
   * Every API route the handler may call, as `METHOD /path` with a `:param` for each value it
   * fills in. Org routes are relative to /api/organizations/:orgId; any other route starts with
   * /api/. A host running the tools in-process (the API's AI Assistant, through ./catalog) refuses
   * any request not listed here, so a value the model chose can't steer a call to another route.
   * tests/tool-routes.test.ts runs every handler and checks this list against what it calls.
   */
  routes: readonly string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (args: any) => Promise<unknown>;
}

export const allTools: HookbaseTool[] = [
  ...sourceTools,
  ...providerCatalogTools,
  ...destinationTools,
  ...routeTools,
  ...eventTools,
  ...deliveryTools,
  ...tunnelTools,
  ...cronTools,
  ...cronGroupTools,
  ...apiPollerTools,
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
  ...eventCatalogTools,
  ...outboundMessageTools,
  ...webhookAnalyticsTools,
  ...operationalWebhookTools,
  // Org administration
  ...apiKeyTools,
  ...auditLogTools,
  ...redactionPolicyTools,
  ...scheduledSendTools,
  ...binTools,
  ...signatureTools,
] as HookbaseTool[];

/**
 * The tools grouped by area, one group per module. A host that can't offer the model all of them
 * at once (the AI Assistant) offers a few and lets the model load a group by name.
 */
export const toolsets: Readonly<Record<string, readonly HookbaseTool[]>> = {
  sources: [...sourceTools, ...providerCatalogTools],
  destinations: destinationTools,
  routes: routeTools,
  events: eventTools,
  deliveries: deliveryTools,
  tunnels: tunnelTools,
  cron: [...cronTools, ...cronGroupTools],
  apiPollers: apiPollerTools,
  analytics: [...analyticsTools, ...webhookAnalyticsTools],
  filters: filterTools,
  transforms: transformTools,
  schemas: schemaTools,
  alerts: [...alertRuleTools, ...notificationChannelTools],
  // Outbound is split four ways: 38 tools in one group is more than a model can be offered at once.
  outbound: outboundTools,
  eventTypes: [...eventTypeTools, ...eventCatalogTools],
  outboundMessages: outboundMessageTools,
  operationalWebhooks: operationalWebhookTools,
  apiKeys: apiKeyTools,
  auditLogs: auditLogTools,
  redactionPolicies: redactionPolicyTools,
  scheduledSends: scheduledSendTools,
  bins: binTools,
  signatures: signatureTools,
} as Record<string, HookbaseTool[]>;
