/**
 * Destination signing secrets, paged lists, update replies and a source's catalog provider:
 * - create_destination returns an http destination's signingSecret (shown only there) and
 *   hasSigningSecret; reveal/rotate_destination_secret call their endpoints, and rotate sends
 *   {gracePeriodSeconds} only when given.
 * - list_destinations / list_sources / list_routes send page and pageSize and return pagination.
 * - update_destination / update_route answer with a confirmation only (PATCH returns {success}).
 * - create_source sends catalogProvider only when given; get_source returns it.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

interface Call {
  url: string;
  method: string;
  body: Record<string, unknown> | undefined;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

const SECRET = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
const GRACE_ENDS = '2026-11-11T13:00:00.000Z';
const HTTP_DEST = {
  id: 'dst_1', name: 'Orders', slug: 'orders', type: 'http', url: 'https://x.test/hook', method: 'POST',
  hasSigningSecret: true, signingSecret: SECRET,
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

const pathOf = (url: string) => new URL(url).pathname;

describe('destination tools', () => {
  beforeEach(() => {
    process.env.HOOKBASE_API_KEY = 'whr_test_key';
    process.env.HOOKBASE_API_URL = 'https://api.test.local';
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('signing secrets', () => {
    it('create_destination returns an http destination\'s signingSecret and hasSigningSecret', async () => {
      const { tool } = await setup([
        { match: '/destinations', method: 'POST', response: () => json({ destination: HTTP_DEST }, 201) },
      ]);
      const result = await tool('hookbase_create_destination').handler({ name: 'Orders', url: 'https://x.test/hook' } as never) as {
        message: string; destination: Record<string, unknown>;
      };
      expect(result.destination).toMatchObject({ id: 'dst_1', hasSigningSecret: true, signingSecret: SECRET });
      expect(result.message).toContain('shown only in this reply');
      expect(result.message).toContain('webhook-signature');
      expect(result.message).toContain('hookbase_reveal_destination_secret');
    });

    it('create_destination returns signingSecret null for a type that does not sign', async () => {
      const { tool } = await setup([
        { match: '/destinations', method: 'POST', response: () => json({ destination: { id: 'dst_b', type: 'bridge', url: '', hasSigningSecret: false, signingSecret: null } }, 201) },
      ]);
      const result = await tool('hookbase_create_destination').handler({
        name: 'Bridge', type: 'bridge', config: { eventTypeSource: 'fixed', eventType: 'order.created' },
      } as never) as { message: string; destination: Record<string, unknown> };
      expect(result.destination).toMatchObject({ hasSigningSecret: false, signingSecret: null });
      expect(result.message).toBe('Destination created successfully');
    });

    it('get_destination returns hasSigningSecret and never a secret', async () => {
      const { tool } = await setup([
        { match: '/destinations/dst_1', method: 'GET', response: () => json({ destination: { ...HTTP_DEST, signingSecret: undefined } }) },
      ]);
      const result = await tool('hookbase_get_destination').handler({ destination_id: 'dst_1' } as never) as { destination: Record<string, unknown> };
      expect(result.destination.hasSigningSecret).toBe(true);
      expect(result.destination).not.toHaveProperty('signingSecret');
    });

    it('reveal_destination_secret reads GET /destinations/:id/reveal-secret', async () => {
      const { tool, calls } = await setup([
        { match: '/destinations/dst_1/reveal-secret', method: 'GET', response: () => json({ signingSecret: SECRET, previousSecretExpiresAt: GRACE_ENDS }) },
      ]);
      const result = await tool('hookbase_reveal_destination_secret').handler({ destination_id: 'dst_1' } as never);
      const [call] = calls();
      expect(call.method).toBe('GET');
      expect(pathOf(call.url)).toBe('/api/organizations/org_1/destinations/dst_1/reveal-secret');
      expect(call.body).toBeUndefined();
      expect(result).toStrictEqual({ signingSecret: SECRET, previousSecretExpiresAt: GRACE_ENDS });
    });

    it('reveal_destination_secret passes a 400 for a non-http destination through', async () => {
      const { tool } = await setup([
        { match: '/reveal-secret', method: 'GET', response: () => json({ error: 'Only HTTP destinations have a signing secret.', code: 'VALIDATION_ERROR' }, 400) },
      ]);
      const result = await tool('hookbase_reveal_destination_secret').handler({ destination_id: 'dst_q' } as never);
      expect(result).toStrictEqual({ error: 'Only HTTP destinations have a signing secret.' });
    });

    it('rotate_destination_secret posts to /rotate-secret and sends gracePeriodSeconds only when given', async () => {
      let expires: string | null = GRACE_ENDS;
      const { tool, calls } = await setup([
        { match: '/destinations/dst_1/rotate-secret', method: 'POST', response: () => json({ signingSecret: SECRET, previousSecretExpiresAt: expires }) },
      ]);
      const rotate = tool('hookbase_rotate_destination_secret');

      const withGrace = await rotate.handler({ destination_id: 'dst_1', grace_period_seconds: 600 } as never) as Record<string, unknown>;
      expect(calls()[0].method).toBe('POST');
      expect(pathOf(calls()[0].url)).toBe('/api/organizations/org_1/destinations/dst_1/rotate-secret');
      expect(calls()[0].body).toStrictEqual({ gracePeriodSeconds: 600 });
      expect(withGrace).toMatchObject({ signingSecret: SECRET, previousSecretExpiresAt: GRACE_ENDS });
      expect(withGrace.message).toContain(GRACE_ENDS);

      expires = null;
      const immediate = await rotate.handler({ destination_id: 'dst_1', grace_period_seconds: 0 } as never) as Record<string, unknown>;
      expect(calls()[1].body).toStrictEqual({ gracePeriodSeconds: 0 });
      expect(immediate).toMatchObject({ signingSecret: SECRET, previousSecretExpiresAt: null });
      expect(immediate.message).toContain('new secret only');

      await rotate.handler({ destination_id: 'dst_1' } as never);
      expect(calls()[2].body).toBeUndefined();
    });

    it('rotate_destination_secret accepts a whole grace period from 0 to 86400 seconds', async () => {
      const { tool } = await setup();
      const schema = tool('hookbase_rotate_destination_secret').inputSchema;
      for (const g of [0, 1, 3600, 86400]) expect(schema.safeParse({ destination_id: 'd', grace_period_seconds: g }).success, String(g)).toBe(true);
      for (const g of [-1, 86401, 1.5, '3600', null]) expect(schema.safeParse({ destination_id: 'd', grace_period_seconds: g }).success, String(g)).toBe(false);
    });
  });

  describe('paged lists', () => {
    const lists = [
      { tool: 'hookbase_list_destinations', path: '/destinations', key: 'destinations', item: { id: 'dst_1', name: 'D', type: 'http', url: 'https://x.test' } },
      { tool: 'hookbase_list_sources', path: '/sources', key: 'sources', item: { id: 'src_1', name: 'S', slug: 's', provider: null } },
      { tool: 'hookbase_list_routes', path: '/routes', key: 'routes', item: { id: 'r1', name: 'R', priority: 0, isActive: true } },
    ];

    for (const l of lists) {
      it(`${l.tool} sends page and pageSize and returns pagination`, async () => {
        const pagination = { total: 47, page: 3, pageSize: 10 };
        const { tool, calls } = await setup([
          { match: l.path, method: 'GET', response: () => json({ [l.key]: [l.item], pagination }) },
        ]);
        const t = tool(l.tool);

        const result = await t.handler({ page: 3, page_size: 10 } as never) as Record<string, unknown>;
        const paged = new URL(calls()[0].url);
        expect(paged.pathname).toBe(`/api/organizations/org_1${l.path}`);
        expect(paged.searchParams.get('page')).toBe('3');
        expect(paged.searchParams.get('pageSize')).toBe('10');
        expect(result.pagination).toStrictEqual(pagination);
        expect(result[l.key]).toHaveLength(1);

        await t.handler({} as never);
        expect(new URL(calls()[1].url).search).toBe('');
      });

      it(`${l.tool} accepts page >= 1 and page_size 1 to 100`, async () => {
        const { tool } = await setup();
        const schema = tool(l.tool).inputSchema;
        expect(schema.safeParse({}).success).toBe(true);
        expect(schema.safeParse({ page: 1, page_size: 1 }).success).toBe(true);
        expect(schema.safeParse({ page: 9, page_size: 100 }).success).toBe(true);
        for (const bad of [{ page: 0 }, { page: 1.5 }, { page_size: 0 }, { page_size: 101 }, { page_size: 2.5 }, { limit: 10 }]) {
          expect(schema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
        }
      });
    }
  });

  describe('update replies', () => {
    const updates = [
      { tool: 'hookbase_update_destination', match: '/destinations/dst_1', args: { destination_id: 'dst_1', name: 'Renamed' }, key: 'destination' },
      { tool: 'hookbase_update_route', match: '/routes/r1', args: { route_id: 'r1', name: 'Renamed' }, key: 'route' },
    ];

    for (const u of updates) {
      it(`${u.tool} returns a confirmation only`, async () => {
        const { tool, calls } = await setup([
          { match: u.match, method: 'PATCH', response: () => json({ success: true }) },
        ]);
        const result = await tool(u.tool).handler(u.args as never);
        expect(calls()).toHaveLength(1);
        expect(calls()[0].method).toBe('PATCH');
        expect(result).not.toHaveProperty(u.key);
        expect(Object.keys(result as object)).toEqual(['message']);
      });
    }
  });

  describe('catalog_provider', () => {
    it('create_source sends catalogProvider only when given', async () => {
      const { tool, calls } = await setup([
        { match: '/sources', method: 'POST', response: () => json({ source: { id: 'src_1', name: 'SF', slug: 'sf', provider: 'custom' } }, 201) },
      ]);
      const create = tool('hookbase_create_source');
      await create.handler({ name: 'SF', slug: 'sf', provider: 'custom', catalog_provider: 'salesforce' } as never);
      expect(calls()[0].body).toMatchObject({ provider: 'custom', catalogProvider: 'salesforce' });
      await create.handler({ name: 'SF', slug: 'sf2', provider: 'custom' } as never);
      expect(calls()[1].body).not.toHaveProperty('catalogProvider');
    });

    it('create_source passes the API\'s 400 for an unknown catalog id through', async () => {
      const { tool } = await setup([
        { match: '/sources', method: 'POST', response: () => json({ error: 'Unknown catalogProvider: nope' }, 400) },
      ]);
      const result = await tool('hookbase_create_source').handler({ name: 'X', slug: 'x', catalog_provider: 'nope' } as never);
      expect(result).toStrictEqual({ error: 'Unknown catalogProvider: nope' });
    });

    it('update_source has no catalog_provider (it is create-only)', async () => {
      const { tool } = await setup();
      const schema = tool('hookbase_update_source').inputSchema;
      expect(schema.safeParse({ source_id: 's', catalog_provider: 'salesforce' }).success).toBe(false);
    });

    it('get_source returns catalogProvider, and null when the API has none', async () => {
      let catalogProvider: string | undefined = 'salesforce';
      const { tool } = await setup([
        { match: '/sources/src_1', method: 'GET', response: () => json({ source: { id: 'src_1', name: 'SF', slug: 'sf', provider: 'custom', catalogProvider } }) },
      ]);
      const get = tool('hookbase_get_source');
      const one = await get.handler({ source_id: 'src_1' } as never) as { source: Record<string, unknown> };
      expect(one.source.catalogProvider).toBe('salesforce');
      catalogProvider = undefined;
      const older = await get.handler({ source_id: 'src_1' } as never) as { source: Record<string, unknown> };
      expect(older.source.catalogProvider).toBeNull();
    });
  });
});
