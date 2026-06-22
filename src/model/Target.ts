import type {DslComment, DslCostume, DslSound} from '../validation/projectValidator.ts';
import {BlockContainer} from './BlockContainer.ts';
import {VariableStore} from './VariableStore.ts';
import {ListStore} from './ListStore.ts';

/** The seven Scratch graphic effects, all defaulting to 0 (no effect). */
export interface GraphicEffects {
    color: number;
    fisheye: number;
    whirl: number;
    pixelate: number;
    mosaic: number;
    brightness: number;
    ghost: number;
}

export const GRAPHIC_EFFECT_NAMES: ReadonlyArray<keyof GraphicEffects> =
    ['color', 'fisheye', 'whirl', 'pixelate', 'mosaic', 'brightness', 'ghost'];

const zeroEffects = (): GraphicEffects => ({
    color: 0, fisheye: 0, whirl: 0, pixelate: 0, mosaic: 0, brightness: 0, ghost: 0
});

/** Per-target sound effects (pitch -360..360, pan -100..100), default 0. */
export interface SoundEffects {
    pitch: number;
    pan: number;
}

const SOUND_EFFECT_RANGE: Record<keyof SoundEffects, {min: number; max: number}> = {
    pitch: {min: -360, max: 360},
    pan: {min: -100, max: 100}
};

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
    /** Live graphic effect values (per-target; clones copy then diverge). */
    readonly effects: GraphicEffects = zeroEffects();
    /** Live sound effect values (per-target; clones copy then diverge). */
    readonly soundEffects: SoundEffects = {pitch: 0, pan: 0};

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

    /** Returns the 0-based index of the costume with `name`, or -1 if none. */
    getCostumeIndexByName(name: string): number {
        return this.costumes.findIndex(costume => costume.name === name);
    }

    /** Sets one graphic effect to an (already-clamped) value. Ignores unknown names. */
    setEffect(name: string, value: number): void {
        if (Object.prototype.hasOwnProperty.call(this.effects, name)) {
            this.effects[name as keyof GraphicEffects] = value;
        }
    }

    /** Resets every graphic effect to 0. */
    clearEffects(): void {
        for (const name of GRAPHIC_EFFECT_NAMES) this.effects[name] = 0;
    }

    /** Copies another target's effect values (clone creation). */
    copyEffectsFrom(other: Target): void {
        for (const name of GRAPHIC_EFFECT_NAMES) this.effects[name] = other.effects[name];
    }

    /** Sets or changes one sound effect (pitch/pan), clamped to its range. */
    setSoundEffect(name: string, value: number, change: boolean): void {
        if (name !== 'pitch' && name !== 'pan') return;
        const key = name as keyof SoundEffects;
        const next = (change ? this.soundEffects[key] : 0) + value;
        const {min, max} = SOUND_EFFECT_RANGE[key];
        this.soundEffects[key] = Math.min(max, Math.max(min, next));
    }

    /** Resets pitch and pan to 0. */
    clearSoundEffects(): void {
        this.soundEffects.pitch = 0;
        this.soundEffects.pan = 0;
    }

    /** Copies another target's sound effects (clone creation). */
    copySoundEffectsFrom(other: Target): void {
        this.soundEffects.pitch = other.soundEffects.pitch;
        this.soundEffects.pan = other.soundEffects.pan;
    }

    private static clampVolume(value: number): number {
        if (!Number.isFinite(value)) return 0;
        return Math.min(100, Math.max(0, value));
    }
}
