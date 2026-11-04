/**
 * The tool catalog, for a host that runs the tools itself instead of over MCP.
 *
 * The Hookbase API's AI Assistant imports this as `@hookbase/mcp-server/catalog`. It runs each
 * handler inside runWithConfig() with a fetch of its own, which sends the request to the API
 * in-process and refuses anything outside the tool's `routes`. Importing this starts no server
 * and reads no environment variables.
 */

import { z } from './lib/zod.js';
import type { HookbaseTool } from './tools/index.js';

export { allTools, toolsets, type HookbaseTool } from './tools/index.js';
export { runWithConfig, type Fetch, type RunOptions } from './lib/context.js';
export type { Config } from './lib/config.js';

/** A tool's arguments as JSON Schema: exactly what tools/list advertises over MCP. */
export function toolInputSchema(tool: HookbaseTool): Record<string, unknown> {
  // io: 'input' describes what a caller may send, so a field with a default is not required.
  const schema = z.toJSONSchema(tool.inputSchema, { target: 'draft-7', io: 'input' }) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}

/**
 * Checks arguments against a tool's schema, returning the parsed values or the error text MCP
 * clients get (`<path>: <message>; ...`).
 */
export function parseToolArgs(
  tool: HookbaseTool,
  args: unknown,
): { ok: true; args: Record<string, unknown> } | { ok: false; error: string } {
  const parsed = tool.inputSchema.safeParse(args);
  if (parsed.success) return { ok: true, args: parsed.data as Record<string, unknown> };
  return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
}
