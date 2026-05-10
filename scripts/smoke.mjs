#!/usr/bin/env node
/**
 * Stdio smoke test: spawn the built MCP server, list tools/resources/prompts,
 * print counts and a sample, then exit. Pass HOOKBASE_API_KEY in the env.
 *
 * Usage:
 *   HOOKBASE_API_KEY=whr_... npm run smoke
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.resolve(__dirname, '..', 'dist', 'index.js');

const child = spawn('node', [serverPath], {
  stdio: ['pipe', 'pipe', 'inherit'],
  env: process.env,
});

let buffer = '';
const pending = new Map();

child.stdout.on('data', (chunk) => {
  buffer += chunk.toString('utf8');
  let nl;
  while ((nl = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      const resolver = pending.get(msg.id);
      if (resolver) {
        pending.delete(msg.id);
        resolver(msg);
      }
    } catch {
      // ignore non-JSON
    }
  }
});

let nextId = 1;
function rpc(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`Timeout waiting for ${method}`));
      }
    }, 15_000);
  });
}

function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
}

try {
  const init = await rpc('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'hookbase-smoke', version: '0.0.0' },
  });
  if (init.error) throw new Error(`initialize failed: ${JSON.stringify(init.error)}`);
  console.log(`✓ initialize → server ${init.result.serverInfo?.name} v${init.result.serverInfo?.version}`);

  notify('notifications/initialized');

  const tools = await rpc('tools/list', {});
  if (tools.error) throw new Error(`tools/list failed: ${JSON.stringify(tools.error)}`);
  console.log(`✓ tools/list → ${tools.result.tools.length} tools`);
  console.log(`  sample: ${tools.result.tools.slice(0, 3).map(t => t.name).join(', ')} ...`);

  const resources = await rpc('resources/templates/list', {});
  if (resources.error) {
    console.log(`✗ resources/templates/list → ${resources.error.message}`);
  } else {
    console.log(`✓ resources/templates/list → ${resources.result.resourceTemplates.length} templates`);
    for (const t of resources.result.resourceTemplates) {
      console.log(`  - ${t.name}: ${t.uriTemplate}`);
    }
  }

  const prompts = await rpc('prompts/list', {});
  if (prompts.error) {
    console.log(`✗ prompts/list → ${prompts.error.message}`);
  } else {
    console.log(`✓ prompts/list → ${prompts.result.prompts.length} prompts`);
  }

  console.log('\nSmoke test passed.');
  child.kill('SIGTERM');
  process.exit(0);
} catch (err) {
  console.error('Smoke test FAILED:', err.message);
  child.kill('SIGTERM');
  process.exit(1);
}
