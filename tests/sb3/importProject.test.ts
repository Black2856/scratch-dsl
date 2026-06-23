import assert from 'node:assert/strict';
import test from 'node:test';

import {validateProject, type DslProject} from '../../src/validation/projectValidator.ts';
import {serializeProject} from '../../src/sb3/projectSerializer.ts';
import {packageSb3} from '../../src/sb3/sb3Packager.ts';
import {createMinimalProject} from '../fixtures/minimalProject.ts';
import {createFullFeatureProject} from '../fixtures/sb3Projects.ts';
import {parseProjectJson} from '../../src/sb3/import/parseProject.ts';
import {rawToDsl} from '../../src/sb3/import/rawToDsl.ts';
import {importSb3} from '../../src/sb3/import/importProject.ts';

// Self round-trip at the project.json level: import is the inverse of export.
//   serializeProject( rawToDsl( parse( serializeProject(p) ) ) ) === serializeProject(p)
const roundTripProject = (project: DslProject): void => {
    const sb3 = serializeProject(project);
    const parsed = parseProjectJson(JSON.stringify(sb3));
    assert.ok(parsed.project, `parsed (diags: ${JSON.stringify(parsed.diagnostics)})`);

    const {project: imported, diagnostics} = rawToDsl(parsed.project!);
    assert.ok(imported, 'assembled DslProject');
    assert.equal(diagnostics.filter(d => d.severity === 'error').length, 0, `no rawToDsl errors: ${JSON.stringify(diagnostics)}`);

    const validation = validateProject(imported!);
    assert.equal(validation.valid, true, `imported project is valid: ${JSON.stringify(validation.diagnostics.filter(d => d.severity === 'error'))}`);

    const sb3Again = serializeProject(imported!);
    assert.deepEqual(sb3Again, sb3);
};

test('round-trips the minimal project through import', () => {
    roundTripProject(createMinimalProject());
});

test('round-trips the full-feature project through import (vars, lists, monitors, mutation, assets)', () => {
    roundTripProject(createFullFeatureProject());
});

test('imported project reconstructs Stage + sprites with preserved ids', () => {
    const original = createFullFeatureProject();
    const sb3 = serializeProject(original);
    const {project} = rawToDsl(parseProjectJson(JSON.stringify(sb3)).project!);
    assert.equal(project!.stage.isStage, true);
    assert.equal(project!.sprites.length, original.sprites.length);
    // variable/broadcast ids are the SB3 map keys, preserved verbatim
    const originalVarIds = original.stage.variables.map(v => v.id).sort();
    const importedVarIds = project!.stage.variables.map(v => v.id).sort();
    assert.deepEqual(importedVarIds, originalVarIds);
    // asset list is rebuilt from costume/sound references
    for (const costume of project!.stage.costumes) {
        assert.ok(project!.assets.some(a => a.md5ext === costume.md5ext), `asset for ${costume.md5ext}`);
    }
});

// End-to-end through real .sb3 bytes (zip + inflate path).
test('importSb3 loads our own exported .sb3 bytes into a valid project', () => {
    const {sb3} = packageSb3(createMinimalProject());
    const result = importSb3(sb3);
    assert.equal(result.valid, true, `valid (diags: ${JSON.stringify(result.diagnostics)})`);
    assert.ok(result.project, 'project present');
    assert.equal(result.project!.stage.isStage, true);
    // re-export equals the original export (semantic round-trip)
    assert.deepEqual(serializeProject(result.project!), serializeProject(createMinimalProject()));
});

test('importSb3 reports a zip error for non-archive bytes', () => {
    const result = importSb3(new TextEncoder().encode('definitely not a zip'));
    assert.equal(result.valid, false);
    assert.equal(result.project, null);
    assert.equal(result.diagnostics[0].code, 'sb3.zip.not-a-zip');
});
