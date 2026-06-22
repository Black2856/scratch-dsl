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
    visible: boolean;
    x: number;
    y: number;
    size: number;
    direction: number;
    readonly draggable: boolean;
    rotationStyle: RotationStyle;

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

    /**
     * Sets size as a percentage. Finite-guarded; the costume-relative min/max
     * clamp the official VM applies (so a sprite cannot shrink below ~5px or
     * grow past ~1.5x the stage) is not modelled here — see
     * docs/TURBOWARP_DIFF_AUDIT.md.
     */
    setSize(size: number): void {
        if (Number.isFinite(size)) this.size = size;
    }

    setVisible(visible: boolean): void {
        this.visible = visible;
    }

    /** Sets direction, wrapped to the Scratch (-180, 180] range. */
    setDirection(direction: number): void {
        if (!Number.isFinite(direction)) return;
        let wrapped = direction % 360;
        if (wrapped > 180) wrapped -= 360;
        if (wrapped <= -180) wrapped += 360;
        this.direction = wrapped;
    }

    setRotationStyle(style: RotationStyle): void {
        this.rotationStyle = style;
    }
}
