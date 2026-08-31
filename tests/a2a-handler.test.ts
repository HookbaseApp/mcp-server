import { describe, it, expect } from 'vitest';
import { handleA2aRequest } from '../src/a2a/handler.js';

const API_URL = 'https://api.hookbase.app';
const KEY = 'whr_offline_test_key';

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://mcp.test/a2a', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}
const auth = { Authorization: `Bearer ${KEY}` };

function sendMessage(parts: unknown[], id: number | string = 1) {
  return post(
    {
      jsonrpc: '2.0',
      id,
      method: 'SendMessage',
      params: { message: { messageId: 'm1', role: 'ROLE_USER', parts } },
    },
    auth,
  );
}

// These tests exercise only the offline surface: everything that short-circuits
// before the /auth/me round-trip. A successful skill invocation hits the network
// and is not tested here, same reasoning as tests/http-handler.test.ts.
describe('A2A handler', () => {
  it('rejects a request with no Authorization header (401)', async () => {
    const res = await handleA2aRequest(post({ jsonrpc: '2.0', id: 1, method: 'SendMessage', params: {} }), API_URL);
    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toBe('Bearer');
  });

  it('rejects a non-whr_ key (401)', async () => {
    const res = await handleA2aRequest(
      post({ jsonrpc: '2.0', id: 1, method: 'SendMessage', params: {} }, { Authorization: 'Bearer abc123' }),
      API_URL,
    );
    expect(res.status).toBe(401);
  });

  it('returns -32601 for an unknown method', async () => {
    const res = await handleA2aRequest(post({ jsonrpc: '2.0', id: 1, method: 'Nope', params: {} }, auth), API_URL);
    expect((await res.json()).error.code).toBe(-32601);
  });

  it('returns -32602 when params.message is missing', async () => {
    const res = await handleA2aRequest(post({ jsonrpc: '2.0', id: 1, method: 'SendMessage', params: {} }, auth), API_URL);
    const body = await res.json();
    expect(body.error.code).toBe(-32602);
  });

  it('returns -32602 when no data Part is present', async () => {
    const res = await handleA2aRequest(sendMessage([{ text: 'hello' }]), API_URL);
    const body = await res.json();
    expect(body.error.code).toBe(-32602);
  });

  it('returns -32602 when the data Part has no skill field', async () => {
    const res = await handleA2aRequest(sendMessage([{ data: { foo: 'bar' } }]), API_URL);
    const body = await res.json();
    expect(body.error.code).toBe(-32602);
  });

  it('returns -32004 for an unknown skill id (no network)', async () => {
    const res = await handleA2aRequest(sendMessage([{ data: { skill: 'nope', input: {} } }]), API_URL);
    const body = await res.json();
    expect(body.error.code).toBe(-32004);
  });

  it('returns -32602 for invalid skill input (no network)', async () => {
    const res = await handleA2aRequest(
      sendMessage([{ data: { skill: 'check-delivery-status', input: {} } }]),
      API_URL,
    );
    const body = await res.json();
    expect(body.error.code).toBe(-32602);
    expect(body.error.message).toContain('delivery_id');
  });

  it('rejects a JSON-RPC batch', async () => {
    const res = await handleA2aRequest(
      post([
        { jsonrpc: '2.0', id: 1, method: 'SendMessage', params: {} },
        { jsonrpc: '2.0', id: 2, method: 'SendMessage', params: {} },
      ], auth),
      API_URL,
    );
    const body = await res.json();
    expect(body.error.code).toBe(-32600);
  });

  it('answers CORS preflight with 204', async () => {
    const res = await handleA2aRequest(new Request('https://mcp.test/a2a', { method: 'OPTIONS' }), API_URL);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('rejects non-POST methods (405)', async () => {
    const res = await handleA2aRequest(new Request('https://mcp.test/a2a', { method: 'GET' }), API_URL);
    expect(res.status).toBe(405);
  });
});
