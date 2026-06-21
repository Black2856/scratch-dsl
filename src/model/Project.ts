import type {DslAsset} from '../validation/projectValidator.ts';
import {Stage} from './Stage.ts';
import {Sprite} from './Sprite.ts';
import {BroadcastStore} from './BroadcastStore.ts';
import type {DslVariable} from '../validation/projectValidator.ts';
import type {DslList} from '../validation/projectValidator.ts';

export interface ProjectOptions {
    id: string;
    name: string;
    stage: Stage;
    sprites: Sprite[];
    broadcasts: BroadcastStore;
    assets: DslAsset[];
    monitors: Array<Record<string, unknown> & {id: string; opcode: string; visible: boolean}>;
    extensions: string[];
    meta: Record<string, unknown>;
}

/**
 * Root domain model. Owns the Stage, the Sprite collection, the project-wide
 * BroadcastStore, and project-level metadata (assets/monitors/extensions/
 * meta). Provides scope resolution helpers for variables and lists: a given
 * target's local store is checked first, then the Stage's store as the
 * global fallback (mirrors official Scratch VM scope rules, and matches the
 * scope contract enforced by blockGraphValidator at validation time).
 */
export class Project {
    readonly id: string;
    readonly name: string;
    readonly stage: Stage;
    readonly sprites: Sprite[];
    readonly broadcasts: BroadcastStore;
    readonly assets: DslAsset[];
    readonly monitors: Array<Record<string, unknown> & {id: string; opcode: string; visible: boolean}>;
    readonly extensions: string[];
    readonly meta: Record<string, unknown>;

    constructor(options: ProjectOptions) {
        this.id = options.id;
        this.name = options.name;
        this.stage = options.stage;
        this.sprites = [...options.sprites];
        this.broadcasts = options.broadcasts;
        this.assets = [...options.assets];
        this.monitors = [...options.monitors];
        this.extensions = [...options.extensions];
        this.meta = options.meta;
    }

    /** Returns the target (Stage or Sprite) with the given ID, if any. */
    getTarget(targetId: string): Stage | Sprite | undefined {
        if (this.stage.id === targetId) return this.stage;
        return this.sprites.find(sprite => sprite.id === targetId);
    }

    /**
     * Resolves a variable by ID for a given target: local store first, then
     * the Stage's (global) store. Returns undefined if not found in either.
     */
    resolveVariable(targetId: string, variableId: string): DslVariable | undefined {
        const target = this.getTarget(targetId);
        if (!target) return undefined;
        const local = target.variables.getEntry(variableId);
        if (local) return local;
        if (target === this.stage) return undefined;
        return this.stage.variables.getEntry(variableId);
    }

    /**
     * Resolves a list by ID for a given target: local store first, then the
     * Stage's (global) store. Returns undefined if not found in either.
     */
    resolveList(targetId: string, listId: string): DslList | undefined {
        const target = this.getTarget(targetId);
        if (!target) return undefined;
        const local = target.lists.getEntry(listId);
        if (local) return local;
        if (target === this.stage) return undefined;
        return this.stage.lists.getEntry(listId);
    }
}
