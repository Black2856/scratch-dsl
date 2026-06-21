import type {DrawableState, PenAttributes, PenPoint, RendererPort} from './RendererPort.ts';
import {Drawable} from './Drawable.ts';
import type {Skin} from './Skin.ts';
import {STAGE_WIDTH, STAGE_HEIGHT, scratchToCanvas, directionToRadians} from './coordinates.ts';

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

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.canvas.width = STAGE_WIDTH;
        this.canvas.height = STAGE_HEIGHT;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('CanvasRenderer requires a 2D rendering context.');
        }
        this.ctx = ctx;

        // Independent offscreen pen layer (the official renderer's PenSkin):
        // persists across frames and composites between the stage background
        // and the sprite group.
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
                this.ctx.drawImage(this.penCanvas, 0, 0);
                penComposited = true;
            }
            this.lastStates.set(state.targetId, state);
            if (!state.visible) continue;
            this.lastDrawOrder.push(state.targetId);
            this.paintDrawable(this.ctx, state);
        }
        if (!penComposited) this.ctx.drawImage(this.penCanvas, 0, 0);
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

    /** Drops cached skin/state for a target (e.g. a deleted clone). */
    releaseTarget(targetId: string): void {
        this.skins.delete(targetId);
        this.lastStates.delete(targetId);
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
        } else {
            ctx.fillStyle = fallbackColorFor(state.targetId);
            ctx.fillRect(-FALLBACK_SIZE / 2, -FALLBACK_SIZE / 2, FALLBACK_SIZE, FALLBACK_SIZE);
        }

        ctx.restore();
    }
}
