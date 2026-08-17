/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.d.ts',
        'src/main.tsx', // React app bootstrap
        'src/vite-env.d.ts',
        'src/test/**', // test setup
      ],
      reporter: ['text-summary', 'text'],
      // Regression floor at the current baseline. Client UI coverage is low
      // because the React pages/components aren't unit-tested yet; raising this
      // meaningfully needs component tests (tracked follow-up). Numbers reflect
      // vitest 4's coverage computation, which counts the untested UI.
      thresholds: {
        statements: 6,
        branches: 5,
        functions: 5,
        lines: 6,
      },
    },
  },
});
