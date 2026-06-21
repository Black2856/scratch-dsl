import {defineConfig, devices} from '@playwright/test';

const externalServer = process.env.PLAYWRIGHT_EXTERNAL_SERVER === '1';

/**
 * Phase 3 browser integration suite. Boots tests/e2e/serve.mjs (esbuild
 * bundle of tests/e2e/entry.ts + a tiny static server) and runs only against
 * Chromium, per Phase 3 scope (no cross-browser matrix requested).
 */
export default defineConfig({
    testDir: 'tests/e2e',
    fullyParallel: true,
    timeout: 30000,
    webServer: externalServer ? undefined : {
        command: 'node tests/e2e/serve.mjs',
        url: 'http://localhost:3210/harness.html',
        reuseExistingServer: true,
        timeout: 30000
    },
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
