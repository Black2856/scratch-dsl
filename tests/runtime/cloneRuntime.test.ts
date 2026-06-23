import assert from 'node:assert/strict';
import test from 'node:test';

import {createCloneProject, createBareSpriteProject} from '../fixtures/phase5Projects.ts';
import {createProject} from '../../src/model/ProjectFactory.ts';
import {Runtime} from '../../src/runtime/Runtime.ts';
import {Clone} from '../../src/model/Clone.ts';
import {PEN_DEFAULT_COLOR} from '../../src/runtime/PenManager.ts';
import type {DrawableState, RendererPort} from '../../src/runtime/RendererPort.ts';
import type {RuntimeAudioPort, RuntimeSoundPlayback} from '../../src/audio/AudioPort.ts';

/** RendererPort that records pen/release calls and the last drawable snapshot. */
class RecordingRenderer implements RendererPort {
    lastStates: DrawableState[] = [];
    released: string[] = [];
    clonedSkins: Array<{sourceTargetId: string; cloneTargetId: string}> = [];
    renderDrawables(states: DrawableState[]): void {
        this.lastStates = states;
    }
    cloneTargetSkin(sourceTargetId: string, cloneTargetId: string): void {
        this.clonedSkins.push({sourceTargetId, cloneTargetId});
    }
    releaseTarget(targetId: string): void {
        this.released.push(targetId);
    }
}

/** RuntimeAudioPort that records per-target stop calls. */
class RecordingAudio implements RuntimeAudioPort {
    stopped: string[] = [];
    play(): RuntimeSoundPlayback | undefined {
        return undefined;
    }
    setTargetVolume(): void {}
    stopTarget(targetId: string): void {
        this.stopped.push(targetId);
    }
    stopAll(): void {}
}

test('create clone produces a clone target and runs its start-as-clone hat', () => {
    const project = createProject(createCloneProject());
    const runtime = new Runtime();
    runtime.load(project);
    runtime.start();

    runtime.greenFlag();
    runtime.tick();

    assert.equal(runtime.clones.length, 1, 'exactly one clone created on green flag');
    const clone = runtime.clones[0];
    assert.ok(clone instanceof Clone);

    // The start-as-clone hat ran on the clone: it bumped the stage-global
    // cloneCount and tagged its own (clone-local) variable copy.
    assert.equal(project.stage.variables.get('var-clone-count'), 1);
    assert.equal(clone.variables.get('var-local-tag'), 'clone');

    // Variable isolation: the original sprite's copy is untouched.
    const hero = project.sprites[0];
    assert.equal(hero.variables.get('var-local-tag'), '');
    assert.equal(clone.original, hero);
});

test('create clone asks the renderer to reuse the source target skin', () => {
    const project = createProject(createBareSpriteProject());
    const renderer = new RecordingRenderer();
    const runtime = new Runtime({renderer});
    runtime.load(project);
    runtime.start();

    const sprite = project.sprites[0];
    const clone = runtime.cloneManager.createClone(sprite);
    assert.ok(clone);
    assert.deepEqual(renderer.clonedSkins, [{
        sourceTargetId: sprite.id,
        cloneTargetId: clone.id
    }]);
});

test('clone count never exceeds Runtime.MAX_CLONES', () => {
    const project = createProject(createBareSpriteProject());
    const runtime = new Runtime();
    runtime.load(project);
    runtime.start();
    const sprite = project.sprites[0];

    for (let i = 0; i < Runtime.MAX_CLONES + 50; i++) {
        runtime.cloneManager.createClone(sprite);
    }
    assert.equal(runtime.clones.length, Runtime.MAX_CLONES);
    assert.equal(runtime.cloneManager.createClone(sprite), undefined, 'over-limit clone is a no-op');
});

test('delete this clone releases its threads, drawable, sound, and pen state', () => {
    const project = createProject(createBareSpriteProject());
    const renderer = new RecordingRenderer();
    const audio = new RecordingAudio();
    const runtime = new Runtime({renderer, audio});
    runtime.load(project);
    runtime.start();

    const sprite = project.sprites[0];
    const clone = runtime.cloneManager.createClone(sprite);
    assert.ok(clone);

    // Attach a thread running on the clone and give it custom pen state.
    runtime.createThread('clone-script', clone);
    runtime.pen.setColor(clone.id, '#abcdef');
    assert.equal(runtime.threads.some(thread => thread.target === clone), true);

    runtime.cloneManager.deleteClone(clone);

    assert.equal(runtime.clones.length, 0, 'clone removed from live list');
    assert.equal(runtime.threads.some(thread => thread.target === clone), false, 'clone threads removed');
    assert.deepEqual(renderer.released, [clone.id], 'renderer drawable released');
    assert.deepEqual(audio.stopped, [clone.id], 'clone sounds stopped');
    // Pen state was dropped: a fresh lookup returns defaults again.
    assert.equal(runtime.pen.getState(clone.id).color, PEN_DEFAULT_COLOR);
});

test('green flag (stop all) deletes every clone', () => {
    const project = createProject(createBareSpriteProject());
    const runtime = new Runtime();
    runtime.load(project);
    runtime.start();
    const sprite = project.sprites[0];

    runtime.cloneManager.createClone(sprite);
    runtime.cloneManager.createClone(sprite);
    assert.equal(runtime.clones.length, 2);

    runtime.greenFlag();
    assert.equal(runtime.clones.length, 0, 'green flag clears all clones');
});

test('clones appear in the drawable snapshot handed to the renderer', () => {
    const project = createProject(createCloneProject());
    const renderer = new RecordingRenderer();
    const runtime = new Runtime({renderer});
    runtime.load(project);
    runtime.start();

    runtime.greenFlag();
    runtime.tick();

    const clone = runtime.clones[0];
    const drawn = renderer.lastStates.find(state => state.targetId === clone.id);
    assert.ok(drawn, 'clone present in DrawableState snapshot');
    assert.equal(drawn.isStage, false);
});
