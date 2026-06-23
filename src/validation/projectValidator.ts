import {findDuplicateIds, isValidId} from '../model/id.ts';
import {
    validateBlockGraph,
    type BlockGraphTarget,
    type Diagnostic,
    type DslBlock,
    type ValidationScope
} from './blockGraphValidator.ts';

export const CURRENT_SCHEMA_VERSION = '1.0.0';

export interface DslVariable {
    id: string;
    name: string;
    value: string | number | boolean;
    isCloud: false;
}

export interface DslList {
    id: string;
    name: string;
    values: Array<string | number | boolean>;
}

export interface DslBroadcast {
    id: string;
    name: string;
}

export interface DslAssetReference {
    id: string;
    name: string;
    assetId: string;
    dataFormat: string;
    md5ext: string;
}

export interface DslCostume extends DslAssetReference {
    bitmapResolution: number;
    rotationCenterX: number;
    rotationCenterY: number;
}

export interface DslSound extends DslAssetReference {
    format: string;
    rate: number;
    sampleCount: number;
}

export interface DslComment {
    id: string;
    blockId?: string | null;
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
    minimized: boolean;
}

export interface DslTarget extends BlockGraphTarget {
    name: string;
    variables: DslVariable[];
    lists: DslList[];
    broadcasts: DslBroadcast[];
    comments: DslComment[];
    currentCostume: number;
    costumes: DslCostume[];
    sounds: DslSound[];
    volume: number;
    layerOrder: number;
    [key: string]: unknown;
}

export interface DslAsset {
    id: string;
    kind: 'costume' | 'sound';
    dataFormat: string;
    md5ext: string;
    source?: string;
}

export interface DslProject {
    schemaVersion: typeof CURRENT_SCHEMA_VERSION;
    project: {
        id: string;
        name: string;
    };
    stage: DslTarget & {
        isStage: true;
        tempo: number;
        videoTransparency: number;
        videoState: 'on' | 'off' | 'on-flipped';
        textToSpeechLanguage: string | null;
    };
    sprites: Array<DslTarget & {
        isStage: false;
        visible: boolean;
        x: number;
        y: number;
        size: number;
        direction: number;
        draggable: boolean;
        rotationStyle: 'all around' | 'left-right' | "don't rotate";
    }>;
    assets: DslAsset[];
    monitors: Array<Record<string, unknown> & {id: string; opcode: string; visible: boolean}>;
    extensions: string[];
    meta: Record<string, unknown>;
}

export interface ValidationResult {
    valid: boolean;
    diagnostics: Diagnostic[];
    project?: DslProject;
}

const makeDiagnostic = (
    code: string,
    path: string,
    message: string,
    entityId: string | null = null,
    opcode: string | null = null,
    severity: 'error' | 'warning' = 'error'
): Diagnostic => ({code, severity, path, entityId, opcode, message});

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const hasKeys = (value: Record<string, unknown>, keys: string[]): boolean =>
    keys.every(key => Object.prototype.hasOwnProperty.call(value, key));

/** Emits a `schema.required` diagnostic for each missing key. */
const requireKeys = (
    value: Record<string, unknown>,
    keys: string[],
    pathPrefix: string,
    diagnostics: Diagnostic[],
    label: string,
    entityId: string | null = null,
    opcode: string | null = null
): void => {
    for (const key of keys) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) {
            diagnostics.push(makeDiagnostic(
                'schema.required',
                `${pathPrefix}.${key}`,
                `Required ${label} ${key} is missing.`,
                entityId,
                opcode
            ));
        }
    }
};

const validateRecordArray = (
    value: unknown,
    path: string,
    requiredKeys: string[],
    diagnostics: Diagnostic[],
    entityName: string
): void => {
    if (!Array.isArray(value)) return;
    value.forEach((item, index) => {
        if (!isRecord(item)) {
            diagnostics.push(makeDiagnostic(
                'schema.entity',
                `${path}.${index}`,
                `${entityName} must be an object.`
            ));
            return;
        }
        for (const key of requiredKeys) {
            if (!Object.prototype.hasOwnProperty.call(item, key)) {
                diagnostics.push(makeDiagnostic(
                    'schema.required',
                    `${path}.${index}.${key}`,
                    `Required ${entityName} property ${key} is missing.`,
                    typeof item.id === 'string' ? item.id : null
                ));
            }
        }
    });
};

const validateShape = (value: unknown): Diagnostic[] => {
    const diagnostics: Diagnostic[] = [];
    if (!isRecord(value)) {
        return [makeDiagnostic('schema.root-type', '$', 'Project DSL must be an object.')];
    }
    const required = ['schemaVersion', 'project', 'stage', 'sprites', 'assets', 'monitors', 'extensions', 'meta'];
    requireKeys(value, required, '$', diagnostics, 'property');
    if (value.schemaVersion !== CURRENT_SCHEMA_VERSION) {
        diagnostics.push(makeDiagnostic(
            'schema.version-unsupported',
            '$.schemaVersion',
            `Only schemaVersion ${CURRENT_SCHEMA_VERSION} is supported.`
        ));
    }
    if (!isRecord(value.project) || !hasKeys(value.project, ['id', 'name'])) {
        diagnostics.push(makeDiagnostic('schema.project', '$.project', 'project must contain id and name.'));
    } else if (typeof value.project.id !== 'string' || typeof value.project.name !== 'string') {
        diagnostics.push(makeDiagnostic(
            'schema.project-types',
            '$.project',
            'project.id and project.name must be strings.'
        ));
    }
    if (!isRecord(value.stage)) {
        diagnostics.push(makeDiagnostic('schema.stage', '$.stage', 'stage must be an object.'));
    }
    for (const key of ['sprites', 'assets', 'monitors', 'extensions']) {
        if (!Array.isArray(value[key])) {
            diagnostics.push(makeDiagnostic('schema.array', `$.${key}`, `${key} must be an array.`));
        }
    }
    if (!isRecord(value.meta)) {
        diagnostics.push(makeDiagnostic('schema.meta', '$.meta', 'meta must be an object.'));
    }
    validateRecordArray(value.assets, '$.assets', ['id', 'kind', 'dataFormat', 'md5ext'], diagnostics, 'asset');
    validateRecordArray(value.monitors, '$.monitors', ['id', 'opcode', 'visible'], diagnostics, 'monitor');
    return diagnostics;
};

const validateTargetShape = (target: unknown, path: string, expectedStage: boolean): Diagnostic[] => {
    const diagnostics: Diagnostic[] = [];
    if (!isRecord(target)) {
        return [makeDiagnostic('schema.target', path, 'Target must be an object.')];
    }
    const targetId = typeof target.id === 'string' ? target.id : null;
    const required = [
        'id', 'isStage', 'name', 'variables', 'lists', 'broadcasts', 'blocks', 'scripts',
        'comments', 'currentCostume', 'costumes', 'sounds', 'volume', 'layerOrder'
    ];
    const stageRequired = ['tempo', 'videoTransparency', 'videoState', 'textToSpeechLanguage'];
    const spriteRequired = ['visible', 'x', 'y', 'size', 'direction', 'draggable', 'rotationStyle'];
    requireKeys(target, [...required, ...(expectedStage ? stageRequired : spriteRequired)],
        path, diagnostics, 'target property', targetId);
    if (typeof target.id !== 'string' || typeof target.name !== 'string') {
        diagnostics.push(makeDiagnostic(
            'schema.target-types',
            path,
            'Target id and name must be strings.',
            targetId
        ));
    }
    if (target.isStage !== expectedStage) {
        diagnostics.push(makeDiagnostic(
            'target.stage-flag',
            `${path}.isStage`,
            `Expected isStage=${expectedStage}.`,
            targetId
        ));
    }
    for (const key of ['variables', 'lists', 'broadcasts', 'scripts', 'comments', 'costumes', 'sounds']) {
        if (!Array.isArray(target[key])) {
            diagnostics.push(makeDiagnostic(
                'schema.array',
                `${path}.${key}`,
                `${key} must be an array.`,
                targetId
            ));
        }
    }
    if (!isRecord(target.blocks)) {
        diagnostics.push(makeDiagnostic(
            'schema.blocks',
            `${path}.blocks`,
            'blocks must be an object dictionary.',
            targetId
        ));
    } else {
        for (const [blockId, rawBlock] of Object.entries(target.blocks)) {
            const blockPath = `${path}.blocks.${blockId}`;
            if (!isRecord(rawBlock)) {
                diagnostics.push(makeDiagnostic('schema.block', blockPath, 'Block must be an object.', blockId));
                continue;
            }
            const blockRequired = [
                'id', 'opcode', 'next', 'parent', 'inputs', 'fields', 'shadow', 'topLevel'
            ];
            requireKeys(rawBlock, blockRequired, blockPath, diagnostics, 'block property',
                typeof rawBlock.id === 'string' ? rawBlock.id : blockId,
                typeof rawBlock.opcode === 'string' ? rawBlock.opcode : null);
            if (
                typeof rawBlock.id !== 'string' ||
                typeof rawBlock.opcode !== 'string' ||
                !isRecord(rawBlock.inputs) ||
                !isRecord(rawBlock.fields) ||
                typeof rawBlock.shadow !== 'boolean' ||
                typeof rawBlock.topLevel !== 'boolean'
            ) {
                diagnostics.push(makeDiagnostic(
                    'schema.block-types',
                    blockPath,
                    'Block id/opcode/inputs/fields/shadow/topLevel have invalid types.',
                    typeof rawBlock.id === 'string' ? rawBlock.id : blockId,
                    typeof rawBlock.opcode === 'string' ? rawBlock.opcode : null
                ));
            }
        }
    }
    validateRecordArray(target.variables, `${path}.variables`,
        ['id', 'name', 'value', 'isCloud'], diagnostics, 'variable');
    validateRecordArray(target.lists, `${path}.lists`,
        ['id', 'name', 'values'], diagnostics, 'list');
    validateRecordArray(target.broadcasts, `${path}.broadcasts`,
        ['id', 'name'], diagnostics, 'broadcast');
    validateRecordArray(target.comments, `${path}.comments`,
        ['id', 'text', 'x', 'y', 'width', 'height', 'minimized'], diagnostics, 'comment');
    validateRecordArray(target.costumes, `${path}.costumes`, [
        'id', 'name', 'assetId', 'dataFormat', 'md5ext', 'bitmapResolution',
        'rotationCenterX', 'rotationCenterY'
    ], diagnostics, 'costume');
    validateRecordArray(target.sounds, `${path}.sounds`, [
        'id', 'name', 'assetId', 'dataFormat', 'md5ext', 'format', 'rate', 'sampleCount'
    ], diagnostics, 'sound');
    return diagnostics;
};

const collectIdEntries = (project: DslProject): Array<{id: string; path: string}> => {
    const entries: Array<{id: string; path: string}> = [
        {id: project.project.id, path: '$.project.id'}
    ];
    const targets = [project.stage, ...project.sprites];
    targets.forEach((target, targetIndex) => {
        const path = targetIndex === 0 ? '$.stage' : `$.sprites.${targetIndex - 1}`;
        entries.push({id: target.id, path: `${path}.id`});
        for (const collection of ['variables', 'lists', 'broadcasts', 'comments', 'costumes', 'sounds'] as const) {
            target[collection].forEach((entity, index) => {
                entries.push({id: entity.id, path: `${path}.${collection}.${index}.id`});
            });
        }
        for (const [blockId, block] of Object.entries(target.blocks)) {
            entries.push({id: block.id, path: `${path}.blocks.${blockId}.id`});
        }
    });
    project.assets.forEach((asset, index) => entries.push({
        id: asset.id,
        path: `$.assets.${index}.id`
    }));
    project.monitors.forEach((monitor, index) => entries.push({
        id: monitor.id,
        path: `$.monitors.${index}.id`
    }));
    return entries;
};

const validateIds = (project: DslProject): Diagnostic[] => {
    const diagnostics: Diagnostic[] = [];

    // Every id must be a valid id string.
    for (const entry of collectIdEntries(project)) {
        if (!isValidId(entry.id)) {
            diagnostics.push(makeDiagnostic(
                'id.invalid',
                entry.path,
                'ID contains unsupported characters or has invalid length.',
                entry.id
            ));
        }
    }

    type Entry = {id: string; path: string};
    const reportDuplicates = (entries: Entry[]): void => {
        for (const duplicate of findDuplicateIds(entries)) {
            diagnostics.push(makeDiagnostic(
                'id.duplicate',
                duplicate.duplicatePath,
                `ID ${duplicate.id} was first declared at ${duplicate.firstPath}.`,
                duplicate.id
            ));
        }
    };

    const targets = [project.stage, ...project.sprites];
    const targetPath = (index: number): string => (index === 0 ? '$.stage' : `$.sprites.${index - 1}`);

    // Globally-unique namespace: project / target / broadcast (stage-owned) /
    // monitor / asset ids.
    const globalEntries: Entry[] = [{id: project.project.id, path: '$.project.id'}];
    targets.forEach((target, i) => {
        globalEntries.push({id: target.id, path: `${targetPath(i)}.id`});
        target.broadcasts.forEach((b, j) => globalEntries.push({id: b.id, path: `${targetPath(i)}.broadcasts.${j}.id`}));
    });
    project.monitors.forEach((m, j) => globalEntries.push({id: m.id, path: `$.monitors.${j}.id`}));
    project.assets.forEach((a, j) => globalEntries.push({id: a.id, path: `$.assets.${j}.id`}));
    reportDuplicates(globalEntries);

    // block / comment / costume / sound ids are unique within a target but may
    // repeat across targets (duplicating a sprite keeps its local ids).
    targets.forEach((target, i) => {
        const local: Entry[] = [];
        for (const collection of ['comments', 'costumes', 'sounds'] as const) {
            target[collection].forEach((e, j) => local.push({id: e.id, path: `${targetPath(i)}.${collection}.${j}.id`}));
        }
        for (const [blockId, block] of Object.entries(target.blocks)) {
            local.push({id: block.id, path: `${targetPath(i)}.blocks.${blockId}.id`});
        }
        reportDuplicates(local);
    });

    // Variables/lists resolve in {a target's locals} ∪ {stage globals}; that
    // union must be collision-free (local-vs-global is ambiguous), but two
    // different sprites may reuse the same local id.
    const varListEntries = (target: DslTarget, base: string): Entry[] => [
        ...target.variables.map((v, j) => ({id: v.id, path: `${base}.variables.${j}.id`})),
        ...target.lists.map((l, j) => ({id: l.id, path: `${base}.lists.${j}.id`}))
    ];
    const stageVarList = varListEntries(project.stage, '$.stage');
    reportDuplicates(stageVarList);
    const stageIds = new Set(stageVarList.map(e => e.id));
    project.sprites.forEach((sprite, si) => {
        const spriteVarList = varListEntries(sprite, `$.sprites.${si}`);
        reportDuplicates(spriteVarList);
        for (const entry of spriteVarList) {
            if (stageIds.has(entry.id)) {
                diagnostics.push(makeDiagnostic(
                    'id.duplicate',
                    entry.path,
                    `ID ${entry.id} collides with a stage-global variable or list.`,
                    entry.id
                ));
            }
        }
    });

    return diagnostics;
};

const validateAssets = (project: DslProject): Diagnostic[] => {
    const diagnostics: Diagnostic[] = [];
    const assets = new Map(project.assets.map(asset => [asset.id, asset]));
    const targets = [project.stage, ...project.sprites];

    project.assets.forEach((asset, index) => {
        const expectedMd5Ext = `${asset.id}.${asset.dataFormat}`;
        if (asset.md5ext !== expectedMd5Ext) {
            diagnostics.push(makeDiagnostic(
                'asset.md5ext-mismatch',
                `$.assets.${index}.md5ext`,
                `md5ext must be ${expectedMd5Ext}.`,
                asset.id
            ));
        }
    });

    targets.forEach((target, targetIndex) => {
        const targetPath = targetIndex === 0 ? '$.stage' : `$.sprites.${targetIndex - 1}`;
        const references = [
            ...target.costumes.map((item, index) => ({item, index, kind: 'costume'})),
            ...target.sounds.map((item, index) => ({item, index, kind: 'sound'}))
        ];
        for (const reference of references) {
            const collection = reference.kind === 'costume' ? 'costumes' : 'sounds';
            const path = `${targetPath}.${collection}.${reference.index}`;
            const asset = assets.get(reference.item.assetId);
            if (!asset) {
                diagnostics.push(makeDiagnostic(
                    'asset.reference-dangling',
                    `${path}.assetId`,
                    `Asset ${reference.item.assetId} does not exist.`,
                    reference.item.id
                ));
                continue;
            }
            if (
                asset.kind !== reference.kind ||
                asset.dataFormat !== reference.item.dataFormat ||
                asset.md5ext !== reference.item.md5ext
            ) {
                diagnostics.push(makeDiagnostic(
                    'asset.reference-mismatch',
                    path,
                    'Asset reference kind, dataFormat, or md5ext does not match the asset.',
                    reference.item.id
                ));
            }
        }
    });
    return diagnostics;
};

const validateComments = (target: DslTarget, targetPath: string): Diagnostic[] => {
    const diagnostics: Diagnostic[] = [];
    const commentIds = new Set(target.comments.map(comment => comment.id));
    // Real Scratch projects keep comments whose blockId no longer resolves in
    // this target (left over from sprite duplication, or orphaned by block
    // deletion). The comment is preserved, so this is a warning, not an error.
    target.comments.forEach((comment, index) => {
        if (comment.blockId && !target.blocks[comment.blockId]) {
            diagnostics.push(makeDiagnostic(
                'comment.block-dangling',
                `${targetPath}.comments.${index}.blockId`,
                `Comment block ${comment.blockId} does not exist in this target.`,
                comment.id,
                null,
                'warning'
            ));
        }
    });
    for (const block of Object.values(target.blocks)) {
        if (block.comment && !commentIds.has(block.comment)) {
            diagnostics.push(makeDiagnostic(
                'block.comment-dangling',
                `${targetPath}.blocks.${block.id}.comment`,
                `Comment ${block.comment} does not exist.`,
                block.id,
                block.opcode,
                'warning'
            ));
        }
    }
    return diagnostics;
};

const validateSemantics = (project: DslProject): Diagnostic[] => {
    const diagnostics: Diagnostic[] = [];
    diagnostics.push(...validateIds(project));
    diagnostics.push(...validateAssets(project));

    const stageVariableIds = new Set(project.stage.variables.map(variable => variable.id));
    const stageListIds = new Set(project.stage.lists.map(list => list.id));
    const broadcastIds = new Set(project.stage.broadcasts.map(broadcast => broadcast.id));
    const targets = [project.stage, ...project.sprites];

    project.sprites.forEach((sprite, spriteIndex) => {
        if (sprite.broadcasts.length > 0) {
            diagnostics.push(makeDiagnostic(
                'scope.broadcast-declaration',
                `$.sprites.${spriteIndex}.broadcasts`,
                'Broadcast declarations must be owned by the stage.',
                sprite.id
            ));
        }
    });

    targets.forEach((target, targetIndex) => {
        const targetPath = targetIndex === 0 ? '$.stage' : `$.sprites.${targetIndex - 1}`;
        const scope: ValidationScope = {
            variables: new Set([
                ...stageVariableIds,
                ...target.variables.map(variable => variable.id)
            ]),
            lists: new Set([
                ...stageListIds,
                ...target.lists.map(list => list.id)
            ]),
            broadcasts: broadcastIds
        };
        diagnostics.push(...validateBlockGraph(target, targetPath, scope));
        diagnostics.push(...validateComments(target, targetPath));
        if (target.costumes.length === 0 && target.currentCostume !== 0) {
            diagnostics.push(makeDiagnostic(
                'target.current-costume',
                `${targetPath}.currentCostume`,
                'currentCostume must be 0 when no costumes exist.',
                target.id
            ));
        } else if (
            target.costumes.length > 0 &&
            (target.currentCostume < 0 || target.currentCostume >= target.costumes.length)
        ) {
            diagnostics.push(makeDiagnostic(
                'target.current-costume',
                `${targetPath}.currentCostume`,
                'currentCostume is outside the costume array.',
                target.id
            ));
        }
    });

    return diagnostics;
};

export const migrateProject = (
    value: unknown,
    toVersion = CURRENT_SCHEMA_VERSION
): unknown => {
    if (!isRecord(value) || value.schemaVersion !== toVersion) {
        throw new Error(`No migration path to ${toVersion}.`);
    }
    return structuredClone(value);
};

export const validateProject = (value: unknown): ValidationResult => {
    const diagnostics = validateShape(value);
    if (!isRecord(value)) return {valid: false, diagnostics};

    diagnostics.push(...validateTargetShape(value.stage, '$.stage', true));
    if (Array.isArray(value.sprites)) {
        value.sprites.forEach((sprite, index) => {
            diagnostics.push(...validateTargetShape(sprite, `$.sprites.${index}`, false));
        });
    }

    if (diagnostics.some(item => item.severity === 'error')) {
        return {valid: false, diagnostics};
    }

    const project = value as unknown as DslProject;
    diagnostics.push(...validateSemantics(project));
    return {
        valid: !diagnostics.some(item => item.severity === 'error'),
        diagnostics,
        project
    };
};

export type {Diagnostic, DslBlock};
