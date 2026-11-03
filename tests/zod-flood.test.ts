/**
 * No tool or prompt schema may turn one oversized collection into an unbounded number of issues.
 *
 * zod records one issue per failing element, so a large array or record of bad values in a tool
 * call becomes enough issue objects to exhaust the Worker isolate's memory (GHSA-mrhx-c7xc-m3w5).
 * zod >= 4.6.6 checks an array's `.max()` before its elements; records have no size check and go
 * through `boundedRecord()` in src/lib/zod.ts. This floods every array and record, at any depth,
 * with 20,000 invalid entries and requires the parse to stay under ISSUE_LIMIT issues.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { allTools } from '../src/tools/index.js';
import { hookbasePrompts } from '../src/prompts/index.js';

const FIXTURE = join(__dirname, 'fixtures', 'zod-contract.json');
const FLOOD = 20_000;
const ISSUE_LIMIT = 200;

type Def = { type: string; [k: string]: unknown };
type Schema = { _zod: { def: Def }; safeParse: (v: unknown) => { success: boolean; error?: { issues: unknown[] } } };
type Seg = string | 0;

const def = (s: unknown): Def => (s as Schema)._zod.def;

function loadSchemas(): Map<string, Schema> {
  const out = new Map<string, Schema>();
  for (const t of allTools) out.set(`tool:${t.name}`, t.inputSchema as unknown as Schema);
  for (const p of hookbasePrompts) out.set(`prompt:${p.name}`, p.argsSchema as unknown as Schema);
  return out;
}

/** Paths to every array and record reachable through objects, arrays, wrappers and unions. */
function collections(s: unknown, path: Seg[] = [], seen = new Set<unknown>()): { path: Seg[]; kind: 'array' | 'record' }[] {
  if (seen.has(s)) return [];
  seen.add(s);
  const d = def(s);
  switch (d.type) {
    case 'object':
      return Object.entries(d.shape as Record<string, unknown>).flatMap(([k, f]) => collections(f, [...path, k], seen));
    case 'array':
      return [{ path, kind: 'array' }, ...collections(d.element, [...path, 0], seen)];
    case 'record':
      return [{ path, kind: 'record' }, ...collections(d.valueType, [...path, 'k'], seen)];
    case 'pipe':
      return [...collections(d.in, path, seen), ...collections(d.out, path, seen)];
    case 'union':
      return (d.options as unknown[]).flatMap((o) => collections(o, path, seen));
    case 'intersection':
      return [...collections(d.left, path, seen), ...collections(d.right, path, seen)];
    case 'optional': case 'nullable': case 'default': case 'prefault': case 'readonly': case 'catch': case 'nonoptional':
      return collections(d.innerType, path, seen);
    default:
      return [];
  }
}

function setAt(base: unknown, path: Seg[], value: unknown): unknown {
  if (!path.length) return value;
  const [head, ...rest] = path;
  if (head === 0) return [setAt(Array.isArray(base) ? base[0] : undefined, rest, value)];
  const obj = base && typeof base === 'object' && !Array.isArray(base) ? base as Record<string, unknown> : {};
  return { ...obj, [head]: setAt(obj[head], rest, value) };
}

describe('collections are bounded', () => {
  // Parses a flooded input per collection across ~150 schemas: give it room beside the full suite.
  it('no schema produces an issue per element of an oversized array or record', { timeout: 60_000 }, async () => {
    const schemas = loadSchemas();
    const bases = (JSON.parse(readFileSync(FIXTURE, 'utf8')) as { schemas: Record<string, { base?: unknown }> }).schemas;
    const floodArray = new Array(FLOOD).fill(null);
    const floodRecord = Object.fromEntries(Array.from({ length: FLOOD }, (_, i) => [`k${i}`, null]));

    const unbounded: string[] = [];
    for (const [name, schema] of schemas) {
      for (const { path, kind } of collections(schema)) {
        const input = setAt(bases[name]?.base ?? {}, path, kind === 'array' ? floodArray : floodRecord);
        const r = schema.safeParse(input);
        const n = r.success ? 0 : r.error!.issues.length;
        if (n > ISSUE_LIMIT) unbounded.push(`${name} ${kind} at ${path.join('.') || '(root)'}: ${n} issues`);
      }
    }
    expect(unbounded, unbounded.join('\n')).toEqual([]);
  });
});
