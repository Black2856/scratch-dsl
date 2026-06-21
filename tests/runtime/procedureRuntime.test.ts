import assert from 'node:assert/strict';
import test from 'node:test';

import {
    createProcedureArgProject,
    createWarpLoopProject,
    createWarpWaitProject
} from '../fixtures/phase5Projects.ts';
import {createProject} from '../../src/model/ProjectFactory.ts';
import {Runtime} from '../../src/runtime/Runtime.ts';
import type {ClockPort} from '../../src/runtime/ports.ts';

class FakeClock implements ClockPort {
    private current = 0;
    now(): number {
        return this.current;
    }
    advance(ms: number): void {
        this.current += ms;
    }
}

const build = (dsl: ReturnType<typeof createProcedureArgProject>, clock = new FakeClock()) => {
    const project = createProject(dsl);
    const runtime = new Runtime({clock});
    runtime.load(project);
    runtime.start();
    return {runtime, project, clock};
};

test('procedures_call binds arguments into the procedure frame for argument reporters', () => {
    const {runtime, project} = build(createProcedureArgProject());
    runtime.greenFlag();
    runtime.tick();

    // store("hello") -> result := argument_reporter("n") -> "hello"
    assert.equal(project.stage.variables.get('var-result'), 'hello');
});

test('warp procedure runs its whole loop within a single tick', () => {
    const {runtime, project} = build(createWarpLoopProject(true));
    runtime.greenFlag();
    runtime.tick();

    // repeat 5 { change warpCounter by 1 } completes in one tick under warp.
    assert.equal(project.stage.variables.get('var-warp-counter'), 5);
});

test('non-warp procedure yields once per loop iteration (one increment per tick)', () => {
    const {runtime, project} = build(createWarpLoopProject(false));
    runtime.greenFlag();

    runtime.tick();
    assert.equal(project.stage.variables.get('var-warp-counter'), 1);
    runtime.tick();
    assert.equal(project.stage.variables.get('var-warp-counter'), 2);
});

test('warp procedure still honours an explicit time wait', () => {
    const {runtime, project, clock} = build(createWarpWaitProject());
    runtime.greenFlag();

    runtime.tick();
    // change before by 1; wait 1s -> yields. afterWait must not have run yet.
    assert.equal(project.stage.variables.get('var-before-wait'), 1);
    assert.equal(project.stage.variables.get('var-after-wait'), 0, 'warp must not swallow the wait');

    // Ticking without advancing the clock keeps the wait pending.
    runtime.tick();
    assert.equal(project.stage.variables.get('var-after-wait'), 0);

    // Once the clock passes the 1s deadline the wait completes.
    clock.advance(1000);
    runtime.tick();
    assert.equal(project.stage.variables.get('var-after-wait'), 1);
});
