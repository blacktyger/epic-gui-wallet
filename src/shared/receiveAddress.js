/*
 * What the Receive pages (both interfaces) show for the Epic address (QA T09). The address is the
 * wallet's key plus the Epicbox domain: the wallet knows it while the listener is stopped too, and
 * payments sent to it wait on Epicbox until the listener runs. So it is shown whenever it is known,
 * dimmed while nothing receives on it, and Copy and QR keep working. Plain ESM (tests/receiveAddress.test.js).
 *
 * state: 'receiving' | 'off' (listener stopped) | 'paused' (listener on, Epicbox not running)
 *      | 'unknown' (the address could not be read) | 'unconfigured' (no address, and the Epicbox domain is set to '')
 */
export function epicAddressView({ address, domain, listening, epicbox }) {
  if (!address) return { state: domain === '' ? 'unconfigured' : 'unknown', show: false, dim: false };
  if (!listening) return { state: 'off', show: true, dim: true };
  if (!epicbox) return { state: 'paused', show: true, dim: true };
  return { state: 'receiving', show: true, dim: false };
}
