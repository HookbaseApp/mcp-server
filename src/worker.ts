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
 */

import { handleMcpRequest } from './http/handler.js';
import { handleA2aRequest } from './a2a/handler.js';
import { buildAgentCard } from './a2a/agent-card.js';
import { agentCardSkills } from './a2a/skills.js';
import { buildServerCard } from './well-known/server-card.js';
import pkg from '../package.json' with { type: 'json' };

interface Env {
  /** Base URL of the Hookbase REST API the tools call. */
  HOOKBASE_API_URL?: string;
}

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
      return new Response(
        JSON.stringify({
          name: 'Hookbase MCP',
          mcp: `https://${url.host}/mcp`,
          mcpServerCard: `https://${url.host}/mcp/server-card`,
          a2a: `https://${url.host}/a2a`,
          a2aAgentCard: `https://${url.host}/.well-known/agent-card.json`,
          documentation: 'https://hookbase.app/docs',
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
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
