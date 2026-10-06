/**
 * Cloudflare Worker entry for the remote (Streamable HTTP) MCP transport.
 *
 * Deploys the same Hookbase tool set the stdio server exposes, reachable over
 * HTTP so hosted MCP clients (Claude connectors, ChatGPT, web clients) can use
 * it with just a URL + `whr_` API key — no local install.
 *
 * Endpoints:
 *   POST /mcp                            — MCP JSON-RPC (and POST /)
 *   GET  /                                — discovery info (see below; POST / still aliases /mcp)
 *   GET  /mcp/server-card                — MCP Server Card (SEP-2127 reserved location)
 *   GET  /.well-known/mcp/server-card.json — same document, unreserved mirror for
 *                                            discovery tooling that looks under .well-known
 *   GET  /.well-known/agent-card.json     — A2A Agent Card
 *   POST /a2a                            — A2A JSON-RPC
 *   GET  /health                         — liveness probe
 *   GET  /.well-known/ard.json            — ARD manifest (also at /.well-known/ai-catalog.json)
 *   GET  /robots.txt, /sitemap.xml        — crawler policy
 *   GET  /.well-known/api-catalog, /auth.md, /.well-known/http-message-signatures-directory
 *                                        — republished from the API Worker (API binding)
 *   GET  /.well-known/agent-skills/index.json — republished from the website Worker (FRONTEND)
 */

import { handleMcpRequest } from './http/handler.js';
import { handleA2aRequest } from './a2a/handler.js';
import { buildAgentCard } from './a2a/agent-card.js';
import { agentCardSkills } from './a2a/skills.js';
import { buildServerCard } from './well-known/server-card.js';
import { buildArdManifest } from './well-known/ard.js';
import { buildRobotsTxt, buildSitemapXml } from './well-known/crawl.js';
import {
  buildLandingMarkdown,
  buildLandingPage,
  buildLinkHeader,
  buildRootInfo,
  negotiateRootFormat,
} from './well-known/landing.js';
import { mirrorDiscoveryDoc, type ServiceBinding } from './well-known/mirror.js';
import pkg from '../package.json' with { type: 'json' };

interface Env {
  /** Base URL of the Hookbase REST API the tools call. */
  HOOKBASE_API_URL?: string;
  /** Service binding to the API Worker (apihookbaseapp). */
  API?: ServiceBinding;
  /** Service binding to the website Worker (wwwhookbaseapp). */
  FRONTEND?: ServiceBinding;
}

// Documents republished from another Worker, by path. The Web Bot Auth directory is fetched with
// this host's own URL so the API Worker signs it for this host; its signature covers @authority.
const MIRRORED: Record<string, 'API' | 'FRONTEND'> = {
  '/.well-known/api-catalog': 'API',
  '/auth.md': 'API',
  '/.well-known/http-message-signatures-directory': 'API',
  '/.well-known/agent-skills/index.json': 'FRONTEND',
};

const PUBLIC_CACHE = 'public, max-age=86400';

const SERVER_CARD_HEADERS: Record<string, string> = {
  'Content-Type': 'application/mcp-server-card+json',
  'Cache-Control': 'public, max-age=3600',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET',
  'Access-Control-Allow-Headers': 'Content-Type, If-None-Match',
  'Access-Control-Expose-Headers': 'ETag',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const apiUrl = env.HOOKBASE_API_URL || 'https://api.hookbase.app';

    if (url.pathname === '/health') {
      return new Response('ok', { headers: { 'Content-Type': 'text/plain' } });
    }
    // A bare 404/405 at "/" trips up crawlers/scanners that gate their whole run on the root
    // URL responding before checking anything under /.well-known/* (mirrors the same fix in
    // api/'s src/index.ts). POST / keeps working as an MCP JSON-RPC alias for /mcp either way.
    if (url.pathname === '/' && request.method === 'GET') {
      const origin = `https://${url.host}`;
      const format = negotiateRootFormat(request.headers.get('Accept'));
      const headers: Record<string, string> = { Vary: 'Accept', Link: buildLinkHeader() };
      if (format === 'html') {
        return new Response(buildLandingPage(origin), { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
      }
      if (format === 'markdown') {
        return new Response(buildLandingMarkdown(origin), {
          headers: { ...headers, 'Content-Type': 'text/markdown; charset=utf-8' },
        });
      }
      return new Response(JSON.stringify(buildRootInfo(origin)), {
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }
    if (request.method === 'GET' && Object.hasOwn(MIRRORED, url.pathname)) {
      const res = await mirrorDiscoveryDoc(env[MIRRORED[url.pathname]], url.toString());
      return res ?? new Response('Not found', { status: 404 });
    }
    if (url.pathname === '/.well-known/ard.json' || url.pathname === '/.well-known/ai-catalog.json') {
      const skillIds = agentCardSkills().map((skill) => skill.id);
      const manifest = buildArdManifest(`https://${url.host}`, pkg.version, skillIds);
      return new Response(JSON.stringify(manifest, null, 2), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*' },
      });
    }
    if (url.pathname === '/robots.txt') {
      return new Response(buildRobotsTxt(`https://${url.host}`), {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': PUBLIC_CACHE },
      });
    }
    if (url.pathname === '/sitemap.xml') {
      return new Response(buildSitemapXml(`https://${url.host}`), {
        headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': PUBLIC_CACHE },
      });
    }
    if (url.pathname === '/' || url.pathname === '/mcp') {
      return handleMcpRequest(request, apiUrl);
    }
    if (url.pathname === '/mcp/server-card' || url.pathname === '/.well-known/mcp/server-card.json') {
      const card = buildServerCard(`https://${url.host}`, pkg.version);
      return new Response(JSON.stringify(card, null, 2), { headers: SERVER_CARD_HEADERS });
    }
    if (url.pathname === '/.well-known/agent-card.json') {
      const card = buildAgentCard(`https://${url.host}`, pkg.version, agentCardSkills());
      return new Response(JSON.stringify(card, null, 2), { headers: { 'Content-Type': 'application/json' } });
    }
    if (url.pathname === '/a2a') {
      return handleA2aRequest(request, apiUrl);
    }
    return new Response('Not found', { status: 404 });
  },
};
