import assert from 'node:assert/strict';
import test from 'node:test';

import {
    FENCE_WIDTH,
    computeLocalBounds,
    fencePosition,
    type LocalBounds
} from '../../src/runtime/fencing.ts';

// A small costume scaled up 4x: 18x28 image, centred rotation centre. This is
// the full-feature-minimal-style glyph whose half-width is 36 (= 9 * 4), which
// is what makes "set x to 300" land at 261 in the official editor.
const GLYPH_BOUNDS: LocalBounds = computeLocalBounds(18, 28, 9, 14, 400, 90, "don't rotate");

test('computeLocalBounds gives the transformed rectangle AABB', () => {
    assert.deepEqual(GLYPH_BOUNDS, {left: -36, right: 36, top: 56, bottom: -56});
});

test('set x to 300 is fenced to 261 for a small large-scaled costume', () => {
    assert.deepEqual(fencePosition(300, 0, GLYPH_BOUNDS), [261, 0]);
});

test('fencing is symmetric on the left edge', () => {
    assert.deepEqual(fencePosition(-300, 0, GLYPH_BOUNDS), [-261, 0]);
});

test('top and bottom edges keep the drawable on stage', () => {
    // Stage half-height 180, fence margin 15 -> sy = 165. Moving up clamps on
    // the box's bottom edge (-56), so only ~15px peeks at the top, mirroring
    // the verified x case (set x 300 -> sx - left). This is the y analogue of
    // 261 = 225 - (-36): set y 300 -> 165 - (-56) = 221.
    assert.deepEqual(fencePosition(0, 300, GLYPH_BOUNDS), [0, 221]);
    assert.deepEqual(fencePosition(0, -300, GLYPH_BOUNDS), [0, -221]);
});

test('asymmetric (rotated) AABB clamps y on the correct edge', () => {
    // A box that extends far up (+80) but little down (-10): moving up must
    // keep its bottom edge at sy (165), and moving down its top edge at -165.
    const skewed: LocalBounds = {left: -20, right: 20, top: 80, bottom: -10};
    // inset = floor(min(width=40, height=90)/2) = 20 -> margin min(15,20)=15 -> sy=165.
    assert.deepEqual(fencePosition(0, 300, skewed), [0, 175]); // 165 - (-10)
    assert.deepEqual(fencePosition(0, -300, skewed), [0, -245]); // -165 - 80
});

test('positions inside the fence are unchanged', () => {
    assert.deepEqual(fencePosition(100, 50, GLYPH_BOUNDS), [100, 50]);
    assert.deepEqual(fencePosition(0, 0, GLYPH_BOUNDS), [0, 0]);
});

test('tiny sprites (half-extent < FENCE_WIDTH) may reach the very edge', () => {
    // 10x10 at size 100: half-extent 5 < 15, so inset caps the margin at 5,
    // letting the centre reach x = 240 - 5 + 5 = 240.
    const tiny = computeLocalBounds(10, 10, 5, 5, 100, 90, "don't rotate");
    assert.equal(FENCE_WIDTH, 15);
    assert.deepEqual(fencePosition(300, 0, tiny), [240, 0]);
});

test('rotation widens the bounding box (all around)', () => {
    const upright = computeLocalBounds(40, 20, 20, 10, 100, 90, 'all around');
    const tilted = computeLocalBounds(40, 20, 20, 10, 100, 45, 'all around');
    const uprightWidth = upright.right - upright.left;
    const tiltedWidth = tilted.right - tilted.left;
    assert.ok(tiltedWidth > uprightWidth, 'a 45° rotation should widen the AABB');
});

test('size scales the bounding box linearly', () => {
    const at100 = computeLocalBounds(20, 20, 10, 10, 100, 90, "don't rotate");
    const at200 = computeLocalBounds(20, 20, 10, 10, 200, 90, "don't rotate");
    assert.equal(at200.right, at100.right * 2);
    assert.equal(at200.top, at100.top * 2);
});
