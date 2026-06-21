import assert from 'node:assert/strict';
import test from 'node:test';

import {createMinimalProject} from '../fixtures/minimalProject.ts';
import {createProject} from '../../src/model/ProjectFactory.ts';

test('BlockContainer keeps the block ID dictionary, top-level scripts, and next/parent links', () => {
    const project = createProject(createMinimalProject());
    const stageBlocks = project.stage.blocks;

    assert.deepEqual(stageBlocks.getScripts(), ['block-stage-flag']);
    assert.ok(stageBlocks.hasBlock('block-stage-flag'));
    assert.ok(stageBlocks.hasBlock('block-stage-set'));
    assert.ok(stageBlocks.hasBlock('shadow-stage-zero'));
    assert.equal(stageBlocks.hasBlock('missing'), false);

    assert.equal(stageBlocks.getNext('block-stage-flag'), 'block-stage-set');
    assert.equal(stageBlocks.getNext('block-stage-set'), null);
    assert.equal(stageBlocks.getParent('block-stage-set'), 'block-stage-flag');
    assert.equal(stageBlocks.getParent('block-stage-flag'), null);

    const block = stageBlocks.getBlock('block-stage-flag');
    assert.ok(block);
    assert.equal(block?.opcode, 'event_whenflagclicked');

    const inputs = stageBlocks.getInputs('block-stage-set');
    assert.ok(inputs);
    assert.equal(inputs?.VALUE.block, 'shadow-stage-zero');
});

test('BlockContainer iterates over all blocks including opaque/shadow ones', () => {
    const project = createProject(createMinimalProject());
    const ids = [...project.stage.blocks].map(block => block.id).sort();
    assert.deepEqual(ids, ['block-stage-flag', 'block-stage-set', 'shadow-stage-zero'].sort());
});

test('BlockContainer preserves unknown opcode blocks verbatim (mutation/fields untouched)', () => {
    const dsl = createMinimalProject();
    dsl.stage.blocks['block-stage-set'] = {
        ...dsl.stage.blocks['block-stage-set'],
        opcode: 'custom_unknown',
        mutation: {custom: 'payload'},
        inputs: {},
        fields: {}
    };
    delete dsl.stage.blocks['shadow-stage-zero'];

    const project = createProject(dsl);
    const block = project.stage.blocks.getBlock('block-stage-set');
    assert.ok(block);
    assert.equal(block?.opcode, 'custom_unknown');
    assert.deepEqual(block?.mutation, {custom: 'payload'});
});
