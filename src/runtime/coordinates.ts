/**
 * Stage coordinate helpers and constants. Pure functions, no DOM dependency.
 * The native Stage is 480x360 with the Scratch origin at the center
 * (x: -240..240, y: -180..180); canvas-pixel conversions (origin top-left,
 * y down) are kept for any host that needs them.
 */

export const STAGE_WIDTH = 480;
export const STAGE_HEIGHT = 360;

export interface Point {
    x: number;
    y: number;
}

export interface ClientRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

/** Converts Scratch stage coordinates (origin center, y-up) to Canvas pixel coordinates (origin top-left, y-down). */
export const scratchToCanvas = (x: number, y: number): Point => ({
    x: x + STAGE_WIDTH / 2,
    y: STAGE_HEIGHT / 2 - y
});

/** Converts Canvas pixel coordinates back to Scratch stage coordinates. Inverse of scratchToCanvas. */
export const canvasToScratch = (cx: number, cy: number): Point => ({
    x: cx - STAGE_WIDTH / 2,
    y: STAGE_HEIGHT / 2 - cy
});

/**
 * Converts a pointer/mouse event's client (viewport) coordinates to Scratch
 * stage coordinates, normalizing for CSS display scaling against the fixed
 * 480x360 internal canvas size. `rect` is the canvas's
 * getBoundingClientRect() (or an equivalent plain object for testing).
 */
export const clientToScratch = (clientX: number, clientY: number, rect: ClientRect): Point => {
    const cx = ((clientX - rect.left) * STAGE_WIDTH) / rect.width;
    const cy = ((clientY - rect.top) * STAGE_HEIGHT) / rect.height;
    return canvasToScratch(cx, cy);
};

/** Converts a Scratch `direction` (0 = up, 90 = right, clockwise) to a Canvas rotation angle in radians. */
export const directionToRadians = (direction: number): number => ((direction - 90) * Math.PI) / 180;

/**
 * Stable sort by ascending `layerOrder` (back-to-front paint order). Uses a
 * decorate-sort-undecorate approach so equal-layerOrder items retain their
 * original relative order regardless of engine sort stability quirks.
 */
export const sortByLayer = <T extends {layerOrder: number}>(items: T[]): T[] =>
    items
        .map((item, index) => ({item, index}))
        .sort((a, b) => (a.item.layerOrder - b.item.layerOrder) || (a.index - b.index))
        .map(entry => entry.item);
