// Wallet folder in OneDrive (Known Folder Move puts Desktop and Documents there). npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { oneDriveRootOf } from '../src/shared/oneDrive.js';

const win = { platform: 'win' };

test('a Desktop folder redirected into OneDrive (the user report) is detected', () => {
  assert.equal(oneDriveRootOf('C:\\Users\\Marv\\OneDrive\\Desktop\\EpicCash_Wallets', { ...win, roots: ['C:\\Users\\Marv\\OneDrive'] }),
    'C:\\Users\\Marv\\OneDrive');
  //no env var (not signed in, or another user's folder): the folder name still gives it away
  assert.equal(oneDriveRootOf('C:\\Users\\Marv\\OneDrive\\Desktop\\EpicCash_Wallets', win), 'C:\\Users\\Marv\\OneDrive');
});

test('work and school OneDrive, and roots with another name from the environment', () => {
  assert.equal(oneDriveRootOf('C:\\Users\\a\\OneDrive - Contoso Ltd\\Documents\\w', win), 'C:\\Users\\a\\OneDrive - Contoso Ltd');
  assert.equal(oneDriveRootOf('D:\\Sync\\Docs\\wallets', { ...win, roots: ['D:\\Sync'] }), 'D:\\Sync');
  //case and separators don't matter on Windows
  assert.equal(oneDriveRootOf('d:/sync/docs', { ...win, roots: ['D:\\Sync\\'] }), 'D:\\Sync\\');
  assert.equal(oneDriveRootOf('D:\\Sync', { ...win, roots: ['D:\\Sync'] }), 'D:\\Sync');
});

test('macOS CloudStorage OneDrive', () => {
  assert.equal(oneDriveRootOf('/Users/a/Library/CloudStorage/OneDrive-Personal/w', { platform: 'mac' }),
    '/Users/a/Library/CloudStorage/OneDrive-Personal');
});

test('folders outside OneDrive are not flagged', () => {
  assert.equal(oneDriveRootOf('C:\\Users\\Marv\\.epic', { ...win, roots: ['C:\\Users\\Marv\\OneDrive'] }), '');
  assert.equal(oneDriveRootOf('C:\\Users\\Marv\\Desktop\\EpicCash_Wallets', { ...win, roots: ['C:\\Users\\Marv\\OneDrive'] }), '');
  //a sibling whose name only starts like the root
  assert.equal(oneDriveRootOf('D:\\SyncOther\\w', { ...win, roots: ['D:\\Sync'] }), '');
  assert.equal(oneDriveRootOf('C:\\Users\\a\\OneDriveTemp\\w', win), '');
  assert.equal(oneDriveRootOf('/home/a/.epic', { platform: 'linux' }), '');
  assert.equal(oneDriveRootOf('', win), '');
  assert.equal(oneDriveRootOf(undefined, win), '');
});

test('Linux and macOS paths are case-sensitive for env roots', () => {
  assert.equal(oneDriveRootOf('/home/a/sync/w', { platform: 'linux', roots: ['/home/a/Sync'] }), '');
  assert.equal(oneDriveRootOf('/home/a/Sync/w', { platform: 'linux', roots: ['/home/a/Sync', ''] }), '/home/a/Sync');
});
