import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration tests share one seeded database; run files sequentially.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
