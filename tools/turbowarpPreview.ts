import {createServer, request as httpRequest, type IncomingMessage, type ServerResponse} from 'node:http';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {spawn, spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import esbuild from 'esbuild';

import {packageSb3} from '../src/sb3/sb3Packager.ts';
import {loadWorkspaceProject, WorkspaceProjectError, repositoryRoot} from './workspaceProject.ts';

// Local "real Scratch VM + renderer" preview: serves a minimal player page that
// loads @scratch/scratch-vm + scratch-render (prebuilt browser UMD bundles) and
// runs the project's exported .sb3 — i.e. the authoritative behaviour/visuals,
// not a self-made renderer. The same page is Playwright-drivable
// for AI verification (window.vm is exposed). One long-running server is reused
// across invocations; a second `preview` just reopens the browser.

const PORT = Number(process.env.TW_PREVIEW_PORT ?? 8788);
const HEALTH_MARKER = 'tw-preview-ok';
const here = path.dirname(fileURLToPath(import.meta.url));
const playerHtml = path.join(here, '..', 'preview', 'turbowarp', 'player.html');

const VENDOR: Record<string, string> = {
    'scratch-vm.js': 'node_modules/@scratch/scratch-vm/dist/web/scratch-vm.js',
    'scratch-render.js': 'node_modules/@scratch/scratch-render/dist/web/scratch-render.js',
    'scratch-storage.js': 'node_modules/scratch-storage/dist/web/scratch-storage.js',
    'scratch-svg-renderer.js': 'node_modules/scratch-svg-renderer/dist/web/scratch-svg-renderer.js'
};

const args = process.argv.slice(2);
const forceUpdate = args.includes('--update');
const projectName = args.find(arg => !arg.startsWith('--'));
if (!projectName) {
    console.error('Usage: npm run preview -- <workspace-project-name> [--update]');
    process.exitCode = 1;
}

// Files the preview needs from node_modules. Their absence means `npm install`
// has not run (fresh checkout), so the preview self-bootstraps.
const VENDOR_FILES = [
    'node_modules/@scratch/scratch-vm/dist/web/scratch-vm.js',
    'node_modules/@scratch/scratch-render/dist/web/scratch-render.js',
    'node_modules/scratch-storage/dist/web/scratch-storage.js',
    'node_modules/scratch-svg-renderer/dist/web/scratch-svg-renderer.js',
    'node_modules/scratch-audio/src/index.js',
    'node_modules/events/package.json'
];

/**
 * Ensures the preview's npm dependencies (@scratch/scratch-vm + scratch-render +
 * storage/svg/audio + the events polyfill) are present, running `npm install`
 * once if any are missing. `--update` forces a reinstall to pick up changes.
 * This is why a single `npm run preview -- <name>` works on a fresh checkout.
 */
const ensureVendor = (): void => {
    const missing = VENDOR_FILES.some(file => !existsSync(path.join(repositoryRoot, file)));
    if (!forceUpdate && !missing) return;
    console.log(forceUpdate
        ? 'Updating preview dependencies (npm install)…'
        : 'First run: installing preview dependencies (npm install)…');
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const result = spawnSync(npm, ['install', '--no-audit', '--no-fund'], {
        cwd: repositoryRoot,
        stdio: 'inherit'
    });
    if (result.status !== 0) {
        throw new Error('npm install failed; run it manually and retry.');
    }
};

// scratch-audio ships no browser bundle, so bundle its src on demand (cached)
// into an `AudioEngine` global. `events` is its only Node builtin dependency.
const require = createRequire(import.meta.url);
let audioBundle: Promise<string> | null = null;
const bundleAudioEngine = (): Promise<string> => {
    if (!audioBundle) {
        audioBundle = esbuild.build({
            entryPoints: [path.join(repositoryRoot, 'node_modules/scratch-audio/src/index.js')],
            bundle: true,
            format: 'iife',
            globalName: 'AudioEngine',
            platform: 'browser',
            write: false,
            logLevel: 'silent',
            define: {'process.env.NODE_ENV': '"production"', global: 'globalThis'},
            alias: {events: require.resolve('events')}
        }).then(result => result.outputFiles[0].text);
    }
    return audioBundle;
};

const send = (res: ServerResponse, status: number, type: string, body: string | Uint8Array): void => {
    res.writeHead(status, {'Content-Type': type, 'Cache-Control': 'no-store'});
    res.end(body);
};

/** Exports a workspace project to .sb3 bytes on demand (no disk write needed). */
const exportSb3Bytes = async (name: string): Promise<Uint8Array> => {
    const loaded = await loadWorkspaceProject(name);
    return packageSb3(loaded.project, {assets: loaded.assetBytes}).sb3;
};

const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
    const pathname = url.pathname;

    if (pathname === '/__tw_preview') {
        send(res, 200, 'text/plain', HEALTH_MARKER);
        return;
    }
    if (pathname === '/' || pathname === '/index.html') {
        send(res, 200, 'text/html; charset=utf-8', await readFile(playerHtml));
        return;
    }
    if (pathname === '/vendor/scratch-audio.js') {
        send(res, 200, 'application/javascript', await bundleAudioEngine());
        return;
    }
    if (pathname.startsWith('/vendor/')) {
        const file = VENDOR[pathname.slice('/vendor/'.length)];
        if (!file) {
            send(res, 404, 'text/plain', 'unknown vendor file');
            return;
        }
        send(res, 200, 'application/javascript', await readFile(path.join(repositoryRoot, file)));
        return;
    }
    if (pathname.startsWith('/project/') && pathname.endsWith('.sb3')) {
        const name = decodeURIComponent(pathname.slice('/project/'.length, -'.sb3'.length));
        try {
            const sb3 = await exportSb3Bytes(name);
            send(res, 200, 'application/octet-stream', sb3);
        } catch (error) {
            const message = error instanceof WorkspaceProjectError
                ? error.diagnostics.map(d => `[${d.severity}] ${d.code}: ${d.message}`).join('\n')
                : (error instanceof Error ? error.message : String(error));
            send(res, 500, 'text/plain; charset=utf-8', message);
        }
        return;
    }
    send(res, 404, 'text/plain', 'not found');
};

/** Returns true when our preview server already answers on PORT. */
const isAlreadyRunning = (): Promise<boolean> => new Promise(resolve => {
    const req = httpRequest({host: 'localhost', port: PORT, path: '/__tw_preview', timeout: 500}, response => {
        let body = '';
        response.on('data', chunk => {
            body += chunk;
        });
        response.on('end', () => resolve(body.trim() === HEALTH_MARKER));
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
        req.destroy();
        resolve(false);
    });
    req.end();
});

const openBrowser = (targetUrl: string): void => {
    if (process.env.TW_PREVIEW_NO_OPEN) return; // shot tool drives it headlessly
    const platform = process.platform;
    try {
        if (platform === 'win32') {
            spawn('cmd', ['/c', 'start', '', targetUrl], {detached: true, stdio: 'ignore'}).unref();
        } else if (platform === 'darwin') {
            spawn('open', [targetUrl], {detached: true, stdio: 'ignore'}).unref();
        } else {
            spawn('xdg-open', [targetUrl], {detached: true, stdio: 'ignore'}).unref();
        }
    } catch {
        // best-effort; the URL is printed regardless
    }
};

if (projectName) {
    const targetUrl = `http://localhost:${PORT}/?name=${encodeURIComponent(projectName)}`;
    if (await isAlreadyRunning()) {
        console.log(`TurboWarp preview already running. Opening ${targetUrl}`);
        openBrowser(targetUrl);
    } else {
        ensureVendor();
        const server = createServer((req, res) => {
            handle(req, res).catch(error => {
                send(res, 500, 'text/plain', error instanceof Error ? error.message : String(error));
            });
        });
        server.listen(PORT, () => {
            console.log(`TurboWarp preview server: ${targetUrl}`);
            console.log('Real @scratch/scratch-vm + scratch-render. Ctrl+C to stop.');
            openBrowser(targetUrl);
        });
    }
}
