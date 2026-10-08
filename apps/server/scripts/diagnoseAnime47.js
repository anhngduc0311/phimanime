import { anime47Request, extractAnime47Episodes, anime47EpisodeSource } from '../services/anime47.service.js';
import { anime47MediaHeaders } from '../services/anime47Media.service.js';
import { anime47Session } from '../services/anime47Session.service.js';

// Safe production diagnostic: logs hosts/statuses, never tokens or signed URLs.
let stage = 'session';
let host = 'anime47.love';
try {
  const id = process.argv[2] || '11322';
  if (!/^\d+$/.test(id)) throw new Error('Expected numeric anime ID');
  console.log(JSON.stringify({
    runtime: process.version,
    tokenConfigured: Boolean(process.env.ANIME47_ACCESS_TOKEN?.trim()),
    refreshTokenConfigured: Boolean(process.env.ANIME47_REFRESH_TOKEN?.trim())
  }));
  await anime47Session.ensure();
  stage = 'episodes';
  const episode = extractAnime47Episodes(await anime47Request('/anime/' + id + '/episodes'))[0];
  if (!episode) throw new Error('No episodes');
  const source = await anime47EpisodeSource(episode.id);
  if (!source.stream_url) throw new Error('No HLS source');
  let url = source.stream_url;
  for (const step of ['master', 'variant', 'segment']) {
    stage = step;
    host = new URL(url).hostname;
    const response = await fetch(url, {
      headers: anime47MediaHeaders(),
      signal: AbortSignal.timeout(15000)
    });
    console.log(JSON.stringify({ stage, host, status: response.status, contentType: response.headers.get('content-type') }));
    if (!response.ok) {
      const html = await response.text();
      const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || '';
      console.log(JSON.stringify({
        blockPageTitle: title.slice(0, 160).replace(/https?:\/\/\S+/g, '[url]'),
        cloudflareBranding: /cloudflare/i.test(html),
        browserChallenge: /cf-chl|challenge-platform|just a moment/i.test(html)
      }));
      process.exitCode = 1;
      break;
    }
    if (step === 'segment') {
      const bytes = Buffer.from(await response.arrayBuffer());
      console.log(JSON.stringify({ bytes: bytes.length, prefix: bytes.subarray(0, 8).toString('hex') }));
      break;
    }
    const text = await response.text();
    if (!text.startsWith('#EXTM3U')) throw new Error('Invalid playlist');
    const next = text.split(/\r?\n/).find(line => line.trim() && !line.startsWith('#'));
    if (!next) throw new Error('Empty playlist');
    url = new URL(next, url).href;
  }
} catch (error) {
  console.error(JSON.stringify({ stage, host, name: error.name, status: error.status, upstreamStatus: error.upstreamStatus,
    code: error.code || error.cause?.code, causeCodes: error.cause?.errors?.map(item => item.code) }));
  process.exitCode = 1;
}
