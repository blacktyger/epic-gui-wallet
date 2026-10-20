/*
 * The window.* APIs src/preload.js exposes, as vi.fn fakes with harmless defaults. A test changes
 * a default with window.x.y.mockResolvedValue(...) and checks the calls.
 */
import { vi } from 'vitest';

export function installWindowFakes() {
  window.clipboard = {
    writeText: vi.fn(async () => {}),
    copySecret: vi.fn(async () => {}),
    wipeSecret: vi.fn(async () => {}),
  };
  window.config = {
    getPublicIp: vi.fn(async () => ({ ip: '203.0.113.7' })),
    isPortReachable: vi.fn(async () => true),
  };
  window.nodeQr = { toCanvas: vi.fn((canvas, text, cb) => { if (cb) cb(null); }) };
  window.api = {
    showSaveDialog: vi.fn(async () => ({ canceled: true })),
    nodeDirectory: vi.fn(async () => null),
  };
  window.nodeChildProcess = {
    clearSessionPassword: vi.fn(async () => {}),
    kill: vi.fn(async () => true),
  };
  window.nodeFs = {};
  window.nodePath = { join: (...parts) => parts.join('/') };
}
