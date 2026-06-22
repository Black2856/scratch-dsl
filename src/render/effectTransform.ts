/**
 * CPU port of scratch-render's colour effects (EffectTransform.transformColor +
 * color-conversions), so the `color` / `brightness` graphic effects match
 * Scratch pixel-for-pixel instead of an approximate CSS filter. Operates on
 * straight (non-premultiplied) RGBA as returned by canvas getImageData, so the
 * shader's premultiply/divide-by-alpha dance is omitted.
 *
 * `ghost` is applied separately via canvas globalAlpha (cheaper and exact), and
 * the shape effects (fisheye/whirl/pixelate/mosaic) are texture-coordinate
 * warps not handled here.
 */

/** color effect → u_color uniform: (x / 200) mod 1. */
export const colorUniform = (colorEffect: number): number => (colorEffect / 200) % 1;

/** brightness effect → u_brightness uniform: clamp(x, -100, 100) / 100. */
export const brightnessUniform = (brightnessEffect: number): number =>
    Math.max(-100, Math.min(brightnessEffect, 100)) / 100;

// rgbToHsv: r,g,b in [0,255] → h,s,v in [0,1]. Mirrors color-conversions.js.
const rgbToHsv = (r: number, g: number, b: number, dst: [number, number, number]): void => {
    let K = 0;
    r /= 255;
    g /= 255;
    b /= 255;
    let tmp = 0;
    if (g < b) {
        tmp = g; g = b; b = tmp; K = -1;
    }
    if (r < g) {
        tmp = r; r = g; g = tmp; K = (-2 / 6) - K;
    }
    const chroma = r - Math.min(g, b);
    dst[0] = Math.abs(K + ((g - b) / ((6 * chroma) + Number.EPSILON)));
    dst[1] = chroma / (r + Number.EPSILON);
    dst[2] = r;
};

// hsvToRgb: h,s,v (h may be >1, wrapped) → r,g,b in [0,255] written to data[i..i+2].
const hsvToRgb = (h: number, s: number, v: number, data: Uint8ClampedArray, i: number): void => {
    if (s === 0) {
        data[i] = data[i + 1] = data[i + 2] = (v * 255) + 0.5;
        return;
    }
    h %= 1;
    if (h < 0) h += 1;
    const sextant = (h * 6) | 0;
    const f = (h * 6) - sextant;
    const p = v * (1 - s);
    const q = v * (1 - (s * f));
    const t = v * (1 - (s * (1 - f)));
    let r = 0;
    let g = 0;
    let b = 0;
    switch (sextant) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
    }
    data[i] = (r * 255) + 0.5;
    data[i + 1] = (g * 255) + 0.5;
    data[i + 2] = (b * 255) + 0.5;
};

const MIN_V = 0.11 / 2;
const MIN_S = 0.09;
const hsv: [number, number, number] = [0, 0, 0];

/**
 * Applies the colour and brightness effects in place to straight RGBA pixel
 * data. `colorU` is the color uniform (colorUniform), `brightnessU` the
 * brightness uniform (brightnessUniform). Fully-transparent pixels are skipped.
 */
export const applyColorBrightness = (
    data: Uint8ClampedArray,
    applyColor: boolean,
    applyBrightness: boolean,
    colorU: number,
    brightnessU: number
): void => {
    const brightnessAdd = brightnessU * 255;
    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] === 0) continue;
        if (applyColor) {
            rgbToHsv(data[i], data[i + 1], data[i + 2], hsv);
            if (hsv[2] < MIN_V) {
                hsv[0] = 0; hsv[1] = 1; hsv[2] = MIN_V;
            } else if (hsv[1] < MIN_S) {
                hsv[0] = 0; hsv[1] = MIN_S;
            }
            hsvToRgb(colorU + hsv[0] + 1, hsv[1], hsv[2], data, i);
        }
        if (applyBrightness) {
            data[i] += brightnessAdd;
            data[i + 1] += brightnessAdd;
            data[i + 2] += brightnessAdd;
        }
    }
};
