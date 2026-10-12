import { describe, it, expect } from 'vitest';
import { buildArdManifest } from '../src/well-known/ard.js';
import { buildRobotsTxt, buildSitemapXml } from '../src/well-known/crawl.js';
import {
  buildLandingMarkdown,
  buildLandingPage,
  buildLinkHeader,
  buildRootInfo,
  negotiateRootFormat,
} from '../src/well-known/landing.js';
import { mirrorDiscoveryDoc } from '../src/well-known/mirror.js';
import { agentCardSkills } from '../src/a2a/skills.js';

const ORIGIN = 'https://mcp.hookbase.app';

describe('buildArdManifest', () => {
  const skillIds = agentCardSkills().map((s) => s.id);
  const manifest = buildArdManifest(ORIGIN, '2.10.0', skillIds);

  it('gives every entry the terms ARD requires, with exactly one of url/data', () => {
    for (const entry of manifest.entries) {
      expect(entry.identifier).toMatch(/^urn:air:[a-zA-Z0-9.-]+(:[a-zA-Z0-9._-]+)+$/);
      expect(entry.displayName.length).toBeGreaterThan(0);
      expect(entry.type).toMatch(/^application\/[a-z0-9.+-]+$/);
      expect(entry.url).toMatch(/^https:\/\//);
      expect(entry).not.toHaveProperty('data');
      expect(entry.representativeQueries.length).toBeGreaterThanOrEqual(2);
      expect(entry.representativeQueries.length).toBeLessThanOrEqual(5);
    }
  });

  it('carries the AI Catalog 1.0 envelope that ai-catalog.json consumers validate', () => {
    expect(manifest.specVersion).toBe('1.0');
    expect(manifest.host).toEqual({ identifier: 'hookbase.app', displayName: 'Hookbase' });
  });

  it('anchors identifiers on the hookbase.app publisher domain', () => {
    expect(manifest.entries.map((e) => e.identifier.split(':')[2])).toEqual(['hookbase.app', 'hookbase.app']);
  });

  it('references the cards this Worker serves', () => {
    expect(manifest.entries.map((e) => [e.type, e.url])).toEqual([
      ['application/mcp-server-card+json', 'https://mcp.hookbase.app/mcp/server-card'],
      ['application/a2a-agent-card+json', 'https://mcp.hookbase.app/.well-known/agent-card.json'],
    ]);
  });

  it('lists the agent card skills as the A2A entry capabilities', () => {
    expect(manifest.entries[1].capabilities).toEqual(skillIds);
  });
});

describe('negotiateRootFormat', () => {
  it('keeps JSON for programmatic clients', () => {
    expect(negotiateRootFormat(null)).toBe('json');
    expect(negotiateRootFormat('*/*')).toBe('json');
    expect(negotiateRootFormat('application/json, text/html')).toBe('json');
  });

  it('serves HTML to browsers and Markdown to agents that ask for it', () => {
    expect(negotiateRootFormat('text/html,application/xhtml+xml,*/*;q=0.8')).toBe('html');
    expect(negotiateRootFormat('text/markdown, text/html;q=0.9')).toBe('markdown');
  });
});

describe('landing page', () => {
  it('keeps the existing JSON pointer fields', () => {
    expect(buildRootInfo(ORIGIN)).toMatchObject({
      name: 'Hookbase MCP',
      mcp: 'https://mcp.hookbase.app/mcp',
      mcpServerCard: 'https://mcp.hookbase.app/mcp/server-card',
      a2a: 'https://mcp.hookbase.app/a2a',
      a2aAgentCard: 'https://mcp.hookbase.app/.well-known/agent-card.json',
    });
  });

  it('registers four WebMCP tools, checking document.modelContext first', () => {
    const html = buildLandingPage(ORIGIN);
    expect(html.match(/^\s*register\(\{$/gm)).toHaveLength(4);
    expect(html).toContain('document.modelContext) || (typeof navigator');
    expect(html).toContain('<link rel="ard" href="/.well-known/ard.json"');
  });

  it('cannot be broken out of the script element by the origin', () => {
    const html = buildLandingPage('https://x</script><script>alert(1)//');
    expect(html.match(/<\/script>/g)).toHaveLength(1);
  });

  it('has a Markdown version carrying the same endpoints', () => {
    const md = buildLandingMarkdown(ORIGIN);
    expect(md.startsWith('# Hookbase MCP\n')).toBe(true);
    expect(md).toContain('https://mcp.hookbase.app/mcp\n');
    expect(md).toContain('](https://mcp.hookbase.app/.well-known/ard.json)');
  });

  it('advertises the API catalog, docs and ARD manifest in the Link header', () => {
    const link = buildLinkHeader();
    for (const rel of ['api-catalog', 'service-doc', 'ard']) expect(link).toContain(`rel="${rel}"`);
  });
});

describe('robots.txt and sitemap.xml', () => {
  it('denies by default and allows only the pages and discovery documents', () => {
    const lines = buildRobotsTxt(ORIGIN).split('\n');
    expect(lines.filter((l) => l.startsWith('Allow: '))).toEqual(['Allow: /$', 'Allow: /.well-known/', 'Allow: /auth.md']);
    expect(lines).toContain('Disallow: /');
    expect(lines).toContain('Content-Signal: ai-train=yes, search=yes, ai-input=yes');
    expect(lines).toContain('Sitemap: https://mcp.hookbase.app/sitemap.xml');
  });

  it('lists the crawlable pages as absolute URLs', () => {
    const locs = [...buildSitemapXml(ORIGIN).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual(['https://mcp.hookbase.app/', 'https://mcp.hookbase.app/auth.md']);
  });
});

describe('mirrorDiscoveryDoc', () => {
  it('returns null when the binding is not configured', async () => {
    expect(await mirrorDiscoveryDoc(undefined, `${ORIGIN}/auth.md`)).toBeNull();
  });

  it('passes the upstream body and headers through, readable from any origin', async () => {
    const binding = {
      fetch: async () => new Response('{"linkset":[]}', { headers: { 'Content-Type': 'application/linkset+json' } }),
    };
    const res = await mirrorDiscoveryDoc(binding, `${ORIGIN}/.well-known/api-catalog`);
    expect(res?.status).toBe(200);
    expect(res?.headers.get('Content-Type')).toBe('application/linkset+json');
    expect(res?.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(await res?.text()).toBe('{"linkset":[]}');
  });

  it('turns an upstream failure or a thrown fetch into a 502', async () => {
    const notFound = { fetch: async () => new Response('nope', { status: 404 }) };
    const throws = { fetch: async () => Promise.reject(new Error('connection lost')) };
    expect((await mirrorDiscoveryDoc(notFound, ORIGIN))?.status).toBe(502);
    expect((await mirrorDiscoveryDoc(throws, ORIGIN))?.status).toBe(502);
  });
});
