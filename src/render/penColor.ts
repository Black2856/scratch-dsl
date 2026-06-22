/**
 * Pure colour conversion for pen colour parameters, ported from the official
 * VM's `util/color.js` (hsvToRgb / rgbToHsv) so the pen `color`/`saturation`/
 * `brightness`/`transparency` blocks produce the same RGBA as Scratch. No DOM —
 * the renderer consumes the derived CSS string.
 */
export interface Rgb {
    r: number;
    g: number;
    b: number;
}

export interface Hsv {
    h: number;
    s: number;
    v: number;
}

/** HSV (h 0..360, s/v 0..1) → RGB (0..255), matching Color.hsvToRgb. */
export const hsvToRgb = (hsv: Hsv): Rgb => {
    let h = hsv.h % 360;
    if (h < 0) h += 360;
    const s = Math.max(0, Math.min(hsv.s, 1));
    const v = Math.max(0, Math.min(hsv.v, 1));

    const i = Math.floor(h / 60);
    const f = (h / 60) - i;
    const p = v * (1 - s);
    const q = v * (1 - (s * f));
    const t = v * (1 - (s * (1 - f)));

    let r: number;
    let g: number;
    let b: number;
    switch (i) {
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
    default: r = v; g = t; b = p; break;
    }
    return {r: Math.floor(r * 255), g: Math.floor(g * 255), b: Math.floor(b * 255)};
};

/** RGB (0..255) → HSV (h 0..360, s/v 0..1), matching Color.rgbToHsv. */
export const rgbToHsv = (rgb: Rgb): Hsv => {
    const r = rgb.r / 255;
    const g = rgb.g / 255;
    const b = rgb.b / 255;
    const x = Math.min(r, g, b);
    const v = Math.max(r, g, b);
    let h = 0;
    let s = 0;
    if (x !== v) {
        const f = (r === x) ? g - b : ((g === x) ? b - r : r - g);
        const i = (r === x) ? 3 : ((g === x) ? 5 : 1);
        h = ((i - (f / (v - x))) * 60) % 360;
        s = (v - x) / v;
    }
    return {h, s, v};
};

/** Parses a `#rgb`/`#rrggbb` CSS colour to RGB, or null if unrecognised. */
export const parseHexColor = (css: string): Rgb | null => {
    const hex = css.trim().replace(/^#/, '');
    if (/^[0-9a-fA-F]{3}$/.test(hex)) {
        return {
            r: parseInt(hex[0] + hex[0], 16),
            g: parseInt(hex[1] + hex[1], 16),
            b: parseInt(hex[2] + hex[2], 16)
        };
    }
    if (/^[0-9a-fA-F]{6}$/.test(hex)) {
        return {
            r: parseInt(hex.slice(0, 2), 16),
            g: parseInt(hex.slice(2, 4), 16),
            b: parseInt(hex.slice(4, 6), 16)
        };
    }
    return null;
};

/** Formats RGB + alpha (0..1) as an `rgba(...)` CSS string. */
export const rgbaString = (rgb: Rgb, alpha: number): string =>
    `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${Math.max(0, Math.min(1, alpha))})`;
