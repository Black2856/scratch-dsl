import assert from 'node:assert/strict';
import test from 'node:test';

import type {DslBlock, DslProject} from '../../src/validation/projectValidator.ts';
import {createProject} from '../../src/model/ProjectFactory.ts';
import {Runtime} from '../../src/runtime/Runtime.ts';
import type {InputPort} from '../../src/input/InputPort.ts';
import type {
    ClockPort,
    RandomPort,
    WallClockPort,
    UserEnvironmentPort
} from '../../src/runtime/ports.ts';

// ---------------------------------------------------------------------------
// fakes / helpers
// ---------------------------------------------------------------------------

class AdvanceableClock implements ClockPort {
    ms = 0;
    now(): number {
        return this.ms;
    }
}

class FixedWallClock implements WallClockPort {
    private readonly date: Date;
    constructor(date: Date) {
        this.date = date;
    }
    nowDate(): Date {
        return this.date;
    }
}

class InjectedEnv implements UserEnvironmentPort {
    private readonly username: string;
    private readonly online: boolean | '';
    constructor(username: string, online: boolean | '') {
        this.username = username;
        this.online = online;
    }
    getUsername(): string {
        return this.username;
    }
    isOnline(): boolean | '' {
        return this.online;
    }
}

class MouseInput implements InputPort {
    mouseX = 0;
    mouseY = 0;
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

const stageProject = (
    blocks: Record<string, DslBlock>,
    scripts: string[],
    variables: Array<{id: string; name: string; value: string | number}>
): DslProject => ({
    schemaVersion: '1.0.0',
    project: {id: 'p', name: 'p'},
    stage: {
        id: 'stage', isStage: true, name: 'Stage',
        variables: variables.map(v => ({...v, isCloud: false})),
        lists: [], broadcasts: [], blocks, scripts, comments: [],
        currentCostume: 0, costumes: [], sounds: [], volume: 100,
        layerOrder: 0, tempo: 60, videoTransparency: 50, videoState: 'on', textToSpeechLanguage: null
    },
    sprites: [],
    assets: [], monitors: [], extensions: [], meta: {source: 'wave-a-test'}
});

interface RuntimeOpts {
    clock?: ClockPort;
    wallClock?: WallClockPort;
    userEnv?: UserEnvironmentPort;
    input?: InputPort;
    random?: RandomPort;
}

/**
 * Runs a project for `ticks` ticks and returns the live stage variable map.
 */
const runStage = (project: DslProject, opts: RuntimeOpts, ticks = 1): Runtime => {
    const runtime = new Runtime(opts);
    runtime.load(createProject(project));
    runtime.start();
    runtime.greenFlag();
    for (let i = 0; i < ticks; i++) runtime.tick();
    return runtime;
};

/**
 * Builds `flag -> set <varName> to <reporterId>` and returns the resulting
 * value after one tick. `reporterBlocks` must include `reporterId` parented to
 * `set`, plus any shadow children.
 */
const evalReporter = (
    reporterId: string,
    reporterBlocks: Record<string, DslBlock>,
    opts: RuntimeOpts = {}
): string | number | boolean => {
    const blocks: Record<string, DslBlock> = {
        flag: block('flag', 'event_whenflagclicked', 'set', null, {}, {}, true),
        set: block('set', 'data_setvariableto', null, 'flag',
            {VALUE: {block: reporterId, shadow: null}}, {VARIABLE: {value: 'out', id: 'v-out'}}),
        ...reporterBlocks
    };
    const runtime = runStage(stageProject(blocks, ['flag'], [{id: 'v-out', name: 'out', value: 0}]), opts);
    return runtime.project.stage.variables.get('v-out') as string | number | boolean;
};

// ---------------------------------------------------------------------------
// operators
// ---------------------------------------------------------------------------

const modBlocks = (a: number, b: number): Record<string, DslBlock> => ({
    mod: block('mod', 'operator_mod', null, 'set',
        {NUM1: {block: 'a', shadow: 'a'}, NUM2: {block: 'b', shadow: 'b'}}),
    a: numberShadow('a', 'mod', a),
    b: numberShadow('b', 'mod', b)
});

test('operator_mod uses Scratch floored modulo (negative operands)', () => {
    assert.equal(evalReporter('mod', modBlocks(7, 3)), 1);
    assert.equal(evalReporter('mod', modBlocks(-7, 3)), 2, '-7 mod 3 -> 2 (floored)');
    assert.equal(evalReporter('mod', modBlocks(7, -3)), -2, '7 mod -3 -> -2 (floored)');
    assert.equal(evalReporter('mod', modBlocks(-7, -3)), -1);
});

test('operator_round rounds half up', () => {
    const round = (n: number) => evalReporter('round', {
        round: block('round', 'operator_round', null, 'set', {NUM: {block: 'n', shadow: 'n'}}),
        n: numberShadow('n', 'round', n)
    });
    assert.equal(round(2.5), 3);
    assert.equal(round(2.4), 2);
    assert.equal(round(-2.5), -2, 'Math.round(-2.5) === -2');
});

test('operator_mathop covers abs, degree trig, and tan singularities', () => {
    const mathop = (op: string, n: number) => evalReporter('m', {
        m: block('m', 'operator_mathop', null, 'set', {NUM: {block: 'n', shadow: 'n'}}, {OPERATOR: {value: op}}),
        n: numberShadow('n', 'm', n)
    });
    assert.equal(mathop('abs', -5), 5);
    assert.equal(mathop('floor', 2.9), 2);
    assert.equal(mathop('ceiling', 2.1), 3);
    assert.equal(mathop('sqrt', 9), 3);
    assert.equal(mathop('sin', 90), 1, 'sin 90deg = 1');
    assert.equal(mathop('cos', 180), -1, 'cos 180deg = -1');
    assert.equal(mathop('tan', 45), 1, 'tan 45deg = 1');
    assert.equal(mathop('tan', 90), Infinity, 'tan 90deg = Infinity');
    assert.equal(mathop('tan', 270), -Infinity, 'tan 270deg = -Infinity');
    assert.equal(mathop('10 ^', 3), 1000);
});

// ---------------------------------------------------------------------------
// control loops / waits
// ---------------------------------------------------------------------------

test('control_repeat_until runs the body until the condition becomes true', () => {
    // repeat until (counter = 3) { change counter by 1 }
    const blocks: Record<string, DslBlock> = {
        flag: block('flag', 'event_whenflagclicked', 'loop', null, {}, {}, true),
        loop: block('loop', 'control_repeat_until', null, 'flag', {
            CONDITION: {block: 'cond', shadow: null},
            SUBSTACK: {block: 'inc', shadow: null}
        }),
        cond: block('cond', 'operator_equals', null, 'loop',
            {OPERAND1: {block: 'rd', shadow: null}, OPERAND2: {block: 'three', shadow: 'three'}}),
        rd: block('rd', 'data_variable', null, 'cond', {}, {VARIABLE: {value: 'counter', id: 'v-c'}}),
        three: block('three', 'text', null, 'cond', {}, {TEXT: {value: '3'}}, false, true),
        inc: block('inc', 'data_changevariableby', null, 'loop',
            {VALUE: {block: 'one', shadow: 'one'}}, {VARIABLE: {value: 'counter', id: 'v-c'}}),
        one: numberShadow('one', 'inc', 1)
    };
    const runtime = runStage(stageProject(blocks, ['flag'], [{id: 'v-c', name: 'counter', value: 0}]), {}, 5);
    assert.equal(runtime.project.stage.variables.get('v-c'), 3);
});

test('control_while runs the body while the condition is true', () => {
    const blocks: Record<string, DslBlock> = {
        flag: block('flag', 'event_whenflagclicked', 'loop', null, {}, {}, true),
        loop: block('loop', 'control_while', null, 'flag', {
            CONDITION: {block: 'cond', shadow: null},
            SUBSTACK: {block: 'inc', shadow: null}
        }),
        cond: block('cond', 'operator_lt', null, 'loop',
            {OPERAND1: {block: 'rd', shadow: null}, OPERAND2: {block: 'two', shadow: 'two'}}),
        rd: block('rd', 'data_variable', null, 'cond', {}, {VARIABLE: {value: 'counter', id: 'v-c'}}),
        two: block('two', 'text', null, 'cond', {}, {TEXT: {value: '2'}}, false, true),
        inc: block('inc', 'data_changevariableby', null, 'loop',
            {VALUE: {block: 'one', shadow: 'one'}}, {VARIABLE: {value: 'counter', id: 'v-c'}}),
        one: numberShadow('one', 'inc', 1)
    };
    const runtime = runStage(stageProject(blocks, ['flag'], [{id: 'v-c', name: 'counter', value: 0}]), {}, 5);
    assert.equal(runtime.project.stage.variables.get('v-c'), 2);
});

test('control_wait_until blocks until the predicate is true, then continues', () => {
    // wait until (gate = 1) -> set done to 1. A second script sets gate after one tick.
    const blocks: Record<string, DslBlock> = {
        flag: block('flag', 'event_whenflagclicked', 'wait', null, {}, {}, true),
        wait: block('wait', 'control_wait_until', 'after', 'flag', {CONDITION: {block: 'cond', shadow: null}}),
        cond: block('cond', 'operator_equals', null, 'wait',
            {OPERAND1: {block: 'rd', shadow: null}, OPERAND2: {block: 'one', shadow: 'one'}}),
        rd: block('rd', 'data_variable', null, 'cond', {}, {VARIABLE: {value: 'gate', id: 'v-g'}}),
        one: block('one', 'text', null, 'cond', {}, {TEXT: {value: '1'}}, false, true),
        after: block('after', 'data_setvariableto', null, 'wait',
            {VALUE: {block: 'done-v', shadow: 'done-v'}}, {VARIABLE: {value: 'done', id: 'v-d'}}),
        'done-v': block('done-v', 'text', null, 'after', {}, {TEXT: {value: 'yes'}}, false, true)
    };
    const runtime = new Runtime({clock: new AdvanceableClock()});
    runtime.load(createProject(stageProject(blocks, ['flag'],
        [{id: 'v-g', name: 'gate', value: 0}, {id: 'v-d', name: 'done', value: ''}])));
    runtime.start();
    runtime.greenFlag();
    runtime.tick();
    assert.equal(runtime.project.stage.variables.get('v-d'), '', 'still waiting while gate=0');
    runtime.project.stage.variables.set('v-g', 1);
    runtime.tick();
    assert.equal(runtime.project.stage.variables.get('v-d'), 'yes', 'continues once gate=1');
});

// ---------------------------------------------------------------------------
// timer / environment
// ---------------------------------------------------------------------------

test('sensing_timer measures elapsed seconds and reset restarts it', () => {
    const clock = new AdvanceableClock();
    // forever { set out to timer } so the reporter is re-evaluated every tick.
    const blocks: Record<string, DslBlock> = {
        flag: block('flag', 'event_whenflagclicked', 'loop', null, {}, {}, true),
        loop: block('loop', 'control_forever', null, 'flag', {SUBSTACK: {block: 'set', shadow: null}}),
        set: block('set', 'data_setvariableto', null, 'loop',
            {VALUE: {block: 't', shadow: null}}, {VARIABLE: {value: 'out', id: 'v-out'}}),
        t: block('t', 'sensing_timer', null, 'set')
    };
    const runtime = new Runtime({clock});
    runtime.load(createProject(stageProject(blocks, ['flag'], [{id: 'v-out', name: 'out', value: 0}])));
    runtime.start();
    runtime.greenFlag();
    clock.ms = 2500;
    runtime.tick();
    assert.equal(runtime.project.stage.variables.get('v-out'), 2.5);

    runtime.timer.reset();
    clock.ms = 4000;
    runtime.tick();
    assert.equal(runtime.project.stage.variables.get('v-out'), 1.5, 'reset at 2500ms, now 4000ms -> 1.5s');
});

test('sensing_current reads injected wall-clock date parts', () => {
    // 2026-06-22 is a Monday (getDay()=1 -> dayofweek 2). 14:30:45.
    const date = new Date(2026, 5, 22, 14, 30, 45);
    const wallClock = new FixedWallClock(date);
    const cur = (menu: string) => evalReporter('c', {
        c: block('c', 'sensing_current', null, 'set', {}, {CURRENTMENU: {value: menu}})
    }, {wallClock});
    assert.equal(cur('year'), 2026);
    assert.equal(cur('month'), 6);
    assert.equal(cur('date'), 22);
    assert.equal(cur('dayofweek'), 2);
    assert.equal(cur('hour'), 14);
    assert.equal(cur('minute'), 30);
    assert.equal(cur('second'), 45);
});

test('sensing_dayssince2000 is positive and monotonic with the wall clock', () => {
    const days = (d: Date) => evalReporter('d', {
        d: block('d', 'sensing_dayssince2000', null, 'set')
    }, {wallClock: new FixedWallClock(d)}) as number;
    const a = days(new Date(2026, 5, 22, 12, 0, 0));
    const b = days(new Date(2026, 5, 23, 12, 0, 0));
    assert.ok(a > 9000, 'far more than 9000 days since 2000');
    assert.ok(Math.abs((b - a) - 1) < 1e-6, 'one calendar day apart -> diff ~1');
});

test('sensing_online and sensing_username read the user environment port', () => {
    assert.equal(evalReporter('u', {
        u: block('u', 'sensing_username', null, 'set')
    }, {userEnv: new InjectedEnv('scratcher', true)}), 'scratcher');
    assert.equal(evalReporter('o', {
        o: block('o', 'sensing_online', null, 'set')
    }, {userEnv: new InjectedEnv('scratcher', true)}), true);
    // Headless default: empty username, '' (unknown) online.
    assert.equal(evalReporter('u2', {u2: block('u2', 'sensing_username', null, 'set')}), '');
    assert.equal(evalReporter('o2', {o2: block('o2', 'sensing_online', null, 'set')}), '');
});

// ---------------------------------------------------------------------------
// sprite-context reporters: looks number/name/size, distance, of, drag mode
// ---------------------------------------------------------------------------

const costume = (assetId: string, name: string) => ({
    id: `c-${assetId}`, name, assetId, dataFormat: 'png' as const, md5ext: `${assetId}.png`,
    bitmapResolution: 1, rotationCenterX: 0, rotationCenterY: 0
});

/**
 * One Stage (with two backdrops) + one Sprite "Actor" at (x,y,size,costume),
 * plus a second sprite "Other". The sprite runs `flag -> set out to <reporter>`
 * writing into a global stage variable `out`.
 */
const spriteScene = (
    reporterId: string,
    reporterBlocks: Record<string, DslBlock>,
    actor: {x: number; y: number; size: number; currentCostume: number; draggable?: boolean},
    extraSpriteScript?: {scripts: string[]; blocks: Record<string, DslBlock>}
): DslProject => {
    const spriteBlocks: Record<string, DslBlock> = {
        flag: block('flag', 'event_whenflagclicked', 'set', null, {}, {}, true),
        set: block('set', 'data_setvariableto', null, 'flag',
            {VALUE: {block: reporterId, shadow: null}}, {VARIABLE: {value: 'out', id: 'v-out'}}),
        ...reporterBlocks,
        ...(extraSpriteScript?.blocks ?? {})
    };
    return {
        schemaVersion: '1.0.0', project: {id: 'p', name: 'p'},
        stage: {
            id: 'stage', isStage: true, name: 'Stage',
            variables: [{id: 'v-out', name: 'out', value: 0, isCloud: false}],
            lists: [], broadcasts: [], blocks: {}, scripts: [], comments: [],
            currentCostume: 1,
            costumes: [costume('bk1', 'Backdrop1'), costume('bk2', 'Night')],
            sounds: [], volume: 100, layerOrder: 0, tempo: 60,
            videoTransparency: 50, videoState: 'on', textToSpeechLanguage: null
        },
        sprites: [
            {
                id: 'actor', isStage: false, name: 'Actor',
                variables: [{id: 'sv', name: 'health', value: 42, isCloud: false}],
                lists: [], broadcasts: [], blocks: spriteBlocks,
                scripts: ['flag', ...(extraSpriteScript?.scripts ?? [])],
                comments: [], currentCostume: actor.currentCostume,
                costumes: [costume('ca', 'Walk'), costume('cb', 'Jump')],
                sounds: [], volume: 70, layerOrder: 1, visible: true,
                x: actor.x, y: actor.y, size: actor.size, direction: 90,
                draggable: actor.draggable ?? false, rotationStyle: 'all around'
            },
            {
                id: 'other', isStage: false, name: 'Other', variables: [], lists: [],
                broadcasts: [], blocks: {}, scripts: [], comments: [], currentCostume: 0,
                costumes: [costume('co', 'O')], sounds: [], volume: 100, layerOrder: 2,
                visible: true, x: 30, y: 40, size: 100, direction: 90,
                draggable: false, rotationStyle: 'all around'
            }
        ],
        assets: ['bk1', 'bk2', 'ca', 'cb', 'co'].map(id => ({
            id, kind: 'costume' as const, dataFormat: 'png' as const, md5ext: `${id}.png`, source: `x/${id}.png`
        })),
        monitors: [], extensions: [], meta: {source: 'wave-a-sprite-test'}
    };
};

const runScene = (project: DslProject, opts: RuntimeOpts = {}, ticks = 1): Runtime => {
    const runtime = new Runtime(opts);
    runtime.load(createProject(project));
    runtime.start();
    runtime.greenFlag();
    for (let i = 0; i < ticks; i++) runtime.tick();
    return runtime;
};

test('looks_size, costume number/name, and backdrop number/name reporters', () => {
    const out = (reporterId: string, blocks: Record<string, DslBlock>) =>
        runScene(spriteScene(reporterId, blocks, {x: 0, y: 0, size: 137, currentCostume: 1}))
            .project.stage.variables.get('v-out');

    assert.equal(out('s', {s: block('s', 'looks_size', null, 'set')}), 137, 'rounded size');
    assert.equal(out('cnum', {
        cnum: block('cnum', 'looks_costumenumbername', null, 'set', {}, {NUMBER_NAME: {value: 'number'}})
    }), 2, 'currentCostume 1 -> number 2');
    assert.equal(out('cname', {
        cname: block('cname', 'looks_costumenumbername', null, 'set', {}, {NUMBER_NAME: {value: 'name'}})
    }), 'Jump');
    assert.equal(out('bnum', {
        bnum: block('bnum', 'looks_backdropnumbername', null, 'set', {}, {NUMBER_NAME: {value: 'number'}})
    }), 2, 'stage currentCostume 1 -> backdrop number 2');
    assert.equal(out('bname', {
        bname: block('bname', 'looks_backdropnumbername', null, 'set', {}, {NUMBER_NAME: {value: 'name'}})
    }), 'Night');
});

test('sensing_distanceto computes distance to mouse, a sprite, and missing target', () => {
    const dist = (menu: string, opts: RuntimeOpts = {}) => runScene(
        spriteScene('d', {
            d: block('d', 'sensing_distanceto', null, 'set', {DISTANCETOMENU: {block: 'm', shadow: 'm'}}),
            m: block('m', 'sensing_distancetomenu', null, 'd', {}, {DISTANCETOMENU: {value: menu}}, false, true)
        }, {x: 0, y: 0, size: 100, currentCostume: 0}),
        opts
    ).project.stage.variables.get('v-out');

    const mouse = new MouseInput();
    mouse.mouseX = 3;
    mouse.mouseY = 4;
    assert.equal(dist('_mouse_', {input: mouse}), 5, '(3,4) from origin -> 5');
    assert.equal(dist('Other'), 50, '(30,40) from origin -> 50');
    assert.equal(dist('Ghost'), 10000, 'missing target -> 10000');
});

test('sensing_of reads stage and sprite properties and variables', () => {
    const of = (object: string, property: string) => runScene(spriteScene('o', {
        o: block('o', 'sensing_of', null, 'set', {OBJECT: {block: 'm', shadow: 'm'}}, {PROPERTY: {value: property}}),
        m: block('m', 'sensing_of_object_menu', null, 'o', {}, {OBJECT: {value: object}}, false, true)
    }, {x: 11, y: 22, size: 80, currentCostume: 1})).project.stage.variables.get('v-out');

    assert.equal(of('_stage_', 'backdrop #'), 2);
    assert.equal(of('_stage_', 'backdrop name'), 'Night');
    assert.equal(of('Actor', 'x position'), 11);
    assert.equal(of('Actor', 'size'), 80);
    assert.equal(of('Actor', 'costume name'), 'Jump');
    assert.equal(of('Actor', 'health'), 42, 'sprite-local variable by name');
    assert.equal(of('Nobody', 'x position'), 0, 'missing target -> 0');
});

test('sensing_setdragmode mutates draggable; clones copy then diverge', () => {
    // Actor: flag sets drag mode draggable, then creates a clone of itself.
    const blocks: Record<string, DslBlock> = {
        drag: block('drag', 'sensing_setdragmode', 'mk', 'drag-hat', {}, {DRAG_MODE: {value: 'draggable'}}),
        mk: block('mk', 'control_create_clone_of', null, 'drag',
            {CLONE_OPTION: {block: 'cm', shadow: 'cm'}}),
        cm: block('cm', 'control_create_clone_of_menu', null, 'mk', {}, {CLONE_OPTION: {value: '_myself_'}}, false, true)
    };
    const project = spriteScene('noop', {noop: block('noop', 'looks_size', null, 'set')},
        {x: 0, y: 0, size: 100, currentCostume: 0},
        {scripts: ['drag-hat'], blocks: {
            'drag-hat': block('drag-hat', 'event_whenflagclicked', 'drag', null, {}, {}, true),
            ...blocks
        }});

    const runtime = runScene(project);
    const actor = runtime.project.sprites.find(s => s.name === 'Actor')!;
    assert.equal(actor.draggable, true, 'set drag mode draggable mutates the sprite');
    assert.equal(runtime.clones.length, 1);
    assert.equal(runtime.clones[0].draggable, true, 'clone copied draggable at creation');

    runtime.clones[0].setDraggable(false);
    assert.equal(actor.draggable, true, 'clone change does not leak back to the original');
});
