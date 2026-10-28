import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // Full parallelism on a loaded machine timed out slow tests at the 5 s default (e.g. phrasing.test.ts and
    // code-line-variants.test.ts 'last 3 uses'): cap workers and give every test 20 s of headroom.
    testTimeout: 20_000,
    maxWorkers: '50%',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // `server-only` throws outside Next's react-server build; tests run
      // server code directly, so point it at the package's no-op entry.
      'server-only': path.resolve(__dirname, 'node_modules/server-only/empty.js'),
    },
  },
});
