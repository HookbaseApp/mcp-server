import { describe, it, expect } from 'vitest';
import { handleMcpRequest } from '../src/http/handler.js';
import { allTools } from '../src/tools/index.js';

const API_URL = 'https://api.hookbase.app';
const KEY = 'whr_offline_test_key';

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://mcp.test/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}
const auth = { Authorization: `Bearer ${KEY}` };

// These tests exercise only the offline surface: initialize, tools/list, ping,
// notifications, and every error branch that short-circuits before the /auth/me
// round-trip. A successful tools/call would hit the network and is not tested here.
describe('http MCP handler', () => {
  it('rejects a request with no Authorization header (401)', async () => {
    const res = await handleMcpRequest(post({ jsonrpc: '2.0', id: 1, method: 'ping' }), API_URL);
    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toBe('Bearer');
  });

  it('rejects a non-whr_ key (401)', async () => {
    const res = await handleMcpRequest(
      post({ jsonrpc: '2.0', id: 1, method: 'ping' }, { Authorization: 'Bearer abc123' }),
      API_URL,
    );
    expect(res.status).toBe(401);
  });

  it('answers initialize with serverInfo and a supported protocol', async () => {
    const res = await handleMcpRequest(
      post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, auth),
      API_URL,
    );
    const body = await res.json();
    expect(body.result.serverInfo.name).toBe('hookbase');
    expect(body.result.protocolVersion).toBe('2025-06-18');
    expect(body.result.capabilities.tools).toBeDefined();
  });

  it('lists every registered tool with an object JSON Schema', async () => {
    const res = await handleMcpRequest(post({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, auth), API_URL);
    const body = await res.json();
    expect(body.result.tools).toHaveLength(allTools.length);
    for (const t of body.result.tools) {
      expect(typeof t.name).toBe('string');
      expect(t.inputSchema.type).toBe('object');
      expect(t.inputSchema.$schema).toBeUndefined();
    }
  });

  it('every tool exposes non-empty behavioral annotations', async () => {
    const res = await handleMcpRequest(post({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, auth), API_URL);
    const body = await res.json();
    for (const t of body.result.tools) {
      expect(t.annotations, `${t.name} is missing annotations`).toBeTypeOf('object');
      expect(Object.keys(t.annotations).length, `${t.name} has empty annotations`).toBeGreaterThan(0);
    }
  });

  it('answers ping', async () => {
    const res = await handleMcpRequest(post({ jsonrpc: '2.0', id: 5, method: 'ping' }, auth), API_URL);
    expect((await res.json()).result).toEqual({});
  });

  it('acknowledges notifications with 202 and no body', async () => {
    const res = await handleMcpRequest(post({ jsonrpc: '2.0', method: 'notifications/initialized' }, auth), API_URL);
    expect(res.status).toBe(202);
    expect(await res.text()).toBe('');
  });

  it('returns -32601 for an unknown method', async () => {
    const res = await handleMcpRequest(post({ jsonrpc: '2.0', id: 1, method: 'nope' }, auth), API_URL);
    expect((await res.json()).error.code).toBe(-32601);
  });

  it('returns -32602 for an unknown tool (no network)', async () => {
    const res = await handleMcpRequest(
      post({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'hookbase_nope', arguments: {} } }, auth),
      API_URL,
    );
    expect((await res.json()).error.code).toBe(-32602);
  });

  it('returns -32602 for invalid tool arguments (no network)', async () => {
    const res = await handleMcpRequest(
      post({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'hookbase_get_source', arguments: {} } }, auth),
      API_URL,
    );
    const body = await res.json();
    expect(body.error.code).toBe(-32602);
    expect(body.error.message).toContain('source_id');
  });

  it('handles a JSON-RPC batch', async () => {
    const res = await handleMcpRequest(
      post([
        { jsonrpc: '2.0', id: 1, method: 'ping' },
        { jsonrpc: '2.0', id: 2, method: 'ping' },
      ], auth),
      API_URL,
    );
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
  });

  it('answers CORS preflight with 204', async () => {
    const res = await handleMcpRequest(new Request('https://mcp.test/mcp', { method: 'OPTIONS' }), API_URL);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});
