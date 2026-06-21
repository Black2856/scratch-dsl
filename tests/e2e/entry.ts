/**
 * Browser bundle entry point for Playwright integration tests. Bundled by
 * tests/e2e/serve.mjs (esbuild, plain IIFE — see that file's comment on why
 * esbuild's `globalName` option is intentionally not used here) so the same
 * TypeScript sources used by node:test unit tests run unmodified inside a
 * real browser. Exposes a small factory surface on window.App that test
 * specs call into via page.evaluate().
 */
import {CanvasRenderer} from '../../src/render/CanvasRenderer.ts';
import {DomInputManager} from '../../src/input/DomInputManager.ts';
import {Runtime} from '../../src/runtime/Runtime.ts';
import {createProject} from '../../src/model/ProjectFactory.ts';
import * as coordinates from '../../src/render/coordinates.ts';
import {normalizeKey} from '../../src/input/keyNames.ts';
import {AssetManager} from '../../src/assets/AssetManager.ts';
import {BrowserImageDecoder, loadCurrentCostumeSkins} from '../../src/render/CostumeSkinLoader.ts';
import {WebAudioPort} from '../../src/audio/WebAudioPort.ts';
import {SoundManager} from '../../src/audio/SoundManager.ts';
import type {DslProject} from '../../src/validation/projectValidator.ts';

const createCanvasRenderer = (canvas: HTMLCanvasElement): CanvasRenderer => new CanvasRenderer(canvas);

const createInputManager = (canvas: HTMLCanvasElement): DomInputManager => new DomInputManager(canvas, window);

const makeRuntime = (dsl: DslProject, renderer?: CanvasRenderer, input?: DomInputManager): Runtime => {
    const project = createProject(dsl);
    const runtime = new Runtime({renderer, input});
    runtime.load(project);
    runtime.start();
    return runtime;
};

const App = {
    createCanvasRenderer,
    createInputManager,
    makeRuntime,
    createProject,
    coordinates,
    normalizeKey,
    Runtime,
    CanvasRenderer,
    DomInputManager,
    AssetManager,
    BrowserImageDecoder,
    loadCurrentCostumeSkins,
    WebAudioPort,
    SoundManager
};

(window as unknown as {App: typeof App}).App = App;
