import assert from 'node:assert/strict';
import test from 'node:test';

import {createMinimalProject} from '../fixtures/minimalProject.ts';
import {packageSb3} from '../../src/sb3/sb3Packager.ts';
import {unzipSafe} from '../../src/sb3/import/unzipSafe.ts';
import {parseProjectJson} from '../../src/sb3/import/parseProject.ts';
import type {Diagnostic} from '../../src/sb3/import/diagnostics.ts';

const codes = (diagnostics: Diagnostic[]): string[] => diagnostics.map(d => d.code);
const errors = (diagnostics: Diagnostic[]): Diagnostic[] => diagnostics.filter(d => d.severity === 'error');

// A minimal but well-formed sb3 project.json object, for targeted mutation.
const minimalRaw = () => ({
    targets: [
        {
            isStage: true, name: 'Stage', blocks: {}, variables: {}, lists: {}, broadcasts: {}, comments: {},
            costumes: [{assetId: 'aa', name: 'backdrop1', md5ext: 'aa.svg', dataFormat: 'svg', bitmapResolution: 1, rotationCenterX: 0, rotationCenterY: 0}],
            sounds: [], currentCostume: 0, volume: 100, layerOrder: 0, tempo: 60, videoTransparency: 50, videoState: 'on', textToSpeechLanguage: null
        },
        {
            isStage: false, name: 'Sprite1',
            blocks: {
                flag: {opcode: 'event_whenflagclicked', next: 'move', parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true, x: 0, y: 0},
                move: {opcode: 'motion_movesteps', next: null, parent: 'flag', inputs: {}, fields: {}, shadow: false, topLevel: false}
            },
            variables: {}, lists: {}, broadcasts: {}, comments: {},
            costumes: [{assetId: 'bb', name: 'costume1', md5ext: 'bb.svg', dataFormat: 'svg', bitmapResolution: 1, rotationCenterX: 0, rotationCenterY: 0}],
            sounds: [], currentCostume: 0, volume: 100, layerOrder: 1, visible: true, x: 0, y: 0, size: 100, direction: 90, draggable: false, rotationStyle: 'all around'
        }
    ],
    monitors: [],
    extensions: [],
    meta: {semver: '3.0.0', vm: '0.2.0', agent: ''}
});

const parse = (obj: unknown, mode?: 'strict' | 'compatibility') =>
    parseProjectJson(JSON.stringify(obj), mode ? {mode} : undefined);

// --- happy paths ------------------------------------------------------------

test('parseProjectJson accepts a well-formed project with no diagnostics', () => {
    const {project, diagnostics} = parse(minimalRaw());
    assert.ok(project, 'project parsed');
    assert.equal(diagnostics.length, 0, `no diagnostics, got ${codes(diagnostics)}`);
    assert.equal(project!.targets.length, 2);
    assert.equal(project!.targets[0].isStage, true);
    assert.deepEqual([...project!.targets[1].blockIds].sort(), ['flag', 'move']);
});

test('parseProjectJson round-trips our own exported sb3 (real path)', () => {
    const {sb3} = packageSb3(createMinimalProject());
    const files = unzipSafe(sb3);
    const projectJson = files.get('project.json');
    assert.ok(projectJson, 'project.json present');
    const {project, diagnostics} = parseProjectJson(projectJson!);
    assert.ok(project, 'parsed exported project');
    assert.equal(errors(diagnostics).length, 0, `no errors, got ${JSON.stringify(diagnostics)}`);
    assert.equal(project!.targets.filter(t => t.isStage).length, 1);
});

test('parseProjectJson collects variable/list/broadcast ids', () => {
    const obj = minimalRaw();
    obj.targets[0].variables = {'var-1': ['score', 0]} as never;
    obj.targets[0].broadcasts = {'bc-1': 'go'} as never;
    obj.targets[1].lists = {'list-1': ['items', []]} as never;
    const {project} = parse(obj);
    assert.deepEqual([...project!.ids.variables], ['var-1']);
    assert.deepEqual([...project!.ids.broadcasts], ['bc-1']);
    assert.deepEqual([...project!.ids.lists], ['list-1']);
});

// --- fundamental errors (project null) --------------------------------------

test('parseProjectJson reports malformed JSON', () => {
    const {project, diagnostics} = parseProjectJson('{ not valid');
    assert.equal(project, null);
    assert.deepEqual(codes(diagnostics), ['sb3.json.parse']);
});

test('parseProjectJson rejects non-object root', () => {
    const {project, diagnostics} = parseProjectJson('[]');
    assert.equal(project, null);
    assert.deepEqual(codes(diagnostics), ['sb3.json.root-not-object']);
});

test('parseProjectJson rejects missing/empty targets', () => {
    assert.equal(parse({monitors: []}).project, null);
    assert.deepEqual(codes(parse({monitors: []}).diagnostics), ['sb3.project.targets-missing']);
    assert.deepEqual(codes(parse({targets: []}).diagnostics), ['sb3.project.targets-empty']);
});

test('parseProjectJson rejects no-stage and multiple-stage', () => {
    const noStage = minimalRaw();
    noStage.targets[0].isStage = false;
    assert.equal(parse(noStage).project, null);
    assert.ok(codes(parse(noStage).diagnostics).includes('sb3.project.no-stage'));

    const twoStage = minimalRaw();
    twoStage.targets[1].isStage = true;
    assert.equal(parse(twoStage).project, null);
    assert.ok(codes(parse(twoStage).diagnostics).includes('sb3.project.multiple-stages'));
});

// --- preservable inconsistencies (mode-dependent severity) ------------------

test('dangling block reference is preservable: warning in compatibility, error in strict', () => {
    const obj = minimalRaw();
    obj.targets[1].blocks.flag.next = 'ghost';

    const compat = parse(obj, 'compatibility');
    assert.ok(compat.project, 'compatibility still returns the project');
    const danglers = compat.diagnostics.filter(d => d.code === 'sb3.block.reference-dangling');
    assert.equal(danglers.length, 1);
    assert.equal(danglers[0].severity, 'warning');
    assert.equal(danglers[0].entityId, 'flag');

    const strict = parse(obj, 'strict');
    assert.equal(strict.diagnostics.find(d => d.code === 'sb3.block.reference-dangling')!.severity, 'error');
    assert.ok(strict.project, 'strict still returns raw project for inspection');
});

test('stage-not-first is preservable', () => {
    const obj = minimalRaw();
    [obj.targets[0], obj.targets[1]] = [obj.targets[1], obj.targets[0]];
    const {diagnostics} = parse(obj);
    assert.ok(codes(diagnostics).includes('sb3.project.stage-not-first'));
});

test('duplicate sprite name is preservable', () => {
    const obj = minimalRaw();
    obj.targets.push({...obj.targets[1], layerOrder: 2});
    const {diagnostics} = parse(obj);
    assert.ok(codes(diagnostics).includes('sb3.target.duplicate-name'));
});

test('md5ext mismatch is preservable', () => {
    const obj = minimalRaw();
    obj.targets[0].costumes[0].md5ext = 'wrong.svg';
    const {diagnostics} = parse(obj);
    const mismatch = diagnostics.find(d => d.code === 'sb3.asset.md5ext-mismatch');
    assert.ok(mismatch, 'mismatch reported');
    assert.equal(mismatch!.severity, 'warning');
});

test('missing block opcode is preservable and keeps the block id', () => {
    const obj = minimalRaw();
    delete (obj.targets[1].blocks.move as Record<string, unknown>).opcode;
    const {project, diagnostics} = parse(obj);
    assert.ok(project!.targets[1].blockIds.has('move'), 'block id retained');
    assert.ok(codes(diagnostics).includes('sb3.block.opcode-missing'));
});

test('non-array monitors/extensions are preservable and defaulted', () => {
    const obj = minimalRaw();
    (obj as Record<string, unknown>).monitors = 'nope';
    (obj as Record<string, unknown>).extensions = 42;
    const {project, diagnostics} = parse(obj);
    assert.deepEqual(project!.monitors, []);
    assert.deepEqual(project!.extensions, []);
    assert.ok(codes(diagnostics).includes('sb3.project.monitors-invalid'));
    assert.ok(codes(diagnostics).includes('sb3.project.extensions-invalid'));
});
