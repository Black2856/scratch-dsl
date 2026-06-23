import {access, mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

import {
    resolveWorkspaceProjectDirectory,
    WorkspaceProjectError
} from './workspaceProject.ts';

/**
 * Scaffolds a new workspace project under `workspace/<name>/` with a minimal,
 * already-valid DSL (`project.ts`), an empty asset manifest (`assets.json`),
 * an empty `src/` for splitting large works (project.ts stays the composing
 * main; per-sprite/feature modules go in `src/`), and the `output/` directory
 * used by `npm run sb3`. The generated project passes validateProject and runs
 * in preview immediately (green flag → move), so the author edits a working
 * skeleton instead of building structure by hand.
 */

const projectFileTemplate = (name: string): string => `import type {DslProject} from '../../src/validation/projectValidator.ts';

const project: DslProject = {
    schemaVersion: '1.0.0',
    project: {
        id: '${name}',
        name: '${name}'
    },
    stage: {
        id: 'stage',
        isStage: true,
        name: 'Stage',
        variables: [],
        lists: [],
        broadcasts: [],
        blocks: {},
        scripts: [],
        comments: [],
        currentCostume: 0,
        costumes: [],
        sounds: [],
        volume: 100,
        layerOrder: 0,
        tempo: 60,
        videoTransparency: 50,
        videoState: 'on',
        textToSpeechLanguage: null
    },
    sprites: [
        {
            id: 'sprite',
            isStage: false,
            name: 'Sprite',
            variables: [],
            lists: [],
            broadcasts: [],
            blocks: {
                flag: {
                    id: 'flag',
                    opcode: 'event_whenflagclicked',
                    next: 'move',
                    parent: null,
                    inputs: {},
                    fields: {},
                    shadow: false,
                    topLevel: true
                },
                move: {
                    id: 'move',
                    opcode: 'motion_movesteps',
                    next: null,
                    parent: 'flag',
                    inputs: {STEPS: {block: 'move-steps', shadow: 'move-steps'}},
                    fields: {},
                    shadow: false,
                    topLevel: false
                },
                'move-steps': {
                    id: 'move-steps',
                    opcode: 'math_number',
                    next: null,
                    parent: 'move',
                    inputs: {},
                    fields: {NUM: {value: 10}},
                    shadow: true,
                    topLevel: false
                }
            },
            scripts: ['flag'],
            comments: [],
            currentCostume: 0,
            costumes: [],
            sounds: [],
            volume: 100,
            layerOrder: 1,
            visible: true,
            x: 0,
            y: 0,
            size: 100,
            direction: 90,
            draggable: false,
            rotationStyle: 'all around'
        }
    ],
    assets: [],
    monitors: [],
    extensions: [],
    meta: {
        source: 'workspace/${name}/project.ts'
    }
};

export default project;
`;

const manifestTemplate = (): string => `{
  "assets": []
}
`;

const directoryExists = async (directory: string): Promise<boolean> => {
    try {
        await access(directory);
        return true;
    } catch {
        return false;
    }
};

const projectName = process.argv[2];
if (!projectName) {
    console.error('Usage: npm run new -- <workspace-project-name>');
    process.exitCode = 1;
} else {
    try {
        const directory = resolveWorkspaceProjectDirectory(projectName);
        if (await directoryExists(directory)) {
            console.error(`Workspace entry already exists: ${directory}`);
            console.error('Choose a different name or remove the existing directory first.');
            process.exitCode = 1;
        } else {
            await mkdir(path.join(directory, 'output'), {recursive: true});
            await mkdir(path.join(directory, 'assets'), {recursive: true});
            await mkdir(path.join(directory, 'src'), {recursive: true});
            await writeFile(path.join(directory, 'project.ts'), projectFileTemplate(projectName));
            await writeFile(path.join(directory, 'assets.json'), manifestTemplate());

            console.log(`Created workspace project: ${directory}`);
            console.log(`  project.ts   minimal valid DSL (green flag -> move 10)`);
            console.log(`  src/         split big works here (project.ts stays the main)`);
            console.log(`  assets.json  empty manifest`);
            console.log(`  assets/      put costume/sound files here`);
            console.log(`  output/      sb3 output directory`);
            console.log('');
            console.log('Next:');
            console.log(`  npm run preview -- ${projectName}`);
            console.log(`  npm run sb3 -- ${projectName}`);
        }
    } catch (error) {
        if (error instanceof WorkspaceProjectError) {
            for (const diagnostic of error.diagnostics) {
                console.error(`[${diagnostic.severity}] ${diagnostic.code}: ${diagnostic.message}`);
            }
        } else {
            console.error(error instanceof Error ? error.stack ?? error.message : String(error));
        }
        process.exitCode = 1;
    }
}
