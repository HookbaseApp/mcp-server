/**
 * Configuration for MCP server
 * Uses environment variables only (no file-based config)
 */

export interface Config {
  apiUrl: string;
  apiKey: string;
  orgId: string;
}

let cachedConfig: Config | null = null;

/**
 * Initialize configuration by validating API key and fetching org info
 */
export async function initConfig(): Promise<{ config: Config } | { error: string }> {
  const apiKey = process.env.HOOKBASE_API_KEY;
  const apiUrl = process.env.HOOKBASE_API_URL || 'https://api.hookbase.app';

  if (!apiKey) {
    return { error: 'Missing HOOKBASE_API_KEY environment variable. Get your API key from the Hookbase dashboard.' };
  }

  if (!apiKey.startsWith('whr_')) {
    return { error: 'Invalid HOOKBASE_API_KEY format. API keys should start with "whr_".' };
  }

  // Allow manual override for users with multiple orgs
  if (process.env.HOOKBASE_ORG_ID) {
    cachedConfig = { apiUrl, apiKey, orgId: process.env.HOOKBASE_ORG_ID };
    return { config: cachedConfig };
  }

  // Fetch org info from API key
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
      return { error: data.error || data.message || 'Invalid API key' };
    }

    const data = await response.json() as {
      organizations?: Array<{ id: string; name: string; slug: string }>;
    };

    if (!data.organizations || data.organizations.length === 0) {
      return { error: 'No organizations found for this API key' };
    }

    if (data.organizations.length > 1) {
      const orgList = data.organizations.map(o => `  - ${o.name} (${o.id})`).join('\n');
      return {
        error: `Multiple organizations found. Set HOOKBASE_ORG_ID to one of:\n${orgList}`
      };
    }

    // Single org - use it
    const org = data.organizations[0];
    cachedConfig = { apiUrl, apiKey, orgId: org.id };
    return { config: cachedConfig };
  } catch (error) {
    return {
      error: `Failed to validate API key: ${error instanceof Error ? error.message : 'Network error'}`
    };
  }
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
