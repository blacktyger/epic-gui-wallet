/*
 * Stopping the app's own epic processes (owner API, listeners, scan, pty children) once, on
 * every way out: a quit (menu, window close, app.quit, before-quit, will-quit) and SIGTERM, SIGINT
 * and SIGHUP. `stop` is background.js's stopOwnProcesses (only processes in the process record,
 * by pid: see processOwnership.js). The first call starts it, every later one waits for the same run.
 *
 * No Electron imports, so it runs under `node --test` (tests/shutdown.test.js).
 */

export const SIGNALS = ['SIGTERM', 'SIGINT', 'SIGHUP'];

export function createShutdown({ stop, quit, exit, log = () => {}, graceMs = 15000, setTimer = setTimeout }) {
  let running = null;
  let done = false;

  function run() {
    if (!running) {
      running = Promise.resolve().then(stop).catch((e) => log('shutdown: ' + (e && e.message)))
        .then(() => { done = true; });
    }
    return running;
  }

  return {
    run,
    get done() { return done; },
    /* before-quit / will-quit: hold the quit until the processes are stopped, then quit again */
    onQuitEvent(event) {
      if (done) return;
      event.preventDefault();
      run().then(() => quit());
    },
    /* a signal: stop them, then quit; exit anyway if the quit doesn't end in time */
    onSignal(signal) {
      log('shutdown: ' + signal);
      const timer = setTimer(() => exit(0), graceMs);
      if (timer && timer.unref) timer.unref();
      run().then(() => quit());
    },
  };
}
