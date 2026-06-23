import assert from 'node:assert/strict';
import test from 'node:test';

import {validateProject} from '../../src/validation/projectValidator.ts';
import {serializeBlocks} from '../../src/sb3/blockSerializer.ts';
import {packageSb3} from '../../src/sb3/sb3Packager.ts';
import {createMinimalProject} from '../fixtures/minimalProject.ts';
import {rawBlocksToDsl} from '../../src/sb3/import/blocksToDsl.ts';
import {importSb3} from '../../src/sb3/import/importProject.ts';

// A foreign-style SB3 block dictionary: an unknown (extension) opcode, unknown
// block-level fields, an obscured-shadow input, and a custom-block mutation
// with an unknown key — everything import must preserve.
const foreignBlocks = (): Record<string, unknown> => ({
    hat: {opcode: 'event_whenflagclicked', next: 'ext', parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true, x: 10, y: 20},
    ext: {
        opcode: 'myext_customblock', next: 'call', parent: 'hat',
        inputs: {NUM: [1, [4, 42]], MSG: [3, 'reporter', [10, 'hi']]},
        fields: {MODE: ['fast']},
        shadow: false, topLevel: false,
        customFlag: true, extData: {nested: [1, 2, 3]}
    },
    reporter: {opcode: 'operator_add', next: null, parent: 'ext', inputs: {NUM1: [1, [4, 1]], NUM2: [1, [4, 2]]}, fields: {}, shadow: false, topLevel: false},
    call: {
        opcode: 'procedures_call', next: null, parent: 'ext', inputs: {}, fields: {}, shadow: false, topLevel: false,
        mutation: {tagName: 'mutation', children: [], proccode: 'do %s', argumentids: '["a"]', argumentnames: '["x"]', argumentdefaults: '[""]', warp: 'true', customMutKey: 'keep'}
    }
});

test('losslessly round-trips unknown opcodes, fields, and mutations', () => {
    const sb3Blocks = foreignBlocks();
    const {blocks} = rawBlocksToDsl(sb3Blocks);

    // unknown opcode kept; unknown block-level fields captured opaquely
    assert.equal(blocks.ext.opcode, 'myext_customblock');
    assert.deepEqual(blocks.ext.opaque, {customFlag: true, extData: {nested: [1, 2, 3]}});

    // re-serializing reproduces the original SB3 block dictionary exactly
    assert.deepEqual(serializeBlocks(blocks), sb3Blocks);
});

test('blocks without unknown fields get no opaque bag', () => {
    const {blocks} = rawBlocksToDsl(foreignBlocks());
    assert.equal('opaque' in blocks.hat, false);
    assert.equal('opaque' in blocks.reporter, false);
});

test('validateProject accepts blocks carrying opaque data', () => {
    const project = createMinimalProject();
    const sprite = project.sprites[0];
    const blockId = Object.keys(sprite.blocks)[0];
    sprite.blocks[blockId].opaque = {turbowarpData: 'x', foo: 42};

    const result = validateProject(project);
    assert.equal(result.valid, true, JSON.stringify(result.diagnostics.filter(d => d.severity === 'error')));
});

test('importSb3 loads an unknown-opcode project and preserves opaque end-to-end', () => {
    const project = createMinimalProject();
    const sprite = project.sprites[0];
    sprite.blocks.ext = {
        id: 'ext', opcode: 'myext_thing', next: null, parent: null,
        inputs: {}, fields: {}, shadow: false, topLevel: true, x: 0, y: 0,
        opaque: {extKey: 1}
    };
    sprite.scripts.push('ext');

    const {sb3} = packageSb3(project);
    const result = importSb3(sb3);

    // unknown opcode is a warning, not an error -> still loads in compatibility mode
    assert.equal(result.valid, true, JSON.stringify(result.diagnostics.filter(d => d.severity === 'error')));
    assert.ok(result.diagnostics.some(d => d.code === 'opcode.unknown'));

    const importedSprite = result.project!.sprites.find(s => s.blocks.ext);
    assert.ok(importedSprite, 'sprite with ext block present');
    assert.equal(importedSprite!.blocks.ext.opcode, 'myext_thing');
    assert.deepEqual(importedSprite!.blocks.ext.opaque, {extKey: 1});
});
