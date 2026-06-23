/**
 * Reverse of blockSerializer's input descriptors. SB3 encodes an input as
 * `[1, x]` (shadow only), `[2, x]` (block only), or `[3, block, shadow]`
 * (block obscuring a shadow), where each value is either a block id (string) or
 * a compact primitive array. Import restores the DSL `{block, shadow}` form.
 *
 * Primitive expansion + id allocation is injected via `expand` so this stays a
 * pure descriptor decoder; blocksToDsl owns the output dictionary.
 */

import type {DslInput} from '../../validation/blockGraphValidator.ts';

export interface InputRestoreContext {
    /** Expands a compact primitive into a registered block, returning its id (or null if unexpandable). */
    expand: (primitive: readonly unknown[], slot: 'shadow' | 'reporter') => string | null;
    onIssue?: (code: string, message: string) => void;
}

/** Resolves one input value (block-id string or compact primitive) to a block id. */
const resolveValue = (value: unknown, slot: 'shadow' | 'reporter', ctx: InputRestoreContext): string | null => {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return ctx.expand(value, slot);
    // Scratch encodes an empty slot as `[tag, null]` (e.g. an unfilled boolean
    // or custom-argument input). That is a valid empty input, not an error.
    if (value === null || value === undefined) return null;
    ctx.onIssue?.('sb3.input.value-invalid', `Input value is neither a block id nor a primitive (${JSON.stringify(value)}).`);
    return null;
};

/**
 * Restores an SB3 input descriptor into a DSL `{block, shadow}` pair.
 * Unrecognized descriptors yield an empty input and an issue.
 */
export const restoreInput = (descriptor: unknown, ctx: InputRestoreContext): DslInput => {
    if (!Array.isArray(descriptor) || descriptor.length < 2) {
        ctx.onIssue?.('sb3.input.descriptor-invalid', `Input descriptor malformed (${JSON.stringify(descriptor)}).`);
        return {block: null, shadow: null};
    }

    const tag = descriptor[0];
    if (tag === 1) {
        const ref = resolveValue(descriptor[1], 'shadow', ctx);
        return {block: ref, shadow: ref};
    }
    if (tag === 2) {
        const ref = resolveValue(descriptor[1], 'reporter', ctx);
        return {block: ref, shadow: null};
    }
    if (tag === 3) {
        const block = resolveValue(descriptor[1], 'reporter', ctx);
        const shadow = resolveValue(descriptor[2], 'shadow', ctx);
        return {block, shadow};
    }

    ctx.onIssue?.('sb3.input.descriptor-unknown', `Unknown input descriptor tag ${JSON.stringify(tag)}.`);
    return {block: null, shadow: null};
};
