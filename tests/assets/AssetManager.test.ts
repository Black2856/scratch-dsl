import assert from 'node:assert/strict';
import test from 'node:test';

import {AssetManager} from '../../src/assets/AssetManager.ts';
import type {AssetRecord} from '../../src/assets/types.ts';

const bytes = new TextEncoder().encode('abc');

const costumeRecord = (): AssetRecord => ({
    assetId: '900150983cd24fb0d6963f7d28e17f72',
    md5ext: '900150983cd24fb0d6963f7d28e17f72.svg',
    dataFormat: 'svg',
    kind: 'costume',
    mimeType: 'image/svg+xml',
    status: 'ready',
    source: 'test',
    bytes
});

const soundRecord = (): AssetRecord => ({
    assetId: 'sound-id',
    md5ext: 'sound-id.wav',
    dataFormat: 'wav',
    kind: 'sound',
    mimeType: 'audio/wav',
    status: 'ready',
    source: 'test',
    bytes: new Uint8Array([1, 2, 3])
});

test('create generates an MD5 assetId and manages complete record metadata', () => {
    const manager = new AssetManager();
    const record = manager.create({
        bytes,
        dataFormat: 'svg',
        kind: 'costume',
        mimeType: 'image/svg+xml',
        source: 'upload'
    });

    assert.equal(record.assetId, '900150983cd24fb0d6963f7d28e17f72');
    assert.equal(record.md5ext, '900150983cd24fb0d6963f7d28e17f72.svg');
    assert.equal(record.status, 'ready');
    assert.deepEqual(manager.get(record.assetId), record);
});

test('records and snapshots clone bytes and never contain decode cache state', async () => {
    const manager = new AssetManager([costumeRecord()], {
        image: {decode: () => ({width: 10})}
    });
    await manager.decodeImage(costumeRecord().assetId);

    const record = manager.get(costumeRecord().assetId);
    assert.ok(record);
    record.bytes[0] = 255;
    assert.equal(manager.get(costumeRecord().assetId)?.bytes[0], bytes[0]);

    const snapshot = manager.toSnapshot();
    assert.deepEqual(Object.keys(snapshot), ['assets']);
    assert.deepEqual(snapshot.assets, [costumeRecord()]);
});

test('decodeImage deduplicates concurrent and later decode calls', async () => {
    let calls = 0;
    let release: (() => void) | undefined;
    const gate = new Promise<void>(resolve => {
        release = resolve;
    });
    const decoded = {width: 20};
    const manager = new AssetManager<object>([costumeRecord()], {
        image: {
            decode: async () => {
                calls++;
                await gate;
                return decoded;
            }
        }
    });

    const first = manager.decodeImage(costumeRecord().assetId);
    const second = manager.decodeImage(costumeRecord().assetId);
    assert.strictEqual(first, second);
    release?.();
    assert.strictEqual(await first, decoded);
    assert.strictEqual(await manager.decodeImage(costumeRecord().assetId), decoded);
    assert.equal(calls, 1);
});

test('failed decodes are evicted so a later call can retry', async () => {
    let calls = 0;
    const manager = new AssetManager([costumeRecord()], {
        image: {
            decode: () => {
                calls++;
                if (calls === 1) throw new Error('decode failed');
                return 'decoded';
            }
        }
    });

    await assert.rejects(manager.decodeImage(costumeRecord().assetId), /decode failed/);
    assert.equal(await manager.decodeImage(costumeRecord().assetId), 'decoded');
    assert.equal(calls, 2);
});

test('replacing a record invalidates its decode cache', async () => {
    let calls = 0;
    const manager = new AssetManager([costumeRecord()], {
        image: {decode: record => `${record.source}-${++calls}`}
    });

    assert.equal(await manager.decodeImage(costumeRecord().assetId), 'test-1');
    manager.set({...costumeRecord(), source: 'updated'});
    assert.equal(await manager.decodeImage(costumeRecord().assetId), 'updated-2');
});

test('decodeSound caches through an injected sound decoder', async () => {
    let calls = 0;
    const manager = new AssetManager<unknown, string>([soundRecord()], {
        sound: {
            decode: record => `${record.mimeType}-${++calls}`
        }
    });

    assert.equal(await manager.decodeSound(soundRecord().assetId), 'audio/wav-1');
    assert.equal(await manager.decodeSound(soundRecord().assetId), 'audio/wav-1');
    assert.equal(calls, 1);
});

test('fromSnapshot restores records without restoring decode cache', async () => {
    let calls = 0;
    const original = new AssetManager([costumeRecord()], {
        image: {decode: () => `original-${++calls}`}
    });
    assert.equal(await original.decodeImage(costumeRecord().assetId), 'original-1');

    const restored = AssetManager.fromSnapshot(original.toSnapshot(), {
        image: {decode: () => `restored-${++calls}`}
    });
    assert.equal(await restored.decodeImage(costumeRecord().assetId), 'restored-2');
});

test('decode methods enforce kind and configured decoder', async () => {
    const manager = new AssetManager([costumeRecord()]);
    await assert.rejects(manager.decodeImage(costumeRecord().assetId), /No image decoder/);
    assert.throws(() => manager.decodeSound(costumeRecord().assetId), /expected sound/);
    assert.throws(() => manager.decodeImage('missing'), /does not exist/);
});

test('load deduplicates requests and transitions unloaded assets to ready', async () => {
    const manager = new AssetManager();
    manager.register({
        assetId: 'loaded-asset',
        md5ext: 'loaded-asset.png',
        dataFormat: 'png',
        kind: 'costume'
    }, 'image/png', 'remote');
    let calls = 0;
    const loader = {
        load: async () => {
            calls++;
            await Promise.resolve();
            return {
                bytes: new Uint8Array([4, 5, 6]),
                mimeType: 'image/png',
                source: 'memory'
            };
        }
    };

    const first = manager.load('loaded-asset', loader);
    const second = manager.load('loaded-asset', loader);
    assert.strictEqual(first, second);
    assert.equal(manager.get('loaded-asset')?.status, 'loading');

    const loaded = await first;
    assert.equal(calls, 1);
    assert.equal(loaded.status, 'ready');
    assert.deepEqual(loaded.bytes, new Uint8Array([4, 5, 6]));
    assert.equal(loaded.source, 'memory');
});

test('load records error status and permits retry', async () => {
    const manager = new AssetManager();
    manager.register({
        assetId: 'retry-asset',
        md5ext: 'retry-asset.wav',
        dataFormat: 'wav',
        kind: 'sound'
    }, 'audio/wav');
    let calls = 0;
    const loader = {
        load: async () => {
            calls++;
            if (calls === 1) throw new Error('network failed');
            return {bytes: new Uint8Array([1]), mimeType: 'audio/wav'};
        }
    };

    await assert.rejects(manager.load('retry-asset', loader), /network failed/);
    assert.equal(manager.get('retry-asset')?.status, 'error');
    assert.equal((await manager.load('retry-asset', loader)).status, 'ready');
});
