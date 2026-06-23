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

const waveBProject = (): DslProject => {
    const spriteBlocks: Record<string, DslBlock> = {
        clicked: block('clicked', 'event_whenthisspriteclicked', 'go', null, {}, {}, true),
        go: block('go', 'motion_goto', 'switch', 'clicked', {TO: {block: 'gm', shadow: 'gm'}}),
        gm: block('gm', 'motion_goto_menu', null, 'go', {}, {TO: {value: '_random_'}}, false, true),
        switch: block('switch', 'looks_switchbackdropto', null, 'go', {BACKDROP: {block: 'bm', shadow: 'bm'}}),
        bm: block('bm', 'looks_backdrops', null, 'switch', {}, {BACKDROP: {value: 'Night'}}, false, true)
    };
    const stageBlocks: Record<string, DslBlock> = {
        gt: block('gt', 'event_whengreaterthan', 'noop', null,
            {VALUE: {block: 'thr', shadow: 'thr'}}, {WHENGREATERTHANMENU: {value: 'TIMER'}}, true),
        thr: numberShadow('thr', 'gt', 10),
        noop: block('noop', 'looks_nextbackdrop', null, 'gt'),
        backdrop: block('backdrop', 'event_whenbackdropswitchesto', null, null, {}, {BACKDROP: {value: 'Night'}}, true)
    };
    return {
        schemaVersion: '1.0.0', project: {id: 'proj', name: 'p'},
        stage: {
            id: 'stage', isStage: true, name: 'Stage', variables: [], lists: [], broadcasts: [],
            blocks: stageBlocks, scripts: ['gt', 'backdrop'], comments: [], currentCostume: 0,
            costumes: [], sounds: [], volume: 100, layerOrder: 0, tempo: 60,
            videoTransparency: 50, videoState: 'on', textToSpeechLanguage: null
        },
        sprites: [{
            id: 'sp', isStage: false, name: 'S', variables: [], lists: [], broadcasts: [],
            blocks: spriteBlocks, scripts: ['clicked'], comments: [], currentCostume: 0,
            costumes: [], sounds: [], volume: 100, layerOrder: 1, visible: true,
            x: 0, y: 0, size: 100, direction: 90, draggable: false, rotationStyle: 'all around'
        }],
        assets: [], monitors: [], extensions: [], meta: {source: 'wave-b-sb3-test'}
    };
};

test('Wave B motion/backdrop/click/edge blocks serialize in official shapes', () => {
    const sb3 = serializeProject(waveBProject());
    const stage = sb3.targets[0];
    const sprite = sb3.targets[1];

    // motion_goto with a motion_goto_menu shadow.
    assert.deepEqual(sprite.blocks.go.inputs.TO, [1, 'gm']);
    assert.equal(sprite.blocks.gm.opcode, 'motion_goto_menu');
    assert.equal(sprite.blocks.gm.shadow, true);
    assert.deepEqual(sprite.blocks.gm.fields.TO, ['_random_']);

    // looks_switchbackdropto with a looks_backdrops shadow.
    assert.equal(sprite.blocks.bm.opcode, 'looks_backdrops');
    assert.deepEqual(sprite.blocks.bm.fields.BACKDROP, ['Night']);

    // event_whenthisspriteclicked is a top-level hat.
    assert.equal(sprite.blocks.clicked.opcode, 'event_whenthisspriteclicked');
    assert.equal(sprite.blocks.clicked.topLevel, true);

    // event_whengreaterthan: WHENGREATERTHANMENU field + VALUE shadow input.
    assert.deepEqual(stage.blocks.gt.fields.WHENGREATERTHANMENU, ['TIMER']);
    assert.deepEqual(stage.blocks.gt.inputs.VALUE, [1, [4, 10]]);

    // event_whenbackdropswitchesto: BACKDROP field.
    assert.deepEqual(stage.blocks.backdrop.fields.BACKDROP, ['Night']);

    assert.deepEqual(sb3.extensions, []);
});
