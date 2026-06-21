import assert from 'node:assert/strict';
import test from 'node:test';

import {findDuplicateIds, generateId, isValidId} from '../../src/model/id.ts';

test('generateId creates a valid deterministic ID with an injected random source', () => {
    const id = generateId(20, () => 0);
    assert.equal(id.length, 20);
    assert.equal(isValidId(id), true);
});

test('ID validation rejects XML-unsafe and control characters', () => {
    assert.equal(isValidId('valid-ID_123'), true);
    assert.equal(isValidId('contains space'), false);
    assert.equal(isValidId('contains<angle'), false);
    assert.equal(isValidId(''), false);
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

