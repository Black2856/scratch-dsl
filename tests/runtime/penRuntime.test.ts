import assert from 'node:assert/strict';
import test from 'node:test';

import {createPenProject, createBareSpriteProject} from '../fixtures/phase5Projects.ts';
import {createProject} from '../../src/model/ProjectFactory.ts';
import {Runtime} from '../../src/runtime/Runtime.ts';
import {PEN_DEFAULT_COLOR, PEN_DEFAULT_SIZE} from '../../src/runtime/PenManager.ts';
import type {DrawableState, PenAttributes, PenPoint, RendererPort} from '../../src/runtime/RendererPort.ts';

/** RendererPort capturing every pen port call. */
class PenRecorder implements RendererPort {
    clears = 0;
    points: Array<{point: PenPoint; attributes: PenAttributes}> = [];
    lines: Array<{from: PenPoint; to: PenPoint; attributes: PenAttributes}> = [];
    stamps: string[] = [];
    renderDrawables(_states: DrawableState[]): void {}
    penClear(): void {
        this.clears++;
    }
    penPoint(point: PenPoint, attributes: PenAttributes): void {
        this.points.push({point, attributes});
    }
    penLine(from: PenPoint, to: PenPoint, attributes: PenAttributes): void {
        this.lines.push({from, to, attributes});
    }
    penStamp(targetId: string): void {
        this.stamps.push(targetId);
    }
}

test('pen blocks update pen state and drive the renderer pen port', () => {
    const project = createProject(createPenProject());
    const renderer = new PenRecorder();
    const runtime = new Runtime({renderer});
    runtime.load(project);
    runtime.start();

    runtime.greenFlag();
    runtime.tick();

    const sprite = project.sprites[0];
    const state = runtime.pen.getState(sprite.id);
    assert.equal(state.color, '#ff0000');
    assert.equal(state.size, 10);
    assert.equal(state.down, true);

    // pen down drew a dot at the sprite's position with current attributes.
    assert.equal(renderer.points.length, 1);
    assert.deepEqual(renderer.points[0].point, {x: 0, y: 0});
    assert.deepEqual(renderer.points[0].attributes, {color: '#ff0000', size: 10});

    // stamp forwarded the sprite id to the renderer.
    assert.deepEqual(renderer.stamps, [sprite.id]);

    // pen_clear ran once at the top of the script.
    assert.equal(renderer.clears, 1);
});

test('motion_movesteps moves a sprite and draws a round-ended pen segment while pen is down', () => {
    const dsl = createPenProject();
    const spriteDsl = dsl.sprites[0];
    spriteDsl.blocks['pen-down'].next = 'move-steps';
    spriteDsl.blocks['move-steps'] = {
        id: 'move-steps',
        opcode: 'motion_movesteps',
        next: 'pen-stamp',
        parent: 'pen-down',
        inputs: {STEPS: {block: 'move-distance', shadow: 'move-distance'}},
        fields: {},
        shadow: false,
        topLevel: false
    };
    spriteDsl.blocks['move-distance'] = {
        id: 'move-distance',
        opcode: 'math_number',
        next: null,
        parent: 'move-steps',
        inputs: {},
        fields: {NUM: {value: 40}},
        shadow: true,
        topLevel: false
    };
    spriteDsl.blocks['pen-stamp'].parent = 'move-steps';

    const project = createProject(dsl);
    const renderer = new PenRecorder();
    const runtime = new Runtime({renderer});
    runtime.load(project);
    runtime.start();
    runtime.greenFlag();
    runtime.tick();

    const sprite = project.sprites[0];
    assert.ok(Math.abs(sprite.x - 40) < 1e-10);
    assert.ok(Math.abs(sprite.y) < 1e-10);
    assert.deepEqual(renderer.lines, [{
        from: {x: 0, y: 0},
        to: {x: 40, y: 40 * Math.cos(Math.PI / 2)},
        attributes: {color: '#ff0000', size: 10}
    }]);
});

test('pen size is clamped to 1..1200 and pen up clears the down flag', () => {
    const project = createProject(createBareSpriteProject());
    const runtime = new Runtime();
    runtime.load(project);
    runtime.start();
    const id = project.sprites[0].id;

    assert.equal(runtime.pen.getState(id).size, PEN_DEFAULT_SIZE);
    runtime.pen.setSize(id, 5000);
    assert.equal(runtime.pen.getState(id).size, 1200);
    runtime.pen.setSize(id, -10);
    assert.equal(runtime.pen.getState(id).size, 1);
    runtime.pen.changeSize(id, 100);
    assert.equal(runtime.pen.getState(id).size, 101);

    runtime.pen.setDown(id, true);
    assert.equal(runtime.pen.isDown(id), true);
    runtime.pen.setDown(id, false);
    assert.equal(runtime.pen.isDown(id), false);
});

test('a clone inherits the source target pen state', () => {
    const project = createProject(createBareSpriteProject());
    const runtime = new Runtime();
    runtime.load(project);
    runtime.start();
    const sprite = project.sprites[0];

    runtime.pen.setColor(sprite.id, '#112233');
    runtime.pen.setSize(sprite.id, 42);
    runtime.pen.setDown(sprite.id, true);

    const clone = runtime.cloneManager.createClone(sprite);
    assert.ok(clone);
    const cloneState = runtime.pen.getState(clone.id);
    assert.equal(cloneState.color, '#112233');
    assert.equal(cloneState.size, 42);
    assert.equal(cloneState.down, true);

    // Independent copies: mutating the clone's pen leaves the source unchanged.
    runtime.pen.setColor(clone.id, '#000000');
    assert.equal(runtime.pen.getState(sprite.id).color, '#112233');
    assert.notEqual(PEN_DEFAULT_COLOR, '#112233');
});
