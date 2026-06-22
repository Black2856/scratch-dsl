/**
 * Browser-only rendering surface for a single costume. Mirrors the official
 * scratch-render Skin contract in minimal form: a drawable image plus the
 * rotation center used to align the sprite's "hot spot" with its
 * Scratch-space position. No asset decoding/caching lives here (no
 * AssetManager) — concrete Skin implementations accept already-decoded
 * image sources directly, per Phase 3 scope.
 */
export interface Skin {
    /** Rotation center in *logical* (stage) units, i.e. native px / bitmapResolution. */
    readonly rotationCenterX: number;
    readonly rotationCenterY: number;
    /**
     * Logical units per native image pixel (= 1 / bitmapResolution). A 960×720
     * costume at bitmapResolution 2 has scale 0.5 and renders 480×360. Defaults
     * to 1 (native == logical) when omitted.
     */
    readonly scale?: number;

    /** Returns the current drawable image source, or null if not yet ready. */
    getImage(): CanvasImageSource | null;
}
