import assert from 'node:assert/strict';
import test from 'node:test';
import parseProject from 'scratch-parser';

import {packageSb3} from '../../src/sb3/sb3Packager.ts';
import {
    PHASE7_FIXTURE_NAMES,
    createPhase7Fixture
} from '../fixtures/phase7SampleProjects.ts';
import {readPhase7AssetBytes} from '../fixtures/phase7SampleAssets.ts';

const parse = (sb3: Uint8Array): Promise<{targets: unknown[]}> =>
    new Promise((resolve, reject) => {
        parseProject(Buffer.from(sb3), false, (error: unknown, result: [{targets: unknown[]}]) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(result[0]);
        });
    });

for (const name of PHASE7_FIXTURE_NAMES) {
    test(`Phase 7 fixture "${name}" is accepted by scratch-parser`, async () => {
        const project = createPhase7Fixture(name);
        const {sb3} = packageSb3(project, {assets: readPhase7AssetBytes(project)});
        const parsed = await parse(sb3);
        assert.equal(parsed.targets.length, 1 + project.sprites.length);
    });
}

