import assert from 'node:assert/strict';
import test from 'node:test';

import {computeMd5} from '../../src/assets/md5.ts';

const encode = (value: string): Uint8Array => new TextEncoder().encode(value);

test('computeMd5 matches standard MD5 test vectors', () => {
    assert.equal(computeMd5(encode('')), 'd41d8cd98f00b204e9800998ecf8427e');
    assert.equal(computeMd5(encode('a')), '0cc175b9c0f1b6a831c399e269772661');
    assert.equal(computeMd5(encode('abc')), '900150983cd24fb0d6963f7d28e17f72');
    assert.equal(
        computeMd5(encode('The quick brown fox jumps over the lazy dog')),
        '9e107d9d372bb6826bd81d3542a419d6'
    );
});

test('computeMd5 accepts arbitrary binary bytes', () => {
    assert.equal(
        computeMd5(new Uint8Array([0, 1, 2, 3, 254, 255])),
        '03d7c0cbcad34b0bcace4967ca60a08c'
    );
});
