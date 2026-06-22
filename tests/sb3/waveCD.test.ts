import assert from 'node:assert/strict';
import test from 'node:test';

import type {DslBlock, DslProject} from '../../src/validation/projectValidator.ts';
import {serializeProject} from '../../src/sb3/projectSerializer.ts';

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

const project = (): DslProject => {
    const blocks: Record<string, DslBlock> = {
        flag: block('flag', 'event_whenflagclicked', 'say', null, {}, {}, true),
        say: block('say', 'looks_say', 'fx', 'flag', {MESSAGE: {block: 'msg', shadow: 'msg'}}),
        msg: block('msg', 'text', null, 'say', {}, {TEXT: {value: 'hi'}}, false, true),
        fx: block('fx', 'looks_seteffectto', 'pcp', 'say',
            {VALUE: {block: 'fxv', shadow: 'fxv'}}, {EFFECT: {value: 'color'}}),
        fxv: numberShadow('fxv', 'fx', 25),
        pcp: block('pcp', 'pen_setPenColorParamTo', 'snd', 'fx', {
            COLOR_PARAM: {block: 'cpm', shadow: 'cpm'}, VALUE: {block: 'cpv', shadow: 'cpv'}
        }),
        cpm: block('cpm', 'pen_menu_colorParam', null, 'pcp', {}, {colorParam: {value: 'saturation'}}, false, true),
        cpv: numberShadow('cpv', 'pcp', 40),
        snd: block('snd', 'sound_seteffectto', 'tc', 'pcp', {
            EFFECT: {block: 'sem', shadow: 'sem'}, VALUE: {block: 'sev', shadow: 'sev'}
        }),
        sem: block('sem', 'sound_effects_menu', null, 'snd', {}, {EFFECT: {value: 'PITCH'}}, false, true),
        sev: numberShadow('sev', 'snd', 120),
        tc: block('tc', 'data_setvariableto', null, 'snd',
            {VALUE: {block: 'touch', shadow: null}}, {VARIABLE: {value: 'out', id: 'v-out'}}),
        touch: block('touch', 'sensing_touchingcolor', null, 'tc', {COLOR: {block: 'col', shadow: 'col'}}),
        col: block('col', 'colour_picker', null, 'touch', {}, {COLOUR: {value: '#ff0000'}}, false, true)
    };
    return {
        schemaVersion: '1.0.0', project: {id: 'proj', name: 'p'},
        stage: {
            id: 'stage', isStage: true, name: 'Stage', variables: [], lists: [], broadcasts: [],
            blocks: {}, scripts: [], comments: [], currentCostume: 0, costumes: [], sounds: [],
            volume: 100, layerOrder: 0, tempo: 60, videoTransparency: 50, videoState: 'on', textToSpeechLanguage: null
        },
        sprites: [{
            id: 'sp', isStage: false, name: 'S',
            variables: [{id: 'v-out', name: 'out', value: 0, isCloud: false}],
            lists: [], broadcasts: [], blocks, scripts: ['flag'], comments: [], currentCostume: 0,
            costumes: [], sounds: [], volume: 100, layerOrder: 1, visible: true,
            x: 0, y: 0, size: 100, direction: 90, draggable: false, rotationStyle: 'all around'
        }],
        assets: [], monitors: [], extensions: [], meta: {source: 'wave-cd-sb3-test'}
    };
};

test('Wave C/D blocks serialize and collect the pen extension', () => {
    const sb3 = serializeProject(project());
    const sp = sb3.targets[1];

    // looks_say with a text shadow.
    assert.deepEqual(sp.blocks.say.inputs.MESSAGE, [1, [10, 'hi']]);
    // looks_seteffectto EFFECT field.
    assert.deepEqual(sp.blocks.fx.fields.EFFECT, ['color']);
    // pen colour param + menu shadow.
    assert.equal(sp.blocks.cpm.opcode, 'pen_menu_colorParam');
    assert.deepEqual(sp.blocks.cpm.fields.colorParam, ['saturation']);
    // sound effect menu shadow.
    assert.equal(sp.blocks.sem.opcode, 'sound_effects_menu');
    assert.deepEqual(sp.blocks.sem.fields.EFFECT, ['PITCH']);
    // colour_picker compresses to a [9, hex] primitive and the shadow is dropped.
    assert.deepEqual(sp.blocks.touch.inputs.COLOR, [1, [9, '#ff0000']]);
    assert.equal('col' in sp.blocks, false);

    // The pen colour param block pulls in the pen extension.
    assert.deepEqual(sb3.extensions, ['pen']);
});
