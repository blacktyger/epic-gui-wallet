/*
 * Vue component tests (npm run test:components): both interfaces' screens mounted in happy-dom,
 * the preload's window.* APIs, the store, the router and the wallet services replaced by fakes
 * (tests/components/support). Files are *.spec.js so `npm test` (node --test "tests/**\/*.test.js")
 * never picks them up.
 */
import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root,
  plugins: [vue()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('../../src', import.meta.url)) },
    //the components import each other without the .vue extension (webpack resolves it)
    extensions: ['.mjs', '.js', '.json', '.vue'],
  },
  test: {
    environment: 'happy-dom',
    include: ['tests/components/**/*.spec.js'],
    setupFiles: ['tests/components/support/setup.js'],
    restoreMocks: true,
    testTimeout: 10000,
  },
});
