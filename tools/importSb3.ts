import {readFileSync} from 'node:fs';
import path from 'node:path';

import {importSb3} from '../src/sb3/import/importProject.ts';
import type {ImportMode} from '../src/sb3/import/diagnostics.ts';

/**
 * CLI: import an existing `.sb3` into a DslProject and print a summary.
 *
 *   node --experimental-strip-types tools/importSb3.ts <file.sb3> [--strict]
 *
 * Reports load success, target/block/asset counts, extensions, and a
 * diagnostic breakdown. This is the read side of the export pipeline
 * (tools/exportSb3.ts); it does not write anything.
 */

const filePath = process.argv[2];
const mode: ImportMode = process.argv.includes('--strict') ? 'strict' : 'compatibility';

if (!filePath) {
    console.error('Usage: node --experimental-strip-types tools/importSb3.ts <file.sb3> [--strict]');
    process.exitCode = 1;
} else {
    const bytes = new Uint8Array(readFileSync(path.resolve(filePath)));
    console.log(`Importing ${path.basename(filePath)} (${(bytes.length / 1_048_576).toFixed(1)} MiB, mode=${mode})`);

    const started = Date.now();
    const result = importSb3(bytes, {mode});
    const elapsed = Date.now() - started;

    const errors = result.diagnostics.filter(d => d.severity === 'error');
    const warnings = result.diagnostics.filter(d => d.severity === 'warning');

    const byCode = new Map<string, number>();
    for (const d of result.diagnostics) byCode.set(d.code, (byCode.get(d.code) ?? 0) + 1);
    const topCodes = [...byCode.entries()].sort((a, b) => b[1] - a[1]);

    console.log(`\nLoaded: ${result.valid ? 'YES (no errors)' : 'with errors'}  in ${elapsed} ms`);
    if (result.project) {
        const p = result.project;
        const blockCount = [p.stage, ...p.sprites].reduce((sum, t) => sum + Object.keys(t.blocks).length, 0);
        console.log(`  targets:    ${1 + p.sprites.length} (Stage + ${p.sprites.length} sprites)`);
        console.log(`  blocks:     ${blockCount}`);
        console.log(`  monitors:   ${p.monitors.length}`);
        console.log(`  extensions: ${p.extensions.length ? p.extensions.join(', ') : '(none)'}`);
        console.log(`  assets:     ${p.assets.length} referenced, ${result.assets.size} bytes-entries in archive`);
    }

    console.log(`\nDiagnostics: ${errors.length} error(s), ${warnings.length} warning(s)`);
    for (const [code, count] of topCodes.slice(0, 15)) console.log(`  ${String(count).padStart(6)}  ${code}`);

    if (errors.length > 0) {
        console.log('\nFirst errors:');
        for (const d of errors.slice(0, 10)) console.log(`  [${d.code}] ${d.path}: ${d.message}`);
    }

    process.exitCode = result.valid ? 0 : 1;
}
