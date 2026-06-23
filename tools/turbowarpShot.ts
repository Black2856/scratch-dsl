import {request as httpRequest} from 'node:http';
import {spawn, type ChildProcess} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';

// AI-facing verification: drives the real @scratch/scratch-vm + scratch-render
// preview with Playwright, sends optional key presses, screenshots the stage,
// and prints the VM's behaviour state (variables / sprite positions) as JSON.
// Lets an agent "see" the project the way Scratch/TurboWarp renders it.
//
//   npm run shot:tw -- <name> [--keys 2,space] [--wait 3000] [--out path.png]

const PORT = Number(process.env.TW_PREVIEW_PORT ?? 8788);
const HEALTH_MARKER = 'tw-preview-ok';
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, '..');

const argv = process.argv.slice(2);
const projectName = argv[0];
const flag = (name: string, fallback?: string): string | undefined => {
    const i = argv.indexOf(name);
    return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

if (!projectName) {
    console.error('Usage: npm run shot:tw -- <name> [--keys 2,space] [--wait 3000] [--out path.png]');
    process.exit(1);
}

const keys = (flag('--keys') ?? '').split(',').map(k => k.trim()).filter(Boolean);
const waitMs = Number(flag('--wait', '2500'));
const outPath = flag('--out') ?? path.join(repoRoot, 'workspace', projectName, 'output', `${projectName}-shot.png`);

const healthCheck = (): Promise<boolean> => new Promise(resolve => {
    const req = httpRequest({host: 'localhost', port: PORT, path: '/__tw_preview', timeout: 500}, res => {
        let body = '';
        res.on('data', c => {
            body += c;
        });
        res.on('end', () => resolve(body.trim() === HEALTH_MARKER));
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
        req.destroy();
        resolve(false);
    });
    req.end();
});

const waitForServer = async (): Promise<void> => {
    for (let i = 0; i < 40; i++) {
        if (await healthCheck()) return;
        await new Promise(r => setTimeout(r, 250));
    }
    throw new Error('preview server did not become ready');
};

let spawned: ChildProcess | null = null;
try {
    if (!(await healthCheck())) {
        spawned = spawn(
            process.execPath,
            ['--no-warnings', '--experimental-strip-types', path.join(here, 'turbowarpPreview.ts'), projectName],
            {cwd: repoRoot, stdio: 'ignore', detached: false, env: {...process.env, TW_PREVIEW_NO_OPEN: '1'}}
        );
        await waitForServer();
    }

    const browser = await chromium.launch({
        headless: true,
        args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist']
    });
    const page = await browser.newPage({viewport: {width: 560, height: 480}});
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));

    await page.goto(`http://localhost:${PORT}/?name=${encodeURIComponent(projectName)}`, {waitUntil: 'load'});
    await page.waitForFunction(
        () => (window as unknown as {__twReady?: boolean; __twError?: string}).__twReady === true ||
            Boolean((window as unknown as {__twError?: string}).__twError),
        null,
        {timeout: 20000}
    ).catch(() => undefined);

    await page.locator('#stage').click().catch(() => undefined);
    for (const key of keys) {
        await page.keyboard.press(key);
        await page.waitForTimeout(150);
    }
    await page.waitForTimeout(waitMs);

    const state = await page.evaluate(() => {
        const win = window as unknown as {vm?: any; __twError?: string};
        if (!win.vm) return {error: win.__twError ?? 'no vm'};
        const stage = win.vm.runtime.getTargetForStage();
        const vars: Record<string, unknown> = {};
        if (stage) for (const k in stage.variables) vars[stage.variables[k].name] = stage.variables[k].value;
        const sprites = win.vm.runtime.targets
            .filter((t: any) => t.sprite && !t.isStage)
            .map((t: any) => ({name: t.sprite.name, x: t.x, y: t.y, visible: t.visible, costume: t.currentCostume}));
        return {variables: vars, sprites, backdrop: stage ? stage.currentCostume : null};
    });

    await mkdir(path.dirname(outPath), {recursive: true});
    await page.locator('#stage-wrap').screenshot({path: outPath});
    await browser.close();

    console.log(JSON.stringify({ok: true, shot: outPath, errors, state}, null, 2));
} catch (error) {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
} finally {
    if (spawned && !spawned.killed) spawned.kill();
}
