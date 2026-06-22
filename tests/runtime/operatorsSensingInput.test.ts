import assert from 'node:assert/strict';
import test from 'node:test';

import type {DslBlock, DslProject} from '../../src/validation/projectValidator.ts';
import {createProject} from '../../src/model/ProjectFactory.ts';
import {Runtime} from '../../src/runtime/Runtime.ts';
import type {InputPort} from '../../src/input/InputPort.ts';
import type {DrawableState, MonitorView, RendererPort} from '../../src/render/RendererPort.ts';
import type {ClockPort, RandomPort} from '../../src/runtime/ports.ts';

class FakeClock implements ClockPort {
    now(): number {
        return 0;
    }
}

class FixedRandom implements RandomPort {
    private readonly value: number;
    constructor(value: number) {
        this.value = value;
    }
    random(): number {
        return this.value;
    }
}

/** Scriptable InputPort for keyboard/mouse/sensing tests. */
class FakeInput implements InputPort {
    mouseX = 0;
    mouseY = 0;
    mouseDown = false;
    readonly keys = new Set<string>();
    private presses: string[] = [];

    getMouseX(): number {
        return this.mouseX;
    }
    getMouseY(): number {
        return this.mouseY;
    }
    isMouseDown(): boolean {
        return this.mouseDown;
    }
    isKeyDown(key: string): boolean {
        return this.keys.has(key);
    }
    queuePress(key: string): void {
        this.presses.push(key);
    }
    consumeKeyPresses(): string[] {
        const drained = this.presses;
        this.presses = [];
        return drained;
    }
}

class CapturingRenderer implements RendererPort {
    lastMonitors: MonitorView[] = [];
    renderDrawables(_states: DrawableState[]): void {
        // no-op
    }
    renderMonitors(monitors: MonitorView[]): void {
        this.lastMonitors = monitors;
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

const wholeNumberShadow = (id: string, parent: string, value: number): DslBlock =>
    block(id, 'math_whole_number', null, parent, {}, {NUM: {value}}, false, true);

const textShadow = (id: string, parent: string, value: string): DslBlock =>
    block(id, 'text', null, parent, {}, {TEXT: {value}}, false, true);

const makeStageProject = (
    blocks: Record<string, DslBlock>,
    scripts: string[],
    variables: Array<{id: string; name: string; value: string | number}>,
    monitors: DslProject['monitors'] = []
): DslProject => ({
    schemaVersion: '1.0.0',
    project: {id: 'p', name: 'p'},
    stage: {
        id: 'stage',
        isStage: true,
        name: 'Stage',
        variables: variables.map(v => ({...v, isCloud: false})),
        lists: [],
        broadcasts: [],
        blocks,
        scripts,
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
    sprites: [],
    assets: [],
    monitors,
    extensions: [],
    meta: {source: 'operators-sensing-test'}
});

test('operators evaluate numbers, strings, and booleans', () => {
    // One flag script chains set-variable blocks, each reading an operator
    // reporter built from literal shadows.
    const blocks: Record<string, DslBlock> = {
        flag: block('flag', 'event_whenflagclicked', 'set-add', null, {}, {}, true)
    };

    const setVar = (
        setId: string,
        next: string | null,
        parent: string,
        varId: string,
        varName: string,
        reporterId: string
    ): void => {
        blocks[setId] = block(
            setId,
            'data_setvariableto',
            next,
            parent,
            {VALUE: {block: reporterId, shadow: null}},
            {VARIABLE: {value: varName, id: varId}}
        );
    };

    setVar('set-add', 'set-join', 'flag', 'r-add', 'rAdd', 'op-add');
    blocks['op-add'] = block('op-add', 'operator_add', null, 'set-add', {
        NUM1: {block: 'add-1', shadow: 'add-1'},
        NUM2: {block: 'add-2', shadow: 'add-2'}
    });
    blocks['add-1'] = numberShadow('add-1', 'op-add', 3);
    blocks['add-2'] = numberShadow('add-2', 'op-add', 4);

    setVar('set-join', 'set-eq', 'set-add', 'r-join', 'rJoin', 'op-join');
    blocks['op-join'] = block('op-join', 'operator_join', null, 'set-join', {
        STRING1: {block: 'j-1', shadow: 'j-1'},
        STRING2: {block: 'j-2', shadow: 'j-2'}
    });
    blocks['j-1'] = textShadow('j-1', 'op-join', 'ab');
    blocks['j-2'] = textShadow('j-2', 'op-join', 'cd');

    setVar('set-eq', 'set-letter', 'set-join', 'r-eq', 'rEq', 'op-eq');
    blocks['op-eq'] = block('op-eq', 'operator_equals', null, 'set-eq', {
        OPERAND1: {block: 'e-1', shadow: 'e-1'},
        OPERAND2: {block: 'e-2', shadow: 'e-2'}
    });
    blocks['e-1'] = textShadow('e-1', 'op-eq', '5');
    blocks['e-2'] = textShadow('e-2', 'op-eq', '5');

    setVar('set-letter', 'set-len', 'set-eq', 'r-letter', 'rLetter', 'op-letter');
    blocks['op-letter'] = block('op-letter', 'operator_letter_of', null, 'set-letter', {
        LETTER: {block: 'l-idx', shadow: 'l-idx'},
        STRING: {block: 'l-str', shadow: 'l-str'}
    });
    blocks['l-idx'] = wholeNumberShadow('l-idx', 'op-letter', 2);
    blocks['l-str'] = textShadow('l-str', 'op-letter', 'world');

    setVar('set-len', 'set-contains', 'set-letter', 'r-len', 'rLen', 'op-len');
    blocks['op-len'] = block('op-len', 'operator_length', null, 'set-len', {
        STRING: {block: 'len-str', shadow: 'len-str'}
    });
    blocks['len-str'] = textShadow('len-str', 'op-len', 'hello');

    setVar('set-contains', 'set-rand', 'set-len', 'r-contains', 'rContains', 'op-contains');
    blocks['op-contains'] = block('op-contains', 'operator_contains', null, 'set-contains', {
        STRING1: {block: 'c-1', shadow: 'c-1'},
        STRING2: {block: 'c-2', shadow: 'c-2'}
    });
    blocks['c-1'] = textShadow('c-1', 'op-contains', 'Scratch');
    blocks['c-2'] = textShadow('c-2', 'op-contains', 'rat');

    setVar('set-rand', null, 'set-contains', 'r-rand', 'rRand', 'op-rand');
    blocks['op-rand'] = block('op-rand', 'operator_random', null, 'set-rand', {
        FROM: {block: 'rand-1', shadow: 'rand-1'},
        TO: {block: 'rand-2', shadow: 'rand-2'}
    });
    blocks['rand-1'] = numberShadow('rand-1', 'op-rand', 1);
    blocks['rand-2'] = numberShadow('rand-2', 'op-rand', 10);

    const project = createProject(makeStageProject(
        blocks,
        ['flag'],
        [
            {id: 'r-add', name: 'rAdd', value: 0},
            {id: 'r-join', name: 'rJoin', value: ''},
            {id: 'r-eq', name: 'rEq', value: ''},
            {id: 'r-letter', name: 'rLetter', value: ''},
            {id: 'r-len', name: 'rLen', value: 0},
            {id: 'r-contains', name: 'rContains', value: ''},
            {id: 'r-rand', name: 'rRand', value: 0}
        ]
    ));
    // FixedRandom(0.5): integer random over [1,10] => 1 + floor(0.5*10) = 6.
    const runtime = new Runtime({clock: new FakeClock(), random: new FixedRandom(0.5)});
    runtime.load(project);
    runtime.start();
    runtime.greenFlag();
    runtime.tick();

    const vars = runtime.project.stage.variables;
    assert.equal(vars.get('r-add'), 7);
    assert.equal(vars.get('r-join'), 'abcd');
    assert.equal(vars.get('r-eq'), true);
    assert.equal(vars.get('r-letter'), 'o');
    assert.equal(vars.get('r-len'), 5);
    assert.equal(vars.get('r-contains'), true);
    assert.equal(vars.get('r-rand'), 6);
});

test('sensing reporters read mouse and keyboard state from the input port', () => {
    const blocks: Record<string, DslBlock> = {
        flag: block('flag', 'event_whenflagclicked', 'set-mx', null, {}, {}, true),
        'set-mx': block('set-mx', 'data_setvariableto', 'set-down', 'flag',
            {VALUE: {block: 'op-mx', shadow: null}}, {VARIABLE: {value: 'mx', id: 'v-mx'}}),
        'op-mx': block('op-mx', 'sensing_mousex', null, 'set-mx'),
        'set-down': block('set-down', 'data_setvariableto', 'set-key', 'set-mx',
            {VALUE: {block: 'op-down', shadow: null}}, {VARIABLE: {value: 'down', id: 'v-down'}}),
        'op-down': block('op-down', 'sensing_mousedown', null, 'set-down'),
        'set-key': block('set-key', 'data_setvariableto', null, 'set-down',
            {VALUE: {block: 'op-key', shadow: null}}, {VARIABLE: {value: 'keySpace', id: 'v-key'}}),
        'op-key': block('op-key', 'sensing_keypressed', null, 'set-key',
            {KEY_OPTION: {block: 'key-shadow', shadow: 'key-shadow'}}),
        'key-shadow': block('key-shadow', 'sensing_keyoptions', null, 'op-key', {},
            {KEY_OPTION: {value: 'space'}}, false, true)
    };

    const project = createProject(makeStageProject(blocks, ['flag'], [
        {id: 'v-mx', name: 'mx', value: 0},
        {id: 'v-down', name: 'down', value: ''},
        {id: 'v-key', name: 'keySpace', value: ''}
    ]));
    const input = new FakeInput();
    input.mouseX = 42;
    input.mouseDown = true;
    input.keys.add('space');

    const runtime = new Runtime({clock: new FakeClock(), input});
    runtime.load(project);
    runtime.start();
    runtime.greenFlag();
    runtime.tick();

    const vars = runtime.project.stage.variables;
    assert.equal(vars.get('v-mx'), 42);
    assert.equal(vars.get('v-down'), true);
    assert.equal(vars.get('v-key'), true);
});

test('when key pressed hats fire once per drained keydown edge', () => {
    const blocks: Record<string, DslBlock> = {
        'hat-space': block('hat-space', 'event_whenkeypressed', 'inc', null, {},
            {KEY_OPTION: {value: 'space'}}, true),
        inc: block('inc', 'data_changevariableby', null, 'hat-space',
            {VALUE: {block: 'one', shadow: 'one'}}, {VARIABLE: {value: 'hits', id: 'v-hits'}}),
        one: numberShadow('one', 'inc', 1),
        'hat-any': block('hat-any', 'event_whenkeypressed', 'inc-any', null, {},
            {KEY_OPTION: {value: 'any'}}, true),
        'inc-any': block('inc-any', 'data_changevariableby', null, 'hat-any',
            {VALUE: {block: 'one-any', shadow: 'one-any'}}, {VARIABLE: {value: 'anyHits', id: 'v-any'}}),
        'one-any': numberShadow('one-any', 'inc-any', 1)
    };

    const project = createProject(makeStageProject(blocks, ['hat-space', 'hat-any'], [
        {id: 'v-hits', name: 'hits', value: 0},
        {id: 'v-any', name: 'anyHits', value: 0}
    ]));
    const input = new FakeInput();
    const runtime = new Runtime({clock: new FakeClock(), input});
    runtime.load(project);
    runtime.start();
    runtime.greenFlag();

    // No press yet.
    runtime.tick();
    assert.equal(runtime.project.stage.variables.get('v-hits'), 0);
    assert.equal(runtime.project.stage.variables.get('v-any'), 0);

    // Space press: matches both the space hat and the 'any' hat.
    input.queuePress('space');
    runtime.tick();
    assert.equal(runtime.project.stage.variables.get('v-hits'), 1);
    assert.equal(runtime.project.stage.variables.get('v-any'), 1);

    // A different key fires only the 'any' hat.
    input.queuePress('a');
    runtime.tick();
    assert.equal(runtime.project.stage.variables.get('v-hits'), 1);
    assert.equal(runtime.project.stage.variables.get('v-any'), 2);
});

test('looks and motion primitives mutate renderable sprite state', () => {
    const spriteBlocks: Record<string, DslBlock> = {
        flag: block('flag', 'event_whenflagclicked', 'sz', null, {}, {}, true),
        sz: block('sz', 'looks_setsizeto', 'csz', 'flag', {SIZE: {block: 'sz-v', shadow: 'sz-v'}}),
        'sz-v': numberShadow('sz-v', 'sz', 150),
        csz: block('csz', 'looks_changesizeby', 'sc', 'sz', {CHANGE: {block: 'csz-v', shadow: 'csz-v'}}),
        'csz-v': numberShadow('csz-v', 'csz', -25),
        sc: block('sc', 'looks_switchcostumeto', 'nc', 'csz', {COSTUME: {block: 'sc-m', shadow: 'sc-m'}}),
        'sc-m': block('sc-m', 'looks_costume', null, 'sc', {}, {COSTUME: {value: 'B'}}, false, true),
        nc: block('nc', 'looks_nextcostume', 'tr', 'sc'),
        tr: block('tr', 'motion_turnright', 'pd', 'nc', {DEGREES: {block: 'tr-v', shadow: 'tr-v'}}),
        'tr-v': numberShadow('tr-v', 'tr', 45),
        pd: block('pd', 'motion_pointindirection', 'hd', 'tr', {DIRECTION: {block: 'pd-v', shadow: 'pd-v'}}),
        'pd-v': block('pd-v', 'math_angle', null, 'pd', {}, {NUM: {value: 200}}, false, true),
        hd: block('hd', 'looks_hide', 'rep', 'pd'),
        rep: block('rep', 'data_setvariableto', null, 'hd',
            {VALUE: {block: 'dir', shadow: null}}, {VARIABLE: {value: 'dir', id: 'v-dir'}}),
        dir: block('dir', 'motion_direction', null, 'rep')
    };

    const dsl: DslProject = {
        schemaVersion: '1.0.0',
        project: {id: 'p', name: 'p'},
        stage: {
            id: 'stage', isStage: true, name: 'Stage',
            variables: [{id: 'v-dir', name: 'dir', value: 0, isCloud: false}],
            lists: [], broadcasts: [], blocks: {}, scripts: [], comments: [],
            currentCostume: 0, costumes: [], sounds: [], volume: 100,
            layerOrder: 0, tempo: 60, videoTransparency: 50, videoState: 'on', textToSpeechLanguage: null
        },
        sprites: [{
            id: 'actor', isStage: false, name: 'Actor', variables: [], lists: [], broadcasts: [],
            blocks: spriteBlocks, scripts: ['flag'], comments: [], currentCostume: 0,
            costumes: [
                {id: 'c-a', name: 'A', assetId: 'aa', dataFormat: 'png', md5ext: 'aa.png', bitmapResolution: 1, rotationCenterX: 0, rotationCenterY: 0},
                {id: 'c-b', name: 'B', assetId: 'bb', dataFormat: 'png', md5ext: 'bb.png', bitmapResolution: 1, rotationCenterX: 0, rotationCenterY: 0}
            ],
            sounds: [], volume: 100, layerOrder: 1, visible: true,
            x: 0, y: 0, size: 100, direction: 90, draggable: false, rotationStyle: 'all around'
        }],
        assets: [
            {id: 'aa', kind: 'costume', dataFormat: 'png', md5ext: 'aa.png', source: 'x/a.png'},
            {id: 'bb', kind: 'costume', dataFormat: 'png', md5ext: 'bb.png', source: 'x/b.png'}
        ],
        monitors: [], extensions: [], meta: {source: 'looks-motion-test'}
    };

    const project = createProject(dsl);
    const runtime = new Runtime({clock: new FakeClock()});
    runtime.load(project);
    runtime.start();
    runtime.greenFlag();
    runtime.tick();

    const sprite = project.sprites[0];
    assert.equal(sprite.size, 125, 'setsizeto 150 then change -25 -> 125');
    assert.equal(sprite.currentCostume, 0, 'switch to B (index 1) then next wraps back to 0');
    assert.equal(sprite.direction, -160, 'turn right 45 (135) then point 200 wraps to -160');
    assert.equal(sprite.visible, false, 'hide sets visible false');
    assert.equal(project.stage.variables.get('v-dir'), -160, 'direction reporter reads sprite direction');
});

test('looks layer blocks reorder draw targets (go to front)', () => {
    const mkSprite = (id: string, name: string, layer: number, hatId: string, body: DslBlock) => ({
        id, isStage: false as const, name, variables: [], lists: [], broadcasts: [],
        blocks: {[hatId]: block(hatId, 'event_whenflagclicked', body.id, null, {}, {}, true), [body.id]: body},
        scripts: [hatId], comments: [], currentCostume: 0, costumes: [], sounds: [], volume: 100,
        layerOrder: layer, visible: true, x: 0, y: 0, size: 100, direction: 90,
        draggable: false, rotationStyle: 'all around' as const
    });

    const dsl: DslProject = {
        schemaVersion: '1.0.0', project: {id: 'p', name: 'p'},
        stage: {
            id: 'stage', isStage: true, name: 'Stage', variables: [], lists: [], broadcasts: [],
            blocks: {}, scripts: [], comments: [], currentCostume: 0, costumes: [], sounds: [],
            volume: 100, layerOrder: 0, tempo: 60, videoTransparency: 50, videoState: 'on', textToSpeechLanguage: null
        },
        sprites: [
            mkSprite('s1', 'S1', 1, 'h1',
                block('front', 'looks_gotofrontback', null, 'h1', {}, {FRONT_BACK: {value: 'front'}})),
            mkSprite('s2', 'S2', 2, 'h2', block('noop2', 'looks_nextcostume', null, 'h2'))
        ],
        assets: [], monitors: [], extensions: [], meta: {source: 'layer-test'}
    };

    const project = createProject(dsl);
    const runtime = new Runtime({clock: new FakeClock()});
    runtime.load(project);
    runtime.start();
    runtime.greenFlag();
    runtime.tick();

    // S1 started behind S2 (layer 1 < 2); after "go to front" it must be on top.
    const s1 = project.sprites.find(s => s.id === 's1')!;
    const s2 = project.sprites.find(s => s.id === 's2')!;
    assert.ok(s1.layerOrder > s2.layerOrder, 'go to front puts S1 above S2');
});

test('broadcast and key hats fire on live clones, not just original targets', () => {
    // A sprite creates one clone on green flag, and both the original and the
    // clone carry a `when I receive go` hat (and a `when key a pressed` hat)
    // that bump a global counter. Per Scratch v14.1.0 the broadcast/key hat
    // must run on the clone too, so each fires twice (original + clone).
    const stageBlocks: Record<string, DslBlock> = {};
    const spriteBlocks: Record<string, DslBlock> = {
        flag: block('flag', 'event_whenflagclicked', 'mk-clone', null, {}, {}, true),
        'mk-clone': block('mk-clone', 'control_create_clone_of', null, 'flag',
            {CLONE_OPTION: {block: 'clone-menu', shadow: 'clone-menu'}}),
        'clone-menu': block('clone-menu', 'control_create_clone_of_menu', null, 'mk-clone', {},
            {CLONE_OPTION: {value: '_myself_'}}, false, true),
        'recv-go': block('recv-go', 'event_whenbroadcastreceived', 'inc-bc', null, {},
            {BROADCAST_OPTION: {value: 'go', id: 'bc-go'}}, true),
        'inc-bc': block('inc-bc', 'data_changevariableby', null, 'recv-go',
            {VALUE: {block: 'one-bc', shadow: 'one-bc'}}, {VARIABLE: {value: 'hits', id: 'v-hits'}}),
        'one-bc': numberShadow('one-bc', 'inc-bc', 1),
        'key-a': block('key-a', 'event_whenkeypressed', 'inc-key', null, {},
            {KEY_OPTION: {value: 'a'}}, true),
        'inc-key': block('inc-key', 'data_changevariableby', null, 'key-a',
            {VALUE: {block: 'one-key', shadow: 'one-key'}}, {VARIABLE: {value: 'keyHits', id: 'v-keyhits'}}),
        'one-key': numberShadow('one-key', 'inc-key', 1)
    };

    const dsl: DslProject = {
        schemaVersion: '1.0.0',
        project: {id: 'p', name: 'p'},
        stage: {
            id: 'stage', isStage: true, name: 'Stage',
            variables: [
                {id: 'v-hits', name: 'hits', value: 0, isCloud: false},
                {id: 'v-keyhits', name: 'keyHits', value: 0, isCloud: false}
            ],
            lists: [], broadcasts: [{id: 'bc-go', name: 'go'}], blocks: stageBlocks, scripts: [],
            comments: [], currentCostume: 0, costumes: [], sounds: [], volume: 100,
            layerOrder: 0, tempo: 60, videoTransparency: 50, videoState: 'on', textToSpeechLanguage: null
        },
        sprites: [{
            id: 'actor', isStage: false, name: 'Actor', variables: [], lists: [], broadcasts: [],
            blocks: spriteBlocks, scripts: ['flag', 'recv-go', 'key-a'], comments: [],
            currentCostume: 0, costumes: [], sounds: [], volume: 100, layerOrder: 1,
            visible: true, x: 0, y: 0, size: 100, direction: 90, draggable: false, rotationStyle: 'all around'
        }],
        assets: [], monitors: [], extensions: [], meta: {source: 'clone-broadcast-test'}
    };

    const input = new FakeInput();
    const runtime = new Runtime({clock: new FakeClock(), input});
    runtime.load(createProject(dsl));
    runtime.start();
    runtime.greenFlag();
    runtime.tick(); // flag hat creates one clone
    assert.equal(runtime.clones.length, 1);

    runtime.startHats('event_whenbroadcastreceived', {broadcastId: 'bc-go'}, true);
    runtime.tick();
    assert.equal(runtime.project.stage.variables.get('v-hits'), 2, 'broadcast hat must run on original + clone');

    input.queuePress('a');
    runtime.tick();
    assert.equal(runtime.project.stage.variables.get('v-keyhits'), 2, 'key hat must run on original + clone');
});

test('runtime renders visible variable monitors with live values', () => {
    const blocks: Record<string, DslBlock> = {
        flag: block('flag', 'event_whenflagclicked', 'set-score', null, {}, {}, true),
        'set-score': block('set-score', 'data_setvariableto', null, 'flag',
            {VALUE: {block: 'score-val', shadow: 'score-val'}}, {VARIABLE: {value: 'score', id: 'v-score'}}),
        'score-val': textShadow('score-val', 'set-score', '99')
    };

    const monitors: DslProject['monitors'] = [{
        id: 'mon-score',
        opcode: 'data_variable',
        visible: true,
        mode: 'default',
        params: {VARIABLE: 'score'},
        spriteName: null,
        value: 0,
        x: 10,
        y: 20
    }];

    const project = createProject(makeStageProject(blocks, ['flag'],
        [{id: 'v-score', name: 'score', value: 0}], monitors));
    const renderer = new CapturingRenderer();
    const runtime = new Runtime({clock: new FakeClock(), renderer});
    runtime.load(project);
    runtime.start();
    runtime.greenFlag();
    runtime.tick();

    assert.equal(renderer.lastMonitors.length, 1);
    assert.deepEqual(renderer.lastMonitors[0], {
        id: 'mon-score',
        label: 'score',
        value: '99',
        x: 10,
        y: 20
    });
});
