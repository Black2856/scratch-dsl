/**
 * Dependency-free raw DEFLATE (RFC 1951) decompressor for SB3 import.
 *
 * The export-side `zip.ts` only writes STORE entries, but real `.sb3` files
 * saved by the Scratch GUI / scratch-vm (JSZip) use DEFLATE. Import therefore
 * needs an inflate. Kept portable (Uint8Array only, no `node:zlib`) to match
 * the project's "no heavyweight libraries, browser-safe" constraint, and
 * verified in tests against `node:zlib`-produced deflate streams.
 *
 * This implements raw DEFLATE only (no zlib/gzip header). ZIP method 8 stores
 * raw deflate streams, so `unzipSafe` feeds entry bytes here directly.
 */

const MAX_BITS = 15;

// Length codes 257..285: base length and extra bits (RFC 1951 §3.2.5).
const LENGTH_BASE = [
    3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59,
    67, 83, 99, 115, 131, 163, 195, 227, 258
];
const LENGTH_EXTRA = [
    0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3,
    4, 4, 4, 4, 5, 5, 5, 5, 0
];
// Distance codes 0..29: base distance and extra bits.
const DIST_BASE = [
    1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513,
    769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577
];
const DIST_EXTRA = [
    0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8,
    9, 9, 10, 10, 11, 11, 12, 12, 13, 13
];
// Order in which code-length-code lengths appear in a dynamic block.
const CLCL_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

export class InflateError extends Error {
    code: string;
    constructor(code: string, message: string) {
        super(message);
        this.name = 'InflateError';
        this.code = code;
    }
}

/** LSB-first bit reader over a byte array. */
class BitReader {
    private readonly bytes: Uint8Array;
    private pos = 0;
    private bitBuffer = 0;
    private bitCount = 0;

    constructor(bytes: Uint8Array) {
        this.bytes = bytes;
    }

    getBit(): number {
        if (this.bitCount === 0) {
            if (this.pos >= this.bytes.length) throw new InflateError('deflate.eof', 'Unexpected end of deflate stream.');
            this.bitBuffer = this.bytes[this.pos++];
            this.bitCount = 8;
        }
        const bit = this.bitBuffer & 1;
        this.bitBuffer >>= 1;
        this.bitCount--;
        return bit;
    }

    getBits(count: number): number {
        let value = 0;
        for (let i = 0; i < count; i++) value |= this.getBit() << i;
        return value;
    }

    /** Discards the partial bit buffer and returns to byte alignment. */
    alignToByte(): void {
        this.bitBuffer = 0;
        this.bitCount = 0;
    }

    readByte(): number {
        if (this.pos >= this.bytes.length) throw new InflateError('deflate.eof', 'Unexpected end of deflate stream.');
        return this.bytes[this.pos++];
    }
}

interface Huffman {
    /** count[len] = number of codes of that bit length. */
    count: Int32Array;
    /** symbols ordered by (length, value) for canonical decoding. */
    symbol: Int32Array;
}

/** Builds a canonical Huffman table from per-symbol code lengths. */
const buildHuffman = (lengths: number[] | Int32Array, n: number): Huffman => {
    const count = new Int32Array(MAX_BITS + 1);
    for (let i = 0; i < n; i++) count[lengths[i]]++;
    count[0] = 0;

    const offsets = new Int32Array(MAX_BITS + 1);
    for (let len = 1; len < MAX_BITS; len++) offsets[len + 1] = offsets[len] + count[len];

    const symbol = new Int32Array(n);
    for (let i = 0; i < n; i++) {
        if (lengths[i] !== 0) symbol[offsets[lengths[i]]++] = i;
    }
    return {count, symbol};
};

/** Decodes one symbol using the canonical (length, code) walk. */
const decodeSymbol = (reader: BitReader, table: Huffman): number => {
    let code = 0;
    let first = 0;
    let index = 0;
    for (let len = 1; len <= MAX_BITS; len++) {
        code |= reader.getBit();
        const count = table.count[len];
        if (code - first < count) return table.symbol[index + (code - first)];
        index += count;
        first += count;
        first <<= 1;
        code <<= 1;
    }
    throw new InflateError('deflate.bad-code', 'Invalid Huffman code in deflate stream.');
};

/** Growable output buffer supporting LZ77 back-reference copies. */
class OutputBuffer {
    private buffer: Uint8Array;
    private length = 0;

    constructor(initialCapacity = 1 << 16) {
        this.buffer = new Uint8Array(initialCapacity);
    }

    private ensure(extra: number): void {
        if (this.length + extra <= this.buffer.length) return;
        let capacity = this.buffer.length;
        while (capacity < this.length + extra) capacity *= 2;
        const next = new Uint8Array(capacity);
        next.set(this.buffer.subarray(0, this.length));
        this.buffer = next;
    }

    pushByte(byte: number): void {
        this.ensure(1);
        this.buffer[this.length++] = byte;
    }

    pushBytes(bytes: Uint8Array): void {
        this.ensure(bytes.length);
        this.buffer.set(bytes, this.length);
        this.length += bytes.length;
    }

    copyBackReference(distance: number, count: number): void {
        if (distance > this.length) throw new InflateError('deflate.bad-distance', 'Back-reference distance exceeds output.');
        this.ensure(count);
        let src = this.length - distance;
        for (let i = 0; i < count; i++) this.buffer[this.length++] = this.buffer[src++];
    }

    toUint8Array(): Uint8Array {
        return this.buffer.slice(0, this.length);
    }
}

const FIXED_LITERAL_LENGTHS = (() => {
    const lengths = new Int32Array(288);
    for (let i = 0; i <= 143; i++) lengths[i] = 8;
    for (let i = 144; i <= 255; i++) lengths[i] = 9;
    for (let i = 256; i <= 279; i++) lengths[i] = 7;
    for (let i = 280; i <= 287; i++) lengths[i] = 8;
    return lengths;
})();
const FIXED_DISTANCE_LENGTHS = (() => {
    const lengths = new Int32Array(30);
    lengths.fill(5);
    return lengths;
})();

const inflateStoredBlock = (reader: BitReader, out: OutputBuffer): void => {
    reader.alignToByte();
    const len = reader.readByte() | (reader.readByte() << 8);
    const nlen = reader.readByte() | (reader.readByte() << 8);
    if ((len ^ 0xffff) !== nlen) throw new InflateError('deflate.bad-stored-len', 'Stored block length check failed.');
    for (let i = 0; i < len; i++) out.pushByte(reader.readByte());
};

const inflateHuffmanBlock = (reader: BitReader, out: OutputBuffer, literals: Huffman, distances: Huffman): void => {
    for (;;) {
        const symbol = decodeSymbol(reader, literals);
        if (symbol === 256) return;
        if (symbol < 256) {
            out.pushByte(symbol);
            continue;
        }
        const lengthIndex = symbol - 257;
        if (lengthIndex >= LENGTH_BASE.length) throw new InflateError('deflate.bad-length-code', 'Invalid length code.');
        const length = LENGTH_BASE[lengthIndex] + reader.getBits(LENGTH_EXTRA[lengthIndex]);
        const distSymbol = decodeSymbol(reader, distances);
        if (distSymbol >= DIST_BASE.length) throw new InflateError('deflate.bad-distance-code', 'Invalid distance code.');
        const distance = DIST_BASE[distSymbol] + reader.getBits(DIST_EXTRA[distSymbol]);
        out.copyBackReference(distance, length);
    }
};

const readDynamicTables = (reader: BitReader): {literals: Huffman; distances: Huffman} => {
    const hlit = reader.getBits(5) + 257;
    const hdist = reader.getBits(5) + 1;
    const hclen = reader.getBits(4) + 4;

    const clcLengths = new Int32Array(19);
    for (let i = 0; i < hclen; i++) clcLengths[CLCL_ORDER[i]] = reader.getBits(3);
    const clcTable = buildHuffman(clcLengths, 19);

    const allLengths = new Int32Array(hlit + hdist);
    let i = 0;
    while (i < hlit + hdist) {
        const symbol = decodeSymbol(reader, clcTable);
        if (symbol < 16) {
            allLengths[i++] = symbol;
        } else if (symbol === 16) {
            if (i === 0) throw new InflateError('deflate.bad-repeat', 'Repeat code with no previous length.');
            const repeat = 3 + reader.getBits(2);
            const prev = allLengths[i - 1];
            for (let r = 0; r < repeat && i < allLengths.length; r++) allLengths[i++] = prev;
        } else if (symbol === 17) {
            const repeat = 3 + reader.getBits(3);
            for (let r = 0; r < repeat && i < allLengths.length; r++) allLengths[i++] = 0;
        } else {
            const repeat = 11 + reader.getBits(7);
            for (let r = 0; r < repeat && i < allLengths.length; r++) allLengths[i++] = 0;
        }
    }

    const literals = buildHuffman(allLengths.subarray(0, hlit), hlit);
    const distances = buildHuffman(allLengths.subarray(hlit, hlit + hdist), hdist);
    return {literals, distances};
};

/**
 * Inflates a raw DEFLATE stream (RFC 1951) into the original bytes.
 * Throws {@link InflateError} on malformed input.
 */
export const inflateRaw = (data: Uint8Array): Uint8Array => {
    const reader = new BitReader(data);
    const out = new OutputBuffer();
    let final = 0;
    do {
        final = reader.getBit();
        const type = reader.getBits(2);
        if (type === 0) {
            inflateStoredBlock(reader, out);
        } else if (type === 1) {
            inflateHuffmanBlock(reader, out, buildHuffman(FIXED_LITERAL_LENGTHS, 288), buildHuffman(FIXED_DISTANCE_LENGTHS, 30));
        } else if (type === 2) {
            const {literals, distances} = readDynamicTables(reader);
            inflateHuffmanBlock(reader, out, literals, distances);
        } else {
            throw new InflateError('deflate.bad-block-type', 'Reserved deflate block type 3.');
        }
    } while (!final);
    return out.toUint8Array();
};
