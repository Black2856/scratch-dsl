import type {DslList} from '../validation/projectValidator.ts';

export type ListValue = string | number | boolean;

/**
 * Holds the list set owned by a single target (Stage or Sprite). As with
 * VariableStore, cross-target scope resolution (local vs global) lives on
 * Project, not here.
 */
export class ListStore {
    private readonly listsById: Map<string, DslList>;

    constructor(lists: DslList[]) {
        this.listsById = new Map(lists.map(list => [list.id, list]));
    }

    has(id: string): boolean {
        return this.listsById.has(id);
    }

    get(id: string): ListValue[] | undefined {
        return this.listsById.get(id)?.values;
    }

    getEntry(id: string): DslList | undefined {
        return this.listsById.get(id);
    }

    getByName(name: string): DslList | undefined {
        for (const list of this.listsById.values()) {
            if (list.name === name) return list;
        }
        return undefined;
    }

    values(): DslList[] {
        return [...this.listsById.values()];
    }

    [Symbol.iterator](): IterableIterator<DslList> {
        return this.listsById.values();
    }

    toArray(): DslList[] {
        return this.values();
    }
}
