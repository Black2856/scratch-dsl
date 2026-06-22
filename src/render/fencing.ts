/**
 * Scratch fencing (DOM-independent, pure). Mirrors scratch-render's
 * Renderer.getFencedPositionOfDrawable: a sprite cannot move so far that its
 * drawable leaves the Stage entirely. At least `min(FENCE_WIDTH, half the
 * drawable)` px of the drawable's axis-aligned bounding box stays on Stage.
 *
 * Bounds are the *fast* (rectangle) AABB of the transformed costume image —
 * the transformed bounding box, matching scratch-render's getFastBounds()
 * (no silhouette tightening). This is why "set x to 300" lands near 261 for a
 * small, large-scaled costume: the limit depends on the drawable's size,
 * rotation centre, direction and costume dimensions, per SCRATCH_RENDER_SPEC
 * (P0: transformed bounding box).
 */
import {STAGE_WIDTH, STAGE_HEIGHT, directionToRadians} from './coordinates.ts';

/** Matches DrawableState.rotationStyle; inlined so this module stays model-independent. */
export type RotationStyle = 'all around' | 'left-right' | "don't rotate";

export const FENCE_WIDTH = 15;

/** Axis-aligned bounds as offsets from the drawable's centre, in Scratch coords (y-up). */
export interface LocalBounds {
    left: number;
    right: number;
    top: number;
    bottom: number;
}

/** True when `direction` faces left, per the left-right rotation style. */
const facesLeft = (direction: number): boolean => {
    const normalized = ((direction % 360) + 360) % 360;
    return normalized > 180;
};

/**
 * Computes the fast (rectangle) AABB of a transformed costume image as offsets
 * from the sprite's position, in Scratch coordinates. Uses the same transform
 * order as CanvasRenderer.paintDrawable (scale → rotate → flip), then converts
 * the canvas-space (y-down) corners to Scratch space (y-up).
 */
export const computeLocalBounds = (
    imageWidth: number,
    imageHeight: number,
    rotationCenterX: number,
    rotationCenterY: number,
    size: number,
    direction: number,
    rotationStyle: RotationStyle
): LocalBounds => {
    const scale = size / 100;
    let rotation = 0;
    let flip = false;
    if (rotationStyle === 'all around') {
        rotation = directionToRadians(direction);
    } else if (rotationStyle === 'left-right') {
        flip = facesLeft(direction);
    }
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);

    let left = Infinity;
    let right = -Infinity;
    let top = -Infinity;
    let bottom = Infinity;
    for (const ix of [0, imageWidth]) {
        for (const iy of [0, imageHeight]) {
            const lx = scale * (ix - rotationCenterX);
            const ly = scale * (iy - rotationCenterY);
            let rx = lx * cos - ly * sin;
            const ry = lx * sin + ly * cos;
            if (flip) rx = -rx;
            const scratchX = rx;
            const scratchY = -ry; // canvas y-down -> Scratch y-up
            if (scratchX < left) left = scratchX;
            if (scratchX > right) right = scratchX;
            if (scratchY < bottom) bottom = scratchY;
            if (scratchY > top) top = scratchY;
        }
    }
    return {left, right, top, bottom};
};

/**
 * Clamps (x, y) so a drawable with the given local bounds keeps at least
 * `min(FENCE_WIDTH, half-extent)` px of its bounding box on Stage. Pure mirror
 * of scratch-render's getFencedPositionOfDrawable.
 */
export const fencePosition = (
    x: number,
    y: number,
    bounds: LocalBounds
): [number, number] => {
    const xRight = STAGE_WIDTH / 2; // 240
    const yTop = STAGE_HEIGHT / 2; // 180
    const width = bounds.right - bounds.left;
    const height = bounds.top - bounds.bottom;
    const inset = Math.floor(Math.min(width, height) / 2);

    let fx = x;
    const sx = xRight - Math.min(FENCE_WIDTH, inset);
    if (x + bounds.right < -sx) {
        fx = Math.ceil(-sx - bounds.right);
    } else if (x + bounds.left > sx) {
        fx = Math.floor(sx - bounds.left);
    }

    let fy = y;
    const sy = yTop - Math.min(FENCE_WIDTH, inset);
    // Mirror scratch-render: moving down past the bottom clamps on the box's
    // TOP edge; moving up past the top clamps on the BOTTOM edge. (For an
    // asymmetric or rotated AABB top != -bottom, so these must not be swapped.)
    if (y + bounds.top < -sy) {
        fy = Math.ceil(-sy - bounds.top);
    } else if (y + bounds.bottom > sy) {
        fy = Math.floor(sy - bounds.bottom);
    }

    return [fx, fy];
};
