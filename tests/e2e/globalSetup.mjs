import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');

const waitForExit = child => new Promise(resolve => {
    if (child.exitCode !== null) {
        resolve(child.exitCode);
        return;
    }
    child.once('exit', resolve);
});

const stop = async child => {
    if (child.exitCode !== null) return;
    child.kill();
    const timeout = setTimeout(() => {
        if (child.exitCode === null) child.kill('SIGKILL');
    }, 3000);
    await waitForExit(child);
    clearTimeout(timeout);
};

const waitForServer = async (child, url) => {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
        if (child.exitCode !== null) {
            throw new Error(`E2E server exited before becoming ready (${child.exitCode}).`);
        }
        try {
            const response = await fetch(url);
            if (response.ok) return;
        } catch {
            // Server is still starting.
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for ${url}.`);
};

export default async function globalSetup() {
    if (process.env.PLAYWRIGHT_EXTERNAL_SERVER === '1') {
        return undefined;
    }

    const harness = spawn(process.execPath, [path.join(__dirname, 'serve.mjs')], {
        cwd: root,
        stdio: 'inherit',
        windowsHide: true
    });
    const preview = spawn(process.execPath, [
        '--no-warnings',
        '--experimental-strip-types',
        path.join(root, 'tools', 'previewProject.ts'),
        'full-feature-minimal',
        '--no-open',
        '--port',
        '3211'
    ], {
        cwd: root,
        stdio: 'inherit',
        windowsHide: true
    });

    try {
        await Promise.all([
            waitForServer(harness, 'http://localhost:3210/harness.html'),
            waitForServer(preview, 'http://localhost:3211/manual-preview.html')
        ]);
    } catch (error) {
        await Promise.all([stop(harness), stop(preview)]);
        throw error;
    }

    return async () => {
        await Promise.all([stop(harness), stop(preview)]);
    };
}
