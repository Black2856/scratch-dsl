import type {BlockContainer} from '../model/BlockContainer.ts';
import type {Stage} from '../model/Stage.ts';
import type {Sprite} from '../model/Sprite.ts';

/**
 * A custom block resolved from a `procedures_prototype` mutation: the
 * definition hat's id, the first body block to run (the hat's `next`, or null
 * for an empty definition), the argument id/name lists, and the warp flag.
 */
export interface ResolvedProcedure {
    definitionId: string;
    bodyId: string | null;
    paramIds: string[];
    paramNames: string[];
    warp: boolean;
}

const parseStringArray = (value: unknown): string[] => {
    if (Array.isArray(value)) {
        return value.every(item => typeof item === 'string') ? (value as string[]) : [];
    }
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) && parsed.every(item => typeof item === 'string') ? parsed : [];
        } catch {
            return [];
        }
    }
    return [];
};

const parseWarp = (value: unknown): boolean => value === true || value === 'true';

/**
 * Resolves `procedures_call` proccodes to their definition within a target.
 * Results are memoised per BlockContainer, so clones (which share their
 * sprite's block graph) reuse the original's lookups. The block graph is
 * read-only at runtime, so the cache never goes stale.
 */
export class ProcedureManager {
    private readonly cache = new WeakMap<BlockContainer, Map<string, ResolvedProcedure | null>>();

    resolve(target: Stage | Sprite, proccode: string): ResolvedProcedure | null {
        const container = target.blocks;
        let perContainer = this.cache.get(container);
        if (!perContainer) {
            perContainer = new Map();
            this.cache.set(container, perContainer);
        }
        if (perContainer.has(proccode)) return perContainer.get(proccode) ?? null;
        const resolved = this.lookup(container, proccode);
        perContainer.set(proccode, resolved);
        return resolved;
    }

    private lookup(container: BlockContainer, proccode: string): ResolvedProcedure | null {
        for (const block of container) {
            if (block.opcode !== 'procedures_prototype') continue;
            const mutation = block.mutation ?? {};
            if (mutation.proccode !== proccode) continue;
            const definitionId = block.parent;
            if (!definitionId) return null;
            const definition = container.getBlock(definitionId);
            if (!definition || definition.opcode !== 'procedures_definition') return null;
            return {
                definitionId,
                bodyId: container.getNext(definitionId) ?? null,
                paramIds: parseStringArray(mutation.argumentids),
                paramNames: parseStringArray(mutation.argumentnames),
                warp: parseWarp(mutation.warp)
            };
        }
        return null;
    }
}
