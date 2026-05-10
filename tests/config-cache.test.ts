import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const TEST_KEY = 'whr_test_cache_abcdef';
const TEST_URL = 'https://api.example.test';

let xdgDir: string;
let originalFetch: typeof globalThis.fetch;

beforeEach(async () => {
  vi.resetModules();
  xdgDir = await fs.mkdtemp(path.join(tmpdir(), 'hookbase-mcp-cache-'));
  process.env.XDG_CONFIG_HOME = xdgDir;
  process.env.HOOKBASE_API_KEY = TEST_KEY;
  process.env.HOOKBASE_API_URL = TEST_URL;
  delete process.env.HOOKBASE_ORG_ID;
  delete process.env.HOOKBASE_NO_CACHE;
  originalFetch = globalThis.fetch;
});

afterEach(async () => {
  globalThis.fetch = originalFetch;
  await fs.rm(xdgDir, { recursive: true, force: true });
});

describe('config cache', () => {
  it('writes the cache after a successful /auth/me and reuses it on the next init', async () => {
    let fetchCalls = 0;
    globalThis.fetch = vi.fn(async () => {
      fetchCalls++;
      return new Response(
        JSON.stringify({ organizations: [{ id: 'org_1', name: 'Acme', slug: 'acme' }] }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }) as typeof globalThis.fetch;

    const first = await import('../src/lib/config.js');
    const r1 = await first.initConfig();
    expect('config' in r1).toBe(true);
    if ('config' in r1) {
      expect(r1.config.orgId).toBe('org_1');
      expect(r1.config.orgSlug).toBe('acme');
    }
    expect(fetchCalls).toBe(1);

    const cacheFile = path.join(xdgDir, 'hookbase', 'mcp.json');
    const raw = JSON.parse(await fs.readFile(cacheFile, 'utf8'));
    expect(raw.version).toBe(1);
    expect(Object.keys(raw.entries)).toHaveLength(1);

    vi.resetModules();
    const second = await import('../src/lib/config.js');
    const r2 = await second.initConfig();
    expect('config' in r2).toBe(true);
    if ('config' in r2) {
      expect(r2.config.orgId).toBe('org_1');
    }
    // Cache hit — no second network call
    expect(fetchCalls).toBe(1);
  });

  it('bypasses the cache when HOOKBASE_NO_CACHE=1', async () => {
    let fetchCalls = 0;
    globalThis.fetch = vi.fn(async () => {
      fetchCalls++;
      return new Response(
        JSON.stringify({ organizations: [{ id: 'org_1', name: 'Acme', slug: 'acme' }] }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }) as typeof globalThis.fetch;

    process.env.HOOKBASE_NO_CACHE = '1';

    const first = await import('../src/lib/config.js');
    await first.initConfig();
    vi.resetModules();
    const second = await import('../src/lib/config.js');
    await second.initConfig();
    expect(fetchCalls).toBe(2);
  });
});
