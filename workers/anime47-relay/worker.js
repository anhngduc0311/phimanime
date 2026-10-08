const VERSION = 2;
const cors = {
  'Access-Control-Allow-Origin': 'https://anidoki.com',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, Content-Type, Authorization',
  'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length',
  'Cache-Control': 'private, no-store',
  'X-Anidoki-Relay-Version': String(VERSION)
};
const reply = (text, status) => new Response(text, { status, headers: cors });
const allowed = value => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      /^cdn[1-7]\.nonprofit\.asia$/.test(url.hostname);
  } catch { return false; }
};

async function signedTarget(query, token) {
  const payload = query.searchParams.get('payload') || '';
  const signature = query.searchParams.get('signature') || '';
  if (!/^[A-Za-z0-9_-]{1,8192}$/.test(payload) || !/^[a-f0-9]{64}$/.test(signature)) return null;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(token), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const bytes = Uint8Array.from(signature.match(/../g), value => parseInt(value, 16));
  if (!await crypto.subtle.verify('HMAC', key, bytes, new TextEncoder().encode(payload))) return null;
  try {
    const raw = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const data = JSON.parse(new TextDecoder().decode(Uint8Array.from(raw, char => char.charCodeAt(0))));
    if (!Number.isFinite(data.expires) || data.expires <= Date.now() || data.expires > Date.now() + 4 * 60 * 60 * 1000 + 60000) return null;
    return typeof data.url === 'string' && allowed(data.url) ? data.url : null;
  } catch { return null; }
}

function unwrap(bytes) {
  for (let offset = 0; offset < Math.min(65536, bytes.length - 4 * 188); offset++) {
    if ([0,1,2,3,4].every(packet => bytes[offset + packet * 188] === 0x47)) return bytes.subarray(offset);
  }
  return null;
}

export default {
  async fetch(request, env) {
    const query = new URL(request.url);
    if (request.method === 'GET' && query.pathname === '/health') return Response.json({ version: VERSION });
    if (query.pathname !== '/media') return reply('Not found', 404);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!['GET', 'POST'].includes(request.method)) return reply('Not found', 404);
    if (!env.RELAY_TOKEN || env.RELAY_TOKEN.length < 32) return reply('Relay secret is not configured', 503);
    let target;
    const browser = request.method === 'GET';
    if (browser) {
      target = await signedTarget(query, env.RELAY_TOKEN);
      if (!target) return reply('Invalid or expired media signature', 401);
    } else {
      if (request.headers.get('Authorization') !== 'Bearer ' + env.RELAY_TOKEN) return reply('Unauthorized', 401);
      if (Number(request.headers.get('Content-Length')) > 8192) return reply('Too large', 413);
      const text = await request.text();
      if (text.length > 8192) return reply('Too large', 413);
      try { target = JSON.parse(text)?.url; } catch { return reply('Invalid JSON', 400); }
      if (typeof target !== 'string' || !allowed(target)) return reply('Unsupported media host', 400);
    }
    const range = request.headers.get('Range');
    if (range && !/^bytes=\d+-\d*$/.test(range)) return reply('Invalid range', 400);
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        const upstream = await fetch(target, {
          headers: {
            Origin: 'https://anime47.best', Referer: 'https://anime47.best/', Accept: '*/*',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            ...(!browser && range ? { Range: range } : {})
          }, redirect: 'manual', signal: AbortSignal.timeout(20000)
        });
        if ([301, 302, 303, 307, 308].includes(upstream.status)) {
          const location = upstream.headers.get('Location');
          await upstream.body?.cancel();
          if (!location) break;
          target = new URL(location, target).href;
          if (!allowed(target)) break;
          continue;
        }
        const headers = new Headers(cors);
        for (const name of ['content-type', 'content-range', 'accept-ranges']) {
          if (upstream.headers.has(name)) headers.set(name, upstream.headers.get(name));
        }
        if (browser && upstream.ok && /^image\//i.test(upstream.headers.get('content-type') || '')) {
          if (Number(upstream.headers.get('content-length')) > 32 * 1024 * 1024) { await upstream.body?.cancel(); return reply('Segment too large', 502); }
          const video = unwrap(new Uint8Array(await upstream.arrayBuffer()));
          if (!video) return reply('Invalid video segment', 502);
          headers.delete('content-range');
          headers.delete('accept-ranges');
          headers.set('Content-Type', 'video/mp2t');
          return new Response(video, { headers });
        }
        return new Response(upstream.body, { status: upstream.status, headers });
      }
    } catch { return reply('Media relay unavailable', 502); }
    return reply('Unsupported media redirect', 502);
  }
};
