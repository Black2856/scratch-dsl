import assert from 'node:assert/strict';
import test from 'node:test';

import {createMinimalProject} from '../fixtures/minimalProject.ts';
import {createProject} from '../../src/model/ProjectFactory.ts';

test('resolveVariable finds stage (global) variable from a sprite target', () => {
    const project = createProject(createMinimalProject());
    const sprite = project.sprites[0];
    const resolved = project.resolveVariable(sprite.id, 'var-global-score');
    assert.ok(resolved);
    assert.equal(resolved?.name, 'score');
});

test('resolveVariable prefers local variable over a same-named global one', () => {
    const dsl = createMinimalProject();
    dsl.sprites[0].variables.push({
        id: 'var-local-score',
        name: 'score',
        value: 99,
        isCloud: false
    });
    const project = createProject(dsl);
    const sprite = project.sprites[0];

    const local = project.resolveVariable(sprite.id, 'var-local-score');
    assert.ok(local);
    assert.equal(local?.value, 99);

    const global = project.resolveVariable(sprite.id, 'var-global-score');
    assert.ok(global);
    assert.equal(global?.value, 0);
});

test('resolveVariable does not leak one sprite local variable into another sprite', () => {
    const dsl = createMinimalProject();
    dsl.sprites[0].variables.push({
        id: 'var-sprite-one-only',
        name: 'onlyMine',
        value: 'a',
        isCloud: false
    });
    dsl.sprites.push({
        ...dsl.sprites[0],
        id: 'target-sprite-two',
        name: 'Sprite2',
        variables: [],
        lists: [],
        blocks: {},
        scripts: []
    });
    const project = createProject(dsl);
    const [spriteOne, spriteTwo] = project.sprites;

    assert.ok(project.resolveVariable(spriteOne.id, 'var-sprite-one-only'));
    assert.equal(project.resolveVariable(spriteTwo.id, 'var-sprite-one-only'), undefined);
});

test('resolveVariable returns undefined for unknown variable id', () => {
    const project = createProject(createMinimalProject());
    assert.equal(project.resolveVariable(project.stage.id, 'does-not-exist'), undefined);
});

test('resolveList resolves local list on the owning sprite and is absent on stage/global', () => {
    const project = createProject(createMinimalProject());
    const sprite = project.sprites[0];

    const local = project.resolveList(sprite.id, 'list-sprite-items');
    assert.ok(local);
    assert.equal(local?.name, 'items');

    assert.equal(project.resolveList(project.stage.id, 'list-sprite-items'), undefined);
});

test('resolveList falls back from local target to stage global list', () => {
    const dsl = createMinimalProject();
    dsl.stage.lists.push({id: 'list-global-log', name: 'log', values: []});
    const project = createProject(dsl);
    const sprite = project.sprites[0];

    const resolved = project.resolveList(sprite.id, 'list-global-log');
    assert.ok(resolved);
    assert.equal(resolved?.name, 'log');
});

test('broadcasts are project-shared and accessible regardless of target', () => {
    const project = createProject(createMinimalProject());
    assert.ok(project.broadcasts.has('broadcast-start'));
    assert.equal(project.broadcasts.getById('broadcast-start')?.name, 'start');
    assert.equal(project.broadcasts.getByName('start')?.id, 'broadcast-start');
});
