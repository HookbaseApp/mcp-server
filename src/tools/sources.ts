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

// The API accepts 78 provider values (SUPPORTED_SIGNATURE_PROVIDERS in
// api/src/utils/signature-schemes.ts: 71 scheme ids plus the aliases svix, clerk, resend, render,
// etsy, stytch and generic) and the list keeps growing. This used to be a 24-value zod enum, which
// rejected real providers like "sendgrid" or "whatsapp" before the request ever left the server.
// It is now an open string: the API validates it and answers an unknown value with a clear 400,
// and hookbase_list_providers / hookbase_get_provider tell an agent which value to use and
// whether the user has to paste a secret.
const PROVIDER_DESC =
  'Webhook provider, which selects the signature scheme used to verify incoming requests. ' +
  'Common values: "github", "stripe", "shopify", "slack", "gitlab", "twilio", "paddle", "sendgrid", ' +
  '"whatsapp", "standard-webhooks", "custom". Not sure of the exact value? Call hookbase_list_providers ' +
  '(search by vendor name) and use the entry\'s hookbaseProvider — the catalog id can differ — then ' +
  'hookbase_get_provider to learn whether the user must paste a secret (secretSource). Omit it for a ' +
  'source that should accept unsigned requests. Use "standard-webhooks" (alias "svix") for any sender ' +
  'built on Standard Webhooks / Svix; "clerk", "resend", "render", "etsy" and "stytch" are accepted as ' +
  'aliases for it. Use "custom" (alias "generic") for a sender that signs the raw body with HMAC-SHA256 ' +
  'in its own header. An unknown value is rejected by the API with a 400.';

const SIGNING_SECRET_DESC =
  'Signing secret (or public key) used to verify this source\'s webhooks. Whether to send it depends ' +
  'on the provider\'s secretSource (see hookbase_get_provider): "provider" — the vendor issues it, so ' +
  'ask the user to paste it (required for Standard Webhooks/svix/clerk/resend, airtable, ' +
  'gitlab-signing-token, and supabase-auth-hooks, and format-checked); "public_key" — paste the ' +
  'vendor\'s public key (required); "operator" — omit it and Hookbase generates one, returned once as ' +
  'signingSecret for the user to paste into the vendor; "built_in" (wise, wise-sandbox, aws-sns) — ' +
  'never send one (400); "none" — optional, only for a custom HMAC secret. Asana and Notion issue ' +
  'their secret only after the URL is registered: omit it on create.';

const SOURCE_ID_DESC = 'The source ID or slug';

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
    description: 'Get full configuration for a single source, including its allowed HTTP methods, rate limit, and signature-verification settings. The signing secret itself is never returned here — only hasSigningSecret and signingSecretLast4; use hookbase_reveal_source_secret to read the full value. awaitingSigningSecret=true means no secret is stored and only the vendor can issue one (e.g. Stripe or Shopify when the create omitted it, or Asana/Notion, which issue it only after the ingest URL is registered), so events are accepted but not verified until it is set with hookbase_update_source signing_secret (or, for Notion, adopted via hookbase_adopt_source_pending_verification). verifiesWithoutSecret=true means the provider publishes a key Hookbase already has (wise, aws-sns), so events are verified with no secret.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: z.object({
      source_id: z.string().describe(SOURCE_ID_DESC),
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
          awaitingSigningSecret: s.awaitingSigningSecret ?? false,
          verifiesWithoutSecret: s.verifiesWithoutSecret ?? false,
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
    description: 'Create a new webhook source. Sources receive incoming webhooks and can be connected to destinations via routes. Before creating one for a named vendor, call hookbase_get_provider to find the right provider value and its secretSource: if it is "provider" or "public_key", ask the user for the vendor-issued secret/key and pass it as signing_secret (for public keys and format-checked vendor keys such as Standard Webhooks/svix the API rejects the create without it; for the rest the source is created with no secret and awaitingSigningSecret=true, so events are not verified until it is set); if it is "operator", omit signing_secret and give the user the returned signingSecret to paste into the vendor — it is shown only here (hookbase_reveal_source_secret can read it later). The response also carries ingestUrl (the URL to register with the vendor), verifyToken for WhatsApp/Meta, and awaitingSigningSecret=true when no secret was stored for a vendor-issued provider (including Asana and Notion, which issue it only after the URL is registered).',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    inputSchema: z.object({
      name: z.string().describe('Display name for the source'),
      slug: z.string().describe('URL-safe identifier, lowercase letters, digits and dashes (e.g., "github-webhooks")'),
      provider: z.string().optional().describe(PROVIDER_DESC),
      description: z.string().optional().describe('Optional description of the source'),
      signing_secret: z.string().optional().describe(SIGNING_SECRET_DESC),
      verify_token: z.string().optional().describe('WhatsApp/Meta only (the API returns 400 for any other provider): the "Verify token" Meta checks when the URL is registered. Omit it and Hookbase generates one, returned as verifyToken.'),
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
      signing_secret?: string;
      verify_token?: string;
      reject_invalid_signatures?: boolean;
      rate_limit_per_minute?: number;
      transient_mode?: boolean;
      allowed_methods?: string[];
    }) => {
      const result = await api.createSource(args.name, args.slug, args.provider, {
        description: args.description,
        signingSecret: args.signing_secret,
        verifyToken: args.verify_token,
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
          ingestUrl: s.ingestUrl,
          // null for built-in-key and secret-after-registration providers.
          signingSecret: s.signingSecret ?? null,
          ...(s.verifyToken ? { verifyToken: s.verifyToken } : {}),
          awaitingSigningSecret: s.awaitingSigningSecret ?? false,
          verifiesWithoutSecret: s.verifiesWithoutSecret ?? false,
        } : null,
      };
    },
  },
  {
    name: 'hookbase_update_source',
    description: 'Update an existing source\'s configuration — name, provider, signing secret, verify token, signature enforcement, rate limit, transient mode, or allowed methods. Only the fields you provide are changed; omitted fields keep their current value. Switching to a provider whose secret the vendor issues requires signing_secret in the same update. Turning on reject_invalid_signatures immediately starts rejecting webhooks that fail verification; turning on transient_mode stops new payloads from being stored at rest but does not retroactively delete payloads already stored. To have Hookbase generate a fresh secret use hookbase_rotate_source_secret instead. Returns only a confirmation — call hookbase_get_source (or hookbase_get_source_verify_token) to read the result.',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: z.object({
      source_id: z.string().describe(SOURCE_ID_DESC),
      name: z.string().optional().describe('New display name'),
      description: z.string().optional().describe('New description'),
      is_active: z.boolean().optional().describe('Enable or disable the source'),
      provider: z.string().nullable().optional().describe('Change the source\'s provider (null clears it). ' + PROVIDER_DESC),
      signing_secret: z.string().nullable().optional().describe('Set the signing secret (e.g. one the user copied from the vendor, or Asana\'s secret once it has been issued); null removes it. Takes effect immediately — the old secret stops verifying. ' + SIGNING_SECRET_DESC),
      verify_token: z.string().nullable().optional().describe('WhatsApp/Meta only: set the verify token, or pass "" / null to have Hookbase generate a new one (read it back with hookbase_get_source_verify_token).'),
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
      provider?: string | null;
      signing_secret?: string | null;
      verify_token?: string | null;
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
        signingSecret: args.signing_secret,
        verifyToken: args.verify_token,
        rejectInvalidSignatures: args.reject_invalid_signatures,
        rateLimitPerMinute: args.rate_limit_per_minute,
        transientMode: args.transient_mode,
        allowedMethods: args.allowed_methods,
      });
      if (result.error) {
        return { error: result.error };
      }
      // PATCH answers {success: true} only; there is no source object to echo.
      return { message: 'Source updated successfully' };
    },
  },
  {
    name: 'hookbase_delete_source',
    description: 'Delete a webhook source. Cascades to delete its routes, their deliveries, and every event ever ingested through this source — event history is not recoverable afterward.',
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    inputSchema: z.object({
      source_id: z.string().describe(SOURCE_ID_DESC),
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
    description: 'Have Hookbase generate a new signing secret for a source. Returns the new secret (save it securely) - unlike endpoint secret rotation, there is no grace period: the old secret stops verifying signatures immediately, so update every sender using it before rotating. Only works for providers whose secret Hookbase generates (secretSource "operator", or custom/no provider). The API returns 400 for built-in-key providers (wise, wise-sandbox, aws-sns: nothing to rotate), public-key providers (paste the vendor\'s new key via hookbase_update_source signing_secret), vendor-issued secrets such as Standard Webhooks/svix/clerk/resend, gitlab-signing-token or airtable (regenerate it at the vendor, then set it with hookbase_update_source), and every other provider whose secret the vendor issues (secretSource "provider", e.g. stripe, shopify, slack, twilio, and asana/notion after registration).',
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    inputSchema: z.object({
      source_id: z.string().describe(SOURCE_ID_DESC),
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
  {
    name: 'hookbase_reveal_source_secret',
    description: 'Reveal the full signing secret currently stored on a source (hookbase_get_source only shows the last 4 characters). Use it when the user needs to paste a Hookbase-generated secret into the vendor after the create response is gone. Returns 404 when the source has no secret (built-in-key providers, or one still awaiting its secret). Requires an API key with write scope and a member+ role.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: z.object({
      source_id: z.string().describe(SOURCE_ID_DESC),
    }).strict(),
    handler: async (args: { source_id: string }) => {
      const result = await api.revealSourceSecret(args.source_id);
      if (result.error) {
        return { error: result.error };
      }
      return { signingSecret: result.data?.signingSecret ?? null };
    },
  },
  {
    name: 'hookbase_get_source_verify_token',
    description: 'Read the verify token of a WhatsApp/Meta source — the value the user enters in Meta\'s "Verify token" field when registering the ingest URL. Returns 400 for providers that have no verify token. Requires an API key with write scope and a member+ role.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: z.object({
      source_id: z.string().describe(SOURCE_ID_DESC),
    }).strict(),
    handler: async (args: { source_id: string }) => {
      const result = await api.getSourceVerifyToken(args.source_id);
      if (result.error) {
        return { error: result.error };
      }
      return { verifyToken: result.data?.verifyToken ?? null };
    },
  },
  {
    name: 'hookbase_rotate_source_verify_token',
    description: 'Generate a new verify token for a WhatsApp/Meta source and return it. The old token stops answering Meta\'s registration check immediately, so the user must enter the new one in Meta before re-verifying the URL. Already-registered webhooks keep flowing (the token is only checked at registration). Returns 400 for providers that have no verify token.',
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    inputSchema: z.object({
      source_id: z.string().describe(SOURCE_ID_DESC),
    }).strict(),
    handler: async (args: { source_id: string }) => {
      const result = await api.rotateSourceVerifyToken(args.source_id);
      if (result.error) {
        return { error: result.error };
      }
      return {
        message: 'Verify token rotated. Enter the new token in Meta before re-verifying the URL.',
        verifyToken: result.data?.verifyToken ?? null,
      };
    },
  },
  {
    name: 'hookbase_get_source_pending_verification',
    description: 'Show the verification token a vendor delivered to the source\'s ingest URL during registration and Hookbase parked instead of trusting (currently Notion, whose subscription sends a verification_token that is also its signing secret). Returns {provider, token, receivedAt, clientIp}, or a 404 error when nothing is waiting. The user pastes the token into the vendor\'s Verify form; once the vendor shows the subscription as verified, call hookbase_adopt_source_pending_verification.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: z.object({
      source_id: z.string().describe(SOURCE_ID_DESC),
    }).strict(),
    handler: async (args: { source_id: string }) => {
      const result = await api.getSourcePendingVerification(args.source_id);
      if (result.error) {
        return { error: result.error };
      }
      return { pendingVerification: result.data ?? null };
    },
  },
  {
    name: 'hookbase_adopt_source_pending_verification',
    description: 'Make the parked verification token (see hookbase_get_source_pending_verification) this source\'s signing secret, replacing any existing one, and discard the pending copy. The token arrived unauthenticated, so only adopt it after the user confirms the vendor accepted it (e.g. Notion shows the subscription as verified). Returns a 404 error when no token is waiting.',
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    inputSchema: z.object({
      source_id: z.string().describe(SOURCE_ID_DESC),
    }).strict(),
    handler: async (args: { source_id: string }) => {
      const result = await api.adoptSourcePendingVerification(args.source_id);
      if (result.error) {
        return { error: result.error };
      }
      return { message: 'Verification token adopted as the source\'s signing secret.' };
    },
  },
];
