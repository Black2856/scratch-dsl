import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const schemaUrl = new URL('../../schemas/project.schema.json', import.meta.url);

test('project schema is valid JSON and fixes the supported schema version', () => {
    const schema = JSON.parse(readFileSync(schemaUrl, 'utf8'));
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.equal(schema.properties.schemaVersion.const, '1.0.0');
    assert.deepEqual(schema.required, [
        'schemaVersion',
        'project',
        'stage',
        'sprites',
        'assets',
        'monitors',
        'extensions',
        'meta'
    ]);
});

