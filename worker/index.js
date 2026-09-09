// CORS proxy for the Riftbound locator API.
//
// The locator API only allows browser requests from localhost and its own domain,
// so a page hosted on GitHub Pages can't call it directly. This Worker makes the
// request server-side, where CORS doesn't apply, and hands the result back.
//
// Only the two read-only endpoints the scoreboard needs are proxied.

const UPSTREAM = 'https://api.cloudflare.riftbound.uvsgames.com/hydraproxy';

const ALLOWED = [
  /^\/api\/v2\/events\/\d+\/$/,
  /^\/api\/v2\/events\/\d+\/registrations\/$/,
];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

    const url = new URL(request.url);
    if (!ALLOWED.some(re => re.test(url.pathname)))
      return json({ error: 'Path not proxied' }, 403);

    const upstream = UPSTREAM + url.pathname + url.search;
    let res;
    try {
      res = await fetch(upstream, { headers: { 'User-Agent': 'riftbound-scoreboard' } });
    } catch {
      return json({ error: 'Upstream unreachable' }, 502);
    }

    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  },
};

const json = (obj, status) =>
  new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
