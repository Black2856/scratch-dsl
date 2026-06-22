import type {Skin} from './Skin.ts';

/**
 * Minimal bitmap Skin: wraps an already-decoded HTMLImageElement or
 * ImageBitmap plus a rotation center. No asset fetching/decoding —
 * callers (tests, future AssetManager) supply the decoded image directly.
 */
export class BitmapSkin implements Skin {
    readonly rotationCenterX: number;
    readonly rotationCenterY: number;
    readonly scale: number;
    private readonly image: HTMLImageElement | ImageBitmap;

    /**
     * @param rotationCenterX/Y rotation center in logical (stage) units.
     * @param scale logical units per native pixel (= 1 / bitmapResolution).
     */
    constructor(
        image: HTMLImageElement | ImageBitmap,
        rotationCenterX: number,
        rotationCenterY: number,
        scale = 1
    ) {
        this.image = image;
        this.rotationCenterX = rotationCenterX;
        this.rotationCenterY = rotationCenterY;
        this.scale = scale;
    }

    getImage(): CanvasImageSource | null {
        return this.image;
    }
}
