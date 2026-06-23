/**
 * Phase 8 W3b: assemble a {@link DslProject} from a structurally-checked
 * {@link RawProject}. Reverses src/sb3/projectSerializer.ts: targets become the
 * Stage + sprites, SB3 variable/list/broadcast maps become DSL arrays (keeping
 * their map keys as ids), costumes/sounds get fresh DSL ids (export drops them),
 * the asset list is rebuilt from costume/sound references, and the block graph
 * is reconstructed by blocksToDsl.
 *
 * Self round-trip property (tests): for our own exported projects,
 *   serializeProject(rawToDsl(parse(serializeProject(p)))) deep-equals
 *   serializeProject(p).
 *
 * Retaining unknown SB3 fields opaquely (foreign projects) is a later step;
 * this assembles the known DSL shape and validates it.
 */

import type {
    DslAsset, DslBroadcast, DslComment, DslCostume, DslList, DslProject, DslSound, DslVariable
} from '../../validation/projectValidator.ts';
import {ImportDiagnostics, type Diagnostic, type ImportMode} from './diagnostics.ts';
import type {RawProject, RawTarget} from './rawTypes.ts';
import {rawBlocksToDsl} from './blocksToDsl.ts';
import {bool, isObject, num, str} from './guards.ts';

export interface RawToDslOptions {
    mode?: ImportMode;
    projectId?: string;
    projectName?: string;
}

export interface RawToDslResult {
    project: DslProject | null;
    diagnostics: Diagnostic[];
}

const prim = (value: unknown): string | number | boolean =>
    (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : '');

const buildVariables = (raw: Record<string, unknown>, target: string, diagnostics: ImportDiagnostics): DslVariable[] => {
    const out: DslVariable[] = [];
    for (const [id, value] of Object.entries(raw)) {
        if (!Array.isArray(value) || value.length < 2) {
            diagnostics.preservable({code: 'sb3.variable.invalid', path: `${target}.variables.${id}`, entityId: id, message: 'Variable is not a [name, value] array.'});
            continue;
        }
        if (value.length >= 3 && value[2] === true) {
            // Cloud variables cannot be represented in the DSL (isCloud is always false).
            diagnostics.preservable({code: 'sb3.variable.cloud-unsupported', path: `${target}.variables.${id}`, entityId: id, message: 'Cloud variable imported as a normal variable.'});
        }
        out.push({id, name: str(value[0], ''), value: prim(value[1]), isCloud: false});
    }
    return out;
};

const buildLists = (raw: Record<string, unknown>, target: string, diagnostics: ImportDiagnostics): DslList[] => {
    const out: DslList[] = [];
    for (const [id, value] of Object.entries(raw)) {
        if (!Array.isArray(value) || value.length < 2 || !Array.isArray(value[1])) {
            diagnostics.preservable({code: 'sb3.list.invalid', path: `${target}.lists.${id}`, entityId: id, message: 'List is not a [name, values] array.'});
            continue;
        }
        out.push({id, name: str(value[0], ''), values: value[1].map(prim)});
    }
    return out;
};

const buildBroadcasts = (raw: Record<string, unknown>): DslBroadcast[] =>
    Object.entries(raw).map(([id, name]) => ({id, name: str(name, '')}));

const buildComments = (raw: Record<string, unknown>): DslComment[] =>
    Object.entries(raw).flatMap(([id, value]) => {
        if (!isObject(value)) return [];
        return [{
            id,
            blockId: typeof value.blockId === 'string' ? value.blockId : null,
            text: str(value.text, ''),
            x: num(value.x, 0),
            y: num(value.y, 0),
            width: num(value.width, 0),
            height: num(value.height, 0),
            minimized: bool(value.minimized, false)
        }];
    });

const buildCostumes = (raw: unknown[], targetId: string): DslCostume[] =>
    raw.flatMap((value, i) => {
        if (!isObject(value)) return [];
        return [{
            id: `${targetId}-costume-${i}`,
            name: str(value.name, `costume${i + 1}`),
            assetId: str(value.assetId, ''),
            dataFormat: str(value.dataFormat, ''),
            md5ext: str(value.md5ext, ''),
            bitmapResolution: num(value.bitmapResolution, 1),
            rotationCenterX: num(value.rotationCenterX, 0),
            rotationCenterY: num(value.rotationCenterY, 0)
        }];
    });

const buildSounds = (raw: unknown[], targetId: string): DslSound[] =>
    raw.flatMap((value, i) => {
        if (!isObject(value)) return [];
        return [{
            id: `${targetId}-sound-${i}`,
            name: str(value.name, `sound${i + 1}`),
            assetId: str(value.assetId, ''),
            dataFormat: str(value.dataFormat, ''),
            md5ext: str(value.md5ext, ''),
            format: str(value.format, ''),
            rate: num(value.rate, 48000),
            sampleCount: num(value.sampleCount, 0)
        }];
    });

const collectAssets = (costumes: DslCostume[], sounds: DslSound[]): DslAsset[] => {
    const out: DslAsset[] = [];
    const seen = new Set<string>();
    const add = (kind: 'costume' | 'sound', ref: {assetId: string; dataFormat: string; md5ext: string}): void => {
        if (!ref.assetId || seen.has(ref.md5ext)) return;
        seen.add(ref.md5ext);
        out.push({id: ref.assetId, kind, dataFormat: ref.dataFormat, md5ext: ref.md5ext});
    };
    for (const costume of costumes) add('costume', costume);
    for (const sound of sounds) add('sound', sound);
    return out;
};

const commonTargetFields = (target: RawTarget, targetId: string, diagnostics: ImportDiagnostics) => {
    const graph = rawBlocksToDsl(target.blocks, diagnostics, `${targetId}.blocks`);
    const costumes = buildCostumes(target.costumes, targetId);
    const sounds = buildSounds(target.sounds, targetId);
    return {
        id: targetId,
        name: target.name,
        blocks: graph.blocks,
        scripts: graph.scripts,
        variables: buildVariables(target.variables, targetId, diagnostics),
        lists: buildLists(target.lists, targetId, diagnostics),
        broadcasts: buildBroadcasts(target.broadcasts),
        comments: buildComments(target.comments),
        currentCostume: num(target.raw.currentCostume, 0),
        costumes,
        sounds,
        volume: num(target.raw.volume, 100),
        layerOrder: num(target.raw.layerOrder, 0)
    };
};

// In SB3 a variable/list monitor's id IS the variable/list id; the DSL keeps
// monitor ids in the global id namespace, so reusing it would collide. Give
// data monitors a distinct DSL id and keep params.VARIABLE/LIST — the exporter
// resolves the real variable/list id back from the name on re-export.
const DATA_MONITOR_OPCODES = new Set(['data_variable', 'data_listcontents']);

const buildMonitors = (raw: unknown[]): DslProject['monitors'] =>
    raw.flatMap((value, index) => {
        if (!isObject(value) || typeof value.id !== 'string' || typeof value.opcode !== 'string') return [];
        const opcode = value.opcode;
        const id = DATA_MONITOR_OPCODES.has(opcode) ? `monitor-${index}` : value.id;
        return [{...value, id, opcode, visible: bool(value.visible, true)}];
    });

/** Assembles a DslProject from a RawProject (no validation here; caller validates). */
export const rawToDsl = (rawProject: RawProject, options: RawToDslOptions = {}): RawToDslResult => {
    const diagnostics = new ImportDiagnostics(options.mode ?? 'compatibility');

    const stageTarget = rawProject.targets.find(target => target.isStage)!;
    const spriteTargets = rawProject.targets.filter(target => !target.isStage);

    const stageCommon = commonTargetFields(stageTarget, 'stage', diagnostics);
    const stage: DslProject['stage'] = {
        ...stageCommon,
        isStage: true,
        layerOrder: 0,
        tempo: num(stageTarget.raw.tempo, 60),
        videoTransparency: num(stageTarget.raw.videoTransparency, 50),
        videoState: (str(stageTarget.raw.videoState, 'on') as DslProject['stage']['videoState']),
        textToSpeechLanguage: typeof stageTarget.raw.textToSpeechLanguage === 'string' ? stageTarget.raw.textToSpeechLanguage : null
    };

    const sprites = spriteTargets.map((target, index) => {
        const common = commonTargetFields(target, `sprite-${index}`, diagnostics);
        return {
            ...common,
            isStage: false as const,
            visible: bool(target.raw.visible, true),
            x: num(target.raw.x, 0),
            y: num(target.raw.y, 0),
            size: num(target.raw.size, 100),
            direction: num(target.raw.direction, 90),
            draggable: bool(target.raw.draggable, false),
            rotationStyle: (str(target.raw.rotationStyle, 'all around') as DslProject['sprites'][number]['rotationStyle'])
        };
    });

    const allCostumes = [stage.costumes, ...sprites.map(s => s.costumes)].flat();
    const allSounds = [stage.sounds, ...sprites.map(s => s.sounds)].flat();
    const extensions = rawProject.extensions.filter((value): value is string => typeof value === 'string');

    const project: DslProject = {
        schemaVersion: '1.0.0',
        project: {id: options.projectId ?? 'imported', name: options.projectName ?? 'imported'},
        stage,
        sprites,
        assets: collectAssets(allCostumes, allSounds),
        monitors: buildMonitors(rawProject.monitors),
        extensions,
        meta: rawProject.meta
    };

    return {project, diagnostics: diagnostics.list()};
};
