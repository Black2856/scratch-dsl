import {computeMd5} from './md5.ts';
import type {AssetRecord, AssetRef} from './types.ts';

export interface AssetDiagnostic {
    code: string;
    assetId: string;
    message: string;
}

const diagnostic = (code: string, assetId: string, message: string): AssetDiagnostic => ({
    code,
    assetId,
    message
});

export const expectedMd5Ext = (asset: Pick<AssetRef, 'assetId' | 'dataFormat'>): string =>
    `${asset.assetId}.${asset.dataFormat}`;

export const validateAssetRecords = (records: readonly AssetRecord[]): AssetDiagnostic[] => {
    const diagnostics: AssetDiagnostic[] = [];
    const seen = new Set<string>();
    for (const record of records) {
        if (seen.has(record.assetId)) {
            diagnostics.push(diagnostic(
                'asset.id-duplicate',
                record.assetId,
                `Asset ${record.assetId} is registered more than once.`
            ));
        }
        seen.add(record.assetId);
        const expected = expectedMd5Ext(record);
        if (record.md5ext !== expected) {
            diagnostics.push(diagnostic(
                'asset.md5ext-mismatch',
                record.assetId,
                `md5ext must be ${expected}.`
            ));
        }
    }
    return diagnostics;
};

export const validateAssetReferences = (
    records: readonly AssetRecord[],
    references: readonly AssetRef[]
): AssetDiagnostic[] => {
    const diagnostics = validateAssetRecords(records);
    const assets = new Map(records.map(record => [record.assetId, record]));
    for (const reference of references) {
        const record = assets.get(reference.assetId);
        if (!record) {
            diagnostics.push(diagnostic(
                'asset.reference-dangling',
                reference.assetId,
                `Asset ${reference.assetId} does not exist.`
            ));
            continue;
        }
        if (
            record.kind !== reference.kind ||
            record.dataFormat !== reference.dataFormat ||
            record.md5ext !== reference.md5ext
        ) {
            diagnostics.push(diagnostic(
                'asset.reference-mismatch',
                reference.assetId,
                'Asset reference kind, dataFormat, or md5ext does not match the record.'
            ));
        }
    }
    return diagnostics;
};

export const validateAssetBytes = (record: AssetRecord): AssetDiagnostic[] => {
    if (record.bytes === null) {
        return [diagnostic(
            'asset.bytes-missing',
            record.assetId,
            'Asset bytes are not loaded.'
        )];
    }
    const actualAssetId = computeMd5(record.bytes);
    if (actualAssetId === record.assetId) return [];
    return [diagnostic(
        'asset.hash-mismatch',
        record.assetId,
        `Asset bytes have MD5 ${actualAssetId}.`
    )];
};
