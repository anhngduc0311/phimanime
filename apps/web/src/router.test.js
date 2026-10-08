import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.document = { addEventListener() {}, querySelectorAll: () => [], querySelector: () => null };
globalThis.window = {
  addEventListener() {}, scrollY: 0,
  location: { pathname: '/', search: '' },
  scrollTo({ top }) { this.scrollY = top; },
  history: {
    state: null,
    pushState(state, _, url) { this.state = state; const parsed = new URL(url, 'http://localhost'); window.location = { pathname: parsed.pathname, search: parsed.search }; },
    replaceState(...args) { this.pushState(...args); }
  }
};
const { Router } = await import('./router.js');

test('Initial loading can await the active route data', async () => {
  let resolve;
  const ready = new Promise(done => { resolve = done; });
  const router = new Router().addRoute('/browse', () => ready);
  assert.equal(router.handleRoute('/browse'), ready);
  resolve();
  await ready;
});

function setup(url = '/browse?category=hanh-dong&page=2', scrollY = 640) {
  window.history.replaceState({}, '', url);
  window.scrollY = scrollY;
  return new Router().addRoute('/', () => {}).addRoute('/browse', async () => {})
    .addRoute('/anime/:slug', () => {}).addRoute('/watch/:slug/:episode', () => {});
}

test('X returns to the exact filtered catalog and restores scroll after loading', async () => {
  const router = setup();
  router.navigate('/anime/example');
  router.returnFromDetail();
  await Promise.resolve();
  assert.equal(window.location.pathname + window.location.search, '/browse?category=hanh-dong&page=2');
  assert.equal(window.scrollY, 640);
});
test('Changing seasons and opening the player retains the catalog origin', () => {
  const router = setup();
  router.navigate('/anime/season-1');
  router.navigate('/anime/season-2');
  router.navigate('/watch/season-2/1');
  router.navigate('/anime/season-2');
  router.returnFromDetail();
  assert.equal(window.location.pathname, '/browse');
  assert.equal(window.location.search, '?category=hanh-dong&page=2');
});
test('Direct detail links fall back to home without leaving the website', () => {
  const router = setup('/anime/direct');
  router.returnFromDetail();
  assert.equal(window.location.pathname, '/');
});
test('Reject external return URLs', () => {
  const router = setup('/anime/direct');
  window.history.state = { detailReturnTo: { url: '//other.example', scrollY: 0 } };
  router.returnFromDetail();
  assert.equal(window.location.pathname, '/');
});
