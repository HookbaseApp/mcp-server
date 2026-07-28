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
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { Config } from './config.js';

export interface RequestContext {
  config?: Config;
  initError?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Run `fn` with the given request-scoped config visible to getConfig(). */
export function runWithConfig<T>(config: Config, fn: () => T): T {
  return storage.run({ config }, fn);
}

/** The active request context, or undefined under the stdio transport. */
export function currentContext(): RequestContext | undefined {
  return storage.getStore();
}
