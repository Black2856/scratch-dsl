import assert from 'node:assert/strict';
import {mkdtemp, mkdir, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {computeMd5} from '../../src/assets/md5.ts';
import type {DslProject} from '../../src/validation/projectValidator.ts';
import {
    loadWorkspaceProject,
    WorkspaceProjectError
} from '../../tools/workspaceProject.ts';
import {createMinimalProject} from '../fixtures/minimalProject.ts';

const writeWorkspaceProject = async (
    root: string,
    name: string,
    project: DslProject,
    manifest: unknown,
    files: Record<string, Uint8Array> = {}
): Promise<void> => {
    const directory = path.join(root, name);
    await mkdir(directory, {recursive: true});
    await writeFile(
        path.join(directory, 'project.ts'),
        `export default ${JSON.stringify(project)};\n`
    );
    await writeFile(
        path.join(directory, 'assets.json'),
        `${JSON.stringify(manifest, null, 2)}\n`
    );
    for (const [relativePath, bytes] of Object.entries(files)) {
        const filePath = path.join(directory, relativePath);
        await mkdir(path.dirname(filePath), {recursive: true});
        await writeFile(filePath, bytes);
    }
};

test('loads and validates an asset-free workspace project', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'scratch-dsl-workspace-'));
    try {
        const project = createMinimalProject();
        project.project = {id: 'local-project', name: 'Local project'};
        await writeWorkspaceProject(root, 'local-project', project, {assets: []});

        const loaded = await loadWorkspaceProject('local-project', {projectsRoot: root});
        assert.equal(loaded.project.project.id, 'local-project');
        assert.equal(loaded.records.length, 0);
        assert.equal(loaded.assetBytes.size, 0);
    } finally {
        await rm(root, {recursive: true, force: true});
    }
});

test('rejects workspace asset bytes whose MD5 differs from assetId', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'scratch-dsl-workspace-'));
    try {
        const expectedBytes = new TextEncoder().encode('expected');
        const actualBytes = new TextEncoder().encode('different');
        const assetId = computeMd5(expectedBytes);
        const project = createMinimalProject();
        project.project = {id: 'bad-asset-project', name: 'Bad asset project'};
        project.sprites[0].costumes = [{
            id: 'costume',
            name: 'costume',
            assetId,
            dataFormat: 'png',
            md5ext: `${assetId}.png`,
            bitmapResolution: 1,
            rotationCenterX: 0,
            rotationCenterY: 0
        }];
        project.assets = [{
            id: assetId,
            kind: 'costume',
            dataFormat: 'png',
            md5ext: `${assetId}.png`
        }];
        await writeWorkspaceProject(
            root,
            'bad-asset-project',
            project,
            {
                assets: [{
                    assetId,
                    md5ext: `${assetId}.png`,
                    dataFormat: 'png',
                    kind: 'costume',
                    mimeType: 'image/png',
                    source: 'bad-asset-project/costume.png'
                }]
            },
            {'costume.png': actualBytes}
        );

        await assert.rejects(
            () => loadWorkspaceProject('bad-asset-project', {projectsRoot: root, sourceRoot: root}),
            (error: unknown) => {
                assert.ok(error instanceof WorkspaceProjectError);
                assert.ok(error.diagnostics.some(item => item.code === 'asset.hash-mismatch'));
                return true;
            }
        );
    } finally {
        await rm(root, {recursive: true, force: true});
    }
});
