import assert from 'node:assert/strict';
import test from 'node:test';

import {
    validateAssetBytes,
    validateAssetRecords,
    validateAssetReferences
} from '../../src/assets/validation.ts';
import type {AssetRecord, AssetRef} from '../../src/assets/types.ts';

const record: AssetRecord = {
    assetId: '900150983cd24fb0d6963f7d28e17f72',
    md5ext: '900150983cd24fb0d6963f7d28e17f72.svg',
    dataFormat: 'svg',
    kind: 'costume',
    mimeType: 'image/svg+xml',
    status: 'ready',
    source: 'test',
    bytes: new TextEncoder().encode('abc')
};

test('validateAssetRecords rejects duplicate IDs and malformed md5ext', () => {
    const malformed = {...record, md5ext: 'wrong.svg'};
    const diagnostics = validateAssetRecords([record, malformed]);
    assert.deepEqual(
        diagnostics.map(item => item.code),
        ['asset.id-duplicate', 'asset.md5ext-mismatch']
    );
});

test('validateAssetReferences accepts a matching reference', () => {
    const reference: AssetRef = {
        assetId: record.assetId,
        md5ext: record.md5ext,
        dataFormat: record.dataFormat,
        kind: record.kind
    };
    assert.deepEqual(validateAssetReferences([record], [reference]), []);
});

test('validateAssetReferences reports dangling and mismatched references', () => {
    const dangling: AssetRef = {
        assetId: 'missing',
        md5ext: 'missing.wav',
        dataFormat: 'wav',
        kind: 'sound'
    };
    const mismatch: AssetRef = {
        assetId: record.assetId,
        md5ext: record.md5ext,
        dataFormat: record.dataFormat,
        kind: 'sound'
    };
    assert.deepEqual(
        validateAssetReferences([record], [dangling, mismatch]).map(item => item.code),
        ['asset.reference-dangling', 'asset.reference-mismatch']
    );
});

test('validateAssetBytes compares bytes with assetId', () => {
    assert.deepEqual(validateAssetBytes(record), []);
    assert.equal(
        validateAssetBytes({...record, bytes: new TextEncoder().encode('changed')})[0].code,
        'asset.hash-mismatch'
    );
});
