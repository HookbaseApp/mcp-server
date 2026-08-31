import { describe, it, expect } from 'vitest';
import { buildAgentCard } from '../src/a2a/agent-card.js';
import { agentCardSkills, a2aSkillById } from '../src/a2a/skills.js';

describe('buildAgentCard', () => {
  const card = buildAgentCard('https://mcp.hookbase.app', '2.7.1', agentCardSkills());

  it('has every required top-level field', () => {
    expect(card.name).toBe('Hookbase');
    expect(card.description).toBeTruthy();
    expect(card.version).toBe('2.7.1');
    expect(Array.isArray(card.supportedInterfaces)).toBe(true);
    expect(card.capabilities).toBeTypeOf('object');
    expect(card.defaultInputModes).toContain('application/json');
    expect(card.defaultOutputModes).toContain('application/json');
    expect(Array.isArray(card.skills)).toBe(true);
  });

  it('points supportedInterfaces at the /a2a JSON-RPC endpoint', () => {
    expect(card.supportedInterfaces).toHaveLength(1);
    expect(card.supportedInterfaces[0]).toEqual({
      url: 'https://mcp.hookbase.app/a2a',
      protocolBinding: 'JSONRPC',
      protocolVersion: '1.0',
    });
  });

  it('declares no streaming/push-notification capability (Message-only agent)', () => {
    expect(card.capabilities.streaming).toBe(false);
    expect(card.capabilities.pushNotifications).toBe(false);
  });

  it('describes the bearer API key as a security requirement', () => {
    const schemeNames = Object.keys(card.securitySchemes);
    expect(schemeNames.length).toBeGreaterThan(0);
    for (const name of schemeNames) {
      const scheme = card.securitySchemes[name] as { httpAuthSecurityScheme?: { scheme: string } };
      expect(scheme.httpAuthSecurityScheme?.scheme).toBe('Bearer');
    }
    expect(card.securityRequirements).toHaveLength(1);
    const requiredSchemes = Object.keys(card.securityRequirements[0].schemes);
    expect(requiredSchemes).toEqual(schemeNames);
  });

  it('advertises exactly the 3 baseline read-only skills', () => {
    expect(card.skills).toHaveLength(3);
    for (const skill of card.skills) {
      expect(a2aSkillById.has(skill.id), `${skill.id} missing from a2aSkillById`).toBe(true);
      expect(skill.name).toBeTruthy();
      expect(skill.description).toBeTruthy();
      expect(skill.tags.length).toBeGreaterThan(0);
    }
  });
});
