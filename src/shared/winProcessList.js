/*
 * The process list on Windows, for the process record (shared/processOwnership.js), in place of
 * find-process there.
 *
 * find-process 1.4 runs `Get-CimInstance win32_process | select ...` and parses the text PowerShell
 * formats it to (Format-List). That text wraps long values at the console width, and find-process
 * joins the wrapped lines without the space PowerShell broke them at. A listener's command line
 * holds two wallet paths, so it is long enough to wrap: then it read e.g. "...\w3listen --method http"
 * or "--methodepicbox", no longer the command line the app recorded, so Lock, a wallet switch and
 * Quit did not find that listener and it kept running (6.1.5 on the Windows rig, about one command
 * line in ten). Here PowerShell writes JSON, which is never wrapped.
 *
 * No Electron or DOM imports: it runs under `node --test` (tests/winProcessList.test.js).
 */

//the pattern goes in by environment variable: no quoting of it in the command
export const PS_LIST = [
  "$ErrorActionPreference = 'Stop'",
  '[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false',
  '$re = $env:EPIC_PROC_PATTERN',
  '$rows = @(Get-CimInstance -ClassName Win32_Process | Where-Object { ([string]$_.CommandLine) -match $re -or ([string]$_.Name) -match $re } | ForEach-Object {',
  '  [pscustomobject]@{ pid = [int]$_.ProcessId; ppid = [int]$_.ParentProcessId; name = [string]$_.Name; bin = [string]$_.ExecutablePath; cmd = [string]$_.CommandLine }',
  '})',
  "'EPIC_PROCS ' + (ConvertTo-Json -InputObject $rows -Compress -Depth 2)",
].join('\n');

const LIST_TIMEOUT_MS = 30000;

/* the rows of PS_LIST's output, as find-process gives them: {pid, ppid, name, bin, cmd} */
export function parseProcessJson(stdout) {
  const text = String(stdout == null ? '' : stdout);
  const m = /^EPIC_PROCS (.*)$/m.exec(text);
  if (!m) throw new Error('process list: no answer from PowerShell');
  const data = JSON.parse(m[1]);
  //Windows PowerShell 5.1 can wrap an array as {value: [...], Count: n}
  const rows = Array.isArray(data) ? data : (data && Array.isArray(data.value) ? data.value : [data]);
  return rows.filter(r => r && Number.isInteger(r.pid) && r.pid > 0).map(r => ({
    pid: r.pid,
    ppid: Number.isInteger(r.ppid) ? r.ppid : 0,
    name: typeof r.name === 'string' ? r.name : '',
    bin: typeof r.bin === 'string' ? r.bin : '',
    cmd: typeof r.cmd === 'string' ? r.cmd : '',
  }));
}

/* findProcess('name', pattern) as find-process has it, for Windows only. pattern: a RegExp (or a
   string, matched as find-process does: anywhere in the command line, else the name).
   run(file, args, opts) → Promise<{stdout}> (child_process.execFile); env: process.env */
export function createWinFindProcess({ run, env = {} }) {
  const root = env.SystemRoot || env.SYSTEMROOT || 'C:\\Windows';
  const ps = root.replace(/[\\/]+$/, '') + '\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
  const encoded = Buffer.from(PS_LIST, 'utf16le').toString('base64');
  return async function findProcess(type, pattern) {
    if (type !== 'name') throw new Error('process list: only by name');
    const re = pattern instanceof RegExp ? pattern : new RegExp(String(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    //PowerShell's -match is case-insensitive; the same test again here, with the flags of re
    const { stdout } = await run(ps, ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
      { timeout: LIST_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024, env: { ...env, EPIC_PROC_PATTERN: re.source } });
    return parseProcessJson(stdout).filter(p => re.test(p.cmd || p.name));
  };
}
