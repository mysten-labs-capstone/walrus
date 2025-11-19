// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    include: ['src/test/__tests__/**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      'node_modules',
      'dist',
      '.idea',
      '.git',
      '.cache',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData.ts',
        'src/scripts/**', // CLI scripts
        'src/legacy/**', // Legacy code
      ],
      include: [
        'src/**/*.{ts,tsx}',
      ],
      all: true,
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 60,
        statements: 60,
      },
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});

// ============================================
// Additional npm scripts for package.json
// ============================================
/*
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest run --coverage",
    "test:watch": "vitest --watch",
    "test:run": "vitest run",
    "test:auth": "vitest run src/test/__tests__/auth",
    "test:components": "vitest run src/test/__tests__/components",
    "test:services": "vitest run src/test/__tests__/services",
    "test:hooks": "vitest run src/test/__tests__/hooks",
    "test:ci": "vitest run --coverage --reporter=junit --reporter=default"
  }
}
*/

// ============================================
// .gitignore additions
// ============================================
/*
# Test coverage
coverage/
.nyc_output/

# Test results
test-results/
junit.xml
*/

// ============================================
// CI/CD GitHub Actions example
// ============================================
/*
# .github/workflows/test.yml
name: Tests

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '20'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
      working-directory: ./client
    
    - name: Run tests
      run: npm run test:ci
      working-directory: ./client
    
    - name: Upload coverage
      uses: codecov/codecov-action@v3
      with:
        files: ./client/coverage/lcov.info
        flags: unittests
*/