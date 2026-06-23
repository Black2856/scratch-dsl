/**
 * Small value guards and coercions shared across the SB3 import modules. Import
 * consumes untrusted JSON, so these keep the defensive reads consistent.
 */

export const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

export const asString = (value: unknown): string | null =>
    (typeof value === 'string' ? value : null);

export const num = (value: unknown, fallback: number): number =>
    (typeof value === 'number' ? value : fallback);

export const str = (value: unknown, fallback: string): string =>
    (typeof value === 'string' ? value : fallback);

export const bool = (value: unknown, fallback: boolean): boolean =>
    (typeof value === 'boolean' ? value : fallback);
