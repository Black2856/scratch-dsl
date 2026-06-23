/**
 * Reconstructs a target's DSL block graph from raw SB3 blocks. This reverses
 * src/sb3/blockSerializer.ts: it converts fields, restores input descriptors,
 * expands inlined compact primitives back into real blocks (with deterministic,
 * collision-free ids), and parses custom-block mutations.
 *
 * Round-trip property (verified in tests): for known blocks,
 *   serializeBlocks(rawBlocksToDsl(serializeBlocks(dsl)).blocks) === serializeBlocks(dsl)
 * i.e. import → export reproduces the original SB3 block dictionary.
 */

import type {DslBlock, DslField} from '../../validation/blockGraphValidator.ts';
import type {ImportDiagnostics} from './diagnostics.ts';
import {expandPrimitive} from './primitiveExpand.ts';
import {restoreInput} from './inputRestore.ts';
import {parseMutation} from './mutationParse.ts';

export interface BlockGraph {
    blocks: Record<string, DslBlock>;
    /** Top-level (hat / standalone) block ids, in source order. */
    scripts: string[];
}

const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

// SB3 block keys the DSL models explicitly; anything else is kept opaquely.
const KNOWN_BLOCK_KEYS = new Set([
    'opcode', 'next', 'parent', 'inputs', 'fields', 'shadow', 'topLevel', 'x', 'y', 'mutation', 'comment'
]);

const stringOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null);

/** Converts an SB3 field (`[value]` or `[value, id]`) to a DSL field. */
const toField = (raw: unknown): DslField | null => {
    if (!Array.isArray(raw) || raw.length === 0) return null;
    const value = raw[0];
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return null;
    const field: DslField = {value};
    if (raw.length >= 2 && raw[1] !== undefined) field.id = raw[1] === null ? null : String(raw[1]);
    return field;
};

/**
 * Rebuilds the DSL block dictionary and script roots for one target's raw SB3
 * block map. `pathBase` and `diagnostics` are used to report recoverable issues.
 */
export const rawBlocksToDsl = (
    rawBlocks: Record<string, unknown>,
    diagnostics?: ImportDiagnostics,
    pathBase = 'blocks'
): BlockGraph => {
    const out: Record<string, DslBlock> = {};
    const scripts: string[] = [];

    // Deterministic, collision-free ids for expanded primitives.
    const used = new Set<string>(Object.keys(rawBlocks));
    const allocId = (base: string): string => {
        if (!used.has(base)) {
            used.add(base);
            return base;
        }
        let counter = 2;
        while (used.has(`${base}-${counter}`)) counter++;
        const id = `${base}-${counter}`;
        used.add(id);
        return id;
    };

    for (const [blockId, rawValue] of Object.entries(rawBlocks)) {
        if (!isObject(rawValue)) continue; // W2 already diagnosed non-object blocks
        const path = `${pathBase}.${blockId}`;
        const opcode = stringOrNull(rawValue.opcode) ?? '';

        const block: DslBlock = {
            id: blockId,
            opcode,
            next: stringOrNull(rawValue.next),
            parent: stringOrNull(rawValue.parent),
            inputs: {},
            fields: {},
            shadow: rawValue.shadow === true,
            topLevel: rawValue.topLevel === true
        };

        if (block.topLevel) {
            block.x = typeof rawValue.x === 'number' ? rawValue.x : 0;
            block.y = typeof rawValue.y === 'number' ? rawValue.y : 0;
            scripts.push(blockId);
        }

        if (isObject(rawValue.fields)) {
            for (const [name, rawField] of Object.entries(rawValue.fields)) {
                const field = toField(rawField);
                if (field) {
                    block.fields[name] = field;
                } else {
                    diagnostics?.preservable({code: 'sb3.field.invalid', path: `${path}.fields.${name}`, entityId: blockId, opcode, message: 'Field is not a [value] / [value, id] array.'});
                }
            }
        }

        if (isObject(rawValue.inputs)) {
            for (const [name, descriptor] of Object.entries(rawValue.inputs)) {
                block.inputs[name] = restoreInput(descriptor, {
                    expand: (primitive, slot) => {
                        const id = allocId(`${blockId}-${name}-${slot}`);
                        const expanded = expandPrimitive(primitive, id, blockId);
                        if (!expanded) {
                            used.delete(id);
                            diagnostics?.preservable({code: 'sb3.input.primitive-unknown', path: `${path}.inputs.${name}`, entityId: blockId, opcode, message: `Unrecognized compact primitive ${JSON.stringify(primitive)}.`});
                            return null;
                        }
                        out[id] = expanded;
                        return id;
                    },
                    onIssue: (code, message) => diagnostics?.preservable({code, path: `${path}.inputs.${name}`, entityId: blockId, opcode, message})
                });
            }
        }

        if (isObject(rawValue.mutation)) {
            const {mutation, malformed} = parseMutation(rawValue.mutation);
            block.mutation = mutation;
            for (const key of malformed) {
                diagnostics?.preservable({code: 'sb3.mutation.malformed-json', path: `${path}.mutation.${key}`, entityId: blockId, opcode, message: `mutation.${key} is not valid JSON; kept as raw string.`});
            }
        }

        if (typeof rawValue.comment === 'string') block.comment = rawValue.comment;

        const opaque: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(rawValue)) {
            if (!KNOWN_BLOCK_KEYS.has(key)) opaque[key] = value;
        }
        if (Object.keys(opaque).length > 0) block.opaque = opaque;

        out[blockId] = block;
    }

    return {blocks: out, scripts};
};
