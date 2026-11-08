/**
 * Holds while a circuit is open (API migrations 0132-0135): the status filters accept every status
 * the API stores, the hold fields reach the agent, and hold_on_circuit_open is sent as
 * holdOnCircuitOpen only when given (the API rejects null with a 400).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

interface Call {
  url: string;
  method: string;
  body: Record<string, unknown> | undefined;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

const SOURCE_UUID = '11111111-2222-4333-8444-555555555555';
const HOLD_ENDS = '2026-11-10T12:00:00.000Z';

const INBOUND = ['pending', 'delivered', 'failed', 'failed_over', 'schema_failed', 'throttled', 'awaiting_retry', 'held'];
const OUTBOUND = ['pending', 'processing', 'success', 'awaiting_retry', 'held', 'awaiting_pull', 'fifo_waiting', 'failed', 'exhausted', 'dlq'];

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

describe('holds', () => {
  beforeEach(() => {
    process.env.HOOKBASE_API_KEY = 'whr_test_key';
    process.env.HOOKBASE_API_URL = 'https://api.test.local';
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('status filters', () => {
    it('list_deliveries accepts every inbound status and nothing that does not exist', async () => {
      const { tool } = await setup();
      const schema = tool('hookbase_list_deliveries').inputSchema;
      for (const status of INBOUND) expect(schema.safeParse({ status }).success, status).toBe(true);
      for (const status of ['success', 'retrying', 'dlq', 'processing']) expect(schema.safeParse({ status }).success, status).toBe(false);
    });

    it('list_outbound_messages accepts every outbound status', async () => {
      const { tool } = await setup();
      const schema = tool('hookbase_list_outbound_messages').inputSchema;
      for (const status of OUTBOUND) expect(schema.safeParse({ status }).success, status).toBe(true);
      for (const status of ['delivered', 'retrying', 'queued']) expect(schema.safeParse({ status }).success, status).toBe(false);
    });

    it('sends the status filter through unchanged', async () => {
      const { tool, calls } = await setup([
        { match: '/deliveries', method: 'GET', response: () => json({ deliveries: [] }) },
        { match: '/outbound-messages', method: 'GET', response: () => json({ data: [], pagination: { hasMore: false, nextCursor: null } }) },
      ]);
      await tool('hookbase_list_deliveries').handler({ status: 'held' } as never);
      await tool('hookbase_list_outbound_messages').handler({ status: 'fifo_waiting' } as never);
      expect(new URL(calls()[0].url).searchParams.get('status')).toBe('held');
      expect(new URL(calls()[1].url).searchParams.get('status')).toBe('fifo_waiting');
    });
  });

  describe('outputs', () => {
    const heldDelivery = {
      id: 'd1', eventId: 'e1', routeId: 'r1', destinationId: 'x1', status: 'held',
      attemptCount: 2, maxAttempts: 13, nextRetryAt: null, holdExpiresAt: HOLD_ENDS, createdAt: '2026-11-07T00:00:00Z',
    };

    it('list_deliveries and get_delivery return holdExpiresAt', async () => {
      const { tool } = await setup([
        { match: '/deliveries/d1', method: 'GET', response: () => json({ delivery: heldDelivery }) },
        { match: '/deliveries', method: 'GET', response: () => json({ deliveries: [heldDelivery] }) },
      ]);
      const list = await tool('hookbase_list_deliveries').handler({} as never) as { deliveries: Array<Record<string, unknown>> };
      expect(list.deliveries[0]).toMatchObject({ status: 'held', nextRetryAt: null, holdExpiresAt: HOLD_ENDS });
      const one = await tool('hookbase_get_delivery').handler({ delivery_id: 'd1' } as never) as { delivery: Record<string, unknown> };
      expect(one.delivery).toMatchObject({ status: 'held', holdExpiresAt: HOLD_ENDS });
    });

    it('list_outbound_messages returns holdExpiresAt', async () => {
      const { tool } = await setup([{
        match: '/outbound-messages', method: 'GET',
        response: () => json({
          data: [{ id: 'm1', eventId: 'e1', eventType: 'order.created', applicationId: 'a1', endpointId: 'p1', status: 'held', attempts: 0, maxAttempts: 15, holdExpiresAt: HOLD_ENDS, createdAt: '2026-11-07T00:00:00Z' }],
          pagination: { hasMore: false, nextCursor: null },
        }),
      }]);
      const result = await tool('hookbase_list_outbound_messages').handler({} as never) as { messages: Array<Record<string, unknown>> };
      expect(result.messages[0]).toMatchObject({ status: 'held', holdExpiresAt: HOLD_ENDS });
    });

    it('send_event returns messagesHeld when the API sends it, and leaves it out when it does not', async () => {
      const sent = { eventId: 'e1', messagesQueued: 3, endpoints: [] };
      let held = true;
      const { tool } = await setup([{
        match: '/send-event', method: 'POST',
        response: () => json({ data: held ? { ...sent, messagesHeld: 2 } : sent }),
      }]);
      const withHeld = await tool('hookbase_send_event').handler({ event_type: 'order.created', payload: {} } as never);
      expect(withHeld).toMatchObject({ messagesQueued: 3, messagesHeld: 2 });
      held = false;
      const without = await tool('hookbase_send_event').handler({ event_type: 'order.created', payload: {} } as never);
      expect(JSON.parse(JSON.stringify(without))).not.toHaveProperty('messagesHeld');
    });

    it('get_route and list_routes return the hold setting; get_route the held count', async () => {
      const { tool } = await setup([
        { match: '/routes/r1', method: 'GET', response: () => json({ route: { id: 'r1', name: 'R', priority: 0, isActive: true, holdOnCircuitOpen: false, heldCount: 10000, heldCountCapped: true } }) },
        { match: '/routes', method: 'GET', response: () => json({ routes: [{ id: 'r1', name: 'R', priority: 0, isActive: true, holdOnCircuitOpen: true }] }) },
      ]);
      const one = await tool('hookbase_get_route').handler({ route_id: 'r1' } as never) as { route: Record<string, unknown> };
      expect(one.route).toMatchObject({ holdOnCircuitOpen: false, heldCount: 10000, heldCountCapped: true });
      const list = await tool('hookbase_list_routes').handler({} as never) as { routes: Array<Record<string, unknown>> };
      expect(list.routes[0]).toMatchObject({ holdOnCircuitOpen: true });
    });

    it('get_endpoint and list_endpoints return the hold setting; get_endpoint the held count', async () => {
      const { tool } = await setup([
        { match: '/webhook-endpoints/p1', method: 'GET', response: () => json({ data: { id: 'p1', applicationId: 'a1', url: 'https://x.test', isDisabled: false, holdOnCircuitOpen: true, heldCount: 42, heldCountCapped: false } }) },
        { match: '/webhook-endpoints', method: 'GET', response: () => json({ data: [{ id: 'p1', applicationId: 'a1', url: 'https://x.test', isDisabled: false, holdOnCircuitOpen: false }], pagination: { hasMore: false, nextCursor: null } }) },
      ]);
      const one = await tool('hookbase_get_endpoint').handler({ endpoint_id: 'p1' } as never) as { endpoint: Record<string, unknown> };
      expect(one.endpoint).toMatchObject({ holdOnCircuitOpen: true, heldCount: 42, heldCountCapped: false });
      const list = await tool('hookbase_list_endpoints').handler({} as never) as { endpoints: Array<Record<string, unknown>> };
      expect(list.endpoints[0]).toMatchObject({ holdOnCircuitOpen: false });
    });
  });

  describe('hold_on_circuit_open input', () => {
    const cases: Array<{ tool: string; match: string; method: string; args: Record<string, unknown>; response: unknown }> = [
      { tool: 'hookbase_create_route', match: '/routes', method: 'POST', args: { name: 'R', source_id: SOURCE_UUID, destination_id: 'd1' }, response: { route: { id: 'r1' } } },
      { tool: 'hookbase_update_route', match: '/routes/r1', method: 'PATCH', args: { route_id: 'r1' }, response: { route: { id: 'r1' } } },
      { tool: 'hookbase_create_endpoint', match: '/webhook-endpoints', method: 'POST', args: { application_id: 'a1', url: 'https://x.test/hook' }, response: { data: { id: 'p1' } } },
      { tool: 'hookbase_update_endpoint', match: '/webhook-endpoints/p1', method: 'PATCH', args: { endpoint_id: 'p1' }, response: { data: { id: 'p1' } } },
    ];

    for (const c of cases) {
      it(`${c.tool} sends holdOnCircuitOpen only when given`, async () => {
        const { tool, calls } = await setup([{ match: c.match, method: c.method, response: () => json(c.response) }]);
        const t = tool(c.tool);
        for (const value of [true, false]) {
          await t.handler({ ...c.args, hold_on_circuit_open: value } as never);
          expect(calls().at(-1)!.body).toMatchObject({ holdOnCircuitOpen: value });
        }
        await t.handler(c.args as never);
        expect(calls().at(-1)!.body).not.toHaveProperty('holdOnCircuitOpen');
        expect(calls().every(call => call.method === c.method)).toBe(true);
      });

      it(`${c.tool} rejects a null or non-boolean hold_on_circuit_open`, async () => {
        const { tool } = await setup();
        const schema = tool(c.tool).inputSchema;
        expect(schema.safeParse({ ...c.args, hold_on_circuit_open: true }).success).toBe(true);
        expect(schema.safeParse({ ...c.args, hold_on_circuit_open: null }).success).toBe(false);
        expect(schema.safeParse({ ...c.args, hold_on_circuit_open: 'false' }).success).toBe(false);
      });
    }
  });
});
