import type {DslVariable} from '../validation/projectValidator.ts';

export type VariableValue = string | number | boolean;

/**
 * Holds the variable set owned by a single target (Stage or Sprite). Scope
 * resolution across targets (local vs global) is handled by Project, not
 * here; this store only manages the variables physically declared on one
 * target.
 */
export class VariableStore {
    private readonly variablesById: Map<string, DslVariable>;

    constructor(variables: DslVariable[]) {
        this.variablesById = new Map(variables.map(variable => [variable.id, variable]));
    }

    has(id: string): boolean {
        return this.variablesById.has(id);
    }

    get(id: string): VariableValue | undefined {
        return this.variablesById.get(id)?.value;
    }

    getEntry(id: string): DslVariable | undefined {
        return this.variablesById.get(id);
    }

    set(id: string, value: VariableValue): void {
        const variable = this.variablesById.get(id);
        if (!variable) {
            throw new Error(`Variable ${id} does not exist in this store.`);
        }
        variable.value = value;
    }

    getByName(name: string): DslVariable | undefined {
        for (const variable of this.variablesById.values()) {
            if (variable.name === name) return variable;
        }
        return undefined;
    }

    values(): DslVariable[] {
        return [...this.variablesById.values()];
    }

    [Symbol.iterator](): IterableIterator<DslVariable> {
        return this.variablesById.values();
    }

    toArray(): DslVariable[] {
        return this.values();
    }
}
