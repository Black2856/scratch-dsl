import {test, expect} from '@playwright/test';
import type {Page} from '@playwright/test';

/**
 * Phase 5 browser integration: confirms the pen layer actually rasterises onto
 * the stage canvas and that a created clone is painted as its own drawable.
 * Projects are inlined as plain JSON (they only cross the page.evaluate()
 * boundary as data, never as TS modules), matching the other e2e specs.
 */

const PEN_PROJECT = {
    schemaVersion: '1.0.0',
    project: {id: 'pen-e2e', name: 'Pen e2e'},
    stage: {
        id: 'pen-stage',
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
        id: 'pen-sprite',
        isStage: false,
        name: 'Pen',
        variables: [],
        lists: [],
        broadcasts: [],
        blocks: {
            'flag-pen': {
                id: 'flag-pen', opcode: 'event_whenflagclicked', next: 'pen-clear',
                parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true
            },
            'pen-clear': {
                id: 'pen-clear', opcode: 'pen_clear', next: 'pen-color',
                parent: 'flag-pen', inputs: {}, fields: {}, shadow: false, topLevel: false
            },
            'pen-color': {
                id: 'pen-color', opcode: 'pen_setPenColorToColor', next: 'pen-size',
                parent: 'pen-clear',
                inputs: {COLOR: {block: 'color-shadow', shadow: 'color-shadow'}},
                fields: {}, shadow: false, topLevel: false
            },
            'color-shadow': {
                id: 'color-shadow', opcode: 'colour_picker', next: null,
                parent: 'pen-color', inputs: {}, fields: {COLOUR: {value: '#ff0000'}},
                shadow: true, topLevel: false
            },
            'pen-size': {
                id: 'pen-size', opcode: 'pen_setPenSizeTo', next: 'pen-down',
                parent: 'pen-color',
                inputs: {SIZE: {block: 'size-shadow', shadow: 'size-shadow'}},
                fields: {}, shadow: false, topLevel: false
            },
            'size-shadow': {
                id: 'size-shadow', opcode: 'math_number', next: null,
                parent: 'pen-size', inputs: {}, fields: {NUM: {value: 24}},
                shadow: true, topLevel: false
            },
            'pen-down': {
                id: 'pen-down', opcode: 'pen_penDown', next: null,
                parent: 'pen-size', inputs: {}, fields: {}, shadow: false, topLevel: false
            }
        },
        scripts: ['flag-pen'],
        comments: [],
        currentCostume: 0,
        costumes: [],
        sounds: [],
        volume: 100,
        layerOrder: 1,
        // Hidden so the sprite's own fallback square does not cover the pen dot.
        visible: false,
        x: 0,
        y: 0,
        size: 100,
        direction: 90,
        draggable: false,
        rotationStyle: 'all around'
    }],
    assets: [],
    monitors: [],
    extensions: [],
    meta: {source: 'phase-5-e2e'}
};

const CLONE_PROJECT = {
    schemaVersion: '1.0.0',
    project: {id: 'clone-e2e', name: 'Clone e2e'},
    stage: {
        id: 'clone-stage',
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
        id: 'clone-sprite',
        isStage: false,
        name: 'Clonable',
        variables: [],
        lists: [],
        broadcasts: [],
        blocks: {
            'flag-clone': {
                id: 'flag-clone', opcode: 'event_whenflagclicked', next: 'create-clone',
                parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true
            },
            'create-clone': {
                id: 'create-clone', opcode: 'control_create_clone_of', next: null,
                parent: 'flag-clone',
                inputs: {CLONE_OPTION: {block: 'clone-menu', shadow: 'clone-menu'}},
                fields: {}, shadow: false, topLevel: false
            },
            'clone-menu': {
                id: 'clone-menu', opcode: 'control_create_clone_of_menu', next: null,
                parent: 'create-clone', inputs: {}, fields: {CLONE_OPTION: {value: '_myself_'}},
                shadow: true, topLevel: false
            }
        },
        scripts: ['flag-clone'],
        comments: [],
        currentCostume: 0,
        costumes: [],
        sounds: [],
        volume: 100,
        layerOrder: 1,
        visible: true,
        x: 60,
        y: 0,
        size: 100,
        direction: 90,
        draggable: false,
        rotationStyle: 'all around'
    }],
    assets: [],
    monitors: [],
    extensions: [],
    meta: {source: 'phase-5-e2e'}
};

declare global {
    interface Window {
        App: {
            createCanvasRenderer(canvas: HTMLCanvasElement): {
                getDrawOrder(): string[];
            };
            makeRuntime(dsl: unknown, renderer?: unknown, input?: unknown): {
                greenFlag(): void;
                tick(): void;
                clones: Array<{id: string}>;
            };
        };
    }
}

const gotoHarness = async (page: Page): Promise<void> => {
    await page.goto('/harness.html');
    await page.waitForFunction(() => typeof window.App !== 'undefined');
};

test.describe('Phase 5 pen + clone rendering', () => {
    test('pen down rasterises a coloured dot onto the stage canvas', async ({page}) => {
        await gotoHarness(page);

        const pixel = await page.evaluate((dsl) => {
            const canvas = document.getElementById('stage') as HTMLCanvasElement;
            const renderer = window.App.createCanvasRenderer(canvas);
            const runtime = window.App.makeRuntime(dsl, renderer);
            runtime.greenFlag();
            runtime.tick();
            const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
            const data = ctx.getImageData(240, 180, 1, 1).data;
            return {r: data[0], g: data[1], b: data[2], a: data[3]};
        }, PEN_PROJECT);

        // A red pen dot was drawn at the stage origin (canvas centre 240,180).
        expect(pixel.a).toBeGreaterThan(0);
        expect(pixel.r).toBeGreaterThan(200);
        expect(pixel.g).toBeLessThan(80);
        expect(pixel.b).toBeLessThan(80);
    });

    test('create clone is painted as its own drawable in the draw order', async ({page}) => {
        await gotoHarness(page);

        const result = await page.evaluate((dsl) => {
            const canvas = document.getElementById('stage') as HTMLCanvasElement;
            const renderer = window.App.createCanvasRenderer(canvas);
            const runtime = window.App.makeRuntime(dsl, renderer);
            runtime.greenFlag();
            runtime.tick();
            return {
                count: runtime.clones.length,
                cloneId: runtime.clones[0]?.id,
                drawOrder: renderer.getDrawOrder()
            };
        }, CLONE_PROJECT);

        expect(result.count).toBe(1);
        expect(result.drawOrder).toContain(result.cloneId);
    });
});
