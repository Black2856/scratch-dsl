import type {DslComment, DslCostume, DslSound} from '../validation/projectValidator.ts';
import {BlockContainer} from './BlockContainer.ts';
import {VariableStore} from './VariableStore.ts';
import {ListStore} from './ListStore.ts';

export interface TargetOptions {
    id: string;
    name: string;
    isStage: boolean;
    blocks: BlockContainer;
    variables: VariableStore;
    lists: ListStore;
    comments: DslComment[];
    currentCostume: number;
    costumes: DslCostume[];
    sounds: DslSound[];
    volume: number;
    layerOrder: number;
}

/**
 * Common base for Stage and Sprite. Holds everything that both target kinds
 * share: identity, block graph, local variable/list stores, comments,
 * costumes/sounds metadata, volume and layer order.
 *
 * Broadcasts are intentionally NOT stored here: they are project-wide and
 * live on Project/BroadcastStore.
 */
export class Target {
    readonly id: string;
    readonly name: string;
    readonly isStage: boolean;
    readonly blocks: BlockContainer;
    readonly variables: VariableStore;
    readonly lists: ListStore;
    readonly comments: DslComment[];
    currentCostume: number;
    readonly costumes: DslCostume[];
    readonly sounds: DslSound[];
    volume: number;
    layerOrder: number;

    constructor(options: TargetOptions) {
        this.id = options.id;
        this.name = options.name;
        this.isStage = options.isStage;
        this.blocks = options.blocks;
        this.variables = options.variables;
        this.lists = options.lists;
        this.comments = [...options.comments];
        this.currentCostume = options.currentCostume;
        this.costumes = [...options.costumes];
        this.sounds = [...options.sounds];
        this.volume = Target.clampVolume(options.volume);
        this.layerOrder = options.layerOrder;
    }

    setVolume(value: number): void {
        this.volume = Target.clampVolume(value);
    }

    changeVolume(delta: number): void {
        this.setVolume(this.volume + delta);
    }

    /** Sets the current costume by 0-based index, wrapping into range. No-op with no costumes. */
    setCostume(index: number): void {
        const count = this.costumes.length;
        if (count === 0) return;
        const rounded = Math.round(index);
        if (!Number.isFinite(rounded)) return;
        this.currentCostume = ((rounded % count) + count) % count;
    }

    setLayerOrder(order: number): void {
        this.layerOrder = order;
    }

    private static clampVolume(value: number): number {
        if (!Number.isFinite(value)) return 0;
        return Math.min(100, Math.max(0, value));
    }
}
