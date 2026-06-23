import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

import type {DslProject} from '../../src/validation/projectValidator.ts';

export const SAMPLE_COSTUME_ASSET_ID = 'c5af1d0eb19ee8b9d16078c7a855efe5';
export const SAMPLE_COSTUME_MD5EXT = `${SAMPLE_COSTUME_ASSET_ID}.png`;
export const SAMPLE_SOUND_ASSET_ID = 'e936fe6c4cd92107ab19bf7d959e2078';
export const SAMPLE_SOUND_MD5EXT = `${SAMPLE_SOUND_ASSET_ID}.mp3`;

// Committed, self-contained fixture assets (repo-root-relative). These replace the
// previously referenced git-ignored workspace files so `npm test` passes on a clean clone.
export const SAMPLE_COSTUME_SOURCE = 'tests/fixtures/assets/sample-costume.png';
export const SAMPLE_SOUND_SOURCE = 'tests/fixtures/assets/sample-sound.mp3';

const sourcePath = (relativePath: string): string =>
    fileURLToPath(new URL(`../../${relativePath.replaceAll('\\', '/')}`, import.meta.url));

export const readPhase7AssetBytes = (project: DslProject): Map<string, Uint8Array> => {
    const known = new Map<string, string>([
        [SAMPLE_COSTUME_MD5EXT, SAMPLE_COSTUME_SOURCE],
        [SAMPLE_SOUND_MD5EXT, SAMPLE_SOUND_SOURCE]
    ]);
    const result = new Map<string, Uint8Array>();
    for (const asset of project.assets) {
        const source = known.get(asset.md5ext);
        if (!source) {
            throw new Error(`No Phase 7 workspace asset source for ${asset.md5ext}.`);
        }
        result.set(asset.md5ext, new Uint8Array(readFileSync(sourcePath(source))));
    }
    return result;
};

