/* English strings of the Modern interface, msg.modern.*. One file per screen group so the
 * screens can be worked on separately; other languages fall back to English (i18n.js). */
import core from './core';
import unlock from './unlock';
import overview from './overview';
import send from './send';
import settings from './settings';

export default Object.assign({}, core, { unlock, overview, send, settings });
