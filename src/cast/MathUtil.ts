/**
 * Degree-based math helpers mirroring the official VM's `util/math-util.js`,
 * used by `operator_mathop`. Kept as a small pure module so the trig
 * singularities (tan at ±90/±270) match Scratch exactly and can be unit-tested
 * without the Runtime.
 */
export class MathUtil {
    static degToRad(deg: number): number {
        return (deg * Math.PI) / 180;
    }

    static radToDeg(rad: number): number {
        return (rad * 180) / Math.PI;
    }

    /**
     * Tangent of an angle in degrees, returning ±Infinity at the asymptotes
     * (90/-270 → +Infinity, 270/-90 → -Infinity) and rounding to 10 decimals
     * elsewhere, matching the official VM so e.g. `tan(45)` is exactly 1.
     */
    static tan(angle: number): number {
        const wrapped = angle % 360;
        switch (wrapped) {
        case -270:
        case 90:
            return Infinity;
        case -90:
        case 270:
            return -Infinity;
        default:
            return parseFloat(Math.tan((Math.PI * wrapped) / 180).toFixed(10));
        }
    }
}
