import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.js', 'tests/worker/**/*.test.js'],
    environment: 'happy-dom',
    environmentOptions: { happyDOM: { url: 'https://procoach.test/' } },
    setupFiles: ['tests/helpers/setup.js'],
    testTimeout: 30000,
    restoreMocks: true,
  },
});
