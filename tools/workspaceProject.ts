import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

import {computeMd5} from '../src/assets/md5.ts';
import type {AssetKind, AssetRecord} from '../src/assets/types.ts';
import {
    createProjectDiagnostic,
    fromValidationDiagnostic,
    type ProjectDiagnostic
} from '../src/diagnostics/ProjectDiagnostic.ts';
import {
    validateProject,
    type DslProject
} from '../src/validation/projectValidator.ts';

const PROJECT_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

export interface WorkspaceAssetManifestEntry {
    assetId: string;
    md5ext: string;
    dataFormat: string;
    kind: AssetKind;
    mimeType: string;
    source: string;
}

export interface WorkspaceAssetManifest {
    assets: WorkspaceAssetManifestEntry[];
}

export interface LoadedWorkspaceProject {
    name: string;
    directory: string;
    project: DslProject;
    records: AssetRecord[];
    assetBytes: Map<string, Uint8Array>;
    diagnostics: ProjectDiagnostic[];
}

export class WorkspaceProjectError extends Error {
    readonly diagnostics: ProjectDiagnostic[];

    constructor(message: string, diagnostics: ProjectDiagnostic[]) {
        super(message);
        this.name = 'WorkspaceProjectError';
        this.diagnostics = diagnostics;
    }
}

export const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..'
);

export const workspaceProjectsRoot = path.join(repositoryRoot, 'workspace', 'projects');

export const resolveWorkspaceProjectDirectory = (
    name: string,
    projectsRoot = workspaceProjectsRoot
): string => {
    if (!PROJECT_NAME.test(name)) {
        throw new WorkspaceProjectError(`Invalid workspace project name: ${name}`, [
            createProjectDiagnostic(
                'workspace.project-name',
                'error',
                'Project names may contain only letters, numbers, hyphens, and underscores.',
                {projectId: name || null}
            )
        ]);
    }
    return path.join(projectsRoot, name);
};

const readManifest = async (
    filePath: string,
    projectId: string | null
): Promise<WorkspaceAssetManifest> => {
    let parsed: unknown;
    try {
        parsed = JSON.parse(await readFile(filePath, 'utf8'));
    } catch (error) {
        throw new WorkspaceProjectError(`Cannot read ${filePath}.`, [
            createProjectDiagnostic(
                'workspace.assets-manifest',
                'error',
                error instanceof Error ? error.message : String(error),
                {projectId, path: filePath}
            )
        ]);
    }
    if (
        typeof parsed !== 'object' ||
        parsed === null ||
        !Array.isArray((parsed as {assets?: unknown}).assets)
    ) {
        throw new WorkspaceProjectError(`Invalid asset manifest: ${filePath}.`, [
            createProjectDiagnostic(
                'workspace.assets-manifest-shape',
                'error',
                'assets.json must contain an assets array.',
                {projectId, path: filePath}
            )
        ]);
    }
    return parsed as WorkspaceAssetManifest;
};

const importProject = async (filePath: string, requestedName: string): Promise<DslProject> => {
    try {
        const module = await import(`${pathToFileURL(filePath).href}?t=${Date.now()}`);
        const project = module.default ?? module.project;
        if (typeof project !== 'object' || project === null) {
            throw new TypeError('project.ts must export a DslProject as default or as "project".');
        }
        return project as DslProject;
    } catch (error) {
        throw new WorkspaceProjectError(`Cannot load ${filePath}.`, [
            createProjectDiagnostic(
                'workspace.project-load',
                'error',
                error instanceof Error ? error.message : String(error),
                {projectId: requestedName, path: filePath}
            )
        ]);
    }
};

const targetIdForPath = (project: DslProject, diagnosticPath: string): string | null => {
    if (diagnosticPath.startsWith('$.stage')) return project.stage.id;
    const match = diagnosticPath.match(/^\$\.sprites\.(\d+)/);
    if (!match) return null;
    return project.sprites[Number(match[1])]?.id ?? null;
};

export const loadWorkspaceProject = async (
    name: string,
    options: {projectsRoot?: string} = {}
): Promise<LoadedWorkspaceProject> => {
    const directory = resolveWorkspaceProjectDirectory(name, options.projectsRoot);
    const projectFile = path.join(directory, 'project.ts');
    const manifestFile = path.join(directory, 'assets.json');
    const project = await importProject(projectFile, name);
    const projectId = project.project?.id ?? name;
    const diagnostics: ProjectDiagnostic[] = [];

    const validation = validateProject(project);
    diagnostics.push(...validation.diagnostics.map(item =>
        fromValidationDiagnostic(item, projectId, targetIdForPath(project, item.path))
    ));

    const manifest = await readManifest(manifestFile, projectId);
    const records: AssetRecord[] = [];
    const assetBytes = new Map<string, Uint8Array>();
    const manifestById = new Map<string, WorkspaceAssetManifestEntry>();

    for (const entry of manifest.assets) {
        if (
            !entry ||
            typeof entry.assetId !== 'string' ||
            typeof entry.md5ext !== 'string' ||
            typeof entry.dataFormat !== 'string' ||
            (entry.kind !== 'costume' && entry.kind !== 'sound') ||
            typeof entry.mimeType !== 'string' ||
            typeof entry.source !== 'string'
        ) {
            diagnostics.push(createProjectDiagnostic(
                'workspace.asset-entry',
                'error',
                'Every assets.json entry requires assetId, md5ext, dataFormat, kind, mimeType, and source.',
                {projectId, path: manifestFile}
            ));
            continue;
        }
        if (manifestById.has(entry.assetId)) {
            diagnostics.push(createProjectDiagnostic(
                'asset.id-duplicate',
                'error',
                `Asset ${entry.assetId} is declared more than once in assets.json.`,
                {projectId, assetId: entry.assetId, path: manifestFile}
            ));
            continue;
        }
        manifestById.set(entry.assetId, entry);

        const expectedMd5Ext = `${entry.assetId}.${entry.dataFormat}`;
        if (entry.md5ext !== expectedMd5Ext) {
            diagnostics.push(createProjectDiagnostic(
                'asset.md5ext-mismatch',
                'error',
                `md5ext must be ${expectedMd5Ext}.`,
                {projectId, assetId: entry.assetId, path: manifestFile}
            ));
        }

        const sourcePath = path.resolve(directory, entry.source);
        let bytes: Uint8Array;
        try {
            bytes = new Uint8Array(await readFile(sourcePath));
        } catch (error) {
            diagnostics.push(createProjectDiagnostic(
                'asset.bytes-missing',
                'error',
                error instanceof Error ? error.message : String(error),
                {projectId, assetId: entry.assetId, path: sourcePath}
            ));
            continue;
        }
        const actualMd5 = computeMd5(bytes);
        if (actualMd5 !== entry.assetId) {
            diagnostics.push(createProjectDiagnostic(
                'asset.hash-mismatch',
                'error',
                `Asset bytes have MD5 ${actualMd5}; expected ${entry.assetId}.`,
                {projectId, assetId: entry.assetId, path: sourcePath}
            ));
        }
        records.push({
            ...entry,
            source: sourcePath,
            status: 'ready',
            bytes
        });
        assetBytes.set(entry.md5ext, bytes);
    }

    for (const asset of project.assets) {
        const entry = manifestById.get(asset.id);
        if (!entry) {
            diagnostics.push(createProjectDiagnostic(
                'asset.reference-dangling',
                'error',
                `DSL asset ${asset.id} is missing from assets.json.`,
                {projectId, assetId: asset.id}
            ));
            continue;
        }
        if (
            entry.kind !== asset.kind ||
            entry.dataFormat !== asset.dataFormat ||
            entry.md5ext !== asset.md5ext
        ) {
            diagnostics.push(createProjectDiagnostic(
                'asset.reference-mismatch',
                'error',
                'DSL and assets.json disagree on kind, dataFormat, or md5ext.',
                {projectId, assetId: asset.id}
            ));
        }
    }

    for (const entry of manifest.assets) {
        if (!project.assets.some(asset => asset.id === entry.assetId)) {
            diagnostics.push(createProjectDiagnostic(
                'asset.manifest-unused',
                'warning',
                `Asset ${entry.assetId} is present in assets.json but not referenced by the DSL.`,
                {projectId, assetId: entry.assetId, path: manifestFile}
            ));
        }
    }

    if (!validation.valid || diagnostics.some(item => item.severity === 'error')) {
        throw new WorkspaceProjectError(
            `Workspace project "${name}" failed validation.`,
            diagnostics
        );
    }

    return {
        name,
        directory,
        project: validation.project!,
        records,
        assetBytes,
        diagnostics
    };
};
