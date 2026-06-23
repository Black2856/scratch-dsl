import assert from 'node:assert/strict';
import test from 'node:test';

import type {DslBlock} from '../../src/validation/blockGraphValidator.ts';
import {serializeBlocks} from '../../src/sb3/blockSerializer.ts';
import {createMinimalProject} from '../fixtures/minimalProject.ts';
import {createFullFeatureProject} from '../fixtures/sb3Projects.ts';
import {rawBlocksToDsl} from '../../src/sb3/import/blocksToDsl.ts';
import {expandPrimitive, PRIMITIVE_BY_TYPE} from '../../src/sb3/import/primitiveExpand.ts';
import {restoreInput} from '../../src/sb3/import/inputRestore.ts';
import {parseMutation} from '../../src/sb3/import/mutationParse.ts';

// --- block-graph round-trip: import is the exact inverse of export ----------
//   serializeBlocks( import( serializeBlocks(dsl) ) ) === serializeBlocks(dsl)

const roundTripBlocks = (blocks: Record<string, DslBlock>): void => {
    const sb3 = serializeBlocks(blocks);
    const reconstructed = rawBlocksToDsl(sb3 as unknown as Record<string, unknown>);
    const sb3Again = serializeBlocks(reconstructed.blocks);
    assert.deepEqual(sb3Again, sb3);
};

test('round-trips the minimal project block graph', () => {
    const project = createMinimalProject();
    roundTripBlocks(project.stage.blocks);
    for (const sprite of project.sprites) roundTripBlocks(sprite.blocks);
});

test('round-trips the full-feature project block graph (primitives, vars, mutation)', () => {
    const project = createFullFeatureProject();
    roundTripBlocks(project.stage.blocks);
    for (const sprite of project.sprites) roundTripBlocks(sprite.blocks);
});

test('rebuilt graph re-includes expanded primitive blocks and script roots', () => {
    const project = createFullFeatureProject();
    for (const target of [project.stage, ...project.sprites]) {
        const sb3 = serializeBlocks(target.blocks);
        const {blocks, scripts} = rawBlocksToDsl(sb3 as unknown as Record<string, unknown>);
        // scripts are exactly the top-level blocks, in source order
        assert.deepEqual(scripts, Object.entries(sb3).filter(([, b]) => b.topLevel).map(([id]) => id));
        // every input reference resolves to a block present in the dict
        for (const block of Object.values(blocks)) {
            for (const input of Object.values(block.inputs)) {
                if (input.block !== null) assert.ok(blocks[input.block], `block ref ${input.block} present`);
                if (input.shadow !== null) assert.ok(blocks[input.shadow], `shadow ref ${input.shadow} present`);
            }
        }
    }
});

// --- primitive expansion ----------------------------------------------------

test('expandPrimitive restores literal, colour, broadcast, variable, list', () => {
    assert.deepEqual(expandPrimitive([4, 10], 'p-x-shadow', 'p'), {
        id: 'p-x-shadow', opcode: 'math_number', next: null, parent: 'p', inputs: {}, fields: {NUM: {value: 10}}, shadow: true, topLevel: false
    });
    assert.equal(expandPrimitive([10, 'hi'], 'i', 'p')!.opcode, 'text');
    assert.equal(expandPrimitive([9, '#ff0000'], 'i', 'p')!.opcode, 'colour_picker');

    const broadcast = expandPrimitive([11, 'go', 'bc-1'], 'i', 'p')!;
    assert.equal(broadcast.opcode, 'event_broadcast_menu');
    assert.deepEqual(broadcast.fields.BROADCAST_OPTION, {value: 'go', id: 'bc-1'});
    assert.equal(broadcast.shadow, true);

    const variable = expandPrimitive([12, 'score', 'v-1'], 'i', 'p')!;
    assert.equal(variable.opcode, 'data_variable');
    assert.equal(variable.shadow, false); // reporter, not shadow
    assert.deepEqual(variable.fields.VARIABLE, {value: 'score', id: 'v-1'});

    assert.equal(expandPrimitive([13, 'items', 'l-1'], 'i', 'p')!.opcode, 'data_listcontents');
});

test('expandPrimitive returns null for unknown/malformed primitives', () => {
    assert.equal(expandPrimitive([99, 'x'], 'i', 'p'), null);
    assert.equal(expandPrimitive(['nope'], 'i', 'p'), null);
    assert.equal(expandPrimitive([4, {}], 'i', 'p'), null);
    assert.equal(Object.keys(PRIMITIVE_BY_TYPE).length, 10); // 4..13
});

// --- input descriptor restoration -------------------------------------------

test('restoreInput decodes shadow-only, block-only, and obscured-shadow', () => {
    const log: string[] = [];
    const ctx = {
        expand: (prim: readonly unknown[], slot: 'shadow' | 'reporter') => `exp:${slot}:${prim[0]}`,
        onIssue: (code: string) => log.push(code)
    };
    assert.deepEqual(restoreInput([1, [10, 'hi']], ctx), {block: 'exp:shadow:10', shadow: 'exp:shadow:10'});
    assert.deepEqual(restoreInput([1, 'shadowBlock'], ctx), {block: 'shadowBlock', shadow: 'shadowBlock'});
    assert.deepEqual(restoreInput([2, 'reporter'], ctx), {block: 'reporter', shadow: null});
    assert.deepEqual(restoreInput([3, 'rep', [4, 5]], ctx), {block: 'rep', shadow: 'exp:shadow:4'});
    assert.equal(log.length, 0);
});

test('restoreInput reports malformed/unknown descriptors', () => {
    const log: string[] = [];
    const ctx = {expand: () => null, onIssue: (code: string) => log.push(code)};
    assert.deepEqual(restoreInput([], ctx), {block: null, shadow: null});
    assert.deepEqual(restoreInput([7, 'x'], ctx), {block: null, shadow: null});
    assert.deepEqual(restoreInput([2, 42], ctx), {block: null, shadow: null});
    assert.deepEqual(log, ['sb3.input.descriptor-invalid', 'sb3.input.descriptor-unknown', 'sb3.input.value-invalid']);
});

test('restoreInput treats [tag, null] as an empty slot without issues', () => {
    const log: string[] = [];
    const ctx = {expand: () => 'X', onIssue: (code: string) => log.push(code)};
    assert.deepEqual(restoreInput([1, null], ctx), {block: null, shadow: null});
    assert.deepEqual(restoreInput([2, null], ctx), {block: null, shadow: null});
    assert.deepEqual(restoreInput([3, 'b', null], ctx), {block: 'b', shadow: null});
    assert.deepEqual(log, []);
});

// --- mutation parse ---------------------------------------------------------

test('parseMutation restores argument arrays and warp boolean', () => {
    const {mutation, malformed} = parseMutation({
        tagName: 'mutation', children: [], proccode: 'do %s', argumentids: '["a","b"]',
        argumentnames: '["x","y"]', argumentdefaults: '["",""]', warp: 'true'
    });
    assert.deepEqual(mutation.argumentids, ['a', 'b']);
    assert.deepEqual(mutation.argumentnames, ['x', 'y']);
    assert.equal(mutation.warp, true);
    assert.deepEqual(malformed, []);
});

test('parseMutation keeps unknown keys and flags malformed JSON', () => {
    const {mutation, malformed} = parseMutation({proccode: 'p', argumentids: '[not json', customKey: {a: 1}, warp: 'false'});
    assert.equal(mutation.argumentids, '[not json'); // kept as raw string
    assert.deepEqual(mutation.customKey, {a: 1});
    assert.equal(mutation.warp, false);
    assert.deepEqual(malformed, ['argumentids']);
});
