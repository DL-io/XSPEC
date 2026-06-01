import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts'],
    globals: false
  },
  resolve: {
    alias: {
      '@polyshore/core': new URL('./packages/core/src/index.ts', import.meta.url).pathname,
      '@polyshore/risk': new URL('./packages/risk/src/index.ts', import.meta.url).pathname,
      '@polyshore/models': new URL('./packages/models/src/index.ts', import.meta.url).pathname,
      '@polyshore/execution': new URL('./packages/execution/src/index.ts', import.meta.url).pathname,
      '@polyshore/scanner': new URL('./packages/scanner/src/index.ts', import.meta.url).pathname
    }
  }
});
