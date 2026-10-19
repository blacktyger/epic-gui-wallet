/*
 * How the app starts the epic binaries (src/preload.js). Plain ESM without app imports, so it
 * runs under `node --test` (tests/spawnCommand.test.js).
 *
 * No shell, on every platform: Node passes each argument as it is (on Windows it quotes them for
 * the program's own argument parser), so a password or a path with spaces, & | ^ % ! or quotes
 * reaches epic-wallet unchanged. Through cmd.exe (shell: true) those broke the command or were
 * read by cmd.exe, and the recorded pid was the cmd.exe wrapper, not the binary.
 */

/* the executable path: surrounding quotes, from callers that still add them for a shell, removed */
export function plainBin(cmd) {
  const s = String(cmd == null ? '' : cmd).trim();
  return s.length >= 2 && s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s;
}

/* spawn(cmd, args, options) for an epic binary; the arguments are never quoted or changed.
   cwd: epic-wallet 4.1.0 reads an epic-wallet.toml in its working dir before the one in -c, so the
   wallet runs in its own config dir (and the node in its node dir), never in an older GUI's
   folder or wherever the app was started from */
export function spawnCommand(cmd, args, { cwd } = {}) {
  return {
    cmd: plainBin(cmd),
    args: (args || []).map(a => String(a)),
    //windowsHide: no console window for the child, as cmd.exe did not show one either
    options: { shell: false, windowsHide: true, ...(cwd ? { cwd: String(cwd) } : {}) },
  };
}

/* the working dir for an epic spawn, from its arguments: the wallet's config dir (-c), else the
   node's folder (the dir of --config_file); '' when neither is given. A password ("-c" is one)
   is skipped with its flag. */
export function epicCwd(args) {
  const a = [];
  const list = Array.isArray(args) ? args.map(x => plainBin(x)) : [];
  for (let i = 0; i < list.length; i++) {
    if (['--pass', '--password', '-p'].includes(list[i])) { i++; continue; }
    a.push(list[i]);
  }
  const after = (flag) => { const i = a.indexOf(flag); return i >= 0 && i + 1 < a.length ? a[i + 1] : ''; };
  if (after('-c')) return after('-c');
  const m = after('--config_file').match(/^(.*)[\\/][^\\/]+$/);
  return m ? m[1] : '';
}
