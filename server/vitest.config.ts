import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.d.ts',
        'src/test-setup.ts',
        'src/index.ts', // server bootstrap / wiring — exercised end-to-end, not unit tested
        'src/create-local-app.ts', // desktop local bootstrap / wiring — exercised end-to-end, not unit tested
        'src/db/repositories/types.ts', // interface declarations only
        'src/db/repositories/cosmos/**', // live Cosmos integration; unit tests run against the mock repos
      ],
      reporter: ['text-summary', 'text'],
      // Regression floor set just below the current baseline. Raising these
      // (routes/middleware/db need an HTTP integration-test harness) is tracked
      // follow-up work, not a target to chase by loosening excludes.
      thresholds: {
        statements: 48,
        branches: 72,
        functions: 65,
        lines: 48,
      },
    },
  },
});
