import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/rules/**/*.test.ts'],
    // One emulator is shared, and each test clears it, so files must not run in parallel.
    fileParallelism: false,
    testTimeout: 20000,
  },
})
