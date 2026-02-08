/**
 * MCP Server for Hookbase API
 * Registers all tools and handles requests
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { initConfig } from './lib/config.js';
import { sourceTools } from './tools/sources.js';
import { destinationTools } from './tools/destinations.js';
import { routeTools } from './tools/routes.js';
import { eventTools } from './tools/events.js';
import { deliveryTools } from './tools/deliveries.js';
import { tunnelTools } from './tools/tunnels.js';
import { cronTools } from './tools/cron.js';
import { analyticsTools } from './tools/analytics.js';
import { outboundTools } from './tools/outbound.js';
import { eventTypeTools } from './tools/outbound-event-types.js';
import { outboundMessageTools } from './tools/outbound-messages.js';
import { hookbasePrompts } from './prompts/index.js';

/**
 * Create and configure the MCP server
 */
export async function createServer(): Promise<McpServer> {
  const server = new McpServer({
    name: 'hookbase',
    version: '1.0.0',
  });

  // Initialize and validate configuration
  const configResult = await initConfig();
  if ('error' in configResult) {
    console.error(`Configuration error: ${configResult.error}`);
    // Continue anyway - errors will be thrown when tools are called
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
    ...analyticsTools,
    // Outbound webhooks
    ...outboundTools,
    ...eventTypeTools,
    ...outboundMessageTools,
  ];

  // Register each tool
  for (const tool of allTools) {
    const schema = tool.inputSchema as z.ZodObject<Record<string, z.ZodType>>;
    server.tool(
      tool.name,
      tool.description,
      schema.shape,
      async (args) => {
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
