/**
 * Per-request configuration context.
 *
 * The stdio transport is single-tenant: one process, one API key from the
 * environment, resolved once into a module-global singleton (see config.ts).
 *
 * The remote HTTP transport is multi-tenant: every request carries a different
 * API key, so config cannot be a process global. Instead the Worker resolves a
 * Config per request and runs the tool handler inside runWithConfig(), which
 * stashes it in AsyncLocalStorage. getConfig()/getInitError() prefer this store
 * when present, so the ~130 tool handlers and lib/api.ts need no changes.
 *
 * A host that runs the tools itself (the Hookbase API's AI Assistant, via the
 * ./catalog export) also passes its own `fetch`, which lib/api.ts uses for
 * every request instead of the global one.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { Config } from './config.js';

export type Fetch = (input: Request | string | URL, init?: RequestInit) => Promise<Response>;

export interface RequestContext {
  config?: Config;
  initError?: string;
  fetch?: Fetch;
}

export interface RunOptions {
  /** Sends every API request the tools make. Defaults to the global fetch. */
  fetch?: Fetch;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Run `fn` with the given request-scoped config visible to getConfig(). */
export function runWithConfig<T>(config: Config, fn: () => T, options: RunOptions = {}): T {
  return storage.run({ config, ...(options.fetch ? { fetch: options.fetch } : {}) }, fn);
}

/** The active request context, or undefined under the stdio transport. */
export function currentContext(): RequestContext | undefined {
  return storage.getStore();
}
