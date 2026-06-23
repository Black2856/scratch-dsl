import type {DslBlock, DslField, DslInput} from '../validation/blockGraphValidator.ts';
import type {Sb3Block, Sb3Field, Sb3Input, Sb3InputValue, Sb3Primitive} from './types.ts';

/**
 * Phase 6-2: block normalization. Converts a target's DSL block dictionary
 * into the official `project.json` block form, preserving
 * next/parent/inputs/fields/shadow/topLevel, top-level x/y, and mutation, and
 * compressing literal/variable/list/broadcast shadow children into compact
 * primitive arrays (removing the inlined blocks from the dictionary).
 */

interface PrimitiveSpec {
    type: number;
    field: string;
    /** broadcast/variable/list carry a name + id pair. */
    withId: boolean;
}

/**
 * Opcodes whose blocks are inlined into the parent input as a compact
 * primitive (official codes 4..13). Note `data_variable`/`data_listcontents`
 * are reporters, not shadows, but are still compressed when used as inputs.
 */
const PRIMITIVE_OPCODES: Record<string, PrimitiveSpec> = {
    math_number: {type: 4, field: 'NUM', withId: false},
    math_positive_number: {type: 5, field: 'NUM', withId: false},
    math_whole_number: {type: 6, field: 'NUM', withId: false},
    math_integer: {type: 7, field: 'NUM', withId: false},
    math_angle: {type: 8, field: 'NUM', withId: false},
    colour_picker: {type: 9, field: 'COLOUR', withId: false},
    text: {type: 10, field: 'TEXT', withId: false},
    event_broadcast_menu: {type: 11, field: 'BROADCAST_OPTION', withId: true},
    data_variable: {type: 12, field: 'VARIABLE', withId: true},
    data_listcontents: {type: 13, field: 'LIST', withId: true}
};

const MUTATION_ARRAY_KEYS = ['argumentids', 'argumentnames', 'argumentdefaults'] as const;

const toPrimitive = (block: DslBlock): Sb3Primitive | null => {
    const spec = PRIMITIVE_OPCODES[block.opcode];
    if (!spec) return null;
    const field = block.fields[spec.field];
    if (!field) return null;
    if (spec.withId) {
        return [spec.type, String(field.value), field.id ?? ''];
    }
    return [spec.type, field.value];
};

/**
 * Resolves an input reference to either a primitive array (inlining + marking
 * the referenced block for removal) or the block id (kept as a reference).
 */
const refValue = (
    id: string,
    blocks: Record<string, DslBlock>,
    inlined: Set<string>
): Sb3InputValue => {
    const block = blocks[id];
    if (block) {
        const primitive = toPrimitive(block);
        if (primitive) {
            inlined.add(id);
            return primitive;
        }
    }
    return id;
};

const serializeInput = (
    input: DslInput,
    blocks: Record<string, DslBlock>,
    inlined: Set<string>
): Sb3Input | undefined => {
    const {block, shadow} = input;
    if (block !== null && shadow !== null && block === shadow) {
        return [1, refValue(block, blocks, inlined)];
    }
    if (block !== null && shadow === null) {
        return [2, refValue(block, blocks, inlined)];
    }
    if (block !== null && shadow !== null) {
        return [3, refValue(block, blocks, inlined), refValue(shadow, blocks, inlined)];
    }
    if (block === null && shadow !== null) {
        return [1, refValue(shadow, blocks, inlined)];
    }
    return undefined;
};

const serializeField = (field: DslField): Sb3Field =>
    field.id !== undefined && field.id !== null ? [field.value, field.id] : [field.value];

const serializeFields = (fields: Record<string, DslField>): Record<string, Sb3Field> => {
    const out: Record<string, Sb3Field> = {};
    for (const [name, field] of Object.entries(fields)) {
        out[name] = serializeField(field);
    }
    return out;
};

/**
 * Normalizes a custom-block mutation to the official string-encoded form:
 * tagName/children present, argument id/name/default arrays JSON-stringified,
 * warp as a `"true"`/`"false"` string. Unknown extra keys are preserved.
 */
const normalizeMutation = (mutation: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {...mutation};
    out.tagName = typeof out.tagName === 'string' ? out.tagName : 'mutation';
    out.children = Array.isArray(out.children) ? out.children : [];
    for (const key of MUTATION_ARRAY_KEYS) {
        if (Array.isArray(out[key])) out[key] = JSON.stringify(out[key]);
    }
    if (typeof out.warp === 'boolean') out.warp = out.warp ? 'true' : 'false';
    return out;
};

const serializeBlock = (
    block: DslBlock,
    blocks: Record<string, DslBlock>,
    inlined: Set<string>
): Sb3Block => {
    const inputs: Record<string, Sb3Input> = {};
    for (const [name, input] of Object.entries(block.inputs)) {
        const serialized = serializeInput(input, blocks, inlined);
        if (serialized !== undefined) inputs[name] = serialized;
    }

    const out: Sb3Block = {
        opcode: block.opcode,
        next: block.next,
        parent: block.parent,
        inputs,
        fields: serializeFields(block.fields),
        shadow: block.shadow,
        topLevel: block.topLevel
    };

    if (block.topLevel) {
        out.x = block.x ?? 0;
        out.y = block.y ?? 0;
    }
    if (block.mutation) out.mutation = normalizeMutation(block.mutation);
    if (block.comment) out.comment = block.comment;
    // Re-emit unknown SB3 block fields preserved by import (Phase 8). Known
    // fields above always win; opaque only carries keys the DSL does not model.
    if (block.opaque) {
        const target = out as Record<string, unknown>;
        for (const [key, value] of Object.entries(block.opaque)) {
            if (!(key in target)) target[key] = value;
        }
    }
    return out;
};

/**
 * Serializes a target's block dictionary, compressing primitive shadow/reporter
 * children into compact input arrays and dropping the inlined blocks from the
 * output. Block IDs are never re-numbered.
 */
export const serializeBlocks = (
    blocks: Record<string, DslBlock>
): Record<string, Sb3Block> => {
    const inlined = new Set<string>();
    const serialized: Record<string, Sb3Block> = {};
    for (const [id, block] of Object.entries(blocks)) {
        serialized[id] = serializeBlock(block, blocks, inlined);
    }

    const out: Record<string, Sb3Block> = {};
    for (const [id, block] of Object.entries(serialized)) {
        if (inlined.has(id)) continue;
        out[id] = block;
    }
    return out;
};
