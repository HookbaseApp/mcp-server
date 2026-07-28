/**
 * Request authentication + org resolution for the remote HTTP transport.
 *
 * Auth is a bearer API key: `Authorization: Bearer whr_...`. Validating the key
 * and resolving its organization requires a round-trip to /api/auth/me, so we
 * only do it lazily — when a tool is actually invoked — and memoize the result
 * per key for the lifetime of the isolate (Workers has no filesystem, so the
 * on-disk cache used by the stdio transport does not apply here).
 */

import type { Config } from '../lib/config.js';

export class AuthError extends Error {
  constructor(
    message: string,
    /** HTTP status to surface for transport-level failures. */
    readonly status: number = 401,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

/** Extract a well-formed `whr_` bearer key, or throw AuthError (401). */
export function extractApiKey(request: Request): string {
  const header = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!header) {
    throw new AuthError('Missing Authorization header. Send "Authorization: Bearer whr_...".');
  }
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) {
    throw new AuthError('Malformed Authorization header. Expected "Bearer <api-key>".');
  }
  const key = match[1].trim();
  if (!key.startsWith('whr_')) {
    throw new AuthError('Invalid API key format. Hookbase API keys start with "whr_".');
  }
  return key;
}

interface ResolvedOrg {
  orgId: string;
  orgSlug: string;
}

// Memoize resolution per (apiKey|apiUrl|orgOverride) for the isolate's lifetime.
const orgCache = new Map<string, ResolvedOrg>();

/**
 * Resolve a full Config from an API key by calling /api/auth/me. Validates the
 * key and picks the organization. When the key has multiple orgs, `orgOverride`
 * (from the `X-Hookbase-Org-Id` header) selects one; otherwise it is ambiguous.
 *
 * Throws AuthError(401) for a bad key, AuthError(400) for org ambiguity.
 */
export async function resolveConfig(
  apiKey: string,
  apiUrl: string,
  orgOverride?: string,
): Promise<Config> {
  const cacheKey = `${apiKey}|${apiUrl}|${orgOverride ?? ''}`;
  const cached = orgCache.get(cacheKey);
  if (cached) {
    return { apiUrl, apiKey, orgId: cached.orgId, orgSlug: cached.orgSlug };
  }

  let response: Response;
  try {
    response = await fetch(`${apiUrl}/api/auth/me`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
    });
  } catch (error) {
    throw new AuthError(
      `Failed to reach Hookbase API: ${error instanceof Error ? error.message : 'network error'}`,
      502,
    );
  }

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new AuthError(data.error || data.message || 'Invalid API key', 401);
  }

  const data = (await response.json()) as {
    organizations?: Array<{ id: string; name: string; slug: string }>;
  };
  const orgs = data.organizations ?? [];
  if (orgs.length === 0) {
    throw new AuthError('No organizations found for this API key', 403);
  }

  let org: { id: string; name: string; slug: string };
  if (orgOverride) {
    const match = orgs.find((o) => o.id === orgOverride);
    if (!match) {
      throw new AuthError(
        `X-Hookbase-Org-Id "${orgOverride}" is not among this key's organizations`,
        400,
      );
    }
    org = match;
  } else if (orgs.length > 1) {
    const list = orgs.map((o) => `${o.name} (${o.id})`).join(', ');
    throw new AuthError(
      `This API key belongs to multiple organizations. Set the X-Hookbase-Org-Id header to one of: ${list}`,
      400,
    );
  } else {
    org = orgs[0];
  }

  orgCache.set(cacheKey, { orgId: org.id, orgSlug: org.slug });
  return { apiUrl, apiKey, orgId: org.id, orgSlug: org.slug };
}
