import {Target, type TargetOptions} from './Target.ts';

export type RotationStyle = 'all around' | 'left-right' | "don't rotate";

/**
 * Default values for sprite-only fields, per SCRATCH_TARGET_SPEC.md.
 * Exposed so DSL-to-model construction can fill in missing properties
 * with the same values the spec mandates.
 */
export const SPRITE_DEFAULTS = Object.freeze({
    x: 0,
    y: 0,
    size: 100,
    direction: 90,
    visible: true,
    draggable: false,
    rotationStyle: 'all around' as RotationStyle
});

export interface SpriteOptions extends TargetOptions {
    isStage: false;
    visible: boolean;
    x: number;
    y: number;
    size: number;
    direction: number;
    draggable: boolean;
    rotationStyle: RotationStyle;
}

/**
 * A Sprite target. Adds sprite-only fields (position, size, direction,
 * visibility, draggable, rotation style) on top of the common Target base.
 */
export class Sprite extends Target {
    readonly isStage: false = false;
    readonly visible: boolean;
    x: number;
    y: number;
    readonly size: number;
    readonly direction: number;
    readonly draggable: boolean;
    readonly rotationStyle: RotationStyle;

    constructor(options: SpriteOptions) {
        super(options);
        this.visible = options.visible;
        this.x = options.x;
        this.y = options.y;
        this.size = options.size;
        this.direction = options.direction;
        this.draggable = options.draggable;
        this.rotationStyle = options.rotationStyle;
    }

    setPosition(x: number, y: number): void {
        this.x = Number.isFinite(x) ? x : 0;
        this.y = Number.isFinite(y) ? y : 0;
    }
}
