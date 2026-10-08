import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const tickets = new Map();
const byUrl = new Map();
const TTL = 4 * 60 * 60 * 1000;
const LIMIT = 20000;
const blockedCdnHosts = new Map();

export function anime47MediaHeaders(range) {
  const headers = {
    Origin: 'https://anime47.best',
    Referer: 'https://anime47.best/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    Accept: '*/*',
    'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8'
  };
  if (range) headers.Range = range;
  return headers;
}

export async function fetchAnime47Media(target, options, request = fetch, blocked = blockedCdnHosts) {
  const url = new URL(target);
  const isMirror = /^cdn[1-7]\.nonprofit\.asia$/.test(url.hostname);
  const hosts = isMirror ? [url.hostname, ...[1, 2, 3, 4, 5, 6, 7].map(i => `cdn${i}.nonprofit.asia`).filter(host => host !== url.hostname)] : [url.hostname];
  for (const host of hosts) {
    if (isMirror && blocked.get(host) > Date.now()) continue;
    const candidate = new URL(url);
    candidate.hostname = host;
    const response = await request(candidate.href, options);
    if (isMirror && response.status === 403) {
      await response.body?.cancel();
      blocked.set(host, Date.now() + 60000);
      continue;
    }
    return { response, target: candidate.href };
  }
  throw Object.assign(new Error('CDN denies this server'), { code: 'CDN_ACCESS_DENIED' });
}

export function allowedAnime47Media(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      (url.hostname === 'pl.vlogphim.net' || /^cdn[1-7]\.nonprofit\.asia$/.test(url.hostname));
  } catch { return false; }
}

// Only server-resolved media gets an opaque ticket. No URL input is accepted
// from the browser, and Anime47 account credentials never go to media hosts.
export function anime47MediaUrl(value) {
  if (!allowedAnime47Media(value)) throw new Error('Nguồn video Anime47 chưa được hỗ trợ');
  const existing = byUrl.get(value);
  if (existing && tickets.get(existing)?.until > Date.now()) return '/api/watch/anime47/media/' + existing;
  while (tickets.size >= LIMIT) {
    const oldest = tickets.keys().next().value;
    byUrl.delete(tickets.get(oldest).url);
    tickets.delete(oldest);
  }
  const ticket = randomBytes(24).toString('hex');
  tickets.set(ticket, { url: value, until: Date.now() + TTL });
  byUrl.set(value, ticket);
  return '/api/watch/anime47/media/' + ticket;
}

export function rewriteAnime47Playlist(text, base) {
  const rewrite = value => anime47MediaUrl(new URL(value, base).href);
  return text.split(/\r?\n/).map(line => {
    if (!line.trim()) return line;
    if (!line.startsWith('#')) return rewrite(line.trim());
    return line.replace(/URI="([^"]+)"/g, (_match, uri) => `URI="${rewrite(uri)}"`);
  }).join('\n');
}

export function unwrapAnime47Segment(bytes) {
  // This CDN prefixes MPEG-TS with a PNG cover. Require repeated 188-byte TS
  // sync packets before discarding the cover, rather than guessing a PNG size.
  for (let offset = 0; offset < Math.min(65536, bytes.length - 4 * 188); offset++) {
    if ([0, 1, 2, 3, 4].every(packet => bytes[offset + packet * 188] === 0x47)) {
      return bytes.subarray(offset);
    }
  }
  throw Object.assign(new Error('Invalid wrapped video segment'), { code: 'INVALID_VIDEO_SEGMENT' });
}

export async function serveAnime47Media(req, res) {
  const ticket = tickets.get(req.params.ticket);
  if (!ticket || ticket.until <= Date.now()) return res.status(404).json({ success: false, message: 'Nguồn video đã hết hạn. Hãy tải lại tập phim.' });
  const abort = new AbortController();
  res.on('close', () => { if (!res.writableEnded) abort.abort(); });
  let target = ticket.url;
  let stage = 'fetch';
  let upstreamStatus;
  try {
    let upstream;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (!allowedAnime47Media(target)) throw new Error('Unsupported media host');
      const headers = anime47MediaHeaders(req.headers.range);
      const result = await fetchAnime47Media(target, {
        headers, redirect: 'manual',
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(30000)])
      });
      upstream = result.response;
      target = result.target;
      upstreamStatus = upstream.status;
      if (![301, 302, 303, 307, 308].includes(upstream.status)) break;
      const location = upstream.headers.get('location');
      await upstream.body?.cancel();
      if (!location) throw new Error('Invalid media redirect');
      target = new URL(location, target).href;
      upstream = null;
    }
    if (!upstream || !upstream.ok) throw Object.assign(new Error('Media unavailable'), { code: `CDN_HTTP_${upstreamStatus || 'REDIRECT'}` });
    res.setHeader('Cache-Control', 'private, no-store');
    if (/\.m3u8(?:\?|$)/i.test(target) || /mpegurl/i.test(upstream.headers.get('content-type') || '')) {
      stage = 'playlist';
      const playlist = await upstream.text();
      if (!playlist.trimStart().startsWith('#EXTM3U')) throw new Error('Invalid playlist');
      res.type('application/vnd.apple.mpegurl').send(rewriteAnime47Playlist(playlist, target));
      return;
    }
    res.status(upstream.status);
    if (/^image\//i.test(upstream.headers.get('content-type') || '')) {
      stage = 'segment';
      if (Number(upstream.headers.get('content-length')) > 32 * 1024 * 1024) throw new Error('Segment too large');
      const bytes = Buffer.from(await upstream.arrayBuffer());
      const segment = unwrapAnime47Segment(bytes);
      res.setHeader('Content-Type', 'video/mp2t');
      res.setHeader('Content-Length', segment.length);
      res.end(segment);
      return;
    }
    stage = 'stream';
    // fetch may decompress an upstream body; its Content-Length can then be
    // stale. Let Node frame the streamed response instead of forwarding it.
    for (const header of ['content-type', 'content-range', 'accept-ranges']) {
      const value = upstream.headers.get(header);
      if (value) res.setHeader(header, value);
    }
    await pipeline(Readable.fromWeb(upstream.body), res);
  } catch (error) {
    if (!abort.signal.aborted) {
      console.warn('Anime47 media failed', JSON.stringify({
        stage, host: new URL(target).hostname, upstreamStatus,
        code: error.code || error.cause?.code || error.name
      }));
    }
    if (!res.headersSent) res.status(error.code === 'CDN_ACCESS_DENIED' ? 503 : 502).json({
      success: false,
      code: error.code === 'CDN_ACCESS_DENIED' ? error.code : 'MEDIA_FETCH_FAILED',
      message: error.code === 'CDN_ACCESS_DENIED'
        ? 'CDN Anime47 từ chối kết nối từ máy chủ này trên tất cả các nguồn dự phòng.'
        : 'Không tải được video Anime47. Hãy thử tải lại tập phim.'
    });
    else res.destroy();
  }
}
