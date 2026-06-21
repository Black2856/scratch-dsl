import assert from 'node:assert/strict';
import test from 'node:test';

import {createMinimalProject} from '../fixtures/minimalProject.ts';
import {
    createBlockCycleProject,
    createDanglingReferenceProject,
    createDuplicateIdProject,
    createScopeViolationProject
} from '../fixtures/invalidProjects.ts';
import {validateProject} from '../../src/validation/projectValidator.ts';

const assertRejectedWith = (
    project: unknown,
    expectedCode: string
): void => {
    const result = validateProject(project);
    assert.equal(result.valid, false);
    const diagnostic = result.diagnostics.find(item => item.code === expectedCode);
    assert.ok(diagnostic, `expected diagnostic ${expectedCode}`);
    assert.equal(typeof diagnostic.path, 'string');
    assert.ok(Object.prototype.hasOwnProperty.call(diagnostic, 'entityId'));
    assert.ok(Object.prototype.hasOwnProperty.call(diagnostic, 'opcode'));
};

test('minimal valid DSL passes validation', () => {
    const result = validateProject(createMinimalProject());
    assert.equal(result.valid, true, JSON.stringify(result.diagnostics, null, 2));
    assert.deepEqual(result.diagnostics, []);
});

test('dangling block reference is rejected with contextual diagnostic', () => {
    const result = validateProject(createDanglingReferenceProject());
    const diagnostic = result.diagnostics.find(item => item.code === 'block.reference-dangling');
    assert.equal(result.valid, false);
    assert.ok(diagnostic);
    assert.equal(diagnostic.path, '$.stage.blocks.block-stage-flag.next');
    assert.equal(diagnostic.entityId, 'block-does-not-exist');
    assert.equal(diagnostic.opcode, 'event_whenflagclicked');
});

test('duplicate project-wide ID is rejected', () => {
    assertRejectedWith(createDuplicateIdProject(), 'id.duplicate');
});

test('out-of-scope variable reference is rejected', () => {
    const result = validateProject(createScopeViolationProject());
    const diagnostic = result.diagnostics.find(item => item.code === 'scope.reference-invalid');
    assert.equal(result.valid, false);
    assert.ok(diagnostic);
    assert.equal(diagnostic.path, '$.stage.blocks.block-stage-set.fields.VARIABLE.id');
    assert.equal(diagnostic.entityId, 'var-sprite-only');
    assert.equal(diagnostic.opcode, 'data_setvariableto');
});

test('block graph cycle is rejected', () => {
    assertRejectedWith(createBlockCycleProject(), 'block.cycle');
});

test('unknown opcode is retained with a warning instead of an error', () => {
    const project = createMinimalProject();
    project.stage.blocks['block-stage-set'].opcode = 'custom_unknown';
    project.stage.blocks['block-stage-set'].inputs = {};
    project.stage.blocks['block-stage-set'].fields = {};
    delete project.stage.blocks['shadow-stage-zero'];
    const result = validateProject(project);
    assert.equal(result.valid, true);
    assert.equal(result.diagnostics.some(item =>
        item.code === 'opcode.unknown' && item.severity === 'warning'), true);
});

test('unsupported schema version is rejected before semantic validation', () => {
    const project = createMinimalProject() as unknown as Record<string, unknown>;
    project.schemaVersion = '2.0.0';
    assertRejectedWith(project, 'schema.version-unsupported');
});

test('deep structural errors are rejected before graph validation', () => {
    const project = createMinimalProject() as unknown as Record<string, unknown>;
    const stage = project.stage as Record<string, unknown>;
    stage.blocks = {
        broken: {
            id: 'broken',
            opcode: 'motion_movesteps'
        }
    };
    assertRejectedWith(project, 'schema.required');
});
