/**
 * Phase 8 W2: parse a raw `project.json` into a structurally-checked
 * {@link RawProject} with diagnostics. This does NOT build a DslProject — it
 * confirms the SB3 envelope (targets order, Stage count, id dictionaries,
 * block references, asset metadata) and reports problems under the chosen
 * import mode. DSL conversion and opaque retention come in W3.
 *
 * Fundamental problems (unparseable JSON, no object root, no targets, no/2+
 * Stage) return `project: null`. Recoverable inconsistencies are reported as
 * preservable diagnostics and the raw project is still returned so the caller
 * can decide whether to proceed.
 */

import {ImportDiagnostics, type Diagnostic, type ImportMode} from './diagnostics.ts';
import type {ProjectIds, RawProject, RawTarget} from './rawTypes.ts';

export interface ParseOptions {
    mode?: ImportMode;
}

export interface ParseResult {
    project: RawProject | null;
    diagnostics: Diagnostic[];
}

const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | null => (typeof value === 'string' ? value : null);

const decodeJson = (input: Uint8Array | string): string =>
    typeof input === 'string' ? input : new TextDecoder('utf-8', {fatal: false}).decode(input);

/** Validates one target's shape, emitting diagnostics and returning a RawTarget. */
const parseTarget = (
    raw: Record<string, unknown>,
    index: number,
    diagnostics: ImportDiagnostics,
    ids: ProjectIds
): RawTarget => {
    const base = `targets[${index}]`;
    const name = asString(raw.name) ?? '';
    if (asString(raw.name) === null) {
        diagnostics.preservable({code: 'sb3.target.name-missing', path: `${base}.name`, message: 'Target name missing or not a string.'});
    }
    if (typeof raw.isStage !== 'boolean') {
        diagnostics.preservable({code: 'sb3.target.isstage-invalid', path: `${base}.isStage`, entityId: name, message: 'Target isStage is not a boolean.'});
    }
    const isStage = raw.isStage === true;

    const objField = (key: string): Record<string, unknown> => {
        const value = raw[key];
        if (isObject(value)) return value;
        diagnostics.preservable({code: 'sb3.target.map-invalid', path: `${base}.${key}`, entityId: name, message: `Target ${key} is not an object; treated as empty.`});
        return {};
    };
    const arrField = (key: string): unknown[] => {
        const value = raw[key];
        if (Array.isArray(value)) return value;
        diagnostics.preservable({code: 'sb3.target.array-invalid', path: `${base}.${key}`, entityId: name, message: `Target ${key} is not an array; treated as empty.`});
        return [];
    };

    const blocks = objField('blocks');
    const variables = objField('variables');
    const lists = objField('lists');
    const broadcasts = objField('broadcasts');
    const comments = objField('comments');
    const costumes = arrField('costumes');
    const sounds = arrField('sounds');

    for (const key of Object.keys(variables)) ids.variables.add(key);
    for (const key of Object.keys(lists)) ids.lists.add(key);
    for (const key of Object.keys(broadcasts)) ids.broadcasts.add(key);

    const blockIds = new Set<string>(Object.keys(blocks));

    // Block reference integrity (structural only; inputs parsed in W3).
    for (const [blockId, value] of Object.entries(blocks)) {
        const path = `${base}.blocks.${blockId}`;
        if (!isObject(value)) {
            diagnostics.preservable({code: 'sb3.block.not-object', path, entityId: blockId, message: 'Block entry is not an object.'});
            continue;
        }
        const opcode = asString(value.opcode);
        if (opcode === null) {
            diagnostics.preservable({code: 'sb3.block.opcode-missing', path: `${path}.opcode`, entityId: blockId, message: 'Block opcode missing or not a string.'});
        }
        for (const link of ['next', 'parent'] as const) {
            const ref = value[link];
            if (ref !== null && ref !== undefined && asString(ref) === null) {
                diagnostics.preservable({code: 'sb3.block.reference-invalid', path: `${path}.${link}`, entityId: blockId, opcode, message: `Block ${link} is not a string or null.`});
            } else if (typeof ref === 'string' && !blockIds.has(ref)) {
                diagnostics.preservable({code: 'sb3.block.reference-dangling', path: `${path}.${link}`, entityId: blockId, opcode, message: `Block ${link} references unknown block "${ref}".`});
            }
        }
    }

    // Asset metadata.
    const checkAsset = (list: unknown[], key: 'costumes' | 'sounds'): void => {
        list.forEach((asset, i) => {
            const path = `${base}.${key}[${i}]`;
            if (!isObject(asset)) {
                diagnostics.preservable({code: 'sb3.asset.not-object', path, entityId: name, message: `${key} entry is not an object.`});
                return;
            }
            const assetId = asString(asset.assetId);
            const md5ext = asString(asset.md5ext);
            const dataFormat = asString(asset.dataFormat);
            if (assetId === null) diagnostics.preservable({code: 'sb3.asset.assetid-missing', path: `${path}.assetId`, entityId: name, message: 'Asset assetId missing.'});
            if (md5ext === null) diagnostics.preservable({code: 'sb3.asset.md5ext-missing', path: `${path}.md5ext`, entityId: name, message: 'Asset md5ext missing.'});
            if (assetId !== null && dataFormat !== null && md5ext !== null && md5ext !== `${assetId}.${dataFormat}`) {
                diagnostics.preservable({code: 'sb3.asset.md5ext-mismatch', path: `${path}.md5ext`, entityId: name, message: `md5ext "${md5ext}" != "${assetId}.${dataFormat}".`});
            }
        });
    };
    checkAsset(costumes, 'costumes');
    checkAsset(sounds, 'sounds');

    return {isStage, name, blocks, blockIds, variables, lists, broadcasts, comments, costumes, sounds, raw};
};

/**
 * Parses raw `project.json` bytes/text into a structurally-checked RawProject.
 */
export const parseProjectJson = (input: Uint8Array | string, options: ParseOptions = {}): ParseResult => {
    const diagnostics = new ImportDiagnostics(options.mode ?? 'compatibility');

    let root: unknown;
    try {
        root = JSON.parse(decodeJson(input));
    } catch (error) {
        diagnostics.error({code: 'sb3.json.parse', path: 'project.json', message: `project.json is not valid JSON (${error instanceof Error ? error.message : String(error)}).`});
        return {project: null, diagnostics: diagnostics.list()};
    }

    if (!isObject(root)) {
        diagnostics.error({code: 'sb3.json.root-not-object', path: 'project.json', message: 'project.json root is not an object.'});
        return {project: null, diagnostics: diagnostics.list()};
    }

    const rawTargets = root.targets;
    if (!Array.isArray(rawTargets)) {
        diagnostics.error({code: 'sb3.project.targets-missing', path: 'targets', message: 'project.targets is missing or not an array.'});
        return {project: null, diagnostics: diagnostics.list()};
    }
    if (rawTargets.length === 0) {
        diagnostics.error({code: 'sb3.project.targets-empty', path: 'targets', message: 'project.targets is empty.'});
        return {project: null, diagnostics: diagnostics.list()};
    }

    const ids: ProjectIds = {variables: new Set(), lists: new Set(), broadcasts: new Set()};
    const targets: RawTarget[] = [];
    let fundamental = false;
    rawTargets.forEach((value, index) => {
        if (!isObject(value)) {
            diagnostics.error({code: 'sb3.target.not-object', path: `targets[${index}]`, message: 'Target is not an object.'});
            fundamental = true;
            return;
        }
        targets.push(parseTarget(value, index, diagnostics, ids));
    });
    if (fundamental) return {project: null, diagnostics: diagnostics.list()};

    // Stage count and ordering.
    const stages = targets.filter(target => target.isStage);
    if (stages.length === 0) {
        diagnostics.error({code: 'sb3.project.no-stage', path: 'targets', message: 'No Stage target (isStage true) found.'});
        return {project: null, diagnostics: diagnostics.list()};
    }
    if (stages.length > 1) {
        diagnostics.error({code: 'sb3.project.multiple-stages', path: 'targets', message: `Expected exactly one Stage, found ${stages.length}.`});
        return {project: null, diagnostics: diagnostics.list()};
    }
    if (!targets[0].isStage) {
        diagnostics.preservable({code: 'sb3.project.stage-not-first', path: 'targets[0]', message: 'Stage is not the first target.'});
    }

    // Sprite name uniqueness.
    const seen = new Set<string>();
    for (const target of targets) {
        if (target.isStage) continue;
        if (seen.has(target.name)) {
            diagnostics.preservable({code: 'sb3.target.duplicate-name', path: 'targets', entityId: target.name, message: `Duplicate sprite name "${target.name}".`});
        }
        seen.add(target.name);
    }

    const monitors = Array.isArray(root.monitors) ? root.monitors : [];
    if (!Array.isArray(root.monitors)) {
        diagnostics.preservable({code: 'sb3.project.monitors-invalid', path: 'monitors', message: 'project.monitors is missing or not an array; treated as empty.'});
    }
    const extensions = Array.isArray(root.extensions) ? root.extensions : [];
    if (!Array.isArray(root.extensions)) {
        diagnostics.preservable({code: 'sb3.project.extensions-invalid', path: 'extensions', message: 'project.extensions is missing or not an array; treated as empty.'});
    }
    const meta = isObject(root.meta) ? root.meta : {};
    if (!isObject(root.meta)) {
        diagnostics.warn({code: 'sb3.project.meta-invalid', path: 'meta', message: 'project.meta is missing or not an object; treated as empty.'});
    }

    const project: RawProject = {targets, monitors, extensions, meta, ids, raw: root};
    return {project, diagnostics: diagnostics.list()};
};
