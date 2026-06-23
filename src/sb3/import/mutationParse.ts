/**
 * Reverse of blockSerializer's mutation normalization. Export JSON-stringifies
 * `argumentids`/`argumentnames`/`argumentdefaults` and encodes `warp` as a
 * `"true"`/`"false"` string. Import parses those back to arrays/boolean for the
 * DSL form while keeping every other key (including unknown/extension keys)
 * untouched, so custom-block mutations re-serialize without information loss.
 */

const ARRAY_KEYS = ['argumentids', 'argumentnames', 'argumentdefaults'];

export interface MutationParseResult {
    mutation: Record<string, unknown>;
    /** Keys whose JSON string failed to parse (kept as the raw string). */
    malformed: string[];
}

/** Parses a raw SB3 mutation object into the DSL mutation form. */
export const parseMutation = (raw: Record<string, unknown>): MutationParseResult => {
    const mutation: Record<string, unknown> = {...raw};
    const malformed: string[] = [];

    for (const key of ARRAY_KEYS) {
        const value = mutation[key];
        if (typeof value !== 'string') continue;
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) {
                mutation[key] = parsed;
            } else {
                malformed.push(key);
            }
        } catch {
            malformed.push(key);
        }
    }

    if (mutation.warp === 'true') mutation.warp = true;
    else if (mutation.warp === 'false') mutation.warp = false;

    return {mutation, malformed};
};
