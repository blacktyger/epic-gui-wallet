// Tests for src/shared/avatarImage.js, a contact's own picture made safe before it is kept: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sniffImageType, imageDimensions, avatarFileProblem, cropSquare, isSafeAvatarDataUrl, makeAvatar,
  AVATAR_SIZE, MAX_FILE_BYTES, MAX_DATA_URL_CHARS,
} from '../src/shared/avatarImage.js';

const bytes = (...parts) => new Uint8Array(parts.flatMap((p) => (typeof p == 'string' ? Array.from(p, (c) => c.charCodeAt(0)) : p)));
const be32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const le16 = (n) => [n & 255, (n >> 8) & 255];
const le24 = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255];

const png = (w, h) => bytes([0x89], 'PNG', [0x0d, 0x0a, 0x1a, 0x0a], be32(13), 'IHDR', be32(w), be32(h), [8, 6, 0, 0, 0], [0, 0, 0, 0]);
//SOI, an APP1 (Exif) segment with a GPS-looking payload, then SOF0 with height, width
const exif = 'Exif\0\0GPS 52.2297N 21.0122E camera=Phone';
const jpeg = (w, h) => bytes([0xff, 0xd8], [0xff, 0xe1], [0, exif.length + 2], exif,
  [0xff, 0xc0, 0, 17, 8], [(h >> 8) & 255, h & 255, (w >> 8) & 255, w & 255], [3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1], [0xff, 0xd9]);
const gif = (w, h) => bytes('GIF89a', le16(w), le16(h), [0, 0, 0]);
const webpX = (w, h) => bytes('RIFF', [30, 0, 0, 0], 'WEBP', 'VP8X', [10, 0, 0, 0], [0, 0, 0, 0], le24(w - 1), le24(h - 1), [0, 0]);
const svg = bytes('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script></svg>');
const html = bytes('<!doctype html><img src=x onerror=alert(1)>');

test('the type comes from the first bytes: PNG, JPEG, WebP and GIF only', () => {
  assert.equal(sniffImageType(png(10, 10)), 'png');
  assert.equal(sniffImageType(jpeg(10, 10)), 'jpeg');
  assert.equal(sniffImageType(gif(10, 10)), 'gif');
  assert.equal(sniffImageType(webpX(10, 10)), 'webp');
  assert.equal(sniffImageType(svg), null);
  assert.equal(sniffImageType(html), null);
  assert.equal(sniffImageType(bytes('BM')), null);
  assert.equal(sniffImageType(new Uint8Array(0)), null);
});

test('the declared size is read from each header', () => {
  assert.deepEqual(imageDimensions(png(640, 480)), { width: 640, height: 480 });
  assert.deepEqual(imageDimensions(jpeg(4032, 3024)), { width: 4032, height: 3024 });
  assert.deepEqual(imageDimensions(gif(320, 200)), { width: 320, height: 200 });
  assert.deepEqual(imageDimensions(webpX(1920, 1080)), { width: 1920, height: 1080 });
  assert.equal(imageDimensions(bytes([0xff, 0xd8, 0xff])), null);
});

test('a picked file is refused for its type, its size or a huge declared image', () => {
  assert.equal(avatarFileProblem(png(400, 400)), null);
  assert.equal(avatarFileProblem(jpeg(4032, 3024)), null);
  assert.equal(avatarFileProblem(svg), 'type');
  assert.equal(avatarFileProblem(html), 'type');
  assert.equal(avatarFileProblem(png(400, 400), MAX_FILE_BYTES + 1), 'size');
  //a few bytes that would decode to 2.5 GB of pixels
  assert.equal(avatarFileProblem(png(25000, 25000)), 'dimensions');
  assert.equal(avatarFileProblem(png(0, 10)), 'dimensions');
});

test('the middle square is cropped', () => {
  assert.deepEqual(cropSquare(400, 300), { sx: 50, sy: 0, side: 300 });
  assert.deepEqual(cropSquare(300, 400), { sx: 0, sy: 50, side: 300 });
  assert.deepEqual(cropSquare(128, 128), { sx: 0, sy: 0, side: 128 });
});

test('only a data: URL this app makes is kept or shown', () => {
  assert.ok(isSafeAvatarDataUrl('data:image/webp;base64,UklGRiIAAABXRUJQ'));
  assert.ok(isSafeAvatarDataUrl('data:image/png;base64,iVBORw0KGgo='));
  assert.ok(!isSafeAvatarDataUrl('data:image/svg+xml;base64,PHN2Zz4='));
  assert.ok(!isSafeAvatarDataUrl('data:image/svg+xml,<svg onload=alert(1)>'));
  assert.ok(!isSafeAvatarDataUrl('data:text/html;base64,PGh0bWw+'));
  assert.ok(!isSafeAvatarDataUrl('https://example.com/a.png'));
  assert.ok(!isSafeAvatarDataUrl('file:///home/bt/me.png'));
  assert.ok(!isSafeAvatarDataUrl('C:\\Users\\me\\a.png'));
  assert.ok(!isSafeAvatarDataUrl('data:image/png;base64,AAAA"><script>'));
  assert.ok(!isSafeAvatarDataUrl('data:image/png;base64,' + 'A'.repeat(MAX_DATA_URL_CHARS)));
  assert.ok(!isSafeAvatarDataUrl(null));
});

/* a page's createImageBitmap and canvas, recording what they were given */
function fakeEnv({ width = 800, height = 600, webp = true, decodeFails = false } = {}) {
  const calls = { decoded: [], drawn: [], encoded: [] };
  const env = {
    async createImageBitmap(blob, opts) {
      calls.decoded.push({ blob, opts, bytes: new Uint8Array(await blob.arrayBuffer()) });
      if (decodeFails) throw new Error('bad image');
      return { width, height, close() { calls.closed = true; } };
    },
    document: {
      createElement(tag) {
        assert.equal(tag, 'canvas');
        const canvas = {
          width: 0, height: 0,
          getContext: () => ({ drawImage: (...a) => calls.drawn.push({ args: a.slice(1), w: canvas.width, h: canvas.height }) }),
          toDataURL(type) {
            calls.encoded.push(type);
            if (type == 'image/webp' && !webp) return 'data:image/png;base64,iVBORw0KGgo=';
            return type == 'image/webp' ? 'data:image/webp;base64,UklGRiIAAABXRUJQ' : 'data:image/png;base64,iVBORw0KGgo=';
          },
        };
        return canvas;
      },
    },
  };
  return { env, calls };
}
const file = (b, type = 'image/jpeg') => new File([b], 'me.jpg', { type });

test('a picture is decoded from the checked bytes, cropped to the middle and re-encoded as a 128 px WebP', async () => {
  const { env, calls } = fakeEnv({ width: 800, height: 600 });
  const r = await makeAvatar(file(jpeg(800, 600)), env);
  assert.equal(r.dataUrl, 'data:image/webp;base64,UklGRiIAAABXRUJQ');
  //decoded as the sniffed type, with the EXIF orientation applied
  assert.equal(calls.decoded[0].blob.type, 'image/jpeg');
  assert.equal(calls.decoded[0].opts.imageOrientation, 'from-image');
  assert.deepEqual(calls.drawn[0], { args: [100, 0, 600, 600, 0, 0, AVATAR_SIZE, AVATAR_SIZE], w: AVATAR_SIZE, h: AVATAR_SIZE });
  assert.equal(calls.closed, true);
  //what is kept is the canvas's encoding, never the file: none of its EXIF text survives
  assert.ok(!Buffer.from(r.dataUrl.split(',')[1], 'base64').toString('latin1').includes('GPS'));
});

test('a file that says it is a JPEG but is an SVG never reaches the decoder', async () => {
  const { env, calls } = fakeEnv();
  assert.deepEqual(await makeAvatar(file(svg, 'image/jpeg'), env), { problem: 'type' });
  assert.deepEqual(await makeAvatar(file(svg, 'image/svg+xml'), env), { problem: 'type' });
  assert.equal(calls.decoded.length, 0);
});

test('PNG when the page cannot encode WebP; a decoder failure or a huge image is said', async () => {
  let { env } = fakeEnv({ webp: false });
  assert.equal((await makeAvatar(file(png(300, 300), 'image/png'), env)).dataUrl, 'data:image/png;base64,iVBORw0KGgo=');
  ({ env } = fakeEnv({ decodeFails: true }));
  assert.deepEqual(await makeAvatar(file(png(300, 300), 'image/png'), env), { problem: 'decode' });
  //a JPEG whose header hides its size: the decoded size is checked too
  ({ env } = fakeEnv({ width: 20000, height: 20000 }));
  assert.deepEqual(await makeAvatar(file(bytes([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0])), env), { problem: 'dimensions' });
  assert.deepEqual(await makeAvatar(file(new Uint8Array(0)), env), { problem: 'type' });
  assert.deepEqual(await makeAvatar({ size: MAX_FILE_BYTES + 1 }, env), { problem: 'size' });
});
