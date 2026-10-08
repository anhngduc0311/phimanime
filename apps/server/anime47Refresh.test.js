import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAnime47Session } from './services/anime47Session.service.js';

const jwt = exp => `header.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.signature`;

test('expired access is refreshed once for concurrent requests and rotated tokens survive restart', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anime47-session-'));
  const config = { ANIME47_ACCESS_TOKEN: jwt(1), ANIME47_REFRESH_TOKEN: 'initial-refresh',
    ANIME47_SESSION_FILE: path.join(dir, 'session.json') };
  let calls = 0;
  const request = async (url, options) => {
    calls++;
    assert.equal(url, 'https://anime47.love/api/auth/refresh-token');
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, undefined);
    assert.deepEqual(JSON.parse(options.body), { refresh_token: 'initial-refresh' });
    await new Promise(resolve => setTimeout(resolve, 5));
    return { ok: true, json: async () => ({ access_token: jwt(3600), refresh_token: 'rotated-refresh', expires_in: 3600 }) };
  };
  try {
    const session = createAnime47Session({ config: () => config, request, now: () => 100000 });
    assert.deepEqual(await Promise.all([session.ensure(), session.ensure(), session.ensure()]), Array(3).fill(jwt(3600)));
    assert.equal(calls, 1);
    assert.equal(await session.refresh(jwt(1)), jwt(3600));
    const restored = createAnime47Session({ config: () => config, request: () => assert.fail('valid persisted access'), now: () => 100000 });
    assert.equal(await restored.ensure(), jwt(3600));
    const rotated = createAnime47Session({ config: () => config, now: () => 3600000, request: async (_url, options) => {
      assert.deepEqual(JSON.parse(options.body), { refresh_token: 'rotated-refresh' });
      return { ok: true, json: async () => ({ data: { access_token: jwt(7200), refresh_token: 'rotated-again' } }) };
    } });
    assert.equal(await rotated.ensure(), jwt(7200));
    config.ANIME47_REFRESH_TOKEN = 'replacement-refresh';
    config.ANIME47_ACCESS_TOKEN = 'replacement-access';
    assert.equal(restored.token(), 'replacement-access');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('refresh-only configuration works and rejects upstream failures without leaking response bodies', async () => {
  let calls = 0;
  let time = 100000;
  const session = createAnime47Session({ config: () => ({ ANIME47_REFRESH_TOKEN: 'secret' }), now: () => time,
    request: async () => { calls++; return { ok: false, status: 401, json: async () => ({ message: 'secret' }) }; } });
  assert.equal(session.configured(), true);
  await assert.rejects(session.ensure(), error => error.code === 'ANIME47_REFRESH_FAILED' && !error.message.includes('secret'));
  await assert.rejects(session.ensure(), { code: 'SOURCE_LOGIN_REQUIRED' });
  assert.equal(calls, 1);
  time += 31000;
  await assert.rejects(session.ensure(), { code: 'ANIME47_REFRESH_FAILED' });
  assert.equal(calls, 2);
});

test('missing or malformed refresh response cannot replace the existing session', async () => {
  const session = createAnime47Session({ config: () => ({ ANIME47_ACCESS_TOKEN: 'old', ANIME47_REFRESH_TOKEN: 'refresh' }),
    request: async () => ({ ok: true, json: async () => ({ refresh_token: 'new' }) }) });
  await assert.rejects(session.refresh('old'), { code: 'ANIME47_REFRESH_INVALID' });
  assert.equal(session.token(), 'old');
});

test('a config change during refresh cannot overwrite the replacement account', async () => {
  const config = { ANIME47_REFRESH_TOKEN: 'first' };
  let finish;
  const session = createAnime47Session({ config: () => config, request: () => new Promise(resolve => { finish = resolve; }) });
  const task = session.ensure();
  config.ANIME47_REFRESH_TOKEN = 'second';
  config.ANIME47_ACCESS_TOKEN = 'replacement';
  finish({ ok: true, json: async () => ({ access_token: 'obsolete', refresh_token: 'obsolete-refresh' }) });
  assert.equal(await task, 'replacement');
  assert.equal(session.token(), 'replacement');
});
