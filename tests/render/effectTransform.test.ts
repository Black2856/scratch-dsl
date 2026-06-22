import assert from 'node:assert/strict';
import test from 'node:test';

import {
    applyColorBrightness,
    colorUniform,
    brightnessUniform
} from '../../src/render/effectTransform.ts';

const px = (r: number, g: number, b: number, a = 255): Uint8ClampedArray =>
    new Uint8ClampedArray([r, g, b, a]);

test('uniform converters match scratch-render', () => {
    assert.equal(colorUniform(100), 0.5, 'color 100 -> 0.5 hue');
    assert.equal(colorUniform(200), 0, 'color 200 wraps to 0');
    assert.equal(brightnessUniform(50), 0.5);
    assert.equal(brightnessUniform(250), 1, 'brightness clamps to 1');
    assert.equal(brightnessUniform(-250), -1);
});

test('color effect 100 rotates red to cyan', () => {
    const data = px(255, 0, 0);
    applyColorBrightness(data, true, false, colorUniform(100), 0);
    assert.ok(data[0] <= 2, `red channel near 0 (got ${data[0]})`);
    assert.ok(data[1] >= 253, `green channel near 255 (got ${data[1]})`);
    assert.ok(data[2] >= 253, `blue channel near 255 (got ${data[2]})`);
    assert.equal(data[3], 255, 'alpha untouched by color effect');
});

test('brightness effect adds to each channel and clamps', () => {
    const data = px(100, 100, 100);
    applyColorBrightness(data, false, true, 0, brightnessUniform(50)); // +127.5
    assert.ok(Math.abs(data[0] - 228) <= 1, 'channels brightened by ~127');
    const dark = px(10, 10, 10);
    applyColorBrightness(dark, false, true, 0, brightnessUniform(-50)); // -127.5 -> clamp 0
    assert.equal(dark[0], 0);
});

test('fully transparent pixels are skipped', () => {
    const data = px(123, 45, 67, 0);
    applyColorBrightness(data, true, true, colorUniform(100), brightnessUniform(100));
    assert.deepEqual([...data], [123, 45, 67, 0], 'unchanged when alpha is 0');
});
