/**
 * Per-target pen state, the DOM-free half of the pen extension. Holds whether
 * the pen is down plus its colour (a CSS colour string) and size (line
 * diameter), independent of any canvas. Actual rasterisation happens behind
 * the renderer's optional pen methods (see RendererPort); this manager only
 * owns the state the official VM keeps in a target's `Scratch.pen` custom
 * state, including duplicating it when a sprite is cloned.
 */
export interface PenState {
    down: boolean;
    color: string;
    size: number;
}

/** Default pen colour (Scratch's standard pen blue) and size. */
export const PEN_DEFAULT_COLOR = '#0000ff';
export const PEN_DEFAULT_SIZE = 1;
export const PEN_MIN_SIZE = 1;
export const PEN_MAX_SIZE = 1200;

const clampSize = (value: number): number => {
    if (!Number.isFinite(value)) return PEN_MIN_SIZE;
    return Math.min(PEN_MAX_SIZE, Math.max(PEN_MIN_SIZE, value));
};

export class PenManager {
    private readonly states = new Map<string, PenState>();

    /** Returns the target's pen state, lazily creating it with defaults. */
    getState(targetId: string): PenState {
        let state = this.states.get(targetId);
        if (!state) {
            state = {down: false, color: PEN_DEFAULT_COLOR, size: PEN_DEFAULT_SIZE};
            this.states.set(targetId, state);
        }
        return state;
    }

    setDown(targetId: string, down: boolean): void {
        this.getState(targetId).down = down;
    }

    isDown(targetId: string): boolean {
        return this.getState(targetId).down;
    }

    setColor(targetId: string, color: string): void {
        this.getState(targetId).color = color;
    }

    setSize(targetId: string, size: number): void {
        this.getState(targetId).size = clampSize(size);
    }

    changeSize(targetId: string, delta: number): void {
        const state = this.getState(targetId);
        state.size = clampSize(state.size + delta);
    }

    /** Copies the source target's pen state onto a freshly created clone. */
    cloneState(fromTargetId: string, toTargetId: string): void {
        const source = this.getState(fromTargetId);
        this.states.set(toTargetId, {...source});
    }

    /** Drops a target's pen state (e.g. when a clone is deleted). */
    releaseTarget(targetId: string): void {
        this.states.delete(targetId);
    }
}
