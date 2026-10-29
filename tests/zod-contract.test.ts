/**
 * What agents see must not change when zod does.
 *
 * Two things reach an MCP client from zod: the JSON Schema of every tool (tools/list, over both the
 * HTTP handler and the stdio SDK server, which convert schemas separately) and the text of an
 * argument error (`Invalid arguments for <tool>: <path>: <message>; ...`). The Better Stack monitor,
 * the MCP Server Card and the A2A agent card are all built from tools/list.
 *
 * tests/fixtures/zod-contract.json was recorded on zod 3. On any later zod this replays it:
 * - httpTools / httpPrompts / stdioTools: the listings, compared with object keys sorted
 * - schemas: for every tool and prompt, `{}`, a synthesized valid input, that plus an unknown key,
 *   and that with each top-level field swapped for each of VALUES, recording the parsed data or the
 *   issue text exactly as the handlers format it
 *
 * Regenerate (zod 3 only, the inputs come from zod 3 internals): ZOD_CONTRACT_WRITE=1 npx vitest run
 * tests/zod-contract.test.ts. Re-record results from the stored inputs on any version:
 * ZOD_CONTRACT_ACCEPT=1. Say in the commit what changed and why.
 *
 * Accepted on the move to zod 4:
 * - Parses: a wrong-type value also gets a length message after zod 3's (zod 4 runs `.min()` and
 *   `.max()` on anything with a `.length`). The first message for every field is unchanged.
 * - Listings: records add `propertyNames: {type: string}`; `guid()` fields add an any-hex `pattern`
 *   next to `format: uuid`; output_format inlines its enum instead of `$ref`-ing input_format;
 *   arrays gain `maxItems: 1000`; and strip-mode objects no longer claim
 *   `additionalProperties: false`, which they never enforced (unknown keys are dropped, not
 *   rejected). `required` and every `description` are unchanged.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { handleMcpRequest } from '../src/http/handler.js';
import { createServer } from '../src/server.js';
import { allTools } from '../src/tools/index.js';
import { hookbasePrompts } from '../src/prompts/index.js';

const FIXTURE = join(__dirname, 'fixtures', 'zod-contract.json');
const DIFF = join(__dirname, 'fixtures', 'zod-contract.diff.txt');
const WRITE = process.env.ZOD_CONTRACT_WRITE === '1';
const ACCEPT = process.env.ZOD_CONTRACT_ACCEPT === '1';

const VALUES: unknown[] = [
  12345, -1, 0, 1.5, 1e12, true, null,
  '', 'x', 'x'.repeat(5001), 'not a valid value', 'UPPER',
  'a@b.co', 'not-an-email',
  'https://example.com/hook', 'ftp://example.com', 'javascript:alert(1)',
  '00000000-0000-0000-0000-000000000001', '6f1c3c2e-8f6a-4b7e-9c1d-2a3b4c5d6e7f',
  '2026-10-29T12:00:00Z',
  [], ['x'], [1, 2, 3], {}, { a: 'b' }, { a: 1 },
];

type Issue = { path: PropertyKey[]; message: string };
type Schema = { safeParse: (v: unknown) => { success: boolean; data?: unknown; error?: { issues: Issue[] } } };
type CaseRef = 'empty' | 'base' | 'unknownKey' | 'undefined' | number | [string, number];
type Fixture = {
  values: unknown[];
  httpTools: unknown;
  httpPrompts: unknown;
  stdioTools: unknown;
  results: unknown[];
  schemas: Record<string, { base?: Record<string, unknown>; cases: [CaseRef, number][] }>;
};

function schemas(): Map<string, Schema> {
  const out = new Map<string, Schema>();
  for (const t of allTools) out.set(`tool:${t.name}`, t.inputSchema as unknown as Schema);
  for (const p of hookbasePrompts) out.set(`prompt:${p.name}`, p.argsSchema as unknown as Schema);
  return out;
}

function run(schema: Schema, input: unknown): unknown {
  let r: ReturnType<Schema['safeParse']>;
  try { r = schema.safeParse(input); } catch (e) { return { threw: (e as Error).name }; }
  // The handlers send `path: message` joined with '; ', so that is the contract.
  return JSON.parse(JSON.stringify(
    r.success ? { ok: true, data: r.data ?? null } : { ok: false, issues: r.error!.issues.map((i) => `${i.path.join('.')}: ${i.message}`) },
    (_k, v) => (typeof v === 'string' && v.length > 200 ? `<string of ${v.length}>` : v),
  ));
}

/** JSON with object keys sorted, so key order is not part of the contract. */
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical((v as Record<string, unknown>)[k])]));
  return v;
}

async function rpc(method: string): Promise<unknown> {
  const res = await handleMcpRequest(new Request('https://mcp.test/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer whr_offline_test_key' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method }),
  }), 'https://api.hookbase.app');
  return ((await res.json()) as { result: unknown }).result;
}

async function listings() {
  const server = await createServer();
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'zod-contract', version: '0' });
  await Promise.all([server.connect(a), client.connect(b)]);
  const stdioTools = (await client.listTools()).tools;
  await client.close();
  return {
    httpTools: canonical(await rpc('tools/list')),
    httpPrompts: canonical(await rpc('prompts/list')),
    stdioTools: canonical(stdioTools),
  };
}

// ---- input synthesis (zod 3 internals; only runs when writing the fixture) ----

type Def = { typeName?: string; [k: string]: unknown };
const def = (s: unknown): Def => ((s as { _def?: Def })._def ?? {});

function unwrap(s: unknown): unknown {
  for (;;) {
    const d = def(s);
    if (d.typeName === 'ZodEffects') s = d.schema;
    else if (['ZodOptional', 'ZodNullable', 'ZodDefault', 'ZodCatch', 'ZodBranded', 'ZodReadonly'].includes(d.typeName ?? '')) s = d.innerType ?? d.type;
    else if (d.typeName === 'ZodPipeline') s = d.in;
    else return s;
  }
}

function shapeOf(s: unknown): Record<string, unknown> | null {
  const u = unwrap(s);
  if (def(u).typeName !== 'ZodObject') return null;
  return (def(u).shape as () => Record<string, unknown>)();
}

function parses(s: unknown, v: unknown): boolean {
  try { return (s as Schema).safeParse(v).success; } catch { return false; }
}

function synth(s: unknown, depth = 0): unknown {
  const u = unwrap(s);
  const d = def(u);
  const candidates: unknown[] = [];
  switch (d.typeName) {
    case 'ZodEnum': candidates.push(...(d.values as unknown[])); break;
    case 'ZodNativeEnum': candidates.push(...Object.values(d.values as object)); break;
    case 'ZodLiteral': candidates.push(d.value); break;
    case 'ZodBoolean': candidates.push(true, false); break;
    case 'ZodNumber': candidates.push(1, 0, 10, 100, 1000, 5000, 30000, 60000); break;
    case 'ZodUnion':
    case 'ZodDiscriminatedUnion': {
      const opts = (Array.isArray(d.options) ? d.options : [...(d.options as Map<unknown, unknown>).values()]) as unknown[];
      if (depth < 4) for (const o of opts) candidates.push(synth(o, depth + 1));
      break;
    }
    case 'ZodArray': candidates.push([]); if (depth < 4) candidates.push([synth(d.type, depth + 1)]); break;
    case 'ZodRecord': candidates.push({}); break;
    case 'ZodObject': {
      if (depth >= 4) break;
      const required: Record<string, unknown> = {};
      const all: Record<string, unknown> = {};
      for (const [k, f] of Object.entries(shapeOf(u)!)) {
        const v = synth(f, depth + 1);
        all[k] = v;
        if (!parses(f, undefined)) required[k] = v;
      }
      candidates.push(required, all);
      break;
    }
  }
  candidates.push(...VALUES);
  for (const c of candidates) if (parses(s, c)) return c;
  return candidates[0];
}

function casesFor(schema: Schema): { base?: Record<string, unknown>; refs: CaseRef[] } {
  const shape = shapeOf(schema);
  if (!shape) return { refs: ['undefined', ...VALUES.map((_, i) => i)] };
  const base = synth(schema) as Record<string, unknown>;
  const refs: CaseRef[] = ['empty', 'base', 'unknownKey'];
  for (const k of Object.keys(shape)) VALUES.forEach((_, i) => refs.push([k, i]));
  return { base: base && typeof base === 'object' && !Array.isArray(base) ? base : {}, refs };
}

function inputFor(ref: CaseRef, base: Record<string, unknown> = {}): unknown {
  if (ref === 'empty') return {};
  if (ref === 'base') return base;
  if (ref === 'unknownKey') return { ...base, __unknownKey: 1 };
  if (ref === 'undefined') return undefined;
  if (typeof ref === 'number') return VALUES[ref];
  return { ...base, [ref[0]]: VALUES[ref[1]] };
}

function save(fixture: Fixture) {
  writeFileSync(FIXTURE, JSON.stringify(fixture, null, 0).replace(/\],\[/g, '],\n[') + '\n');
}

describe('zod behaviour contract', () => {
  it('reproduces the recorded listings and parse results', { timeout: 60_000 }, async () => {
    const all = schemas();
    const lists = await listings();

    if (WRITE) {
      const fixture: Fixture = { values: VALUES, ...lists, results: [], schemas: {} };
      const seen = new Map<string, number>();
      for (const [name, schema] of [...all].sort(([a], [b]) => a.localeCompare(b))) {
        const { base, refs } = casesFor(schema);
        const cases = refs.map((ref): [CaseRef, number] => {
          const key = JSON.stringify(run(schema, inputFor(ref, base)));
          if (!seen.has(key)) { seen.set(key, fixture.results.length); fixture.results.push(JSON.parse(key)); }
          return [ref, seen.get(key)!];
        });
        fixture.schemas[name] = base ? { base, cases } : { cases };
      }
      save(fixture);
      return;
    }

    expect(existsSync(FIXTURE)).toBe(true);
    const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Fixture;
    expect(fixture.values).toEqual(JSON.parse(JSON.stringify(VALUES)));
    expect([...all.keys()].sort()).toEqual(Object.keys(fixture.schemas).sort());

    if (ACCEPT) {
      Object.assign(fixture, lists);
      const seen = new Map(fixture.results.map((r, i) => [JSON.stringify(r), i] as const));
      for (const [name, entry] of Object.entries(fixture.schemas)) {
        entry.cases = entry.cases.map(([ref]): [CaseRef, number] => {
          const key = JSON.stringify(run(all.get(name)!, inputFor(ref, entry.base)));
          if (!seen.has(key)) { seen.set(key, fixture.results.length); fixture.results.push(JSON.parse(key)); }
          return [ref, seen.get(key)!];
        });
      }
      save(fixture);
      return;
    }

    const diffs: string[] = [];
    for (const k of ['httpTools', 'httpPrompts', 'stdioTools'] as const) {
      if (JSON.stringify(lists[k]) !== JSON.stringify(fixture[k])) diffs.push(`listing ${k} differs`);
    }
    for (const [name, { base, cases }] of Object.entries(fixture.schemas)) {
      for (const [ref, ri] of cases) {
        const input = inputFor(ref, base);
        const got = run(all.get(name)!, input);
        if (JSON.stringify(got) !== JSON.stringify(fixture.results[ri])) {
          diffs.push(`${name}\n  input:    ${JSON.stringify(input)?.slice(0, 200)}\n  expected: ${JSON.stringify(fixture.results[ri]).slice(0, 400)}\n  got:      ${JSON.stringify(got).slice(0, 400)}`);
        }
      }
    }
    if (diffs.length) writeFileSync(DIFF, diffs.join('\n\n') + '\n');
    expect(diffs.length, diffs.slice(0, 10).join('\n\n')).toBe(0);
  });
});
