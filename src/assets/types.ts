export type AssetKind = 'costume' | 'sound';

export type AssetStatus = 'unloaded' | 'loading' | 'ready' | 'error';

export interface AssetRef {
    assetId: string;
    md5ext: string;
    dataFormat: string;
    kind: AssetKind;
}

export interface AssetRecord extends AssetRef {
    mimeType: string;
    status: AssetStatus;
    source: string;
    bytes: Uint8Array | null;
}

export interface AssetManagerSnapshot {
    assets: AssetRecord[];
}

export interface AssetDecoder<TDecoded> {
    decode(record: AssetRecord): TDecoded | Promise<TDecoded>;
}

export interface AssetLoader {
    load(ref: AssetRef): Promise<{
        bytes: Uint8Array;
        mimeType: string;
        source?: string;
    }>;
}

export interface AssetDecoders<TImage, TSound> {
    image?: AssetDecoder<TImage>;
    sound?: AssetDecoder<TSound>;
}

export interface CreateAssetOptions {
    assetId?: string;
    bytes: Uint8Array;
    dataFormat: string;
    kind: AssetKind;
    mimeType: string;
    source: string;
    status?: AssetStatus;
}
