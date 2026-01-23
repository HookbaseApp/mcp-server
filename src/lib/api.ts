/**
 * API client for Hookbase
 * Adapted from CLI for MCP server use
 */

import { getConfig } from './config.js';

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  status: number;
}

/**
 * Make an API request to Hookbase
 */
async function request<T>(
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<ApiResponse<T>> {
  const config = getConfig();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.apiKey}`,
  };

  try {
    const response = await fetch(`${config.apiUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json() as Record<string, unknown>;

    if (!response.ok) {
      return {
        error: (data.error as string) || (data.message as string) || 'Request failed',
        status: response.status,
      };
    }

    return { data: data as T, status: response.status };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Network error',
      status: 0,
    };
  }
}

/**
 * Get organization-scoped API path
 */
function orgPath(path: string): string {
  const config = getConfig();
  return `/api/organizations/${config.orgId}${path}`;
}

// ============================================================================
// Sources
// ============================================================================

export interface Source {
  id: string;
  name: string;
  slug: string;
  provider: string | null;
  description?: string;
  signing_secret?: string;
  reject_invalid_signatures?: boolean;
  rate_limit_per_minute?: number;
  isActive?: boolean;
  is_active?: number;
  eventCount?: number;
  event_count?: number;
  routeCount?: number;
  route_count?: number;
  created_at?: string;
}

export async function getSources(): Promise<ApiResponse<{ sources: Source[] }>> {
  return request<{ sources: Source[] }>('GET', orgPath('/sources'));
}

export async function getSource(sourceId: string): Promise<ApiResponse<{ source: Source }>> {
  return request<{ source: Source }>('GET', orgPath(`/sources/${sourceId}`));
}

export async function createSource(
  name: string,
  slug: string,
  provider?: string,
  options?: {
    description?: string;
    rejectInvalidSignatures?: boolean;
    rateLimitPerMinute?: number;
  }
): Promise<ApiResponse<{ source: Source }>> {
  const body: Record<string, unknown> = {
    name,
    slug,
    description: options?.description,
    rejectInvalidSignatures: options?.rejectInvalidSignatures,
    rateLimitPerMinute: options?.rateLimitPerMinute,
  };

  if (provider && provider.length > 0) {
    body.provider = provider;
  }

  return request<{ source: Source }>('POST', orgPath('/sources'), body);
}

export async function updateSource(
  sourceId: string,
  data: {
    name?: string;
    provider?: string;
    description?: string;
    isActive?: boolean;
    rejectInvalidSignatures?: boolean;
    rateLimitPerMinute?: number;
  }
): Promise<ApiResponse<{ source: Source }>> {
  return request<{ source: Source }>('PATCH', orgPath(`/sources/${sourceId}`), data);
}

export async function deleteSource(sourceId: string): Promise<ApiResponse<{ success: boolean }>> {
  return request<{ success: boolean }>('DELETE', orgPath(`/sources/${sourceId}`));
}

// ============================================================================
// Destinations
// ============================================================================

export interface Destination {
  id: string;
  name: string;
  slug: string;
  url: string;
  method: string;
  headers?: Record<string, string>;
  auth_type: 'none' | 'basic' | 'bearer' | 'api_key' | 'custom_header';
  auth_config?: Record<string, string>;
  timeout_ms?: number;
  rate_limit_per_minute?: number;
  mock_mode?: boolean;
  is_active: number;
  delivery_count?: number;
  success_count?: number;
  failure_count?: number;
  created_at?: string;
}

export async function getDestinations(): Promise<ApiResponse<{ destinations: Destination[] }>> {
  return request<{ destinations: Destination[] }>('GET', orgPath('/destinations'));
}

export async function getDestination(destId: string): Promise<ApiResponse<{ destination: Destination }>> {
  return request<{ destination: Destination }>('GET', orgPath(`/destinations/${destId}`));
}

export async function createDestination(data: {
  name: string;
  slug?: string;
  url: string;
  method?: string;
  headers?: Record<string, string>;
  authType?: 'none' | 'basic' | 'bearer' | 'api_key' | 'custom_header';
  authConfig?: Record<string, string>;
  timeoutMs?: number;
  rateLimitPerMinute?: number;
}): Promise<ApiResponse<{ destination: Destination }>> {
  const slug = data.slug || data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  return request<{ destination: Destination }>('POST', orgPath('/destinations'), {
    name: data.name,
    slug: slug,
    url: data.url,
    method: data.method || 'POST',
    headers: data.headers,
    authType: data.authType || 'none',
    authConfig: data.authConfig,
    timeoutMs: data.timeoutMs || 30000,
    rateLimitPerMinute: data.rateLimitPerMinute,
  });
}

export async function updateDestination(
  destId: string,
  data: {
    name?: string;
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    authType?: string;
    authConfig?: Record<string, string>;
    timeoutMs?: number;
    rateLimitPerMinute?: number;
    isActive?: boolean;
  }
): Promise<ApiResponse<{ destination: Destination }>> {
  return request<{ destination: Destination }>('PATCH', orgPath(`/destinations/${destId}`), data);
}

export async function deleteDestination(destId: string): Promise<ApiResponse<{ success: boolean }>> {
  return request<{ success: boolean }>('DELETE', orgPath(`/destinations/${destId}`));
}

export async function testDestination(destId: string): Promise<ApiResponse<{
  success: boolean;
  statusCode: number;
  responseTime: number;
  responseBody?: string;
  error?: string;
}>> {
  return request<{ success: boolean; statusCode: number; responseTime: number; responseBody?: string; error?: string }>(
    'POST',
    orgPath(`/destinations/${destId}/test`)
  );
}

// ============================================================================
// Routes
// ============================================================================

export interface Route {
  id: string;
  name: string;
  source_id: string;
  destination_id: string;
  source_name?: string;
  destination_name?: string;
  filter_id?: string;
  transform_id?: string;
  schema_id?: string;
  priority: number;
  is_active: number;
  delivery_count?: number;
  created_at?: string;
}

export interface FilterCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'starts_with' | 'ends_with' | 'exists' | 'not_exists' | 'greater_than' | 'less_than' | 'regex';
  value?: string;
}

export async function getRoutes(): Promise<ApiResponse<{ routes: Route[] }>> {
  return request<{ routes: Route[] }>('GET', orgPath('/routes'));
}

export async function getRoute(routeId: string): Promise<ApiResponse<{ route: Route }>> {
  return request<{ route: Route }>('GET', orgPath(`/routes/${routeId}`));
}

export async function createRoute(data: {
  name: string;
  sourceId: string;
  destinationId: string;
  filterId?: string;
  filterConditions?: { logic: 'AND' | 'OR'; conditions: FilterCondition[] };
  transformId?: string;
  schemaId?: string;
  priority?: number;
  isActive?: boolean;
}): Promise<ApiResponse<{ route: Route }>> {
  return request<{ route: Route }>('POST', orgPath('/routes'), {
    name: data.name,
    sourceId: data.sourceId,
    destinationId: data.destinationId,
    filterId: data.filterId,
    filterConditions: data.filterConditions,
    transformId: data.transformId,
    schemaId: data.schemaId,
    priority: data.priority ?? 0,
    isActive: data.isActive ?? true,
  });
}

export async function updateRoute(
  routeId: string,
  data: {
    name?: string;
    sourceId?: string;
    destinationId?: string;
    filterId?: string | null;
    transformId?: string | null;
    priority?: number;
    isActive?: boolean;
  }
): Promise<ApiResponse<{ route: Route }>> {
  return request<{ route: Route }>('PATCH', orgPath(`/routes/${routeId}`), data);
}

export async function deleteRoute(routeId: string): Promise<ApiResponse<{ success: boolean }>> {
  return request<{ success: boolean }>('DELETE', orgPath(`/routes/${routeId}`));
}

// ============================================================================
// Events
// ============================================================================

export interface Event {
  id: string;
  source_id: string;
  source_name?: string;
  source_slug?: string;
  event_type?: string;
  method?: string;
  path?: string;
  headers?: Record<string, string>;
  payload_size?: number;
  signature_valid?: boolean;
  status?: 'delivered' | 'failed' | 'pending' | 'partial' | 'no_routes';
  delivery_count?: number;
  received_at: string;
}

export interface EventWithPayload extends Event {
  payload?: unknown;
  deliveries?: Delivery[];
}

export async function getEvents(options?: {
  limit?: number;
  offset?: number;
  sourceId?: string;
  status?: string;
  eventType?: string;
  fromDate?: string;
  toDate?: string;
  search?: string;
}): Promise<ApiResponse<{ events: Event[]; total: number; hasMore: boolean }>> {
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.offset) params.set('offset', String(options.offset));
  if (options?.sourceId) params.set('sourceId', options.sourceId);
  if (options?.status) params.set('status', options.status);
  if (options?.eventType) params.set('eventType', options.eventType);
  if (options?.fromDate) params.set('fromDate', options.fromDate);
  if (options?.toDate) params.set('toDate', options.toDate);
  if (options?.search) params.set('search', options.search);

  const queryString = params.toString();
  return request<{ events: Event[]; total: number; hasMore: boolean }>(
    'GET',
    orgPath(`/events${queryString ? `?${queryString}` : ''}`)
  );
}

export async function getEvent(eventId: string): Promise<ApiResponse<{ event: EventWithPayload }>> {
  return request<{ event: EventWithPayload }>('GET', orgPath(`/events/${eventId}`));
}

// ============================================================================
// Deliveries
// ============================================================================

export interface Delivery {
  id: string;
  event_id: string;
  route_id: string;
  destination_id: string;
  destination_name?: string;
  route_name?: string;
  status: 'pending' | 'success' | 'failed' | 'retrying';
  attempt_count: number;
  max_attempts: number;
  response_status?: number;
  response_time_ms?: number;
  response_body?: string;
  error_message?: string;
  next_retry_at?: string;
  completed_at?: string;
  created_at: string;
}

export async function getDeliveries(options?: {
  limit?: number;
  offset?: number;
  eventId?: string;
  routeId?: string;
  destinationId?: string;
  status?: string;
}): Promise<ApiResponse<{ deliveries: Delivery[]; total: number; hasMore: boolean }>> {
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.offset) params.set('offset', String(options.offset));
  if (options?.eventId) params.set('eventId', options.eventId);
  if (options?.routeId) params.set('routeId', options.routeId);
  if (options?.destinationId) params.set('destinationId', options.destinationId);
  if (options?.status) params.set('status', options.status);

  const queryString = params.toString();
  return request<{ deliveries: Delivery[]; total: number; hasMore: boolean }>(
    'GET',
    orgPath(`/deliveries${queryString ? `?${queryString}` : ''}`)
  );
}

export async function getDelivery(deliveryId: string): Promise<ApiResponse<{ delivery: Delivery }>> {
  return request<{ delivery: Delivery }>('GET', orgPath(`/deliveries/${deliveryId}`));
}

export async function replayDelivery(deliveryId: string): Promise<ApiResponse<{ delivery: Delivery }>> {
  return request<{ delivery: Delivery }>('POST', orgPath(`/deliveries/${deliveryId}/replay`));
}

export async function bulkReplayDeliveries(deliveryIds: string[]): Promise<ApiResponse<{ replayed: number; failed: number }>> {
  return request<{ replayed: number; failed: number }>('POST', orgPath('/deliveries/bulk-replay'), {
    deliveryIds,
  });
}

// ============================================================================
// Tunnels
// ============================================================================

export interface Tunnel {
  id: string;
  name: string;
  subdomain: string;
  status: 'connected' | 'disconnected' | 'error';
  auth_token?: string;
  total_requests: number;
  last_connected_at: string | null;
  created_at?: string;
}

export interface CreateTunnelResponse {
  tunnel: Tunnel;
  tunnelUrl: string;
  wsUrl: string;
}

export async function getTunnels(): Promise<ApiResponse<{ tunnels: Tunnel[] }>> {
  return request<{ tunnels: Tunnel[] }>('GET', orgPath('/tunnels'));
}

export async function createTunnel(name: string, subdomain?: string): Promise<ApiResponse<CreateTunnelResponse>> {
  return request<CreateTunnelResponse>('POST', orgPath('/tunnels'), {
    name,
    subdomain,
  });
}

export async function getTunnelStatus(tunnelId: string): Promise<ApiResponse<{ tunnel: Tunnel; liveStatus: unknown }>> {
  return request<{ tunnel: Tunnel; liveStatus: unknown }>('GET', orgPath(`/tunnels/${tunnelId}/status`));
}

export async function deleteTunnel(tunnelId: string): Promise<ApiResponse<{ success: boolean }>> {
  return request<{ success: boolean }>('DELETE', orgPath(`/tunnels/${tunnelId}`));
}

// ============================================================================
// Cron Jobs
// ============================================================================

export interface CronJob {
  id: string;
  organization_id: string;
  group_id?: string | null;
  name: string;
  description?: string | null;
  cron_expression: string;
  timezone: string;
  url: string;
  method: string;
  headers?: string | null;
  payload?: string | null;
  timeout_ms: number;
  is_active: number;
  last_run_at?: string | null;
  next_run_at?: string | null;
  consecutive_failures?: number;
  created_at: string;
  updated_at: string;
}

export interface CronTriggerResult {
  id: string;
  status: 'success' | 'failed';
  responseStatus?: number;
  latencyMs?: number;
  error?: string;
}

export async function getCronJobs(): Promise<ApiResponse<{ cronJobs: CronJob[] }>> {
  return request<{ cronJobs: CronJob[] }>('GET', orgPath('/cron'));
}

export async function createCronJob(data: {
  name: string;
  description?: string;
  cronExpression: string;
  timezone?: string;
  url: string;
  method?: string;
  headers?: Record<string, string>;
  payload?: string;
  timeoutMs?: number;
}): Promise<ApiResponse<{ cronJob: CronJob }>> {
  return request<{ cronJob: CronJob }>('POST', orgPath('/cron'), {
    name: data.name,
    description: data.description,
    cronExpression: data.cronExpression,
    timezone: data.timezone || 'UTC',
    url: data.url,
    method: data.method || 'POST',
    headers: data.headers,
    payload: data.payload,
    timeoutMs: data.timeoutMs || 30000,
  });
}

export async function deleteCronJob(jobId: string): Promise<ApiResponse<{ success: boolean }>> {
  return request<{ success: boolean }>('DELETE', orgPath(`/cron/${jobId}`));
}

export async function triggerCronJob(jobId: string): Promise<ApiResponse<{ execution: CronTriggerResult }>> {
  return request<{ execution: CronTriggerResult }>('POST', orgPath(`/cron/${jobId}/trigger`));
}

// ============================================================================
// Analytics
// ============================================================================

export interface DashboardAnalytics {
  overview: {
    totalEvents: number;
    totalDeliveries: number;
    successfulDeliveries: number;
    failedDeliveries: number;
    successRate: number;
    avgResponseTime: number;
  };
  topSources: Array<{
    id: string;
    name: string;
    slug: string;
    eventCount: number;
  }>;
  topDestinations: Array<{
    id: string;
    name: string;
    deliveryCount: number;
    successRate: number;
  }>;
  recentEvents: Event[];
  eventsByHour?: Array<{
    hour: string;
    count: number;
  }>;
  deliveriesByStatus?: Array<{
    status: string;
    count: number;
  }>;
}

export async function getDashboardAnalytics(range: '1h' | '24h' | '7d' | '30d' = '24h'): Promise<ApiResponse<DashboardAnalytics>> {
  return request<DashboardAnalytics>('GET', orgPath(`/analytics/dashboard?range=${range}`));
}
