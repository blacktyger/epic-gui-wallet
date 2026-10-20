/* English strings of the Modern interface, msg.modern.*. One file per screen group so the
 * screens can be worked on separately; other languages fall back to English (i18n.js). */
import core from './core.js';
import unlock from './unlock.js';
import overview from './overview.js';
import send from './send.js';
import settings from './settings.js';

export default Object.assign({}, core, { unlock, overview, send, settings });
