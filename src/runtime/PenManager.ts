/**
 * Per-target pen state, the DOM-free half of the pen extension. Holds whether
 * the pen is down plus its colour (a CSS colour string) and size (line
 * diameter), independent of any canvas. Actual rasterisation happens behind
 * the renderer's optional pen methods (see RendererPort); this manager only
 * owns the state the official VM keeps in a target's `Scratch.pen` custom
 * state, including duplicating it when a sprite is cloned.
 */
import {hsvToRgb, rgbToHsv, parseHexColor, rgbaString} from './penColor.ts';

/**
 * Pen colour parameters (each 0..100), the source of truth behind
 * `pen_setPenColorParamTo` / `pen_changePenColorParamBy`. `color` is the hue
 * (wrapped to [0,100)); the others clamp to [0,100]. The CSS `PenState.color`
 * string is derived from these for the renderer.
 */
export interface PenColorParams {
    color: number;
    saturation: number;
    brightness: number;
    transparency: number;
}

export interface PenState {
    down: boolean;
    color: string;
    size: number;
    params: PenColorParams;
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

const clampParam = (value: number): number => Math.min(100, Math.max(0, value));

/** Wraps the hue param into [0,100), per official MathUtil.wrapClamp(value, 0, 100). */
const wrapColor = (value: number): number => {
    const range = 101;
    return value - (Math.floor((value - 0) / range) * range);
};

/** Default colour params derived from PEN_DEFAULT_COLOR (#0000ff). */
const defaultParams = (): PenColorParams => {
    const hsv = rgbToHsv({r: 0, g: 0, b: 255});
    return {
        color: (hsv.h / 360) * 100,
        saturation: hsv.s * 100,
        brightness: hsv.v * 100,
        transparency: 0
    };
};

/** Recomputes the CSS colour string from a state's colour params. */
const deriveCss = (params: PenColorParams): string => {
    const rgb = hsvToRgb({
        h: (params.color * 360) / 100,
        s: params.saturation / 100,
        v: params.brightness / 100
    });
    return rgbaString(rgb, 1 - (params.transparency / 100));
};

export class PenManager {
    private readonly states = new Map<string, PenState>();

    /** Returns the target's pen state, lazily creating it with defaults. */
    getState(targetId: string): PenState {
        let state = this.states.get(targetId);
        if (!state) {
            state = {
                down: false,
                color: PEN_DEFAULT_COLOR,
                size: PEN_DEFAULT_SIZE,
                params: defaultParams()
            };
            this.states.set(targetId, state);
        }
        return state;
    }

    /**
     * Sets or changes one pen colour parameter and re-derives the CSS colour.
     * `color` wraps to [0,100); the rest clamp to [0,100]. Unknown params are
     * ignored (matching the official warn-and-skip).
     */
    setColorParam(targetId: string, param: string, value: number, change: boolean): void {
        const state = this.getState(targetId);
        const params = state.params;
        const base = change ? (params[param as keyof PenColorParams] ?? 0) : 0;
        switch (param) {
        case 'color':
            params.color = wrapColor(value + base);
            break;
        case 'saturation':
            params.saturation = clampParam(value + base);
            break;
        case 'brightness':
            params.brightness = clampParam(value + base);
            break;
        case 'transparency':
            params.transparency = clampParam(value + base);
            break;
        default:
            return;
        }
        state.color = deriveCss(params);
    }

    setDown(targetId: string, down: boolean): void {
        this.getState(targetId).down = down;
    }

    isDown(targetId: string): boolean {
        return this.getState(targetId).down;
    }

    /**
     * Sets the pen colour directly from a CSS colour (`pen_setPenColorToColor`).
     * Keeps the literal string for the renderer and syncs the HSV params from it
     * (transparency reset to 0) so a later colour-param change bases off the new
     * colour, mirroring the official `_setPenColorToColor`.
     */
    setColor(targetId: string, color: string): void {
        const state = this.getState(targetId);
        state.color = color;
        const rgb = parseHexColor(color);
        if (rgb) {
            const hsv = rgbToHsv(rgb);
            state.params.color = (hsv.h / 360) * 100;
            state.params.saturation = hsv.s * 100;
            state.params.brightness = hsv.v * 100;
            state.params.transparency = 0;
        }
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
        this.states.set(toTargetId, {...source, params: {...source.params}});
    }

    /** Drops a target's pen state (e.g. when a clone is deleted). */
    releaseTarget(targetId: string): void {
        this.states.delete(targetId);
    }
}
