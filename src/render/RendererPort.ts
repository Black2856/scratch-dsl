/**
 * DOM-independent snapshot of one drawable target's render-relevant state,
 * as collected by Runtime.tick() from the Project model. No Skin/asset data
 * lives here — only the per-target placement state a RendererPort needs to
 * paint a frame.
 */
export interface DrawableState {
    targetId: string;
    isStage: boolean;
    x: number;
    y: number;
    size: number;
    direction: number;
    visible: boolean;
    rotationStyle: 'all around' | 'left-right' | "don't rotate";
    layerOrder: number;
    costumeIndex: number;
}

/** A point in Scratch stage coordinates (origin centre, y-up). */
export interface PenPoint {
    x: number;
    y: number;
}

/** Pen stroke attributes: a CSS colour string and a line diameter in px. */
export interface PenAttributes {
    color: string;
    size: number;
}

/**
 * Rendering seam between the headless Runtime and a concrete renderer
 * (e.g. CanvasRenderer). Runtime depends only on this interface, never on
 * any DOM/Canvas implementation, per Phase 3's architecture constraint.
 *
 * The pen and target-release methods are optional: a headless Runtime with no
 * renderer (or a renderer that does not implement them) simply skips
 * rasterisation while PenManager still tracks pen state. All pen coordinates
 * are in Scratch stage space; the renderer converts to canvas pixels.
 */
export interface RendererPort {
    renderDrawables(states: DrawableState[]): void;
    /** Clears the entire pen layer. */
    penClear?(): void;
    /** Draws a filled pen dot at `point`. */
    penPoint?(point: PenPoint, attributes: PenAttributes): void;
    /** Draws a pen line segment between two points. */
    penLine?(from: PenPoint, to: PenPoint, attributes: PenAttributes): void;
    /** Stamps the target's current drawable onto the pen layer. */
    penStamp?(targetId: string): void;
    /** Releases any renderer state cached for a target (e.g. a deleted clone). */
    releaseTarget?(targetId: string): void;
}
