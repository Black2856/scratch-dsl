import {defineConfig, devices} from '@playwright/test';

/**
 * Phase 3 browser integration suite. Boots tests/e2e/serve.mjs (esbuild
 * bundle of tests/e2e/entry.ts + a tiny static server) and runs only against
 * Chromium, per Phase 3 scope (no cross-browser matrix requested).
 */
export default defineConfig({
    testDir: 'tests/e2e',
    fullyParallel: true,
    timeout: 30000,
    globalSetup: 'tests/e2e/globalSetup.mjs',
    use: {
        baseURL: 'http://localhost:3210'
    },
    projects: [
        {
            name: 'chromium',
            use: {...devices['Desktop Chrome']}
        }
    ]
});
