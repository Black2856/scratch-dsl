import {Sprite, type SpriteOptions} from './Sprite.ts';
import {VariableStore} from './VariableStore.ts';
import {ListStore} from './ListStore.ts';
import {generateId} from './id.ts';

/**
 * A runtime clone of a Sprite. Mirrors the official VM's RenderedTarget
 * clone: it shares the source sprite's block graph and costume/sound metadata
 * (read-only at runtime) but owns an independent copy of every variable and
 * list value, so a clone's data mutations never leak back to the original.
 * Position/size/direction/visibility/costume are copied from the source at
 * creation time. `original` always points at the root Sprite even when a
 * clone is itself cloned (`create clone of myself`).
 */
export class Clone extends Sprite {
    readonly isClone = true as const;
    readonly original: Sprite;

    private constructor(options: SpriteOptions, original: Sprite) {
        super(options);
        this.original = original;
    }

    /**
     * Builds a clone from `source` (which may itself be a clone). Variable and
     * list stores are deep-copied; the block graph, costumes, and sounds are
     * shared by reference. `id` defaults to a freshly generated stable ID.
     */
    static fromSource(source: Sprite, id: string = generateId(20)): Clone {
        const root = source instanceof Clone ? source.original : source;
        const variables = new VariableStore(source.variables.values().map(variable => ({...variable})));
        const lists = new ListStore(source.lists.values().map(list => ({...list, values: [...list.values]})));

        const options: SpriteOptions = {
            id,
            name: source.name,
            isStage: false,
            blocks: source.blocks,
            variables,
            lists,
            comments: source.comments,
            currentCostume: source.currentCostume,
            costumes: source.costumes,
            sounds: source.sounds,
            volume: source.volume,
            layerOrder: source.layerOrder,
            visible: source.visible,
            x: source.x,
            y: source.y,
            size: source.size,
            direction: source.direction,
            draggable: source.draggable,
            rotationStyle: source.rotationStyle
        };
        return new Clone(options, root);
    }
}
