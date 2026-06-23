import assert from 'node:assert/strict';
import test from 'node:test';

import type {DslBlock, DslProject} from '../../src/validation/projectValidator.ts';
import {createProject} from '../../src/model/ProjectFactory.ts';
import {Runtime} from '../../src/runtime/Runtime.ts';
import type {InputPort, PointerTransition} from '../../src/input/InputPort.ts';
import type {Bounds, DrawableState, DrawableTransform, RendererPort} from '../../src/runtime/RendererPort.ts';
import type {ClockPort, RandomPort} from '../../src/runtime/ports.ts';

class AdvanceableClock implements ClockPort {
    ms = 0;
    now(): number {
        return this.ms;
    }
}

class SeqRandom implements RandomPort {
    private readonly values: number[];
    private i = 0;
    constructor(values: number[]) {
        this.values = values;
    }
    random(): number {
        const v = this.values[this.i % this.values.length];
        this.i++;
        return v;
    }
}

class FakeInput implements InputPort {
    mouseX = 0;
    mouseY = 0;
    private transitions: PointerTransition[] = [];
    getMouseX(): number {
        return this.mouseX;
    }
    getMouseY(): number {
        return this.mouseY;
    }
    isMouseDown(): boolean {
        return false;
    }
    isKeyDown(): boolean {
        return false;
    }
    queue(transition: PointerTransition): void {
        this.transitions.push(transition);
    }
    consumePointerTransitions(): PointerTransition[] {
        const drained = this.transitions;
        this.transitions = [];
        return drained;
    }
}

/** Renderer that picks by a fixed point->id map and returns box bounds. */
class FakeRenderer implements RendererPort {
    pick: string | null = null;
    boundsById = new Map<string, Bounds>();
    renderDrawables(_states: DrawableState[]): void {
        // no-op
    }
    pickTarget(): string | null {
        return this.pick;
    }
    getBounds(targetId: string, _t: DrawableTransform): Bounds | null {
        return this.boundsById.get(targetId) ?? null;
    }
}

const block = (
    id: string,
    opcode: string,
    next: string | null,
    parent: string | null,
    inputs: DslBlock['inputs'] = {},
    fields: DslBlock['fields'] = {},
    topLevel = false,
    shadow = false
): DslBlock => ({id, opcode, next, parent, inputs, fields, shadow, topLevel});

const numberShadow = (id: string, parent: string, value: number): DslBlock =>
    block(id, 'math_number', null, parent, {}, {NUM: {value}}, false, true);

type SpriteSpec = {
    id: string; name: string; x: number; y: number; direction?: number;
    draggable?: boolean; layerOrder: number; scripts: string[]; blocks: Record<string, DslBlock>;
};

const scene = (sprites: SpriteSpec[], stageCostumes: string[] = ['Backdrop1'], stageCurrent = 0): DslProject => ({
    schemaVersion: '1.0.0', project: {id: 'p', name: 'p'},
    stage: {
        id: 'stage', isStage: true, name: 'Stage',
        variables: [{id: 'v-out', name: 'out', value: 0, isCloud: false}],
        lists: [], broadcasts: [], blocks: {}, scripts: [], comments: [],
        currentCostume: stageCurrent,
        costumes: stageCostumes.map((name, i) => ({
            id: `bk-${i}`, name, assetId: `bk${i}`, dataFormat: 'png' as const,
            md5ext: `bk${i}.png`, bitmapResolution: 1, rotationCenterX: 0, rotationCenterY: 0
        })),
        sounds: [], volume: 100, layerOrder: 0, tempo: 60,
        videoTransparency: 50, videoState: 'on', textToSpeechLanguage: null
    },
    sprites: sprites.map(s => ({
        id: s.id, isStage: false as const, name: s.name, variables: [], lists: [], broadcasts: [],
        blocks: s.blocks, scripts: s.scripts, comments: [], currentCostume: 0,
        costumes: [{
            id: `c-${s.id}`, name: 'a', assetId: `as-${s.id}`, dataFormat: 'png' as const,
            md5ext: `as-${s.id}.png`, bitmapResolution: 1, rotationCenterX: 0, rotationCenterY: 0
        }],
        sounds: [], volume: 100, layerOrder: s.layerOrder, visible: true,
        x: s.x, y: s.y, size: 100, direction: s.direction ?? 90,
        draggable: s.draggable ?? false, rotationStyle: 'all around' as const
    })),
    assets: [
        ...stageCostumes.map((_, i) => ({id: `bk${i}`, kind: 'costume' as const, dataFormat: 'png' as const, md5ext: `bk${i}.png`, source: `x/bk${i}.png`})),
        ...sprites.map(s => ({id: `as-${s.id}`, kind: 'costume' as const, dataFormat: 'png' as const, md5ext: `as-${s.id}.png`, source: `x/${s.id}.png`}))
    ],
    monitors: [], extensions: [], meta: {source: 'wave-b-test'}
});

interface Opts {
    clock?: ClockPort;
    random?: RandomPort;
    input?: InputPort;
    renderer?: RendererPort;
}

const run = (project: DslProject, opts: Opts, ticks = 1): Runtime => {
    const runtime = new Runtime(opts);
    runtime.load(createProject(project));
    runtime.start();
    runtime.greenFlag();
    for (let i = 0; i < ticks; i++) runtime.tick();
    return runtime;
};

// ---------------------------------------------------------------------------
// motion: goto / glide / point towards
// ---------------------------------------------------------------------------

test('motion_goto moves to mouse, a named sprite, random, and no-ops on missing', () => {
    const gotoScript = (menuValue: string) => ({
        id: 'a1', name: 'A', x: 0, y: 0, layerOrder: 1, scripts: ['flag'], blocks: {
            flag: block('flag', 'event_whenflagclicked', 'go', null, {}, {}, true),
            go: block('go', 'motion_goto', null, 'flag', {TO: {block: 'm', shadow: 'm'}}),
            m: block('m', 'motion_goto_menu', null, 'go', {}, {TO: {value: menuValue}}, false, true)
        }
    });

    const mouse = new FakeInput();
    mouse.mouseX = 12;
    mouse.mouseY = -8;
    let a = run(scene([gotoScript('_mouse_')]), {input: mouse}).project.sprites[0];
    assert.deepEqual([a.x, a.y], [12, -8]);

    a = run(scene([
        gotoScript('Target'),
        {id: 'a2', name: 'Target', x: 55, y: -33, layerOrder: 2, scripts: [], blocks: {}}
    ]), {}).project.sprites[0];
    assert.deepEqual([a.x, a.y], [55, -33]);

    // _random_: SeqRandom -> x=round(480*(0.5-0.5))=0, y=round(360*(0.75-0.5))=90
    a = run(scene([gotoScript('_random_')]), {random: new SeqRandom([0.5, 0.75])}).project.sprites[0];
    assert.deepEqual([a.x, a.y], [0, 90]);

    a = run(scene([gotoScript('Ghost')]), {}).project.sprites[0];
    assert.deepEqual([a.x, a.y], [0, 0], 'missing target -> no move');
});

test('motion_glidesecstoxy interpolates over ticks and lands exactly', () => {
    const clock = new AdvanceableClock();
    const proj = scene([{
        id: 'g', name: 'G', x: 0, y: 0, layerOrder: 1, scripts: ['flag'], blocks: {
            flag: block('flag', 'event_whenflagclicked', 'glide', null, {}, {}, true),
            glide: block('glide', 'motion_glidesecstoxy', 'done', 'flag', {
                SECS: {block: 'secs', shadow: 'secs'},
                X: {block: 'gx', shadow: 'gx'},
                Y: {block: 'gy', shadow: 'gy'}
            }),
            secs: numberShadow('secs', 'glide', 1),
            gx: numberShadow('gx', 'glide', 100),
            gy: numberShadow('gy', 'glide', 200),
            done: block('done', 'data_setvariableto', null, 'glide',
                {VALUE: {block: 'd', shadow: 'd'}}, {VARIABLE: {value: 'out', id: 'v-out'}}),
            d: block('d', 'text', null, 'done', {}, {TEXT: {value: 'fin'}}, false, true)
        }
    }]);
    const runtime = new Runtime({clock});
    runtime.load(createProject(proj));
    runtime.start();
    runtime.greenFlag();

    clock.ms = 0;
    runtime.tick(); // setup tick, yields
    const g = runtime.project.sprites[0];
    assert.deepEqual([g.x, g.y], [0, 0], 'no movement at t=0');

    clock.ms = 500;
    runtime.tick();
    assert.deepEqual([g.x, g.y], [50, 100], 'halfway at t=0.5s');
    assert.equal(runtime.project.stage.variables.get('v-out'), 0, 'still gliding');

    clock.ms = 1000;
    runtime.tick();
    assert.deepEqual([g.x, g.y], [100, 200], 'final position at t=1s');
    assert.equal(runtime.project.stage.variables.get('v-out'), 'fin', 'continues after glide');
});

test('motion_glidesecstoxy with non-positive duration snaps immediately', () => {
    const proj = scene([{
        id: 'g', name: 'G', x: 0, y: 0, layerOrder: 1, scripts: ['flag'], blocks: {
            flag: block('flag', 'event_whenflagclicked', 'glide', null, {}, {}, true),
            glide: block('glide', 'motion_glidesecstoxy', null, 'flag', {
                SECS: {block: 'secs', shadow: 'secs'},
                X: {block: 'gx', shadow: 'gx'},
                Y: {block: 'gy', shadow: 'gy'}
            }),
            secs: numberShadow('secs', 'glide', 0),
            gx: numberShadow('gx', 'glide', 70),
            gy: numberShadow('gy', 'glide', -70)
        }
    }]);
    const g = run(proj, {clock: new AdvanceableClock()}).project.sprites[0];
    assert.deepEqual([g.x, g.y], [70, -70]);
});

test('motion_pointtowards faces mouse and a named sprite', () => {
    const pt = (menu: string, opts: Opts = {}, extra: SpriteSpec[] = []) => run(scene([{
        id: 'sp', name: 'P', x: 0, y: 0, layerOrder: 1, scripts: ['flag'], blocks: {
            flag: block('flag', 'event_whenflagclicked', 'pt', null, {}, {}, true),
            pt: block('pt', 'motion_pointtowards', null, 'flag', {TOWARDS: {block: 'm', shadow: 'm'}}),
            m: block('m', 'motion_pointtowards_menu', null, 'pt', {}, {TOWARDS: {value: menu}}, false, true)
        }
    }, ...extra]), opts).project.sprites[0];

    const mouse = new FakeInput();
    mouse.mouseX = 0;
    mouse.mouseY = 10; // straight up -> direction 0
    assert.equal(pt('_mouse_', {input: mouse}).direction, 0);

    const right = pt('R', {}, [{id: 'r', name: 'R', x: 10, y: 0, layerOrder: 2, scripts: [], blocks: {}}]);
    assert.equal(right.direction, 90, 'target to the right -> direction 90');
});

// ---------------------------------------------------------------------------
// edge bounce
// ---------------------------------------------------------------------------

test('motion_ifonedgebounce flips direction at an edge and fences position', () => {
    const proj = scene([{
        id: 'b', name: 'B', x: 240, y: 0, direction: 90, layerOrder: 1, scripts: ['flag'], blocks: {
            flag: block('flag', 'event_whenflagclicked', 'bounce', null, {}, {}, true),
            bounce: block('bounce', 'motion_ifonedgebounce', null, 'flag')
        }
    }]);
    const renderer = new FakeRenderer();
    // Sprite at right edge: bounds poking past x=240.
    renderer.boundsById.set('b', {left: 220, right: 260, top: 20, bottom: -20});
    const b = run(proj, {renderer}).project.sprites[0];
    // Facing right (90) at the right edge -> bounce to face left (-90).
    assert.equal(b.direction, -90, 'bounced off the right edge to face left');
    assert.ok(b.x <= 240, 'fenced back inside the stage');
});

test('motion_ifonedgebounce is a no-op without renderer bounds', () => {
    const proj = scene([{
        id: 'b', name: 'B', x: 0, y: 0, direction: 90, layerOrder: 1, scripts: ['flag'], blocks: {
            flag: block('flag', 'event_whenflagclicked', 'bounce', null, {}, {}, true),
            bounce: block('bounce', 'motion_ifonedgebounce', null, 'flag')
        }
    }]);
    const b = run(proj, {}).project.sprites[0];
    assert.equal(b.direction, 90, 'no bounds -> no change');
});

// ---------------------------------------------------------------------------
// backdrop + when backdrop switches to
// ---------------------------------------------------------------------------

test('looks_switchbackdropto changes backdrop and fires the matching hat', () => {
    const proj = scene([{
        id: 's', name: 'S', x: 0, y: 0, layerOrder: 1, scripts: ['flag', 'on-night'], blocks: {
            flag: block('flag', 'event_whenflagclicked', 'switch', null, {}, {}, true),
            switch: block('switch', 'looks_switchbackdropto', null, 'flag', {BACKDROP: {block: 'm', shadow: 'm'}}),
            m: block('m', 'looks_backdrops', null, 'switch', {}, {BACKDROP: {value: 'Night'}}, false, true),
            'on-night': block('on-night', 'event_whenbackdropswitchesto', 'mark', null, {}, {BACKDROP: {value: 'Night'}}, true),
            mark: block('mark', 'data_setvariableto', null, 'on-night',
                {VALUE: {block: 'v', shadow: 'v'}}, {VARIABLE: {value: 'out', id: 'v-out'}}),
            v: block('v', 'text', null, 'mark', {}, {TEXT: {value: 'switched'}}, false, true)
        }
    }], ['Day', 'Night'], 0);
    const runtime = run(proj, {}, 2);
    assert.equal(runtime.project.stage.currentCostume, 1, 'switched to Night (index 1)');
    assert.equal(runtime.project.stage.variables.get('v-out'), 'switched', 'backdrop hat ran');
});

test('looks_nextbackdrop wraps through stage costumes', () => {
    const proj = scene([{
        id: 's', name: 'S', x: 0, y: 0, layerOrder: 1, scripts: ['flag'], blocks: {
            flag: block('flag', 'event_whenflagclicked', 'next', null, {}, {}, true),
            next: block('next', 'looks_nextbackdrop', null, 'flag')
        }
    }], ['A', 'B', 'C'], 2);
    const runtime = run(proj, {});
    assert.equal(runtime.project.stage.currentCostume, 0, 'index 2 -> next wraps to 0');
});

test('looks_switchbackdroptoandwait waits for the started backdrop hat thread', () => {
    const proj = scene([{
        id: 's', name: 'S', x: 0, y: 0, layerOrder: 1, scripts: ['flag', 'on-night'], blocks: {
            flag: block('flag', 'event_whenflagclicked', 'switch', null, {}, {}, true),
            switch: block('switch', 'looks_switchbackdroptoandwait', 'after', 'flag', {BACKDROP: {block: 'm', shadow: 'm'}}),
            m: block('m', 'looks_backdrops', null, 'switch', {}, {BACKDROP: {value: 'Night'}}, false, true),
            after: block('after', 'data_setvariableto', null, 'switch',
                {VALUE: {block: 'av', shadow: 'av'}}, {VARIABLE: {value: 'out', id: 'v-out'}}),
            av: block('av', 'text', null, 'after', {}, {TEXT: {value: 'after'}}, false, true),
            'on-night': block('on-night', 'event_whenbackdropswitchesto', 'wait', null, {}, {BACKDROP: {value: 'Night'}}, true),
            wait: block('wait', 'control_wait', null, 'on-night', {DURATION: {block: 'wd', shadow: 'wd'}}),
            wd: block('wd', 'math_positive_number', null, 'wait', {}, {NUM: {value: 10}}, false, true)
        }
    }], ['Day', 'Night'], 0);
    const runtime = new Runtime({clock: new AdvanceableClock()});
    runtime.load(createProject(proj));
    runtime.start();
    runtime.greenFlag();
    runtime.tick();
    assert.equal(runtime.project.stage.variables.get('v-out'), 0, 'switch-and-wait still waiting on the hat');
});

// ---------------------------------------------------------------------------
// click hats
// ---------------------------------------------------------------------------

const clickScene = (draggable: boolean) => scene([{
    id: 'c', name: 'C', x: 0, y: 0, draggable, layerOrder: 1, scripts: ['clicked'], blocks: {
        clicked: block('clicked', 'event_whenthisspriteclicked', 'mark', null, {}, {}, true),
        mark: block('mark', 'data_changevariableby', null, 'clicked',
            {VALUE: {block: 'one', shadow: 'one'}}, {VARIABLE: {value: 'out', id: 'v-out'}}),
        one: numberShadow('one', 'mark', 1)
    }
}]);

test('event_whenthisspriteclicked fires on mouse-down for a non-draggable sprite', () => {
    const input = new FakeInput();
    const renderer = new FakeRenderer();
    renderer.pick = 'c';
    const runtime = new Runtime({input, renderer});
    runtime.load(createProject(clickScene(false)));
    runtime.start();
    runtime.greenFlag();
    input.queue({kind: 'down', x: 0, y: 0, wasDragged: false, insideStage: true});
    runtime.tick();
    assert.equal(runtime.project.stage.variables.get('v-out'), 1);
});

test('draggable sprite click fires on a non-drag mouse-up, not on down or after a drag', () => {
    const input = new FakeInput();
    const renderer = new FakeRenderer();
    renderer.pick = 'c';
    const runtime = new Runtime({input, renderer});
    runtime.load(createProject(clickScene(true)));
    runtime.start();
    runtime.greenFlag();

    input.queue({kind: 'down', x: 0, y: 0, wasDragged: false, insideStage: true});
    runtime.tick();
    assert.equal(runtime.project.stage.variables.get('v-out'), 0, 'no fire on down for draggable');

    input.queue({kind: 'up', x: 0, y: 0, wasDragged: true, insideStage: true});
    runtime.tick();
    assert.equal(runtime.project.stage.variables.get('v-out'), 0, 'dragged up does not click');

    input.queue({kind: 'up', x: 0, y: 0, wasDragged: false, insideStage: true});
    runtime.tick();
    assert.equal(runtime.project.stage.variables.get('v-out'), 1, 'non-drag up clicks');
});

test('event_whenstageclicked fires when the click misses every sprite', () => {
    const proj = scene([{
        id: 's', name: 'S', x: 0, y: 0, layerOrder: 1, scripts: ['stage-click'], blocks: {}
    }]);
    // Move the stage-click hat onto the Stage target.
    proj.stage.blocks = {
        'stage-click': block('stage-click', 'event_whenstageclicked', 'mark', null, {}, {}, true),
        mark: block('mark', 'data_setvariableto', null, 'stage-click',
            {VALUE: {block: 'v', shadow: 'v'}}, {VARIABLE: {value: 'out', id: 'v-out'}}),
        v: block('v', 'text', null, 'mark', {}, {TEXT: {value: 'stage'}}, false, true)
    };
    proj.stage.scripts = ['stage-click'];
    proj.sprites[0].scripts = [];
    proj.sprites[0].blocks = {};

    const input = new FakeInput();
    const renderer = new FakeRenderer();
    renderer.pick = null; // nothing hit
    const runtime = new Runtime({input, renderer});
    runtime.load(createProject(proj));
    runtime.start();
    runtime.greenFlag();
    input.queue({kind: 'down', x: 100, y: 100, wasDragged: false, insideStage: true});
    runtime.tick();
    assert.equal(runtime.project.stage.variables.get('v-out'), 'stage');
});

// ---------------------------------------------------------------------------
// edge-activated: when (timer) > value
// ---------------------------------------------------------------------------

test('event_whengreaterthan fires only on a false->true timer edge', () => {
    const proj = scene([{id: 's', name: 'S', x: 0, y: 0, layerOrder: 1, scripts: [], blocks: {}}]);
    proj.stage.blocks = {
        hat: block('hat', 'event_whengreaterthan', 'mark', null,
            {VALUE: {block: 'thr', shadow: 'thr'}}, {WHENGREATERTHANMENU: {value: 'TIMER'}}, true),
        thr: numberShadow('thr', 'hat', 1),
        mark: block('mark', 'data_changevariableby', null, 'hat',
            {VALUE: {block: 'one', shadow: 'one'}}, {VARIABLE: {value: 'out', id: 'v-out'}}),
        one: numberShadow('one', 'mark', 1)
    };
    proj.stage.scripts = ['hat'];

    const clock = new AdvanceableClock();
    const runtime = new Runtime({clock});
    runtime.load(createProject(proj));
    runtime.start();
    runtime.greenFlag();

    clock.ms = 500;
    runtime.tick(); // timer 0.5 -> not > 1
    assert.equal(runtime.project.stage.variables.get('v-out'), 0);

    clock.ms = 2000;
    runtime.tick(); // timer 2 > 1: rising edge, fire once
    assert.equal(runtime.project.stage.variables.get('v-out'), 1);

    clock.ms = 3000;
    runtime.tick(); // still > 1: no new edge
    assert.equal(runtime.project.stage.variables.get('v-out'), 1, 'no re-fire while staying true');

    runtime.timer.reset(); // timer back to 0 at ms=3000
    clock.ms = 3100;
    runtime.tick(); // timer 0.1 -> false again
    clock.ms = 6000;
    runtime.tick(); // timer ~2.9 > 1: new rising edge
    assert.equal(runtime.project.stage.variables.get('v-out'), 2, 'fires again on the next edge');
});
