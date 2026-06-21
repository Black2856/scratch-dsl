import {computeMd5} from './md5.ts';
import {
    expectedMd5Ext,
    validateAssetReferences,
    type AssetDiagnostic
} from './validation.ts';
import type {
    AssetDecoders,
    AssetKind,
    AssetLoader,
    AssetManagerSnapshot,
    AssetRecord,
    AssetRef,
    CreateAssetOptions
} from './types.ts';

const cloneRecord = (record: AssetRecord): AssetRecord => ({
    ...record,
    bytes: record.bytes?.slice() ?? null
});

const assertRecord = (record: AssetRecord): void => {
    if (!record.assetId) throw new Error('assetId must not be empty.');
    if (!record.dataFormat) throw new Error('dataFormat must not be empty.');
    if (record.status === 'ready' && !(record.bytes instanceof Uint8Array)) {
        throw new TypeError('ready assets must contain Uint8Array bytes.');
    }
    const expected = expectedMd5Ext(record);
    if (record.md5ext !== expected) {
        throw new Error(`md5ext must be ${expected}.`);
    }
};

export class AssetManager<TImage = unknown, TSound = unknown> {
    private readonly records = new Map<string, AssetRecord>();
    private readonly imageDecodeCache = new Map<string, Promise<TImage>>();
    private readonly soundDecodeCache = new Map<string, Promise<TSound>>();
    private readonly loadCache = new Map<string, Promise<AssetRecord>>();
    private readonly decoders: AssetDecoders<TImage, TSound>;

    constructor(
        records: readonly AssetRecord[] = [],
        decoders: AssetDecoders<TImage, TSound> = {}
    ) {
        this.decoders = decoders;
        for (const record of records) this.set(record);
    }

    static fromSnapshot<TImage = unknown, TSound = unknown>(
        snapshot: AssetManagerSnapshot,
        decoders: AssetDecoders<TImage, TSound> = {}
    ): AssetManager<TImage, TSound> {
        return new AssetManager(snapshot.assets, decoders);
    }

    create(options: CreateAssetOptions): AssetRecord {
        const assetId = options.assetId ?? computeMd5(options.bytes);
        const record: AssetRecord = {
            assetId,
            md5ext: `${assetId}.${options.dataFormat}`,
            dataFormat: options.dataFormat,
            kind: options.kind,
            mimeType: options.mimeType,
            status: options.status ?? 'ready',
            source: options.source,
            bytes: options.bytes
        };
        this.set(record);
        return cloneRecord(record);
    }

    set(record: AssetRecord): void {
        assertRecord(record);
        this.records.set(record.assetId, cloneRecord(record));
        this.clearDecodeCache(record.assetId);
    }

    get(assetId: string): AssetRecord | undefined {
        const record = this.records.get(assetId);
        return record ? cloneRecord(record) : undefined;
    }

    has(assetId: string): boolean {
        return this.records.has(assetId);
    }

    register(
        ref: AssetRef,
        mimeType: string,
        source = ''
    ): AssetRecord {
        const record: AssetRecord = {
            ...ref,
            mimeType,
            source,
            status: 'unloaded',
            bytes: null
        };
        this.set(record);
        return cloneRecord(record);
    }

    load(assetId: string, loader: AssetLoader): Promise<AssetRecord> {
        const current = this.records.get(assetId);
        if (!current) return Promise.reject(new Error(`Asset ${assetId} does not exist.`));
        if (current.status === 'ready') return Promise.resolve(cloneRecord(current));
        const cached = this.loadCache.get(assetId);
        if (cached) return cached;

        current.status = 'loading';
        const pending = loader.load(current).then(result => {
            const ready: AssetRecord = {
                ...current,
                mimeType: result.mimeType,
                source: result.source ?? current.source,
                status: 'ready',
                bytes: result.bytes
            };
            this.set(ready);
            return cloneRecord(ready);
        }, error => {
            current.status = 'error';
            current.bytes = null;
            throw error;
        }).finally(() => {
            if (this.loadCache.get(assetId) === pending) this.loadCache.delete(assetId);
        });
        this.loadCache.set(assetId, pending);
        return pending;
    }

    delete(assetId: string): boolean {
        this.clearDecodeCache(assetId);
        return this.records.delete(assetId);
    }

    list(): AssetRecord[] {
        return [...this.records.values()].map(cloneRecord);
    }

    toSnapshot(): AssetManagerSnapshot {
        return {assets: this.list()};
    }

    validateReferences(references: readonly AssetRef[]): AssetDiagnostic[] {
        return validateAssetReferences([...this.records.values()], references);
    }

    decodeImage(assetId: string): Promise<TImage> {
        const record = this.requireKind(assetId, 'costume');
        const decoder = this.decoders.image;
        if (!decoder) return Promise.reject(new Error('No image decoder is configured.'));
        return this.decodeCached(record, decoder.decode.bind(decoder), this.imageDecodeCache);
    }

    decodeSound(assetId: string): Promise<TSound> {
        const record = this.requireKind(assetId, 'sound');
        const decoder = this.decoders.sound;
        if (!decoder) return Promise.reject(new Error('No sound decoder is configured.'));
        return this.decodeCached(record, decoder.decode.bind(decoder), this.soundDecodeCache);
    }

    clearDecodeCache(assetId?: string): void {
        if (assetId === undefined) {
            this.imageDecodeCache.clear();
            this.soundDecodeCache.clear();
            return;
        }
        this.imageDecodeCache.delete(assetId);
        this.soundDecodeCache.delete(assetId);
    }

    private requireKind(assetId: string, expectedKind: AssetKind): AssetRecord {
        const record = this.records.get(assetId);
        if (!record) throw new Error(`Asset ${assetId} does not exist.`);
        if (record.kind !== expectedKind) {
            throw new Error(`Asset ${assetId} has kind ${record.kind}, expected ${expectedKind}.`);
        }
        if (record.status !== 'ready' || record.bytes === null) {
            throw new Error(`Asset ${assetId} is not ready.`);
        }
        return record;
    }

    private decodeCached<TDecoded>(
        record: AssetRecord,
        decode: (record: AssetRecord) => TDecoded | Promise<TDecoded>,
        cache: Map<string, Promise<TDecoded>>
    ): Promise<TDecoded> {
        const cached = cache.get(record.assetId);
        if (cached) return cached;

        const pending = Promise.resolve().then(() => decode(cloneRecord(record)));
        cache.set(record.assetId, pending);
        void pending.catch(() => {
            if (cache.get(record.assetId) === pending) cache.delete(record.assetId);
        });
        return pending;
    }
}
