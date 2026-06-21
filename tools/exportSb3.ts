import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import parseProject from 'scratch-parser';

import {packageSb3} from '../src/sb3/sb3Packager.ts';
import {
    loadWorkspaceProject,
    WorkspaceProjectError
} from './workspaceProject.ts';

const projectName = process.argv[2];
if (!projectName) {
    console.error('Usage: npm run sb3 -- <workspace-project-name>');
    process.exitCode = 1;
} else {
    try {
        const loaded = await loadWorkspaceProject(projectName);
        const {sb3} = packageSb3(loaded.project, {assets: loaded.assetBytes});
        const outputDirectory = path.join(loaded.directory, 'output');
        const outputPath = path.join(outputDirectory, `${projectName}.sb3`);

        await new Promise<void>((resolve, reject) => {
            parseProject(Buffer.from(sb3), false, (error: unknown) => {
                if (error) {
                    reject(error instanceof Error ? error : new Error(String(error)));
                    return;
                }
                resolve();
            });
        });

        await mkdir(outputDirectory, {recursive: true});
        await writeFile(outputPath, sb3);

        console.log(`SB3: ${outputPath}`);
        console.log(`Bytes: ${sb3.byteLength}`);
        console.log('scratch-parser: pass');
    } catch (error) {
        if (error instanceof WorkspaceProjectError) {
            for (const diagnostic of error.diagnostics) {
                console.error(
                    `[${diagnostic.severity}] ${diagnostic.code}: ${diagnostic.message}` +
                    (diagnostic.assetId ? ` (asset ${diagnostic.assetId})` : '') +
                    (diagnostic.path ? ` at ${diagnostic.path}` : '')
                );
            }
        } else {
            console.error(error instanceof Error ? error.stack ?? error.message : String(error));
        }
        process.exitCode = 1;
    }
}
