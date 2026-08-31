import { describe, it, expect } from 'vitest';
import { buildServerCard } from '../src/well-known/server-card.js';

describe('buildServerCard', () => {
  const card = buildServerCard('https://mcp.hookbase.app', '2.7.1');

  it('has every required top-level field', () => {
    expect(card.$schema).toBe('https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json');
    expect(card.version).toBe('2.7.1');
    expect(card.description.length).toBeGreaterThan(0);
    expect(card.description.length).toBeLessThanOrEqual(100);
  });

  it('uses a reverse-DNS name with exactly one slash', () => {
    expect(card.name).toMatch(/^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/);
    expect(card.name.split('/')).toHaveLength(2);
  });

  it('points remotes at the /mcp Streamable HTTP endpoint', () => {
    expect(card.remotes).toHaveLength(1);
    expect(card.remotes[0]).toEqual({
      type: 'streamable-http',
      url: 'https://mcp.hookbase.app/mcp',
      supportedProtocolVersions: expect.arrayContaining(['2025-06-18']),
    });
  });

  it('does not declare primitive capabilities (deliberately excluded by SEP-2127)', () => {
    expect(card).not.toHaveProperty('capabilities');
    expect(card).not.toHaveProperty('serverInfo');
  });
});
