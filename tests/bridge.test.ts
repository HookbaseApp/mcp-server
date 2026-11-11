/**
 * Bridge destinations (API #129) and the queue types: create_destination accepts every type the API
 * does, a bridge is created with its config and no URL, test_destination sends a sample payload and
 * returns a bridge's dry run, and get_outbound_message passes the bridge block through.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

interface Call {
  url: string;
  method: string;
  body: Record<string, unknown> | undefined;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

const DEST_TYPES = ['http', 'sqs', 'eventbridge', 'servicebus', 'pubsub', 'oci_queue', 's3', 'r2', 'gcs', 'azure_blob', 'bridge'];
const BRIDGE_CONFIG = { eventTypeSource: 'field', eventTypeField: 'data.type', eventTypePrefix: 'stripe.' };
const BRIDGE = {
  id: 'dst_1', name: 'To customers', slug: 'to-customers', type: 'bridge', url: '', method: 'POST',
  config: BRIDGE_CONFIG, isActive: true, createdAt: '2026-11-11T00:00:00.000Z',
};

type Tool = {
  handler: (args: never) => Promise<unknown>;
  inputSchema: { safeParse: (v: unknown) => { success: boolean } };
};

/** Stubs fetch with /api/auth/me plus `routes` (first matching url substring + method wins). */
async function setup(routes: Array<{ match: string; method?: string; response: () => Response }> = []) {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url.endsWith('/api/auth/me')) {
      return json({ organizations: [{ id: 'org_1', name: 'Acme', slug: 'acme' }] });
    }
    const route = routes.find(r => url.includes(r.match) && (!r.method || r.method === method));
    if (!route) throw new Error(`unexpected fetch: ${method} ${url}`);
    return route.response();
  }));
  const { initConfig } = await import('../src/lib/config.js');
  await initConfig();
  const { allTools } = await import('../src/tools/index.js');
  const tool = (name: string) => {
    const t = allTools.find(x => x.name === name);
    if (!t) throw new Error(`no tool ${name}`);
    return t as unknown as Tool;
  };
  return { calls: () => calls.filter(c => !c.url.endsWith('/api/auth/me')), tool };
}

describe('bridge destinations', () => {
  beforeEach(() => {
    process.env.HOOKBASE_API_KEY = 'whr_test_key';
    process.env.HOOKBASE_API_URL = 'https://api.test.local';
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('create_destination accepts every type the API does, and nothing else', async () => {
    const { tool } = await setup();
    const schema = tool('hookbase_create_destination').inputSchema;
    for (const type of DEST_TYPES) expect(schema.safeParse({ name: 'x', type }).success, type).toBe(true);
    for (const type of ['webhook', 'kafka', 'Bridge']) expect(schema.safeParse({ name: 'x', type }).success, type).toBe(false);
  });

  it('creates a bridge with its config and no URL, method or auth', async () => {
    const { tool, calls } = await setup([
      { match: '/destinations', method: 'POST', response: () => json({ destination: BRIDGE }, 201) },
    ]);
    const result = await tool('hookbase_create_destination').handler({
      name: 'To customers', type: 'bridge', config: BRIDGE_CONFIG,
    } as never);
    const [call] = calls();
    expect(call.method).toBe('POST');
    expect(call.body).toMatchObject({ type: 'bridge', config: BRIDGE_CONFIG });
    // The API refuses a bridge given a url, headers, an authType other than none, or useStaticIp.
    expect(call.body?.url).toBeUndefined();
    expect(call.body?.headers).toBeUndefined();
    expect(call.body?.authType).toBeUndefined();
    expect(call.body?.method).toBeUndefined();
    expect(result).toMatchObject({ destination: { id: 'dst_1', type: 'bridge', url: '' } });
  });

  it("list_destinations returns a bridge's config, and no other type's", async () => {
    const { tool } = await setup([
      { match: '/destinations', method: 'GET', response: () => json({ destinations: [
        BRIDGE,
        { id: 'dst_2', name: 'S3', slug: 's3', type: 's3', url: '', method: 'POST', config: { bucket: 'b', secretAccessKey: '••••' } },
      ] }) },
    ]);
    const result = await tool('hookbase_list_destinations').handler({} as never) as { destinations: Array<Record<string, unknown>> };
    expect(result.destinations[0].config).toEqual(BRIDGE_CONFIG);
    expect(result.destinations[1]).not.toHaveProperty('config');
  });

  it("test_destination sends the sample payload and returns a bridge's dry run", async () => {
    const dryRun = { success: true, dryRun: true, eventType: 'stripe.invoice.paid', eventTypeExists: true, matchingEndpoints: 3 };
    const { tool, calls } = await setup([
      { match: '/destinations/dst_1/test', method: 'POST', response: () => json(dryRun) },
    ]);
    const payload = { data: { type: 'invoice.paid' } };
    const result = await tool('hookbase_test_destination').handler({ destination_id: 'dst_1', payload } as never);
    expect(calls()[0].body).toEqual({ payload });
    expect(result).toEqual({ ...dryRun, error: undefined });
  });

  it('test_destination sends no body without a payload, and maps an http test as before', async () => {
    const { tool, calls } = await setup([
      { match: '/destinations/dst_1/test', method: 'POST', response: () => json({ success: true, status: 204, latencyMs: 41, responseBody: '' }) },
    ]);
    const result = await tool('hookbase_test_destination').handler({ destination_id: 'dst_1' } as never);
    expect(calls()[0].body).toBeUndefined();
    expect(result).toEqual({ success: true, statusCode: 204, responseTime: 41, responseBody: '', error: undefined });
  });

  it('test_destination returns a dry run that could not resolve the event type', async () => {
    const dryRun = { success: false, dryRun: true, eventType: null, eventTypeExists: false, matchingEndpoints: 0, error: "Payload field 'data.type' is missing" };
    const { tool } = await setup([
      { match: '/destinations/dst_1/test', method: 'POST', response: () => json(dryRun) },
    ]);
    const result = await tool('hookbase_test_destination').handler({ destination_id: 'dst_1', payload: {} } as never);
    expect(result).toEqual(dryRun);
  });

  it('test_destination accepts only an object payload', async () => {
    const { tool } = await setup();
    const schema = tool('hookbase_test_destination').inputSchema;
    expect(schema.safeParse({ destination_id: 'd', payload: { a: 1 } }).success).toBe(true);
    for (const payload of [[1], 'x', 1, null]) expect(schema.safeParse({ destination_id: 'd', payload }).success, JSON.stringify(payload)).toBe(false);
  });

  it('get_outbound_message passes the bridge block through', async () => {
    const bridge = { inboundEventId: 'evt_in', deliveryId: 'del_1', hop: 1 };
    const { tool } = await setup([
      { match: '/outbound-messages/msg_1', method: 'GET', response: () => json({ data: { id: 'msg_1', eventId: 'evt_out', bridge } }) },
    ]);
    const result = await tool('hookbase_get_outbound_message').handler({ message_id: 'msg_1' } as never) as Record<string, unknown>;
    expect(JSON.stringify(result)).toContain(JSON.stringify(bridge));
  });
});
