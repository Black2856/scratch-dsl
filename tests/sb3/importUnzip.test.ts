import assert from 'node:assert/strict';
import test from 'node:test';
import {deflateRawSync} from 'node:zlib';

import {inflateRaw, InflateError} from '../../src/sb3/import/inflate.ts';
import {crc32} from '../../src/sb3/zip.ts';
import {unzipSafe, Sb3ZipError, DEFAULT_UNZIP_LIMITS} from '../../src/sb3/import/unzipSafe.ts';

const enc = (text: string): Uint8Array => new TextEncoder().encode(text);

// --- low-level test ZIP builder (mirrors src/sb3/zip.ts, parameterized) -----

interface ZipRecord {
    name: string;
    method: number;
    payload: Uint8Array;   // bytes stored on disk (compressed for method 8)
    crc: number;
    uncompSize: number;
}

const storeRec = (name: string, data: Uint8Array): ZipRecord =>
    ({name, method: 0, payload: data, crc: crc32(data), uncompSize: data.length});

const deflateRec = (name: string, data: Uint8Array): ZipRecord => {
    const payload = new Uint8Array(deflateRawSync(Buffer.from(data)));
    return {name, method: 8, payload, crc: crc32(data), uncompSize: data.length};
};

const buildZipRaw = (records: ZipRecord[]): Uint8Array => {
    const encoder = new TextEncoder();
    const local: Uint8Array[] = [];
    const central: Uint8Array[] = [];
    let offset = 0;

    for (const rec of records) {
        const nameBytes = encoder.encode(rec.name);
        const lh = new Uint8Array(30 + nameBytes.length);
        const lv = new DataView(lh.buffer);
        lv.setUint32(0, 0x04034b50, true);
        lv.setUint16(4, 20, true);
        lv.setUint16(6, 0, true);
        lv.setUint16(8, rec.method, true);
        lv.setUint32(14, rec.crc, true);
        lv.setUint32(18, rec.payload.length, true);
        lv.setUint32(22, rec.uncompSize, true);
        lv.setUint16(26, nameBytes.length, true);
        lh.set(nameBytes, 30);
        local.push(lh, rec.payload);

        const ch = new Uint8Array(46 + nameBytes.length);
        const cv = new DataView(ch.buffer);
        cv.setUint32(0, 0x02014b50, true);
        cv.setUint16(4, 20, true);
        cv.setUint16(6, 20, true);
        cv.setUint16(10, rec.method, true);
        cv.setUint32(16, rec.crc, true);
        cv.setUint32(20, rec.payload.length, true);
        cv.setUint32(24, rec.uncompSize, true);
        cv.setUint16(28, nameBytes.length, true);
        cv.setUint32(42, offset, true);
        ch.set(nameBytes, 46);
        central.push(ch);

        offset += lh.length + rec.payload.length;
    }

    const centralSize = central.reduce((s, c) => s + c.length, 0);
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, records.length, true);
    ev.setUint16(10, records.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);

    const chunks = [...local, ...central, eocd];
    const total = chunks.reduce((s, c) => s + c.length, 0);
    const out = new Uint8Array(total);
    let p = 0;
    for (const c of chunks) {
        out.set(c, p);
        p += c.length;
    }
    return out;
};

// --- inflateRaw correctness vs node:zlib ------------------------------------

test('inflateRaw reverses node:zlib raw deflate for varied inputs', () => {
    const cases: Uint8Array[] = [
        new Uint8Array(0),
        enc('a'),
        enc('hello world'),
        enc('ab'.repeat(5000)),                       // heavy back-references
        enc(JSON.stringify({targets: Array.from({length: 200}, (_, i) => ({name: `s${i}`, blocks: {}})), monitors: []})),
        Uint8Array.from({length: 4096}, (_, i) => (i * 2654435761) & 0xff) // pseudo-random bytes
    ];
    for (const original of cases) {
        const deflated = new Uint8Array(deflateRawSync(Buffer.from(original)));
        const restored = inflateRaw(deflated);
        assert.deepEqual([...restored], [...original], `roundtrip len=${original.length}`);
    }
});

test('inflateRaw handles stored (BTYPE=0) deflate blocks', () => {
    const original = enc('uncompressed stored block payload');
    const deflated = new Uint8Array(deflateRawSync(Buffer.from(original), {level: 0}));
    assert.deepEqual([...inflateRaw(deflated)], [...original]);
});

test('inflateRaw throws on truncated stream', () => {
    const deflated = new Uint8Array(deflateRawSync(Buffer.from(enc('abc'.repeat(1000)))));
    assert.throws(() => inflateRaw(deflated.subarray(0, 3)), (e: unknown) => e instanceof InflateError);
});

// --- unzipSafe: STORE + DEFLATE round-trips ---------------------------------

test('unzipSafe extracts STORE entries', () => {
    const files = unzipSafe(buildZipRaw([
        storeRec('project.json', enc('{"ok":true}')),
        storeRec('assets/a.svg', enc('<svg/>'))
    ]));
    assert.equal(new TextDecoder().decode(files.get('project.json')), '{"ok":true}');
    assert.equal(new TextDecoder().decode(files.get('assets/a.svg')), '<svg/>');
});

test('unzipSafe extracts DEFLATE entries (real sb3 compression)', () => {
    const projectJson = JSON.stringify({targets: [{isStage: true, blocks: {}}], monitors: [], meta: {semver: '3.0.0'}});
    const files = unzipSafe(buildZipRaw([
        deflateRec('project.json', enc(projectJson)),
        deflateRec('big.txt', enc('repeat '.repeat(10000)))
    ]));
    assert.equal(new TextDecoder().decode(files.get('project.json')), projectJson);
    assert.equal(new TextDecoder().decode(files.get('big.txt')), 'repeat '.repeat(10000));
});

test('unzipSafe skips directory entries', () => {
    const files = unzipSafe(buildZipRaw([
        storeRec('assets/', new Uint8Array(0)),
        deflateRec('assets/x.json', enc('{}'))
    ]));
    assert.equal(files.has('assets/'), false);
    assert.equal(new TextDecoder().decode(files.get('assets/x.json')), '{}');
});

// --- unzipSafe: safety rejections -------------------------------------------

const expectCode = (records: ZipRecord[], code: string, limits = DEFAULT_UNZIP_LIMITS): void => {
    assert.throws(() => unzipSafe(buildZipRaw(records), limits), (e: unknown) => e instanceof Sb3ZipError && e.code === code);
};

test('unzipSafe rejects path traversal', () => {
    expectCode([storeRec('../escape.txt', enc('x'))], 'sb3.zip.path-traversal');
    expectCode([storeRec('a/../../escape.txt', enc('x'))], 'sb3.zip.path-traversal');
});

test('unzipSafe rejects absolute and drive-letter paths', () => {
    expectCode([storeRec('/etc/passwd', enc('x'))], 'sb3.zip.absolute-path');
    expectCode([storeRec('C:/windows', enc('x'))], 'sb3.zip.absolute-path');
});

test('unzipSafe rejects backslash names', () => {
    expectCode([storeRec('a\\b.txt', enc('x'))], 'sb3.zip.bad-name');
});

test('unzipSafe rejects duplicate entries', () => {
    expectCode([storeRec('dup.txt', enc('a')), storeRec('dup.txt', enc('b'))], 'sb3.zip.duplicate-entry');
});

test('unzipSafe enforces entry-count limit', () => {
    expectCode([storeRec('a', enc('a')), storeRec('b', enc('b'))], 'sb3.zip.too-many-entries',
        {...DEFAULT_UNZIP_LIMITS, maxEntries: 1});
});

test('unzipSafe enforces per-entry size limit', () => {
    expectCode([storeRec('big', enc('x'.repeat(100)))], 'sb3.zip.entry-too-large',
        {...DEFAULT_UNZIP_LIMITS, maxEntryBytes: 10});
});

test('unzipSafe enforces total size limit', () => {
    expectCode([storeRec('a', enc('x'.repeat(8))), storeRec('b', enc('y'.repeat(8)))], 'sb3.zip.total-too-large',
        {...DEFAULT_UNZIP_LIMITS, maxTotalBytes: 10});
});

test('unzipSafe rejects unsupported compression method', () => {
    const rec = storeRec('x', enc('data'));
    expectCode([{...rec, method: 99}], 'sb3.zip.method-unsupported');
});

test('unzipSafe detects CRC mismatch', () => {
    const rec = storeRec('x', enc('data'));
    expectCode([{...rec, crc: (rec.crc ^ 0xffff) >>> 0}], 'sb3.zip.crc-mismatch');
});

test('unzipSafe detects declared-size mismatch', () => {
    const rec = deflateRec('x', enc('data'));
    expectCode([{...rec, uncompSize: rec.uncompSize + 5}], 'sb3.zip.size-mismatch');
});

test('unzipSafe rejects non-zip input', () => {
    assert.throws(() => unzipSafe(enc('not a zip at all')), (e: unknown) => e instanceof Sb3ZipError && e.code === 'sb3.zip.not-a-zip');
});
