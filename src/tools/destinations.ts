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
          url: d.url,
          method: d.method,
          headers: d.headers,
          authType: d.auth_type,
          authConfig: d.auth_config,
          timeoutMs: d.timeout_ms,
          rateLimitPerMinute: d.rate_limit_per_minute,
          mockMode: d.mock_mode,
          isActive: d.is_active === 1,
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
    description: 'Create a new webhook destination. Destinations are endpoints where webhooks are forwarded after processing.',
    inputSchema: z.object({
      name: z.string().describe('Display name for the destination'),
      url: z.string().url().describe('The URL to forward webhooks to'),
      method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional().describe('HTTP method (default: POST)'),
      headers: z.record(z.string()).optional().describe('Custom headers to include in requests'),
      auth_type: z.enum(['none', 'basic', 'bearer', 'api_key', 'custom_header']).optional().describe('Authentication type (default: none)'),
      auth_config: z.record(z.string()).optional().describe('Auth configuration (username/password for basic, token for bearer, etc.)'),
      timeout_ms: z.number().optional().describe('Request timeout in milliseconds (default: 30000)'),
      rate_limit_per_minute: z.number().optional().describe('Maximum requests per minute'),
    }).strict(),
    handler: async (args: {
      name: string;
      url: string;
      method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
      headers?: Record<string, string>;
      auth_type?: 'none' | 'basic' | 'bearer' | 'api_key' | 'custom_header';
      auth_config?: Record<string, string>;
      timeout_ms?: number;
      rate_limit_per_minute?: number;
    }) => {
      const result = await api.createDestination({
        name: args.name,
        url: args.url,
        method: args.method,
        headers: args.headers,
        authType: args.auth_type,
        authConfig: args.auth_config,
        timeoutMs: args.timeout_ms,
        rateLimitPerMinute: args.rate_limit_per_minute,
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
      url: z.string().url().optional().describe('New URL'),
      method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional().describe('HTTP method'),
      headers: z.record(z.string()).optional().describe('Custom headers'),
      auth_type: z.enum(['none', 'basic', 'bearer', 'api_key', 'custom_header']).optional().describe('Authentication type'),
      auth_config: z.record(z.string()).optional().describe('Auth configuration'),
      timeout_ms: z.number().optional().describe('Request timeout in milliseconds'),
      rate_limit_per_minute: z.number().optional().describe('Maximum requests per minute'),
      is_active: z.boolean().optional().describe('Enable or disable the destination'),
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
