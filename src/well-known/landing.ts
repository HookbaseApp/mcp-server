/**
 * What GET / returns on the MCP host. Programmatic clients (no Accept, *\/*, application/json)
 * keep getting the JSON pointer document; browsers get an HTML page and agents asking for
 * text/markdown get the same content as Markdown. Mirrors the API host's landing page
 * (api/src/utils/apiLandingPage.ts).
 *
 * The HTML page registers WebMCP tools via the imperative API
 * (https://webmachinelearning.github.io/webmcp/). Each one either returns connection details
 * this page already knows, fetches a real public document from this host, or navigates to real
 * docs — none of them call the authenticated MCP endpoint, since the page has no API key.
 */

export interface RootInfo {
  name: string;
  mcp: string;
  mcpServerCard: string;
  a2a: string;
  a2aAgentCard: string;
  ard: string;
  documentation: string;
}

export function buildRootInfo(origin: string): RootInfo {
  return {
    name: 'Hookbase MCP',
    mcp: `${origin}/mcp`,
    mcpServerCard: `${origin}/mcp/server-card`,
    a2a: `${origin}/a2a`,
    a2aAgentCard: `${origin}/.well-known/agent-card.json`,
    ard: `${origin}/.well-known/ard.json`,
    documentation: 'https://hookbase.app/docs',
  };
}

// Pages an agent can be sent to. Keys are what the navigation tool's inputSchema enum exposes.
const DOC_LINKS = {
  mcp_setup: 'https://www.hookbase.app/docs/receive/mcp',
  mcp_tools: 'https://www.hookbase.app/docs/receive/mcp/tools',
  docs: 'https://www.hookbase.app/docs',
  signup: 'https://www.hookbase.app/register',
};

// RFC 8288 Link header for "/": the API catalog, the docs, and the ARD manifest that lists this
// host's MCP server and A2A agent.
export function buildLinkHeader(): string {
  return [
    '</.well-known/api-catalog>; rel="api-catalog"',
    `<${DOC_LINKS.mcp_setup}>; rel="service-doc"`,
    '</.well-known/ard.json>; rel="ard"; type="application/json"',
  ].join(', ');
}

export type RootFormat = 'json' | 'html' | 'markdown';

// The first of text/markdown, text/html or application/json listed in Accept wins (q-values are
// not weighed); anything else, including no Accept header and */*, gets JSON.
export function negotiateRootFormat(accept: string | null): RootFormat {
  if (!accept) return 'json';
  const types = accept.toLowerCase().split(',').map((t) => t.split(';')[0].trim());
  for (const type of types) {
    if (type === 'text/markdown') return 'markdown';
    if (type === 'text/html') return 'html';
    if (type === 'application/json') return 'json';
  }
  return 'json';
}

const CONNECT_TEXT =
  'Point an MCP client at the Streamable HTTP endpoint below and send a Hookbase API key (whr_…) as Authorization: Bearer <key>.';

export function buildLandingMarkdown(origin: string): string {
  const info = buildRootInfo(origin);
  return `# Hookbase MCP

Remote MCP server and A2A agent for Hookbase, the webhook relay. ${CONNECT_TEXT}

- MCP endpoint (Streamable HTTP): ${info.mcp}
- [MCP Server Card](${info.mcpServerCard})
- A2A endpoint: ${info.a2a}
- [A2A Agent Card](${info.a2aAgentCard})
- [ARD manifest](${info.ard})
- [Setup guide](${DOC_LINKS.mcp_setup})
- [Tool reference](${DOC_LINKS.mcp_tools})
- [Get an API key](${DOC_LINKS.signup})
`;
}

// JSON for embedding inside a <script> element: escape "<" so no value can close the tag.
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function buildLandingPage(origin: string): string {
  const info = buildRootInfo(origin);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hookbase MCP</title>
<meta name="description" content="Remote MCP server and A2A agent for the Hookbase webhook relay.">
<link rel="ard" href="/.well-known/ard.json" type="application/json">
<style>
  body { font-family: system-ui, sans-serif; max-width: 40rem; margin: 3rem auto; padding: 0 1rem; line-height: 1.5; color: #111; background: #fff; }
  @media (prefers-color-scheme: dark) { body { color: #eee; background: #111; } a { color: #8ab4f8; } }
  code { font-size: 0.9em; overflow-wrap: anywhere; }
</style>
</head>
<body>
<h1>Hookbase MCP</h1>
<p>Remote MCP server and A2A agent for Hookbase, the webhook relay. Point an MCP client at the Streamable HTTP endpoint below and send a Hookbase API key (<code>whr_…</code>) as <code>Authorization: Bearer &lt;key&gt;</code>.</p>
<ul>
  <li>MCP endpoint: <code>${escapeHtml(info.mcp)}</code> · <a href="${escapeHtml(info.mcpServerCard)}">Server Card</a></li>
  <li>A2A endpoint: <code>${escapeHtml(info.a2a)}</code> · <a href="${escapeHtml(info.a2aAgentCard)}">Agent Card</a></li>
  <li><a href="${escapeHtml(DOC_LINKS.mcp_setup)}">Setup guide</a> · <a href="${escapeHtml(DOC_LINKS.mcp_tools)}">Tool reference</a> · <a href="${escapeHtml(DOC_LINKS.signup)}">Get an API key</a></li>
</ul>
<script>
(function () {
  var mc = (typeof document !== 'undefined' && document.modelContext) || (typeof navigator !== 'undefined' && navigator.modelContext);
  if (!mc || typeof mc.registerTool !== 'function') return;
  var INFO = ${scriptJson(info)};
  var LINKS = ${scriptJson(DOC_LINKS)};
  var controller = new AbortController();
  window.addEventListener('pagehide', function () { controller.abort(); });

  function getJson(url) {
    return fetch(url, { headers: { Accept: 'application/json' } }).then(function (r) {
      return r.json().then(function (body) { return { httpStatus: r.status, body: body }; });
    });
  }
  // registerTool returns a promise in current drafts; a failed registration just means that tool isn't offered.
  function register(tool) {
    var result = mc.registerTool(tool, { signal: controller.signal });
    if (result && typeof result.catch === 'function') result.catch(function () {});
  }

  register({
    name: 'get_mcp_connection_info',
    description: 'Get what an MCP or A2A client needs to connect to Hookbase: endpoint URLs, transport, and authentication scheme.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    execute: function () {
      return Promise.resolve({
        mcpEndpoint: INFO.mcp,
        transport: 'streamable-http',
        a2aEndpoint: INFO.a2a,
        authentication: 'Hookbase API key (prefix whr_) sent as Authorization: Bearer <key>. Get one at ' + LINKS.signup,
        setupGuide: LINKS.mcp_setup
      });
    }
  });

  register({
    name: 'get_mcp_server_card',
    description: 'Retrieve the Hookbase MCP Server Card (SEP-2127): server name, version, and remote endpoint details.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    execute: function () { return getJson(INFO.mcpServerCard); }
  });

  register({
    name: 'get_a2a_agent_card',
    description: 'Retrieve the Hookbase A2A Agent Card: the agent skills it offers and how to call them.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    execute: function () { return getJson(INFO.a2aAgentCard); }
  });

  register({
    name: 'open_mcp_documentation',
    description: 'Navigate the browser to the Hookbase MCP setup guide, the MCP tool reference, the main docs, or signup.',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'string', enum: Object.keys(LINKS), description: 'Which page to open: ' + Object.keys(LINKS).join(', ') + '.' }
      },
      required: ['page']
    },
    execute: function (input) {
      var page = input && typeof input.page === 'string' ? input.page : '';
      var url = Object.prototype.hasOwnProperty.call(LINKS, page) ? LINKS[page] : undefined;
      if (!url) return Promise.reject(new Error('Unknown page "' + page + '". Valid pages: ' + Object.keys(LINKS).join(', ')));
      window.location.assign(url);
      return Promise.resolve({ navigatedTo: url });
    }
  });
})();
</script>
</body>
</html>
`;
}
