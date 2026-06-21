import {test, expect} from '@playwright/test';
import type {Page} from '@playwright/test';

/**
 * Minimal DSL project (stage + two layered sprites) used by the browser
 * specs below. Kept inline (rather than imported) since it only needs to
 * cross the page.evaluate() boundary as plain JSON, not as a TS module.
 */
const RENDER_PROJECT = {
    schemaVersion: '1.0.0',
    project: {id: 'e2e-project', name: 'E2E render project'},
    stage: {
        id: 'target-stage',
        isStage: true,
        name: 'Stage',
        variables: [],
        lists: [],
        broadcasts: [],
        blocks: {
            'flag-noop': {
                id: 'flag-noop',
                opcode: 'event_whenflagclicked',
                next: null,
                parent: null,
                inputs: {},
                fields: {},
                shadow: false,
                topLevel: true
            }
        },
        scripts: ['flag-noop'],
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
    sprites: [
        {
            id: 'sprite-back',
            isStage: false,
            name: 'Back',
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
            layerOrder: 1,
            visible: true,
            x: -50,
            y: 25,
            size: 80,
            direction: 90,
            draggable: false,
            rotationStyle: 'all around'
        },
        {
            id: 'sprite-front',
            isStage: false,
            name: 'Front',
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
            layerOrder: 2,
            visible: true,
            x: 100,
            y: -40,
            size: 100,
            direction: 0,
            draggable: false,
            rotationStyle: "don't rotate"
        }
    ],
    assets: [],
    monitors: [],
    extensions: [],
    meta: {source: 'phase-3-e2e'}
};

declare global {
    interface Window {
        App: {
            createCanvasRenderer(canvas: HTMLCanvasElement): import('../../src/render/CanvasRenderer.ts').CanvasRenderer;
            createInputManager(canvas: HTMLCanvasElement): import('../../src/input/DomInputManager.ts').DomInputManager;
            makeRuntime(dsl: unknown, renderer?: unknown, input?: unknown): import('../../src/runtime/Runtime.ts').Runtime;
        };
        __renderer: import('../../src/render/CanvasRenderer.ts').CanvasRenderer;
        __input: import('../../src/input/DomInputManager.ts').DomInputManager;
        __runtime: import('../../src/runtime/Runtime.ts').Runtime;
    }
}

const gotoHarness = async (page: Page): Promise<void> => {
    await page.goto('/harness.html');
    await page.waitForFunction(() => typeof window.App !== 'undefined');
};

test.describe('Phase 3 Canvas renderer + DOM input', () => {
    test('canvas internal size is fixed at 480x360', async ({page}) => {
        await gotoHarness(page);

        const size = await page.evaluate(() => {
            const canvas = document.getElementById('stage') as HTMLCanvasElement;
            window.__renderer = window.App.createCanvasRenderer(canvas);
            return {width: canvas.width, height: canvas.height};
        });

        expect(size.width).toBe(480);
        expect(size.height).toBe(360);
    });

    test('a costume-less Stage does not render a fallback square', async ({page}) => {
        await gotoHarness(page);

        const centerAlpha = await page.evaluate(() => {
            const canvas = document.getElementById('stage') as HTMLCanvasElement;
            const renderer = window.App.createCanvasRenderer(canvas);
            renderer.renderDrawables([{
                targetId: 'stage-without-costume',
                isStage: true,
                x: 0,
                y: 0,
                size: 100,
                direction: 90,
                visible: true,
                rotationStyle: 'all around',
                layerOrder: 0,
                costumeIndex: 0
            }]);
            return canvas.getContext('2d')!.getImageData(240, 180, 1, 1).data[3];
        });

        expect(centerAlpha).toBe(0);
    });

    test('clientToScratch / InputManager normalize CSS-scaled canvases back to native stage coordinates', async ({page}) => {
        await gotoHarness(page);

        await page.evaluate(() => {
            const canvas = document.getElementById('stage') as HTMLCanvasElement;
            window.__renderer = window.App.createCanvasRenderer(canvas);
            window.__input = window.App.createInputManager(canvas);
            canvas.style.width = '960px';
            canvas.style.height = '720px';
            canvas.style.position = 'fixed';
            canvas.style.left = '0px';
            canvas.style.top = '0px';
        });

        const box = await page.locator('#stage').boundingBox();
        expect(box).not.toBeNull();
        expect(Math.round(box!.width)).toBe(960);
        expect(Math.round(box!.height)).toBe(720);

        // Move the mouse to the CSS-scaled canvas's center: should normalize to the Scratch origin (0,0).
        await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
        const center = await page.evaluate(() => ({x: window.__input.getMouseX(), y: window.__input.getMouseY()}));
        expect(center.x).toBeCloseTo(0, 0);
        expect(center.y).toBeCloseTo(0, 0);

        // Move to the CSS-scaled canvas's top-left corner: should normalize to the stage's top-left corner.
        await page.mouse.move(box!.x + 1, box!.y + 1);
        const topLeft = await page.evaluate(() => ({x: window.__input.getMouseX(), y: window.__input.getMouseY()}));
        expect(topLeft.x).toBeLessThan(-235);
        expect(topLeft.y).toBeGreaterThan(175);
    });

    test('InputManager reflects mouse down/up and keyboard state after real browser events', async ({page}) => {
        await gotoHarness(page);

        await page.evaluate(() => {
            const canvas = document.getElementById('stage') as HTMLCanvasElement;
            window.__input = window.App.createInputManager(canvas);
        });

        await expect.poll(() => page.evaluate(() => window.__input.isMouseDown())).toBe(false);

        await page.mouse.move(200, 200);
        await page.mouse.down();
        await expect.poll(() => page.evaluate(() => window.__input.isMouseDown())).toBe(true);

        await page.mouse.up();
        await expect.poll(() => page.evaluate(() => window.__input.isMouseDown())).toBe(false);

        await expect.poll(() => page.evaluate(() => window.__input.isKeyDown('space'))).toBe(false);
        await page.keyboard.down(' ');
        await expect.poll(() => page.evaluate(() => window.__input.isKeyDown('space'))).toBe(true);
        await page.keyboard.up(' ');
        await expect.poll(() => page.evaluate(() => window.__input.isKeyDown('space'))).toBe(false);

        await page.keyboard.down('ArrowUp');
        await expect.poll(() => page.evaluate(() => window.__input.isKeyDown('up arrow'))).toBe(true);
        await page.keyboard.up('ArrowUp');
    });

    test('renderer paints drawables in ascending layerOrder', async ({page}) => {
        await gotoHarness(page);

        const drawOrder = await page.evaluate((dsl) => {
            const canvas = document.getElementById('stage') as HTMLCanvasElement;
            const renderer = window.App.createCanvasRenderer(canvas);
            window.__runtime = window.App.makeRuntime(dsl, renderer);
            window.__runtime.greenFlag();
            window.__runtime.tick();
            return renderer.getDrawOrder();
        }, RENDER_PROJECT);

        expect(drawOrder).toEqual(['target-stage', 'sprite-back', 'sprite-front']);
    });

    test('green flag -> tick reflects sprite position in the renderer-observed state', async ({page}) => {
        await gotoHarness(page);

        const state = await page.evaluate((dsl) => {
            const canvas = document.getElementById('stage') as HTMLCanvasElement;
            const renderer = window.App.createCanvasRenderer(canvas);
            const runtime = window.App.makeRuntime(dsl, renderer);
            runtime.greenFlag();
            runtime.tick();
            return renderer.getRenderedState('sprite-front');
        }, RENDER_PROJECT);

        expect(state).toBeDefined();
        expect(state!.x).toBe(100);
        expect(state!.y).toBe(-40);
        expect(state!.rotationStyle).toBe("don't rotate");
        expect(state!.layerOrder).toBe(2);
    });
});
