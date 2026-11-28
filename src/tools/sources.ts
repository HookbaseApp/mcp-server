/**
 * Source tools for MCP server
 */

import { z, MAX_COLLECTION, pageInputs, PAGED_LIST_NOTE } from '../lib/zod.js';
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

// Vendors whose catalog entry has hookbaseProvider "custom": Hookbase has no verifier for them, and
// they send every customer's webhooks from the same addresses, so a bridge destination must not take
// the source's IP allowlist as proof of the sender. The API learns the vendor from catalogProvider.
const CATALOG_PROVIDER_DESC =
  'Provider-catalog entry id this source is for: the id hookbase_list_providers / hookbase_get_provider ' +
  'return (e.g. "salesforce"), which can differ from provider. Pass it whenever the entry\'s ' +
  'hookbaseProvider is "custom" (Hookbase has no verifier for that vendor: Salesforce, Plaid, Microsoft ' +
  'Teams, Mollie, Docker Hub, DigitalOcean). Those vendors send every customer\'s webhooks from the same ' +
  'addresses, so with it set a bridge destination does not count the source\'s IP allowlist as proof of ' +
  'the sender. Create-only: it cannot be changed later. An unknown id is rejected with a 400.';

// Connecting a source and replacing its provider key take a provider API key. No tool here takes
// one (a key must not pass through the model), so the descriptions send the user elsewhere.
const PROVIDER_KEY_ELSEWHERE =
  'Connecting a source and replacing its provider key need a provider API key, which this server never ' +
  'accepts: the user does both in the Hookbase dashboard, an SDK, the CLI or Terraform.';

/** The source's provider connection summary, or null (also on API versions without one). */
function connectionSummary(c: api.SourceConnectionSummary | null | undefined) {
  return c ? {
    provider: c.provider,
    status: c.status,
    environment: c.environment,
    reconcileEnabled: c.reconcileEnabled,
  } : null;
}

/** A connection, field by field: whatever else the API might add (never the key) stays out. */
function connectionDetail(c: api.SourceConnection) {
  return {
    id: c.id,
    provider: c.provider,
    environment: c.environment,
    status: c.status,
    credentialHint: c.credentialHint,
    credentialExpiresAt: c.credentialExpiresAt ?? null,
    accountLabel: c.accountLabel ?? null,
    remoteId: c.remoteId ?? null,
    events: c.events ?? [],
    githubTarget: c.githubTarget ?? null,
    priorSourceSettings: c.priorSourceSettings ?? null,
    reconcileEnabled: c.reconcileEnabled,
    running: c.running ?? false,
    nextRunAt: c.nextRunAt ?? null,
    lastRunAt: c.lastRunAt ?? null,
    lastRun: c.lastRun ?? null,
    lastError: c.lastError ?? null,
    consecutiveFailures: c.consecutiveFailures ?? 0,
    recoveredTotal: c.recoveredTotal ?? 0,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export const sourceTools = [
  {
    name: 'hookbase_list_sources',
    description: 'List webhook sources in the organization. A source is an ingest endpoint that receives incoming webhooks from a provider like GitHub or Stripe and records them as events — it forwards nothing on its own until hookbase_create_route connects it to a destination. Returns summary fields including eventCount, routeCount and connection ({provider, status, environment, reconcileEnabled} for a source connected to Stripe, GitHub or Paddle, else null); use hookbase_get_source for one source\'s full configuration. ' + PAGED_LIST_NOTE,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    routes: ['GET /sources'],
    inputSchema: z.object({ ...pageInputs }).strict(),
    handler: async (args: { page?: number; page_size?: number }) => {
      const result = await api.getSources({ page: args.page, pageSize: args.page_size });
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
          connection: connectionSummary(s.connection),
          createdAt: s.createdAt,
        })),
        pagination: result.data?.pagination,
      };
    },
  },
  {
    name: 'hookbase_get_source',
    description: 'Get full configuration for a single source, including its allowed HTTP methods, rate limit, and signature-verification settings. The signing secret itself is never returned here — only hasSigningSecret and signingSecretLast4; use hookbase_reveal_source_secret to read the full value. awaitingSigningSecret=true means no secret is stored and only the vendor can issue one (e.g. Stripe or Shopify when the create omitted it, or Asana/Notion, which issue it only after the ingest URL is registered), so events are accepted but not verified until it is set with hookbase_update_source signing_secret (or, for Notion, adopted via hookbase_adopt_source_pending_verification). verifiesWithoutSecret=true means the provider publishes a key Hookbase already has (wise, aws-sns), so events are verified with no secret. catalogProvider is the provider-catalog entry id the source was created for (null when none was given). connection is {provider, status, environment, reconcileEnabled} when the source is connected to Stripe, GitHub or Paddle (Hookbase registered the provider\'s webhook and recovers events it failed to deliver; hookbase_get_source_connection has the details), else null.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    routes: ['GET /sources/:id'],
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
          catalogProvider: s.catalogProvider ?? null,
          connection: connectionSummary(s.connection),
          createdAt: s.createdAt,
        } : null,
      };
    },
  },
  {
    name: 'hookbase_create_source',
    description: 'Create a new webhook source. Sources receive incoming webhooks and can be connected to destinations via routes. Before creating one for a named vendor, call hookbase_get_provider to find the right provider value and its secretSource: if it is "provider" or "public_key", ask the user for the vendor-issued secret/key and pass it as signing_secret (for public keys and format-checked vendor keys such as Standard Webhooks/svix the API rejects the create without it; for the rest the source is created with no secret and awaitingSigningSecret=true, so events are not verified until it is set); if it is "operator", omit signing_secret and give the user the returned signingSecret to paste into the vendor — it is shown only here (hookbase_reveal_source_secret can read it later). The response also carries ingestUrl (the URL to register with the vendor), verifyToken for WhatsApp/Meta, and awaitingSigningSecret=true when no secret was stored for a vendor-issued provider (including Asana and Notion, which issue it only after the URL is registered). When the source is for a catalog entry whose hookbaseProvider is "custom" (e.g. Salesforce, Plaid, Microsoft Teams, Mollie, Docker Hub, DigitalOcean), pass that entry\'s id as catalog_provider: it cannot be added later.',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    routes: ['POST /sources'],
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
      allowed_methods: z.array(z.enum(INGEST_METHODS)).max(MAX_COLLECTION).optional().describe(ALLOWED_METHODS_DESC),
      catalog_provider: z.string().optional().describe(CATALOG_PROVIDER_DESC),
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
      catalog_provider?: string;
    }) => {
      const result = await api.createSource(args.name, args.slug, args.provider, {
        description: args.description,
        signingSecret: args.signing_secret,
        verifyToken: args.verify_token,
        rejectInvalidSignatures: args.reject_invalid_signatures,
        rateLimitPerMinute: args.rate_limit_per_minute,
        transientMode: args.transient_mode,
        allowedMethods: args.allowed_methods,
        catalogProvider: args.catalog_provider,
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
    routes: ['PATCH /sources/:id'],
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
      allowed_methods: z.array(z.enum(INGEST_METHODS)).max(MAX_COLLECTION).optional().describe(ALLOWED_METHODS_DESC + ' Pass [] to revert to accepting any method.'),
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
    routes: ['DELETE /sources/:id'],
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
    routes: ['POST /sources/:id/rotate-secret'],
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
    routes: ['GET /sources/:id/reveal-secret'],
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
    routes: ['GET /sources/:id/verify-token'],
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
    routes: ['POST /sources/:id/rotate-verify-token'],
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
    routes: ['GET /sources/:id/pending-verification'],
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
    routes: ['POST /sources/:id/pending-verification/adopt'],
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
  {
    name: 'hookbase_get_source_connection',
    description: 'Show a source\'s connection to its provider (Stripe, GitHub or Paddle) and the state of recovery. A connected source has a webhook Hookbase registered at the provider with a stored provider API key (never returned; credentialHint shows its prefix and last 4 characters), and recovery asks the provider which events it failed to deliver and gets them to the source. Returns connection with provider, environment, status (pending: a connect is in progress; active; error: the last recovery run failed, see lastError; credential_invalid: the provider no longer accepts the stored key), accountLabel, events, reconcileEnabled (recovery on), running, nextRunAt, lastRunAt, lastRun (found, alreadyReceived, recovered, requested, gaveUp, stoppedReason), lastError and recoveredTotal. Returns connection: null when the source is not connected. ' + PROVIDER_KEY_ELSEWHERE,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    routes: ['GET /sources/:id/connection'],
    inputSchema: z.object({
      source_id: z.string().describe(SOURCE_ID_DESC),
    }).strict(),
    handler: async (args: { source_id: string }) => {
      const result = await api.getSourceConnection(args.source_id);
      if (result.error) {
        return api.toolError(result);
      }
      const c = result.data?.connection;
      if (!c) {
        return {
          connection: null,
          message: 'This source is not connected to a provider. ' + PROVIDER_KEY_ELSEWHERE,
        };
      }
      return { connection: connectionDetail(c) };
    },
  },
  {
    name: 'hookbase_list_source_recovery_items',
    description: 'List a connected source\'s recovery ledger: the events its provider said it failed to deliver, newest first, and what became of each. Each item has providerEventId, method (self_ingest: Hookbase fetched the Stripe event and ingested it; redelivery: GitHub was asked to redeliver it; replay: Paddle was asked to replay it), status (pending: requested or to be retried, not arrived yet; recovered; gave_up: 3 attempts failed or the provider no longer has it), attempts, providerRef, eventId (the Hookbase event it arrived as, when known; read it with hookbase_get_event), firstSeenAt, lastAttemptAt and recoveredAt. Items are kept for 35 days after their last change. Empty when the source is not connected.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    routes: ['GET /sources/:id/connection/items'],
    inputSchema: z.object({
      source_id: z.string().describe(SOURCE_ID_DESC),
      status: z.enum(api.RECOVERY_ITEM_STATUSES).optional().describe('Only items with this status. Omit for all.'),
      limit: z.number().int().min(1).max(100).optional().describe('Default 50, max 100'),
    }).strict(),
    handler: async (args: { source_id: string; status?: string; limit?: number }) => {
      const result = await api.listSourceRecoveryItems(args.source_id, { status: args.status, limit: args.limit });
      if (result.error) {
        return api.toolError(result);
      }
      return {
        items: (result.data?.items ?? []).map(i => ({
          providerEventId: i.providerEventId,
          method: i.method,
          status: i.status,
          attempts: i.attempts,
          providerRef: i.providerRef ?? null,
          eventId: i.eventId ?? null,
          firstSeenAt: i.firstSeenAt,
          lastAttemptAt: i.lastAttemptAt ?? null,
          recoveredAt: i.recoveredAt ?? null,
        })),
      };
    },
  },
  {
    name: 'hookbase_run_source_recovery',
    description: 'Recover a connected source\'s missed events now instead of at the next scheduled run (every 15 minutes once caught up). Hookbase asks the provider which events it failed to deliver, then fetches Stripe events and ingests them itself, asks GitHub to redeliver, or asks Paddle to replay, so the events reach the source and its routes. Returns {queued: true}: the run starts within a minute, and hookbase_get_source_connection shows its result as lastRun (hookbase_list_source_recovery_items lists each event). Recovery needs a Pro or Business plan (403 otherwise). A refusal is a 409 with code RECONCILE_REFUSED and a reason: pending (a connect is in progress), credential_invalid (the provider no longer accepts the stored key; the user must replace it outside this server), disabled (recovery is off; hookbase_set_source_recovery turns it on), running (a run is in progress) or too_soon (a run finished in the last 5 minutes). Members, admins and owners; API keys need the write scope.',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    routes: ['POST /sources/:id/connection/reconcile'],
    inputSchema: z.object({
      source_id: z.string().describe(SOURCE_ID_DESC),
    }).strict(),
    handler: async (args: { source_id: string }) => {
      const result = await api.runSourceRecovery(args.source_id);
      if (result.error) {
        return api.toolError(result);
      }
      return {
        queued: result.data?.queued ?? true,
        message: 'Recovery queued: a run starts within the next minute. Call hookbase_get_source_connection for its result (lastRun).',
      };
    },
  },
  {
    name: 'hookbase_set_source_recovery',
    description: 'Turn recovery on or off for a connected source. This changes only that setting: it cannot replace the stored provider key, and no tool on this server takes one. Turning recovery on needs a Pro or Business plan (403 otherwise); turning it off works on any plan and stops the scheduled runs, while the provider\'s webhook stays registered and events keep arriving. Returns the updated connection (as hookbase_get_source_connection does). A 404 means the source is not connected; a 409 with code CONNECTION_CONFLICT means a connect is in progress. Admin or owner only; API keys need the write scope.',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    routes: ['PATCH /sources/:id/connection'],
    inputSchema: z.object({
      source_id: z.string().describe(SOURCE_ID_DESC),
      reconcile_enabled: z.boolean().describe('true turns recovery on, false turns it off'),
    }).strict(),
    handler: async (args: { source_id: string; reconcile_enabled: boolean }) => {
      // Only reconcile_enabled goes out, whatever else arrives: the same PATCH takes a provider key.
      const result = await api.setSourceRecovery(args.source_id, args.reconcile_enabled);
      if (result.error) {
        return api.toolError(result);
      }
      const c = result.data?.connection;
      return {
        message: args.reconcile_enabled ? 'Recovery turned on.' : 'Recovery turned off.',
        connection: c ? connectionDetail(c) : null,
      };
    },
  },
  {
    name: 'hookbase_disconnect_source',
    description: 'Disconnect a source from its provider (Stripe, GitHub or Paddle): Hookbase deletes the webhook it registered at the provider and the stored provider key, and recovery stops, so the provider stops sending this source events. The source, its routes and its events stay, and it keeps its current settings, including the signing secret connect set (priorSourceSettings in hookbase_get_source_connection shows what connect changed); once disconnected, hookbase_update_source can change them. Returns {success, remoteRemoved, retrying, message}: retrying=true means the provider could not be reached and Hookbase keeps trying to remove the webhook; otherwise, when remoteRemoved is false, message says to delete the webhook at the provider by hand. A 409 with code CONNECTION_CONFLICT means a connect is in progress. Reconnecting needs a provider API key, which this server never accepts: the user reconnects in the Hookbase dashboard, an SDK, the CLI or Terraform. Admin or owner only; API keys need the write scope.',
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    routes: ['DELETE /sources/:id/connection'],
    inputSchema: z.object({
      source_id: z.string().describe(SOURCE_ID_DESC),
    }).strict(),
    handler: async (args: { source_id: string }) => {
      const result = await api.disconnectSource(args.source_id);
      if (result.error) {
        return api.toolError(result);
      }
      const d = result.data;
      const remoteRemoved = d?.remoteRemoved ?? false;
      const retrying = d?.retrying ?? false;
      return {
        success: d?.success ?? true,
        remoteRemoved,
        retrying,
        // The API's message is null when nothing is left for the user to do.
        message: d?.message ?? (remoteRemoved
          ? 'Disconnected. The provider webhook is gone and the stored key was deleted.'
          : retrying
            ? 'Disconnected. Hookbase is still removing the provider webhook and keeps trying in the background.'
            : 'Disconnected.'),
      };
    },
  },
];
