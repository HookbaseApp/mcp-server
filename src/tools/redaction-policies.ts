/**
 * Redaction policy tools for MCP server
 */

import { z } from 'zod';
import * as api from '../lib/api.js';

const ruleSchema = z.object({
  match: z.object({
    type: z.enum(['path', 'field_name', 'regex_value', 'header']),
    value: z.string().min(1).max(500),
    flags: z.string().max(10).optional(),
  }),
  action: z.object({
    type: z.enum(['redact', 'mask', 'hash', 'remove']),
    keepLastN: z.number().int().min(0).max(20).optional(),
  }),
});

const scopeEnum = z.enum(['storage', 'delivery', 'both']);

export const redactionPolicyTools = [
  {
    name: 'hookbase_list_redaction_policies',
    description: 'List redaction policies for this org. Optionally filter by source_id (org-wide policies have null sourceId).',
    inputSchema: z.object({
      source_id: z.string().uuid().optional(),
    }).strict(),
    handler: async (args: { source_id?: string }) => {
      const result = await api.getRedactionPolicies(args.source_id);
      if (result.error) return { error: result.error };
      return { policies: result.data?.policies };
    },
  },
  {
    name: 'hookbase_get_redaction_policy',
    description: 'Get a single redaction policy with its full ruleset.',
    inputSchema: z.object({ policy_id: z.string() }).strict(),
    handler: async (args: { policy_id: string }) => {
      const result = await api.getRedactionPolicy(args.policy_id);
      if (result.error) return { error: result.error };
      return { policy: result.data?.policy };
    },
  },
  {
    name: 'hookbase_create_redaction_policy',
    description:
      'Create a redaction policy (admin or owner; requires the "redaction_policies" feature). Each rule has a `match` (type: path | field_name | regex_value | header, value) and `action` (type: redact | mask | hash | remove, optional keepLastN for mask). Pass source_id to scope to one source, omit/null for org-wide. scope controls when rules apply: "storage" (before R2 write), "delivery" (before forwarding), or "both" (default).',
    inputSchema: z.object({
      name: z.string().min(1).max(100),
      source_id: z.string().uuid().nullable().optional(),
      rules: z.array(ruleSchema).min(1).max(50),
      scope: scopeEnum.optional().describe('Default "both"'),
    }).strict(),
    handler: async (args: {
      name: string;
      source_id?: string | null;
      rules: api.RedactionRule[];
      scope?: api.RedactionScope;
    }) => {
      const result = await api.createRedactionPolicy({
        name: args.name,
        sourceId: args.source_id ?? null,
        rules: args.rules,
        scope: args.scope,
      });
      if (result.error) return { error: result.error };
      return { message: 'Redaction policy created', id: result.data?.id };
    },
  },
  {
    name: 'hookbase_update_redaction_policy',
    description: 'Update a redaction policy. PUT semantics — pass the full policy state (name, rules, scope, isActive). Optional source_id reassigns the policy. Cache busts on save but org-wide policies (sourceId null) may take up to 5 min to propagate.',
    inputSchema: z.object({
      policy_id: z.string(),
      name: z.string().min(1).max(100),
      source_id: z.string().uuid().nullable().optional(),
      rules: z.array(ruleSchema).min(1).max(50),
      scope: scopeEnum,
      is_active: z.boolean(),
    }).strict(),
    handler: async (args: {
      policy_id: string;
      name: string;
      source_id?: string | null;
      rules: api.RedactionRule[];
      scope: api.RedactionScope;
      is_active: boolean;
    }) => {
      const result = await api.updateRedactionPolicy(args.policy_id, {
        name: args.name,
        sourceId: args.source_id ?? null,
        rules: args.rules,
        scope: args.scope,
        isActive: args.is_active,
      });
      if (result.error) return { error: result.error };
      return { message: 'Redaction policy updated' };
    },
  },
  {
    name: 'hookbase_delete_redaction_policy',
    description: 'Delete a redaction policy (admin or owner).',
    inputSchema: z.object({ policy_id: z.string() }).strict(),
    handler: async (args: { policy_id: string }) => {
      const result = await api.deleteRedactionPolicy(args.policy_id);
      if (result.error) return { error: result.error };
      return { message: 'Redaction policy deleted' };
    },
  },
  {
    name: 'hookbase_preview_redaction_policy',
    description: 'Apply a candidate ruleset to a sample payload (and optional headers) without saving. Returns the redacted payload, redacted headers, and the count of fields touched.',
    inputSchema: z.object({
      rules: z.array(ruleSchema).min(1).max(50),
      payload: z.unknown(),
      headers: z.record(z.string(), z.string()).optional(),
    }).strict(),
    handler: async (args: { rules: api.RedactionRule[]; payload: unknown; headers?: Record<string, string> }) => {
      const result = await api.previewRedactionPolicy({
        rules: args.rules,
        payload: args.payload,
        headers: args.headers,
      });
      if (result.error) return { error: result.error };
      return result.data;
    },
  },
];
