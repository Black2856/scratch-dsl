import assert from 'node:assert/strict';
import test from 'node:test';

import type {RuntimeAudioPort, RuntimeSoundPlayback} from '../../src/audio/AudioPort.ts';
import {createProject} from '../../src/model/ProjectFactory.ts';
import type {
    DrawableState,
    PenAttributes,
    PenPoint,
    RendererPort
} from '../../src/runtime/RendererPort.ts';
import {Runtime} from '../../src/runtime/Runtime.ts';
import {
    createBroadcastBasicProject,
    createCloneBasicProject,
    createFullFeatureMinimalProject,
    createHelloWorldProject,
    createKeyboardControlProject,
    createListBasicProject,
    createMotionBasicProject,
    createPenBasicProject,
    createProcedureBasicProject,
    createSoundBasicProject,
    createVariableScoreProject
} from '../fixtures/phase7SampleProjects.ts';

class RecordingAudio implements RuntimeAudioPort {
    plays: Array<{targetId: string; soundId: string}> = [];
    play(targetId: string, soundId: string): RuntimeSoundPlayback | undefined {
        this.plays.push({targetId, soundId});
        return undefined;
    }
    setTargetVolume(): void {}
    stopTarget(): void {}
    stopAll(): void {}
}

class RecordingRenderer implements RendererPort {
    states: DrawableState[] = [];
    points: Array<{point: PenPoint; attributes: PenAttributes}> = [];
    stamps: string[] = [];
    renderDrawables(states: DrawableState[]): void {
        this.states = states;
    }
    penPoint(point: PenPoint, attributes: PenAttributes): void {
        this.points.push({point, attributes});
    }
    penStamp(targetId: string): void {
        this.stamps.push(targetId);
    }
    penClear(): void {}
}

const runGreenFlag = (
    dsl: ReturnType<typeof createHelloWorldProject>,
    options: ConstructorParameters<typeof Runtime>[0] = {}
): Runtime => {
    const runtime = new Runtime(options);
    runtime.load(createProject(dsl));
    runtime.start();
    runtime.greenFlag();
    runtime.tick();
    return runtime;
};

test('hello-world updates and shows its message variable', () => {
    const runtime = runGreenFlag(createHelloWorldProject());
    assert.equal(runtime.project.stage.variables.get('hello-message'), 'Hello, world!');
    assert.equal(runtime.monitors.isVisible('hello-message'), true);
});

test('motion-basic executes motion_gotoxy then motion_movesteps and renders the updated sprite state', () => {
    const renderer = new RecordingRenderer();
    const runtime = runGreenFlag(createMotionBasicProject(), {renderer});
    const sprite = runtime.project.sprites[0];
    // go to (40, 20) then move 10 steps at direction 90 -> (50, 20). The
    // RecordingRenderer exposes no getFencedPosition, so positions are raw.
    assert.ok(Math.abs(sprite.x - 50) < 1e-10);
    assert.equal(sprite.y, 20);
    assert.ok(renderer.states.some(state => state.targetId === sprite.id));
});

test('variable-score sets and increments score', () => {
    const runtime = runGreenFlag(createVariableScoreProject());
    assert.equal(runtime.project.stage.variables.get('score'), 15);
});

test('broadcast-basic starts its receiver', () => {
    const runtime = runGreenFlag(createBroadcastBasicProject());
    assert.equal(runtime.project.stage.variables.get('received'), 'yes');
});

test('list-basic appends both values in order', () => {
    const runtime = runGreenFlag(createListBasicProject());
    assert.deepEqual(runtime.project.stage.lists.get('items'), ['alpha', 'beta']);
});

test('keyboard-control executes through the existing explicit hat-start seam', () => {
    const runtime = new Runtime();
    runtime.load(createProject(createKeyboardControlProject()));
    runtime.start();
    runtime.startHats('event_whenkeypressed', undefined, true);
    runtime.tick();
    assert.equal(runtime.project.sprites[0].variables.get('key-state'), 'pressed');
});

test('procedure-basic binds its argument', () => {
    const runtime = runGreenFlag(createProcedureBasicProject());
    assert.equal(runtime.project.stage.variables.get('var-result'), 'hello');
});

test('clone-basic creates one clone and runs start-as-clone', () => {
    const runtime = runGreenFlag(createCloneBasicProject());
    assert.equal(runtime.clones.length, 1);
    assert.equal(runtime.project.stage.variables.get('var-clone-count'), 1);
});

test('pen-basic drives the pen renderer port', () => {
    const renderer = new RecordingRenderer();
    const runtime = runGreenFlag(createPenBasicProject(), {renderer});
    assert.equal(renderer.points.length, 1);
    assert.equal(renderer.stamps.length, 1);
    assert.equal(runtime.pen.isDown(runtime.project.sprites[0].id), true);
});

test('sound-basic addresses the workspace sound through the audio port', () => {
    const audio = new RecordingAudio();
    const runtime = runGreenFlag(createSoundBasicProject(), {audio});
    assert.deepEqual(audio.plays, [{
        targetId: 'sound-basic-sprite',
        soundId: 'sound-basic-sound-effect'
    }]);
});

test('full-feature-minimal exercises data, broadcast, procedure, clone, pen, and sound paths', () => {
    const audio = new RecordingAudio();
    const renderer = new RecordingRenderer();
    const runtime = runGreenFlag(createFullFeatureMinimalProject(), {audio, renderer});
    assert.deepEqual(runtime.project.stage.lists.get('list-items'), ['x']);
    assert.equal(runtime.clones.length, 1);
    assert.equal(audio.plays.length, 1);
    assert.equal(renderer.points.length, 1);
    assert.equal(runtime.monitors.isVisible('var-score'), true);
});
