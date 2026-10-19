'use strict';

/*
 * The one-line warning that a node on this computer is heavy (CPU, memory, disk): shown once, when
 * a save switches the built-in node on, or switches background sync on while the built-in node is
 * used. Never with an external node, and not again on later saves or starts.
 * before / after: {internal, background} as saved before and by this save.
 */
export function nodeLoadWarning(before, after) {
  if (!after || !after.internal) return false;
  const was = before || {};
  return !was.internal || (!!after.background && !was.background);
}
