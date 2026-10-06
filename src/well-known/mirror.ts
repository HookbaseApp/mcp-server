/**
 * Discovery documents this host republishes from the Workers that own them: the API catalog,
 * auth.md and the Web Bot Auth key directory from the API Worker, and the Agent Skills index from
 * the website Worker. Scanners only look on the host they were pointed at. Fetching through a
 * service binding (a same-zone fetch to another Worker's custom domain is unreliable) and passing
 * the body through untouched means the copy can't drift from the original. Same approach as
 * api/src/utils/discoveryMirror.ts and frontend-next/src/lib/discovery-mirror.ts.
 */

/** The part of a Cloudflare service binding this needs. */
export interface ServiceBinding {
  fetch(input: string): Promise<Response>;
}

// Returns null when the binding isn't configured (local runs without the other Workers), so the
// caller can 404 rather than pretend the document exists.
export async function mirrorDiscoveryDoc(binding: ServiceBinding | undefined, url: string): Promise<Response | null> {
  if (!binding) return null;
  const upstream = await binding.fetch(url).catch(() => null);
  if (!upstream?.ok) {
    return new Response(JSON.stringify({ error: 'Discovery document unavailable' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const headers = new Headers(upstream.headers);
  // Public, unauthenticated discovery metadata: readable from any origin.
  headers.set('Access-Control-Allow-Origin', '*');
  return new Response(upstream.body, { status: 200, headers });
}
