/**
 * Each tool's `routes` must be exactly what its handler calls. A host that runs the tools
 * in-process (the API's AI Assistant) refuses any request outside the list, so a missing route
 * breaks the tool there, and an extra one widens what it could reach.
 *
 * Every handler runs here against a recording fetch (runWithConfig's `fetch` option), once with
 * only its required arguments and once with all of them, with booleans both ways. Each string
 * argument gets a distinct value, so a path segment carrying one of them reads as a `:param`.
 */

import { describe, it, expect } from 'vitest';
import { z } from '../src/lib/zod.js';
import { allTools, toolsets, runWithConfig, toolInputSchema, parseToolArgs, type HookbaseTool } from '../src/catalog.js';

const ORG = '00000000-0000-4000-8000-0000000000aa';
const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

type JsonSchema = {
  type?: string | string[];
  enum?: unknown[];
  const?: unknown;
  format?: string;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  minimum?: number;
  exclusiveMinimum?: number;
  minItems?: number;
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
};

interface Variant { full: boolean; bool: boolean }
const VARIANTS: Variant[] = [
  { full: false, bool: true },
  { full: false, bool: false },
  { full: true, bool: true },
  { full: true, bool: false },
];

function synthesizer() {
  let n = 0;
  const values = new Set<string>();
  const fresh = (make: (i: number) => string) => {
    const value = make(++n);
    values.add(value);
    return value;
  };
  const uuid = () => fresh((i) => `aaaaaaaa-bbbb-4ccc-8ddd-${i.toString(16).padStart(12, '0')}`);
  const word = () => fresh((i) => `v${i}x`);

  function synth(s: JsonSchema, key: string, v: Variant): unknown {
    const alternatives = s.anyOf ?? s.oneOf;
    if (alternatives) return synth(alternatives.find((a) => a.type !== 'null') ?? alternatives[0], key, v);
    if (s.enum) return s.enum[0];
    if (s.const !== undefined) return s.const;
    const type = Array.isArray(s.type) ? s.type.find((t) => t !== 'null') : s.type;
    switch (type) {
      case 'string':
        if (s.format === 'uuid' || /(^id$|_id$|Id$)/.test(key)) return uuid();
        if (s.format === 'uri' || s.format === 'url' || /url$/i.test(key)) return 'https://example.com/hook';
        if (s.format === 'email') return 'a@b.co';
        if (s.format === 'date-time') return '2026-10-29T12:00:00Z';
        return word();
      case 'integer':
      case 'number':
        return s.minimum ?? (s.exclusiveMinimum !== undefined ? s.exclusiveMinimum + 1 : 1);
      case 'boolean':
        return v.bool;
      case 'array':
        return Array.from({ length: Math.max(1, s.minItems ?? 1) }, () => synth(s.items ?? { type: 'string' }, key.replace(/s$/, ''), v));
      case 'object': {
        const required = new Set(s.required ?? []);
        return Object.fromEntries(Object.entries(s.properties ?? {})
          .filter(([k]) => v.full || required.has(k))
          .map(([k, inner]) => [k, synth(inner, k, v)]));
      }
      default:
        return word();
    }
  }

  return { synth, uuid, word, values };
}

/** `GET /sources/:id` for a call to `.../api/organizations/<org>/sources/<a value we made up>`. */
function routeOf(method: string, url: string, values: Set<string>): string {
  const prefix = `/api/organizations/${ORG}`;
  const pathname = new URL(url).pathname;
  const path = pathname.startsWith(prefix) ? pathname.slice(prefix.length) || '/' : pathname;
  return `${method} ${path.split('/').map((s) => (values.has(decodeURIComponent(s)) ? ':param' : s)).join('/')}`;
}

function normalize(route: string): string {
  return route.replace(/:[A-Za-z]+/g, ':param');
}

async function callsOf(tool: HookbaseTool): Promise<{ calls: Set<string>; invalid: string[] }> {
  const { synth, uuid, word, values } = synthesizer();
  const slug = word();
  const calls = new Set<string>();
  const invalid: string[] = [];
  const schema = toolInputSchema(tool) as JsonSchema;

  for (const variant of VARIANTS) {
    const parsed = parseToolArgs(tool, synth(schema, '', variant));
    if (!parsed.ok) {
      invalid.push(parsed.error);
      continue;
    }
    // Lets a handler that reads one response before its next call (get_event_debug) get there.
    const sourceId = uuid();
    const body = JSON.stringify({ event: { id: uuid(), sourceId }, source: { id: sourceId, slug: word() } });
    const fetch = async (input: Request | string | URL, init?: RequestInit) => {
      calls.add(routeOf((init?.method ?? 'GET').toUpperCase(), String(input), values));
      return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    try {
      await runWithConfig({ apiUrl: 'https://api.test', apiKey: 'whr_test', orgId: ORG, orgSlug: slug }, () => tool.handler(parsed.args), { fetch });
    } catch {
      // The made-up body lacks most fields; the calls made before a handler trips on it count.
    }
  }
  return { calls, invalid };
}

describe('tool routes', () => {
  it('every tool lists its routes as METHOD /path', () => {
    for (const tool of allTools) {
      expect(tool.routes?.length, tool.name).toBeGreaterThan(0);
      for (const route of tool.routes) {
        const [method, path, ...rest] = route.split(' ');
        expect(METHODS.has(method) && rest.length === 0 && /^\/[A-Za-z0-9_\-/:]*$/.test(path), `${tool.name}: ${route}`).toBe(true);
      }
    }
  });

  it.each(allTools.map((tool) => [tool.name, tool] as const))('%s calls only, and all of, its routes', async (_name, tool) => {
    const { calls, invalid } = await callsOf(tool);
    expect(invalid, 'synthesized arguments must parse').toEqual([]);
    expect([...calls].sort()).toEqual([...new Set(tool.routes.map(normalize))].sort());
  });

  it('runs a handler through the fetch it was given', async () => {
    const tool = allTools.find((t) => t.name === 'hookbase_get_source')!;
    const seen: string[] = [];
    const fetch = async (input: Request | string | URL, init?: RequestInit) => {
      seen.push(`${init?.method} ${String(input)}`);
      return new Response(JSON.stringify({ source: { id: 's1', name: 'Main', slug: 'main' } }), { status: 200 });
    };
    const result = await runWithConfig(
      { apiUrl: 'https://api.test', apiKey: 'whr_test', orgId: ORG, orgSlug: 'acme' },
      () => tool.handler({ source_id: 's1' }),
      { fetch },
    );
    expect(seen).toEqual([`GET https://api.test/api/organizations/${ORG}/sources/s1`]);
    expect(JSON.stringify(result)).toContain('Main');
  });
});

describe('toolsets', () => {
  it('put every tool in exactly one group', () => {
    const grouped = Object.values(toolsets).flat().map((t) => t.name).sort();
    expect(grouped).toEqual(allTools.map((t) => t.name).sort());
  });
});

describe('catalog helpers', () => {
  it('parseToolArgs reports issues the way MCP clients see them', () => {
    const tool = allTools.find((t) => t.name === 'hookbase_get_delivery')!;
    expect(parseToolArgs(tool, {})).toEqual({ ok: false, error: 'delivery_id: Required' });
    expect(parseToolArgs(tool, { delivery_id: 'd1' })).toEqual({ ok: true, args: { delivery_id: 'd1' } });
  });

  it('toolInputSchema is the tools/list schema', () => {
    const tool = allTools.find((t) => t.name === 'hookbase_get_delivery')!;
    const schema = toolInputSchema(tool);
    expect(schema).not.toHaveProperty('$schema');
    expect(schema).toMatchObject({ type: 'object', required: ['delivery_id'] });
    expect(z.toJSONSchema(tool.inputSchema, { target: 'draft-7', io: 'input' })).toMatchObject(schema);
  });
});
