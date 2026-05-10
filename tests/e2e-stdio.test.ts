import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.resolve(__dirname, '..', 'dist', 'index.js');

const TEST_KEY = 'whr_e2e_smoke_key';
const TEST_URL = 'https://api.example.test';

let xdgDir: string;
let child: ChildProcessWithoutNullStreams;
let buffer = '';
let nextId = 1;
const pending = new Map<number, (msg: { result?: unknown; error?: { message: string } }) => void>();

function rpc<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, (msg) => {
      if (msg.error) reject(new Error(`${method} failed: ${msg.error.message}`));
      else resolve(msg.result as T);
    });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`Timeout waiting for ${method}`));
      }
    }, 10_000);
  });
}

function notify(method: string, params: Record<string, unknown> = {}) {
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
}

beforeAll(async () => {
  // Verify build artifact exists
  await fs.access(serverPath);

  // Pre-seed the config cache so initConfig() skips the network /auth/me call
  xdgDir = await fs.mkdtemp(path.join(tmpdir(), 'hookbase-mcp-e2e-'));
  const cacheKey = createHash('sha256').update(`${TEST_KEY}|${TEST_URL}|`).digest('hex');
  const cacheFile = path.join(xdgDir, 'hookbase', 'mcp.json');
  await fs.mkdir(path.dirname(cacheFile), { recursive: true });
  await fs.writeFile(
    cacheFile,
    JSON.stringify({
      version: 1,
      entries: {
        [cacheKey]: {
          orgId: 'org_e2e',
          orgSlug: 'e2e',
          apiUrl: TEST_URL,
          cachedAt: new Date().toISOString(),
        },
      },
    })
  );

  child = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      HOOKBASE_API_KEY: TEST_KEY,
      HOOKBASE_API_URL: TEST_URL,
      XDG_CONFIG_HOME: xdgDir,
    },
  });

  child.stdout.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8');
    let nl;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line) as { id?: number; result?: unknown; error?: { message: string } };
        if (typeof msg.id === 'number') {
          const resolver = pending.get(msg.id);
          if (resolver) {
            pending.delete(msg.id);
            resolver(msg);
          }
        }
      } catch {
        // ignore
      }
    }
  });

  await rpc('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'hookbase-e2e', version: '0.0.0' },
  });
  notify('notifications/initialized');
});

afterAll(async () => {
  child?.kill('SIGTERM');
  if (xdgDir) await fs.rm(xdgDir, { recursive: true, force: true });
});

describe('e2e stdio', () => {
  it('lists tools (>= 100)', async () => {
    const result = await rpc<{ tools: Array<{ name: string }> }>('tools/list');
    expect(result.tools.length).toBeGreaterThanOrEqual(100);
    expect(result.tools.every(t => typeof t.name === 'string' && t.name.length > 0)).toBe(true);
  });

  it('lists 3 resource templates with hookbase:// URIs', async () => {
    const result = await rpc<{ resourceTemplates: Array<{ name: string; uriTemplate: string }> }>(
      'resources/templates/list'
    );
    expect(result.resourceTemplates).toHaveLength(3);
    for (const tpl of result.resourceTemplates) {
      expect(tpl.uriTemplate).toMatch(/^hookbase:\/\//);
    }
  });

  it('lists prompts', async () => {
    const result = await rpc<{ prompts: Array<{ name: string }> }>('prompts/list');
    expect(Array.isArray(result.prompts)).toBe(true);
    expect(result.prompts.length).toBeGreaterThan(0);
  });
});
