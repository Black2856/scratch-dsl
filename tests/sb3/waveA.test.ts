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

/**
 * Stage with a flag script that exercises Wave A reporters/menus so the
 * serializer fixture covers OPERATOR/PROPERTY/CURRENTMENU/NUMBER_NAME fields
 * and the sensing menu shadows.
 */
const waveAProject = (): DslProject => {
    const blocks: Record<string, DslBlock> = {
        flag: block('flag', 'event_whenflagclicked', 'set-mod', null, {}, {}, true),
        // set out to (a mod b)
        'set-mod': block('set-mod', 'data_setvariableto', 'set-mathop', 'flag',
            {VALUE: {block: 'mod', shadow: null}}, {VARIABLE: {value: 'out', id: 'v-out'}}),
        mod: block('mod', 'operator_mod', null, 'set-mod',
            {NUM1: {block: 'a', shadow: 'a'}, NUM2: {block: 'b', shadow: 'b'}}),
        a: numberShadow('a', 'mod', 7),
        b: numberShadow('b', 'mod', 3),
        // set out to (mathop abs of n)
        'set-mathop': block('set-mathop', 'data_setvariableto', 'set-of', 'set-mod',
            {VALUE: {block: 'mathop', shadow: null}}, {VARIABLE: {value: 'out', id: 'v-out'}}),
        mathop: block('mathop', 'operator_mathop', null, 'set-mathop',
            {NUM: {block: 'n', shadow: 'n'}}, {OPERATOR: {value: 'abs'}}),
        n: numberShadow('n', 'mathop', -5),
        // set out to (backdrop # of _stage_)
        'set-of': block('set-of', 'data_setvariableto', 'set-cur', 'set-mathop',
            {VALUE: {block: 'of', shadow: null}}, {VARIABLE: {value: 'out', id: 'v-out'}}),
        of: block('of', 'sensing_of', null, 'set-of',
            {OBJECT: {block: 'of-menu', shadow: 'of-menu'}}, {PROPERTY: {value: 'backdrop #'}}),
        'of-menu': block('of-menu', 'sensing_of_object_menu', null, 'of', {},
            {OBJECT: {value: '_stage_'}}, false, true),
        // set out to (current year)
        'set-cur': block('set-cur', 'data_setvariableto', null, 'set-of',
            {VALUE: {block: 'cur', shadow: null}}, {VARIABLE: {value: 'out', id: 'v-out'}}),
        cur: block('cur', 'sensing_current', null, 'set-cur', {}, {CURRENTMENU: {value: 'year'}})
    };
    return {
        schemaVersion: '1.0.0', project: {id: 'p', name: 'p'},
        stage: {
            id: 'stage', isStage: true, name: 'Stage',
            variables: [{id: 'v-out', name: 'out', value: 0, isCloud: false}],
            lists: [], broadcasts: [], blocks, scripts: ['flag'], comments: [],
            currentCostume: 0, costumes: [], sounds: [], volume: 100,
            layerOrder: 0, tempo: 60, videoTransparency: 50, videoState: 'on', textToSpeechLanguage: null
        },
        sprites: [], assets: [], monitors: [], extensions: [], meta: {source: 'wave-a-sb3-test'}
    };
};

test('Wave A blocks serialize fields and menu shadows in official shapes', () => {
    const sb3 = serializeProject(waveAProject());
    const stage = sb3.targets[0];

    // operator_mod: math_number shadows compress to [4, value].
    assert.deepEqual(stage.blocks.mod.inputs.NUM1, [1, [4, 7]]);
    assert.deepEqual(stage.blocks.mod.inputs.NUM2, [1, [4, 3]]);

    // operator_mathop: OPERATOR is a plain field [value].
    assert.equal(stage.blocks.mathop.opcode, 'operator_mathop');
    assert.deepEqual(stage.blocks.mathop.fields.OPERATOR, ['abs']);

    // sensing_of: PROPERTY field [value], OBJECT input points at a real menu shadow.
    assert.deepEqual(stage.blocks.of.fields.PROPERTY, ['backdrop #']);
    assert.deepEqual(stage.blocks.of.inputs.OBJECT, [1, 'of-menu']);
    assert.equal(stage.blocks['of-menu'].opcode, 'sensing_of_object_menu');
    assert.equal(stage.blocks['of-menu'].shadow, true);
    assert.deepEqual(stage.blocks['of-menu'].fields.OBJECT, ['_stage_']);

    // sensing_current: CURRENTMENU field.
    assert.deepEqual(stage.blocks.cur.fields.CURRENTMENU, ['year']);

    // No extensions used by Wave A blocks.
    assert.deepEqual(sb3.extensions, []);
});
