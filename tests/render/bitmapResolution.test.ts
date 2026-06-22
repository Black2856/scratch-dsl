import assert from 'node:assert/strict';
import test from 'node:test';

import {createCostumeSkin} from '../../src/render/CostumeSkinLoader.ts';
import type {DslCostume} from '../../src/validation/projectValidator.ts';

const costume = (bitmapResolution: number, rcx: number, rcy: number): DslCostume => ({
    id: 'c', name: 'c', assetId: 'a', dataFormat: 'png', md5ext: 'a.png',
    bitmapResolution, rotationCenterX: rcx, rotationCenterY: rcy
});

// Fake AssetManager: only decodeImage is used by createCostumeSkin.
const fakeAssets = {decodeImage: async () => ({width: 960, height: 720})} as never;

test('bitmapResolution 2 yields a 0.5 logical scale and halved rotation center', async () => {
    const skin = await createCostumeSkin(fakeAssets, costume(2, 480, 360));
    assert.equal(skin.scale, 0.5, 'scale = 1 / bitmapResolution');
    assert.equal(skin.rotationCenterX, 240, 'rotation center is native / resolution');
    assert.equal(skin.rotationCenterY, 180);
});

test('bitmapResolution 1 keeps native scale and rotation center', async () => {
    const skin = await createCostumeSkin(fakeAssets, costume(1, 32, 100));
    assert.equal(skin.scale, 1);
    assert.equal(skin.rotationCenterX, 32);
    assert.equal(skin.rotationCenterY, 100);
});

test('missing bitmapResolution defaults to 1', async () => {
    const skin = await createCostumeSkin(fakeAssets, costume(0, 10, 20));
    assert.equal(skin.scale, 1);
    assert.equal(skin.rotationCenterX, 10);
});
