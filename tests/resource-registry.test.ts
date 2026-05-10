import { describe, it, expect } from 'vitest';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { hookbaseResources } from '../src/resources/index.js';

describe('resource registry', () => {
  it('every resource has a unique hookbase_ prefixed name', () => {
    const names = hookbaseResources.map(r => r.name);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    expect(dupes).toEqual([]);
    for (const name of names) {
      expect(name).toMatch(/^hookbase_/);
    }
  });

  it('every resource exposes a hookbase:// URI template', () => {
    for (const resource of hookbaseResources) {
      expect(resource.template).toBeInstanceOf(ResourceTemplate);
      expect(resource.template.uriTemplate.toString()).toMatch(/^hookbase:\/\//);
    }
  });

  it('every resource has a non-empty description', () => {
    for (const resource of hookbaseResources) {
      expect(resource.metadata.description?.length ?? 0).toBeGreaterThan(10);
    }
  });
});
