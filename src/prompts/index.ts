/**
 * MCP Prompts for Hookbase
 * Help AI assistants understand how to use Hookbase tools effectively
 */

import { z } from 'zod';

export const hookbasePrompts = [
  {
    name: 'hookbase_overview',
    description: 'Overview of Hookbase capabilities and how to use the MCP tools',
    argsSchema: z.object({}).strict(),
    getPrompt: () => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `# Hookbase MCP Server

Hookbase is a webhook management platform with two main capabilities:

## 1. Inbound Webhooks (Receiving)
Receive webhooks from external services (Stripe, GitHub, etc.) and route them to your destinations.

**Key concepts:**
- **Sources**: Endpoints that receive incoming webhooks (e.g., stripe-webhooks, github-events)
- **Destinations**: Where webhooks are forwarded to (your API endpoints)
- **Routes**: Connect sources to destinations with optional filtering and transformation
- **Events**: Individual webhook requests received
- **Deliveries**: Attempts to forward events to destinations

**Common workflows:**
- Create a source → Create a destination → Create a route connecting them
- Monitor events and deliveries for failures
- Replay failed deliveries

## 2. Outbound Webhooks (Sending)
Send webhooks to your customers' endpoints with built-in retries, signatures, and circuit breakers.

**Key concepts:**
- **Applications**: Represent a customer or integration receiving your webhooks
- **Endpoints**: URLs where webhooks are delivered (belong to an application)
- **Event Types**: Define the kinds of events you send (e.g., order.created, payment.completed)
- **Subscriptions**: Connect endpoints to event types they want to receive
- **Messages**: Individual delivery records tracking success/failure

**Typical setup flow:**
1. Create event types that define your webhook events
2. Create an application for each customer
3. Add endpoints to the application (save the signing secret!)
4. Subscribe endpoints to relevant event types
5. Send events using hookbase_send_event

**Circuit breaker states:**
- \`closed\`: Normal operation, deliveries proceed
- \`open\`: Too many failures, deliveries paused
- \`half_open\`: Testing if endpoint recovered

Use \`hookbase_reset_endpoint_circuit\` to manually reset after fixing issues.

## Tool Naming Convention
All tools use \`hookbase_verb_noun\` format:
- \`hookbase_list_*\` - List resources
- \`hookbase_get_*\` - Get single resource details
- \`hookbase_create_*\` - Create new resource
- \`hookbase_update_*\` - Update existing resource
- \`hookbase_delete_*\` - Delete resource`,
          },
        },
      ],
    }),
  },
  {
    name: 'outbound_webhook_setup',
    description: 'Step-by-step guide to set up outbound webhooks for a new customer',
    argsSchema: z.object({
      customer_name: z.string().describe('Name of the customer to set up webhooks for'),
      webhook_url: z.string().describe("The customer's webhook endpoint URL"),
      event_types: z.string().optional().describe('Comma-separated list of event types to subscribe (e.g., order.created,payment.completed)'),
    }).strict(),
    getPrompt: (args: { customer_name: string; webhook_url: string; event_types?: string }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Set up outbound webhooks for a customer with these details:

Customer: ${args.customer_name}
Webhook URL: ${args.webhook_url}
Event types: ${args.event_types || '[all available event types]'}

Follow these steps:
1. First, check if the required event types exist using hookbase_list_event_types
2. Create any missing event types using hookbase_create_event_type
3. Create a webhook application using hookbase_create_application
4. Create an endpoint using hookbase_create_endpoint (IMPORTANT: Save the signing secret!)
5. Create subscriptions for each event type using hookbase_create_subscription

After setup, provide the customer with:
- Their signing secret (from endpoint creation)
- The event types they're subscribed to
- Instructions to verify webhook signatures`,
          },
        },
      ],
    }),
  },
  {
    name: 'debug_failed_deliveries',
    description: 'Guide to diagnose and fix failed webhook deliveries',
    argsSchema: z.object({
      direction: z.enum(['inbound', 'outbound', 'both']).optional().describe('Which direction to debug'),
    }).strict(),
    getPrompt: (args: { direction?: 'inbound' | 'outbound' | 'both' }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Help me debug failed webhook deliveries.

Direction: ${args.direction || 'both inbound and outbound'}

## For Inbound Webhooks (receiving):
1. Use hookbase_list_deliveries with status='failed' to find failures
2. Use hookbase_get_delivery to see error details and response
3. Common issues:
   - Destination URL unreachable → Check destination configuration
   - 4xx/5xx responses → Check destination logs
   - Timeout → Increase destination timeout or optimize endpoint
4. Use hookbase_replay_delivery to retry after fixing
5. Use hookbase_bulk_replay to retry multiple failures

## For Outbound Webhooks (sending):
1. Use hookbase_list_outbound_messages with status='failed' or status='exhausted'
2. Use hookbase_get_outbound_message to see error details
3. Use hookbase_get_message_attempts to see all delivery attempts
4. Check circuit breaker: hookbase_get_endpoint to see circuitState
5. Common issues:
   - Circuit breaker open → Use hookbase_reset_endpoint_circuit after fixing
   - Endpoint disabled → Use hookbase_update_endpoint to re-enable
   - URL changed → Update endpoint URL
6. Use hookbase_replay_message to retry failed messages

## Get Statistics:
- Inbound: hookbase_get_analytics
- Outbound: hookbase_get_outbound_stats`,
          },
        },
      ],
    }),
  },
  {
    name: 'send_test_event',
    description: 'Send a test webhook event to verify setup',
    argsSchema: z.object({
      event_type: z.string().describe('Event type name (e.g., order.created)'),
      application_id: z.string().optional().describe('Target specific application (optional)'),
    }).strict(),
    getPrompt: (args: { event_type: string; application_id?: string }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Send a test ${args.event_type} event${args.application_id ? ` to application ${args.application_id}` : ''}.

Use hookbase_send_event with:
- event_type: "${args.event_type}"
- payload: A sample payload appropriate for this event type
${args.application_id ? `- application_id: "${args.application_id}"` : ''}
- idempotency_key: A unique key like "test-${Date.now()}"

After sending:
1. Note the eventId and messagesQueued count
2. Use hookbase_list_outbound_messages to track delivery status
3. If any fail, use hookbase_get_message_attempts to see details`,
          },
        },
      ],
    }),
  },
];
