/**
 * PenCompat.js
 * Pen layer compatibility for Scratch-style drawing.
 * Uses OffscreenCanvas when available; otherwise a fallback canvas.
 */
export class PenCompat {
  constructor() {
    this._penStates = new Map(); // target -> { down, color, size }

    // Create an off-screen canvas for the pen layer
    if (typeof OffscreenCanvas !== 'undefined') {
      this._offscreen = new OffscreenCanvas(480, 360);
    } else if (typeof document !== 'undefined') {
      this._offscreen = document.createElement('canvas');
      this._offscreen.width  = 480;
      this._offscreen.height = 360;
    } else {
      // Headless / Node — null
      this._offscreen = null;
    }

    this._offCtx = this._offscreen
      ? this._offscreen.getContext('2d')
      : null;
  }

  _getState(target) {
    if (!this._penStates.has(target)) {
      this._penStates.set(target, { down: false, color: '#000000', size: 1 });
    }
    return this._penStates.get(target);
  }

  penDown(target) {
    this._getState(target).down = true;
  }

  penUp(target) {
    this._getState(target).down = false;
  }

  setColor(target, color) {
    this._getState(target).color = color;
  }

  setSize(target, n) {
    this._getState(target).size = Math.max(1, Number(n));
  }

  changeSize(target, n) {
    const s = this._getState(target);
    s.size = Math.max(1, s.size + Number(n));
  }

  clear() {
    if (this._offCtx) {
      this._offCtx.clearRect(0, 0, 480, 360);
    }
  }

  /**
   * スプライトの現在のコスチュームを pen レイヤに焼き付ける（Scratch の stamp）。
   * 表示/非表示に関わらず描画する。画像未ロード時はプレースホルダ矩形。
   */
  stamp(target) {
    if (!this._offCtx) return;
    const ctx = this._offCtx;
    const cx = target.x + 240;
    const cy = 180 - target.y;

    const costume = target.costumes[target.currentCostume];
    const img = (costume && target._images) ? target._images.get(costume.name) : null;

    if (img && img.complete && img.naturalWidth > 0) {
      const scale = target.size / 100;
      const w = img.naturalWidth  * scale;
      const h = img.naturalHeight * scale;
      ctx.save();
      ctx.translate(cx, cy);
      if (target.rotationStyle !== "don't rotate") {
        ctx.rotate(((target.direction - 90) * Math.PI) / 180);
      }
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      ctx.restore();
    } else {
      const w = 48 * (target.size / 100);
      const h = 48 * (target.size / 100);
      ctx.save();
      ctx.fillStyle = '#888';
      ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
      ctx.restore();
    }
  }

  /** Called when a target moves while pen is down. */
  moveTo(target, fromX, fromY, toX, toY) {
    if (!this._offCtx) return;
    const state = this._getState(target);
    if (!state.down) return;

    const ctx = this._offCtx;
    ctx.save();
    ctx.strokeStyle = state.color;
    ctx.lineWidth   = state.size;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.moveTo(fromX + 240, 180 - fromY);
    ctx.lineTo(toX  + 240, 180 - toY);
    ctx.stroke();
    ctx.restore();
  }

  getLayerCanvas() {
    return this._offscreen;
  }
}
