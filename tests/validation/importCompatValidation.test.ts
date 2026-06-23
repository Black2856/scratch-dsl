import assert from 'node:assert/strict';
import test from 'node:test';

import {validateProject, type DslProject} from '../../src/validation/projectValidator.ts';
import {createMinimalProject} from '../fixtures/minimalProject.ts';

const clone = (p: DslProject): DslProject => JSON.parse(JSON.stringify(p));
const errors = (p: DslProject) => validateProject(p).diagnostics.filter(d => d.severity === 'error');

// --- id scoping: Scratch keeps local ids per target ------------------------

test('cross-sprite reuse of local variable/block ids is allowed (sprite duplication)', () => {
    const project = createMinimalProject();
    project.sprites[0].variables.push({id: 'local-a', name: 'a', value: 0, isCloud: false});
    // a duplicated sprite keeps the same local var id AND block ids
    const copy = clone(project).sprites[0];
    copy.id = 'target-sprite-two';
    copy.name = 'Sprite2';
    copy.layerOrder = 2;
    project.sprites.push(copy);

    const result = validateProject(project);
    assert.equal(result.valid, true, JSON.stringify(errors(project)));
});

test('a sprite-local id colliding with a stage-global id is still rejected', () => {
    const project = createMinimalProject();
    project.sprites[0].variables.push({id: 'var-global-score', name: 'dup', value: 0, isCloud: false});
    const result = validateProject(project);
    assert.equal(result.valid, false);
    assert.ok(result.diagnostics.some(d => d.code === 'id.duplicate'));
});

// --- comments: orphan / cross-target comments are preserved (warning) -------

test('a comment whose blockId does not resolve is a warning, not an error', () => {
    const project = createMinimalProject();
    project.stage.comments.push({id: 'c1', blockId: 'no-such-block', text: 'note', x: 0, y: 0, width: 100, height: 100, minimized: false});
    const result = validateProject(project);
    assert.equal(result.valid, true, JSON.stringify(errors(project)));
    const dangling = result.diagnostics.find(d => d.code === 'comment.block-dangling');
    assert.ok(dangling && dangling.severity === 'warning');
});

// --- procedures: argumentdefaults length need not match argument count ------

test('a procedure prototype with extra argumentdefaults validates', () => {
    const project = createMinimalProject();
    const sprite = project.sprites[0];
    sprite.blocks.def = {id: 'def', opcode: 'procedures_definition', next: null, parent: null, inputs: {custom_block: {block: 'proto', shadow: 'proto'}}, fields: {}, shadow: false, topLevel: true, x: 0, y: 200};
    sprite.blocks.proto = {id: 'proto', opcode: 'procedures_prototype', next: null, parent: 'def', inputs: {}, fields: {}, shadow: true, topLevel: false, mutation: {tagName: 'mutation', children: [], proccode: 'doThing', argumentids: [], argumentnames: [], argumentdefaults: [''], warp: false}};
    sprite.blocks.callhat = {id: 'callhat', opcode: 'event_whenflagclicked', next: 'call', parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true, x: 0, y: 300};
    sprite.blocks.call = {id: 'call', opcode: 'procedures_call', next: null, parent: 'callhat', inputs: {}, fields: {}, shadow: false, topLevel: false, mutation: {tagName: 'mutation', children: [], proccode: 'doThing', argumentids: [], warp: false}};
    sprite.scripts.push('def', 'callhat');

    assert.deepEqual(errors(project), [], 'procedure with mismatched argumentdefaults length should be valid');
});

// --- control_stop: the "other scripts" variants may carry a next block ------

test('control_stop "other scripts in sprite" may have a next block', () => {
    const project = createMinimalProject();
    const sprite = project.sprites[0];
    sprite.blocks.stophat = {id: 'stophat', opcode: 'event_whenflagclicked', next: 'stop', parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true, x: 0, y: 400};
    sprite.blocks.stop = {id: 'stop', opcode: 'control_stop', next: 'after', parent: 'stophat', inputs: {}, fields: {STOP_OPTION: {value: 'other scripts in sprite'}}, shadow: false, topLevel: false, mutation: {tagName: 'mutation', children: [], hasnext: 'true'}};
    sprite.blocks.after = {id: 'after', opcode: 'motion_movesteps', next: null, parent: 'stop', inputs: {STEPS: {block: 'afternum', shadow: 'afternum'}}, fields: {}, shadow: false, topLevel: false};
    sprite.blocks.afternum = {id: 'afternum', opcode: 'math_number', next: null, parent: 'after', inputs: {}, fields: {NUM: {value: 5}}, shadow: true, topLevel: false};
    sprite.scripts.push('stophat');

    assert.deepEqual(errors(project), [], 'control_stop other-scripts with next should be valid');
});

test('control_stop "all" with a next block is still rejected', () => {
    const project = createMinimalProject();
    const sprite = project.sprites[0];
    sprite.blocks.stophat = {id: 'stophat', opcode: 'event_whenflagclicked', next: 'stop', parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true, x: 0, y: 400};
    sprite.blocks.stop = {id: 'stop', opcode: 'control_stop', next: 'after', parent: 'stophat', inputs: {}, fields: {STOP_OPTION: {value: 'all'}}, shadow: false, topLevel: false, mutation: {tagName: 'mutation', children: [], hasnext: 'false'}};
    sprite.blocks.after = {id: 'after', opcode: 'motion_movesteps', next: null, parent: 'stop', inputs: {STEPS: {block: 'afternum', shadow: 'afternum'}}, fields: {}, shadow: false, topLevel: false};
    sprite.blocks.afternum = {id: 'afternum', opcode: 'math_number', next: null, parent: 'after', inputs: {}, fields: {NUM: {value: 5}}, shadow: true, topLevel: false};
    sprite.scripts.push('stophat');

    assert.ok(validateProject(project).diagnostics.some(d => d.code === 'block.next-not-allowed'));
});
