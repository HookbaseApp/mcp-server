/**
 * MCP Server for Hookbase API
 * Registers all tools and handles requests
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import pkg from '../package.json' with { type: 'json' };
import { initConfig, getInitError } from './lib/config.js';
import { sourceTools } from './tools/sources.js';
import { destinationTools } from './tools/destinations.js';
import { routeTools } from './tools/routes.js';
import { eventTools } from './tools/events.js';
import { deliveryTools } from './tools/deliveries.js';
import { tunnelTools } from './tools/tunnels.js';
import { cronTools } from './tools/cron.js';
import { cronGroupTools } from './tools/cron-groups.js';
import { analyticsTools } from './tools/analytics.js';
import { filterTools } from './tools/filters.js';
import { transformTools } from './tools/transforms.js';
import { schemaTools } from './tools/schemas.js';
import { alertRuleTools } from './tools/alert-rules.js';
import { notificationChannelTools } from './tools/notification-channels.js';
import { outboundTools } from './tools/outbound.js';
import { eventTypeTools } from './tools/outbound-event-types.js';
import { outboundMessageTools } from './tools/outbound-messages.js';
import { auditLogTools } from './tools/audit-logs.js';
import { apiKeyTools } from './tools/api-keys.js';
import { redactionPolicyTools } from './tools/redaction-policies.js';
import { scheduledSendTools } from './tools/scheduled-sends.js';
import { webhookAnalyticsTools } from './tools/webhook-analytics.js';
import { binTools } from './tools/bins.js';
import { hookbasePrompts } from './prompts/index.js';
import { hookbaseResources } from './resources/index.js';

/**
 * Create and configure the MCP server
 */
export async function createServer(): Promise<McpServer> {
  const server = new McpServer({
    name: 'hookbase',
    version: pkg.version,
  });

  // Initialize and validate configuration. On failure we still register tools,
  // but each handler short-circuits with the captured error so the caller sees
  // a useful message instead of "Config not initialized."
  const configResult = await initConfig();
  if ('error' in configResult) {
    console.error(`Configuration error: ${configResult.error}`);
  }

  // Collect all tools
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
  ];

  // Register each tool
  for (const tool of allTools) {
    const schema = tool.inputSchema as z.ZodObject<Record<string, z.ZodType>>;
    server.tool(
      tool.name,
      tool.description,
      schema.shape,
      async (args) => {
        const initError = getInitError();
        if (initError) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ error: `Hookbase MCP not configured: ${initError}` }, null, 2),
              },
            ],
            isError: true,
          };
        }
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const result = await (tool.handler as (args: any) => Promise<unknown>)(args);
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ error: errorMessage }, null, 2),
              },
            ],
            isError: true,
          };
        }
      }
    );
  }

  // Register resources for stable, addressable URIs (ingest URLs, tunnel WS URLs, endpoint metadata)
  for (const resource of hookbaseResources) {
    server.registerResource(
      resource.name,
      resource.template,
      resource.metadata,
      resource.read
    );
  }

  // Register prompts to help AI assistants understand capabilities
  for (const prompt of hookbasePrompts) {
    server.prompt(
      prompt.name,
      prompt.description,
      prompt.argsSchema.shape,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (args: any) => {
        return prompt.getPrompt(args);
      }
    );
  }

  return server;
}
