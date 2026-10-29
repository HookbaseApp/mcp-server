/**
 * Every module imports `z` from src/lib/zod.ts, which applies the zod configuration (zod 3
 * message wording, jitless) before anything parses. A module importing 'zod' directly would send
 * agents zod 4's default messages instead.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(__dirname, '..', 'src');

function tsFiles(dir: string, out: string[] = []): string[] {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) tsFiles(p, out);
    else if (ent.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

describe('zod imports', () => {
  it('go through src/lib/zod.ts', () => {
    const direct = [...tsFiles(SRC), ...tsFiles(__dirname)]
      .filter((p) => p !== join(SRC, 'lib', 'zod.ts'))
      .filter((p) => /from ['"]zod(\/[^'"]*)?['"]/.test(readFileSync(p, 'utf8')))
      .map((p) => relative(join(__dirname, '..'), p));
    expect(direct).toEqual([]);
  });
});
