/**
 * The zod every module in this package imports. Import `z` from here, never from 'zod' directly
 * (tests/zod-import-guard.test.ts enforces it), so the configuration below is applied before any
 * schema parses, under both the stdio and the HTTP transport.
 *
 * jitless: zod 4 compiles object parsers with `new Function` when it can. Workers forbid eval, so
 * zod would probe, fail, and fall back. Turning it off skips the probe.
 *
 * customError: zod 4 reworded its default messages ("Invalid input: expected string, received
 * undefined" where zod 3 said "Required"). Agents see these as `Invalid arguments for <tool>:
 * <path>: <message>`, so this map reproduces the zod 3 text; tests/zod-contract.test.ts checks it
 * against output recorded on zod 3. The same map is in the api (src/utils/zod.ts): keep the two in
 * step. A message a schema sets itself takes precedence over this map, as it did over zod 3's.
 */

import { z } from 'zod';

type Issue = z.core.$ZodRawIssue;

/** zod 3's ZodParsedType for a value, which is what its "received X" text names. */
function parsedType(v: unknown): string {
  switch (typeof v) {
    case 'undefined': return 'undefined';
    case 'string': return 'string';
    case 'number': return Number.isNaN(v) ? 'nan' : 'number';
    case 'boolean': return 'boolean';
    case 'function': return 'function';
    case 'bigint': return 'bigint';
    case 'symbol': return 'symbol';
    default:
      if (Array.isArray(v)) return 'array';
      if (v === null) return 'null';
      if (v instanceof Date) return 'date';
      if (v instanceof Map) return 'map';
      if (v instanceof Set) return 'set';
      if (typeof (v as { then?: unknown }).then === 'function') return 'promise';
      return 'object';
  }
}

/** zod 3's joinValues: strings quoted with single quotes, joined with " | ". */
function joinValues(values: readonly unknown[]): string {
  return values.map((v) => (typeof v === 'string' ? `'${v}'` : String(v))).join(' | ');
}

/** zod 4 names some expected types differently from zod 3. */
const EXPECTED: Record<string, string> = { int: 'integer', record: 'object' };

const FORMAT: Record<string, string> = { guid: 'uuid', regex: '', datetime: 'datetime', email: 'email', url: 'url' };

function schemaType(issue: Issue): string | undefined {
  return (issue.inst as { _zod?: { def?: { type?: string } } } | undefined)?._zod?.def?.type;
}

export function zod3Message(issue: Issue): string | undefined {
  switch (issue.code) {
    case 'invalid_type': {
      if (issue.input === undefined) return 'Required';
      const expected = EXPECTED[issue.expected] ?? issue.expected;
      // zod 3 raised a non-integer as received "float".
      if (expected === 'integer' && typeof issue.input === 'number') return 'Expected integer, received float';
      return `Expected ${expected}, received ${parsedType(issue.input)}`;
    }
    case 'invalid_value': {
      const type = schemaType(issue);
      if (type === 'literal') {
        if (issue.input === undefined) return 'Required';
        return `Invalid literal value, expected ${JSON.stringify(issue.values[0])}`;
      }
      if (issue.input === undefined) return 'Required';
      // zod 3 checked an enum's input type first, and worded a wrong type as invalid_type.
      if (typeof issue.input !== 'string') return `Expected ${joinValues(issue.values)}, received ${parsedType(issue.input)}`;
      return `Invalid enum value. Expected ${joinValues(issue.values)}, received '${issue.input}'`;
    }
    case 'too_small': {
      const { minimum: n, inclusive, exact } = issue as Issue & { minimum: number | bigint; inclusive?: boolean; exact?: boolean };
      if (issue.origin === 'array' || issue.origin === 'set') return `Array must contain ${exact ? 'exactly' : inclusive ? 'at least' : 'more than'} ${n} element(s)`;
      if (issue.origin === 'string') return `String must contain ${exact ? 'exactly' : inclusive ? 'at least' : 'over'} ${n} character(s)`;
      if (issue.origin === 'number' || issue.origin === 'int' || issue.origin === 'bigint') return `Number must be ${exact ? 'exactly equal to ' : inclusive ? 'greater than or equal to ' : 'greater than '}${n}`;
      return 'Invalid input';
    }
    case 'too_big': {
      const { maximum: n, inclusive, exact } = issue as Issue & { maximum: number | bigint; inclusive?: boolean; exact?: boolean };
      if (issue.origin === 'array' || issue.origin === 'set') return `Array must contain ${exact ? 'exactly' : inclusive ? 'at most' : 'less than'} ${n} element(s)`;
      if (issue.origin === 'string') return `String must contain ${exact ? 'exactly' : inclusive ? 'at most' : 'under'} ${n} character(s)`;
      if (issue.origin === 'number' || issue.origin === 'int' || issue.origin === 'bigint') return `Number must be ${exact ? 'exactly' : inclusive ? 'less than or equal to' : 'less than'} ${n}`;
      return 'Invalid input';
    }
    case 'invalid_format': {
      const f = issue.format;
      if (f === 'starts_with') return `Invalid input: must start with "${(issue as { prefix?: string }).prefix}"`;
      if (f === 'ends_with') return `Invalid input: must end with "${(issue as { suffix?: string }).suffix}"`;
      if (f === 'includes') return `Invalid input: must include "${(issue as { includes?: string }).includes}"`;
      const name = f in FORMAT ? FORMAT[f] : f;
      return name ? `Invalid ${name}` : 'Invalid';
    }
    case 'not_multiple_of':
      return `Number must be a multiple of ${issue.divisor}`;
    case 'unrecognized_keys':
      return `Unrecognized key(s) in object: ${issue.keys.map((k) => `'${k}'`).join(', ')}`;
    case 'invalid_union': {
      const disc = (issue as { discriminator?: string }).discriminator;
      if (disc !== undefined) {
        const values = (issue.inst as { _zod?: { propValues?: Record<string, Set<unknown>> } } | undefined)?._zod?.propValues?.[disc];
        return values ? `Invalid discriminator value. Expected ${joinValues([...values])}` : 'Invalid input';
      }
      // zod 3 reported a failed union through the first option that got past its type check and
      // failed only on a refinement (`1.5` for `int().min(100) | regex`). zod 4 reports the union
      // as a whole, so surface that option's first message, which is what zod 3 put first.
      // zod 3 gave up on an option outright on a wrong type, a literal or enum mismatch, or a nested
      // union failure. `.int()` is an invalid_type in zod 4 but was a plain check in zod 3.
      const fatal = (i: { code: string; path: PropertyKey[]; expected?: string }) => i.path.length === 0
        && (i.code === 'invalid_value' || i.code === 'invalid_union' || (i.code === 'invalid_type' && i.expected !== 'int'));
      for (const opt of (issue as { errors?: { code: string; path: PropertyKey[]; message: string; expected?: string }[][] }).errors ?? []) {
        if (opt.length && !opt.some(fatal)) return opt[0].message;
      }
      return 'Invalid input';
    }
    case 'custom':
      return 'Invalid input';
    default:
      return undefined;
  }
}

z.config({ jitless: true, customError: zod3Message });

/** The most entries an array or record in a request body may have. Far above any real use. */
export const MAX_COLLECTION = 1000;

/**
 * `z.record(z.string(), value)` that rejects more than `maxKeys` keys before parsing any value.
 * zod raises one issue per failing value and has no size check for records, so a plain record
 * turns a large body into an issue per key: enough of them exhausts the isolate's memory
 * (GHSA-mrhx-c7xc-m3w5). Arrays get the same protection from `.max()`.
 */
export function boundedRecord<V extends z.ZodType>(value: V, maxKeys = MAX_COLLECTION) {
  return z.preprocess(capKeys(maxKeys), z.record(z.string(), value));
}

/** The key-count guard behind boundedRecord, for a record with its own key schema: `z.preprocess(capKeys(), z.record(key, value))`. */
export function capKeys(maxKeys = MAX_COLLECTION) {
  return (v: unknown, ctx: z.core.$RefinementCtx<unknown>) => {
    if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > maxKeys) {
      ctx.addIssue({ code: 'custom', message: `Object must have at most ${maxKeys} keys`, input: v });
    }
    return v;
  };
}

export { z };
