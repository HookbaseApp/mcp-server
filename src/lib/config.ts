/**
 * Configuration for MCP server
 *
 * On first run we call /api/auth/me to resolve the org for the API key.
 * To avoid paying that round-trip on every server boot, the resolved
 * {orgId, orgSlug, apiUrl} is cached at ~/.config/hookbase/mcp.json
 * keyed by a SHA-256 hash of the API key + API URL + optional org override.
 *
 * Cache failures are non-fatal — we always fall back to the network call.
 * Set HOOKBASE_NO_CACHE=1 to disable the cache entirely.
 */

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

export interface Config {
  apiUrl: string;
  apiKey: string;
  orgId: string;
  orgSlug: string;
}

interface CacheEntry {
  orgId: string;
  orgSlug: string;
  apiUrl: string;
  cachedAt: string;
}

interface CacheFile {
  version: 1;
  entries: Record<string, CacheEntry>;
}

let cachedConfig: Config | null = null;
let cachedInitError: string | null = null;

function cachePath(): string {
  const base = process.env.XDG_CONFIG_HOME || path.join(homedir(), '.config');
  return path.join(base, 'hookbase', 'mcp.json');
}

function cacheKey(apiKey: string, apiUrl: string, orgOverride: string | undefined): string {
  return createHash('sha256').update(`${apiKey}|${apiUrl}|${orgOverride ?? ''}`).digest('hex');
}

function cacheDisabled(): boolean {
  return process.env.HOOKBASE_NO_CACHE === '1' || process.env.HOOKBASE_NO_CACHE === 'true';
}

async function readCacheEntry(key: string): Promise<CacheEntry | null> {
  if (cacheDisabled()) return null;
  try {
    const raw = await fs.readFile(cachePath(), 'utf8');
    const parsed = JSON.parse(raw) as CacheFile;
    if (parsed.version !== 1 || !parsed.entries) return null;
    return parsed.entries[key] ?? null;
  } catch {
    return null;
  }
}

async function writeCacheEntry(key: string, entry: CacheEntry): Promise<void> {
  if (cacheDisabled()) return;
  try {
    const file = cachePath();
    let existing: CacheFile = { version: 1, entries: {} };
    try {
      const raw = await fs.readFile(file, 'utf8');
      const parsed = JSON.parse(raw) as CacheFile;
      if (parsed.version === 1 && parsed.entries) existing = parsed;
    } catch {
      // missing or corrupt — overwrite
    }
    existing.entries[key] = entry;
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(existing, null, 2), { mode: 0o600 });
  } catch {
    // cache write failures are non-fatal
  }
}

/**
 * Initialize configuration by validating API key and fetching org info
 */
export async function initConfig(): Promise<{ config: Config } | { error: string }> {
  const apiKey = process.env.HOOKBASE_API_KEY;
  const apiUrl = process.env.HOOKBASE_API_URL || 'https://api.hookbase.app';

  if (!apiKey) {
    return rememberError('Missing HOOKBASE_API_KEY environment variable. Get your API key from the Hookbase dashboard.');
  }

  if (!apiKey.startsWith('whr_')) {
    return rememberError('Invalid HOOKBASE_API_KEY format. API keys should start with "whr_".');
  }

  const overrideOrgId = process.env.HOOKBASE_ORG_ID;
  const key = cacheKey(apiKey, apiUrl, overrideOrgId);

  // Fast path: serve from cache, skipping the /auth/me round-trip.
  const cached = await readCacheEntry(key);
  if (cached && cached.apiUrl === apiUrl) {
    cachedConfig = { apiUrl, apiKey, orgId: cached.orgId, orgSlug: cached.orgSlug };
    cachedInitError = null;
    return { config: cachedConfig };
  }

  // Fetch org info from API key (also validates the key and resolves org slug)
  try {
    const response = await fetch(`${apiUrl}/api/auth/me`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const data = await response.json() as { error?: string; message?: string };
      return rememberError(data.error || data.message || 'Invalid API key');
    }

    const data = await response.json() as {
      organizations?: Array<{ id: string; name: string; slug: string }>;
    };

    if (!data.organizations || data.organizations.length === 0) {
      return rememberError('No organizations found for this API key');
    }

    let org: { id: string; name: string; slug: string };
    if (overrideOrgId) {
      const match = data.organizations.find(o => o.id === overrideOrgId);
      if (!match) {
        return rememberError(`HOOKBASE_ORG_ID "${overrideOrgId}" not found among organizations for this API key`);
      }
      org = match;
    } else if (data.organizations.length > 1) {
      const orgList = data.organizations.map(o => `  - ${o.name} (${o.id})`).join('\n');
      return rememberError(`Multiple organizations found. Set HOOKBASE_ORG_ID to one of:\n${orgList}`);
    } else {
      org = data.organizations[0];
    }

    cachedConfig = { apiUrl, apiKey, orgId: org.id, orgSlug: org.slug };
    cachedInitError = null;
    await writeCacheEntry(key, {
      orgId: org.id,
      orgSlug: org.slug,
      apiUrl,
      cachedAt: new Date().toISOString(),
    });
    return { config: cachedConfig };
  } catch (error) {
    return rememberError(
      `Failed to validate API key: ${error instanceof Error ? error.message : 'Network error'}`
    );
  }
}

function rememberError(message: string): { error: string } {
  cachedInitError = message;
  return { error: message };
}

/**
 * Returns the error captured during initConfig, if any.
 */
export function getInitError(): string | null {
  return cachedInitError;
}

/**
 * Get configuration (must call initConfig first)
 */
export function getConfig(): Config {
  if (!cachedConfig) {
    throw new Error('Config not initialized. Call initConfig() first.');
  }
  return cachedConfig;
}

/**
 * Check if debug mode is enabled
 */
export function isDebugMode(): boolean {
  return process.env.HOOKBASE_DEBUG === '1' || process.env.HOOKBASE_DEBUG === 'true';
}
