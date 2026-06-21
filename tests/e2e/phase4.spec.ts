import {test, expect} from '@playwright/test';

const ASSET_PROJECT = {
    schemaVersion: '1.0.0',
    project: {id: 'asset-project', name: 'Asset project'},
    stage: {
        id: 'asset-stage',
        isStage: true,
        name: 'Stage',
        variables: [],
        lists: [],
        broadcasts: [],
        blocks: {},
        scripts: [],
        comments: [],
        currentCostume: 0,
        costumes: [],
        sounds: [],
        volume: 100,
        layerOrder: 0,
        tempo: 60,
        videoTransparency: 50,
        videoState: 'on',
        textToSpeechLanguage: null
    },
    sprites: [{
        id: 'asset-sprite',
        isStage: false,
        name: 'Asset Sprite',
        variables: [],
        lists: [],
        broadcasts: [],
        blocks: {},
        scripts: [],
        comments: [],
        currentCostume: 0,
        costumes: [{
            id: 'costume-red',
            name: 'red',
            assetId: 'asset-red',
            dataFormat: 'svg',
            md5ext: 'asset-red.svg',
            bitmapResolution: 1,
            rotationCenterX: 10,
            rotationCenterY: 10
        }],
        sounds: [],
        volume: 100,
        layerOrder: 1,
        visible: true,
        x: 0,
        y: 0,
        size: 100,
        direction: 90,
        draggable: false,
        rotationStyle: "don't rotate"
    }],
    assets: [{
        id: 'asset-red',
        kind: 'costume',
        dataFormat: 'svg',
        md5ext: 'asset-red.svg'
    }],
    monitors: [],
    extensions: [],
    meta: {}
};

test.describe('Phase 4 asset and audio browser adapters', () => {
    test('AssetManager decodes a costume and CanvasRenderer paints its Skin', async ({page}) => {
        await page.goto('/harness.html');
        await page.waitForFunction(() => typeof (window as any).App !== 'undefined');

        const pixel = await page.evaluate(async dsl => {
            const App = (window as any).App;
            const canvas = document.getElementById('stage') as HTMLCanvasElement;
            const renderer = App.createCanvasRenderer(canvas);
            const project = App.createProject(dsl);
            const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20">' +
                '<rect width="20" height="20" fill="#ff0000"/></svg>';
            const assets = new App.AssetManager([{
                assetId: 'asset-red',
                md5ext: 'asset-red.svg',
                dataFormat: 'svg',
                kind: 'costume',
                mimeType: 'image/svg+xml',
                status: 'ready',
                source: 'e2e',
                bytes: new TextEncoder().encode(svg)
            }], {image: new App.BrowserImageDecoder()});

            await App.loadCurrentCostumeSkins(project, assets, renderer);
            const runtime = new App.Runtime({renderer});
            runtime.load(project);
            runtime.start();
            runtime.tick();
            return [...canvas.getContext('2d')!.getImageData(240, 180, 1, 1).data];
        }, ASSET_PROJECT);

        expect(pixel[0]).toBeGreaterThan(240);
        expect(pixel[1]).toBeLessThan(20);
        expect(pixel[2]).toBeLessThan(20);
        expect(pixel[3]).toBe(255);
    });

    test('user gesture starts AudioContext and WebAudioPort decodes, plays, and stops', async ({page}) => {
        await page.goto('/harness.html');
        await page.waitForFunction(() => typeof (window as any).App !== 'undefined');
        await page.evaluate(() => {
            const button = document.getElementById('audio-start') as HTMLButtonElement;
            button.addEventListener('click', async () => {
                const App = (window as any).App;
                const context = new AudioContext();
                const port = new App.WebAudioPort(context);
                await port.start();

                const sampleRate = 8000;
                const sampleCount = 800;
                const buffer = new ArrayBuffer(44 + sampleCount * 2);
                const view = new DataView(buffer);
                const write = (offset: number, text: string) => {
                    for (let index = 0; index < text.length; index++) {
                        view.setUint8(offset + index, text.charCodeAt(index));
                    }
                };
                write(0, 'RIFF');
                view.setUint32(4, 36 + sampleCount * 2, true);
                write(8, 'WAVE');
                write(12, 'fmt ');
                view.setUint32(16, 16, true);
                view.setUint16(20, 1, true);
                view.setUint16(22, 1, true);
                view.setUint32(24, sampleRate, true);
                view.setUint32(28, sampleRate * 2, true);
                view.setUint16(32, 2, true);
                view.setUint16(34, 16, true);
                write(36, 'data');
                view.setUint32(40, sampleCount * 2, true);

                const manager = new App.SoundManager(port);
                const player = await manager.loadSound(
                    'target-a',
                    'sound-a',
                    'asset-a',
                    new Uint8Array(buffer)
                );
                player.play();
                const wasPlaying = player.isPlaying;
                manager.stopAll();
                await player.finished;
                (window as any).__audioResult = {
                    contextState: context.state,
                    wasPlaying,
                    stopped: !player.isPlaying
                };
                await context.close();
            }, {once: true});
        });

        await page.click('#audio-start');
        await expect.poll(() => page.evaluate(() => (window as any).__audioResult)).toEqual({
            contextState: 'running',
            wasPlaying: true,
            stopped: true
        });
    });
});
