/**
 * Provider catalog tools for MCP server
 *
 * Wraps Hookbase's public provider catalog (GET /api/catalog/providers), the same data the
 * dashboard's create-source dialog uses. It answers the two questions an agent cannot guess when
 * creating a source for a named vendor: which `provider` value to send (the catalog's
 * hookbaseProvider, which can differ from its id) and whether the user has to paste a secret.
 */

import { z } from 'zod';
import * as api from '../lib/api.js';

const SECRET_SOURCE_DESC =
  'signatureVerification.secretSource says who produces the credential a source stores: ' +
  '"provider" — the vendor issues it; ask the user to copy it from the vendor (see secretInstruction) ' +
  'and pass it as signing_secret to hookbase_create_source, which rejects the create without it for ' +
  'format-checked vendor keys; for the rest a create without it stores no secret (awaitingSigningSecret=true, events unverified until it is set). "public_key" — the vendor\'s public verification key; ask the user to paste it. ' +
  '"operator" — the vendor only has an input field; omit signing_secret, Hookbase generates one, and the ' +
  'user pastes the returned signingSecret into the vendor. "built_in" — the vendor publishes one key ' +
  'Hookbase already has; send no secret (the API rejects one) — events are still verified. "none" — the ' +
  'vendor does not sign (or Hookbase cannot verify it); no secret needed. secretAfterRegistration=true ' +
  'means the vendor issues its secret only after the ingest URL is registered: create the source ' +
  'without one, then set it later (Notion\'s token is parked — see hookbase_get_source_pending_verification).';

const CATEGORIES =
  'payments, developer-tools, e-commerce, communication, email, crm, auth, infrastructure, monitoring, ' +
  'productivity, forms, analytics, fintech';

export const providerCatalogTools = [
  {
    name: 'hookbase_list_providers',
    description: 'List the webhook providers in Hookbase\'s catalog (Stripe, GitHub, Shopify, WhatsApp, ...), optionally filtered by category or a search term matched against name, description and category. Each entry gives the catalog id, the hookbaseProvider value to pass as provider to hookbase_create_source (it can differ from the id — several catalog entries map to "custom"), and a signature-verification summary. ' + SECRET_SOURCE_DESC + ' Call hookbase_get_provider for the full instructions before asking the user for a secret.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: z.object({
      category: z.string().optional().describe(`Only providers in this category: ${CATEGORIES}`),
      search: z.string().optional().describe('Case-insensitive text matched against provider name, description and category (e.g. "stripe", "whatsapp")'),
    }).strict(),
    handler: async (args: { category?: string; search?: string }) => {
      const result = await api.listProviders({ category: args.category, search: args.search });
      if (result.error) {
        return { error: result.error };
      }
      const providers = result.data?.providers ?? [];
      return {
        providers: providers.map(p => ({
          id: p.id,
          name: p.name,
          category: p.category,
          hookbaseProvider: p.hookbaseProvider,
          hasSignatureVerification: p.hasSignatureVerification,
          // Older API deployments omit the summary on list items; the detail call always has it.
          signatureVerification: p.signatureVerification ?? null,
        })),
        total: result.data?.total ?? providers.length,
        categories: result.data?.categories ?? [],
        ...(providers.some(p => p.signatureVerification === undefined)
          ? { note: 'signatureVerification is missing for some entries; call hookbase_get_provider for those.' }
          : {}),
      };
    },
  },
  {
    name: 'hookbase_get_provider',
    description: 'Get one catalog provider\'s full setup detail: hookbaseProvider (the provider value for hookbase_create_source), signatureVerification (algorithm, headerName, kind, secretSource, secretLabel — the vendor\'s own name for the credential, secretInstruction — where the user copies it from or pastes it into, secretPlaceholder, secretFormat, secretAfterRegistration, and verifyToken {label, instruction} for Meta/WhatsApp, whose create response returns a verify token the user enters in Meta), setupGuide steps, docsUrl, ipRanges, and the event type names. ' + SECRET_SOURCE_DESC,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: z.object({
      provider_id: z.string().describe('Catalog provider id from hookbase_list_providers (e.g. "stripe", "github", "mollie-nextgen")'),
    }).strict(),
    handler: async (args: { provider_id: string }) => {
      const result = await api.getProvider(args.provider_id);
      if (result.error) {
        return { error: result.error };
      }
      const p = result.data?.provider;
      return {
        // samplePayloads is left out: it is large and only useful for testing, not setup.
        provider: p ? {
          id: p.id,
          name: p.name,
          category: p.category,
          description: p.description,
          hookbaseProvider: p.hookbaseProvider,
          docsUrl: p.docsUrl,
          signatureVerification: p.signatureVerification,
          setupGuide: p.setupGuide ?? [],
          ipRanges: p.ipRanges ?? null,
          eventTypes: (p.eventTypes ?? []).map(e => e.type),
        } : null,
      };
    },
  },
];
