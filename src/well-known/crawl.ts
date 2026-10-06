/**
 * robots.txt (RFC 9309) and sitemap.xml for the MCP host. The only pages here are the landing
 * page and auth.md; /mcp and /a2a are JSON-RPC endpoints, not content. So robots.txt denies by
 * default and allows just those plus the agent-discovery documents. Under RFC 9309 the longest
 * matching rule wins, so each Allow beats the blanket Disallow. Content-Signal matches
 * www.hookbase.app and api.hookbase.app.
 */

const CRAWLABLE_PAGES = ['/', '/auth.md'];

export function buildRobotsTxt(origin: string): string {
  return [
    'User-agent: *',
    'Content-Signal: ai-train=yes, search=yes, ai-input=yes',
    'Allow: /$',
    'Allow: /.well-known/',
    'Allow: /auth.md',
    'Disallow: /',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n');
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Sitemaps protocol (https://www.sitemaps.org/protocol.html). No <lastmod>: the pages are
// generated per request.
export function buildSitemapXml(origin: string): string {
  const urls = CRAWLABLE_PAGES.map((path) => `  <url><loc>${escapeXml(`${origin}${path}`)}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}
