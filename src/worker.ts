/**
 * Cloudflare Worker entry for the remote (Streamable HTTP) MCP transport.
 *
 * Deploys the same Hookbase tool set the stdio server exposes, reachable over
 * HTTP so hosted MCP clients (Claude connectors, ChatGPT, web clients) can use
 * it with just a URL + `whr_` API key — no local install.
 *
 * Endpoints:
 *   POST /mcp   (and POST /)   — MCP JSON-RPC
 *   GET  /health               — liveness probe
 */

import { handleMcpRequest } from './http/handler.js';

interface Env {
  /** Base URL of the Hookbase REST API the tools call. */
  HOOKBASE_API_URL?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const apiUrl = env.HOOKBASE_API_URL || 'https://api.hookbase.app';

    if (url.pathname === '/health') {
      return new Response('ok', { headers: { 'Content-Type': 'text/plain' } });
    }
    if (url.pathname === '/' || url.pathname === '/mcp') {
      return handleMcpRequest(request, apiUrl);
    }
    return new Response('Not found', { status: 404 });
  },
};
