import {STAGE_WIDTH, STAGE_HEIGHT} from './coordinates.ts';
import {Cast} from '../cast/Cast.ts';
import type {Runtime} from './Runtime.ts';

export interface Point {
    x: number;
    y: number;
}

/**
 * Resolves motion/sensing menu values to a stage position, mirroring the
 * official VM's `getTargetXY`:
 *  - `_mouse_`  → the current mouse position from the InputPort (0,0 headless).
 *  - `_random_` → a random point on the fixed 480×360 stage via Runtime.random.
 *  - sprite name → the named original sprite's position.
 * Returns null when a named target does not exist, so callers can apply the
 * official "missing target" fallbacks (no-op for goto, 10000 for distance).
 */
export const resolveTargetXY = (runtime: Runtime, name: string): Point | null => {
    if (name === '_mouse_') {
        return {
            x: runtime.input?.getMouseX() ?? 0,
            y: runtime.input?.getMouseY() ?? 0
        };
    }
    if (name === '_random_') {
        return {
            x: Math.round(STAGE_WIDTH * (runtime.random.random() - 0.5)),
            y: Math.round(STAGE_HEIGHT * (runtime.random.random() - 0.5))
        };
    }
    const target = runtime.project.sprites.find(sprite => sprite.name === Cast.toString(name));
    if (!target) return null;
    return {x: target.x, y: target.y};
};
