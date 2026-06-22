import type {DrawableState, MonitorView, PenAttributes, PenPoint, RendererPort} from './RendererPort.ts';
import {Drawable} from './Drawable.ts';
import type {Skin} from './Skin.ts';
import {STAGE_WIDTH, STAGE_HEIGHT, scratchToCanvas, directionToRadians} from './coordinates.ts';
import {computeLocalBounds, fencePosition} from './fencing.ts';

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
    penStamp(targetId: string): void {
        const state = this.lastStates.get(targetId);
        if (state) this.paintDrawable(this.penCtx, state);
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
        const skin = this.skins.get(targetId);
        const image = skin?.getImage() ?? null;
        if (!skin || !image) return [x, y];
        const dims = intrinsicSize(image);
        if (!dims) return [x, y];
        const bounds = computeLocalBounds(
            dims.width,
            dims.height,
            skin.rotationCenterX,
            skin.rotationCenterY,
            transform.size,
            transform.direction,
            transform.rotationStyle
        );
        return fencePosition(x, y, bounds);
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
        const drawable = new Drawable(state, this.skins.get(state.targetId) ?? null);
        const {x: cx, y: cy} = scratchToCanvas(state.x, state.y);
        const scale = state.size / 100;

        ctx.save();
        // Keep sprites (costume/paint and clones) crisp: disable bilinear
        // smoothing so scaled bitmaps are not blurred. Scoped by save()/restore()
        // (imageSmoothingEnabled is part of the canvas state), so it does not
        // affect the 1:1 pen-layer composite or pen line/dot rendering.
        ctx.imageSmoothingEnabled = false;
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
            const rcx = drawable.skin!.rotationCenterX;
            const rcy = drawable.skin!.rotationCenterY;
            ctx.drawImage(image, -rcx, -rcy);
        } else if (!state.isStage) {
            ctx.fillStyle = fallbackColorFor(state.targetId);
            ctx.fillRect(-FALLBACK_SIZE / 2, -FALLBACK_SIZE / 2, FALLBACK_SIZE, FALLBACK_SIZE);
        }

        ctx.restore();
    }
}
