/**
 * Reverse of blockSerializer's primitive compression. The export side inlines
 * literal/colour/variable/list/broadcast shadow & reporter children into compact
 * arrays (`[type, value]` or `[type, name, id]`, codes 4..13). Import expands
 * each back into a real DSL block so the block graph is whole again.
 *
 * Mirrors PRIMITIVE_OPCODES in src/sb3/blockSerializer.ts (keep in sync).
 */

import type {DslBlock} from '../../validation/blockGraphValidator.ts';

export interface PrimitiveSpec {
    opcode: string;
    field: string;
    /** broadcast/variable/list carry a `[type, name, id]` triple. */
    withId: boolean;
    /** 4..11 are shadows; 12/13 (variable/list) are reporters. */
    shadow: boolean;
}

export const PRIMITIVE_BY_TYPE: Record<number, PrimitiveSpec> = {
    4: {opcode: 'math_number', field: 'NUM', withId: false, shadow: true},
    5: {opcode: 'math_positive_number', field: 'NUM', withId: false, shadow: true},
    6: {opcode: 'math_whole_number', field: 'NUM', withId: false, shadow: true},
    7: {opcode: 'math_integer', field: 'NUM', withId: false, shadow: true},
    8: {opcode: 'math_angle', field: 'NUM', withId: false, shadow: true},
    9: {opcode: 'colour_picker', field: 'COLOUR', withId: false, shadow: true},
    10: {opcode: 'text', field: 'TEXT', withId: false, shadow: true},
    11: {opcode: 'event_broadcast_menu', field: 'BROADCAST_OPTION', withId: true, shadow: true},
    12: {opcode: 'data_variable', field: 'VARIABLE', withId: true, shadow: false},
    13: {opcode: 'data_listcontents', field: 'LIST', withId: true, shadow: false}
};

const isPrimitiveValue = (value: unknown): value is string | number | boolean =>
    typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';

/**
 * Expands a compact primitive array into a DSL block. Returns null if the array
 * is not a recognized primitive (unknown type code or malformed), so the caller
 * can preserve it opaquely and diagnose instead of guessing.
 */
export const expandPrimitive = (primitive: readonly unknown[], id: string, parent: string): DslBlock | null => {
    const type = primitive[0];
    if (typeof type !== 'number') return null;
    const spec = PRIMITIVE_BY_TYPE[type];
    if (!spec) return null;

    const value = primitive[1];
    if (!isPrimitiveValue(value)) return null;

    const block: DslBlock = {
        id,
        opcode: spec.opcode,
        next: null,
        parent,
        inputs: {},
        fields: {},
        shadow: spec.shadow,
        topLevel: false
    };

    if (spec.withId) {
        const refId = primitive[2];
        block.fields[spec.field] = {value: String(value), id: typeof refId === 'string' ? refId : null};
    } else {
        block.fields[spec.field] = {value};
    }
    return block;
};
