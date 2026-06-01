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
  transientMode?: boolean;
  transient_mode?: number;
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
    transientMode?: boolean;
  }
): Promise<ApiResponse<{ source: Source }>> {
  const body: Record<string, unknown> = {
    name,
    slug,
    description: options?.description,
    rejectInvalidSignatures: options?.rejectInvalidSignatures,
    rateLimitPerMinute: options?.rateLimitPerMinute,
    transientMode: options?.transientMode,
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
    transientMode?: boolean;
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
  type?: 'http' | 's3' | 'r2' | 'gcs' | 'azure_blob';
  url: string;
  method: string;
  headers?: Record<string, string>;
  auth_type: 'none' | 'basic' | 'bearer' | 'api_key' | 'custom_header';
  auth_config?: Record<string, string>;
  timeout_ms?: number;
  rate_limit_per_minute?: number;
  mock_mode?: boolean;
  is_active: number;
  config?: Record<string, any>;
  field_mapping?: Array<{ source: string; target: string; type: string; default?: string }>;
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
  type?: 'http' | 's3' | 'r2' | 'gcs' | 'azure_blob';
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  authType?: 'none' | 'basic' | 'bearer' | 'api_key' | 'custom_header';
  authConfig?: Record<string, string>;
  timeoutMs?: number;
  rateLimitPerMinute?: number;
  config?: Record<string, any>;
  fieldMapping?: Array<{ source: string; target: string; type: string; default?: string }>;
  useStaticIp?: boolean;
  batchSize?: number;
  batchWindowSeconds?: number;
}): Promise<ApiResponse<{ destination: Destination }>> {
  const slug = data.slug || data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const destType = data.type || 'http';

  return request<{ destination: Destination }>('POST', orgPath('/destinations'), {
    name: data.name,
    slug: slug,
    type: destType,
    url: data.url,
    method: data.method || (destType === 'http' ? 'POST' : undefined),
    headers: data.headers,
    authType: data.authType || (destType === 'http' ? 'none' : undefined),
    authConfig: data.authConfig,
    timeoutMs: data.timeoutMs || 30000,
    rateLimitPerMinute: data.rateLimitPerMinute,
    config: data.config,
    fieldMapping: data.fieldMapping,
    useStaticIp: data.useStaticIp,
    batchSize: data.batchSize,
    batchWindowSeconds: data.batchWindowSeconds,
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
    config?: Record<string, any>;
    fieldMapping?: Array<{ source: string; target: string; type: string; default?: string }>;
    useStaticIp?: boolean;
    batchSize?: number;
    batchWindowSeconds?: number;
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

export interface ReplayOverrides {
  modifiedPayload?: unknown;
  destinationOverride?: string;
  transformOverride?: { code: string; type?: string; inputFormat?: string; outputFormat?: string };
  headersOverride?: Record<string, string>;
  persistTransform?: boolean;
}

export async function replayDeliveryWithEdit(
  deliveryId: string,
  overrides: ReplayOverrides,
): Promise<ApiResponse<{
  message: string;
  newDeliveryId?: string;
  overrides?: Record<string, unknown>;
}>> {
  return request('POST', orgPath(`/deliveries/${deliveryId}/replay`), overrides as unknown as Record<string, unknown>);
}

export async function bulkReplayDeliveries(deliveryIds: string[]): Promise<ApiResponse<{ replayed: number; failed: number }>> {
  return request<{ replayed: number; failed: number }>('POST', orgPath('/deliveries/bulk-replay'), {
    deliveryIds,
  });
}

export async function listDeliveryClusters(params?: {
  sinceHours?: number;
  limit?: number;
}): Promise<ApiResponse<{
  clusters: Array<{
    fingerprint: string;
    count: number;
    firstSeen: string;
    lastSeen: string;
    sampleDeliveryId: string;
    routeName: string | null;
    destinationName: string | null;
    responseStatus: number | null;
    errorMessageExcerpt: string | null;
    rcaCategory: string | null;
    affectedEventCount: number;
  }>;
  since: string;
  sinceHours: number;
}>> {
  const query = new URLSearchParams();
  if (params?.sinceHours != null) query.set('sinceHours', String(params.sinceHours));
  if (params?.limit != null) query.set('limit', String(params.limit));
  const qs = query.toString();
  return request('GET', orgPath(`/delivery-clusters${qs ? `?${qs}` : ''}`));
}

export async function replayDeliveryCluster(
  fingerprint: string,
  overrides: ReplayOverrides & { limit?: number },
): Promise<ApiResponse<{
  message: string;
  queued: number;
  skipped: number;
  fingerprint: string;
  overrides: Record<string, unknown>;
}>> {
  return request(
    'POST',
    orgPath(`/delivery-clusters/${encodeURIComponent(fingerprint)}/replay-all`),
    overrides as unknown as Record<string, unknown>,
  );
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

export async function getTunnel(tunnelId: string): Promise<ApiResponse<{ tunnel: Tunnel }>> {
  return request<{ tunnel: Tunnel }>('GET', orgPath(`/tunnels/${tunnelId}`));
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

export async function getCronJob(jobId: string): Promise<ApiResponse<{ cronJob: CronJob }>> {
  return request<{ cronJob: CronJob }>('GET', orgPath(`/cron/${jobId}`));
}

export async function updateCronJob(
  jobId: string,
  data: {
    name?: string;
    description?: string;
    cronExpression?: string;
    timezone?: string;
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    payload?: string;
    timeoutMs?: number;
    isActive?: boolean;
    notifyOnFailure?: boolean;
    notifyOnSuccess?: boolean;
    notifyEmails?: string;
    groupId?: string | null;
  }
): Promise<ApiResponse<{ success: boolean }>> {
  return request<{ success: boolean }>('PATCH', orgPath(`/cron/${jobId}`), data);
}

export async function deleteCronJob(jobId: string): Promise<ApiResponse<{ success: boolean }>> {
  return request<{ success: boolean }>('DELETE', orgPath(`/cron/${jobId}`));
}

export async function triggerCronJob(jobId: string): Promise<ApiResponse<{ execution: CronTriggerResult }>> {
  return request<{ execution: CronTriggerResult }>('POST', orgPath(`/cron/${jobId}/trigger`));
}

// ============================================================================
// Cron Groups
// ============================================================================

export interface CronGroup {
  id: string;
  organization_id?: string;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
  is_collapsed: boolean;
  job_count?: number;
  created_at: string;
  updated_at: string;
}

export async function getCronGroups(): Promise<ApiResponse<{ groups: CronGroup[] }>> {
  return request<{ groups: CronGroup[] }>('GET', orgPath('/cron-groups'));
}

export async function getCronGroup(groupId: string): Promise<ApiResponse<{ group: CronGroup }>> {
  return request<{ group: CronGroup }>('GET', orgPath(`/cron-groups/${groupId}`));
}

export async function createCronGroup(data: {
  name: string;
  description?: string;
}): Promise<ApiResponse<{ group: CronGroup }>> {
  return request<{ group: CronGroup }>('POST', orgPath('/cron-groups'), data);
}

export async function updateCronGroup(
  groupId: string,
  data: {
    name?: string;
    description?: string;
    sortOrder?: number;
    isCollapsed?: boolean;
  }
): Promise<ApiResponse<{ group: CronGroup }>> {
  return request<{ group: CronGroup }>('PATCH', orgPath(`/cron-groups/${groupId}`), data);
}

export async function deleteCronGroup(groupId: string): Promise<ApiResponse<{ success: boolean }>> {
  return request<{ success: boolean }>('DELETE', orgPath(`/cron-groups/${groupId}`));
}

// ============================================================================
// Alert Rules
// ============================================================================

export type AlertTriggerType =
  | 'source_silence'
  | 'failure_rate'
  | 'latency_threshold'
  | 'volume_spike'
  | 'volume_drop'
  | 'anomaly_volume'
  | 'schema_drift';

export interface AlertRule {
  id: string;
  name: string;
  triggerType: AlertTriggerType | string;
  triggerConfig: Record<string, unknown>;
  notificationChannels: string[];
  channelConfig?: { cooldownMinutes?: number };
  isActive: boolean;
  lastTriggeredAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export async function getAlertRules(): Promise<ApiResponse<{ rules: AlertRule[] }>> {
  return request<{ rules: AlertRule[] }>('GET', orgPath('/alert-rules'));
}

export async function getAlertRule(ruleId: string): Promise<ApiResponse<{ rule: AlertRule }>> {
  return request<{ rule: AlertRule }>('GET', orgPath(`/alert-rules/${ruleId}`));
}

export async function createAlertRule(data: {
  name: string;
  triggerType: AlertTriggerType | string;
  triggerConfig: Record<string, unknown>;
  notificationChannels: string[];
  cooldownMinutes?: number;
}): Promise<ApiResponse<{ rule: AlertRule }>> {
  return request<{ rule: AlertRule }>('POST', orgPath('/alert-rules'), data);
}

export async function updateAlertRule(
  ruleId: string,
  data: {
    name?: string;
    triggerConfig?: Record<string, unknown>;
    notificationChannels?: string[];
    cooldownMinutes?: number;
    isActive?: boolean;
  }
): Promise<ApiResponse<{ success: boolean }>> {
  return request<{ success: boolean }>('PATCH', orgPath(`/alert-rules/${ruleId}`), data);
}

export async function deleteAlertRule(ruleId: string): Promise<ApiResponse<{ success: boolean }>> {
  return request<{ success: boolean }>('DELETE', orgPath(`/alert-rules/${ruleId}`));
}

export async function testAlertRule(
  ruleId: string
): Promise<ApiResponse<{ success: boolean; result?: unknown }>> {
  return request<{ success: boolean; result?: unknown }>('POST', orgPath(`/alert-rules/${ruleId}/test`));
}

// ============================================================================
// Notification Channels
// ============================================================================

export type NotificationChannelType = 'email' | 'slack' | 'webhook' | 'teams' | 'pagerduty' | 'discord';

export interface NotificationChannel {
  id: string;
  organizationId?: string;
  name: string;
  type: NotificationChannelType | string;
  config: Record<string, unknown>;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export async function getNotificationChannels(): Promise<ApiResponse<{ channels: NotificationChannel[] }>> {
  return request<{ channels: NotificationChannel[] }>('GET', orgPath('/notification-channels'));
}

export async function getNotificationChannel(
  channelId: string
): Promise<ApiResponse<{ channel: NotificationChannel }>> {
  return request<{ channel: NotificationChannel }>('GET', orgPath(`/notification-channels/${channelId}`));
}

export async function createNotificationChannel(data: {
  name: string;
  type: NotificationChannelType;
  config: Record<string, unknown>;
}): Promise<ApiResponse<{ channel: NotificationChannel }>> {
  return request<{ channel: NotificationChannel }>('POST', orgPath('/notification-channels'), data);
}

export async function updateNotificationChannel(
  channelId: string,
  data: {
    name?: string;
    config?: Record<string, unknown>;
    isActive?: boolean;
  }
): Promise<ApiResponse<{ success: boolean }>> {
  return request<{ success: boolean }>('PATCH', orgPath(`/notification-channels/${channelId}`), data);
}

export async function deleteNotificationChannel(
  channelId: string
): Promise<ApiResponse<{ success: boolean }>> {
  return request<{ success: boolean }>('DELETE', orgPath(`/notification-channels/${channelId}`));
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

// ============================================================================
// Filters
// ============================================================================

export interface Filter {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  conditions?: unknown;
  logic?: 'AND' | 'OR';
  createdAt?: string;
  updatedAt?: string;
}

export type FilterOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'starts_with'
  | 'ends_with'
  | 'exists'
  | 'not_exists'
  | 'greater_than'
  | 'less_than'
  | 'regex';

export interface FilterListResponse {
  filters: Filter[];
  pagination: { total: number; page: number; pageSize: number };
}

export async function getFilters(options?: {
  page?: number;
  pageSize?: number;
}): Promise<ApiResponse<FilterListResponse>> {
  const params = new URLSearchParams();
  if (options?.page) params.set('page', String(options.page));
  if (options?.pageSize) params.set('pageSize', String(options.pageSize));
  const qs = params.toString();
  return request<FilterListResponse>('GET', orgPath(`/filters${qs ? `?${qs}` : ''}`));
}

export async function getFilter(filterId: string): Promise<ApiResponse<{ filter: Filter }>> {
  return request<{ filter: Filter }>('GET', orgPath(`/filters/${filterId}`));
}

export async function createFilter(data: {
  name: string;
  description?: string;
  slug?: string;
  conditions: Array<{ field: string; operator: FilterOperator; value?: unknown }>;
  logic?: 'AND' | 'OR';
}): Promise<ApiResponse<{ filter: Filter }>> {
  return request<{ filter: Filter }>('POST', orgPath('/filters'), {
    name: data.name,
    description: data.description,
    slug: data.slug,
    conditions: data.conditions,
    logic: data.logic || 'AND',
  });
}

export async function updateFilter(
  filterId: string,
  data: {
    name?: string;
    description?: string | null;
    conditions?: Array<{ field: string; operator: FilterOperator; value?: unknown }>;
    logic?: 'AND' | 'OR';
  }
): Promise<ApiResponse<{ success: boolean }>> {
  return request<{ success: boolean }>('PATCH', orgPath(`/filters/${filterId}`), data);
}

export async function deleteFilter(filterId: string): Promise<ApiResponse<{ success: boolean }>> {
  return request<{ success: boolean }>('DELETE', orgPath(`/filters/${filterId}`));
}

// ============================================================================
// Transforms
// ============================================================================

export type TransformType = 'jsonata' | 'xslt' | 'liquid' | 'javascript';
export type ContentFormat = 'json' | 'xml' | 'text';

export interface Transform {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  code?: string;
  transformType?: TransformType;
  transform_type?: TransformType;
  inputFormat?: ContentFormat;
  input_format?: ContentFormat;
  outputFormat?: ContentFormat;
  output_format?: ContentFormat;
  isActive?: boolean | number;
  createdAt?: string;
  updatedAt?: string;
}

export interface TransformListResponse {
  transforms: Transform[];
  pagination: { total: number; page: number; pageSize: number };
}

export async function getTransforms(options?: {
  page?: number;
  pageSize?: number;
}): Promise<ApiResponse<TransformListResponse>> {
  const params = new URLSearchParams();
  if (options?.page) params.set('page', String(options.page));
  if (options?.pageSize) params.set('pageSize', String(options.pageSize));
  const qs = params.toString();
  return request<TransformListResponse>('GET', orgPath(`/transforms${qs ? `?${qs}` : ''}`));
}

export async function getTransform(transformId: string): Promise<ApiResponse<{ transform: Transform }>> {
  return request<{ transform: Transform }>('GET', orgPath(`/transforms/${transformId}`));
}

export async function createTransform(data: {
  name: string;
  slug?: string;
  description?: string;
  code: string;
  transformType?: TransformType;
  inputFormat?: ContentFormat;
  outputFormat?: ContentFormat;
}): Promise<ApiResponse<{ transform: Transform }>> {
  return request<{ transform: Transform }>('POST', orgPath('/transforms'), {
    name: data.name,
    slug: data.slug,
    description: data.description,
    code: data.code,
    transformType: data.transformType || 'jsonata',
    inputFormat: data.inputFormat || 'json',
    outputFormat: data.outputFormat || 'json',
  });
}

export async function updateTransform(
  transformId: string,
  data: {
    name?: string;
    description?: string | null;
    code?: string;
    transformType?: TransformType;
    inputFormat?: ContentFormat;
    outputFormat?: ContentFormat;
    isActive?: boolean;
  }
): Promise<ApiResponse<{ success: boolean }>> {
  return request<{ success: boolean }>('PATCH', orgPath(`/transforms/${transformId}`), data);
}

export async function deleteTransform(transformId: string): Promise<ApiResponse<{ success: boolean }>> {
  return request<{ success: boolean }>('DELETE', orgPath(`/transforms/${transformId}`));
}

export async function testTransform(data: {
  code: string;
  payload: unknown;
  transformType?: TransformType;
  inputFormat?: ContentFormat;
  outputFormat?: ContentFormat;
}): Promise<ApiResponse<{ success: boolean; output?: unknown; error?: string }>> {
  return request<{ success: boolean; output?: unknown; error?: string }>('POST', orgPath('/transforms/test'), {
    code: data.code,
    payload: data.payload,
    transformType: data.transformType || 'jsonata',
    inputFormat: data.inputFormat || 'json',
    outputFormat: data.outputFormat || 'json',
  });
}

// ============================================================================
// Schemas
// ============================================================================

export interface Schema {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  jsonSchema?: unknown;
  json_schema?: unknown;
  createdAt?: string;
  updatedAt?: string;
}

export async function getSchemas(): Promise<ApiResponse<{ schemas: Schema[] }>> {
  return request<{ schemas: Schema[] }>('GET', orgPath('/schemas'));
}

export async function getSchema(schemaId: string): Promise<ApiResponse<{ schema: Schema }>> {
  return request<{ schema: Schema }>('GET', orgPath(`/schemas/${schemaId}`));
}

export async function createSchema(data: {
  name: string;
  description?: string;
  jsonSchema: Record<string, unknown>;
}): Promise<ApiResponse<{ schema: Schema }>> {
  return request<{ schema: Schema }>('POST', orgPath('/schemas'), data);
}

export async function updateSchema(
  schemaId: string,
  data: {
    name?: string;
    description?: string | null;
    jsonSchema?: Record<string, unknown>;
  }
): Promise<ApiResponse<{ success: boolean }>> {
  return request<{ success: boolean }>('PUT', orgPath(`/schemas/${schemaId}`), data);
}

export async function deleteSchema(schemaId: string): Promise<ApiResponse<{ success: boolean }>> {
  return request<{ success: boolean }>('DELETE', orgPath(`/schemas/${schemaId}`));
}

export async function validateAgainstSchema(
  schemaId: string,
  payload: unknown
): Promise<ApiResponse<{ valid: boolean; errors?: unknown[] }>> {
  return request<{ valid: boolean; errors?: unknown[] }>(
    'POST',
    orgPath(`/schemas/${schemaId}/validate`),
    { payload: payload as Record<string, unknown> }
  );
}

// ============================================================================
// Webhook Applications (Outbound)
// ============================================================================

export interface WebhookApplication {
  id: string;
  organizationId: string;
  externalId?: string | null;
  name: string;
  metadata?: Record<string, unknown> | null;
  rateLimitPerSecond?: number;
  rateLimitPerMinute?: number;
  rateLimitPerHour?: number;
  isDisabled: boolean | number;
  disabledAt?: string | null;
  disabledReason?: string | null;
  totalEndpoints?: number;
  totalMessagesSent?: number;
  totalMessagesFailed?: number;
  lastEventAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  endpointCount?: number;
}

export interface WebhookApplicationListResponse {
  data: WebhookApplication[];
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
  };
}

export async function getWebhookApplications(options?: {
  search?: string;
  isDisabled?: boolean;
  limit?: number;
  cursor?: string;
}): Promise<ApiResponse<WebhookApplicationListResponse>> {
  const params = new URLSearchParams();
  if (options?.search) params.set('search', options.search);
  if (options?.isDisabled !== undefined) params.set('isDisabled', String(options.isDisabled));
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.cursor) params.set('cursor', options.cursor);

  const queryString = params.toString();
  return request<WebhookApplicationListResponse>(
    'GET',
    orgPath(`/webhook-applications${queryString ? `?${queryString}` : ''}`)
  );
}

export async function getWebhookApplication(appId: string): Promise<ApiResponse<{ data: WebhookApplication }>> {
  return request<{ data: WebhookApplication }>('GET', orgPath(`/webhook-applications/${appId}`));
}

export async function createWebhookApplication(data: {
  name: string;
  externalId?: string;
  metadata?: Record<string, unknown>;
  rateLimitPerSecond?: number;
  rateLimitPerMinute?: number;
  rateLimitPerHour?: number;
}): Promise<ApiResponse<{ data: WebhookApplication }>> {
  return request<{ data: WebhookApplication }>('POST', orgPath('/webhook-applications'), data);
}

export async function updateWebhookApplication(
  appId: string,
  data: {
    name?: string;
    metadata?: Record<string, unknown>;
    rateLimitPerSecond?: number;
    rateLimitPerMinute?: number;
    rateLimitPerHour?: number;
    isDisabled?: boolean;
    disabledReason?: string;
  }
): Promise<ApiResponse<{ data: WebhookApplication }>> {
  return request<{ data: WebhookApplication }>('PATCH', orgPath(`/webhook-applications/${appId}`), data);
}

export async function deleteWebhookApplication(appId: string): Promise<ApiResponse<{ success: boolean }>> {
  return request<{ success: boolean }>('DELETE', orgPath(`/webhook-applications/${appId}`));
}

// ============================================================================
// Webhook Endpoints (Outbound)
// ============================================================================

export interface WebhookEndpoint {
  id: string;
  applicationId: string;
  url: string;
  description?: string | null;
  secretPrefix?: string;
  hasSecret?: boolean;
  secret?: string; // Only returned on creation
  secretVersion?: number;
  headers?: Array<{ name: string; value: string }>;
  timeoutSeconds?: number;
  isDisabled: boolean | number;
  disabledAt?: string | null;
  disabledReason?: string | null;
  circuitState?: 'closed' | 'open' | 'half_open';
  circuitOpenedAt?: string | null;
  circuitFailureCount?: number;
  circuitFailureThreshold?: number;
  circuitSuccessThreshold?: number;
  circuitCooldownSeconds?: number;
  totalMessages?: number;
  totalSuccesses?: number;
  totalFailures?: number;
  avgResponseTimeMs?: number;
  lastSuccessAt?: string | null;
  lastFailureAt?: string | null;
  lastResponseStatus?: number | null;
  isVerified?: boolean | number;
  verifiedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  subscriptionCount?: number;
}

export interface WebhookEndpointListResponse {
  data: WebhookEndpoint[];
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
  };
}

export async function getWebhookEndpoints(options?: {
  applicationId?: string;
  isDisabled?: boolean;
  circuitState?: 'closed' | 'open' | 'half_open';
  limit?: number;
  cursor?: string;
}): Promise<ApiResponse<WebhookEndpointListResponse>> {
  const params = new URLSearchParams();
  if (options?.applicationId) params.set('applicationId', options.applicationId);
  if (options?.isDisabled !== undefined) params.set('isDisabled', String(options.isDisabled));
  if (options?.circuitState) params.set('circuitState', options.circuitState);
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.cursor) params.set('cursor', options.cursor);

  const queryString = params.toString();
  return request<WebhookEndpointListResponse>(
    'GET',
    orgPath(`/webhook-endpoints${queryString ? `?${queryString}` : ''}`)
  );
}

export async function getWebhookEndpoint(endpointId: string): Promise<ApiResponse<{ data: WebhookEndpoint }>> {
  return request<{ data: WebhookEndpoint }>('GET', orgPath(`/webhook-endpoints/${endpointId}`));
}

export async function createWebhookEndpoint(data: {
  applicationId: string;
  url: string;
  description?: string;
  headers?: Array<{ name: string; value: string }>;
  timeoutSeconds?: number;
  circuitFailureThreshold?: number;
  circuitSuccessThreshold?: number;
  circuitCooldownSeconds?: number;
}): Promise<ApiResponse<{ data: WebhookEndpoint; warning: string }>> {
  return request<{ data: WebhookEndpoint; warning: string }>('POST', orgPath('/webhook-endpoints'), data);
}

export async function updateWebhookEndpoint(
  endpointId: string,
  data: {
    url?: string;
    description?: string | null;
    headers?: Array<{ name: string; value: string }>;
    timeoutSeconds?: number;
    isDisabled?: boolean;
    disabledReason?: string;
    circuitFailureThreshold?: number;
    circuitSuccessThreshold?: number;
    circuitCooldownSeconds?: number;
  }
): Promise<ApiResponse<{ data: WebhookEndpoint }>> {
  return request<{ data: WebhookEndpoint }>('PATCH', orgPath(`/webhook-endpoints/${endpointId}`), data);
}

export async function deleteWebhookEndpoint(endpointId: string): Promise<ApiResponse<{ success: boolean }>> {
  return request<{ success: boolean }>('DELETE', orgPath(`/webhook-endpoints/${endpointId}`));
}

export async function rotateWebhookEndpointSecret(
  endpointId: string,
  gracePeriodSeconds?: number
): Promise<ApiResponse<{ secret: string; previousSecretExpiresAt: string; secretVersion: number }>> {
  return request<{ secret: string; previousSecretExpiresAt: string; secretVersion: number }>(
    'POST',
    orgPath(`/webhook-endpoints/${endpointId}/rotate-secret`),
    gracePeriodSeconds !== undefined ? { gracePeriodSeconds } : {}
  );
}

export async function resetWebhookEndpointCircuit(
  endpointId: string
): Promise<ApiResponse<{ success: boolean; circuitState: string }>> {
  return request<{ success: boolean; circuitState: string }>(
    'POST',
    orgPath(`/webhook-endpoints/${endpointId}/reset-circuit`)
  );
}

// ============================================================================
// Webhook Subscriptions (Outbound)
// ============================================================================

export interface WebhookSubscription {
  id: string;
  endpointId: string;
  eventTypeId: string;
  filterExpression?: string | null;
  labelFilters?: string | null;
  labelFilterMode?: 'all' | 'any' | null;
  transformId?: string | null;
  isEnabled: boolean | number;
  createdAt?: string;
  createdBy?: string | null;
  // Related data (when joined)
  endpointUrl?: string;
  eventTypeName?: string;
  eventTypeDisplayName?: string;
  applicationId?: string;
  applicationName?: string;
  endpoint?: { id: string; url: string };
  eventType?: { id: string; name: string; displayName?: string | null };
  application?: { id: string; name: string };
}

export interface WebhookSubscriptionListResponse {
  data: WebhookSubscription[];
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
  };
}

export async function getWebhookSubscriptions(options?: {
  endpointId?: string;
  eventTypeId?: string;
  applicationId?: string;
  isEnabled?: boolean;
  limit?: number;
  cursor?: string;
}): Promise<ApiResponse<WebhookSubscriptionListResponse>> {
  const params = new URLSearchParams();
  if (options?.endpointId) params.set('endpointId', options.endpointId);
  if (options?.eventTypeId) params.set('eventTypeId', options.eventTypeId);
  if (options?.applicationId) params.set('applicationId', options.applicationId);
  if (options?.isEnabled !== undefined) params.set('isEnabled', String(options.isEnabled));
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.cursor) params.set('cursor', options.cursor);

  const queryString = params.toString();
  return request<WebhookSubscriptionListResponse>(
    'GET',
    orgPath(`/webhook-subscriptions${queryString ? `?${queryString}` : ''}`)
  );
}

export async function getWebhookSubscription(
  subscriptionId: string
): Promise<ApiResponse<{ data: WebhookSubscription }>> {
  return request<{ data: WebhookSubscription }>('GET', orgPath(`/webhook-subscriptions/${subscriptionId}`));
}

export async function createWebhookSubscription(data: {
  endpointId: string;
  eventTypeId: string;
  filterExpression?: string;
  labelFilters?: Record<string, string | string[]>;
  labelFilterMode?: 'all' | 'any';
  transformId?: string;
  isEnabled?: boolean;
}): Promise<ApiResponse<{ data: WebhookSubscription }>> {
  return request<{ data: WebhookSubscription }>('POST', orgPath('/webhook-subscriptions'), data);
}

export async function updateWebhookSubscription(
  subscriptionId: string,
  data: {
    filterExpression?: string | null;
    labelFilters?: Record<string, string | string[]> | null;
    labelFilterMode?: 'all' | 'any' | null;
    transformId?: string | null;
    isEnabled?: boolean;
  }
): Promise<ApiResponse<{ data: WebhookSubscription }>> {
  return request<{ data: WebhookSubscription }>('PATCH', orgPath(`/webhook-subscriptions/${subscriptionId}`), data);
}

export async function deleteWebhookSubscription(subscriptionId: string): Promise<ApiResponse<{ success: boolean }>> {
  return request<{ success: boolean }>('DELETE', orgPath(`/webhook-subscriptions/${subscriptionId}`));
}

// ============================================================================
// Event Types (Outbound)
// ============================================================================

export interface EventType {
  id: string;
  organizationId: string;
  name: string;
  displayName?: string | null;
  description?: string | null;
  category?: string | null;
  schema?: string | null;
  schemaVersion?: number;
  examplePayload?: string | null;
  documentationUrl?: string | null;
  isEnabled: boolean | number;
  isDeprecated?: boolean | number;
  deprecatedAt?: string | null;
  deprecatedMessage?: string | null;
  createdAt?: string;
  updatedAt?: string;
  subscriptionCount?: number;
}

export interface EventTypeListResponse {
  data: EventType[];
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
  };
}

export async function getEventTypes(options?: {
  category?: string;
  isEnabled?: boolean;
  search?: string;
  limit?: number;
  cursor?: string;
}): Promise<ApiResponse<EventTypeListResponse>> {
  const params = new URLSearchParams();
  if (options?.category) params.set('category', options.category);
  if (options?.isEnabled !== undefined) params.set('isEnabled', String(options.isEnabled));
  if (options?.search) params.set('search', options.search);
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.cursor) params.set('cursor', options.cursor);

  const queryString = params.toString();
  return request<EventTypeListResponse>(
    'GET',
    orgPath(`/event-types${queryString ? `?${queryString}` : ''}`)
  );
}

export async function getEventType(eventTypeId: string): Promise<ApiResponse<{ data: EventType }>> {
  return request<{ data: EventType }>('GET', orgPath(`/event-types/${eventTypeId}`));
}

export async function createEventType(data: {
  name: string;
  displayName?: string;
  description?: string;
  category?: string;
  schema?: string;
  examplePayload?: string;
  documentationUrl?: string;
  isEnabled?: boolean;
}): Promise<ApiResponse<{ data: EventType }>> {
  return request<{ data: EventType }>('POST', orgPath('/event-types'), data);
}

export async function updateEventType(
  eventTypeId: string,
  data: {
    displayName?: string;
    description?: string;
    category?: string | null;
    schema?: string | null;
    examplePayload?: string | null;
    documentationUrl?: string | null;
    isEnabled?: boolean;
    isDeprecated?: boolean;
    deprecatedMessage?: string;
  }
): Promise<ApiResponse<{ data: EventType }>> {
  return request<{ data: EventType }>('PATCH', orgPath(`/event-types/${eventTypeId}`), data);
}

export async function deleteEventType(eventTypeId: string): Promise<ApiResponse<{ success: boolean }>> {
  return request<{ success: boolean }>('DELETE', orgPath(`/event-types/${eventTypeId}`));
}

// ============================================================================
// Send Event (Outbound)
// ============================================================================

export interface SendEventResult {
  eventId: string;
  messagesQueued: number;
  endpoints: Array<{ id: string; url: string }>;
}

export async function sendOutboundEvent(data: {
  eventType: string;
  payload: unknown;
  applicationId?: string;
  endpointId?: string;
  idempotencyKey?: string;
  labels?: Record<string, string>;
  metadata?: Record<string, unknown>;
}): Promise<ApiResponse<{ data: SendEventResult }>> {
  return request<{ data: SendEventResult }>('POST', orgPath('/send-event'), data);
}

// ============================================================================
// Outbound Messages
// ============================================================================

export interface OutboundMessage {
  id: string;
  eventId: string;
  eventType: string;
  applicationId: string;
  endpointId: string;
  status: 'pending' | 'processing' | 'success' | 'failed' | 'exhausted';
  attempts: number;
  maxAttempts: number;
  lastResponseStatus?: number | null;
  lastErrorMessage?: string | null;
  createdAt: string;
  completedAt?: string | null;
  endpointUrl?: string;
  endpointDescription?: string;
  applicationName?: string;
}

export interface OutboundAttempt {
  id: string;
  messageId: string;
  attemptNumber: number;
  status: 'success' | 'failed';
  responseStatus?: number | null;
  responseTimeMs?: number | null;
  responseBody?: string | null;
  errorMessage?: string | null;
  createdAt: string;
}

export interface OutboundMessageListResponse {
  data: OutboundMessage[];
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
  };
}

export interface OutboundStats {
  pending: number;
  processing: number;
  success: number;
  failed: number;
  exhausted: number;
  total: number;
}

export async function getOutboundMessages(options?: {
  status?: 'pending' | 'processing' | 'success' | 'failed' | 'exhausted';
  eventType?: string;
  applicationId?: string;
  endpointId?: string;
  limit?: number;
  cursor?: string;
}): Promise<ApiResponse<OutboundMessageListResponse>> {
  const params = new URLSearchParams();
  if (options?.status) params.set('status', options.status);
  if (options?.eventType) params.set('eventType', options.eventType);
  if (options?.applicationId) params.set('applicationId', options.applicationId);
  if (options?.endpointId) params.set('endpointId', options.endpointId);
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.cursor) params.set('cursor', options.cursor);

  const queryString = params.toString();
  return request<OutboundMessageListResponse>(
    'GET',
    orgPath(`/outbound-messages${queryString ? `?${queryString}` : ''}`)
  );
}

export async function getOutboundMessage(messageId: string): Promise<ApiResponse<{ data: OutboundMessage }>> {
  return request<{ data: OutboundMessage }>('GET', orgPath(`/outbound-messages/${messageId}`));
}

export async function getOutboundMessageAttempts(messageId: string): Promise<ApiResponse<{ data: OutboundAttempt[] }>> {
  return request<{ data: OutboundAttempt[] }>('GET', orgPath(`/outbound-messages/${messageId}/attempts`));
}

export async function replayOutboundMessage(
  messageId: string
): Promise<ApiResponse<{ data: { originalMessageId: string; newMessageId: string; status: string } }>> {
  return request<{ data: { originalMessageId: string; newMessageId: string; status: string } }>(
    'POST',
    orgPath(`/outbound-messages/${messageId}/replay`)
  );
}

export async function getOutboundStats(): Promise<ApiResponse<{ data: OutboundStats }>> {
  return request<{ data: OutboundStats }>('GET', orgPath('/outbound-messages/stats/summary'));
}

// ============================================================================
// Audit logs (read-only)
// ============================================================================

export interface AuditLogEntry {
  id: string;
  organizationId: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  details: unknown;
  ipAddress: string | null;
  createdAt: string;
  userName: string | null;
  userEmail: string | null;
}

export async function getAuditLogs(options?: {
  limit?: number;
  offset?: number;
  action?: string;
  entityType?: string;
  userId?: string;
}): Promise<ApiResponse<{ logs: AuditLogEntry[]; total: number; limit: number; offset: number }>> {
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.offset) params.set('offset', String(options.offset));
  if (options?.action) params.set('action', options.action);
  if (options?.entityType) params.set('entityType', options.entityType);
  if (options?.userId) params.set('userId', options.userId);
  const qs = params.toString();
  return request('GET', orgPath(`/audit-logs${qs ? `?${qs}` : ''}`));
}

export async function getAuditLogActions(): Promise<ApiResponse<{ actions: string[] }>> {
  return request('GET', orgPath('/audit-logs/actions'));
}

export async function getAuditLogUsers(): Promise<
  ApiResponse<{ users: Array<{ id: string; name: string; email: string }> }>
> {
  return request('GET', orgPath('/audit-logs/users'));
}

// ============================================================================
// API keys
// ============================================================================

export type ApiKeyScope = 'read' | 'write' | 'delete';

export interface ApiKeySummary {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: ApiKeyScope[];
  expiresAt: string | null;
  lastUsedAt?: string | null;
  createdAt?: string;
}

export async function getApiKeys(): Promise<ApiResponse<{ apiKeys: ApiKeySummary[] }>> {
  return request('GET', orgPath('/api-keys'));
}

export async function createApiKey(data: {
  name: string;
  scopes?: ApiKeyScope[];
  expiresIn?: number;
}): Promise<ApiResponse<{ apiKey: ApiKeySummary & { key: string } }>> {
  return request('POST', orgPath('/api-keys'), data as unknown as Record<string, unknown>);
}

export async function deleteApiKey(keyId: string): Promise<ApiResponse<{ success: boolean }>> {
  return request('DELETE', orgPath(`/api-keys/${keyId}`));
}

// ============================================================================
// Redaction policies
// ============================================================================

export type RedactionMatchType = 'path' | 'field_name' | 'regex_value' | 'header';
export type RedactionActionType = 'redact' | 'mask' | 'hash' | 'remove';
export type RedactionScope = 'storage' | 'delivery' | 'both';

export interface RedactionRule {
  match: { type: RedactionMatchType; value: string; flags?: string };
  action: { type: RedactionActionType; keepLastN?: number };
}

export interface RedactionPolicy {
  id: string;
  organizationId: string;
  sourceId: string | null;
  name: string;
  rules: RedactionRule[];
  scope: RedactionScope;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function getRedactionPolicies(
  sourceId?: string
): Promise<ApiResponse<{ policies: RedactionPolicy[] }>> {
  const qs = sourceId ? `?sourceId=${encodeURIComponent(sourceId)}` : '';
  return request('GET', orgPath(`/redaction-policies${qs}`));
}

export async function getRedactionPolicy(
  policyId: string
): Promise<ApiResponse<{ policy: RedactionPolicy }>> {
  return request('GET', orgPath(`/redaction-policies/${policyId}`));
}

export async function createRedactionPolicy(data: {
  name: string;
  sourceId?: string | null;
  rules: RedactionRule[];
  scope?: RedactionScope;
}): Promise<ApiResponse<{ id: string }>> {
  return request('POST', orgPath('/redaction-policies'), data as unknown as Record<string, unknown>);
}

export async function updateRedactionPolicy(
  policyId: string,
  data: {
    name: string;
    sourceId?: string | null;
    rules: RedactionRule[];
    scope: RedactionScope;
    isActive: boolean;
  }
): Promise<ApiResponse<{ success: boolean }>> {
  return request('PUT', orgPath(`/redaction-policies/${policyId}`), data as unknown as Record<string, unknown>);
}

export async function deleteRedactionPolicy(
  policyId: string
): Promise<ApiResponse<{ success: boolean }>> {
  return request('DELETE', orgPath(`/redaction-policies/${policyId}`));
}

export async function previewRedactionPolicy(data: {
  rules: RedactionRule[];
  payload: unknown;
  headers?: Record<string, string>;
}): Promise<ApiResponse<{ payload: unknown; headers: Record<string, string>; redactionCount: number; fired: boolean }>> {
  return request('POST', orgPath('/redaction-policies/preview'), data as unknown as Record<string, unknown>);
}

// ============================================================================
// Scheduled sends
// ============================================================================

export type ScheduledSendStatus =
  | 'pending'
  | 'sending'
  | 'sent'
  | 'failed'
  | 'cancelled';

export interface ScheduledSend {
  id: string;
  organization_id: string;
  name: string | null;
  description: string | null;
  url: string;
  method: string;
  headers: unknown;
  payload: unknown;
  scheduled_for: string;
  timezone: string;
  status: ScheduledSendStatus;
  attempts: number;
  max_attempts: number;
  response_status: number | null;
  response_body: string | null;
  latency_ms: number | null;
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export async function getScheduledSends(options?: {
  status?: ScheduledSendStatus;
  page?: number;
  pageSize?: number;
}): Promise<ApiResponse<{ scheduledSends: ScheduledSend[]; pagination: { total: number; page: number; pageSize: number } }>> {
  const params = new URLSearchParams();
  if (options?.status) params.set('status', options.status);
  if (options?.page) params.set('page', String(options.page));
  if (options?.pageSize) params.set('pageSize', String(options.pageSize));
  const qs = params.toString();
  return request('GET', orgPath(`/scheduled-sends${qs ? `?${qs}` : ''}`));
}

export async function getScheduledSend(id: string): Promise<ApiResponse<{ scheduledSend: ScheduledSend }>> {
  return request('GET', orgPath(`/scheduled-sends/${id}`));
}

export async function createScheduledSend(data: {
  name?: string;
  description?: string;
  url: string;
  method?: string;
  headers?: Record<string, string>;
  payload?: unknown;
  scheduledFor: string;
  timezone?: string;
  maxAttempts?: number;
}): Promise<ApiResponse<{ scheduledSend: ScheduledSend }>> {
  return request('POST', orgPath('/scheduled-sends'), data as unknown as Record<string, unknown>);
}

export async function updateScheduledSend(
  id: string,
  data: Partial<{
    name: string;
    description: string;
    url: string;
    method: string;
    headers: Record<string, string>;
    payload: unknown;
    scheduledFor: string;
    timezone: string;
    maxAttempts: number;
  }>
): Promise<ApiResponse<{ scheduledSend: ScheduledSend }>> {
  return request('PATCH', orgPath(`/scheduled-sends/${id}`), data as unknown as Record<string, unknown>);
}

export async function cancelScheduledSend(id: string): Promise<ApiResponse<{ success: boolean }>> {
  return request('DELETE', orgPath(`/scheduled-sends/${id}`));
}

export async function sendScheduledSendNow(
  id: string
): Promise<ApiResponse<{ success: boolean; responseStatus?: number; latencyMs?: number; error?: string }>> {
  return request('POST', orgPath(`/scheduled-sends/${id}/send-now`));
}

// ============================================================================
// Outbound webhook analytics
// ============================================================================

export type WebhookAnalyticsTimeRange = '1h' | '24h' | '7d' | '30d';

export async function getWebhookAnalytics(options?: {
  timeRange?: WebhookAnalyticsTimeRange;
  applicationId?: string;
  endpointId?: string;
}): Promise<ApiResponse<{ data: unknown }>> {
  const params = new URLSearchParams();
  if (options?.timeRange) params.set('timeRange', options.timeRange);
  if (options?.applicationId) params.set('applicationId', options.applicationId);
  if (options?.endpointId) params.set('endpointId', options.endpointId);
  const qs = params.toString();
  return request('GET', orgPath(`/webhooks/analytics${qs ? `?${qs}` : ''}`));
}

export async function getWebhookEndpointAnalytics(
  endpointId: string,
  timeRange?: WebhookAnalyticsTimeRange
): Promise<ApiResponse<{ data: unknown }>> {
  const qs = timeRange ? `?timeRange=${encodeURIComponent(timeRange)}` : '';
  return request('GET', orgPath(`/webhooks/analytics/endpoints/${endpointId}${qs}`));
}

// ============================================================================
// Test webhook bins (unauthenticated, not org-scoped)
// ============================================================================

export interface BinSummary {
  id: string;
  url: string;
  expiresAt: string;
}

export interface BinDetail {
  id: string;
  url: string;
  eventCount: number;
  maxEvents: number;
  createdAt: string;
  expiresAt: string;
  lastEventAt: string | null;
  responseStatus: number;
  responseHeaders: string | null;
  responseBody: string | null;
}

export interface BinEventSummary {
  id: string;
  method: string;
  urlPath: string | null;
  queryString: string | null;
  contentType: string | null;
  contentLength: number | null;
  ipAddress: string | null;
  payloadHash: string | null;
  receivedAt: string;
  bodyPreview: string | null;
}

export interface BinEventDetail extends BinEventSummary {
  headers: Record<string, string>;
  body: string | null;
  payloadKey: string | null;
}

export async function createBin(): Promise<ApiResponse<BinSummary>> {
  return request('POST', '/api/bin');
}

export async function getBin(
  binId: string
): Promise<ApiResponse<{ bin: BinDetail; events: BinEventSummary[] }>> {
  return request('GET', `/api/bin/${binId}`);
}

export async function getBinEvents(
  binId: string,
  options?: { limit?: number; offset?: number }
): Promise<ApiResponse<{ events: BinEventSummary[]; total: number }>> {
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.offset) params.set('offset', String(options.offset));
  const qs = params.toString();
  return request('GET', `/api/bin/${binId}/events${qs ? `?${qs}` : ''}`);
}

export async function getBinEvent(
  binId: string,
  eventId: string
): Promise<ApiResponse<BinEventDetail>> {
  return request('GET', `/api/bin/${binId}/events/${eventId}`);
}

export async function updateBinResponse(
  binId: string,
  data: { statusCode?: number; headers?: Record<string, string>; body?: string }
): Promise<ApiResponse<{ ok: boolean; statusCode: number; headers: Record<string, string> | null; body: string | null }>> {
  return request('PATCH', `/api/bin/${binId}/response`, data as unknown as Record<string, unknown>);
}
