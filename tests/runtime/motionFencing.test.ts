import assert from 'node:assert/strict';
import test from 'node:test';

import {createProject} from '../../src/model/ProjectFactory.ts';
import {Runtime} from '../../src/runtime/Runtime.ts';
import {computeLocalBounds, fencePosition} from '../../src/runtime/fencing.ts';
import type {DrawableState, RendererPort} from '../../src/runtime/RendererPort.ts';
import type {DslBlock, DslProject} from '../../src/validation/projectValidator.ts';

/**
 * RendererPort that fences using the real fencing math against a fixed 18x28
 * costume (rotation centre 9,14). The transform passed by the Runtime drives
 * the result, so size/direction/rotationStyle are exercised end to end.
 */
class FencingRenderer implements RendererPort {
    renderDrawables(_states: DrawableState[]): void {}
    getFencedPosition(
        _targetId: string,
        x: number,
        y: number,
        transform: {size: number; direction: number; rotationStyle: DrawableState['rotationStyle']}
    ): [number, number] {
        const bounds = computeLocalBounds(
            18, 28, 9, 14,
            transform.size, transform.direction, transform.rotationStyle
        );
        return fencePosition(x, y, bounds);
    }
}

const block = (
    id: string,
    opcode: string,
    next: string | null,
    parent: string | null,
    inputs: DslBlock['inputs'] = {},
    fields: DslBlock['fields'] = {},
    topLevel = false,
    shadow = false
): DslBlock => ({id, opcode, next, parent, inputs, fields, topLevel, shadow});

const baseProject = (blocks: Record<string, DslBlock>, scripts: string[], extra: Partial<DslProject['sprites'][number]> = {}): DslProject => ({
    schemaVersion: '1.0.0',
    project: {id: 'fencing', name: 'Fencing'},
    stage: {
        id: 'stage', isStage: true, name: 'Stage',
        variables: [], lists: [], broadcasts: [], blocks: {}, scripts: [], comments: [],
        currentCostume: 0, costumes: [], sounds: [], volume: 100, layerOrder: 0,
        tempo: 60, videoTransparency: 50, videoState: 'on', textToSpeechLanguage: null
    },
    sprites: [{
        id: 'sprite', isStage: false, name: 'Sprite',
        variables: [], lists: [], broadcasts: [], blocks, scripts, comments: [],
        currentCostume: 0, costumes: [], sounds: [], volume: 100, layerOrder: 1,
        visible: true, x: 0, y: 0, size: 400, direction: 90, draggable: false,
        rotationStyle: 'all around', ...extra
    }],
    assets: [], monitors: [], extensions: [], meta: {source: 'test:fencing'}
});

const setXProject = (targetX: number): DslProject => baseProject(
    {
        flag: block('flag', 'event_whenflagclicked', 'setx', null, {}, {}, true),
        setx: block('setx', 'motion_setx', null, 'flag', {X: {block: 'xval', shadow: 'xval'}}),
        xval: block('xval', 'math_number', null, 'setx', {}, {NUM: {value: targetX}}, false, true)
    },
    ['flag']
);

test('set x to 300 with a renderer is fenced (261 for a size-400 18x28 costume)', () => {
    const project = createProject(setXProject(300));
    const runtime = new Runtime({renderer: new FencingRenderer()});
    runtime.load(project);
    runtime.start();
    runtime.greenFlag();
    runtime.tick();

    assert.equal(project.sprites[0].x, 261);
    assert.equal(project.sprites[0].y, 0);
});

test('set x to 300 headless (no renderer) passes through unfenced', () => {
    const project = createProject(setXProject(300));
    const runtime = new Runtime();
    runtime.load(project);
    runtime.start();
    runtime.greenFlag();
    runtime.tick();

    assert.equal(project.sprites[0].x, 300);
    assert.equal(project.sprites[0].y, 0);
});

test('x/y position reporters return the fenced coordinate', () => {
    const project = createProject(baseProject(
        {
            flag: block('flag', 'event_whenflagclicked', 'setx', null, {}, {}, true),
            setx: block('setx', 'motion_setx', 'storex', 'flag', {X: {block: 'xval', shadow: 'xval'}}),
            xval: block('xval', 'math_number', null, 'setx', {}, {NUM: {value: 300}}, false, true),
            storex: block('storex', 'data_setvariableto', null, 'setx',
                {VALUE: {block: 'xpos', shadow: null}},
                {VARIABLE: {value: 'rx', id: 'rx'}}),
            xpos: block('xpos', 'motion_xposition', null, 'storex')
        },
        ['flag'],
        {variables: [{id: 'rx', name: 'rx', value: 0, isCloud: false}]}
    ));
    const runtime = new Runtime({renderer: new FencingRenderer()});
    runtime.load(project);
    runtime.start();
    runtime.greenFlag();
    runtime.tick();

    assert.equal(project.sprites[0].x, 261);
    assert.equal(project.sprites[0].variables.get('rx'), 261);
});

test('motion_movesteps lands on the fenced position with a renderer', () => {
    const project = createProject(baseProject(
        {
            flag: block('flag', 'event_whenflagclicked', 'move', null, {}, {}, true),
            move: block('move', 'motion_movesteps', null, 'flag', {STEPS: {block: 'steps', shadow: 'steps'}}),
            steps: block('steps', 'math_number', null, 'move', {}, {NUM: {value: 100}}, false, true)
        },
        ['flag'],
        {x: 200} // direction 90 -> desired x = 300 -> fenced 261
    ));
    const runtime = new Runtime({renderer: new FencingRenderer()});
    runtime.load(project);
    runtime.start();
    runtime.greenFlag();
    runtime.tick();

    assert.equal(project.sprites[0].x, 261);
});

test('motion_movesteps headless moves to the raw position', () => {
    const project = createProject(baseProject(
        {
            flag: block('flag', 'event_whenflagclicked', 'move', null, {}, {}, true),
            move: block('move', 'motion_movesteps', null, 'flag', {STEPS: {block: 'steps', shadow: 'steps'}}),
            steps: block('steps', 'math_number', null, 'move', {}, {NUM: {value: 100}}, false, true)
        },
        ['flag'],
        {x: 200}
    ));
    const runtime = new Runtime();
    runtime.load(project);
    runtime.start();
    runtime.greenFlag();
    runtime.tick();

    assert.ok(Math.abs(project.sprites[0].x - 300) < 1e-9);
});
