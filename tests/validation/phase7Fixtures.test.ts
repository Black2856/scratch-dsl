import assert from 'node:assert/strict';
import test from 'node:test';

import {validateProject} from '../../src/validation/projectValidator.ts';
import {
    PHASE7_FIXTURE_NAMES,
    createPhase7Fixture
} from '../fixtures/phase7SampleProjects.ts';

for (const name of PHASE7_FIXTURE_NAMES) {
    test(`Phase 7 fixture "${name}" passes DSL validation`, () => {
        const result = validateProject(createPhase7Fixture(name));
        const errors = result.diagnostics.filter(item => item.severity === 'error');
        assert.deepEqual(errors, []);
        assert.equal(result.valid, true);
    });
}

