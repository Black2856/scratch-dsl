import type {
    Bounds,
    BubbleView,
    DrawableState,
    DrawableTransform,
    MonitorView,
    PenAttributes,
    PenPoint,
    RendererPort
} from './RendererPort.ts';
import {Drawable} from './Drawable.ts';
import type {Skin} from './Skin.ts';
import {STAGE_WIDTH, STAGE_HEIGHT, scratchToCanvas, directionToRadians} from './coordinates.ts';
import {computeLocalBounds, fencePosition} from './fencing.ts';
import {applyColorBrightness, colorUniform, brightnessUniform} from './effectTransform.ts';

/** Reads a decoded image source's intrinsic pixel dimensions, or null if unavailable. */
const intrinsicSize = (image: CanvasImageSource): {width: number; height: number} | null => {
    const source = image as {naturalWidth?: number; naturalHeight?: number; width?: unknown; height?: unknown};
    const width = typeof source.naturalWidth === 'number' && source.naturalWidth > 0
        ? source.naturalWidth
        : (typeof source.width === 'number' ? source.width : 0);
    const height = typeof source.naturalHeight === 'number' && source.naturalHeight > 0
        ? source.naturalHeight
        : (typeof source.height === 'number' ? source.height : 0);
    if (width <= 0 || height <= 0) return null;
    return {width, height};
};

const FALLBACK_SIZE = 40;
const FALLBACK_COLORS = ['#6cc04a', '#ff8c1a', '#4a90d9', '#d94a4a', '#a64ad9'];

const fallbackColorFor = (targetId: string): string => {
    let hash = 0;
    for (let i = 0; i < targetId.length; i++) {
        hash = (hash * 31 + targetId.charCodeAt(i)) >>> 0;
    }
    return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
};

/**
 * Applies the ghost effect to the context as an exact alpha multiply before a
 * drawable is painted. color/brightness are applied per-pixel to the costume
 * image (see effectedImage); fisheye/whirl/pixelate/mosaic need a shader and
 * are not applied.
 */
const applyGhost = (ctx: CanvasRenderingContext2D, effects?: Readonly<Record<string, number>>): void => {
    const ghost = Math.max(0, Math.min(100, effects?.ghost ?? 0));
    if (ghost !== 0) ctx.globalAlpha = 1 - (ghost / 100);
};

/**
 * Scratch colour match: only the high 5/5/4 bits of R/G/B must agree (a small
 * tolerance), and the scene pixel must be opaque.
 */
const colorMatches = (data: Uint8ClampedArray, i: number, color: readonly [number, number, number]): boolean =>
    data[i + 3] > 0 &&
    ((data[i] ^ color[0]) & 0b11111000) === 0 &&
    ((data[i + 1] ^ color[1]) & 0b11111000) === 0 &&
    ((data[i + 2] ^ color[2]) & 0b11110000) === 0;

/** Returns true when `direction` faces left, per SCRATCH_RENDER_SPEC's left-right rotation style (90 < direction < 270 mod 360 faces left of "up"). */
const facesLeft = (direction: number): boolean => {
    const normalized = ((direction % 360) + 360) % 360;
    return normalized > 180;
};

/**
 * Canvas 2D implementation of RendererPort, per SCRATCH_RENDER_SPEC.md.
 * Internal canvas size is fixed at 480x360 regardless of CSS display size
 * (CSS-only zoom; pointer coordinates are normalized back via
 * coordinates.clientToScratch by the input layer, not here).
 */
export class CanvasRenderer implements RendererPort {
    private readonly canvas: HTMLCanvasElement;
    private readonly ctx: CanvasRenderingContext2D;
    private readonly penCanvas: HTMLCanvasElement;
    private readonly penCtx: CanvasRenderingContext2D;
    private readonly skins = new Map<string, Skin>();
    /** All costume skins per target, indexed by costume number; enables costume/backdrop switching. */
    private readonly costumeSkins = new Map<string, Skin[]>();
    /** Cache of color/brightness-baked costume images, keyed by source image then effect key. */
    private readonly effectCache = new WeakMap<CanvasImageSource, Map<string, HTMLCanvasElement>>();
    /** Lazy offscreen surfaces for touching-color queries (scene without target / target alone). */
    private querySceneCtx?: CanvasRenderingContext2D;
    private queryMaskCtx?: CanvasRenderingContext2D;
    private readonly lastStates = new Map<string, DrawableState>();
    private lastDrawOrder: string[] = [];
    /**
     * Device-pixel ratio of the main canvas. The main canvas backing is sized
     * STAGE × dpr and its context is pre-scaled by dpr, so sprites/monitors are
     * drawn at the display's real resolution (crisp). The pen layer is kept at
     * the fixed STAGE resolution and composited with nearest-neighbour, so pen
     * marks and stamps stay coarse (lower-resolution, like Scratch's pen) while
     * sprites remain high-resolution.
     */
    private readonly dpr: number;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        const view = canvas.ownerDocument?.defaultView
            ?? (typeof window !== 'undefined' ? window : undefined);
        const ratio = view?.devicePixelRatio;
        this.dpr = typeof ratio === 'number' && ratio > 0 ? ratio : 1;

        this.canvas.width = Math.round(STAGE_WIDTH * this.dpr);
        this.canvas.height = Math.round(STAGE_HEIGHT * this.dpr);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('CanvasRenderer requires a 2D rendering context.');
        }
        this.ctx = ctx;
        // Draw in fixed 480x360 stage logical units; the dpr scale maps them to
        // the higher-resolution backing so sprites/monitors render crisply.
        this.ctx.scale(this.dpr, this.dpr);

        // Independent offscreen pen layer (the official renderer's PenSkin),
        // kept at the fixed STAGE resolution (not dpr-scaled) on purpose so the
        // pen stays coarse when composited onto the hi-res main canvas.
        const penCanvas = (canvas.ownerDocument ?? document).createElement('canvas');
        penCanvas.width = STAGE_WIDTH;
        penCanvas.height = STAGE_HEIGHT;
        const penCtx = penCanvas.getContext('2d');
        if (!penCtx) {
            throw new Error('CanvasRenderer requires a 2D pen-layer context.');
        }
        this.penCanvas = penCanvas;
        this.penCtx = penCtx;
    }

    /**
     * Composites the fixed-resolution pen layer onto the (dpr-scaled) main
     * canvas with smoothing disabled, so the STAGE-sized pen image is scaled up
     * with nearest-neighbour — keeping pen marks/stamps coarse against the
     * high-resolution sprites.
     */
    private compositePen(): void {
        this.ctx.save();
        this.ctx.imageSmoothingEnabled = false;
        this.ctx.drawImage(this.penCanvas, 0, 0, STAGE_WIDTH, STAGE_HEIGHT);
        this.ctx.restore();
    }

    /** Assigns (or replaces) the Skin used to paint `targetId`'s drawable. */
    registerSkin(targetId: string, skin: Skin): void {
        this.skins.set(targetId, skin);
    }

    /**
     * Registers every costume Skin for a target so `costume/backdrop switch`
     * blocks repaint with the right image. The drawable's current costume index
     * (from each frame's DrawableState) selects which skin to paint.
     */
    registerCostumeSkins(targetId: string, skins: Skin[]): void {
        this.costumeSkins.set(targetId, skins);
        if (skins.length > 0 && !this.skins.has(targetId)) this.skins.set(targetId, skins[0]);
    }

    /** The Skin to paint for a target at a given costume index (falls back to the single skin). */
    private skinFor(targetId: string, costumeIndex?: number): Skin | null {
        const list = this.costumeSkins.get(targetId);
        if (list && list.length > 0) {
            const index = costumeIndex ?? this.lastStates.get(targetId)?.costumeIndex ?? 0;
            const wrapped = ((Math.round(index) % list.length) + list.length) % list.length;
            return list[wrapped];
        }
        return this.skins.get(targetId) ?? null;
    }

    renderDrawables(states: DrawableState[]): void {
        this.ctx.clearRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);

        const sorted = [...states].sort((a, b) => a.layerOrder - b.layerOrder);
        this.lastDrawOrder = [];
        this.lastStates.clear();

        // Group order per SCRATCH_RENDER_SPEC: background → pen → sprites. The
        // pen layer is composited once, after the Stage drawable(s) and before
        // the first sprite.
        let penComposited = false;
        for (const state of sorted) {
            if (!penComposited && !state.isStage) {
                this.compositePen();
                penComposited = true;
            }
            this.lastStates.set(state.targetId, state);
            if (!state.visible) continue;
            this.lastDrawOrder.push(state.targetId);
            this.paintDrawable(this.ctx, state);
        }
        if (!penComposited) this.compositePen();
    }

    /**
     * Draws the variable-monitor readout overlay on top of the current frame,
     * approximating the official monitor look (orange value pill on a grey
     * label box). Monitor coordinates are top-left origin, matching the
     * project `monitors` array; values are pre-resolved by the Runtime.
     */
    renderMonitors(monitors: MonitorView[]): void {
        const ctx = this.ctx;
        ctx.save();
        ctx.textBaseline = 'middle';
        ctx.font = '12px sans-serif';
        const height = 18;
        const padding = 6;
        for (const monitor of monitors) {
            const label = monitor.label;
            const value = monitor.value;
            const labelWidth = ctx.measureText(label).width;
            const valueWidth = Math.max(ctx.measureText(value).width, 16);
            const x = Math.max(0, monitor.x);
            const y = Math.max(0, monitor.y);
            const boxWidth = labelWidth + valueWidth + padding * 3;

            ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
            ctx.fillRect(x, y, boxWidth, height);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(label, x + padding, y + height / 2);

            const pillX = x + labelWidth + padding * 2;
            ctx.fillStyle = '#ff8c1a';
            ctx.fillRect(pillX, y + 2, valueWidth + padding, height - 4);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(value, pillX + padding / 2, y + height / 2);
        }
        ctx.restore();
    }

    /**
     * Paints say/think bubbles for visible targets, anchored at the top-right of
     * each sprite's bounds and clamped to the stage. A simple single-line bubble
     * (truncated): `say` uses a solid outline, `think` a dotted one.
     */
    renderBubbles(bubbles: BubbleView[]): void {
        const ctx = this.ctx;
        ctx.save();
        ctx.font = '13px sans-serif';
        ctx.textBaseline = 'top';
        const padX = 8;
        const padY = 6;
        const lineH = 16;
        for (const bubble of bubbles) {
            const state = this.lastStates.get(bubble.targetId);
            if (!state || !state.visible || bubble.text === '') continue;
            const bounds = this.getBounds(bubble.targetId, {
                x: state.x, y: state.y, size: state.size, direction: state.direction, rotationStyle: state.rotationStyle
            });
            const anchorScratchX = bounds ? bounds.right : state.x;
            const anchorScratchY = bounds ? bounds.top : state.y;
            const anchor = scratchToCanvas(anchorScratchX, anchorScratchY);

            const maxTextW = 180;
            const textW = Math.min(maxTextW, ctx.measureText(bubble.text).width);
            const boxW = textW + padX * 2;
            const boxH = lineH + padY * 2;
            let bx = anchor.x;
            let by = anchor.y - boxH - 4;
            bx = Math.max(2, Math.min(bx, STAGE_WIDTH - boxW - 2));
            by = Math.max(2, by);

            ctx.beginPath();
            ctx.rect(bx, by, boxW, boxH);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = bubble.type === 'think' ? '#9aa0a6' : '#5c6066';
            ctx.setLineDash(bubble.type === 'think' ? [3, 3] : []);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.fillStyle = '#3b3b3b';
            ctx.fillText(bubble.text, bx + padX, by + padY, maxTextW);
        }
        ctx.restore();
    }

    penClear(): void {
        this.penCtx.clearRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
    }

    penPoint(point: PenPoint, attributes: PenAttributes): void {
        const {x, y} = scratchToCanvas(point.x, point.y);
        const radius = Math.max(attributes.size, 1) / 2;
        this.penCtx.fillStyle = attributes.color;
        this.penCtx.beginPath();
        this.penCtx.arc(x, y, radius, 0, Math.PI * 2);
        this.penCtx.fill();
    }

    penLine(from: PenPoint, to: PenPoint, attributes: PenAttributes): void {
        const a = scratchToCanvas(from.x, from.y);
        const b = scratchToCanvas(to.x, to.y);
        this.penCtx.strokeStyle = attributes.color;
        this.penCtx.lineWidth = Math.max(attributes.size, 1);
        this.penCtx.lineCap = 'round';
        this.penCtx.beginPath();
        this.penCtx.moveTo(a.x, a.y);
        this.penCtx.lineTo(b.x, b.y);
        this.penCtx.stroke();
    }

    /** Stamps a target's current drawable onto the pen layer (no-op if unseen). */
    penStamp(targetId: string, state?: DrawableState): void {
        const resolved = state ?? this.lastStates.get(targetId);
        if (resolved) this.paintDrawable(this.penCtx, resolved);
    }

    cloneTargetSkin(sourceTargetId: string, cloneTargetId: string): void {
        const skin = this.skins.get(sourceTargetId);
        if (skin) this.skins.set(cloneTargetId, skin);
    }

    /** Drops cached skin/state for a target (e.g. a deleted clone). */
    releaseTarget(targetId: string): void {
        this.skins.delete(targetId);
        this.lastStates.delete(targetId);
    }

    /**
     * Scratch fencing: clamps (x, y) using the target's transformed costume
     * bounds so the drawable cannot leave the Stage entirely. Returns the
     * input unchanged when the target has no skin/decoded image yet.
     */
    getFencedPosition(
        targetId: string,
        x: number,
        y: number,
        transform: {size: number; direction: number; rotationStyle: DrawableState['rotationStyle']}
    ): [number, number] {
        const skin = this.skinFor(targetId);
        const image = skin?.getImage() ?? null;
        if (!skin || !image) return [x, y];
        const dims = intrinsicSize(image);
        if (!dims) return [x, y];
        const skinScale = skin.scale ?? 1;
        const bounds = computeLocalBounds(
            dims.width * skinScale,
            dims.height * skinScale,
            skin.rotationCenterX,
            skin.rotationCenterY,
            transform.size,
            transform.direction,
            transform.rotationStyle
        );
        return fencePosition(x, y, bounds);
    }

    /**
     * Absolute stage-space bounds of the target's transformed costume under the
     * given current placement, or null with no decoded skin (so edge bounce
     * no-ops). Mirrors the fast (rectangle) AABB used by fencing.
     */
    getBounds(targetId: string, transform: DrawableTransform): Bounds | null {
        const skin = this.skinFor(targetId);
        const image = skin?.getImage() ?? null;
        if (!skin || !image) return null;
        const dims = intrinsicSize(image);
        if (!dims) return null;
        const skinScale = skin.scale ?? 1;
        const local = computeLocalBounds(
            dims.width * skinScale,
            dims.height * skinScale,
            skin.rotationCenterX,
            skin.rotationCenterY,
            transform.size,
            transform.direction,
            transform.rotationStyle
        );
        return {
            left: transform.x + local.left,
            right: transform.x + local.right,
            top: transform.y + local.top,
            bottom: transform.y + local.bottom
        };
    }

    /**
     * Front-most visible non-stage target whose transformed bounds contain the
     * stage point (x, y), tested against the last rendered scene. Uses the
     * fast AABB (no per-pixel silhouette); good enough for click hats.
     */
    pickTarget(x: number, y: number): string | null {
        for (let i = this.lastDrawOrder.length - 1; i >= 0; i--) {
            const id = this.lastDrawOrder[i];
            const state = this.lastStates.get(id);
            if (!state || state.isStage || !state.visible) continue;
            const bounds = this.getBounds(id, {
                x: state.x, y: state.y, size: state.size,
                direction: state.direction, rotationStyle: state.rotationStyle
            });
            if (!bounds) continue;
            if (x >= bounds.left && x <= bounds.right && y >= bounds.bottom && y <= bounds.top) {
                return id;
            }
        }
        return null;
    }

    /**
     * True when the target's silhouette overlaps `color` anywhere in the rest
     * of the composited scene (backdrop + pen + other visible drawables), using
     * the last rendered frame. Mirrors Scratch's isTouchingColor (the judging
     * sprite is tested even when hidden; only the 5/5/4 high bits of R/G/B must
     * match).
     */
    isTouchingColor(targetId: string, color: readonly [number, number, number]): boolean {
        const rect = this.queryRect(targetId);
        if (!rect) return false;
        this.renderSceneExcluding(targetId);
        this.renderTargetSurface(targetId, true);
        const scene = this.querySceneCtx!.getImageData(rect.x, rect.y, rect.w, rect.h).data;
        const mask = this.queryMaskCtx!.getImageData(rect.x, rect.y, rect.w, rect.h).data;
        for (let i = 0; i < mask.length; i += 4) {
            if (mask[i + 3] > 0 && colorMatches(scene, i, color)) return true;
        }
        return false;
    }

    /**
     * True when the `mask`-coloured part of the target touches `color` in the
     * rest of the scene (color-is-touching-color).
     */
    isColorTouchingColor(
        targetId: string,
        color: readonly [number, number, number],
        mask: readonly [number, number, number]
    ): boolean {
        const rect = this.queryRect(targetId);
        if (!rect) return false;
        this.renderSceneExcluding(targetId);
        this.renderTargetSurface(targetId, false);
        const scene = this.querySceneCtx!.getImageData(rect.x, rect.y, rect.w, rect.h).data;
        const target = this.queryMaskCtx!.getImageData(rect.x, rect.y, rect.w, rect.h).data;
        for (let i = 0; i < target.length; i += 4) {
            if (target[i + 3] > 0 && colorMatches(target, i, mask) && colorMatches(scene, i, color)) {
                return true;
            }
        }
        return false;
    }

    /** Pixel rect (clamped to the stage) covering a target's current bounds, or null if off-stage. */
    private queryRect(targetId: string): {x: number; y: number; w: number; h: number} | null {
        const state = this.lastStates.get(targetId);
        if (!state) return null;
        const bounds = this.getBounds(targetId, {
            x: state.x, y: state.y, size: state.size, direction: state.direction, rotationStyle: state.rotationStyle
        });
        if (!bounds) return null;
        const x0 = Math.max(0, Math.floor(bounds.left + STAGE_WIDTH / 2));
        const y0 = Math.max(0, Math.floor((STAGE_HEIGHT / 2) - bounds.top));
        const x1 = Math.min(STAGE_WIDTH, Math.ceil(bounds.right + STAGE_WIDTH / 2));
        const y1 = Math.min(STAGE_HEIGHT, Math.ceil((STAGE_HEIGHT / 2) - bounds.bottom));
        if (x1 <= x0 || y1 <= y0) return null;
        return {x: x0, y: y0, w: x1 - x0, h: y1 - y0};
    }

    private ensureQueryCanvases(): void {
        if (this.querySceneCtx && this.queryMaskCtx) return;
        const make = (): CanvasRenderingContext2D => {
            const c = document.createElement('canvas');
            c.width = STAGE_WIDTH;
            c.height = STAGE_HEIGHT;
            return c.getContext('2d')!;
        };
        this.querySceneCtx = make();
        this.queryMaskCtx = make();
    }

    /** Composites backdrop + pen + every visible drawable except `excludeId` onto the scene surface. */
    private renderSceneExcluding(excludeId: string): void {
        this.ensureQueryCanvases();
        const ctx = this.querySceneCtx!;
        ctx.clearRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
        const ordered = [...this.lastStates.values()].sort((a, b) => a.layerOrder - b.layerOrder);
        let penDone = false;
        for (const state of ordered) {
            if (!penDone && !state.isStage) {
                ctx.drawImage(this.penCanvas, 0, 0, STAGE_WIDTH, STAGE_HEIGHT);
                penDone = true;
            }
            if (state.targetId === excludeId || !state.visible) continue;
            this.paintDrawable(ctx, state);
        }
        if (!penDone) ctx.drawImage(this.penCanvas, 0, 0, STAGE_WIDTH, STAGE_HEIGHT);
    }

    /** Renders just the target onto the mask surface. `silhouette` drops all effects (ghost included). */
    private renderTargetSurface(targetId: string, silhouette: boolean): void {
        this.ensureQueryCanvases();
        const ctx = this.queryMaskCtx!;
        ctx.clearRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
        const state = this.lastStates.get(targetId);
        if (!state) return;
        // Mask ignores ghost (so a hidden/ghosted sprite still has a silhouette);
        // for color-is-touching-color we keep color/brightness so its pixels match.
        const effects = silhouette ? undefined : {...(state.effects ?? {}), ghost: 0};
        this.paintDrawable(ctx, {...state, visible: true, effects});
    }

    /** Introspection: target IDs in the order they were actually painted in the last renderDrawables() call (visible-only). */
    getDrawOrder(): string[] {
        return [...this.lastDrawOrder];
    }

    /** Introspection: the DrawableState last received for `targetId` (including invisible ones), or undefined if never seen. */
    getRenderedState(targetId: string): DrawableState | undefined {
        return this.lastStates.get(targetId);
    }

    private paintDrawable(ctx: CanvasRenderingContext2D, state: DrawableState): void {
        const drawable = new Drawable(state, this.skinFor(state.targetId, state.costumeIndex));
        const {x: cx, y: cy} = scratchToCanvas(state.x, state.y);
        const scale = state.size / 100;

        ctx.save();
        // Keep sprites (costume/paint and clones) crisp: disable bilinear
        // smoothing so scaled bitmaps are not blurred. Scoped by save()/restore()
        // (imageSmoothingEnabled is part of the canvas state), so it does not
        // affect the 1:1 pen-layer composite or pen line/dot rendering.
        ctx.imageSmoothingEnabled = false;
        // ghost → alpha (exact). color/brightness are baked into the image below.
        applyGhost(ctx, state.effects);
        ctx.translate(cx, cy);

        let flip = false;
        let rotation = 0;
        if (state.rotationStyle === 'all around') {
            rotation = directionToRadians(state.direction);
        } else if (state.rotationStyle === 'left-right') {
            flip = facesLeft(state.direction);
        }
        // "don't rotate": no rotation, no flip.

        if (flip) ctx.scale(-1, 1);
        if (rotation) ctx.rotate(rotation);
        ctx.scale(scale, scale);

        const image = drawable.skin?.getImage() ?? null;
        if (image) {
            const skinScale = drawable.skin!.scale ?? 1;
            const rcx = drawable.skin!.rotationCenterX;
            const rcy = drawable.skin!.rotationCenterY;
            // bitmapResolution>1: scale native pixels down to logical units so a
            // 960x720 (res 2) costume paints at 480x360, centered on its
            // (logical) rotation center.
            if (skinScale !== 1) ctx.scale(skinScale, skinScale);
            const painted = this.effectedImage(image, state.effects);
            ctx.drawImage(painted, -rcx / skinScale, -rcy / skinScale);
        } else if (!state.isStage) {
            ctx.fillStyle = fallbackColorFor(state.targetId);
            ctx.fillRect(-FALLBACK_SIZE / 2, -FALLBACK_SIZE / 2, FALLBACK_SIZE, FALLBACK_SIZE);
        }

        ctx.restore();
    }

    /**
     * Returns the costume image with the color/brightness effects baked in
     * per-pixel (matching scratch-render's EffectTransform), or the original
     * image when neither is active. Results are cached per image + effect key.
     */
    private effectedImage(image: CanvasImageSource, effects?: Readonly<Record<string, number>>): CanvasImageSource {
        const colorEffect = effects?.color ?? 0;
        const brightnessEffect = effects?.brightness ?? 0;
        const applyColor = colorEffect % 200 !== 0;
        const applyBright = brightnessEffect !== 0;
        if (!applyColor && !applyBright) return image;

        const dims = intrinsicSize(image);
        if (!dims) return image;
        const colorU = colorUniform(colorEffect);
        const brightnessU = brightnessUniform(brightnessEffect);
        const key = `${applyColor ? colorU.toFixed(5) : 'x'}:${applyBright ? brightnessU.toFixed(5) : 'x'}`;

        let cacheForImage = this.effectCache.get(image);
        if (!cacheForImage) {
            cacheForImage = new Map();
            this.effectCache.set(image, cacheForImage);
        }
        const cached = cacheForImage.get(key);
        if (cached) return cached;

        const off = document.createElement('canvas');
        off.width = dims.width;
        off.height = dims.height;
        const offCtx = off.getContext('2d');
        if (!offCtx) return image;
        offCtx.imageSmoothingEnabled = false;
        offCtx.drawImage(image, 0, 0);
        const data = offCtx.getImageData(0, 0, dims.width, dims.height);
        applyColorBrightness(data.data, applyColor, applyBright, colorU, brightnessU);
        offCtx.putImageData(data, 0, 0);
        cacheForImage.set(key, off);
        return off;
    }
}
