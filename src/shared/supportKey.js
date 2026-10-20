/*
 * The developer's public key for support reports (src/shared/supportBundle.js). Only the public half
 * is in the app: the private key stays with the developer (~/.config/epic-gui-support/, never in
 * git). Rotating it: docs/support/KEYS.md.
 */
export const SUPPORT_PUBLIC_KEY = 'YM65I1OjO76rTaLGRAbLux2+rIObMMd+3v092QufNSU=';
export const SUPPORT_KEY_ID = 'd9749febd701c2fe';

/* where reports are sent (the feedback bot's intake, docs/support/INTAKE.md); '' until it is live:
   the app then offers "Save encrypted report to a file" only */
export const SUPPORT_URL = '';

/* the intake URL: EPIC_SUPPORT_URL (tests, a staging instance) when it is https or on this machine,
   else SUPPORT_URL */
export function supportUrl(env = {}) {
  const v = typeof env.EPIC_SUPPORT_URL === 'string' ? env.EPIC_SUPPORT_URL.trim() : '';
  if (v) {
    try {
      const u = new URL(v);
      if (u.protocol === 'https:' || (u.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname))) return u.href;
    } catch (e) { /* not a URL: ignored */ }
  }
  return SUPPORT_URL;
}
