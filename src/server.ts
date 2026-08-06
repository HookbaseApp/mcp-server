/**
 * MCP Server for Hookbase API
 * Registers all tools and handles requests
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import pkg from '../package.json' with { type: 'json' };
import { initConfig, getInitError } from './lib/config.js';
import { allTools } from './tools/index.js';
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

  // Register each tool from the shared registry (src/tools/index.ts)
  for (const tool of allTools) {
    const schema = tool.inputSchema as z.ZodObject<Record<string, z.ZodType>>;
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: schema.shape,
        annotations: tool.annotations,
      },
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
    server.registerPrompt(
      prompt.name,
      {
        description: prompt.description,
        argsSchema: prompt.argsSchema.shape,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (args: any) => {
        return prompt.getPrompt(args);
      }
    );
  }

  return server;
}
