/**
 * A2A (Agent2Agent Protocol, v1.0) transport: stateless JSON-RPC over HTTP.
 *
 * Baseline "Message-only agent" — every SendMessage call is answered with a
 * direct Message (never a Task), so there is no task lifecycle, no polling,
 * and no persistent storage required. capabilities.streaming/pushNotifications
 * are both false in the Agent Card so no client expects otherwise.
 *
 * Skill invocation convention: since these skills wrap typed/deterministic
 * tools rather than an LLM-driven agent, the caller must send exactly one
 * `data` Part shaped `{ skill: string, input?: object }`. There's no
 * natural-language routing here — an unrecognized or malformed invocation
 * gets a precise JSON-RPC error, not a best-effort guess.
 *
 * Wire shapes (Part/Message/SendMessage params & result, role casing, error
 * codes) are verified against the generated TypeScript types in
 * a2aproject/a2a-js v1.1.0, not spec prose.
 */

import { AuthError, extractApiKey, resolveConfig } from '../http/auth.js';
import { runWithConfig } from '../lib/context.js';
import { a2aSkillById } from './skills.js';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
};

// JSON-RPC 2.0 base error codes, plus the A2A-specific range (-32001..-32009).
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const UNSUPPORTED_OPERATION = -32004;

interface Part {
  text?: string;
  data?: unknown;
  raw?: string;
  url?: string;
  mediaType?: string;
  filename?: string;
}

interface Message {
  messageId: string;
  contextId?: string;
  taskId?: string;
  role: string;
  parts: Part[];
}

interface JsonRpcId {
  id?: string | number | null;
}
interface JsonRpcRequest extends JsonRpcId {
  jsonrpc: '2.0';
  method: string;
  params?: { message?: Message; configuration?: unknown; metadata?: unknown };
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

/** Find the one `data` Part shaped `{ skill, input? }`, or null. */
function extractSkillInvocation(message: Message): { skill: string; input: object } | null {
  for (const part of message.parts ?? []) {
    if (part.data && typeof part.data === 'object') {
      const data = part.data as Record<string, unknown>;
      if (typeof data.skill === 'string') {
        const input = typeof data.input === 'object' && data.input !== null ? data.input : {};
        return { skill: data.skill, input };
      }
    }
  }
  return null;
}

async function handleSendMessage(msg: JsonRpcRequest, apiKey: string, apiUrl: string): Promise<object> {
  const message = msg.params?.message;
  if (!message || !Array.isArray(message.parts)) {
    return rpcError(msg.id, INVALID_PARAMS, 'params.message.parts is required');
  }

  const invocation = extractSkillInvocation(message);
  if (!invocation) {
    return rpcError(
      msg.id,
      INVALID_PARAMS,
      'Expected one data Part shaped { skill: string, input?: object } — see the skill ids advertised in the Agent Card.',
    );
  }

  const skill = a2aSkillById.get(invocation.skill);
  if (!skill) {
    return rpcError(msg.id, UNSUPPORTED_OPERATION, `Unknown skill: ${invocation.skill}`);
  }

  const parsed = skill.tool.inputSchema.safeParse(invocation.input);
  if (!parsed.success) {
    return rpcError(
      msg.id,
      INVALID_PARAMS,
      `Invalid input for skill ${skill.id}: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  }

  let config;
  try {
    config = await resolveConfig(apiKey, apiUrl);
  } catch (error) {
    if (error instanceof AuthError) {
      return rpcError(msg.id, INVALID_PARAMS, error.message);
    }
    throw error;
  }

  const result = await runWithConfig(config, () => skill.tool.handler(parsed.data));

  const reply: Message = {
    messageId: crypto.randomUUID(),
    contextId: message.contextId ?? crypto.randomUUID(),
    role: 'ROLE_AGENT',
    parts: [{ data: result, mediaType: 'application/json' }],
  };
  return rpcResult(msg.id, { message: reply });
}

async function dispatch(msg: JsonRpcRequest, apiKey: string, apiUrl: string): Promise<object> {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return rpcError(msg?.id, INVALID_REQUEST, 'Invalid JSON-RPC 2.0 request');
  }

  switch (msg.method) {
    case 'SendMessage':
      return handleSendMessage(msg, apiKey, apiUrl);
    default:
      return rpcError(msg.id, METHOD_NOT_FOUND, `Method not found: ${msg.method}`);
  }
}

/** Entry point for the Worker. Handles one HTTP request to the A2A endpoint. */
export async function handleA2aRequest(request: Request, apiUrl: string): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== 'POST') {
    return jsonResponse(rpcError(null, INVALID_REQUEST, 'Only POST is supported'), 405);
  }

  let apiKey: string;
  try {
    apiKey = extractApiKey(request);
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

  // No JSON-RPC batch support — a single request per call is all this baseline needs.
  if (Array.isArray(body)) {
    return jsonResponse(rpcError(null, INVALID_REQUEST, 'Batch requests are not supported'), 400);
  }

  const response = await dispatch(body as JsonRpcRequest, apiKey, apiUrl);
  return jsonResponse(response);
}
