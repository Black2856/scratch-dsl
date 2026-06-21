import assert from 'node:assert/strict';
import test from 'node:test';

import {createMonitorProject} from '../fixtures/phase5Projects.ts';
import {createProject} from '../../src/model/ProjectFactory.ts';
import {Runtime} from '../../src/runtime/Runtime.ts';
import {MonitorManager} from '../../src/runtime/MonitorManager.ts';

test('show/hide variable and list blocks update monitor visibility', () => {
    const project = createProject(createMonitorProject());
    const runtime = new Runtime();
    runtime.load(project);
    runtime.start();

    runtime.greenFlag();
    runtime.tick();

    // show variable a, show list c, hide variable b.
    assert.equal(runtime.monitors.isVisible('var-a'), true);
    assert.equal(runtime.monitors.isVisible('list-c'), true);
    assert.equal(runtime.monitors.isVisible('var-b'), false);

    const listMonitor = runtime.monitors.getState('list-c');
    assert.equal(listMonitor?.opcode, 'data_listcontents');
});

test('MonitorManager seeds visibility from declared monitors', () => {
    const manager = new MonitorManager([
        {id: 'mon-1', opcode: 'data_variable', visible: true}
    ]);
    assert.equal(manager.isVisible('mon-1'), true);

    manager.setVisible('mon-1', false);
    assert.equal(manager.isVisible('mon-1'), false);

    // Unknown ids default to hidden, and setVisible upserts a new record.
    assert.equal(manager.isVisible('mon-2'), false);
    manager.setVisible('mon-2', true, 'data_listcontents');
    assert.equal(manager.isVisible('mon-2'), true);
    assert.equal(manager.getState('mon-2')?.opcode, 'data_listcontents');
    assert.equal(manager.list().length, 2);
});
