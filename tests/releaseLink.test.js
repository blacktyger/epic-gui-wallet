// Tests for src/shared/releaseLink.js: where the version number leads
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { releaseTag, releaseTagUrl, resolveReleaseUrl, createReleaseLink, openRelease, RELEASES_URL } from '../src/shared/releaseLink.js';

const TAG_URL = 'https://github.com/blacktyger/epic-gui-wallet/releases/tag/v6.1.1';

test('tag: "v" + the version (the repository tags v6.0.0 and so on)', () => {
  assert.equal(releaseTag('6.1.1'), 'v6.1.1');
  assert.equal(releaseTag('v6.1.1'), 'v6.1.1');
  assert.equal(releaseTag('6.2.0-rc.1'), 'v6.2.0-rc.1');
  for (const v of ['', null, undefined, '6.1', 'latest', '6.1.1/../../x', '6.1.1?x']) assert.equal(releaseTag(v), null, String(v));
  assert.equal(releaseTagUrl('6.1.1'), TAG_URL);
  assert.equal(releaseTagUrl('dev'), null);
});

test('resolve: the release page when GitHub has it, else the releases page', async () => {
  let seen;
  const has = async (url, opts) => { seen = { url, opts }; return { status: 200 }; };
  assert.equal(await resolveReleaseUrl(has, '6.1.1'), TAG_URL);
  assert.equal(seen.url, TAG_URL);
  assert.equal(seen.opts.method, 'HEAD');
  assert.equal(await resolveReleaseUrl(async () => ({ status: 404 }), '6.1.1'), RELEASES_URL);
  assert.equal(await resolveReleaseUrl(async () => { throw new Error('offline'); }, '6.1.1'), RELEASES_URL);
  assert.equal(await resolveReleaseUrl(has, 'not a version'), RELEASES_URL);
  assert.equal(await resolveReleaseUrl(undefined, '6.1.1'), RELEASES_URL);
});

test('resolve: a request that never answers ends in the releases page, aborted', async () => {
  let aborted = false;
  const hang = (url, opts) => new Promise(() => { opts.signal.addEventListener('abort', () => { aborted = true; }); });
  const t0 = Date.now();
  assert.equal(await resolveReleaseUrl(hang, '6.1.1', { timeoutMs: 50 }), RELEASES_URL);
  assert.ok(Date.now() - t0 < 1000);
  assert.ok(aborted);
});

test('cache: a found release is kept; the fallback is asked again after a while', async () => {
  let calls = 0;
  let status = 404;
  let t = 0;
  const link = createReleaseLink({ fetch: async () => { calls++; return { status }; }, now: () => t, failTtlMs: 1000 });
  assert.equal(await link.get('6.1.1'), RELEASES_URL);
  assert.equal(await link.get('6.1.1'), RELEASES_URL);
  assert.equal(calls, 1);
  status = 200;
  t = 2000;
  assert.equal(await link.get('6.1.1'), TAG_URL);
  t = 10 ** 9;
  assert.equal(await link.get('6.1.1'), TAG_URL);
  assert.equal(calls, 2);
  const [a, b] = await Promise.all([link.get('6.2.0'), link.get('6.2.0')]);
  assert.equal(a, b);
  assert.equal(calls, 3, 'one request in flight');
});

test('open: only this repository\'s release urls are opened, the releases page otherwise', async () => {
  const opened = [];
  const open = (u) => opened.push(u);
  await openRelease({ releaseUrl: async () => TAG_URL }, open);
  await openRelease({ releaseUrl: async () => 'https://evil.example/' }, open);
  await openRelease({ releaseUrl: async () => { throw new Error('ipc'); } }, open);
  await openRelease({ releaseUrl: () => new Promise(() => {}) }, open, 30);
  await openRelease(undefined, open);
  assert.deepEqual(opened, [TAG_URL, RELEASES_URL, RELEASES_URL, RELEASES_URL, RELEASES_URL]);
});
