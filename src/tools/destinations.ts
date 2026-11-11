/**
 * Destination tools for MCP server
 */

import { z, boundedRecord, MAX_COLLECTION, pageInputs, PAGED_LIST_NOTE } from '../lib/zod.js';
import * as api from '../lib/api.js';
import { DESTINATION_TYPES, type DestinationType } from '../lib/api.js';

// Mirrors the API's throttle sub-schema (createDestinationSchema in api/src/routes/destinations.ts):
// rateLimit+rateUnit are required when mode is 'rate', maxConcurrency is required when mode is
// 'concurrency', and queueLimit is optional in both. The refine()s live on this nested object (not
// on the top-level tool input schema) so the top level stays a plain ZodObject — server.ts reads
// `inputSchema.shape` directly, which only exists on ZodObject, not on the ZodEffects a top-level
// refine() would produce.
const throttleInputSchema = z.object({
  mode: z.enum(['off', 'rate', 'concurrency']).default('off').describe('Throttle mode: "off" (no throttling), "rate" (max requests per time unit), or "concurrency" (max concurrent in-flight requests). Requires a paid plan when not "off".'),
  rateLimit: z.number().min(1).max(100000).nullable().optional().describe('Max requests per rateUnit. Required when mode is "rate".'),
  rateUnit: z.enum(['second', 'minute', 'hour']).nullable().optional().describe('Time unit for rateLimit. Required when mode is "rate".'),
  maxConcurrency: z.number().min(1).max(1000).nullable().optional().describe('Max concurrent in-flight requests. Required when mode is "concurrency".'),
  queueLimit: z.number().min(1).max(100000).nullable().optional().describe('Optional max number of requests queued while waiting for throttle capacity to free up (either mode).'),
})
  .refine((data) => data.mode !== 'rate' || (data.rateLimit != null && data.rateUnit != null),
    { message: 'rateLimit and rateUnit are required when throttle.mode is "rate"' })
  .refine((data) => data.mode !== 'concurrency' || data.maxConcurrency != null,
    { message: 'maxConcurrency is required when throttle.mode is "concurrency"' })
  .optional()
  .describe('Throttle configuration for outbound delivery rate limiting (requires a paid plan for modes other than "off").');

const CONFIG_DESCRIPTION = 'Configuration object for non-http types; its shape depends on type. '
  + 'Queues: sqs {queueUrl, region, accessKeyId, secretAccessKey, messageGroupId?}; '
  + 'eventbridge {eventBusName, region, accessKeyId, secretAccessKey, source?, detailType?}; '
  + 'servicebus {namespace, queueOrTopicName, sharedAccessKeyName, sharedAccessKey}; '
  + 'pubsub {projectId, topicId, serviceAccountKey (the JSON key as a string)}; '
  + 'oci_queue {queueId, region, endpoint, authToken}. '
  + 'Storage: s3 {bucket, region, accessKeyId, secretAccessKey, prefix?, fileFormat?, partitionBy?, compressionType?}; '
  + 'r2 {bucket, endpoint, accessKeyId, secretAccessKey, prefix?, fileFormat?, partitionBy?}; '
  + 'gcs {bucket, projectId, serviceAccountKey, prefix?, fileFormat?, partitionBy?, compressionType?}; '
  + 'azure_blob {accountName, accountKey, containerName, prefix?, fileFormat?, partitionBy?}. '
  + 'Bridge (no other keys allowed): {eventTypeSource: "fixed" | "field", eventType? (fixed mode only, and required '
  + 'there: an existing, enabled outbound event type), eventTypeField? (field mode only, and required there: a dot path '
  + 'into the payload, at most 5 segments, e.g. "data.type"), eventTypePrefix? (field mode only, e.g. "stripe."), applicationId? (only that '
  + 'application\'s endpoints; default all), allowUnverifiedSources? (default false: events whose sender the source '
  + 'did not verify are refused with 403; true lets anyone who can reach the source publish to your endpoints)}.';

export const destinationTools = [
  {
    name: 'hookbase_list_destinations',
    description: 'List webhook destinations in the organization. A destination is where routes forward webhooks: an HTTP endpoint, a queue or event bus, a storage sink, or a bridge that publishes the payload as an outbound event — it receives nothing until hookbase_create_route connects a source to it. Returns summary fields including routeCount and success/failure counts; use hookbase_get_destination for one destination\'s full configuration including auth and throttle settings. ' + PAGED_LIST_NOTE,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    routes: ['GET /destinations'],
    inputSchema: z.object({ ...pageInputs }).strict(),
    handler: async (args: { page?: number; page_size?: number }) => {
      const result = await api.getDestinations({ page: args.page, pageSize: args.page_size });
      if (result.error) {
        return { error: result.error };
      }
      return {
        destinations: result.data?.destinations.map(d => ({
          id: d.id,
          name: d.name,
          slug: d.slug,
          type: d.type || 'http',
          url: d.url,
          method: d.method,
          authType: d.authType,
          // Only a bridge's config is useful here (no secrets); others need hookbase_get_destination.
          ...(d.type === 'bridge' ? { config: d.config ?? null } : {}),
          isActive: d.isActive,
          // fn_dest_list exposes routeCount + success/failure counts; there is no total delivery count.
          routeCount: d.routeCount ?? 0,
          successCount: d.successCount ?? 0,
          failureCount: d.failureCount ?? 0,
          createdAt: d.createdAt,
        })),
        pagination: result.data?.pagination,
      };
    },
  },
  {
    name: 'hookbase_get_destination',
    description: 'Get full configuration for a single destination, including its URL or type-specific config, auth settings, and throttle limits. hasSigningSecret says whether an http destination signs its deliveries (webhook-signature header); the secret itself is never returned here — use hookbase_reveal_destination_secret. Use hookbase_list_destinations first to find the destination_id, and hookbase_test_destination afterward to verify it is actually reachable.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    routes: ['GET /destinations/:id'],
    inputSchema: z.object({
      destination_id: z.string().describe('The ID of the destination to retrieve'),
    }).strict(),
    handler: async (args: { destination_id: string }) => {
      const result = await api.getDestination(args.destination_id);
      if (result.error) {
        return { error: result.error };
      }
      const d = result.data?.destination;
      return {
        destination: d ? {
          id: d.id,
          name: d.name,
          slug: d.slug,
          type: d.type || 'http',
          url: d.url,
          method: d.method,
          headers: d.headers,
          authType: d.authType,
          authConfig: d.authConfig,
          // GET never returns the secret; hookbase_reveal_destination_secret reads it.
          hasSigningSecret: d.hasSigningSecret ?? false,
          timeoutMs: d.timeoutMs,
          throttle: {
            mode: d.throttleMode ?? 'off',
            rateLimit: d.throttleRateLimit ?? null,
            rateUnit: d.throttleRateUnit ?? null,
            maxConcurrency: d.throttleMaxConcurrency ?? null,
            queueLimit: d.throttleQueueLimit ?? null,
          },
          mockMode: d.mockEnabled,
          isActive: d.isActive,
          config: d.config || null,
          fieldMapping: d.fieldMapping || null,
          createdAt: d.createdAt,
        } : null,
      };
    },
  },
  {
    name: 'hookbase_create_destination',
    description: 'Create a new webhook destination that webhooks can be forwarded to. Types: "http" (the default) sends an HTTP request; queues and event buses (sqs, eventbridge, servicebus, pubsub, oci_queue) publish a message; storage sinks (s3, r2, gcs, azure_blob) batch events before writing them out; "bridge" publishes the payload as a Hookbase outbound event to your webhook endpoints subscribed to its event type. A destination alone receives nothing — use hookbase_create_route afterward to connect a source to it before any webhooks are actually delivered here. For type "http", url is required; for every other type, config is required and its shape depends on type. A bridge takes no url, headers, auth or static IP, and creating or changing one (or routing into one) needs the events:send permission. An http destination signs every delivery: the reply carries its signingSecret, shown only here, so save it — receivers verify each delivery\'s webhook-signature header with it (hookbase_reveal_destination_secret can read it later). Every other type returns signingSecret null. Use hookbase_test_destination after creating an http or bridge destination to check it before wiring up a route.',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    routes: ['POST /destinations'],
    inputSchema: z.object({
      name: z.string().describe('Display name for the destination'),
      type: z.enum(DESTINATION_TYPES).optional().describe('Destination type (default: http). Queues: sqs, eventbridge, servicebus, pubsub, oci_queue. Storage: s3, r2, gcs, azure_blob. bridge publishes outbound events.'),
      url: z.string().optional().describe('The URL to forward webhooks to (required for http type; not allowed for bridge)'),
      method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional().describe('HTTP method (default: POST, only for http type)'),
      headers: boundedRecord(z.string()).optional().describe('Custom headers to include in requests (only for http type)'),
      auth_type: z.enum(['none', 'basic', 'bearer', 'api_key', 'custom_header']).optional().describe('Authentication type (default: none, only for http type)'),
      auth_config: boundedRecord(z.string()).optional().describe('Auth configuration (username/password for basic, token for bearer, etc.)'),
      timeout_ms: z.number().optional().describe('Request timeout in milliseconds (default: 30000)'),
      throttle: throttleInputSchema,
      config: z.record(z.string(), z.any()).optional().describe(CONFIG_DESCRIPTION),
      field_mapping: z.array(z.object({
        source: z.string().describe('Source field path in the webhook payload'),
        target: z.string().describe('Target field name in the warehouse'),
        type: z.enum(['string', 'number', 'boolean', 'timestamp', 'json']).describe('Data type for the field'),
        default: z.string().optional().describe('Default value if source field is missing'),
      })).max(MAX_COLLECTION).optional().describe('Field mappings for warehouse destinations'),
      use_static_ip: z.boolean().optional().describe('Enable static IP delivery (Pro and Business plans)'),
      batch_size: z.number().optional().describe('Number of events to accumulate before flushing to warehouse (warehouse destinations only)'),
      batch_window_seconds: z.number().optional().describe('Max seconds to wait before flushing a batch to warehouse (warehouse destinations only)'),
    }).strict(),
    handler: async (args: {
      name: string;
      type?: DestinationType;
      url?: string;
      method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
      headers?: Record<string, string>;
      auth_type?: 'none' | 'basic' | 'bearer' | 'api_key' | 'custom_header';
      auth_config?: Record<string, string>;
      timeout_ms?: number;
      throttle?: {
        mode: 'off' | 'rate' | 'concurrency';
        rateLimit?: number | null;
        rateUnit?: 'second' | 'minute' | 'hour' | null;
        maxConcurrency?: number | null;
        queueLimit?: number | null;
      };
      config?: Record<string, unknown>;
      field_mapping?: Array<{ source: string; target: string; type: string; default?: string }>;
      use_static_ip?: boolean;
      batch_size?: number;
      batch_window_seconds?: number;
    }) => {
      const result = await api.createDestination({
        name: args.name,
        type: args.type,
        url: args.url,
        method: args.method,
        headers: args.headers,
        authType: args.auth_type,
        authConfig: args.auth_config,
        timeoutMs: args.timeout_ms,
        throttle: args.throttle,
        config: args.config,
        fieldMapping: args.field_mapping,
        useStaticIp: args.use_static_ip,
        batchSize: args.batch_size,
        batchWindowSeconds: args.batch_window_seconds,
      });
      if (result.error) {
        return { error: result.error };
      }
      const d = result.data?.destination;
      const signingSecret = d?.signingSecret ?? null;
      return {
        message: signingSecret
          ? 'Destination created successfully. Save signingSecret now: it is shown only in this reply. Receivers verify each delivery\'s webhook-signature header with it; hookbase_reveal_destination_secret can read it later.'
          : 'Destination created successfully',
        destination: d ? {
          id: d.id,
          name: d.name,
          slug: d.slug,
          type: d.type,
          url: d.url,
          hasSigningSecret: d.hasSigningSecret ?? false,
          // http only; null for every other type.
          signingSecret,
        } : null,
      };
    },
  },
  {
    name: 'hookbase_update_destination',
    description: 'Update an existing destination\'s configuration — connection details, auth, throttle limits, or type-specific config. A destination\'s type cannot be changed. Only the fields you provide are changed; omitted fields keep their current value, except config, which replaces the stored config whole (to keep a queue or storage secret, send back the masked "••••" value get_destination returned and the stored one is kept). Any change to a bridge destination needs the events:send permission. Changes take effect on the next delivery attempt through this destination, including deliveries already queued or retrying. Set is_active=false to pause all deliveries through this destination without deleting it or the routes pointing at it. To change the signing secret use hookbase_rotate_destination_secret. Returns only a confirmation — call hookbase_get_destination to read the result.',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    routes: ['PATCH /destinations/:id'],
    inputSchema: z.object({
      destination_id: z.string().describe('The ID of the destination to update'),
      name: z.string().optional().describe('New display name'),
      url: z.string().optional().describe('New URL (for http type destinations)'),
      method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional().describe('HTTP method'),
      headers: boundedRecord(z.string()).optional().describe('Custom headers'),
      auth_type: z.enum(['none', 'basic', 'bearer', 'api_key', 'custom_header']).optional().describe('Authentication type'),
      auth_config: boundedRecord(z.string()).optional().describe('Auth configuration'),
      timeout_ms: z.number().optional().describe('Request timeout in milliseconds'),
      throttle: throttleInputSchema,
      is_active: z.boolean().optional().describe('Enable or disable the destination'),
      config: z.record(z.string(), z.any()).optional().describe('Type-specific configuration, replacing the stored one. See hookbase_create_destination for each type\'s shape.'),
      field_mapping: z.array(z.object({
        source: z.string().describe('Source field path in the webhook payload'),
        target: z.string().describe('Target field name in the warehouse'),
        type: z.enum(['string', 'number', 'boolean', 'timestamp', 'json']).describe('Data type for the field'),
        default: z.string().optional().describe('Default value if source field is missing'),
      })).max(MAX_COLLECTION).optional().describe('Field mappings for warehouse destinations'),
      use_static_ip: z.boolean().optional().describe('Enable static IP delivery (Pro and Business plans)'),
      batch_size: z.number().optional().describe('Number of events to accumulate before flushing to warehouse (warehouse destinations only)'),
      batch_window_seconds: z.number().optional().describe('Max seconds to wait before flushing a batch to warehouse (warehouse destinations only)'),
    }).strict(),
    handler: async (args: {
      destination_id: string;
      name?: string;
      url?: string;
      method?: string;
      headers?: Record<string, string>;
      auth_type?: string;
      auth_config?: Record<string, string>;
      timeout_ms?: number;
      throttle?: {
        mode: 'off' | 'rate' | 'concurrency';
        rateLimit?: number | null;
        rateUnit?: 'second' | 'minute' | 'hour' | null;
        maxConcurrency?: number | null;
        queueLimit?: number | null;
      };
      is_active?: boolean;
      config?: Record<string, unknown>;
      field_mapping?: Array<{ source: string; target: string; type: string; default?: string }>;
      use_static_ip?: boolean;
      batch_size?: number;
      batch_window_seconds?: number;
    }) => {
      const result = await api.updateDestination(args.destination_id, {
        name: args.name,
        url: args.url,
        method: args.method,
        headers: args.headers,
        authType: args.auth_type,
        authConfig: args.auth_config,
        timeoutMs: args.timeout_ms,
        throttle: args.throttle,
        isActive: args.is_active,
        config: args.config,
        fieldMapping: args.field_mapping,
        useStaticIp: args.use_static_ip,
        batchSize: args.batch_size,
        batchWindowSeconds: args.batch_window_seconds,
      });
      if (result.error) {
        return { error: result.error };
      }
      // PATCH answers {success: true} only; there is no destination object to echo.
      return { message: 'Destination updated successfully' };
    },
  },
  {
    name: 'hookbase_delete_destination',
    description: 'Delete a destination. Cascades to permanently delete every route pointing at it and their deliveries — including pending/queued deliveries, not just history.',
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    routes: ['DELETE /destinations/:id'],
    inputSchema: z.object({
      destination_id: z.string().describe('The ID of the destination to delete'),
    }).strict(),
    handler: async (args: { destination_id: string }) => {
      const result = await api.deleteDestination(args.destination_id);
      if (result.error) {
        return { error: result.error };
      }
      return { message: 'Destination deleted successfully' };
    },
  },
  {
    name: 'hookbase_reveal_destination_secret',
    description: 'Reveal the signing secret of an http destination: the secret receivers use to verify each delivery\'s webhook-signature header. hookbase_create_destination shows it once; use this when that reply is gone. previousSecretExpiresAt is set while a rotation\'s grace period is running (until then deliveries carry the old signature too), otherwise null. Returns 400 for a non-http destination and 404 when it has no secret yet (hookbase_rotate_destination_secret issues one). Requires an API key with write scope and a member+ role; every reveal is audit-logged.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    routes: ['GET /destinations/:id/reveal-secret'],
    inputSchema: z.object({
      destination_id: z.string().describe('The ID of the destination'),
    }).strict(),
    handler: async (args: { destination_id: string }) => {
      const result = await api.revealDestinationSecret(args.destination_id);
      if (result.error) {
        return { error: result.error };
      }
      return {
        signingSecret: result.data?.signingSecret ?? null,
        previousSecretExpiresAt: result.data?.previousSecretExpiresAt ?? null,
      };
    },
  },
  {
    name: 'hookbase_rotate_destination_secret',
    description: 'Issue a new signing secret for an http destination and return it (save it: it is shown here, and hookbase_reveal_destination_secret can read it later). Also issues the first secret for a destination that has none. Unlike a source\'s rotation there is a grace period: for grace_period_seconds (default 3600, at most 86400) deliveries carry both signatures in webhook-signature ("v1,<old> v1,<new>"), so receivers can switch to the new secret without rejecting anything; previousSecretExpiresAt says when the old signature stops being sent. 0 drops the old secret at once, so receivers still using it start rejecting deliveries. Returns 400 for a non-http destination. Requires an API key with write scope and a member+ role.',
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    routes: ['POST /destinations/:id/rotate-secret'],
    inputSchema: z.object({
      destination_id: z.string().describe('The ID of the destination'),
      grace_period_seconds: z.number().int().min(0).max(86400).optional().describe('How long deliveries keep carrying the old signature next to the new one, in seconds (default 3600 = 1 hour, max 86400). 0 drops the old secret immediately.'),
    }).strict(),
    handler: async (args: { destination_id: string; grace_period_seconds?: number }) => {
      const result = await api.rotateDestinationSecret(args.destination_id, args.grace_period_seconds);
      if (result.error) {
        return { error: result.error };
      }
      const previousSecretExpiresAt = result.data?.previousSecretExpiresAt ?? null;
      return {
        message: previousSecretExpiresAt
          ? `Secret rotated. Save the new secret now. Until ${previousSecretExpiresAt} deliveries carry both the old and the new signature; switch receivers to the new secret before then.`
          : 'Secret rotated. Save the new secret now. No old secret remains (grace period 0, or there was none), so deliveries are signed with the new secret only.',
        signingSecret: result.data?.signingSecret ?? null,
        previousSecretExpiresAt,
      };
    },
  },
  {
    name: 'hookbase_test_destination',
    description: 'Test a destination. For an http destination this sends a real test request to its configured URL (not a dry run) and returns the response status and timing. For a bridge it is a dry run that sends nothing: it resolves the event type from the payload (or the bridge\'s fixed type), checks that the type exists and is enabled, and counts the endpoints subscribed to it (dryRun, eventType, eventTypeExists, matchingEndpoints); it does not check the sender, schema or quota. In a dry run success only means the event type resolved and exists: matchingEndpoints counts subscriptions before label filters, filter expressions and circuit state, so it is an upper bound, and 0 means a publish would reach nobody. A storage destination\'s test uploads a test file; queue destinations cannot be tested here. Use it after hookbase_create_destination or hookbase_update_destination, before pointing a route at the destination.',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    routes: ['POST /destinations/:id/test'],
    inputSchema: z.object({
      destination_id: z.string().describe('The ID of the destination to test'),
      payload: z.record(z.string(), z.any()).optional().describe('Bridge destinations only: a sample JSON object payload to resolve the event type from (default: a small test object)'),
    }).strict(),
    handler: async (args: { destination_id: string; payload?: Record<string, unknown> }) => {
      const result = await api.testDestination(args.destination_id, args.payload);
      if (result.error) {
        return { error: result.error };
      }
      const data = result.data;
      if (data?.dryRun) {
        return {
          success: data.success,
          dryRun: true,
          eventType: data.eventType ?? null,
          eventTypeExists: data.eventTypeExists,
          matchingEndpoints: data.matchingEndpoints,
          error: data.error,
        };
      }
      return {
        success: data?.success,
        statusCode: data?.status,
        responseTime: data?.latencyMs,
        responseBody: data?.responseBody,
        error: data?.error,
      };
    },
  },
];
