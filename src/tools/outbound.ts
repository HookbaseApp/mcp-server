/**
 * Outbound webhook tools for MCP server
 * Applications, Endpoints, and Subscriptions
 */

import { z } from 'zod';
import * as api from '../lib/api.js';

// ============================================================================
// Webhook Applications
// ============================================================================

export const applicationTools = [
  {
    name: 'hookbase_list_applications',
    description: 'List webhook applications in the organization. Applications group endpoints that receive outbound webhooks for a customer or integration.',
    inputSchema: z.object({
      search: z.string().optional().describe('Search by application name'),
      is_enabled: z.boolean().optional().describe('Filter by enabled status (false = disabled)'),
      limit: z.number().optional().describe('Maximum number of results (default 50, max 100)'),
      cursor: z.string().optional().describe('Pagination cursor for next page'),
    }).strict(),
    handler: async (args: {
      search?: string;
      is_enabled?: boolean;
      limit?: number;
      cursor?: string;
    }) => {
      const result = await api.getWebhookApplications({
        search: args.search,
        isDisabled: args.is_enabled !== undefined ? !args.is_enabled : undefined,
        limit: args.limit,
        cursor: args.cursor,
      });
      if (result.error) {
        return { error: result.error };
      }
      return {
        applications: result.data?.data?.map(app => ({
          id: app.id,
          name: app.name,
          externalId: app.externalId,
          isEnabled: !(app.isDisabled === 1 || app.isDisabled === true),
          totalEndpoints: app.totalEndpoints ?? 0,
          totalMessagesSent: app.totalMessagesSent ?? 0,
          totalMessagesFailed: app.totalMessagesFailed ?? 0,
          rateLimitPerSecond: app.rateLimitPerSecond,
          rateLimitPerMinute: app.rateLimitPerMinute,
          rateLimitPerHour: app.rateLimitPerHour,
          createdAt: app.createdAt,
        })) ?? [],
        pagination: result.data?.pagination,
      };
    },
  },
  {
    name: 'hookbase_get_application',
    description: 'Get detailed information about a specific webhook application, including its endpoints and delivery statistics.',
    inputSchema: z.object({
      application_id: z.string().describe('The ID of the webhook application'),
    }).strict(),
    handler: async (args: { application_id: string }) => {
      const result = await api.getWebhookApplication(args.application_id);
      if (result.error) {
        return { error: result.error };
      }
      const app = result.data?.data;
      return {
        application: app ? {
          id: app.id,
          name: app.name,
          externalId: app.externalId,
          metadata: app.metadata,
          isEnabled: !(app.isDisabled === 1 || app.isDisabled === true),
          disabledAt: app.disabledAt,
          disabledReason: app.disabledReason,
          totalEndpoints: app.totalEndpoints ?? 0,
          endpointCount: app.endpointCount,
          totalMessagesSent: app.totalMessagesSent ?? 0,
          totalMessagesFailed: app.totalMessagesFailed ?? 0,
          lastEventAt: app.lastEventAt,
          rateLimitPerSecond: app.rateLimitPerSecond,
          rateLimitPerMinute: app.rateLimitPerMinute,
          rateLimitPerHour: app.rateLimitPerHour,
          createdAt: app.createdAt,
          updatedAt: app.updatedAt,
        } : null,
      };
    },
  },
  {
    name: 'hookbase_create_application',
    description: 'Create a new webhook application. Applications represent a customer or integration that will receive webhooks.',
    inputSchema: z.object({
      name: z.string().describe('Display name for the application'),
      external_id: z.string().optional().describe('Your system\'s ID for this customer/application'),
      metadata: z.record(z.unknown()).optional().describe('Custom metadata as key-value pairs'),
      rate_limit_per_second: z.number().optional().describe('Max events per second (default 100)'),
      rate_limit_per_minute: z.number().optional().describe('Max events per minute (default 1000)'),
      rate_limit_per_hour: z.number().optional().describe('Max events per hour (default 10000)'),
    }).strict(),
    handler: async (args: {
      name: string;
      external_id?: string;
      metadata?: Record<string, unknown>;
      rate_limit_per_second?: number;
      rate_limit_per_minute?: number;
      rate_limit_per_hour?: number;
    }) => {
      const result = await api.createWebhookApplication({
        name: args.name,
        externalId: args.external_id,
        metadata: args.metadata,
        rateLimitPerSecond: args.rate_limit_per_second,
        rateLimitPerMinute: args.rate_limit_per_minute,
        rateLimitPerHour: args.rate_limit_per_hour,
      });
      if (result.error) {
        return { error: result.error };
      }
      return {
        message: 'Application created successfully',
        application: result.data?.data,
      };
    },
  },
  {
    name: 'hookbase_update_application',
    description: 'Update a webhook application configuration.',
    inputSchema: z.object({
      application_id: z.string().describe('The ID of the application to update'),
      name: z.string().optional().describe('New display name'),
      metadata: z.record(z.unknown()).optional().describe('Updated metadata'),
      rate_limit_per_second: z.number().optional().describe('Max events per second'),
      rate_limit_per_minute: z.number().optional().describe('Max events per minute'),
      rate_limit_per_hour: z.number().optional().describe('Max events per hour'),
      is_enabled: z.boolean().optional().describe('Enable or disable the application'),
      disabled_reason: z.string().optional().describe('Reason for disabling (when is_enabled=false)'),
    }).strict(),
    handler: async (args: {
      application_id: string;
      name?: string;
      metadata?: Record<string, unknown>;
      rate_limit_per_second?: number;
      rate_limit_per_minute?: number;
      rate_limit_per_hour?: number;
      is_enabled?: boolean;
      disabled_reason?: string;
    }) => {
      const result = await api.updateWebhookApplication(args.application_id, {
        name: args.name,
        metadata: args.metadata,
        rateLimitPerSecond: args.rate_limit_per_second,
        rateLimitPerMinute: args.rate_limit_per_minute,
        rateLimitPerHour: args.rate_limit_per_hour,
        isDisabled: args.is_enabled !== undefined ? !args.is_enabled : undefined,
        disabledReason: args.disabled_reason,
      });
      if (result.error) {
        return { error: result.error };
      }
      return { message: 'Application updated successfully', application: result.data?.data };
    },
  },
  {
    name: 'hookbase_delete_application',
    description: 'Delete a webhook application. This also deletes all endpoints and subscriptions for this application.',
    inputSchema: z.object({
      application_id: z.string().describe('The ID of the application to delete'),
    }).strict(),
    handler: async (args: { application_id: string }) => {
      const result = await api.deleteWebhookApplication(args.application_id);
      if (result.error) {
        return { error: result.error };
      }
      return { message: 'Application deleted successfully' };
    },
  },
];

// ============================================================================
// Webhook Endpoints
// ============================================================================

export const endpointTools = [
  {
    name: 'hookbase_list_endpoints',
    description: 'List webhook endpoints. Endpoints are URLs that receive webhook deliveries.',
    inputSchema: z.object({
      application_id: z.string().optional().describe('Filter by application ID'),
      is_enabled: z.boolean().optional().describe('Filter by enabled status (false = disabled)'),
      circuit_state: z.enum(['closed', 'open', 'half_open']).optional().describe('Filter by circuit breaker state'),
      limit: z.number().optional().describe('Maximum number of results (default 50, max 100)'),
      cursor: z.string().optional().describe('Pagination cursor for next page'),
    }).strict(),
    handler: async (args: {
      application_id?: string;
      is_enabled?: boolean;
      circuit_state?: 'closed' | 'open' | 'half_open';
      limit?: number;
      cursor?: string;
    }) => {
      const result = await api.getWebhookEndpoints({
        applicationId: args.application_id,
        isDisabled: args.is_enabled !== undefined ? !args.is_enabled : undefined,
        circuitState: args.circuit_state,
        limit: args.limit,
        cursor: args.cursor,
      });
      if (result.error) {
        return { error: result.error };
      }
      return {
        endpoints: result.data?.data?.map(ep => ({
          id: ep.id,
          applicationId: ep.applicationId,
          url: ep.url,
          description: ep.description,
          isEnabled: !(ep.isDisabled === 1 || ep.isDisabled === true),
          circuitState: ep.circuitState,
          totalMessages: ep.totalMessages ?? 0,
          totalSuccesses: ep.totalSuccesses ?? 0,
          totalFailures: ep.totalFailures ?? 0,
          avgResponseTimeMs: ep.avgResponseTimeMs,
          subscriptionCount: ep.subscriptionCount,
          createdAt: ep.createdAt,
        })) ?? [],
        pagination: result.data?.pagination,
      };
    },
  },
  {
    name: 'hookbase_get_endpoint',
    description: 'Get detailed information about a webhook endpoint, including circuit breaker state and delivery statistics.',
    inputSchema: z.object({
      endpoint_id: z.string().describe('The ID of the endpoint'),
    }).strict(),
    handler: async (args: { endpoint_id: string }) => {
      const result = await api.getWebhookEndpoint(args.endpoint_id);
      if (result.error) {
        return { error: result.error };
      }
      const ep = result.data?.data;
      return {
        endpoint: ep ? {
          id: ep.id,
          applicationId: ep.applicationId,
          url: ep.url,
          description: ep.description,
          secretPrefix: ep.secretPrefix,
          hasSecret: ep.hasSecret,
          secretVersion: ep.secretVersion,
          headers: ep.headers,
          timeoutSeconds: ep.timeoutSeconds,
          isEnabled: !(ep.isDisabled === 1 || ep.isDisabled === true),
          disabledAt: ep.disabledAt,
          disabledReason: ep.disabledReason,
          circuitState: ep.circuitState,
          circuitOpenedAt: ep.circuitOpenedAt,
          circuitFailureCount: ep.circuitFailureCount,
          circuitFailureThreshold: ep.circuitFailureThreshold,
          circuitSuccessThreshold: ep.circuitSuccessThreshold,
          circuitCooldownSeconds: ep.circuitCooldownSeconds,
          totalMessages: ep.totalMessages ?? 0,
          totalSuccesses: ep.totalSuccesses ?? 0,
          totalFailures: ep.totalFailures ?? 0,
          avgResponseTimeMs: ep.avgResponseTimeMs,
          lastSuccessAt: ep.lastSuccessAt,
          lastFailureAt: ep.lastFailureAt,
          lastResponseStatus: ep.lastResponseStatus,
          isVerified: ep.isVerified === 1 || ep.isVerified === true,
          verifiedAt: ep.verifiedAt,
          createdAt: ep.createdAt,
          updatedAt: ep.updatedAt,
        } : null,
      };
    },
  },
  {
    name: 'hookbase_create_endpoint',
    description: 'Create a new webhook endpoint. The signing secret is only returned once on creation - save it securely.',
    inputSchema: z.object({
      application_id: z.string().describe('The application ID this endpoint belongs to'),
      url: z.string().url().describe('The HTTPS URL to receive webhooks'),
      description: z.string().optional().describe('Description of the endpoint'),
      headers: z.array(z.object({
        name: z.string().describe('Header name'),
        value: z.string().describe('Header value'),
      })).optional().describe('Custom headers to include in requests'),
      timeout_seconds: z.number().optional().describe('Request timeout in seconds (default 30)'),
      circuit_failure_threshold: z.number().optional().describe('Failures before opening circuit (default 5)'),
      circuit_success_threshold: z.number().optional().describe('Successes to close circuit (default 2)'),
      circuit_cooldown_seconds: z.number().optional().describe('Cooldown before half-open (default 60)'),
    }).strict(),
    handler: async (args: {
      application_id: string;
      url: string;
      description?: string;
      headers?: Array<{ name: string; value: string }>;
      timeout_seconds?: number;
      circuit_failure_threshold?: number;
      circuit_success_threshold?: number;
      circuit_cooldown_seconds?: number;
    }) => {
      const result = await api.createWebhookEndpoint({
        applicationId: args.application_id,
        url: args.url,
        description: args.description,
        headers: args.headers,
        timeoutSeconds: args.timeout_seconds,
        circuitFailureThreshold: args.circuit_failure_threshold,
        circuitSuccessThreshold: args.circuit_success_threshold,
        circuitCooldownSeconds: args.circuit_cooldown_seconds,
      });
      if (result.error) {
        return { error: result.error };
      }
      return {
        message: 'Endpoint created successfully',
        warning: result.data?.warning || 'Save the signing secret now. It will not be shown again.',
        endpoint: {
          id: result.data?.data.id,
          url: result.data?.data.url,
          secret: result.data?.data.secret,
        },
      };
    },
  },
  {
    name: 'hookbase_update_endpoint',
    description: 'Update a webhook endpoint configuration.',
    inputSchema: z.object({
      endpoint_id: z.string().describe('The ID of the endpoint to update'),
      url: z.string().url().optional().describe('New HTTPS URL'),
      description: z.string().optional().describe('New description'),
      headers: z.array(z.object({
        name: z.string().describe('Header name'),
        value: z.string().describe('Header value'),
      })).optional().describe('Updated custom headers'),
      timeout_seconds: z.number().optional().describe('Request timeout in seconds'),
      is_enabled: z.boolean().optional().describe('Enable or disable the endpoint'),
      disabled_reason: z.string().optional().describe('Reason for disabling (when is_enabled=false)'),
      circuit_failure_threshold: z.number().optional().describe('Failures before opening circuit'),
      circuit_success_threshold: z.number().optional().describe('Successes to close circuit'),
      circuit_cooldown_seconds: z.number().optional().describe('Cooldown before half-open'),
    }).strict(),
    handler: async (args: {
      endpoint_id: string;
      url?: string;
      description?: string;
      headers?: Array<{ name: string; value: string }>;
      timeout_seconds?: number;
      is_enabled?: boolean;
      disabled_reason?: string;
      circuit_failure_threshold?: number;
      circuit_success_threshold?: number;
      circuit_cooldown_seconds?: number;
    }) => {
      const result = await api.updateWebhookEndpoint(args.endpoint_id, {
        url: args.url,
        description: args.description,
        headers: args.headers,
        timeoutSeconds: args.timeout_seconds,
        isDisabled: args.is_enabled !== undefined ? !args.is_enabled : undefined,
        disabledReason: args.disabled_reason,
        circuitFailureThreshold: args.circuit_failure_threshold,
        circuitSuccessThreshold: args.circuit_success_threshold,
        circuitCooldownSeconds: args.circuit_cooldown_seconds,
      });
      if (result.error) {
        return { error: result.error };
      }
      return { message: 'Endpoint updated successfully', endpoint: result.data?.data };
    },
  },
  {
    name: 'hookbase_delete_endpoint',
    description: 'Delete a webhook endpoint. This also removes all subscriptions for this endpoint.',
    inputSchema: z.object({
      endpoint_id: z.string().describe('The ID of the endpoint to delete'),
    }).strict(),
    handler: async (args: { endpoint_id: string }) => {
      const result = await api.deleteWebhookEndpoint(args.endpoint_id);
      if (result.error) {
        return { error: result.error };
      }
      return { message: 'Endpoint deleted successfully' };
    },
  },
  {
    name: 'hookbase_rotate_endpoint_secret',
    description: 'Rotate the signing secret for an endpoint. Returns the new secret (save it securely). Old secret remains valid during grace period.',
    inputSchema: z.object({
      endpoint_id: z.string().describe('The ID of the endpoint'),
      grace_period_seconds: z.number().optional().describe('How long old secret remains valid (default 3600 = 1 hour)'),
    }).strict(),
    handler: async (args: { endpoint_id: string; grace_period_seconds?: number }) => {
      const result = await api.rotateWebhookEndpointSecret(args.endpoint_id, args.grace_period_seconds);
      if (result.error) {
        return { error: result.error };
      }
      return {
        message: 'Secret rotated successfully. Save the new secret now.',
        secret: result.data?.secret,
        secretVersion: result.data?.secretVersion,
        previousSecretExpiresAt: result.data?.previousSecretExpiresAt,
      };
    },
  },
  {
    name: 'hookbase_reset_endpoint_circuit',
    description: 'Reset the circuit breaker for an endpoint. Use this to immediately re-enable deliveries after fixing an issue.',
    inputSchema: z.object({
      endpoint_id: z.string().describe('The ID of the endpoint'),
    }).strict(),
    handler: async (args: { endpoint_id: string }) => {
      const result = await api.resetWebhookEndpointCircuit(args.endpoint_id);
      if (result.error) {
        return { error: result.error };
      }
      return {
        message: 'Circuit breaker reset successfully',
        circuitState: result.data?.circuitState,
      };
    },
  },
];

// ============================================================================
// Webhook Subscriptions
// ============================================================================

export const subscriptionTools = [
  {
    name: 'hookbase_list_subscriptions',
    description: 'List webhook subscriptions. Subscriptions connect endpoints to event types they should receive.',
    inputSchema: z.object({
      endpoint_id: z.string().optional().describe('Filter by endpoint ID'),
      event_type_id: z.string().optional().describe('Filter by event type ID'),
      application_id: z.string().optional().describe('Filter by application ID'),
      is_enabled: z.boolean().optional().describe('Filter by enabled status'),
      limit: z.number().optional().describe('Maximum number of results (default 50, max 100)'),
      cursor: z.string().optional().describe('Pagination cursor for next page'),
    }).strict(),
    handler: async (args: {
      endpoint_id?: string;
      event_type_id?: string;
      application_id?: string;
      is_enabled?: boolean;
      limit?: number;
      cursor?: string;
    }) => {
      const result = await api.getWebhookSubscriptions({
        endpointId: args.endpoint_id,
        eventTypeId: args.event_type_id,
        applicationId: args.application_id,
        isEnabled: args.is_enabled,
        limit: args.limit,
        cursor: args.cursor,
      });
      if (result.error) {
        return { error: result.error };
      }
      return {
        subscriptions: result.data?.data?.map(sub => ({
          id: sub.id,
          endpointId: sub.endpointId,
          eventTypeId: sub.eventTypeId,
          filterExpression: sub.filterExpression,
          labelFilters: sub.labelFilters,
          labelFilterMode: sub.labelFilterMode,
          transformId: sub.transformId,
          isEnabled: sub.isEnabled === 1 || sub.isEnabled === true,
          endpointUrl: sub.endpointUrl,
          eventTypeName: sub.eventTypeName,
          eventTypeDisplayName: sub.eventTypeDisplayName,
          applicationId: sub.applicationId,
          applicationName: sub.applicationName,
          createdAt: sub.createdAt,
        })) ?? [],
        pagination: result.data?.pagination,
      };
    },
  },
  {
    name: 'hookbase_get_subscription',
    description: 'Get detailed information about a webhook subscription.',
    inputSchema: z.object({
      subscription_id: z.string().describe('The ID of the subscription'),
    }).strict(),
    handler: async (args: { subscription_id: string }) => {
      const result = await api.getWebhookSubscription(args.subscription_id);
      if (result.error) {
        return { error: result.error };
      }
      const sub = result.data?.data;
      return {
        subscription: sub ? {
          id: sub.id,
          endpointId: sub.endpointId,
          eventTypeId: sub.eventTypeId,
          filterExpression: sub.filterExpression,
          labelFilters: sub.labelFilters,
          labelFilterMode: sub.labelFilterMode,
          transformId: sub.transformId,
          isEnabled: sub.isEnabled === 1 || sub.isEnabled === true,
          endpoint: sub.endpoint,
          eventType: sub.eventType,
          application: sub.application,
          createdAt: sub.createdAt,
          createdBy: sub.createdBy,
        } : null,
      };
    },
  },
  {
    name: 'hookbase_create_subscription',
    description: 'Create a subscription to connect an endpoint to an event type. The endpoint will receive events of this type. Use label_filters to only receive events with matching labels.',
    inputSchema: z.object({
      endpoint_id: z.string().describe('The endpoint ID to subscribe'),
      event_type_id: z.string().describe('The event type ID to subscribe to'),
      filter_expression: z.string().optional().describe('JSONata expression to filter events'),
      label_filters: z.record(z.union([z.string(), z.array(z.string())])).optional().describe('Label filters to match against event labels (e.g., {"environment": "production"} or {"region": ["us-east", "us-west"]})'),
      label_filter_mode: z.enum(['all', 'any']).optional().describe('Filter mode: "all" requires all filters to match (AND), "any" requires at least one filter to match (OR). Default: "all"'),
      transform_id: z.string().optional().describe('Transform ID to modify payload before delivery'),
      is_enabled: z.boolean().optional().describe('Enable the subscription (default true)'),
    }).strict(),
    handler: async (args: {
      endpoint_id: string;
      event_type_id: string;
      filter_expression?: string;
      label_filters?: Record<string, string | string[]>;
      label_filter_mode?: 'all' | 'any';
      transform_id?: string;
      is_enabled?: boolean;
    }) => {
      const result = await api.createWebhookSubscription({
        endpointId: args.endpoint_id,
        eventTypeId: args.event_type_id,
        filterExpression: args.filter_expression,
        labelFilters: args.label_filters,
        labelFilterMode: args.label_filter_mode,
        transformId: args.transform_id,
        isEnabled: args.is_enabled,
      });
      if (result.error) {
        return { error: result.error };
      }
      return {
        message: 'Subscription created successfully',
        subscription: result.data?.data,
      };
    },
  },
  {
    name: 'hookbase_update_subscription',
    description: 'Update a webhook subscription.',
    inputSchema: z.object({
      subscription_id: z.string().describe('The ID of the subscription to update'),
      filter_expression: z.string().optional().describe('New filter expression (null to remove)'),
      label_filters: z.record(z.union([z.string(), z.array(z.string())])).optional().nullable().describe('Label filters to match against event labels (null to remove)'),
      label_filter_mode: z.enum(['all', 'any']).optional().nullable().describe('Filter mode: "all" (AND) or "any" (OR)'),
      transform_id: z.string().optional().describe('New transform ID (null to remove)'),
      is_enabled: z.boolean().optional().describe('Enable or disable the subscription'),
    }).strict(),
    handler: async (args: {
      subscription_id: string;
      filter_expression?: string;
      label_filters?: Record<string, string | string[]> | null;
      label_filter_mode?: 'all' | 'any' | null;
      transform_id?: string;
      is_enabled?: boolean;
    }) => {
      const result = await api.updateWebhookSubscription(args.subscription_id, {
        filterExpression: args.filter_expression,
        labelFilters: args.label_filters,
        labelFilterMode: args.label_filter_mode,
        transformId: args.transform_id,
        isEnabled: args.is_enabled,
      });
      if (result.error) {
        return { error: result.error };
      }
      return { message: 'Subscription updated successfully', subscription: result.data?.data };
    },
  },
  {
    name: 'hookbase_delete_subscription',
    description: 'Delete a webhook subscription. The endpoint will no longer receive events of this type.',
    inputSchema: z.object({
      subscription_id: z.string().describe('The ID of the subscription to delete'),
    }).strict(),
    handler: async (args: { subscription_id: string }) => {
      const result = await api.deleteWebhookSubscription(args.subscription_id);
      if (result.error) {
        return { error: result.error };
      }
      return { message: 'Subscription deleted successfully' };
    },
  },
];

// Export all tools from this module
export const outboundTools = [
  ...applicationTools,
  ...endpointTools,
  ...subscriptionTools,
];
