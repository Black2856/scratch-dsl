import assert from 'node:assert/strict';
import test from 'node:test';

import {createMinimalProject} from '../fixtures/minimalProject.ts';
import {createProject} from '../../src/model/ProjectFactory.ts';
import {SPRITE_DEFAULTS} from '../../src/model/Sprite.ts';
import {Stage} from '../../src/model/Stage.ts';
import {Sprite} from '../../src/model/Sprite.ts';

test('createProject builds a Project from a valid DSL', () => {
    const project = createProject(createMinimalProject());
    assert.equal(project.id, 'project-main');
    assert.equal(project.name, 'Minimal valid project');
});

test('Stage is a single instance, isStage=true, and holds stage-only fields', () => {
    const project = createProject(createMinimalProject());
    assert.ok(project.stage instanceof Stage);
    assert.equal(project.stage.isStage, true);
    assert.equal(project.stage.id, 'target-stage');
    assert.equal(project.stage.tempo, 60);
    assert.equal(project.stage.videoTransparency, 50);
    assert.equal(project.stage.videoState, 'on');
    assert.equal(project.stage.textToSpeechLanguage, null);
});

test('Sprite holds sprite-only fields with explicit DSL values', () => {
    const project = createProject(createMinimalProject());
    assert.equal(project.sprites.length, 1);
    const sprite = project.sprites[0];
    assert.ok(sprite instanceof Sprite);
    assert.equal(sprite.isStage, false);
    assert.equal(sprite.x, 0);
    assert.equal(sprite.y, 0);
    assert.equal(sprite.size, 100);
    assert.equal(sprite.direction, 90);
    assert.equal(sprite.visible, true);
    assert.equal(sprite.draggable, false);
    assert.equal(sprite.rotationStyle, 'all around');
});

test('SPRITE_DEFAULTS matches SCRATCH_TARGET_SPEC defaults', () => {
    assert.deepEqual(SPRITE_DEFAULTS, {
        x: 0,
        y: 0,
        size: 100,
        direction: 90,
        visible: true,
        draggable: false,
        rotationStyle: 'all around'
    });
});

test('createProject falls back to SPRITE_DEFAULTS when a sprite-only value is null/undefined', () => {
    // The schema requires sprite-only keys to be *present*, but does not
    // forbid null/undefined values; createProject must still substitute
    // SPRITE_DEFAULTS in that case via the `??` fallback in ProjectFactory.
    const dsl = createMinimalProject();
    const spriteDsl = dsl.sprites[0] as unknown as Record<string, unknown>;
    spriteDsl.visible = undefined;
    spriteDsl.x = undefined;
    spriteDsl.y = undefined;
    spriteDsl.size = undefined;
    spriteDsl.direction = undefined;
    spriteDsl.draggable = undefined;
    spriteDsl.rotationStyle = undefined;

    const project = createProject(dsl);
    const sprite = project.sprites[0];
    assert.equal(sprite.x, SPRITE_DEFAULTS.x);
    assert.equal(sprite.y, SPRITE_DEFAULTS.y);
    assert.equal(sprite.size, SPRITE_DEFAULTS.size);
    assert.equal(sprite.direction, SPRITE_DEFAULTS.direction);
    assert.equal(sprite.visible, SPRITE_DEFAULTS.visible);
    assert.equal(sprite.draggable, SPRITE_DEFAULTS.draggable);
    assert.equal(sprite.rotationStyle, SPRITE_DEFAULTS.rotationStyle);
});

test('createProject throws with diagnostics when DSL is invalid', () => {
    const dsl = createMinimalProject() as unknown as Record<string, unknown>;
    dsl.schemaVersion = '2.0.0';
    assert.throws(
        () => createProject(dsl as never),
        (error: unknown) => {
            assert.ok(error instanceof Error);
            const diagnostics = (error as Error & {diagnostics?: unknown[]}).diagnostics;
            assert.ok(Array.isArray(diagnostics) && diagnostics.length > 0);
            return true;
        }
    );
});
