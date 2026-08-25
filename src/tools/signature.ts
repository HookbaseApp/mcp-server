/**
 * Signature testing tools for MCP server
 */

import { z } from 'zod';
import * as api from '../lib/api.js';

export const signatureTools = [
  {
    name: 'hookbase_verify_signature',
    description: 'Check whether a webhook signature matches a payload and secret, using the same verification logic as inbound ingest signature checking. Useful for debugging a rejected webhook or validating a provider integration before wiring up a source. Read-only - makes no changes and does not require an existing source.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: z.object({
      provider: z.string().describe('Signature provider id, e.g. stripe, github, shopify, gitlab, paddle, square, linear'),
      payload: z.string().describe('Raw request body exactly as received - the exact bytes/string the signature was computed over'),
      secret: z.string().describe('Signing secret to verify against'),
      signature: z.string().describe("Signature value to check, as received in the provider's signature header"),
      timestamp: z.number().optional().describe('Unix timestamp, for providers whose signature scheme includes one (e.g. Stripe)'),
    }).strict(),
    handler: async (args: {
      provider: string;
      payload: string;
      secret: string;
      signature: string;
      timestamp?: number;
    }) => {
      const result = await api.verifySignature(args);
      if (result.error) {
        return { error: result.error };
      }
      return {
        isValid: result.data?.isValid,
        computedSignature: result.data?.computedSignature,
        computedSignatureWithPrefix: result.data?.computedSignatureWithPrefix,
        timestamp: result.data?.timestamp,
        steps: result.data?.steps,
      };
    },
  },
];
