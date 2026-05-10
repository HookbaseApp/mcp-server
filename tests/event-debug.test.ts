import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('hookbase_get_event_debug', () => {
  beforeEach(() => {
    process.env.HOOKBASE_API_KEY = 'whr_test_key';
    process.env.HOOKBASE_API_URL = 'https://api.test.local';
    delete process.env.HOOKBASE_ORG_ID;
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds a cURL hitting /ingest/{orgSlug}/{sourceSlug} as POST', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/api/auth/me')) {
        return new Response(
          JSON.stringify({
            organizations: [{ id: 'org_1', name: 'Acme', slug: 'acme' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('/events/evt_1')) {
        return new Response(
          JSON.stringify({
            event: {
              id: 'evt_1',
              source_id: 'src_1',
              source_name: 'GitHub',
              method: 'POST',
              path: '/ingest/acme/github',
              headers: {
                'content-type': 'application/json',
                'x-github-event': 'push',
                host: 'api.test.local',
                'x-forwarded-for': '1.2.3.4',
              },
              payload: { hello: 'world' },
              received_at: '2026-01-01T00:00:00Z',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('/sources/src_1')) {
        return new Response(
          JSON.stringify({ source: { id: 'src_1', name: 'GitHub', slug: 'github', provider: 'github' } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { initConfig } = await import('../src/lib/config.js');
    const init = await initConfig();
    expect('config' in init).toBe(true);

    const { eventTools } = await import('../src/tools/events.js');
    const debugTool = eventTools.find(t => t.name === 'hookbase_get_event_debug');
    expect(debugTool).toBeDefined();

    const result = (await debugTool!.handler({ event_id: 'evt_1' } as never)) as {
      curl: string;
      eventId: string;
    };

    expect(result.eventId).toBe('evt_1');
    expect(result.curl).toContain("curl -X POST 'https://api.test.local/ingest/acme/github'");
    expect(result.curl).toContain("-H 'content-type: application/json'");
    expect(result.curl).toContain("-H 'x-github-event: push'");
    // host and x-forwarded-* should be stripped
    expect(result.curl).not.toContain('host:');
    expect(result.curl).not.toContain('x-forwarded-for');
    expect(result.curl).toContain('"hello":"world"');
  });
});
