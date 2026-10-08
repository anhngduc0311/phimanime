import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const tickets = new Map();
const byUrl = new Map();
const TTL = 4 * 60 * 60 * 1000;
const LIMIT = 20000;

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
  throw new Error('Invalid wrapped video segment');
}

export async function serveAnime47Media(req, res) {
  const ticket = tickets.get(req.params.ticket);
  if (!ticket || ticket.until <= Date.now()) return res.status(404).json({ success: false, message: 'Nguồn video đã hết hạn. Hãy tải lại tập phim.' });
  const abort = new AbortController();
  res.on('close', () => { if (!res.writableEnded) abort.abort(); });
  try {
    let target = ticket.url;
    let upstream;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (!allowedAnime47Media(target)) throw new Error('Unsupported media host');
      const headers = { Origin: 'https://anime47.best', Referer: 'https://anime47.best/' };
      if (req.headers.range) headers.Range = req.headers.range;
      upstream = await fetch(target, {
        headers, redirect: 'manual',
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(30000)])
      });
      if (![301, 302, 303, 307, 308].includes(upstream.status)) break;
      const location = upstream.headers.get('location');
      await upstream.body?.cancel();
      if (!location) throw new Error('Invalid media redirect');
      target = new URL(location, target).href;
      upstream = null;
    }
    if (!upstream || !upstream.ok) throw new Error('Media unavailable');
    res.setHeader('Cache-Control', 'private, no-store');
    if (/\.m3u8(?:\?|$)/i.test(target) || /mpegurl/i.test(upstream.headers.get('content-type') || '')) {
      const playlist = await upstream.text();
      if (!playlist.trimStart().startsWith('#EXTM3U')) throw new Error('Invalid playlist');
      res.type('application/vnd.apple.mpegurl').send(rewriteAnime47Playlist(playlist, target));
      return;
    }
    res.status(upstream.status);
    if (/^image\//i.test(upstream.headers.get('content-type') || '')) {
      if (Number(upstream.headers.get('content-length')) > 32 * 1024 * 1024) throw new Error('Segment too large');
      const bytes = Buffer.from(await upstream.arrayBuffer());
      const segment = unwrapAnime47Segment(bytes);
      res.setHeader('Content-Type', 'video/mp2t');
      res.setHeader('Content-Length', segment.length);
      res.end(segment);
      return;
    }
    for (const header of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
      const value = upstream.headers.get(header);
      if (value) res.setHeader(header, value);
    }
    await pipeline(Readable.fromWeb(upstream.body), res);
  } catch {
    if (!res.headersSent) res.status(502).json({ success: false, message: 'Không tải được video Anime47. Hãy thử tải lại tập phim.' });
    else res.destroy();
  }
}
