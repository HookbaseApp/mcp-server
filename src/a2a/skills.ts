/**
 * A2A skill registry.
 *
 * Baseline is deliberately read-only: each skill is a thin wrapper over an
 * existing HookbaseTool (src/tools/index.ts) looked up by name, so the schema
 * and handler are never duplicated. Mutating skills (replay, create, delete)
 * are out of scope for this first pass.
 */

import { allTools, type HookbaseTool } from '../tools/index.js';
import type { AgentSkill } from './agent-card.js';

interface A2aSkill {
  id: string;
  name: string;
  description: string;
  tags: string[];
  tool: HookbaseTool;
}

function toolByName(name: string): HookbaseTool {
  const tool = allTools.find((t) => t.name === name);
  if (!tool) throw new Error(`A2A skill references unknown tool: ${name}`);
  return tool;
}

export const a2aSkills: A2aSkill[] = [
  {
    id: 'check-delivery-status',
    name: 'Check delivery status',
    description: 'Get detailed status for one webhook delivery, including response body and error details.',
    tags: ['webhooks', 'deliveries'],
    tool: toolByName('hookbase_get_delivery'),
  },
  {
    id: 'list-recent-deliveries',
    name: 'List recent deliveries',
    description: 'Query recent webhook deliveries with optional filters (destination, status, event).',
    tags: ['webhooks', 'deliveries'],
    tool: toolByName('hookbase_list_deliveries'),
  },
  {
    id: 'list-sources',
    name: 'List sources',
    description: 'List all webhook sources in the organization.',
    tags: ['webhooks', 'sources'],
    tool: toolByName('hookbase_list_sources'),
  },
];

export const a2aSkillById = new Map(a2aSkills.map((s) => [s.id, s]));

export function agentCardSkills(): AgentSkill[] {
  return a2aSkills.map(({ id, name, description, tags }) => ({
    id,
    name,
    description,
    tags,
    inputModes: ['application/json'],
    outputModes: ['application/json'],
  }));
}
