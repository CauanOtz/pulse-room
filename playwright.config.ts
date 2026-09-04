import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  // A cold machine compiles the whole client before the first window paints,
  // which on a build server costs more than the run itself. The ceiling is
  // there to end a hung test, not to time the first compile.
  timeout: 120_000,
  workers: 1,
  reporter: 'list',
  use: {
    trace: 'retain-on-failure',
  },
});
