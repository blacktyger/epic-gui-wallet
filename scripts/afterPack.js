/*
 * electron-builder afterPack hook (vue.config.js builderOptions.afterPack), run on the unpacked
 * app before the AppImage / installer is made.
 *
 * Linux: strips the helper binaries in resources/bin/linux (epic, epic-wallet, ...). The upstream
 * releases ship with .symtab/.strtab (about 8.5 MB for epic and epic-wallet); nothing reads them.
 * The repo keeps the upstream files as they are, so their hashes can still be compared with the
 * upstream releases. Fails the build when strip is missing or fails: scripts/package-check.js
 * would reject the package anyway.
 * Windows binaries come stripped (to an external PDB that is not shipped); mac is left alone.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function isElf(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const head = Buffer.alloc(4);
    fs.readSync(fd, head, 0, 4, 0);
    return head.equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]));
  } finally {
    fs.closeSync(fd);
  }
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'linux') return;
  const dir = path.join(context.appOutDir, 'resources', 'bin', 'linux');
  if (!fs.existsSync(dir)) throw new Error('afterPack: ' + dir + ' not found');
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    if (!fs.statSync(file).isFile() || !isElf(file)) continue;
    const before = fs.statSync(file).size;
    execFileSync('strip', ['--strip-all', file], { stdio: 'inherit' });
    console.log('  • afterPack: stripped ' + name + ' ' + before + ' -> ' + fs.statSync(file).size + ' bytes');
  }
};
