/*
 * The developer's public key for support reports (src/shared/supportBundle.js). Only the public half
 * is in the app: the private key stays with the developer (~/.config/epic-gui-support/, never in
 * git). Rotating it: docs/support/KEYS.md.
 */
export const SUPPORT_PUBLIC_KEY = 'YM65I1OjO76rTaLGRAbLux2+rIObMMd+3v092QufNSU=';
export const SUPPORT_KEY_ID = 'd9749febd701c2fe';

/* where reports are sent: the support intake on support.btlabs.uk (docs/SUPPORT.md). '' would leave
   "Save to file" only */
export const SUPPORT_URL = 'https://support.btlabs.uk/v1/report';

/* the intake URL: EPIC_SUPPORT_URL (the e2e gate, a local instance) when it is on this machine, or
   an https staging instance in a development build only; else SUPPORT_URL */
export function supportUrl(env = {}, { packaged = true } = {}) {
  const v = typeof env.EPIC_SUPPORT_URL === 'string' ? env.EPIC_SUPPORT_URL.trim() : '';
  if (v) {
    try {
      const u = new URL(v);
      const local = u.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname);
      if (local || (u.protocol === 'https:' && !packaged)) return u.href;
    } catch (e) { /* not a URL: ignored */ }
  }
  return SUPPORT_URL;
}
