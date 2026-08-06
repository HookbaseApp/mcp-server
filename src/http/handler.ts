/**
 * Remote MCP transport: stateless Streamable HTTP.
 *
 * Implements the JSON-response variant of the MCP Streamable HTTP transport:
 * the client POSTs a single JSON-RPC message and receives a single JSON-RPC
 * response (no SSE stream, no session state). This covers the whole tool-calling
 * surface that hosted clients (Claude, ChatGPT connectors) need.
 *
 * Supported methods: initialize, notifications/initialized, ping, tools/list,
 * tools/call. Auth is a `whr_` bearer key (see auth.ts); org resolution is
 * deferred until the first tools/call so initialize/tools/list stay offline.
 */

import { zodToJsonSchema } from 'zod-to-json-schema';

import pkg from '../../package.json' with { type: 'json' };
import { allTools, type HookbaseTool } from '../tools/index.js';
import { runWithConfig } from '../lib/context.js';
import { AuthError, extractApiKey, resolveConfig } from './auth.js';

const LATEST_PROTOCOL = '2025-06-18';
const SUPPORTED_PROTOCOLS = new Set([LATEST_PROTOCOL, '2025-03-26', '2024-11-05']);

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Hookbase-Org-Id, Mcp-Protocol-Version',
  'Access-Control-Max-Age': '86400',
};

// JSON-RPC 2.0 error codes.
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

interface JsonRpcId {
  id?: string | number | null;
}
interface JsonRpcRequest extends JsonRpcId {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

const toolByName = new Map<string, HookbaseTool>(allTools.map((t) => [t.name, t]));

// tools/list is identical for every request — build it once per isolate.
let toolListCache:
  | Array<{ name: string; description: string; inputSchema: unknown; annotations?: unknown }>
  | null = null;
function toolList() {
  if (!toolListCache) {
    toolListCache = allTools.map((t) => {
      const schema = zodToJsonSchema(t.inputSchema, { target: 'jsonSchema7' }) as Record<string, unknown>;
      delete schema.$schema;
      return {
        name: t.name,
        description: t.description,
        inputSchema: schema,
        ...(t.annotations ? { annotations: t.annotations } : {}),
      };
    });
  }
  return toolListCache;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function rpcError(id: JsonRpcId['id'], code: number, message: string) {
  return { jsonrpc: '2.0' as const, id: id ?? null, error: { code, message } };
}
function rpcResult(id: JsonRpcId['id'], result: unknown) {
  return { jsonrpc: '2.0' as const, id: id ?? null, result };
}

/** Dispatch one JSON-RPC request. Returns a response object, or null for a notification. */
async function dispatch(
  msg: JsonRpcRequest,
  apiKey: string,
  apiUrl: string,
  orgOverride: string | undefined,
): Promise<object | null> {
  const isNotification = msg.id === undefined || msg.id === null;

  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return isNotification ? null : rpcError(msg?.id, INVALID_REQUEST, 'Invalid JSON-RPC 2.0 request');
  }

  switch (msg.method) {
    case 'initialize': {
      const requested = (msg.params?.protocolVersion as string | undefined) ?? LATEST_PROTOCOL;
      const protocolVersion = SUPPORTED_PROTOCOLS.has(requested) ? requested : LATEST_PROTOCOL;
      return rpcResult(msg.id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'hookbase', version: pkg.version },
        instructions:
          'Hookbase webhook relay. Manage sources, destinations, routes, deliveries, ' +
          'outbound webhooks, and tunnels. All actions are scoped to the API key\'s organization.',
      });
    }

    // Fire-and-forget lifecycle notifications — acknowledge with no response.
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null;

    case 'ping':
      return isNotification ? null : rpcResult(msg.id, {});

    case 'tools/list':
      return rpcResult(msg.id, { tools: toolList() });

    case 'tools/call': {
      const name = msg.params?.name as string | undefined;
      const args = (msg.params?.arguments as Record<string, unknown> | undefined) ?? {};
      const tool = name ? toolByName.get(name) : undefined;
      if (!tool) {
        return rpcError(msg.id, INVALID_PARAMS, `Unknown tool: ${name ?? '(none)'}`);
      }

      const parsed = tool.inputSchema.safeParse(args);
      if (!parsed.success) {
        return rpcError(
          msg.id,
          INVALID_PARAMS,
          `Invalid arguments for ${name}: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
        );
      }

      // Resolve org (may call /api/auth/me) only now that a tool is actually run.
      let config;
      try {
        config = await resolveConfig(apiKey, apiUrl, orgOverride);
      } catch (error) {
        if (error instanceof AuthError) {
          return rpcError(msg.id, INVALID_PARAMS, error.message);
        }
        throw error;
      }

      try {
        const result = await runWithConfig(config, () => tool.handler(parsed.data));
        const isError =
          result !== null && typeof result === 'object' && 'error' in (result as Record<string, unknown>);
        return rpcResult(msg.id, {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          isError,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return rpcResult(msg.id, {
          content: [{ type: 'text', text: JSON.stringify({ error: message }, null, 2) }],
          isError: true,
        });
      }
    }

    default:
      return isNotification ? null : rpcError(msg.id, METHOD_NOT_FOUND, `Method not found: ${msg.method}`);
  }
}

/**
 * Entry point for the Worker. Handles one HTTP request to the MCP endpoint.
 */
export async function handleMcpRequest(request: Request, apiUrl: string): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  // Stateless server: no server-initiated streams, so GET/DELETE have nothing to do.
  if (request.method !== 'POST') {
    return jsonResponse(rpcError(null, INVALID_REQUEST, 'Only POST is supported'), 405);
  }

  let apiKey: string;
  let orgOverride: string | undefined;
  try {
    apiKey = extractApiKey(request);
    orgOverride = request.headers.get('x-hookbase-org-id')?.trim() || undefined;
  } catch (error) {
    if (error instanceof AuthError) {
      return new Response(JSON.stringify(rpcError(null, INVALID_REQUEST, error.message)), {
        status: error.status,
        headers: { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Bearer', ...CORS_HEADERS },
      });
    }
    throw error;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(rpcError(null, PARSE_ERROR, 'Invalid JSON'), 400);
  }

  // Batch: process each, return only the non-notification responses.
  if (Array.isArray(body)) {
    if (body.length === 0) {
      return jsonResponse(rpcError(null, INVALID_REQUEST, 'Empty batch'), 400);
    }
    const responses = (
      await Promise.all(body.map((m) => dispatch(m as JsonRpcRequest, apiKey, apiUrl, orgOverride)))
    ).filter((r): r is object => r !== null);
    // All notifications → 202 with no body.
    return responses.length ? jsonResponse(responses) : new Response(null, { status: 202, headers: CORS_HEADERS });
  }

  const response = await dispatch(body as JsonRpcRequest, apiKey, apiUrl, orgOverride);
  if (response === null) {
    return new Response(null, { status: 202, headers: CORS_HEADERS });
  }
  return jsonResponse(response);
}
