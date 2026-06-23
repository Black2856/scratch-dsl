/**
 * Phase 8 import boundary: `.sb3` bytes → DslProject.
 *
 *   bytes → unzipSafe → project.json parse → rawToDsl → validateProject
 *
 * A failure at any stage stops and returns diagnostics without a partial
 * project (draft §import境界). Asset bytes are returned alongside (keyed by
 * md5ext) so a caller can persist them; this layer never decodes assets.
 */

import {validateProject, type DslProject} from '../../validation/projectValidator.ts';
import {unzipSafe, Sb3ZipError, type UnzipLimits} from './unzipSafe.ts';
import {parseProjectJson} from './parseProject.ts';
import {rawToDsl} from './rawToDsl.ts';
import type {Diagnostic, ImportMode} from './diagnostics.ts';

export interface ImportOptions {
    mode?: ImportMode;
    projectId?: string;
    projectName?: string;
    limits?: UnzipLimits;
}

export interface ImportResult {
    project: DslProject | null;
    diagnostics: Diagnostic[];
    /** Asset bytes keyed by md5ext (archive entry name), excluding project.json. */
    assets: Map<string, Uint8Array>;
    /** True when no error-severity diagnostic was produced. */
    valid: boolean;
}

const fail = (diagnostics: Diagnostic[], assets = new Map<string, Uint8Array>()): ImportResult =>
    ({project: null, diagnostics, assets, valid: false});

/** Imports `.sb3` bytes into a validated DslProject with diagnostics. */
export const importSb3 = (bytes: Uint8Array, options: ImportOptions = {}): ImportResult => {
    const mode = options.mode ?? 'compatibility';

    let files: Map<string, Uint8Array>;
    try {
        files = unzipSafe(bytes, options.limits);
    } catch (error) {
        if (error instanceof Sb3ZipError) {
            return fail([{code: error.code, severity: 'error', path: error.entry ?? 'archive', entityId: null, opcode: null, message: error.message}]);
        }
        throw error;
    }

    const projectJson = files.get('project.json');
    const assets = new Map([...files].filter(([name]) => name !== 'project.json'));
    if (!projectJson) {
        return fail([{code: 'sb3.project.json-missing', severity: 'error', path: 'archive', entityId: null, opcode: null, message: 'Archive has no project.json entry.'}], assets);
    }

    const parsed = parseProjectJson(projectJson, {mode});
    if (!parsed.project) {
        return fail(parsed.diagnostics, assets);
    }

    const assembled = rawToDsl(parsed.project, {mode, projectId: options.projectId, projectName: options.projectName});
    const diagnostics: Diagnostic[] = [...parsed.diagnostics, ...assembled.diagnostics];
    if (!assembled.project) {
        return fail(diagnostics, assets);
    }

    const validation = validateProject(assembled.project);
    diagnostics.push(...validation.diagnostics);

    const valid = !diagnostics.some(diagnostic => diagnostic.severity === 'error');
    return {project: valid ? assembled.project : assembled.project, diagnostics, assets, valid};
};
