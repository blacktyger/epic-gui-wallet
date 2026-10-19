// A tiny read-only Windows fs for the scan tests (tests/legacyScan.test.js, walletFolder, chainData).
import path from 'node:path';

const W = path.win32;

/* a tiny Windows fs: paths are case-insensitive, realpath returns the path as asked (like Node) */
export function fakeWinFs(files) {
  const nodes = new Map();
  const key = (p) => W.resolve(p).toLowerCase();
  const addDir = (p) => {
    for (let d = W.resolve(p); ; d = W.dirname(d)) {
      if (!nodes.has(key(d))) nodes.set(key(d), { dir: true, name: W.basename(d) });
      if (W.dirname(d) === d) break;
    }
  };
  for (const [p, content] of Object.entries(files)) {
    if (content === null) { addDir(p); continue; }
    addDir(W.dirname(p));
    nodes.set(key(p), { dir: false, name: W.basename(p), content });
  }
  const get = (p) => { const n = nodes.get(key(p)); if (!n) throw Object.assign(new Error('ENOENT ' + p), { code: 'ENOENT' }); return n; };
  const write = () => { throw new Error('read only'); };
  return {
    existsSync: (p) => nodes.has(key(p)),
    readFileSync: (p) => { const n = get(p); if (n.dir) throw new Error('EISDIR'); return n.content; },
    statSync: (p) => { const n = get(p); return { mtimeMs: Date.UTC(2025, 0, 2), size: n.dir ? 0 : n.content.length, isDirectory: () => n.dir }; },
    realpathSync: (p) => { get(p); return W.resolve(p); },
    readdirSync: (p) => {
      const k = key(p);
      get(p);
      return [...nodes.entries()].filter(([c]) => W.dirname(c) === k && c !== k)
        .map(([, n]) => ({ name: n.name, isDirectory: () => n.dir, isFile: () => !n.dir }));
    },
    writeFileSync: write, mkdirSync: write, renameSync: write, rmSync: write,
  };
}

