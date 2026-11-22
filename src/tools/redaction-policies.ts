/**
 * Redaction policy tools for MCP server
 */

import { z, boundedRecord } from '../lib/zod.js';
import * as api from '../lib/api.js';

const ruleSchema = z.object({
  match: z.object({
    type: z.enum(['path', 'field_name', 'regex_value', 'header']).describe(
      'path: one dotted path into the payload ("user.ssn", "items[0].card"); field_name: every payload key with exactly this name, at any depth; ' +
      'regex_value: every string field value the regex matches; header: the header with this name (case-insensitive)',
    ),
    value: z.string().min(1).max(500).describe('The path, key name, regex or header name'),
    flags: z.string().max(10).optional().describe('Regex flags for regex_value, such as "i"'),
  }).describe('What the rule applies to'),
  action: z.object({
    type: z.enum(['redact', 'mask', 'hash', 'remove']).describe(
      'redact: replace the value with "[REDACTED]"; mask: replace all but the last keepLastN characters with * (a value that short is masked whole); ' +
      'hash: replace it with "hmac-sha256:v1:" and a digest keyed for the organization (the same value always gives the same digest there, ' +
      'so it can be joined on, but it can\'t be reversed by hashing guesses or computed outside Hookbase); remove: delete it',
    ),
    keepLastN: z.number().int().min(0).max(20).optional().describe('For mask: characters left visible at the end (default 4)'),
  }).describe('What happens to each value the rule matches'),
});

const scopeEnum = z.enum(['storage', 'delivery', 'both']);

export const redactionPolicyTools = [
  {
    name: 'hookbase_list_redaction_policies',
    description: 'List redaction policies for this org. Optionally filter by source_id (org-wide policies have null sourceId).',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    routes: ['GET /redaction-policies'],
    inputSchema: z.object({
      source_id: z.guid().optional(),
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
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    routes: ['GET /redaction-policies/:id'],
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
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    routes: ['POST /redaction-policies'],
    inputSchema: z.object({
      name: z.string().min(1).max(100),
      source_id: z.guid().nullable().optional(),
      rules: z.array(ruleSchema).min(1).max(50).describe('1 to 50 rules, applied in order'),
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
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    routes: ['PUT /redaction-policies/:id'],
    inputSchema: z.object({
      policy_id: z.string(),
      name: z.string().min(1).max(100),
      source_id: z.guid().nullable().optional(),
      rules: z.array(ruleSchema).min(1).max(50).describe('The whole ruleset, replacing the stored one: 1 to 50 rules, applied in order'),
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
    description: 'Delete a redaction policy (admin or owner). Nothing else references it by foreign key, so past events keep their existing redaction audit trail — only future traffic stops being matched against this policy.',
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    routes: ['DELETE /redaction-policies/:id'],
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
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    routes: ['POST /redaction-policies/preview'],
    inputSchema: z.object({
      rules: z.array(ruleSchema).min(1).max(50).describe('The candidate ruleset: 1 to 50 rules, applied in order'),
      payload: z.unknown().optional(),
      headers: boundedRecord(z.string()).optional(),
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
