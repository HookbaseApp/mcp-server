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
  const all = [...sourceTools, ...providerCatalogTools, ...routeTools];
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
