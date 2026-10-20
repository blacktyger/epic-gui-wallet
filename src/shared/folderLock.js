/*
 * Is another program using this folder? (tester item #33) Decided by TRYING the lock each Epic
 * program holds while it runs, never by a lock file being there: every one of these files stays on
 * disk after the program exits (checked with the bundled 4.1.0 binaries: chain_data/epic.lock,
 * lmdb/lock.mdb, epic.db-shm and epic.db-wal all stay after a kill).
 * Plain ESM; fs, path, the platform and the process runner are passed in (tests/folderLock.test.js).
 * The main process runs it (background.js 'folder-lock', and the chain scan for the chain data offer).
 *
 * Which lock, per file (from the sources, and /proc/locks of the running 4.1.0 binaries on Linux):
 *   chain_data/epic.lock            epic node: fs2 try_lock_exclusive (servers/src/epic/server.rs
 *                                   one_epic_at_a_time). Unix: flock(LOCK_EX|LOCK_NB) on the whole
 *                                   file; Windows: LockFileEx(EXCLUSIVE|FAIL_IMMEDIATELY) on bytes
 *                                   0 .. 2^64-1. Held as long as the node runs.
 *   chain_data/lmdb/lock.mdb,       LMDB (the node's chain and peer stores; wallets of epic-wallet 3.x
 *   chain_data/peer/lock.mdb,       in wallet_data/db/lmdb). mdb.c mdb_env_excl_lock: Unix fcntl
 *   wallet_data/db/lmdb/lock.mdb    F_SETLK on byte 0 (write while it is the only user, then read,
 *                                   kept until the env closes; robust-mutex and POSIX-semaphore
 *                                   builds alike), plus a write lock at offset <pid> per reader.
 *                                   Windows: LockFile / LockFileEx(shared) on byte 0.
 *   wallet_data/db/sqlite/epic.db   epic-wallet 4.x: SQLite in WAL mode. Every open connection holds
 *                                   SQLite's SHARED lock on the database file, bytes 0x40000002 +510
 *                                   (PENDING_BYTE+2, SHARED_SIZE), even when idle (WAL keeps it);
 *   …/epic.db-shm                   and a read lock on byte 128 of the -shm file (the DMS byte,
 *                                   WIN_SHM_DMS / UNIX_SHM_DMS). Unix: fcntl; Windows: LockFileEx.
 *                                   macOS uses fcntl for these on local disks too (SQLite's
 *                                   autolock picks posix locks for apfs/hfs; on SMB it uses flock,
 *                                   which this check does not see).
 *
 * flock and fcntl locks don't see each other (Linux since 2.0 except on NFS, macOS too), so each
 * file is tried with the kind its program takes:
 *   flock  flock(LOCK_EX|LOCK_NB); when it succeeds nobody held it, and it is unlocked at once
 *   fcntl  F_GETLK for a write lock on the whole file: it reports any other process's lock (read or
 *          write) and takes none. Our own process holds none of these (the probe is a child process).
 *   Windows: FileStream.Lock (LockFile, exclusive) on the program's own byte range, Unlock at once.
 *          LockFile ranges are mandatory, so the ranges are the lock bytes only, which the programs
 *          never read as data: the empty epic.lock's byte 0, lock.mdb byte 0, epic.db's SHARED
 *          range past the data, the -shm DMS byte. ERROR_LOCK_VIOLATION (33) = in use.
 * Files are opened read only (O_RDONLY|O_NONBLOCK; FileMode.Open with FileShare ReadWrite|Delete),
 * never created, never deleted, never written. A missing lock file: that program doesn't use the
 * folder.
 *
 * How: Node.js has no flock, fcntl or LockFileEx, so a short helper runs (no new dependency, nothing
 * to unpack from app.asar):
 *   Linux, macOS  perl (/usr/bin/perl: part of macOS, perl-base is essential on Debian/Ubuntu, most
 *                 other distributions have it). The script is passed with -e, the paths as arguments
 *                 (no shell). Linux without perl: /proc/locks (every lock on the machine, by device
 *                 and inode; only processes in our PID namespace, which is everything outside Flatpak).
 *   Windows       Windows PowerShell 5.1 (part of Windows), by its full path, -EncodedCommand; the
 *                 paths go in an environment variable as JSON, never into the script text.
 * When the check can't run (no helper, a time-out, an error reading a file): 'unknown'. What each
 * caller does with 'unknown' is its own choice (see the callers): removing files refuses.
 *
 * → check(kind, dir): { state: 'free' | 'locked' | 'unknown', files: [{file, state}], via }
 *   kind 'chain': dir is a chain_data folder; 'wallet': dir holds wallet_data (a chain_data beside it
 *   is not asked about).
 */

/* global BigInt */
export const KINDS = ['chain', 'wallet'];
export const PROBE_TIMEOUT_MS = { unix: 5000, win32: 15000 };

//SQLite's lock bytes (sqlite3.c os_unix.c / os_win.c)
const SQLITE_SHARED_FIRST = 0x40000000 + 2, SQLITE_SHARED_SIZE = 510, SQLITE_SHM_DMS = 128;

/* the files that tell, for a folder: {file, how: 'flock' | 'fcntl', range: [start, length] (Windows)} */
export function lockFiles(kind, dir, pathMod) {
  if (!KINDS.includes(kind)) throw new Error('folderLock: unknown kind ' + kind);
  const chain = (d) => [
    { file: pathMod.join(d, 'epic.lock'), how: 'flock', range: [0, 1] },
    { file: pathMod.join(d, 'lmdb', 'lock.mdb'), how: 'fcntl', range: [0, 1] },
    { file: pathMod.join(d, 'peer', 'lock.mdb'), how: 'fcntl', range: [0, 1] },
  ];
  if (kind === 'chain') return chain(dir);
  const db = pathMod.join(dir, 'wallet_data', 'db');
  return [
    { file: pathMod.join(db, 'sqlite', 'epic.db'), how: 'fcntl', range: [SQLITE_SHARED_FIRST, SQLITE_SHARED_SIZE] },
    { file: pathMod.join(db, 'sqlite', 'epic.db-shm'), how: 'fcntl', range: [SQLITE_SHM_DMS, 1] },
    { file: pathMod.join(db, 'lmdb', 'lock.mdb'), how: 'fcntl', range: [0, 1] },
  ];
  //not the chain_data a wallet folder may hold (~/.epic/main): nothing done to a wallet touches it,
  //and the app's own built-in node may run on it (Use this data), which would read as "in use"
}

/* one answer for a folder: in use when any file is; unknown when any couldn't be checked */
export function overall(states) {
  if (states.includes('locked')) return 'locked';
  if (states.includes('unknown')) return 'unknown';
  return 'free';
}

/*
 * Linux and macOS. Arguments "flock:<path>" / "fcntl:<path>"; prints "<n> free|locked|missing|error <errno>".
 * F_GETLK: start 0, length 0 (the whole file) and whence SEEK_SET are all zeros, so the request is a
 * zeroed buffer with only l_type set; l_type is the first field of struct flock on Linux (every
 * architecture) and follows l_start, l_len and l_pid (offset 20) on macOS and the BSDs. The buffer
 * is larger than either struct. A read-only fd is enough for F_GETLK on Linux; if a system says
 * otherwise (EBADF), the file is opened read-write instead (still never created or written).
 */
export const PERL_PROBE = `use strict; use warnings;
use Fcntl qw(O_RDONLY O_RDWR O_NONBLOCK F_GETLK F_WRLCK F_UNLCK LOCK_EX LOCK_NB LOCK_UN);
use Errno qw(ENOENT ENOTDIR EWOULDBLOCK EAGAIN EBADF EINVAL);
my $off = $^O eq 'linux' ? 0 : 20;
for my $i (0 .. $#ARGV) {
  my ($how, $f) = split /:/, $ARGV[$i], 2;
  my $fh;
  if (!sysopen($fh, $f, O_RDONLY | O_NONBLOCK)) { print "$i ", ($! == ENOENT || $! == ENOTDIR ? 'missing' : 'error ' . ($! + 0)), "\\n"; next; }
  if ($how eq 'flock') {
    if (flock($fh, LOCK_EX | LOCK_NB)) { flock($fh, LOCK_UN); print "$i free\\n"; }
    elsif ($! == EWOULDBLOCK || $! == EAGAIN) { print "$i locked\\n"; }
    else { print "$i error ", $! + 0, "\\n"; }
  } else {
    my $q = "\\0" x 64; substr($q, $off, 2) = pack('s', F_WRLCK);
    my $ok = fcntl($fh, F_GETLK, $q);
    if (!$ok && ($! == EBADF || $! == EINVAL)) { close $fh; $ok = sysopen($fh, $f, O_RDWR | O_NONBLOCK) && fcntl($fh, F_GETLK, $q); }
    if (!$ok) { print "$i error ", $! + 0, "\\n"; }
    else { print "$i ", (unpack('s', substr($q, $off, 2)) == F_UNLCK ? 'free' : 'locked'), "\\n"; }
  }
  close $fh;
}
`;

/*
 * Windows PowerShell 5.1. $env:EPIC_FOLDER_LOCK = {"items":[{"f": path, "s": start, "n": length}]};
 * prints "<n> free|locked|missing|error <win32 code>". FileStream.Lock is LockFile (exclusive): it
 * fails with ERROR_LOCK_VIOLATION when another handle holds any lock in the range; Unlock right after.
 * ERROR_SHARING_VIOLATION on open: another program opened the file for itself alone, also in use.
 */
export const PS_PROBE = `$ErrorActionPreference = 'Stop'
"mode $($ExecutionContext.SessionState.LanguageMode)"
$cfg = ConvertFrom-Json $env:EPIC_FOLDER_LOCK
$i = 0
foreach ($it in $cfg.items) {
  $r = 'error 0'
  try {
    $fs = [System.IO.File]::Open([string]$it.f, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]'ReadWrite, Delete')
    try {
      try { $fs.Lock([int64]$it.s, [int64]$it.n); $fs.Unlock([int64]$it.s, [int64]$it.n); $r = 'free' }
      catch { $e = $_.Exception; while ($e.InnerException) { $e = $e.InnerException }; $c = $e.HResult -band 0xFFFF; if ($c -eq 33) { $r = 'locked' } else { $r = "error $c" } }
    } finally { $fs.Dispose() }
  } catch {
    $e = $_.Exception; while ($e.InnerException) { $e = $e.InnerException }; $c = $e.HResult -band 0xFFFF
    if ($c -eq 2 -or $c -eq 3) { $r = 'missing' } elseif ($c -eq 32) { $r = 'locked' } else { $r = "error $c" }
  }
  "$i $r"
  $i++
}
`;

/* the helper's lines → one state per file; a line missing or garbled: 'unknown'. missing → 'free' */
export function parseProbe(stdout, count) {
  const out = new Array(count).fill('unknown');
  for (const line of String(stdout || '').split(/\r?\n/)) {
    const m = /^(\d+) (free|locked|missing|error)\b/.exec(line.trim());
    if (!m) continue;
    const i = Number(m[1]);
    if (i >= count) continue;
    out[i] = m[2] === 'missing' ? 'free' : m[2] === 'error' ? 'unknown' : m[2];
  }
  return out;
}

/* /proc/locks → [{type: 'FLOCK' | 'POSIX' | 'OFDLCK' | …, major, minor, ino}] (held locks only; "->" lines wait) */
export function parseProcLocks(text) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    const m = /^\d+:\s+(\S+)\s+\S+\s+\S+\s+\S+\s+([0-9a-f]+):([0-9a-f]+):(\d+)\s/i.exec(line);
    if (!m || m[1] === '->') continue;
    out.push({ type: m[1], major: parseInt(m[2], 16), minor: parseInt(m[3], 16), ino: BigInt(m[4]) });
  }
  return out;
}

/* a Linux dev_t (glibc's encoding) → major, minor */
export function devParts(dev) {
  const d = BigInt(dev);
  const b = (n) => BigInt(n);
  return { major: Number(((d >> b(8)) & b(0xfff)) | ((d >> b(32)) & b(0xfffff000))), minor: Number((d & b(0xff)) | ((d >> b(12)) & b(0xffffff00))) };
}

/* /proc/locks says whether a file (stat with bigint: true) is locked the way `how` means. Device 0:x
   (btrfs subvolumes, overlayfs) is not always the one /proc/locks prints: then the inode alone
   decides, which can only err towards "locked" */
export function procLocked(entries, st, how) {
  const { major, minor } = devParts(st.dev);
  const types = how === 'flock' ? ['FLOCK'] : ['POSIX', 'OFDLCK'];
  return entries.some(e => types.includes(e.type) && e.ino === BigInt(st.ino)
    && ((e.major === major && e.minor === minor) || e.major === 0 || major === 0));
}

/*
 * fs: statSync, readFileSync, existsSync; pathMod: path for the platform; platform: process.platform;
 * run(file, args, {timeout, env}) → Promise<{stdout}> (rejects when it can't run or fails);
 * env: process.env (SystemRoot, PATH); log(msg).
 */
export function createFolderLock({ fs, pathMod, platform, run, env = {}, log = () => {} }) {
  const tryDo = (f, fallback) => { try { return f(); } catch (e) { return fallback; } };

  async function viaPerl(targets) {
    const perl = tryDo(() => fs.existsSync('/usr/bin/perl'), false) ? '/usr/bin/perl' : 'perl';
    const { stdout } = await run(perl, ['-e', PERL_PROBE, '--', ...targets.map(t => t.how + ':' + t.file)],
      { timeout: PROBE_TIMEOUT_MS.unix, env: { PATH: env.PATH || '/usr/bin:/bin', LC_ALL: 'C' } });
    return parseProbe(stdout, targets.length);
  }

  async function viaPowerShell(targets) {
    const root = env.SystemRoot || env.SYSTEMROOT || 'C:\\Windows';
    const ps = pathMod.join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const encoded = Buffer.from(PS_PROBE, 'utf16le').toString('base64');
    const items = targets.map(t => ({ f: t.file, s: t.range[0], n: t.range[1] }));
    //no -ExecutionPolicy: it applies to script files only, not to a command
    const { stdout } = await run(ps, ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
      { timeout: PROBE_TIMEOUT_MS.win32, env: { ...env, EPIC_FOLDER_LOCK: JSON.stringify({ items }) } });
    const states = parseProbe(stdout, targets.length);
    //Constrained Language Mode (AppLocker, WDAC) refuses the .NET calls: every file 'unknown'
    const mode = (/^mode (\S+)/m.exec(String(stdout || '')) || [])[1] || '?';
    if (states.includes('unknown')) log('folderLock: powershell answered unknown, language mode ' + mode);
    return states;
  }

  function viaProcLocks(targets) {
    const entries = parseProcLocks(fs.readFileSync('/proc/locks', 'utf8'));
    return targets.map(t => {
      const st = tryDo(() => fs.statSync(t.file, { bigint: true }), null);
      if (!st) return 'free';
      return procLocked(entries, st, t.how) ? 'locked' : 'free';
    });
  }

  async function check(kind, dir) {
    if (!KINDS.includes(kind) || typeof dir !== 'string' || !dir || !pathMod.isAbsolute(dir)) {
      return { state: 'unknown', files: [], via: 'none' };
    }
    //only files that are there are asked about: no lock file, not used by that program
    const all = lockFiles(kind, pathMod.resolve(dir), pathMod);
    const targets = [], files = [];
    for (const t of all) {
      let st = null, err = null;
      try { st = fs.statSync(t.file); } catch (e) { err = e; }
      //only "not there" is free; a file that can't be read (EACCES) can't tell
      const gone = err && (err.code ? ['ENOENT', 'ENOTDIR'].includes(err.code) : !tryDo(() => fs.existsSync(t.file), true));
      if (!st && gone) continue;
      //there but not a plain file, or not readable: can't tell
      if (!st || !st.isFile()) { files.push({ file: t.file, state: 'unknown' }); continue; }
      targets.push(t);
    }
    if (!targets.length) return { state: overall(files.map(f => f.state)), files, via: 'none' };

    let states = null, via = '';
    try {
      if (platform === 'win32') { via = 'powershell'; states = await viaPowerShell(targets); }
      else { via = 'perl'; states = await viaPerl(targets); }
    } catch (e) {
      log('folderLock: ' + via + ' could not run: ' + (e && (e.code || e.message) || e));
      states = null;
    }
    if (!states && platform === 'linux') {
      try { via = 'proc'; states = viaProcLocks(targets); }
      catch (e) { log('folderLock: /proc/locks: ' + (e && (e.code || e.message) || e)); states = null; }
    }
    if (!states) { via = 'none'; states = targets.map(() => 'unknown'); }
    targets.forEach((t, i) => files.push({ file: t.file, state: states[i] }));
    return { state: overall(files.map(f => f.state)), files, via };
  }

  return { check };
}
