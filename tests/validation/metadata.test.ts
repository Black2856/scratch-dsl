import assert from 'node:assert/strict';
import test from 'node:test';

import {
    getOpcodeMetadata,
    OPCODE_METADATA,
    P0_OPCODES
} from '../../src/blocks/opcodeMetadata.ts';

test('P0 opcode metadata has complete identity and container fields', () => {
    assert.ok(P0_OPCODES.length > 0);
    for (const opcode of P0_OPCODES) {
        const metadata = OPCODE_METADATA[opcode];
        assert.ok(metadata, `missing metadata for ${opcode}`);
        assert.equal(metadata.opcode, opcode);
        assert.ok(metadata.shape);
        assert.ok(metadata.target);
        assert.ok(metadata.priority);
        assert.ok(metadata.inputs);
        assert.ok(metadata.fields);
    }
});

test('representative opcodes expose input, field, shadow, and target constraints', () => {
    assert.equal(getOpcodeMetadata('motion_movesteps')?.target, 'sprite');
    assert.equal(getOpcodeMetadata('motion_movesteps')?.inputs.STEPS.shadow, 'math_number');
    assert.equal(getOpcodeMetadata('data_variable')?.fields.VARIABLE.reference, 'variable');
    assert.equal(getOpcodeMetadata('event_whenflagclicked')?.shape, 'hat');
    assert.equal(getOpcodeMetadata('control_stop')?.shape, 'cap');
});

