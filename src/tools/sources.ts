/**
 * Source tools for MCP server
 */

import { z } from 'zod';
import * as api from '../lib/api.js';

// Mirrors VALID_INGEST_METHODS in api/src/routes/sources.ts. OPTIONS is excluded there because
// CORS preflight is answered by middleware before ingest runs.
const INGEST_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'] as const;

const ALLOWED_METHODS_DESC =
  "HTTP methods this source's ingest endpoint accepts. Omit or pass [] to accept any method. " +
  'GET/HEAD/DELETE carry no body, so their query string becomes the event payload.';

// Mirrors SUPPORTED_SIGNATURE_PROVIDERS in api/src/utils/signature-schemes.ts, which the API's
// create/update schemas derive their enum from. Regenerate with
// `npx tsx scripts/print-source-enums.ts` in the api package.
//
// This is an enum rather than a free string on purpose: the field used to be `z.string()`
// described as 'e.g. "github", "stripe", "shopify"', which invites a model to supply a
// plausible name like "sendgrid" or "intercom" and get back a bare "Invalid input" 400 with no
// indication of what would have worked. An enum puts the real answer in the tool schema.
const SOURCE_PROVIDERS = [
  'airtable',
  'asana',
  'bitbucket',
  'calendly',
  'custom',
  'generic',
  'github',
  'gitlab',
  'heroku',
  'intercom',
  'lemonsqueezy',
  'notion',
  'paddle',
  'razorpay',
  'sentry',
  'shopify',
  'slack',
  'standard-webhooks',
  'stripe',
  'svix',
  'twilio',
  'typeform',
  'workos',
  'zoom'
] as const;

const PROVIDER_DESC =
  'Webhook provider, which selects the signature scheme used to verify incoming requests. ' +
  'Omit it for a source that should accept unsigned requests. Use "standard-webhooks" (alias ' +
  '"svix") for any sender built on Svix, including Resend and Clerk, and "custom" for a ' +
  'sender that signs the raw body with HMAC-SHA256 in its own header.';

export const sourceTools = [
  {
    name: 'hookbase_list_sources',
    description: 'List all webhook sources in the organization. A source is an ingest endpoint that receives incoming webhooks from a provider like GitHub or Stripe and records them as events — it forwards nothing on its own until hookbase_create_route connects it to a destination. Returns summary fields including eventCount and routeCount; use hookbase_get_source for one source\'s full configuration.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: z.object({}).strict(),
    handler: async () => {
      const result = await api.getSources();
      if (result.error) {
        return { error: result.error };
      }
      return {
        sources: result.data?.sources.map(s => ({
          id: s.id,
          name: s.name,
          slug: s.slug,
          provider: s.provider,
          isActive: s.isActive,
          transientMode: s.transientMode ?? false,
          allowedMethods: s.allowedMethods ?? [],
          eventCount: s.eventCount ?? 0,
          routeCount: s.routeCount ?? 0,
          createdAt: s.createdAt,
        })),
      };
    },
  },
  {
    name: 'hookbase_get_source',
    description: 'Get full configuration for a single source, including its allowed HTTP methods, rate limit, and signature-verification settings. The signing secret itself is never returned here — only hasSigningSecret and signingSecretLast4; use hookbase_rotate_source_secret if you need a fresh one (the create response is the only time the full secret is ever returned).',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: z.object({
      source_id: z.string().describe('The ID of the source to retrieve'),
    }).strict(),
    handler: async (args: { source_id: string }) => {
      const result = await api.getSource(args.source_id);
      if (result.error) {
        return { error: result.error };
      }
      const s = result.data?.source;
      return {
        source: s ? {
          id: s.id,
          name: s.name,
          slug: s.slug,
          provider: s.provider,
          description: s.description,
          // GET masks the secret: it returns hasSigningSecret + signingSecretLast4, never the raw value.
          hasSigningSecret: s.hasSigningSecret,
          signingSecretLast4: s.signingSecretLast4,
          rejectInvalidSignatures: s.rejectInvalidSignatures,
          rateLimitPerMinute: s.rateLimitPerMinute,
          isActive: s.isActive,
          transientMode: s.transientMode ?? false,
          allowedMethods: s.allowedMethods ?? [],
          createdAt: s.createdAt,
        } : null,
      };
    },
  },
  {
    name: 'hookbase_create_source',
    description: 'Create a new webhook source. Sources receive incoming webhooks and can be connected to destinations via routes.',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    inputSchema: z.object({
      name: z.string().describe('Display name for the source'),
      slug: z.string().describe('URL-safe identifier (e.g., "github-webhooks")'),
      provider: z.enum(SOURCE_PROVIDERS).optional().describe(PROVIDER_DESC),
      description: z.string().optional().describe('Optional description of the source'),
      reject_invalid_signatures: z.boolean().optional().describe('Whether to reject webhooks with invalid signatures'),
      rate_limit_per_minute: z.number().optional().describe('Maximum webhooks per minute (rate limiting)'),
      transient_mode: z.boolean().optional().describe('Enable transient mode - payloads never stored at rest (HIPAA/GDPR compliance). Disables replay and payload viewing.'),
      allowed_methods: z.array(z.enum(INGEST_METHODS)).optional().describe(ALLOWED_METHODS_DESC),
    }).strict(),
    handler: async (args: {
      name: string;
      slug: string;
      provider?: string;
      description?: string;
      reject_invalid_signatures?: boolean;
      rate_limit_per_minute?: number;
      transient_mode?: boolean;
      allowed_methods?: string[];
    }) => {
      const result = await api.createSource(args.name, args.slug, args.provider, {
        description: args.description,
        rejectInvalidSignatures: args.reject_invalid_signatures,
        rateLimitPerMinute: args.rate_limit_per_minute,
        transientMode: args.transient_mode,
        allowedMethods: args.allowed_methods,
      });
      if (result.error) {
        return { error: result.error };
      }
      const s = result.data?.source;
      return {
        message: 'Source created successfully',
        source: s ? {
          id: s.id,
          name: s.name,
          slug: s.slug,
          provider: s.provider,
          signingSecret: s.signingSecret,
        } : null,
      };
    },
  },
  {
    name: 'hookbase_update_source',
    description: 'Update an existing source\'s configuration — name, provider, signature enforcement, rate limit, transient mode, or allowed methods. Only the fields you provide are changed; omitted fields keep their current value. Turning on reject_invalid_signatures immediately starts rejecting webhooks that fail verification; turning on transient_mode stops new payloads from being stored at rest but does not retroactively delete payloads already stored. This does not rotate the signing secret — use hookbase_rotate_source_secret for that.',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: z.object({
      source_id: z.string().describe('The ID of the source to update'),
      name: z.string().optional().describe('New display name'),
      description: z.string().optional().describe('New description'),
      is_active: z.boolean().optional().describe('Enable or disable the source'),
      provider: z.enum(SOURCE_PROVIDERS).optional().describe('Change the source\'s provider. ' + PROVIDER_DESC),
      reject_invalid_signatures: z.boolean().optional().describe('Whether to reject invalid signatures'),
      rate_limit_per_minute: z.number().optional().describe('Maximum webhooks per minute'),
      transient_mode: z.boolean().optional().describe('Enable transient mode - payloads never stored at rest (HIPAA/GDPR compliance)'),
      allowed_methods: z.array(z.enum(INGEST_METHODS)).optional().describe(ALLOWED_METHODS_DESC + ' Pass [] to revert to accepting any method.'),
    }).strict(),
    handler: async (args: {
      source_id: string;
      name?: string;
      description?: string;
      is_active?: boolean;
      provider?: string;
      reject_invalid_signatures?: boolean;
      rate_limit_per_minute?: number;
      transient_mode?: boolean;
      allowed_methods?: string[];
    }) => {
      const result = await api.updateSource(args.source_id, {
        name: args.name,
        description: args.description,
        isActive: args.is_active,
        provider: args.provider,
        rejectInvalidSignatures: args.reject_invalid_signatures,
        rateLimitPerMinute: args.rate_limit_per_minute,
        transientMode: args.transient_mode,
        allowedMethods: args.allowed_methods,
      });
      if (result.error) {
        return { error: result.error };
      }
      return { message: 'Source updated successfully', source: result.data?.source };
    },
  },
  {
    name: 'hookbase_delete_source',
    description: 'Delete a webhook source. Cascades to delete its routes, their deliveries, and every event ever ingested through this source — event history is not recoverable afterward.',
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    inputSchema: z.object({
      source_id: z.string().describe('The ID of the source to delete'),
    }).strict(),
    handler: async (args: { source_id: string }) => {
      const result = await api.deleteSource(args.source_id);
      if (result.error) {
        return { error: result.error };
      }
      return { message: 'Source deleted successfully' };
    },
  },
  {
    name: 'hookbase_rotate_source_secret',
    description: 'Rotate the signing secret for a source. Returns the new secret (save it securely) - unlike endpoint secret rotation, there is no grace period: the old secret stops verifying signatures immediately, so update every sender using it before rotating.',
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    inputSchema: z.object({
      source_id: z.string().describe('The ID of the source'),
    }).strict(),
    handler: async (args: { source_id: string }) => {
      const result = await api.rotateSourceSecret(args.source_id);
      if (result.error) {
        return { error: result.error };
      }
      return {
        message: 'Secret rotated successfully. Save the new secret now - the old one stopped working immediately.',
        signingSecret: result.data?.signingSecret,
      };
    },
  },
];
