import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

import type {DslProject} from '../../src/validation/projectValidator.ts';

export const SAMPLE_COSTUME_ASSET_ID = '98f6a06942fbc776f5c356f57f8dd323';
export const SAMPLE_COSTUME_MD5EXT = `${SAMPLE_COSTUME_ASSET_ID}.png`;
export const SAMPLE_SOUND_ASSET_ID = 'f6dd6ce46ae68b12085fece5b613a4f6';
export const SAMPLE_SOUND_MD5EXT = `${SAMPLE_SOUND_ASSET_ID}.mp3`;

export const SAMPLE_COSTUME_SOURCE =
    'workspace/test-project/sprite/font/determination/glyphs/c0041.png';
export const SAMPLE_SOUND_SOURCE =
    'workspace/test-project/sound_effect/カーソル移動6.mp3';

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

