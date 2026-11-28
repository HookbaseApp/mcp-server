import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

interface Call {
  url: string;
  method: string;
  body: Record<string, unknown> | undefined;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

const SOURCE_UUID = '11111111-2222-4333-8444-555555555555';

/** Stubs fetch with /api/auth/me plus `routes` (first matching url substring + method wins). */
async function setup(routes: Array<{ match: string; method?: string; response: () => Response }>) {
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
  const { sourceTools } = await import('../src/tools/sources.js');
  const { providerCatalogTools } = await import('../src/tools/provider-catalog.js');
  const { routeTools } = await import('../src/tools/routes.js');
  const { eventTools } = await import('../src/tools/events.js');
  const all = [...sourceTools, ...providerCatalogTools, ...routeTools, ...eventTools];
  const tool = (name: string) => {
    const t = all.find(x => x.name === name);
    if (!t) throw new Error(`no tool ${name}`);
    return t as { handler: (args: never) => Promise<unknown>; inputSchema: { safeParse: (v: unknown) => { success: boolean } } };
  };
  return { calls: () => calls.filter(c => !c.url.endsWith('/api/auth/me')), tool };
}

describe('source tools', () => {
  beforeEach(() => {
    process.env.HOOKBASE_API_KEY = 'whr_test_key';
    process.env.HOOKBASE_API_URL = 'https://api.test.local';
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('accepts any provider string (the API validates it) and sends signing_secret / verify_token', async () => {
    const { tool, calls } = await setup([{
      match: '/api/organizations/org_1/sources',
      method: 'POST',
      response: () => json({
        source: {
          id: 's1', name: 'WA', slug: 'wa', provider: 'whatsapp',
          signingSecret: 'app-secret', verifyToken: 'vt_123', awaitingSigningSecret: false,
          verifiesWithoutSecret: false, ingestUrl: 'https://api.test.local/ingest/acme/wa',
          hasSigningSecret: true, signingSecretLast4: 'cret',
        },
      }),
    }]);
    const create = tool('hookbase_create_source');
    // Previously a 24-value enum: real providers like sendgrid/whatsapp failed client-side.
    expect(create.inputSchema.safeParse({ name: 'x', slug: 'x', provider: 'sendgrid' }).success).toBe(true);

    const result = await create.handler({
      name: 'WA', slug: 'wa', provider: 'whatsapp', signing_secret: 'app-secret', verify_token: 'vt_123',
    } as never) as { source: Record<string, unknown> };

    expect(calls()[0].body).toMatchObject({ provider: 'whatsapp', signingSecret: 'app-secret', verifyToken: 'vt_123' });
    expect(result.source).toEqual({
      id: 's1', name: 'WA', slug: 'wa', provider: 'whatsapp',
      ingestUrl: 'https://api.test.local/ingest/acme/wa',
      signingSecret: 'app-secret', verifyToken: 'vt_123',
      awaitingSigningSecret: false, verifiesWithoutSecret: false,
    });
  });

  it('returns signingSecret: null and awaitingSigningSecret for secret-after-registration providers', async () => {
    const { tool, calls } = await setup([{
      match: '/sources', method: 'POST',
      response: () => json({ source: { id: 's2', name: 'N', slug: 'n', provider: 'notion', signingSecret: null, awaitingSigningSecret: true, verifiesWithoutSecret: false, ingestUrl: 'u' } }),
    }]);
    const result = await tool('hookbase_create_source').handler({ name: 'N', slug: 'n', provider: 'notion' } as never) as { source: Record<string, unknown> };
    expect(calls()[0].body).not.toHaveProperty('signingSecret');
    expect(result.source.signingSecret).toBeNull();
    expect(result.source.awaitingSigningSecret).toBe(true);
    expect(result.source).not.toHaveProperty('verifyToken');
  });

  it('update forwards null signing_secret / verify_token and does not echo a source', async () => {
    const { tool, calls } = await setup([{ match: '/sources/my-src', method: 'PATCH', response: () => json({ success: true }) }]);
    const update = tool('hookbase_update_source');
    expect(update.inputSchema.safeParse({ source_id: 'my-src', signing_secret: null, verify_token: null }).success).toBe(true);
    const result = await update.handler({ source_id: 'my-src', signing_secret: null, verify_token: null } as never);
    expect(calls()[0].body).toEqual({ signingSecret: null, verifyToken: null });
    expect(result).toEqual({ message: 'Source updated successfully' });
  });

  it('get_source exposes awaitingSigningSecret and verifiesWithoutSecret', async () => {
    const { tool } = await setup([{
      match: '/sources/wise-src', method: 'GET',
      response: () => json({ source: { id: 's3', name: 'Wise', slug: 'wise-src', provider: 'wise', hasSigningSecret: false, verifiesWithoutSecret: true, awaitingSigningSecret: false } }),
    }]);
    const result = await tool('hookbase_get_source').handler({ source_id: 'wise-src' } as never) as { source: Record<string, unknown> };
    expect(result.source.verifiesWithoutSecret).toBe(true);
    expect(result.source.awaitingSigningSecret).toBe(false);
  });

  it.each([
    ['hookbase_reveal_source_secret', 'GET', '/sources/s1/reveal-secret', { signingSecret: 'sek' }, { signingSecret: 'sek' }],
    ['hookbase_get_source_verify_token', 'GET', '/sources/s1/verify-token', { verifyToken: 'vt' }, { verifyToken: 'vt' }],
    ['hookbase_rotate_source_verify_token', 'POST', '/sources/s1/rotate-verify-token', { verifyToken: 'vt2' }, { verifyToken: 'vt2' }],
    ['hookbase_get_source_pending_verification', 'GET', '/sources/s1/pending-verification',
      { provider: 'notion', token: 'secret_x', receivedAt: '2026-10-01T00:00:00Z', clientIp: null },
      { pendingVerification: { provider: 'notion', token: 'secret_x', receivedAt: '2026-10-01T00:00:00Z', clientIp: null } }],
    ['hookbase_adopt_source_pending_verification', 'POST', '/sources/s1/pending-verification/adopt', { success: true }, {}],
  ])('%s calls %s %s', async (name, method, path, response, expected) => {
    const { tool, calls } = await setup([{ match: path, method, response: () => json(response) }]);
    const result = await tool(name).handler({ source_id: 's1' } as never) as Record<string, unknown>;
    expect(calls()).toHaveLength(1);
    expect(calls()[0].method).toBe(method);
    expect(calls()[0].url).toBe(`https://api.test.local/api/organizations/org_1${path}`);
    expect(result).toMatchObject(expected);
  });

  it('surfaces API 400s (e.g. rotating a vendor-issued secret) as errors', async () => {
    const { tool } = await setup([{
      match: '/rotate-secret', method: 'POST',
      response: () => json({ error: 'clerk issues its own signing secret' }, 400),
    }]);
    const result = await tool('hookbase_rotate_source_secret').handler({ source_id: 's1' } as never);
    expect(result).toEqual({ error: 'clerk issues its own signing secret' });
  });

  it('pending verification 404 is an error, not an empty success', async () => {
    const { tool } = await setup([{
      match: '/pending-verification', method: 'GET',
      response: () => json({ error: 'No verification token is waiting for this source' }, 404),
    }]);
    const result = await tool('hookbase_get_source_pending_verification').handler({ source_id: 's1' } as never);
    expect(result).toEqual({ error: 'No verification token is waiting for this source' });
  });
});

const CONNECTION = {
  id: 'c1', provider: 'stripe', environment: 'live', status: 'active', credentialHint: 'rk_live_…a1b2',
  credentialExpiresAt: null, accountLabel: 'Stripe (live mode)', remoteId: 'we_123', events: ['*'],
  priorSourceSettings: { provider: null, hadSigningSecret: false }, githubTarget: null,
  reconcileEnabled: true, running: false, nextRunAt: '2026-11-27T12:15:00Z', lastRunAt: '2026-11-27T12:00:00Z',
  lastRun: { startedAt: '2026-11-27T12:00:00Z', finishedAt: '2026-11-27T12:00:02Z', found: 2, alreadyReceived: 0, recovered: 2, requested: 0, gaveUp: 0, behind: false, stoppedReason: 'caught_up' },
  lastError: null, consecutiveFailures: 0, recoveredTotal: 7,
  createdAt: '2026-11-20T00:00:00Z', updatedAt: '2026-11-27T12:00:02Z',
};

describe('source connection tools', () => {
  beforeEach(() => {
    process.env.HOOKBASE_API_KEY = 'whr_test_key';
    process.env.HOOKBASE_API_URL = 'https://api.test.local';
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const ORG = 'https://api.test.local/api/organizations/org_1';

  it.each([
    ['hookbase_get_source_connection', {}, 'GET', '/sources/s1/connection', undefined,
      { connection: CONNECTION }, { connection: CONNECTION }],
    ['hookbase_list_source_recovery_items', {}, 'GET', '/sources/s1/connection/items', undefined,
      { items: [] }, { items: [] }],
    ['hookbase_list_source_recovery_items', { status: 'gave_up', limit: 10 }, 'GET', '/sources/s1/connection/items?status=gave_up&limit=10', undefined,
      { items: [] }, { items: [] }],
    ['hookbase_run_source_recovery', {}, 'POST', '/sources/s1/connection/reconcile', undefined,
      { queued: true }, { queued: true }],
    ['hookbase_set_source_recovery', { reconcile_enabled: false }, 'PATCH', '/sources/s1/connection', { reconcileEnabled: false },
      { connection: { ...CONNECTION, reconcileEnabled: false } }, { message: 'Recovery turned off.', connection: { ...CONNECTION, reconcileEnabled: false } }],
    ['hookbase_set_source_recovery', { reconcile_enabled: true }, 'PATCH', '/sources/s1/connection', { reconcileEnabled: true },
      { connection: CONNECTION }, { message: 'Recovery turned on.', connection: CONNECTION }],
    ['hookbase_disconnect_source', {}, 'DELETE', '/sources/s1/connection', undefined,
      { success: true, remoteRemoved: true, retrying: false, message: null }, { success: true, remoteRemoved: true, retrying: false }],
  ])('%s %j calls %s %s', async (name, extra, method, path, body, response, expected) => {
    const { tool, calls } = await setup([{ match: '/connection', method, response: () => json(response) }]);
    const args = { source_id: 's1', ...extra };
    expect(tool(name).inputSchema.safeParse(args).success).toBe(true);
    const result = await tool(name).handler(args as never) as Record<string, unknown>;
    expect(calls()).toHaveLength(1);
    expect(calls()[0].method).toBe(method);
    expect(calls()[0].url).toBe(`${ORG}${path}`);
    expect(calls()[0].body).toEqual(body);
    expect(result).toMatchObject(expected);
  });

  it('encodes the source id or slug as one path segment', async () => {
    const { tool, calls } = await setup([{ match: '/connection', method: 'GET', response: () => json({ connection: null }) }]);
    await tool('hookbase_get_source_connection').handler({ source_id: 'a/b?c' } as never);
    expect(calls()[0].url).toBe(`${ORG}/sources/a%2Fb%3Fc/connection`);
  });

  it('get_source_connection says when the source is not connected', async () => {
    const { tool } = await setup([{ match: '/sources/s1/connection', method: 'GET', response: () => json({ connection: null }) }]);
    const result = await tool('hookbase_get_source_connection').handler({ source_id: 's1' } as never) as Record<string, unknown>;
    expect(result.connection).toBeNull();
    expect(result.message).toMatch(/not connected/);
    expect(result.message).toMatch(/dashboard/);
  });

  it('get_source_connection copies fields by name, so nothing else the API sends reaches the model', async () => {
    const { tool } = await setup([{
      match: '/sources/s1/connection', method: 'GET',
      response: () => json({ connection: { ...CONNECTION, credential: 'rk_live_SHOULD_NOT_APPEAR', credentialEnc: 'enc:v1:x' } }),
    }]);
    const result = await tool('hookbase_get_source_connection').handler({ source_id: 's1' } as never);
    expect(result).toStrictEqual({ connection: CONNECTION });
    expect(JSON.stringify(result)).not.toContain('SHOULD_NOT_APPEAR');
  });

  it('list_source_recovery_items maps each item', async () => {
    const item = {
      providerEventId: 'evt_1', method: 'self_ingest', status: 'recovered', attempts: 1, providerRef: null,
      eventId: '33333333-4444-4555-8666-777777777777', firstSeenAt: '2026-11-27T12:00:00Z',
      lastAttemptAt: '2026-11-27T12:00:01Z', recoveredAt: '2026-11-27T12:00:01Z',
    };
    const { tool } = await setup([{ match: '/connection/items', method: 'GET', response: () => json({ items: [item] }) }]);
    const result = await tool('hookbase_list_source_recovery_items').handler({ source_id: 's1' } as never);
    expect(result).toStrictEqual({ items: [item] });
  });

  it('list_source_recovery_items takes only a known status and a limit of 1 to 100', async () => {
    const { tool } = await setup([]);
    const list = tool('hookbase_list_source_recovery_items');
    expect(list.inputSchema.safeParse({ source_id: 's1', status: 'failed' }).success).toBe(false);
    expect(list.inputSchema.safeParse({ source_id: 's1', limit: 0 }).success).toBe(false);
    expect(list.inputSchema.safeParse({ source_id: 's1', limit: 101 }).success).toBe(false);
    expect(list.inputSchema.safeParse({ source_id: 's1', status: 'pending', limit: 100 }).success).toBe(true);
  });

  it('run_source_recovery surfaces a 409 refusal with its code and reason', async () => {
    const { tool } = await setup([{
      match: '/connection/reconcile', method: 'POST',
      response: () => json({ error: 'Recovery is running for this source now.', code: 'RECONCILE_REFUSED', reason: 'running' }, 409),
    }]);
    const result = await tool('hookbase_run_source_recovery').handler({ source_id: 's1' } as never);
    expect(result).toStrictEqual({ error: 'Recovery is running for this source now.', code: 'RECONCILE_REFUSED', reason: 'running' });
  });

  it('run_source_recovery passes the plan refusal (403) through as an error', async () => {
    const { tool } = await setup([{
      match: '/connection/reconcile', method: 'POST',
      response: () => json({ error: 'Recovering missed events needs the Pro or Business plan.' }, 403),
    }]);
    const result = await tool('hookbase_run_source_recovery').handler({ source_id: 's1' } as never);
    expect(result).toStrictEqual({ error: 'Recovering missed events needs the Pro or Business plan.' });
  });

  it('keeps retryAfter from a 429 body and drops fields of the wrong type', async () => {
    const { tool } = await setup([
      { match: '/sources/limited/connection', method: 'PATCH', response: () => json({ error: 'Too many requests', code: 'RATE_LIMITED', retryAfter: 120 }, 429) },
      { match: '/sources/odd/connection', method: 'PATCH', response: () => json({ error: 'Nope', code: 7, reason: { x: 1 }, retryAfter: '120' }, 409) },
    ]);
    const set = tool('hookbase_set_source_recovery');
    expect(await set.handler({ source_id: 'limited', reconcile_enabled: true } as never))
      .toStrictEqual({ error: 'Too many requests', code: 'RATE_LIMITED', retryAfter: 120 });
    expect(await set.handler({ source_id: 'odd', reconcile_enabled: true } as never)).toStrictEqual({ error: 'Nope' });
  });

  it('disconnect_source surfaces CONNECTION_CONFLICT and a 404 for a source that is not connected', async () => {
    const { tool } = await setup([
      { match: '/sources/busy/connection', method: 'DELETE', response: () => json({ error: 'A connect for this source is in progress.', code: 'CONNECTION_CONFLICT' }, 409) },
      { match: '/sources/plain/connection', method: 'DELETE', response: () => json({ error: 'This source is not connected' }, 404) },
    ]);
    const disconnect = tool('hookbase_disconnect_source');
    expect(await disconnect.handler({ source_id: 'busy' } as never))
      .toStrictEqual({ error: 'A connect for this source is in progress.', code: 'CONNECTION_CONFLICT' });
    expect(await disconnect.handler({ source_id: 'plain' } as never)).toStrictEqual({ error: 'This source is not connected' });
  });

  it('disconnect_source keeps the API message and explains a background retry', async () => {
    const stillThere = 'The webhook is still in Stripe (Stripe (live mode)): delete it there.';
    const { tool } = await setup([
      { match: '/sources/manual/connection', method: 'DELETE', response: () => json({ success: true, remoteRemoved: false, retrying: false, message: stillThere }) },
      { match: '/sources/retry/connection', method: 'DELETE', response: () => json({ success: true, remoteRemoved: false, retrying: true, message: null }) },
    ]);
    const disconnect = tool('hookbase_disconnect_source');
    expect(await disconnect.handler({ source_id: 'manual' } as never))
      .toStrictEqual({ success: true, remoteRemoved: false, retrying: false, message: stillThere });
    const retry = await disconnect.handler({ source_id: 'retry' } as never) as Record<string, unknown>;
    expect(retry).toMatchObject({ remoteRemoved: false, retrying: true });
    expect(retry.message).toMatch(/keeps trying/);
  });

  it('set_source_recovery rejects a credential in its input and never sends one', async () => {
    const KEY = 'rk_live_51SECRETKEYTEXT';
    const { tool, calls } = await setup([{ match: '/sources/s1/connection', method: 'PATCH', response: () => json({ connection: CONNECTION }) }]);
    const set = tool('hookbase_set_source_recovery');
    expect(set.inputSchema.safeParse({ source_id: 's1', reconcile_enabled: true, credential: KEY }).success).toBe(false);
    expect(set.inputSchema.safeParse({ source_id: 's1', credential: KEY }).success).toBe(false);
    // A host that skipped the schema still sends only reconcileEnabled.
    await set.handler({ source_id: 's1', reconcile_enabled: true, credential: KEY } as never);
    expect(calls()[0].body).toStrictEqual({ reconcileEnabled: true });
    expect(JSON.stringify(calls())).not.toContain(KEY);
  });

  it('no tool takes a provider key', async () => {
    const { allTools } = await import('../src/tools/index.js');
    const { z } = await import('../src/lib/zod.js');
    const names = allTools.map(t => t.name);
    expect(names).not.toContain('hookbase_connect_source');
    for (const t of allTools.filter(t => /connection|recovery|disconnect/.test(t.name))) {
      const props = Object.keys((z.toJSONSchema(t.inputSchema, { io: 'input' }) as { properties?: object }).properties ?? {});
      expect(props.filter(p => /credential|key|token/i.test(p)), t.name).toEqual([]);
    }
  });

  it('list_sources and get_source return the connection summary, null when absent', async () => {
    const summary = { provider: 'stripe', status: 'active', environment: 'live', reconcileEnabled: true };
    const { tool } = await setup([
      { match: '/sources/conn', method: 'GET', response: () => json({ source: { id: 's1', name: 'S', slug: 'conn', provider: 'stripe', connection: { ...summary, extra: 'x' } } }) },
      { match: '/sources/old', method: 'GET', response: () => json({ source: { id: 's2', name: 'O', slug: 'old', provider: null } }) },
      { match: '/sources', method: 'GET', response: () => json({
        sources: [
          { id: 's1', name: 'S', slug: 'conn', provider: 'stripe', connection: summary },
          { id: 's2', name: 'O', slug: 'old', provider: null, connection: null },
          { id: 's3', name: 'P', slug: 'pre', provider: null },
        ],
        pagination: { total: 3, page: 1, pageSize: 20 },
      }) },
    ]);
    const list = await tool('hookbase_list_sources').handler({} as never) as { sources: Array<Record<string, unknown>> };
    expect(list.sources.map(s => s.connection)).toStrictEqual([summary, null, null]);
    const got = await tool('hookbase_get_source').handler({ source_id: 'conn' } as never) as { source: Record<string, unknown> };
    expect(got.source.connection).toStrictEqual(summary);
    const old = await tool('hookbase_get_source').handler({ source_id: 'old' } as never) as { source: Record<string, unknown> };
    expect(old.source.connection).toBeNull();
  });

  it('get_event returns recovery, null when the event was not recovered', async () => {
    const event = { id: 'e1', sourceId: 's1', sourceName: 'S', eventType: 'invoice.paid', headers: {}, signatureValid: true, status: 'delivered', receivedAt: '2026-11-27T12:00:01Z' };
    const { tool } = await setup([
      { match: '/events/e1', method: 'GET', response: () => json({ event: { ...event, recovery: { method: 'self_ingest', recoveredAt: '2026-11-27T12:00:01Z' } }, payload: {}, deliveries: [] }) },
      { match: '/events/e2', method: 'GET', response: () => json({ event: { ...event, id: 'e2', recovery: null }, payload: {}, deliveries: [] }) },
      { match: '/events/e3', method: 'GET', response: () => json({ event: { ...event, id: 'e3' }, payload: {}, deliveries: [] }) },
    ]);
    const get = tool('hookbase_get_event');
    const recovered = await get.handler({ event_id: 'e1' } as never) as { event: Record<string, unknown> };
    expect(recovered.event.recovery).toStrictEqual({ method: 'self_ingest', recoveredAt: '2026-11-27T12:00:01Z' });
    for (const id of ['e2', 'e3']) {
      const plain = await get.handler({ event_id: id } as never) as { event: Record<string, unknown> };
      expect(plain.event.recovery).toBeNull();
    }
  });
});

describe('provider catalog tools', () => {
  beforeEach(() => {
    process.env.HOOKBASE_API_KEY = 'whr_test_key';
    process.env.HOOKBASE_API_URL = 'https://api.test.local';
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('list_providers passes filters and maps hookbaseProvider + signature summary', async () => {
    const { tool, calls } = await setup([{
      match: '/api/catalog/providers?', method: 'GET',
      response: () => json({
        providers: [
          { id: 'mollie-nextgen', name: 'Mollie', category: 'payments', description: 'd', icon: 'i', eventTypeCount: 3,
            hookbaseProvider: 'mollie', hasSignatureVerification: true, hasIpRanges: false,
            signatureVerification: { supported: true, kind: 'hmac', secretSource: 'provider', secretLabel: 'Signing secret' } },
        ],
        categories: ['payments'],
        total: 1,
      }),
    }]);
    const result = await tool('hookbase_list_providers').handler({ category: 'payments', search: 'mollie' } as never) as {
      providers: Array<Record<string, unknown>>; total: number; note?: string;
    };
    expect(calls()[0].url).toBe('https://api.test.local/api/catalog/providers?category=payments&search=mollie');
    expect(result.providers[0]).toMatchObject({ id: 'mollie-nextgen', hookbaseProvider: 'mollie' });
    expect((result.providers[0].signatureVerification as Record<string, unknown>).secretSource).toBe('provider');
    expect(result.total).toBe(1);
    expect(result.note).toBeUndefined();
  });

  it('list_providers notes when an older API omits the signature summary', async () => {
    const { tool } = await setup([{
      match: '/api/catalog/providers', method: 'GET',
      response: () => json({ providers: [{ id: 'stripe', name: 'Stripe', category: 'payments', hookbaseProvider: 'stripe', hasSignatureVerification: true }], categories: [], total: 1 }),
    }]);
    const result = await tool('hookbase_list_providers').handler({} as never) as { providers: Array<Record<string, unknown>>; note?: string };
    expect(result.providers[0].signatureVerification).toBeNull();
    expect(result.note).toMatch(/hookbase_get_provider/);
  });

  it('get_provider returns secret instructions, verify token and setup guide without sample payloads', async () => {
    const { tool, calls } = await setup([{
      match: '/api/catalog/providers/whatsapp', method: 'GET',
      response: () => json({
        provider: {
          id: 'whatsapp', name: 'WhatsApp', category: 'communication', description: 'd', docsUrl: 'https://x',
          hookbaseProvider: 'whatsapp', ipRanges: null, setupGuide: ['step 1'],
          eventTypes: [{ type: 'messages', description: 'm' }], samplePayloads: { messages: { big: true } },
          signatureVerification: {
            supported: true, algorithm: 'HMAC-SHA256', headerName: 'X-Hub-Signature-256', secretLocationHint: 'h',
            kind: 'hmac', secretSource: 'provider', secretLabel: 'App secret', secretInstruction: 'copy it',
            secretPlaceholder: 'abc', verifyToken: { label: 'Verify token', instruction: 'paste it' },
          },
        },
      }),
    }]);
    const result = await tool('hookbase_get_provider').handler({ provider_id: 'whatsapp' } as never) as { provider: Record<string, unknown> };
    expect(calls()[0].url).toBe('https://api.test.local/api/catalog/providers/whatsapp');
    expect(result.provider).not.toHaveProperty('samplePayloads');
    expect(result.provider.setupGuide).toEqual(['step 1']);
    expect(result.provider.eventTypes).toEqual(['messages']);
    expect(result.provider.signatureVerification).toMatchObject({
      secretSource: 'provider', secretLabel: 'App secret', secretInstruction: 'copy it', secretPlaceholder: 'abc',
      verifyToken: { label: 'Verify token', instruction: 'paste it' },
    });
  });
});

describe('route source resolution', () => {
  beforeEach(() => {
    process.env.HOOKBASE_API_KEY = 'whr_test_key';
    process.env.HOOKBASE_API_URL = 'https://api.test.local';
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('create_route resolves a source slug to its id before posting', async () => {
    const { tool, calls } = await setup([
      { match: '/sources/github-hooks', method: 'GET', response: () => json({ source: { id: SOURCE_UUID, name: 'GH', slug: 'github-hooks', provider: 'github' } }) },
      { match: '/routes', method: 'POST', response: () => json({ route: { id: 'r1', name: 'R', sourceId: SOURCE_UUID, destinationId: 'd1' } }) },
    ]);
    await tool('hookbase_create_route').handler({ name: 'R', source_id: 'github-hooks', destination_id: 'd1' } as never);
    const post = calls().find(c => c.method === 'POST')!;
    expect(post.body).toMatchObject({ sourceId: SOURCE_UUID });
  });

  it('create_route passes a UUID through without a lookup', async () => {
    const { tool, calls } = await setup([
      { match: '/routes', method: 'POST', response: () => json({ route: { id: 'r1', name: 'R', sourceId: SOURCE_UUID, destinationId: 'd1' } }) },
    ]);
    await tool('hookbase_create_route').handler({ name: 'R', source_id: SOURCE_UUID, destination_id: 'd1' } as never);
    expect(calls()).toHaveLength(1);
  });

  it('create_route reports an unknown slug without posting', async () => {
    const { tool, calls } = await setup([
      { match: '/sources/nope', method: 'GET', response: () => json({ error: 'Source not found' }, 404) },
    ]);
    const result = await tool('hookbase_create_route').handler({ name: 'R', source_id: 'nope', destination_id: 'd1' } as never);
    expect(result).toEqual({ error: 'Source not found' });
    expect(calls().some(c => c.method === 'POST')).toBe(false);
  });
});
