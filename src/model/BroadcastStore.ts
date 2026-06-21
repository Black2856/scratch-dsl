import type {DslBroadcast} from '../validation/projectValidator.ts';

/**
 * Project-wide broadcast registry. Broadcasts are declared by the Stage but
 * shared across the whole project, so a single BroadcastStore instance is
 * owned by Project (not per-target).
 */
export class BroadcastStore {
    private readonly broadcastsById: Map<string, DslBroadcast>;

    constructor(broadcasts: DslBroadcast[]) {
        this.broadcastsById = new Map(broadcasts.map(broadcast => [broadcast.id, broadcast]));
    }

    has(id: string): boolean {
        return this.broadcastsById.has(id);
    }

    getById(id: string): DslBroadcast | undefined {
        return this.broadcastsById.get(id);
    }

    getByName(name: string): DslBroadcast | undefined {
        for (const broadcast of this.broadcastsById.values()) {
            if (broadcast.name === name) return broadcast;
        }
        return undefined;
    }

    values(): DslBroadcast[] {
        return [...this.broadcastsById.values()];
    }

    [Symbol.iterator](): IterableIterator<DslBroadcast> {
        return this.broadcastsById.values();
    }

    toArray(): DslBroadcast[] {
        return this.values();
    }
}
