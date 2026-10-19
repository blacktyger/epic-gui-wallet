/*
 * What the status displays say about Epicbox: the server our listener is really on (its own
 * output, store.state.epicbox), not the saved setting. Used by the Receive pages (both themes),
 * the BT Labs Overview Status card, sidebar and Settings. Plain ESM (tests/epicbox.test.js).
 *
 * kind: 'listening' | 'connecting' | 'starting' | 'paused' | 'checking' | 'off'
 * server: the server for people (epicbox.epicnet.us), '' when unknown
 * checking: the old server being checked after a switch
 */
import { serverFromUrl, serverLabel } from './epicboxConfig.js';

function label(url) {
  const s = serverFromUrl(url);
  return s ? serverLabel(s) : '';
}

export function epicboxStatus(epicbox, epicboxOn) {
  const e = epicbox || {};
  const server = label(e.server);
  switch (e.state) {
    case 'checking_old':
      return { kind: 'checking', server, checking: label(e.checking) };
    case 'starting':
    case 'switching':
      return { kind: 'starting', server };
    case 'connecting':
      return { kind: 'connecting', server };
    case 'paused':
      return { kind: 'paused', server };
    case 'listening':
      return { kind: 'listening', server };
    default:
      //no event seen (yet): the service flag alone
      return epicboxOn ? { kind: 'listening', server } : { kind: 'off', server: '' };
  }
}
