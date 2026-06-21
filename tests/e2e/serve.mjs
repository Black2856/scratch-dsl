import * as esbuild from 'esbuild';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3210;

/**
 * Bundles tests/e2e/entry.ts into a single IIFE exposing `window.App`, then
 * serves harness.html and the bundled app.js over plain Node http. Used as
 * the Playwright webServer command (see playwright.config.ts) so browser
 * specs can exercise the same TypeScript sources as the node:test suite.
 */
function buildBundle() {
    // NOTE: esbuild's `globalName` option declares `var <name> = (iife)()` at
    // the *outer* scope. Since entry.ts already assigns `window.App = App`
    // itself (see entry.ts), and a top-level `var App` IS `window.App` in a
    // browser, that outer `var App = <iife return value>` would immediately
    // overwrite our real assignment with the IIFE's return value (undefined,
    // since entry.ts has no module exports). So `globalName` is intentionally
    // omitted here; the bundle is a plain IIFE that sets window.App itself.
    const result = esbuild.buildSync({
        entryPoints: [path.join(__dirname, 'entry.ts')],
        bundle: true,
        format: 'iife',
        platform: 'browser',
        target: 'es2020',
        write: false,
        logLevel: 'warning'
    });
    return result.outputFiles[0].text;
}

const CONTENT_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8'
};

async function main() {
    const bundleCache = buildBundle();

    const server = http.createServer(async (req, res) => {
        try {
            const url = new URL(req.url, `http://localhost:${PORT}`);

            if (url.pathname === '/app.js') {
                res.writeHead(200, {'Content-Type': CONTENT_TYPES['.js']});
                res.end(bundleCache);
                return;
            }

            if (url.pathname === '/harness.html' || url.pathname === '/') {
                const html = await readFile(path.join(__dirname, 'harness.html'), 'utf-8');
                res.writeHead(200, {'Content-Type': CONTENT_TYPES['.html']});
                res.end(html);
                return;
            }

            res.writeHead(404);
            res.end('Not found');
        } catch (error) {
            res.writeHead(500);
            res.end(String(error && error.stack ? error.stack : error));
        }
    });

    server.listen(PORT, () => {
        // eslint-disable-next-line no-console
        console.log(`e2e harness server listening on http://localhost:${PORT}`);
    });
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
