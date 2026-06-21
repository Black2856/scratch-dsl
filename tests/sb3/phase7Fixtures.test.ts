import assert from 'node:assert/strict';
import test from 'node:test';

import {computeMd5} from '../../src/assets/md5.ts';
import {packageSb3} from '../../src/sb3/sb3Packager.ts';
import {unzipStored} from '../../src/sb3/zip.ts';
import {
    PHASE7_FIXTURE_NAMES,
    createPhase7Fixture
} from '../fixtures/phase7SampleProjects.ts';
import {readPhase7AssetBytes} from '../fixtures/phase7SampleAssets.ts';

for (const name of PHASE7_FIXTURE_NAMES) {
    test(`Phase 7 fixture "${name}" packages every referenced asset`, () => {
        const project = createPhase7Fixture(name);
        const assets = readPhase7AssetBytes(project);
        const {sb3, projectJson} = packageSb3(project, {assets});
        const files = unzipStored(sb3);
        assert.ok(files.has('project.json'));
        for (const target of projectJson.targets) {
            for (const costume of target.costumes) assert.ok(files.has(costume.md5ext));
            for (const sound of target.sounds) assert.ok(files.has(sound.md5ext));
        }
        for (const asset of project.assets) {
            const bytes = assets.get(asset.md5ext);
            assert.ok(bytes);
            assert.equal(computeMd5(bytes), asset.id);
        }
    });
}

