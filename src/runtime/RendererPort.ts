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
    /** Graphic effect values (color, fisheye, whirl, pixelate, mosaic, brightness, ghost). */
    effects?: Readonly<Record<string, number>>;
}

/**
 * A single variable monitor to paint as a stage overlay. Coordinates are in
 * the official monitor space (origin top-left, +x right, +y down) so they map
 * directly to the values stored in a project's `monitors` array.
 */
export interface MonitorView {
    id: string;
    label: string;
    value: string;
    x: number;
    y: number;
}

/** A say/think bubble to paint, anchored to its target's current placement. */
export interface BubbleView {
    targetId: string;
    type: 'say' | 'think';
    text: string;
}

/** A point in Scratch stage coordinates (origin centre, y-up). */
export interface PenPoint {
    x: number;
    y: number;
}

/**
 * Absolute axis-aligned bounds of a drawable in Scratch stage coordinates
 * (origin centre, y-up): left ≤ right and bottom ≤ top. Used by edge bounce
 * and (later) collision candidate culling.
 */
export interface Bounds {
    left: number;
    right: number;
    top: number;
    bottom: number;
}

/** Dynamic placement passed to bounds/fence queries (current, not last-frame). */
export interface DrawableTransform {
    x: number;
    y: number;
    size: number;
    direction: number;
    rotationStyle: 'all around' | 'left-right' | "don't rotate";
}

/** Pen stroke attributes: a CSS colour string and a line diameter in px. */
export interface PenAttributes {
    color: string;
    size: number;
}

/**
 * Optional rendering/query seam for the headless Runtime. There is no in-repo
 * renderer (visuals run in the real Scratch VM); this interface is kept so
 * tests can inject a fake port to exercise renderer-dependent behaviour
 * (fencing, bounds, pick, touching, pen geometry). Runtime never depends on a
 * DOM/Canvas implementation.
 *
 * All methods are optional: with no port attached, the Runtime skips them and
 * PenManager still tracks pen state. Pen coordinates are in Scratch stage space.
 */
export interface RendererPort {
    renderDrawables(states: DrawableState[]): void;
    /**
     * Paints visible variable monitors on top of the stage for the current
     * frame. Optional: a headless Runtime (or a renderer without monitor
     * support) skips the readout overlay.
     */
    renderMonitors?(monitors: MonitorView[]): void;
    /**
     * Paints active say/think bubbles for the current frame. Optional: a
     * headless Runtime (or a renderer without bubble support) skips them.
     */
    renderBubbles?(bubbles: BubbleView[]): void;
    /** Clears the entire pen layer. */
    penClear?(): void;
    /** Draws a filled pen dot at `point`. */
    penPoint?(point: PenPoint, attributes: PenAttributes): void;
    /** Draws a pen line segment between two points. */
    penLine?(from: PenPoint, to: PenPoint, attributes: PenAttributes): void;
    /**
     * Stamps the target's drawable onto the pen layer. `state` carries the
     * sprite's current placement so the stamp lands at the live position (not
     * the last rendered frame); without it the renderer falls back to that frame.
     */
    penStamp?(targetId: string, state?: DrawableState): void;
    /** Reuses a source target's current Skin for a newly-created clone. */
    cloneTargetSkin?(sourceTargetId: string, cloneTargetId: string): void;
    /** Releases any renderer state cached for a target (e.g. a deleted clone). */
    releaseTarget?(targetId: string): void;
    /**
     * Returns the position clamped so the target's drawable cannot move fully
     * off-stage (Scratch fencing). `transform` carries the dynamic placement
     * (size/direction/rotationStyle); the renderer combines it with the
     * target's registered skin bounds. Returns the input unchanged when no
     * skin/bounds are available. Optional: a headless Runtime with no renderer
     * skips fencing entirely, matching the official VM's `if (this.renderer)`.
     */
    getFencedPosition?(
        targetId: string,
        x: number,
        y: number,
        transform: {size: number; direction: number; rotationStyle: 'all around' | 'left-right' | "don't rotate"}
    ): [number, number];
    /**
     * Absolute stage-space bounds for the target's drawable under the given
     * (current) transform, or null when no skin/bounds are available. Used by
     * `motion_ifonedgebounce`; with no renderer the bounce is a no-op, matching
     * the official VM's `if (!bounds) return`.
     */
    getBounds?(targetId: string, transform: DrawableTransform): Bounds | null;
    /**
     * Returns the id of the front-most visible target whose drawable contains
     * the stage point (x, y), or null if none. Used for click hats; resolves
     * against the most recently rendered scene (what the user clicked on).
     */
    pickTarget?(x: number, y: number): string | null;
    /** True when the target's drawable covers the stage point (alpha-aware). */
    isTouchingPoint?(targetId: string, x: number, y: number): boolean;
    /** True when the target's drawable reaches outside the stage rectangle. */
    isTouchingEdge?(targetId: string): boolean;
    /** True when the target's drawable overlaps any of the candidate drawables. */
    isTouchingTargets?(targetId: string, candidateIds: string[]): boolean;
    /** True when the target's drawable touches `color` ([r,g,b]) in the composited scene. */
    isTouchingColor?(targetId: string, color: readonly [number, number, number]): boolean;
    /**
     * True when the `mask`-coloured part of the target's own drawable touches
     * `color` in the rest of the composited scene (color is touching color).
     */
    isColorTouchingColor?(
        targetId: string,
        color: readonly [number, number, number],
        mask: readonly [number, number, number]
    ): boolean;
}
