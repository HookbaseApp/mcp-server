/**
 * API key management tools for MCP server
 */

import { z } from 'zod';
import * as api from '../lib/api.js';

const scopeEnum = z.enum(['read', 'write', 'delete']);

export const apiKeyTools = [
  {
    name: 'hookbase_list_api_keys',
    description: 'List API keys for the current org. Returns id, name, key prefix, scopes, expiry — never the raw key (which is only returned once at creation).',
    inputSchema: z.object({}).strict(),
    handler: async () => {
      const result = await api.getApiKeys();
      if (result.error) return { error: result.error };
      return { apiKeys: result.data?.apiKeys };
    },
  },
  {
    name: 'hookbase_create_api_key',
    description:
      'Create a new API key (admin or owner only). The raw key is returned ONCE in the response under `apiKey.key` — store it securely; it cannot be retrieved later. Default scopes are ["read","write"]. Pass expiresIn (seconds from now) for time-limited keys.',
    inputSchema: z.object({
      name: z.string().min(1).max(100),
      scopes: z.array(scopeEnum).min(1).optional().describe('Default ["read","write"]'),
      expires_in: z.number().int().positive().optional().describe('Seconds from now until expiry (omit for no expiry)'),
    }).strict(),
    handler: async (args: { name: string; scopes?: api.ApiKeyScope[]; expires_in?: number }) => {
      const result = await api.createApiKey({
        name: args.name,
        scopes: args.scopes,
        expiresIn: args.expires_in,
      });
      if (result.error) return { error: result.error };
      return {
        message: 'API key created — store the `key` field now, it will not be shown again',
        apiKey: result.data?.apiKey,
      };
    },
  },
  {
    name: 'hookbase_delete_api_key',
    description: 'Delete (revoke) an API key. Admin or owner only, requires the "delete" scope. The key currently being used to authenticate this request cannot be deleted.',
    inputSchema: z.object({
      key_id: z.string(),
    }).strict(),
    handler: async (args: { key_id: string }) => {
      const result = await api.deleteApiKey(args.key_id);
      if (result.error) return { error: result.error };
      return { message: 'API key revoked' };
    },
  },
];
