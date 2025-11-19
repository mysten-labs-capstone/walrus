import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: 'src/test/setupTests.ts',
    include: ['src/test/**/__tests__/**/*.test.*', 'src/test/**/__tests__/**/*.spec.*', 'src/**/__tests__/**/*.test.*']
  },
});
