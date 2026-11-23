/**
 * Catalog text the docs page (www receive/mcp/tools.mdx, generated from this catalog) used to add
 * by hand: nested fields that had no description, the subscription filter and transform rules,
 * and the null that removes a subscription's filter or transform, which the schema refused.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

type Schema = { description?: string; properties?: Record<string, Schema>; items?: Schema; anyOf?: Schema[] };

/** Every field under `schema` that has no description, as a dotted path. */
function undescribed(schema: Schema, path: string): string[] {
  const own = path && !schema.description ? [path] : [];
  const inner = Object.entries(schema.properties ?? {}).flatMap(([key, value]) => undescribed(value, path ? `${path}.${key}` : key));
  const items = schema.items ? undescribed({ ...schema.items, description: 'items' }, `${path}[]`) : [];
  return [...own, ...inner, ...items];
}

describe('catalog text', () => {
  beforeEach(() => {
    process.env.HOOKBASE_API_KEY = 'whr_test_key';
    process.env.HOOKBASE_API_URL = 'https://api.test.local';
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('describes every field of a cluster replay and of a redaction rule', async () => {
    const { allTools, toolInputSchema } = await import('../src/catalog.js');
    const fields = (name: string, key: string) => {
      const tool = allTools.find((t) => t.name === name)!;
      return undescribed((toolInputSchema(tool) as Schema).properties![key], key);
    };
    expect(['transform_override', 'headers_override', 'persist_transform'].flatMap((key) => fields('hookbase_replay_cluster', key))).toEqual([]);
    expect(fields('hookbase_replay_with_edit', 'transform_override')).toEqual([]);
    for (const name of ['hookbase_create_redaction_policy', 'hookbase_update_redaction_policy', 'hookbase_preview_redaction_policy']) {
      expect(fields(name, 'rules'), name).toEqual([]);
    }
  });

  it("states a subscription filter's and transform's rules where the model reads them", async () => {
    const { allTools, toolInputSchema } = await import('../src/catalog.js');
    const props = (toolInputSchema(allTools.find((t) => t.name === 'hookbase_create_subscription')!) as Schema).properties!;
    expect(props.filter_expression.description).toMatch(/at send time \(max 1000 chars\).*rejected when saved/s);
    expect(props.transform_id.description).toMatch(/before signing.*`transform_failed`/s);
  });

  it('removes a subscription filter or transform with null', async () => {
    const calls: Array<{ method: string; url: string; body: unknown }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/auth/me')) return json({ organizations: [{ id: 'org_1', name: 'Acme', slug: 'acme' }] });
      calls.push({ method: init?.method ?? 'GET', url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return json({ data: { id: 'sub_1' } });
    }));
    const { initConfig } = await import('../src/lib/config.js');
    await initConfig();
    const { allTools } = await import('../src/tools/index.js');
    const tool = allTools.find((t) => t.name === 'hookbase_update_subscription') as unknown as {
      inputSchema: { safeParse: (v: unknown) => { success: boolean } };
      handler: (args: never) => Promise<unknown>;
    };
    const args = { subscription_id: 'sub_1', filter_expression: null, transform_id: null };
    expect(tool.inputSchema.safeParse(args).success).toBe(true);
    await tool.handler(args as never);
    expect(calls).toEqual([{ method: 'PATCH', url: expect.stringContaining('/webhook-subscriptions/sub_1'), body: { filterExpression: null, transformId: null } }]);
  });
});
