import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

import * as esbuild from 'esbuild';

import type {ProjectDiagnostic} from '../src/diagnostics/ProjectDiagnostic.ts';
import {
    loadWorkspaceProject,
    repositoryRoot,
    WorkspaceProjectError,
    type LoadedWorkspaceProject
} from './workspaceProject.ts';

const args = process.argv.slice(2);
const projectName = args.find(argument => !argument.startsWith('--'));
const portIndex = args.indexOf('--port');
const port = portIndex >= 0 ? Number(args[portIndex + 1]) : 4173;
const noOpen = args.includes('--no-open') || process.env.PREVIEW_NO_OPEN === '1';

if (!projectName) {
    console.error('Usage: npm run preview -- <workspace-project-name> [--no-open] [--port 4173]');
    process.exit(1);
}
if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`Invalid preview port: ${port}`);
    process.exit(1);
}

let loaded: LoadedWorkspaceProject | null = null;
let diagnostics: ProjectDiagnostic[] = [];
try {
    loaded = await loadWorkspaceProject(projectName);
    diagnostics = loaded.diagnostics;
} catch (error) {
    if (error instanceof WorkspaceProjectError) {
        diagnostics = error.diagnostics;
    } else {
        throw error;
    }
}

const bundle = await esbuild.build({
    entryPoints: [path.join(repositoryRoot, 'preview', 'manual-preview.ts')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    write: false,
    logLevel: 'warning'
});
const javascript = bundle.outputFiles[0].text;
const html = await readFile(
    path.join(repositoryRoot, 'preview', 'manual-preview.html'),
    'utf8'
);
const recordsById = new Map(loaded?.records.map(record => [record.assetId, record]) ?? []);

const json = (response: http.ServerResponse, status: number, value: unknown): void => {
    response.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
    });
    response.end(JSON.stringify(value));
};

const server = http.createServer((request, response) => {
    try {
        const url = new URL(request.url ?? '/', `http://localhost:${port}`);
        if (url.pathname === '/' || url.pathname === '/manual-preview.html') {
            response.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
            response.end(html);
            return;
        }
        if (url.pathname === '/manual-preview.js') {
            response.writeHead(200, {
                'Content-Type': 'text/javascript; charset=utf-8',
                'Cache-Control': 'no-store'
            });
            response.end(javascript);
            return;
        }
        if (url.pathname === '/api/project') {
            json(response, loaded ? 200 : 422, {
                ok: loaded !== null,
                name: projectName,
                project: loaded?.project,
                assets: loaded?.records.map(record => ({
                    assetId: record.assetId,
                    md5ext: record.md5ext,
                    dataFormat: record.dataFormat,
                    kind: record.kind,
                    mimeType: record.mimeType,
                    source: record.source,
                    url: `/api/assets/${record.assetId}`
                })),
                diagnostics
            });
            return;
        }
        if (url.pathname.startsWith('/api/assets/')) {
            const assetId = decodeURIComponent(url.pathname.slice('/api/assets/'.length));
            const record = recordsById.get(assetId);
            if (!record?.bytes) {
                response.writeHead(404);
                response.end('Asset not found');
                return;
            }
            response.writeHead(200, {
                'Content-Type': record.mimeType,
                'Content-Length': String(record.bytes.byteLength),
                'Cache-Control': 'no-store'
            });
            response.end(record.bytes);
            return;
        }
        response.writeHead(404);
        response.end('Not found');
    } catch (error) {
        json(response, 500, {
            error: error instanceof Error ? error.message : String(error)
        });
    }
});

const url = `http://localhost:${port}/manual-preview.html`;
server.listen(port, '127.0.0.1', () => {
    console.log(`Preview: ${url}`);
    if (diagnostics.length > 0) {
        console.log(`Diagnostics: ${diagnostics.length}`);
    }
    if (!noOpen) {
        const child = process.platform === 'win32'
            ? spawn('cmd.exe', ['/c', 'start', '', url], {
                detached: true,
                stdio: 'ignore',
                windowsHide: true
            })
            : process.platform === 'darwin'
                ? spawn('open', [url], {detached: true, stdio: 'ignore'})
                : spawn('xdg-open', [url], {detached: true, stdio: 'ignore'});
        child.unref();
    }
});

const shutdown = (): void => {
    server.close();
    server.closeAllConnections();
    process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
