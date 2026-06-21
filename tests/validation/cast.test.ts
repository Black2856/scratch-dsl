import assert from 'node:assert/strict';
import test from 'node:test';

import {Cast, LIST_ALL, LIST_INVALID} from '../../src/cast/Cast.ts';

test('Cast.toNumber follows Scratch NaN behavior', () => {
    assert.equal(Cast.toNumber('not a number'), 0);
    assert.equal(Cast.toNumber(Number.NaN), 0);
    assert.equal(Cast.toNumber(' 42 '), 42);
    assert.equal(Cast.toNumber(''), 0);
});

test('Cast.toBoolean handles Scratch false strings', () => {
    assert.equal(Cast.toBoolean(''), false);
    assert.equal(Cast.toBoolean('0'), false);
    assert.equal(Cast.toBoolean('FALSE'), false);
    assert.equal(Cast.toBoolean('00'), true);
    assert.equal(Cast.toBoolean('hello'), true);
});

test('Cast.compare switches between numeric and case-insensitive string comparison', () => {
    assert.equal(Cast.compare('2', 10) < 0, true);
    assert.equal(Cast.compare('Scratch', 'scratch'), 0);
    assert.equal(Cast.compare(' ', 0) < 0, true);
    assert.equal(Cast.compare(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY), 0);
});

test('Cast.toListIndex supports Scratch special indices', () => {
    assert.equal(Cast.toListIndex('all', 3, true), LIST_ALL);
    assert.equal(Cast.toListIndex('all', 3, false), LIST_INVALID);
    assert.equal(Cast.toListIndex('last', 3, false), 3);
    assert.equal(Cast.toListIndex('last', 0, false), LIST_INVALID);
    assert.equal(Cast.toListIndex('random', 4, false, () => 0.5), 3);
    assert.equal(Cast.toListIndex(1.9, 3, false), 1);
    assert.equal(Cast.toListIndex(0, 3, false), LIST_INVALID);
});
