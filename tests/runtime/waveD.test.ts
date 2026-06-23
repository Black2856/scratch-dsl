import assert from 'node:assert/strict';
import test from 'node:test';

import type {DslBlock, DslProject} from '../../src/validation/projectValidator.ts';
import {createProject} from '../../src/model/ProjectFactory.ts';
import {Runtime} from '../../src/runtime/Runtime.ts';
import {PenManager} from '../../src/runtime/PenManager.ts';
import {hsvToRgb, rgbaString} from '../../src/runtime/penColor.ts';
import type {ClockPort, LoudnessPort} from '../../src/runtime/ports.ts';
import type {RuntimeAudioPort, RuntimeSoundPlayback} from '../../src/audio/AudioPort.ts';
import type {RendererPort, DrawableState} from '../../src/runtime/RendererPort.ts';

class AdvanceableClock implements ClockPort {
    ms = 0;
    now(): number {
        return this.ms;
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

const spriteProject = (blocks: Record<string, DslBlock>, scripts: string[]): DslProject => ({
    schemaVersion: '1.0.0', project: {id: 'proj', name: 'p'},
    stage: {
        id: 'stage', isStage: true, name: 'Stage',
        variables: [{id: 'v-out', name: 'out', value: 0, isCloud: false}],
        lists: [], broadcasts: [], blocks: {}, scripts: [], comments: [],
        currentCostume: 0, costumes: [], sounds: [], volume: 100, layerOrder: 0,
        tempo: 60, videoTransparency: 50, videoState: 'on', textToSpeechLanguage: null
    },
    sprites: [{
        id: 'actor', isStage: false, name: 'Actor', variables: [], lists: [], broadcasts: [],
        blocks, scripts, comments: [], currentCostume: 0, costumes: [], sounds: [],
        volume: 100, layerOrder: 1, visible: true, x: 0, y: 0, size: 100, direction: 90,
        draggable: false, rotationStyle: 'all around'
    }],
    assets: [], monitors: [], extensions: [], meta: {source: 'wave-d-test'}
});

// ---------------------------------------------------------------------------
// pen colour params (HSV)
// ---------------------------------------------------------------------------

test('pen setColorParam derives RGBA and wraps/clamps params', () => {
    const pen = new PenManager();
    pen.setColorParam('a', 'color', 50, false); // hue 180deg, full sat/bri
    let state = pen.getState('a');
    assert.equal(state.params.color, 50);
    assert.equal(state.color, rgbaString(hsvToRgb({h: 180, s: 1, v: 1}), 1));

    pen.setColorParam('a', 'color', 150, false); // wrapClamp(150,0,100) -> 49
    assert.equal(pen.getState('a').params.color, 49);

    pen.setColorParam('a', 'saturation', 150, false);
    assert.equal(pen.getState('a').params.saturation, 100, 'saturation clamps to 100');
    pen.setColorParam('a', 'brightness', -20, false);
    assert.equal(pen.getState('a').params.brightness, 0, 'brightness clamps to 0');

    pen.setColorParam('a', 'transparency', 50, false);
    state = pen.getState('a');
    assert.ok(state.color.endsWith('0.5)'), 'transparency 50 -> alpha 0.5');
});

test('pen setColorParam change adds to the current value', () => {
    const pen = new PenManager();
    pen.setColorParam('a', 'saturation', 30, false);
    pen.setColorParam('a', 'saturation', 25, true);
    assert.equal(pen.getState('a').params.saturation, 55);
});

test('pen setColor syncs HSV params from the CSS colour', () => {
    const pen = new PenManager();
    pen.setColor('a', '#00ff00'); // pure green -> hue 120 -> color param 33.33
    const state = pen.getState('a');
    assert.equal(state.color, '#00ff00', 'keeps the literal CSS string');
    assert.ok(Math.abs(state.params.color - (120 / 360) * 100) < 1e-6);
    assert.equal(state.params.saturation, 100);
    assert.equal(state.params.transparency, 0);
});

test('pen colour params are copied to a clone then diverge', () => {
    const pen = new PenManager();
    pen.setColorParam('src', 'color', 25, false);
    pen.cloneState('src', 'clone');
    assert.equal(pen.getState('clone').params.color, 25);
    pen.setColorParam('clone', 'color', 80, false);
    assert.equal(pen.getState('src').params.color, 25, 'clone change does not leak back');
});

test('pen colour param block updates state through the runtime', () => {
    const proj = spriteProject({
        flag: block('flag', 'event_whenflagclicked', 'setc', null, {}, {}, true),
        setc: block('setc', 'pen_setPenColorParamTo', null, 'flag', {
            COLOR_PARAM: {block: 'cp', shadow: 'cp'},
            VALUE: {block: 'cv', shadow: 'cv'}
        }),
        cp: block('cp', 'pen_menu_colorParam', null, 'setc', {}, {colorParam: {value: 'color'}}, false, true),
        cv: numberShadow('cv', 'setc', 50)
    }, ['flag']);
    const runtime = new Runtime({clock: new AdvanceableClock()});
    runtime.load(createProject(proj));
    runtime.start();
    runtime.greenFlag();
    runtime.tick();
    assert.equal(runtime.pen.getState('actor').params.color, 50);
});

// ---------------------------------------------------------------------------
// sound effects (pitch / pan)
// ---------------------------------------------------------------------------

class RecordingAudio implements RuntimeAudioPort {
    effects: Array<{targetId: string; pitch: number; pan: number}> = [];
    play(): RuntimeSoundPlayback | undefined {
        return undefined;
    }
    setTargetVolume(): void {
        // no-op
    }
    setTargetEffects(targetId: string, e: {pitch: number; pan: number}): void {
        this.effects.push({targetId, ...e});
    }
    stopTarget(): void {
        // no-op
    }
    stopAll(): void {
        // no-op
    }
    cloneTarget(): void {
        // no-op
    }
}

const soundEffectScript = (effect: string, opcode: string, value: number) => spriteProject({
    flag: block('flag', 'event_whenflagclicked', 'fx', null, {}, {}, true),
    fx: block('fx', opcode, null, 'flag', {
        EFFECT: {block: 'em', shadow: 'em'},
        VALUE: {block: 'ev', shadow: 'ev'}
    }),
    em: block('em', 'sound_effects_menu', null, 'fx', {}, {EFFECT: {value: effect}}, false, true),
    ev: numberShadow('ev', 'fx', value)
}, ['flag']);

test('sound effects clamp pitch and pan and notify the audio port', () => {
    const audio = new RecordingAudio();
    const runtime = new Runtime({clock: new AdvanceableClock(), audio});
    runtime.load(createProject(soundEffectScript('pitch', 'sound_seteffectto', 500)));
    runtime.start();
    runtime.greenFlag();
    runtime.tick();
    const actor = runtime.project.sprites[0];
    assert.equal(actor.soundEffects.pitch, 360, 'pitch clamps to 360');
    // The last recorded effect for the actor reflects the clamped value.
    const last = audio.effects.filter(e => e.targetId === 'actor').at(-1);
    assert.deepEqual(last, {targetId: 'actor', pitch: 360, pan: 0});
});

test('sound change/set/clear effects and clone copy independence', () => {
    const runtime = new Runtime({clock: new AdvanceableClock()});
    // set pan to -50, then clone, then clear on the original.
    runtime.load(createProject(spriteProject({
        flag: block('flag', 'event_whenflagclicked', 'setpan', null, {}, {}, true),
        setpan: block('setpan', 'sound_seteffectto', 'mk', 'flag', {
            EFFECT: {block: 'em', shadow: 'em'}, VALUE: {block: 'ev', shadow: 'ev'}
        }),
        em: block('em', 'sound_effects_menu', null, 'setpan', {}, {EFFECT: {value: 'pan'}}, false, true),
        ev: numberShadow('ev', 'setpan', -50),
        mk: block('mk', 'control_create_clone_of', null, 'setpan', {CLONE_OPTION: {block: 'cm', shadow: 'cm'}}),
        cm: block('cm', 'control_create_clone_of_menu', null, 'mk', {}, {CLONE_OPTION: {value: '_myself_'}}, false, true)
    }, ['flag'])));
    runtime.start();
    runtime.greenFlag();
    runtime.tick();
    const actor = runtime.project.sprites[0];
    assert.equal(actor.soundEffects.pan, -50);
    assert.equal(runtime.clones.length, 1);
    assert.equal(runtime.clones[0].soundEffects.pan, -50, 'clone copies pan at creation');
    runtime.clones[0].clearSoundEffects();
    assert.equal(actor.soundEffects.pan, -50, 'clearing the clone does not affect the original');
});

test('green flag / stop all resets sound effects to 0', () => {
    const runtime = new Runtime({clock: new AdvanceableClock()});
    runtime.load(createProject(soundEffectScript('pitch', 'sound_seteffectto', 120)));
    runtime.start();
    runtime.greenFlag();
    runtime.tick();
    assert.equal(runtime.project.sprites[0].soundEffects.pitch, 120);
    runtime.greenFlag(); // green flag -> stopAll resets sound effects
    assert.equal(runtime.project.sprites[0].soundEffects.pitch, 0);
});

// ---------------------------------------------------------------------------
// loudness
// ---------------------------------------------------------------------------

class SteppingLoudness implements LoudnessPort {
    calls = 0;
    getLoudness(): number {
        this.calls++;
        return this.calls * 10;
    }
}

test('sensing_loudness is -1 with no port and caches one read per tick with a port', () => {
    // No port -> -1.
    const headless = new Runtime({clock: new AdvanceableClock()});
    headless.load(createProject(spriteProject({
        flag: block('flag', 'event_whenflagclicked', 'set', null, {}, {}, true),
        set: block('set', 'data_setvariableto', null, 'flag',
            {VALUE: {block: 'l', shadow: null}}, {VARIABLE: {value: 'out', id: 'v-out'}}),
        l: block('l', 'sensing_loudness', null, 'set')
    }, ['flag'])));
    headless.start();
    headless.greenFlag();
    headless.tick();
    assert.equal(headless.project.stage.variables.get('v-out'), -1);

    // With a port: two reads in one tick share the cached value.
    const port = new SteppingLoudness();
    const clock = new AdvanceableClock();
    const runtime = new Runtime({clock, loudness: port});
    runtime.load(createProject(spriteProject({}, [])));
    runtime.start();
    runtime.greenFlag();
    clock.ms = 100;
    runtime.currentMSecs = 100;
    const first = runtime.getLoudness();
    const second = runtime.getLoudness();
    assert.equal(first, second, 'same value within a tick');
    assert.equal(port.calls, 1, 'measured once per tick');
    runtime.currentMSecs = 200;
    assert.notEqual(runtime.getLoudness(), first, 'new value on the next tick');
    assert.equal(port.calls, 2);
});

// ---------------------------------------------------------------------------
// colour touching (renderer-backed; headless false)
// ---------------------------------------------------------------------------

test('sensing_touchingcolor queries the renderer with a parsed RGB colour', () => {
    let askedColor: readonly number[] | null = null;
    const renderer: RendererPort = {
        renderDrawables(_s: DrawableState[]): void {
            // no-op
        },
        isTouchingColor(_id: string, color: readonly [number, number, number]): boolean {
            askedColor = color;
            return true;
        }
    };
    const proj = spriteProject({
        flag: block('flag', 'event_whenflagclicked', 'set', null, {}, {}, true),
        set: block('set', 'data_setvariableto', null, 'flag',
            {VALUE: {block: 't', shadow: null}}, {VARIABLE: {value: 'out', id: 'v-out'}}),
        t: block('t', 'sensing_touchingcolor', null, 'set', {COLOR: {block: 'c', shadow: 'c'}}),
        c: block('c', 'colour_picker', null, 't', {}, {COLOUR: {value: '#ff8000'}}, false, true)
    }, ['flag']);
    const runtime = new Runtime({clock: new AdvanceableClock(), renderer});
    runtime.load(createProject(proj));
    runtime.start();
    runtime.greenFlag();
    runtime.tick();
    assert.equal(runtime.project.stage.variables.get('v-out'), true);
    assert.deepEqual(askedColor, [255, 128, 0]);

    // Headless: no renderer -> false.
    const headless = new Runtime({clock: new AdvanceableClock()});
    headless.load(createProject(proj));
    headless.start();
    headless.greenFlag();
    headless.tick();
    assert.equal(headless.project.stage.variables.get('v-out'), false);
});
