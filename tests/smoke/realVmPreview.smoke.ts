import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Real-VM preview smoke test (browser, not part of `npm test`). Drives the
// actual preview path — turbowarpShot loads the project's exported .sb3 into the
// real @scratch/scratch-vm + scratch-render with Playwright and reports VM
// state. Asserts the project loads and runs. Needs a workspace project present
// (and the preview deps installed); skips cleanly if the project is absent.
//
//   npm run test:smoke

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const projectName = process.argv[2] ?? 'full-feature-minimal';

if (!existsSync(path.join(repoRoot, 'workspace', projectName, 'project.ts'))) {
    console.log(`SKIP: workspace/${projectName}/project.ts not present; nothing to smoke-test.`);
    process.exit(0);
}

console.log(`Real-VM preview smoke: loading "${projectName}" in @scratch/scratch-vm + scratch-render…`);
const shot = spawnSync(
    process.execPath,
    ['--no-warnings', '--experimental-strip-types', path.join(repoRoot, 'tools', 'turbowarpShot.ts'), projectName, '--wait', '1500'],
    {cwd: repoRoot, encoding: 'utf8'}
);

if (shot.status !== 0) {
    console.error(shot.stderr || shot.stdout || 'turbowarpShot failed');
    process.exit(1);
}

const start = shot.stdout.indexOf('{');
assert.notEqual(start, -1, `expected JSON state from turbowarpShot, got: ${shot.stdout.slice(0, 200)}`);
const report = JSON.parse(shot.stdout.slice(start)) as {
    ok: boolean;
    state: {error?: string; sprites?: Array<{name: string}>; variables?: Record<string, unknown>};
};

assert.equal(report.ok, true, 'turbowarpShot reported ok');
assert.ok(!report.state.error, `VM loaded without error (got: ${report.state.error})`);
assert.ok(Array.isArray(report.state.sprites) && report.state.sprites.length >= 1, 'at least one sprite present in the real VM');

console.log('SMOKE OK —', JSON.stringify({
    sprites: report.state.sprites?.map(s => s.name),
    variables: report.state.variables
}).slice(0, 200));
