import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');
const serverPath = path.join(__dirname, 'serve.mjs');
const previewPath = path.join(root, 'tools', 'previewProject.ts');
const playwrightCli = path.join(root, 'node_modules', '@playwright', 'test', 'cli.js');
const serverUrl = 'http://localhost:3210/harness.html';
const previewUrl = 'http://localhost:3211/manual-preview.html';

const waitForServer = async (server, url) => {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
        if (server.exitCode !== null) {
            throw new Error(`E2E server exited before becoming ready (${server.exitCode}).`);
        }
        try {
            const response = await fetch(url);
            if (response.ok) return;
        } catch {
            // The server is still starting.
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for ${url}.`);
};

const waitForExit = child => new Promise(resolve => {
    if (child.exitCode !== null) {
        resolve(child.exitCode);
        return;
    }
    child.once('exit', resolve);
});

const server = spawn(process.execPath, [serverPath], {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true
});
const preview = spawn(process.execPath, [
    '--no-warnings',
    '--experimental-strip-types',
    previewPath,
    'full-feature-minimal',
    '--no-open',
    '--port',
    '3211'
], {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true
});

let exitCode = 1;
try {
    await Promise.all([
        waitForServer(server, serverUrl),
        waitForServer(preview, previewUrl)
    ]);
    const playwright = spawn(process.execPath, [playwrightCli, 'test', ...process.argv.slice(2)], {
        cwd: root,
        env: {...process.env, PLAYWRIGHT_EXTERNAL_SERVER: '1'},
        stdio: 'inherit',
        windowsHide: true
    });
    exitCode = await waitForExit(playwright);
} finally {
    if (server.exitCode === null) {
        server.kill();
        await waitForExit(server);
    }
    if (preview.exitCode === null) {
        preview.kill();
        await waitForExit(preview);
    }
}

process.exitCode = exitCode ?? 1;
