/**
 * Destination tools for MCP server
 */

import { z } from 'zod';
import * as api from '../lib/api.js';

export const destinationTools = [
  {
    name: 'hookbase_list_destinations',
    description: 'List all webhook destinations in the organization. Destinations are endpoints where webhooks are forwarded to.',
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
          authType: d.auth_type,
          isActive: d.is_active === 1,
          deliveryCount: d.delivery_count ?? 0,
          successCount: d.success_count ?? 0,
          failureCount: d.failure_count ?? 0,
          createdAt: d.created_at,
        })),
      };
    },
  },
  {
    name: 'hookbase_get_destination',
    description: 'Get detailed information about a specific destination, including authentication configuration.',
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
          authType: d.auth_type,
          authConfig: d.auth_config,
          timeoutMs: d.timeout_ms,
          rateLimitPerMinute: d.rate_limit_per_minute,
          mockMode: d.mock_mode,
          isActive: d.is_active === 1,
          config: d.config || null,
          fieldMapping: d.field_mapping || null,
          deliveryCount: d.delivery_count ?? 0,
          successCount: d.success_count ?? 0,
          failureCount: d.failure_count ?? 0,
          createdAt: d.created_at,
        } : null,
      };
    },
  },
  {
    name: 'hookbase_create_destination',
    description: 'Create a new webhook destination. Destinations can be HTTP endpoints or warehouse storage (S3, R2, GCS, Azure Blob).',
    inputSchema: z.object({
      name: z.string().describe('Display name for the destination'),
      type: z.enum(['http', 's3', 'r2', 'gcs', 'azure_blob']).optional().describe('Destination type (default: http). Use warehouse types for storage destinations.'),
      url: z.string().optional().describe('The URL to forward webhooks to (required for http type)'),
      method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional().describe('HTTP method (default: POST, only for http type)'),
      headers: z.record(z.string()).optional().describe('Custom headers to include in requests (only for http type)'),
      auth_type: z.enum(['none', 'basic', 'bearer', 'api_key', 'custom_header']).optional().describe('Authentication type (default: none, only for http type)'),
      auth_config: z.record(z.string()).optional().describe('Auth configuration (username/password for basic, token for bearer, etc.)'),
      timeout_ms: z.number().optional().describe('Request timeout in milliseconds (default: 30000)'),
      rate_limit_per_minute: z.number().optional().describe('Maximum requests per minute'),
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
      rate_limit_per_minute?: number;
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
        rateLimitPerMinute: args.rate_limit_per_minute,
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
    description: 'Update an existing destination configuration.',
    inputSchema: z.object({
      destination_id: z.string().describe('The ID of the destination to update'),
      name: z.string().optional().describe('New display name'),
      url: z.string().optional().describe('New URL (for http type destinations)'),
      method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional().describe('HTTP method'),
      headers: z.record(z.string()).optional().describe('Custom headers'),
      auth_type: z.enum(['none', 'basic', 'bearer', 'api_key', 'custom_header']).optional().describe('Authentication type'),
      auth_config: z.record(z.string()).optional().describe('Auth configuration'),
      timeout_ms: z.number().optional().describe('Request timeout in milliseconds'),
      rate_limit_per_minute: z.number().optional().describe('Maximum requests per minute'),
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
      rate_limit_per_minute?: number;
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
        rateLimitPerMinute: args.rate_limit_per_minute,
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
    description: 'Delete a destination. This will also delete all associated routes.',
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
    description: 'Test connectivity to a destination by sending a test request. Returns response status and timing.',
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
        statusCode: result.data?.statusCode,
        responseTime: result.data?.responseTime,
        responseBody: result.data?.responseBody,
        error: result.data?.error,
      };
    },
  },
];
