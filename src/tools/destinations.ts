/**
 * Destination tools for MCP server
 */

import { z } from 'zod';
import * as api from '../lib/api.js';

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

export const destinationTools = [
  {
    name: 'hookbase_list_destinations',
    description: 'List all webhook destinations in the organization. A destination is an HTTP endpoint or warehouse sink that routes forward webhooks to — it receives nothing until hookbase_create_route connects a source to it. Returns summary fields including routeCount and success/failure counts; use hookbase_get_destination for one destination\'s full configuration including auth and throttle settings.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: z.object({}).strict(),
    handler: async () => {
      const result = await api.getDestinations();
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
          isActive: d.isActive,
          // fn_dest_list exposes routeCount + success/failure counts; there is no total delivery count.
          routeCount: d.routeCount ?? 0,
          successCount: d.successCount ?? 0,
          failureCount: d.failureCount ?? 0,
          createdAt: d.createdAt,
        })),
      };
    },
  },
  {
    name: 'hookbase_get_destination',
    description: 'Get full configuration for a single destination, including its URL/warehouse config, auth settings, and throttle limits. Use hookbase_list_destinations first to find the destination_id, and hookbase_test_destination afterward to verify it is actually reachable.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
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
    description: 'Create a new webhook destination that webhooks can be forwarded to. Destinations are either HTTP endpoints (type "http", the default) or warehouse storage sinks (S3, R2, GCS, Azure Blob) that batch events before writing them out. A destination alone receives nothing — use hookbase_create_route afterward to connect a source to it before any webhooks are actually delivered here. For type "http", url is required; for warehouse types, config is required and its shape depends on type. Use hookbase_test_destination after creating an http destination to confirm it is reachable before wiring up a route.',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    inputSchema: z.object({
      name: z.string().describe('Display name for the destination'),
      type: z.enum(['http', 's3', 'r2', 'gcs', 'azure_blob']).optional().describe('Destination type (default: http). Use warehouse types for storage destinations.'),
      url: z.string().optional().describe('The URL to forward webhooks to (required for http type)'),
      method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional().describe('HTTP method (default: POST, only for http type)'),
      headers: z.record(z.string()).optional().describe('Custom headers to include in requests (only for http type)'),
      auth_type: z.enum(['none', 'basic', 'bearer', 'api_key', 'custom_header']).optional().describe('Authentication type (default: none, only for http type)'),
      auth_config: z.record(z.string()).optional().describe('Auth configuration (username/password for basic, token for bearer, etc.)'),
      timeout_ms: z.number().optional().describe('Request timeout in milliseconds (default: 30000)'),
      throttle: throttleInputSchema,
      config: z.record(z.any()).optional().describe('Warehouse configuration object. For S3: {bucket, region, accessKeyId, secretAccessKey, prefix?, fileFormat?, partitionBy?}. For R2: {bucket, prefix?, fileFormat?, partitionBy?}. For GCS: {bucket, projectId, serviceAccountKey, prefix?, fileFormat?, partitionBy?}. For Azure Blob: {accountName, accountKey, containerName, prefix?, fileFormat?, partitionBy?}.'),
      field_mapping: z.array(z.object({
        source: z.string().describe('Source field path in the webhook payload'),
        target: z.string().describe('Target field name in the warehouse'),
        type: z.enum(['string', 'number', 'boolean', 'timestamp', 'json']).describe('Data type for the field'),
        default: z.string().optional().describe('Default value if source field is missing'),
      })).optional().describe('Field mappings for warehouse destinations'),
      use_static_ip: z.boolean().optional().describe('Enable static IP delivery (Pro and Business plans)'),
      batch_size: z.number().optional().describe('Number of events to accumulate before flushing to warehouse (warehouse destinations only)'),
      batch_window_seconds: z.number().optional().describe('Max seconds to wait before flushing a batch to warehouse (warehouse destinations only)'),
    }).strict(),
    handler: async (args: {
      name: string;
      type?: 'http' | 's3' | 'r2' | 'gcs' | 'azure_blob';
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
      config?: Record<string, any>;
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
      return {
        message: 'Destination created successfully',
        destination: d ? {
          id: d.id,
          name: d.name,
          slug: d.slug,
          type: d.type,
          url: d.url,
        } : null,
      };
    },
  },
  {
    name: 'hookbase_update_destination',
    description: 'Update an existing destination\'s configuration — connection details, auth, throttle limits, or warehouse settings. Only the fields you provide are changed; omitted fields keep their current value. Changes take effect on the next delivery attempt through this destination, including deliveries already queued or retrying. Set is_active=false to pause all deliveries through this destination without deleting it or the routes pointing at it.',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: z.object({
      destination_id: z.string().describe('The ID of the destination to update'),
      name: z.string().optional().describe('New display name'),
      url: z.string().optional().describe('New URL (for http type destinations)'),
      method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional().describe('HTTP method'),
      headers: z.record(z.string()).optional().describe('Custom headers'),
      auth_type: z.enum(['none', 'basic', 'bearer', 'api_key', 'custom_header']).optional().describe('Authentication type'),
      auth_config: z.record(z.string()).optional().describe('Auth configuration'),
      timeout_ms: z.number().optional().describe('Request timeout in milliseconds'),
      throttle: throttleInputSchema,
      is_active: z.boolean().optional().describe('Enable or disable the destination'),
      config: z.record(z.any()).optional().describe('Warehouse configuration object (for warehouse type destinations)'),
      field_mapping: z.array(z.object({
        source: z.string().describe('Source field path in the webhook payload'),
        target: z.string().describe('Target field name in the warehouse'),
        type: z.enum(['string', 'number', 'boolean', 'timestamp', 'json']).describe('Data type for the field'),
        default: z.string().optional().describe('Default value if source field is missing'),
      })).optional().describe('Field mappings for warehouse destinations'),
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
      config?: Record<string, any>;
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
      return { message: 'Destination updated successfully', destination: result.data?.destination };
    },
  },
  {
    name: 'hookbase_delete_destination',
    description: 'Delete a destination. Cascades to permanently delete every route pointing at it and their deliveries — including pending/queued deliveries, not just history.',
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
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
    name: 'hookbase_test_destination',
    description: 'Send a real test request to a destination\'s actual configured endpoint and return the response status and timing — this is not a dry run and hits whatever URL/warehouse config the destination currently has. Use it after hookbase_create_destination or hookbase_update_destination to confirm the destination is reachable before pointing a route at it.',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    inputSchema: z.object({
      destination_id: z.string().describe('The ID of the destination to test'),
    }).strict(),
    handler: async (args: { destination_id: string }) => {
      const result = await api.testDestination(args.destination_id);
      if (result.error) {
        return { error: result.error };
      }
      return {
        success: result.data?.success,
        statusCode: result.data?.status,
        responseTime: result.data?.latencyMs,
        responseBody: result.data?.responseBody,
        error: result.data?.error,
      };
    },
  },
];
