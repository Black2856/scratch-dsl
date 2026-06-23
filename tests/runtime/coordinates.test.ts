import assert from 'node:assert/strict';
import test from 'node:test';

import {
    scratchToCanvas,
    canvasToScratch,
    clientToScratch,
    directionToRadians,
    sortByLayer,
    STAGE_WIDTH,
    STAGE_HEIGHT
} from '../../src/runtime/coordinates.ts';

test('scratchToCanvas maps the Scratch origin to the canvas center', () => {
    assert.deepEqual(scratchToCanvas(0, 0), {x: 240, y: 180});
});

test('scratchToCanvas and canvasToScratch are inverses across the stage range', () => {
    const samples: Array<[number, number]> = [
        [0, 0],
        [-240, 180],
        [240, -180],
        [120.5, -75.25],
        [-1, 1]
    ];
    for (const [x, y] of samples) {
        const canvas = scratchToCanvas(x, y);
        const back = canvasToScratch(canvas.x, canvas.y);
        assert.equal(back.x, x);
        assert.equal(back.y, y);
    }
});

test('canvasToScratch maps the four canvas corners to the expected stage corners', () => {
    assert.deepEqual(canvasToScratch(0, 0), {x: -STAGE_WIDTH / 2, y: STAGE_HEIGHT / 2});
    assert.deepEqual(canvasToScratch(STAGE_WIDTH, STAGE_HEIGHT), {x: STAGE_WIDTH / 2, y: -STAGE_HEIGHT / 2});
});

test('clientToScratch at 1x CSS scale matches canvasToScratch directly', () => {
    const rect = {left: 0, top: 0, width: STAGE_WIDTH, height: STAGE_HEIGHT};
    const result = clientToScratch(240, 180, rect);
    assert.deepEqual(result, canvasToScratch(240, 180));
});

test('clientToScratch normalizes 2x CSS-scaled canvases back to native stage coordinates', () => {
    const rect = {left: 100, top: 50, width: STAGE_WIDTH * 2, height: STAGE_HEIGHT * 2};
    // Client point at the scaled canvas's center should map to the Scratch origin.
    const center = clientToScratch(100 + STAGE_WIDTH, 50 + STAGE_HEIGHT, rect);
    assert.equal(center.x, 0);
    assert.equal(center.y, 0);

    // Client point at the scaled canvas's top-left should map to the top-left stage corner.
    const topLeft = clientToScratch(100, 50, rect);
    assert.equal(topLeft.x, -STAGE_WIDTH / 2);
    assert.equal(topLeft.y, STAGE_HEIGHT / 2);
});

test('clientToScratch accounts for a non-zero rect offset', () => {
    const rect = {left: 50, top: 20, width: STAGE_WIDTH, height: STAGE_HEIGHT};
    const result = clientToScratch(50 + 240, 20 + 180, rect);
    assert.deepEqual(result, {x: 0, y: 0});
});

test('directionToRadians converts Scratch direction (0=up, 90=right, clockwise) to canvas rotation radians', () => {
    assert.equal(directionToRadians(90), 0);
    assert.equal(directionToRadians(0), -Math.PI / 2);
    assert.equal(directionToRadians(180), Math.PI / 2);
    assert.ok(Math.abs(directionToRadians(270) - Math.PI) < 1e-9);
});

test('sortByLayer orders ascending by layerOrder (back to front)', () => {
    const items = [
        {id: 'c', layerOrder: 3},
        {id: 'a', layerOrder: 1},
        {id: 'b', layerOrder: 2}
    ];
    assert.deepEqual(sortByLayer(items).map(i => i.id), ['a', 'b', 'c']);
});

test('sortByLayer is stable for equal layerOrder values', () => {
    const items = [
        {id: 'stage', layerOrder: 0},
        {id: 'first', layerOrder: 5},
        {id: 'second', layerOrder: 5},
        {id: 'third', layerOrder: 5}
    ];
    assert.deepEqual(sortByLayer(items).map(i => i.id), ['stage', 'first', 'second', 'third']);
});
