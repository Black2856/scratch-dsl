import assert from 'node:assert/strict';
import test from 'node:test';

import type {DslBlock, DslProject} from '../../src/validation/projectValidator.ts';
import {createProject} from '../../src/model/ProjectFactory.ts';
import {Runtime} from '../../src/runtime/Runtime.ts';
import type {QuestionUiPort} from '../../src/runtime/QuestionManager.ts';
import type {ClockPort} from '../../src/runtime/ports.ts';

class AdvanceableClock implements ClockPort {
    ms = 0;
    now(): number {
        return this.ms;
    }
}

class FakeQuestionUi implements QuestionUiPort {
    shown: string | null = null;
    cleared = 0;
    showQuestion(text: string): void {
        this.shown = text;
    }
    clearQuestion(): void {
        this.shown = null;
        this.cleared++;
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

const textShadow = (id: string, parent: string, value: string): DslBlock =>
    block(id, 'text', null, parent, {}, {TEXT: {value}}, false, true);

const numberShadow = (id: string, parent: string, value: number): DslBlock =>
    block(id, 'math_number', null, parent, {}, {NUM: {value}}, false, true);

/** Project with one sprite "Actor" running `scripts`, plus a global var `out`. */
const spriteProject = (
    blocks: Record<string, DslBlock>,
    scripts: string[],
    visible = true
): DslProject => ({
    schemaVersion: '1.0.0', project: {id: 'proj', name: 'p'},
    stage: {
        id: 'stage', isStage: true, name: 'Stage',
        variables: [{id: 'v-out', name: 'out', value: '', isCloud: false}],
        lists: [], broadcasts: [], blocks: {}, scripts: [], comments: [],
        currentCostume: 0, costumes: [], sounds: [], volume: 100, layerOrder: 0,
        tempo: 60, videoTransparency: 50, videoState: 'on', textToSpeechLanguage: null
    },
    sprites: [{
        id: 'actor', isStage: false, name: 'Actor', variables: [], lists: [], broadcasts: [],
        blocks, scripts, comments: [], currentCostume: 0, costumes: [], sounds: [],
        volume: 100, layerOrder: 1, visible, x: 0, y: 0, size: 100, direction: 90,
        draggable: false, rotationStyle: 'all around'
    }],
    assets: [], monitors: [], extensions: [], meta: {source: 'wave-c-test'}
});

const flush = () => new Promise(resolve => setImmediate(resolve));

// ---------------------------------------------------------------------------
// say / think bubbles
// ---------------------------------------------------------------------------

test('looks_say sets a say bubble; empty text hides it', () => {
    const proj = spriteProject({
        flag: block('flag', 'event_whenflagclicked', 'say', null, {}, {}, true),
        say: block('say', 'looks_say', null, 'flag', {MESSAGE: {block: 'm', shadow: 'm'}}),
        m: textShadow('m', 'say', 'Hello!')
    }, ['flag']);
    const runtime = new Runtime({clock: new AdvanceableClock()});
    runtime.load(createProject(proj));
    runtime.start();
    runtime.greenFlag();
    runtime.tick();
    assert.deepEqual(runtime.bubbles.get('actor'), {type: 'say', text: 'Hello!', usageId: 1});
    assert.equal(runtime.bubbles.active().length, 1);
});

test('looks_sayforsecs clears after the deadline but a later say is protected', () => {
    // say "first" for 1s; a separate script immediately says "second".
    const proj = spriteProject({
        flag: block('flag', 'event_whenflagclicked', 'sayfor', null, {}, {}, true),
        sayfor: block('sayfor', 'looks_sayforsecs', null, 'flag', {
            MESSAGE: {block: 'm1', shadow: 'm1'}, SECS: {block: 's', shadow: 's'}
        }),
        m1: textShadow('m1', 'sayfor', 'first'),
        s: numberShadow('s', 'sayfor', 1),
        flag2: block('flag2', 'event_whenflagclicked', 'say2', null, {}, {}, true),
        say2: block('say2', 'looks_say', null, 'flag2', {MESSAGE: {block: 'm2', shadow: 'm2'}}),
        m2: textShadow('m2', 'say2', 'second')
    }, ['flag', 'flag2']);
    const clock = new AdvanceableClock();
    const runtime = new Runtime({clock});
    runtime.load(createProject(proj));
    runtime.start();
    runtime.greenFlag();

    runtime.tick(); // sayfor shows "first" (usage 1), say2 overrides with "second" (usage 2)
    assert.equal(runtime.bubbles.get('actor')?.text, 'second');

    clock.ms = 2000;
    runtime.tick(); // sayfor deadline passes but usage changed -> must NOT clear "second"
    assert.equal(runtime.bubbles.get('actor')?.text, 'second', 'later say is protected from the timed clear');
});

test('looks_sayforsecs clears its own bubble when not superseded', () => {
    const proj = spriteProject({
        flag: block('flag', 'event_whenflagclicked', 'sayfor', null, {}, {}, true),
        sayfor: block('sayfor', 'looks_sayforsecs', null, 'flag', {
            MESSAGE: {block: 'm1', shadow: 'm1'}, SECS: {block: 's', shadow: 's'}
        }),
        m1: textShadow('m1', 'sayfor', 'solo'),
        s: numberShadow('s', 'sayfor', 1)
    }, ['flag']);
    const clock = new AdvanceableClock();
    const runtime = new Runtime({clock});
    runtime.load(createProject(proj));
    runtime.start();
    runtime.greenFlag();
    runtime.tick();
    assert.equal(runtime.bubbles.get('actor')?.text, 'solo');
    clock.ms = 1500;
    runtime.tick();
    assert.equal(runtime.bubbles.active().length, 0, 'bubble cleared after the deadline');
});

test('looks_think sets a think-type bubble', () => {
    const proj = spriteProject({
        flag: block('flag', 'event_whenflagclicked', 'think', null, {}, {}, true),
        think: block('think', 'looks_think', null, 'flag', {MESSAGE: {block: 'm', shadow: 'm'}}),
        m: textShadow('m', 'think', 'Hmm')
    }, ['flag']);
    const runtime = new Runtime({clock: new AdvanceableClock()});
    runtime.load(createProject(proj));
    runtime.start();
    runtime.greenFlag();
    runtime.tick();
    assert.equal(runtime.bubbles.get('actor')?.type, 'think');
});

// ---------------------------------------------------------------------------
// ask and wait / answer
// ---------------------------------------------------------------------------

test('sensing_askandwait waits, a visible sprite uses its bubble, then answer resolves', async () => {
    const proj = spriteProject({
        flag: block('flag', 'event_whenflagclicked', 'ask', null, {}, {}, true),
        ask: block('ask', 'sensing_askandwait', 'store', 'flag', {QUESTION: {block: 'q', shadow: 'q'}}),
        q: textShadow('q', 'ask', 'Name?'),
        store: block('store', 'data_setvariableto', null, 'ask',
            {VALUE: {block: 'ans', shadow: null}}, {VARIABLE: {value: 'out', id: 'v-out'}}),
        ans: block('ans', 'sensing_answer', null, 'store')
    }, ['flag']);
    const ui = new FakeQuestionUi();
    const runtime = new Runtime({clock: new AdvanceableClock(), questionUi: ui});
    runtime.load(createProject(proj));
    runtime.start();
    runtime.greenFlag();

    runtime.tick();
    await flush();
    // Visible sprite: prompt blank, question shown in its say bubble.
    assert.equal(ui.shown, '');
    assert.equal(runtime.bubbles.get('actor')?.text, 'Name?');
    assert.equal(runtime.project.stage.variables.get('v-out'), '', 'still waiting for an answer');

    runtime.submitAnswer('Ada');
    await flush();
    runtime.tick();
    assert.equal(runtime.project.stage.variables.get('v-out'), 'Ada', 'answer resolves and is read back');
    assert.equal(runtime.bubbles.active().length, 0, 'question bubble cleared on answer');
});

test('question queue is FIFO across two sprites', async () => {
    // Two sprites each ask once; answers apply in ask order.
    const mkAsk = (id: string, q: string): DslBlock[] => [
        block(`${id}-flag`, 'event_whenflagclicked', `${id}-ask`, null, {}, {}, true),
        block(`${id}-ask`, 'sensing_askandwait', null, `${id}-flag`, {QUESTION: {block: `${id}-q`, shadow: `${id}-q`}}),
        textShadow(`${id}-q`, `${id}-ask`, q)
    ];
    const toMap = (arr: DslBlock[]) => Object.fromEntries(arr.map(b => [b.id, b]));

    const proj: DslProject = {
        schemaVersion: '1.0.0', project: {id: 'proj', name: 'p'},
        stage: {
            id: 'stage', isStage: true, name: 'Stage', variables: [], lists: [], broadcasts: [],
            blocks: {}, scripts: [], comments: [], currentCostume: 0, costumes: [], sounds: [],
            volume: 100, layerOrder: 0, tempo: 60, videoTransparency: 50, videoState: 'on', textToSpeechLanguage: null
        },
        sprites: [
            {id: 'a', isStage: false, name: 'A', variables: [], lists: [], broadcasts: [],
                blocks: toMap(mkAsk('a', 'qa')), scripts: ['a-flag'], comments: [], currentCostume: 0,
                costumes: [], sounds: [], volume: 100, layerOrder: 1, visible: false,
                x: 0, y: 0, size: 100, direction: 90, draggable: false, rotationStyle: 'all around'},
            {id: 'b', isStage: false, name: 'B', variables: [], lists: [], broadcasts: [],
                blocks: toMap(mkAsk('b', 'qb')), scripts: ['b-flag'], comments: [], currentCostume: 0,
                costumes: [], sounds: [], volume: 100, layerOrder: 2, visible: false,
                x: 0, y: 0, size: 100, direction: 90, draggable: false, rotationStyle: 'all around'}
        ],
        assets: [], monitors: [], extensions: [], meta: {source: 'wave-c-fifo'}
    };
    const ui = new FakeQuestionUi();
    const runtime = new Runtime({clock: new AdvanceableClock(), questionUi: ui});
    runtime.load(createProject(proj));
    runtime.start();
    runtime.greenFlag();

    runtime.tick();
    await flush();
    // Hidden sprites use the prompt; A asked first.
    assert.equal(ui.shown, 'qa');

    runtime.submitAnswer('answerA');
    await flush();
    assert.equal(runtime.questions.getAnswer(), 'answerA');
    // Next in queue (B) is now shown.
    assert.equal(ui.shown, 'qb');

    runtime.submitAnswer('answerB');
    await flush();
    assert.equal(runtime.questions.getAnswer(), 'answerB');
    assert.equal(ui.shown, null, 'queue drained -> prompt cleared');
});

test('stop all releases a waiting ask-and-wait thread', async () => {
    const proj = spriteProject({
        flag: block('flag', 'event_whenflagclicked', 'ask', null, {}, {}, true),
        ask: block('ask', 'sensing_askandwait', null, 'flag', {QUESTION: {block: 'q', shadow: 'q'}}),
        q: textShadow('q', 'ask', 'Q?')
    }, ['flag']);
    const ui = new FakeQuestionUi();
    const runtime = new Runtime({clock: new AdvanceableClock(), questionUi: ui});
    runtime.load(createProject(proj));
    runtime.start();
    runtime.greenFlag();
    runtime.tick();
    await flush();
    assert.equal(runtime.questions.getAnswer(), '');

    runtime.stopAll(); // must resolve the pending promise and clear the prompt
    await flush();
    assert.equal(ui.shown, null, 'prompt cleared on stop all');
    // No thread is left hanging.
    assert.equal(runtime.threads.length, 0);
});

// ---------------------------------------------------------------------------
// graphic effects
// ---------------------------------------------------------------------------

test('graphic effects change/set/clear with ghost and brightness clamps', () => {
    const effectBlock = (id: string, opcode: string, effect: string, inputKey: string, value: number, parent: string, next: string | null) => ({
        [id]: block(id, opcode, next, parent, {[inputKey]: {block: `${id}-v`, shadow: `${id}-v`}}, {EFFECT: {value: effect}}),
        [`${id}-v`]: numberShadow(`${id}-v`, id, value)
    });
    const proj = spriteProject({
        flag: block('flag', 'event_whenflagclicked', 'e1', null, {}, {}, true),
        ...effectBlock('e1', 'looks_seteffectto', 'ghost', 'VALUE', 150, 'flag', 'e2'),
        ...effectBlock('e2', 'looks_changeeffectby', 'brightness', 'CHANGE', -250, 'e1', 'e3'),
        ...effectBlock('e3', 'looks_seteffectto', 'color', 'VALUE', 75, 'e2', null)
    }, ['flag']);
    const runtime = new Runtime({clock: new AdvanceableClock()});
    runtime.load(createProject(proj));
    runtime.start();
    runtime.greenFlag();
    runtime.tick();
    const actor = runtime.project.sprites[0];
    assert.equal(actor.effects.ghost, 100, 'ghost clamped to 100');
    assert.equal(actor.effects.brightness, -100, 'brightness clamped to -100');
    assert.equal(actor.effects.color, 75, 'color is unbounded');
});

test('clear graphic effects resets all to 0; clones copy then diverge', () => {
    const proj = spriteProject({
        flag: block('flag', 'event_whenflagclicked', 'set', null, {}, {}, true),
        set: block('set', 'looks_seteffectto', 'mk', 'flag',
            {VALUE: {block: 'sv', shadow: 'sv'}}, {EFFECT: {value: 'ghost'}}),
        sv: numberShadow('sv', 'set', 50),
        mk: block('mk', 'control_create_clone_of', null, 'set', {CLONE_OPTION: {block: 'cm', shadow: 'cm'}}),
        cm: block('cm', 'control_create_clone_of_menu', null, 'mk', {}, {CLONE_OPTION: {value: '_myself_'}}, false, true)
    }, ['flag']);
    const runtime = new Runtime({clock: new AdvanceableClock()});
    runtime.load(createProject(proj));
    runtime.start();
    runtime.greenFlag();
    runtime.tick();
    const actor = runtime.project.sprites[0];
    assert.equal(actor.effects.ghost, 50);
    assert.equal(runtime.clones.length, 1);
    assert.equal(runtime.clones[0].effects.ghost, 50, 'clone copied ghost at creation');

    runtime.clones[0].clearEffects();
    assert.equal(actor.effects.ghost, 50, 'clearing the clone does not affect the original');
    assert.equal(runtime.clones[0].effects.ghost, 0);
});

// ---------------------------------------------------------------------------
// object touching (renderer-backed; headless returns false)
// ---------------------------------------------------------------------------

test('sensing_touchingobject queries the renderer and is false headless', () => {
    const proj = spriteProject({
        flag: block('flag', 'event_whenflagclicked', 'set', null, {}, {}, true),
        set: block('set', 'data_setvariableto', null, 'flag',
            {VALUE: {block: 't', shadow: null}}, {VARIABLE: {value: 'out', id: 'v-out'}}),
        t: block('t', 'sensing_touchingobject', null, 'set', {TOUCHINGOBJECTMENU: {block: 'm', shadow: 'm'}}),
        m: block('m', 'sensing_touchingobjectmenu', null, 't', {}, {TOUCHINGOBJECTMENU: {value: '_edge_'}}, false, true)
    }, ['flag']);

    // Headless: no renderer -> false.
    const headless = new Runtime({clock: new AdvanceableClock()});
    headless.load(createProject(proj));
    headless.start();
    headless.greenFlag();
    headless.tick();
    assert.equal(headless.project.stage.variables.get('v-out'), false);

    // With a renderer reporting edge contact -> true.
    let asked: string | null = null;
    const renderer = {
        renderDrawables() {},
        isTouchingEdge(id: string) {
            asked = id;
            return true;
        }
    };
    const withRenderer = new Runtime({clock: new AdvanceableClock(), renderer});
    withRenderer.load(createProject(proj));
    withRenderer.start();
    withRenderer.greenFlag();
    withRenderer.tick();
    assert.equal(withRenderer.project.stage.variables.get('v-out'), true);
    assert.equal(asked, 'actor', 'renderer queried for the judging target');
});
