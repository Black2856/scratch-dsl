import assert from 'node:assert/strict';
import test from 'node:test';

import {createMinimalProject} from '../fixtures/minimalProject.ts';
import {createProject} from '../../src/model/ProjectFactory.ts';
import {toSnapshot} from '../../src/model/ProjectSnapshot.ts';
import {validateProject} from '../../src/validation/projectValidator.ts';

test('round-trip: toSnapshot(createProject(dsl)) is deep-equal to the original dsl', () => {
    const dsl = createMinimalProject();
    const project = createProject(dsl);
    const snapshot = toSnapshot(project);
    assert.deepEqual(snapshot, dsl);
});

test('round-trip preserves every ID without re-numbering (block/variable/list/broadcast/sprite ids)', () => {
    const dsl = createMinimalProject();
    const snapshot = toSnapshot(createProject(dsl));

    assert.equal(snapshot.project.id, dsl.project.id);
    assert.equal(snapshot.stage.id, dsl.stage.id);
    assert.deepEqual(
        Object.keys(snapshot.stage.blocks).sort(),
        Object.keys(dsl.stage.blocks).sort()
    );
    assert.deepEqual(
        snapshot.stage.variables.map(variable => variable.id).sort(),
        dsl.stage.variables.map(variable => variable.id).sort()
    );
    assert.deepEqual(
        snapshot.stage.broadcasts.map(broadcast => broadcast.id).sort(),
        dsl.stage.broadcasts.map(broadcast => broadcast.id).sort()
    );
    assert.equal(snapshot.sprites[0].id, dsl.sprites[0].id);
    assert.deepEqual(
        snapshot.sprites[0].lists.map(list => list.id).sort(),
        dsl.sprites[0].lists.map(list => list.id).sort()
    );
});

test('round-trip output passes validateProject again', () => {
    const dsl = createMinimalProject();
    const snapshot = toSnapshot(createProject(dsl));
    const result = validateProject(snapshot);
    assert.equal(result.valid, true, JSON.stringify(result.diagnostics, null, 2));
});

test('round-trip preserves sprite-only and stage-only fields', () => {
    const dsl = createMinimalProject();
    const snapshot = toSnapshot(createProject(dsl));

    assert.equal(snapshot.stage.tempo, dsl.stage.tempo);
    assert.equal(snapshot.stage.videoTransparency, dsl.stage.videoTransparency);
    assert.equal(snapshot.stage.videoState, dsl.stage.videoState);
    assert.equal(snapshot.stage.textToSpeechLanguage, dsl.stage.textToSpeechLanguage);

    assert.equal(snapshot.sprites[0].x, dsl.sprites[0].x);
    assert.equal(snapshot.sprites[0].y, dsl.sprites[0].y);
    assert.equal(snapshot.sprites[0].size, dsl.sprites[0].size);
    assert.equal(snapshot.sprites[0].direction, dsl.sprites[0].direction);
    assert.equal(snapshot.sprites[0].visible, dsl.sprites[0].visible);
    assert.equal(snapshot.sprites[0].draggable, dsl.sprites[0].draggable);
    assert.equal(snapshot.sprites[0].rotationStyle, dsl.sprites[0].rotationStyle);
});
