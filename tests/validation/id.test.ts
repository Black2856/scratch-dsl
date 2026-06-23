import assert from 'node:assert/strict';
import test from 'node:test';

import {findDuplicateIds, generateId, isValidId} from '../../src/model/id.ts';

test('generateId creates a valid deterministic ID with an injected random source', () => {
    const id = generateId(20, () => 0);
    assert.equal(id.length, 20);
    assert.equal(isValidId(id), true);
});

test('ID validation accepts arbitrary non-empty SB3 ids (real-Scratch compatible)', () => {
    assert.equal(isValidId('valid-ID_123'), true);
    // Real Scratch ids: cloud variables (`☁ Name`), name-derived ids, spaces, unicode.
    assert.equal(isValidId('☁ Score'), true);
    assert.equal(isValidId('my variable'), true);
    assert.equal(isValidId('日本語の変数'), true);
    // Only empty or absurdly long strings are rejected.
    assert.equal(isValidId(''), false);
    assert.equal(isValidId('x'.repeat(1025)), false);
    assert.equal(isValidId(42), false);
});

test('duplicate ID reporting retains both declaration paths', () => {
    assert.deepEqual(findDuplicateIds([
        {id: 'same-id', path: '$.first'},
        {id: 'unique-id', path: '$.second'},
        {id: 'same-id', path: '$.third'}
    ]), [{
        id: 'same-id',
        firstPath: '$.first',
        duplicatePath: '$.third'
    }]);
});

