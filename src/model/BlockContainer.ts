import type {DslBlock, DslInput} from '../validation/blockGraphValidator.ts';

/**
 * Holds a target's block graph: the ID-keyed dictionary of blocks plus the
 * ordered list of top-level script root IDs. Blocks are kept verbatim
 * (including opaque/unknown opcode data and mutation) so round-tripping back
 * to DSL never loses information.
 */
export class BlockContainer {
    private readonly blocksById: Map<string, DslBlock>;
    private readonly topLevelScriptIds: string[];

    constructor(blocks: Record<string, DslBlock>, scripts: string[]) {
        this.blocksById = new Map(Object.entries(blocks));
        this.topLevelScriptIds = [...scripts];
    }

    getBlock(id: string): DslBlock | undefined {
        return this.blocksById.get(id);
    }

    hasBlock(id: string): boolean {
        return this.blocksById.has(id);
    }

    getScripts(): string[] {
        return [...this.topLevelScriptIds];
    }

    getNext(id: string): string | null | undefined {
        return this.blocksById.get(id)?.next;
    }

    getParent(id: string): string | null | undefined {
        return this.blocksById.get(id)?.parent;
    }

    getInputs(id: string): Record<string, DslInput> | undefined {
        return this.blocksById.get(id)?.inputs;
    }

    blockIds(): string[] {
        return [...this.blocksById.keys()];
    }

    [Symbol.iterator](): IterableIterator<DslBlock> {
        return this.blocksById.values();
    }

    toRecord(): Record<string, DslBlock> {
        return Object.fromEntries(this.blocksById.entries());
    }
}
