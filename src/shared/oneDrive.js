/*
 * Is a folder inside OneDrive? With Known Folder Move, Windows puts Desktop and Documents in
 * OneDrive, so a "Desktop" folder picked for wallets is synced. Sync can damage the wallet's
 * SQLite database while it is open, a second PC makes conflict copies, online-only files can't be
 * opened, and the built-in node's chain data would sync without end.
 *
 * Detected by the OneDrive roots Windows sets in the environment (OneDrive, OneDriveConsumer,
 * OneDriveCommercial; the preload passes them in), and by a path segment named like a OneDrive
 * root ("OneDrive", "OneDrive - Contoso", macOS "OneDrive-Personal"). Pure, unit-tested.
 * returns the OneDrive root the folder is in, or '' when it isn't
 */

const ONEDRIVE_SEGMENT = /^OneDrive(\s*-.*)?$/i;

function normalise(p, windows){
  let s = String(p || '').trim().replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
  return windows ? s.toLowerCase() : s;
}

export function oneDriveRootOf(dir, { roots = [], platform = 'linux' } = {}){
  const windows = platform == 'win';
  const target = normalise(dir, windows);
  if(!target){
    return '';
  }
  for(const root of roots){
    const r = normalise(root, windows);
    if(r && (target == r || target.startsWith(r + '/'))){
      return String(root).trim();
    }
  }
  //a OneDrive root that is not in the environment (another user's, or not signed in yet)
  const parts = String(dir).trim().split(/[\\/]+/);
  for(let i = 0; i < parts.length; i++){
    if(ONEDRIVE_SEGMENT.test(parts[i])){
      return parts.slice(0, i + 1).join(windows ? '\\' : '/');
    }
  }
  return '';
}
