import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

import {expect, test} from '@playwright/test';

import {
    createKeyboardControlProject,
    createMotionBasicProject,
    createPenBasicProject
} from '../fixtures/phase7SampleProjects.ts';
import {
    SAMPLE_COSTUME_ASSET_ID,
    SAMPLE_COSTUME_MD5EXT,
    SAMPLE_COSTUME_SOURCE,
    SAMPLE_SOUND_ASSET_ID,
    SAMPLE_SOUND_SOURCE
} from '../fixtures/phase7SampleAssets.ts';

const costumeBytes = [...readFileSync(fileURLToPath(
    new URL(`../../${SAMPLE_COSTUME_SOURCE}`, import.meta.url)
))];
const soundBytes = [...readFileSync(fileURLToPath(
    new URL(`../../${SAMPLE_SOUND_SOURCE}`, import.meta.url)
))];

test.describe('Phase 7 sample fixtures', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/harness.html');
        await page.waitForFunction(() => typeof (window as any).App !== 'undefined');
    });

    test('motion-basic loads the workspace costume and renders its sprite', async ({page}) => {
        const result = await page.evaluate(async ({dsl, bytes, assetId, md5ext}) => {
            const App = (window as any).App;
            const canvas = document.getElementById('stage') as HTMLCanvasElement;
            const renderer = App.createCanvasRenderer(canvas);
            const project = App.createProject(dsl);
            const assets = new App.AssetManager([{
                assetId,
                md5ext,
                dataFormat: 'png',
                kind: 'costume',
                mimeType: 'image/png',
                status: 'ready',
                source: 'workspace/test-project',
                bytes: new Uint8Array(bytes)
            }], {image: new App.BrowserImageDecoder()});
            await App.loadCurrentCostumeSkins(project, assets, renderer);
            const runtime = new App.Runtime({renderer});
            runtime.load(project);
            runtime.start();
            runtime.greenFlag();
            runtime.tick();
            const state = renderer.getRenderedState('motion-basic-sprite');
            const pixels = canvas.getContext('2d')!.getImageData(0, 0, 480, 360).data;
            let opaque = 0;
            for (let index = 3; index < pixels.length; index += 4) {
                if (pixels[index] > 0) opaque++;
            }
            return {state, opaque};
        }, {
            dsl: createMotionBasicProject(),
            bytes: costumeBytes,
            assetId: SAMPLE_COSTUME_ASSET_ID,
            md5ext: SAMPLE_COSTUME_MD5EXT
        });

        expect(result.state.x).toBeCloseTo(-30);
        expect(result.state.y).toBe(20);
        expect(result.opaque).toBeGreaterThan(0);
    });

    test('keyboard-control uses a real DOM key event before starting the key hat', async ({page}) => {
        const project = createKeyboardControlProject();
        await page.evaluate((dsl) => {
            const App = (window as any).App;
            const canvas = document.getElementById('stage') as HTMLCanvasElement;
            const input = App.createInputManager(canvas);
            const runtime = App.makeRuntime(dsl, undefined, input);
            (window as any).__phase7Input = input;
            (window as any).__phase7Runtime = runtime;
        }, project);

        await page.keyboard.down('ArrowRight');
        await expect.poll(() => page.evaluate(
            () => (window as any).__phase7Input.isKeyDown('right arrow')
        )).toBe(true);

        const value = await page.evaluate(() => {
            const runtime = (window as any).__phase7Runtime;
            runtime.startHats('event_whenkeypressed', undefined, true);
            runtime.tick();
            return runtime.project.sprites[0].variables.get('key-state');
        });
        await page.keyboard.up('ArrowRight');
        expect(value).toBe('pressed');
    });

    test('pen-basic rasterises a pen point through the browser renderer', async ({page}) => {
        const alpha = await page.evaluate((dsl) => {
            const App = (window as any).App;
            const canvas = document.getElementById('stage') as HTMLCanvasElement;
            const renderer = App.createCanvasRenderer(canvas);
            const runtime = App.makeRuntime(dsl, renderer);
            runtime.greenFlag();
            runtime.tick();
            return canvas.getContext('2d')!.getImageData(240, 180, 1, 1).data[3];
        }, createPenBasicProject());
        expect(alpha).toBeGreaterThan(0);
    });

    test('workspace sound effect decodes and plays after a browser user gesture', async ({page}) => {
        await page.evaluate(({bytes, assetId}) => {
            const button = document.getElementById('audio-start') as HTMLButtonElement;
            button.addEventListener('click', async () => {
                const App = (window as any).App;
                const context = new AudioContext();
                const port = new App.WebAudioPort(context);
                await port.start();
                const manager = new App.SoundManager(port);
                const player = await manager.loadSound(
                    'phase7-sound-target',
                    'phase7-sound',
                    assetId,
                    new Uint8Array(bytes)
                );
                player.play();
                const wasPlaying = player.isPlaying;
                manager.stopAll();
                await player.finished;
                (window as any).__phase7SoundResult = {
                    contextState: context.state,
                    wasPlaying,
                    stopped: !player.isPlaying
                };
                await context.close();
            }, {once: true});
        }, {bytes: soundBytes, assetId: SAMPLE_SOUND_ASSET_ID});

        await page.click('#audio-start');
        await expect.poll(() => page.evaluate(
            () => (window as any).__phase7SoundResult
        )).toEqual({
            contextState: 'running',
            wasPlaying: true,
            stopped: true
        });
    });
});
