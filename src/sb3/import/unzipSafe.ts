/**
 * Safe ZIP extraction for SB3 import.
 *
 * Unlike the export-side `unzipStored` (STORE only, no safety limits — built
 * for our own archives in tests), this reads untrusted `.sb3` input: it
 * supports STORE (method 0) and DEFLATE (method 8), enforces entry-count and
 * size limits, rejects path traversal / absolute paths / duplicate names, and
 * verifies each entry's CRC-32 and uncompressed size against the central
 * directory. Returns decoded bytes per entry; the caller (parseProject) reads
 * `project.json` and registers asset bytes.
 */

import {crc32} from '../zip.ts';
import {inflateRaw, InflateError} from './inflate.ts';

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;

const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;

export interface UnzipLimits {
    /** Maximum number of archive entries. */
    maxEntries: number;
    /** Maximum uncompressed size of a single entry, in bytes. */
    maxEntryBytes: number;
    /** Maximum total uncompressed size across all entries, in bytes. */
    maxTotalBytes: number;
}

/** Generous defaults sized for real Scratch projects, still bounding zip bombs. */
export const DEFAULT_UNZIP_LIMITS: UnzipLimits = {
    maxEntries: 10_000,
    maxEntryBytes: 100 * 1024 * 1024,
    maxTotalBytes: 500 * 1024 * 1024
};

export class Sb3ZipError extends Error {
    code: string;
    entry: string | null;
    constructor(code: string, message: string, entry: string | null = null) {
        super(message);
        this.name = 'Sb3ZipError';
        this.code = code;
        this.entry = entry;
    }
}

/** Rejects entry names that could escape the extraction root or are malformed. */
const assertSafeName = (name: string): void => {
    if (name.length === 0) throw new Sb3ZipError('sb3.zip.empty-name', 'Archive entry has an empty name.');
    if (name.includes('\0')) throw new Sb3ZipError('sb3.zip.bad-name', 'Archive entry name contains NUL.', name);
    if (name.includes('\\')) throw new Sb3ZipError('sb3.zip.bad-name', 'Archive entry name contains a backslash.', name);
    if (name.startsWith('/')) throw new Sb3ZipError('sb3.zip.absolute-path', 'Archive entry uses an absolute path.', name);
    if (/^[a-zA-Z]:/.test(name)) throw new Sb3ZipError('sb3.zip.absolute-path', 'Archive entry uses a drive-letter path.', name);
    for (const segment of name.split('/')) {
        if (segment === '..') throw new Sb3ZipError('sb3.zip.path-traversal', 'Archive entry escapes the root with "..".', name);
    }
};

const findEocd = (view: DataView, length: number): number => {
    // EOCD is 22 bytes minimum; scan backward (no archive comment expected in sb3).
    for (let i = length - 22; i >= 0; i--) {
        if (view.getUint32(i, true) === EOCD_SIG) return i;
    }
    throw new Sb3ZipError('sb3.zip.not-a-zip', 'Missing end-of-central-directory record.');
};

/**
 * Extracts a `.sb3`/ZIP archive into a `name → bytes` map with safety checks.
 * Throws {@link Sb3ZipError} on any structural or safety violation.
 */
export const unzipSafe = (buffer: Uint8Array, limits: UnzipLimits = DEFAULT_UNZIP_LIMITS): Map<string, Uint8Array> => {
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const eocd = findEocd(view, buffer.length);

    const count = view.getUint16(eocd + 10, true);
    if (count > limits.maxEntries) {
        throw new Sb3ZipError('sb3.zip.too-many-entries', `Archive has ${count} entries, over the limit of ${limits.maxEntries}.`);
    }
    let cdOffset = view.getUint32(eocd + 16, true);
    const decoder = new TextDecoder('utf-8', {fatal: false});
    const entries = new Map<string, Uint8Array>();
    let totalBytes = 0;

    for (let n = 0; n < count; n++) {
        if (cdOffset + 46 > buffer.length || view.getUint32(cdOffset, true) !== CENTRAL_SIG) {
            throw new Sb3ZipError('sb3.zip.corrupt-central', 'Bad central directory signature.');
        }
        const method = view.getUint16(cdOffset + 10, true);
        const crcExpected = view.getUint32(cdOffset + 16, true);
        const compSize = view.getUint32(cdOffset + 20, true);
        const uncompSize = view.getUint32(cdOffset + 24, true);
        const nameLen = view.getUint16(cdOffset + 28, true);
        const extraLen = view.getUint16(cdOffset + 30, true);
        const commentLen = view.getUint16(cdOffset + 32, true);
        const localOffset = view.getUint32(cdOffset + 42, true);
        const name = decoder.decode(buffer.subarray(cdOffset + 46, cdOffset + 46 + nameLen));

        // Directory entries (trailing slash) carry no data; skip them safely.
        const isDirectory = name.endsWith('/');
        if (!isDirectory) {
            assertSafeName(name);
            if (entries.has(name)) throw new Sb3ZipError('sb3.zip.duplicate-entry', 'Duplicate archive entry.', name);
            if (uncompSize > limits.maxEntryBytes) {
                throw new Sb3ZipError('sb3.zip.entry-too-large', `Entry exceeds ${limits.maxEntryBytes} bytes.`, name);
            }
            totalBytes += uncompSize;
            if (totalBytes > limits.maxTotalBytes) {
                throw new Sb3ZipError('sb3.zip.total-too-large', `Total uncompressed size exceeds ${limits.maxTotalBytes} bytes.`, name);
            }

            if (localOffset + 30 > buffer.length || view.getUint32(localOffset, true) !== LOCAL_SIG) {
                throw new Sb3ZipError('sb3.zip.corrupt-local', 'Bad local file header.', name);
            }
            const localNameLen = view.getUint16(localOffset + 26, true);
            const localExtraLen = view.getUint16(localOffset + 28, true);
            const dataStart = localOffset + 30 + localNameLen + localExtraLen;
            const compressed = buffer.subarray(dataStart, dataStart + compSize);

            let data: Uint8Array;
            if (method === METHOD_STORE) {
                data = compressed.slice();
            } else if (method === METHOD_DEFLATE) {
                try {
                    data = inflateRaw(compressed);
                } catch (error) {
                    const detail = error instanceof InflateError ? error.code : String(error);
                    throw new Sb3ZipError('sb3.zip.inflate-failed', `Inflate failed (${detail}).`, name);
                }
            } else {
                throw new Sb3ZipError('sb3.zip.method-unsupported', `Unsupported compression method ${method}.`, name);
            }

            if (data.length !== uncompSize) {
                throw new Sb3ZipError('sb3.zip.size-mismatch', `Decompressed size ${data.length} != expected ${uncompSize}.`, name);
            }
            if (crc32(data) !== crcExpected) {
                throw new Sb3ZipError('sb3.zip.crc-mismatch', 'CRC-32 mismatch after decompression.', name);
            }
            entries.set(name, data);
        }

        cdOffset += 46 + nameLen + extraLen + commentLen;
    }

    return entries;
};
