/*
 * A contact's own picture, made safe before it is kept. The user picks a local file (an <input
 * type=file> in the page, so no file path or fs access is involved); the page then
 *
 *   1. refuses anything but a PNG, JPEG, WebP or GIF by its first bytes (never by its name or the
 *      type the system reports): no SVG (it can carry script), no HEIC, no "image" that is HTML;
 *   2. refuses a file over MAX_FILE_BYTES, and an image whose header says more than MAX_PIXELS
 *      (a small file can declare a huge image that would fill memory when decoded);
 *   3. decodes it (createImageBitmap, in the sandboxed renderer), crops the middle square and
 *      draws it on an AVATAR_SIZE canvas, then re-encodes that as WebP (PNG if WebP encoding is
 *      missing). Only those pixels are kept: EXIF (GPS position, camera, date), ICC and other
 *      metadata, comments and any trailing data of the original are gone.
 *
 * The result is a data: URL of a few KB (img-src allows data: in the CSP), stored in the app's own
 * data (shared/contactAvatars.js), never a reference to the original file. Nothing is ever fetched.
 *
 * The byte checks are pure and unit-tested (tests/avatarImage.test.js); makeAvatar() needs a page.
 */

export const AVATAR_SIZE = 128;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_PIXELS = 50 * 1000 * 1000;
/* a stored picture larger than this is not one we made (128 px WebP is ~3-12 KB, PNG ~20-40 KB) */
export const MAX_DATA_URL_CHARS = 96 * 1024;
export const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';

const u8 = (b) => (b instanceof Uint8Array ? b : new Uint8Array(b));
const ascii = (b, at, n) => String.fromCharCode(...b.subarray(at, at + n));

/* 'png' | 'jpeg' | 'webp' | 'gif' from the first bytes, or null (SVG, HTML, BMP, HEIC, anything else) */
export function sniffImageType(bytes) {
  const b = u8(bytes);
  if (b.length >= 8 && b[0] == 0x89 && ascii(b, 1, 3) == 'PNG' && b[4] == 0x0d && b[5] == 0x0a && b[6] == 0x1a && b[7] == 0x0a) return 'png';
  if (b.length >= 3 && b[0] == 0xff && b[1] == 0xd8 && b[2] == 0xff) return 'jpeg';
  if (b.length >= 12 && ascii(b, 0, 4) == 'RIFF' && ascii(b, 8, 4) == 'WEBP') return 'webp';
  if (b.length >= 6 && (ascii(b, 0, 6) == 'GIF87a' || ascii(b, 0, 6) == 'GIF89a')) return 'gif';
  return null;
}

/* {width, height} the header declares, or null when it can't be read from these bytes */
export function imageDimensions(bytes, type = sniffImageType(bytes)) {
  const b = u8(bytes);
  const be16 = (i) => (b[i] << 8) | b[i + 1];
  const be32 = (i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
  const le16 = (i) => b[i] | (b[i + 1] << 8);
  const le24 = (i) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
  if (type == 'png') {
    if (b.length < 24 || ascii(b, 12, 4) != 'IHDR') return null;
    return { width: be32(16), height: be32(20) };
  }
  if (type == 'gif') {
    if (b.length < 10) return null;
    return { width: le16(6), height: le16(8) };
  }
  if (type == 'webp') {
    if (b.length < 30) return null;
    const chunk = ascii(b, 12, 4);
    if (chunk == 'VP8X') return { width: le24(24) + 1, height: le24(27) + 1 };
    if (chunk == 'VP8L' && b[20] == 0x2f) {
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    if (chunk == 'VP8 ' && b[23] == 0x9d && b[24] == 0x01 && b[25] == 0x2a) {
      return { width: le16(26) & 0x3fff, height: le16(28) & 0x3fff };
    }
    return null;
  }
  if (type == 'jpeg') {
    //walk the segments to the first start-of-frame (SOF0..SOF15 except DHT, JPG, DAC)
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] != 0xff) return null;
      const m = b[i + 1];
      if (m == 0xff) { i++; continue; }
      if (m == 0xd8 || m == 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      const len = be16(i + 2);
      if (m >= 0xc0 && m <= 0xcf && m != 0xc4 && m != 0xc8 && m != 0xcc) {
        return { width: be16(i + 7), height: be16(i + 5) };
      }
      if (len < 2) return null;
      i += 2 + len;
    }
    return null;
  }
  return null;
}

/* why a picked file can't be a picture, or null: 'type' | 'size' | 'dimensions'.
   bytes: the whole file (or at least its first 64 KB, where a JPEG's frame header normally is) */
export function avatarFileProblem(bytes, size = u8(bytes).length) {
  const type = sniffImageType(bytes);
  if (!type) return 'type';
  if (!(size > 0) || size > MAX_FILE_BYTES) return 'size';
  const d = imageDimensions(bytes, type);
  //a JPEG whose frame header is not found: the decoder still has to succeed, and the size cap holds
  if (d && (!d.width || !d.height || d.width * d.height > MAX_PIXELS)) return 'dimensions';
  return null;
}

/* the middle square of a w × h image, as drawImage's source rectangle */
export function cropSquare(w, h) {
  const side = Math.min(w, h);
  return { sx: Math.floor((w - side) / 2), sy: Math.floor((h - side) / 2), side };
}

/* a picture this app made: a base64 PNG, JPEG or WebP data: URL of a sane size, nothing else (no SVG,
   no URL to fetch, no file path) */
export function isSafeAvatarDataUrl(s) {
  return typeof s == 'string' && s.length <= MAX_DATA_URL_CHARS &&
    /^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(s);
}

/* a picked File → { dataUrl } or { problem: 'type' | 'size' | 'dimensions' | 'decode' }.
   env: the page's createImageBitmap and document (injectable for tests) */
export async function makeAvatar(file, env = window) {
  if (!file || !(file.size > 0)) return { problem: 'type' };
  if (file.size > MAX_FILE_BYTES) return { problem: 'size' };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const problem = avatarFileProblem(bytes, file.size);
  if (problem) return { problem };
  const type = sniffImageType(bytes);
  let bitmap;
  try {
    //a Blob of the checked bytes with the sniffed type: the decoder never sees the file's own type
    const blob = new Blob([bytes], { type: 'image/' + type });
    bitmap = await env.createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch (e) {
    return { problem: 'decode' };
  }
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > MAX_PIXELS) return { problem: 'dimensions' };
    const canvas = env.document.createElement('canvas');
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const { sx, sy, side } = cropSquare(bitmap.width, bitmap.height);
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
    let dataUrl = canvas.toDataURL('image/webp', 0.86);
    if (!dataUrl.startsWith('data:image/webp')) dataUrl = canvas.toDataURL('image/png');
    return isSafeAvatarDataUrl(dataUrl) ? { dataUrl } : { problem: 'decode' };
  } finally {
    if (bitmap && bitmap.close) bitmap.close();
  }
}
