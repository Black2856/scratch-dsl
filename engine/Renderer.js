/**
 * Renderer.js
 * Canvas renderer for the Scratch stage (480x360).
 * Operates in no-op mode when canvas is null (Node/headless).
 * Uses placeholder rectangles when images are not loaded.
 */

/** Deterministic color from a string (for placeholder rectangles). */
function nameToColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  const r = (hash >> 16) & 0xff;
  const g = (hash >> 8)  & 0xff;
  const b = hash & 0xff;
  return `rgb(${Math.abs(r)},${Math.abs(g)},${Math.abs(b)})`;
}

export class Renderer {
  constructor(canvas) {
    this._canvas = canvas;
    this._ctx = null;

    if (canvas && typeof canvas.getContext === 'function') {
      canvas.width  = 480;
      canvas.height = 360;
      this._ctx = canvas.getContext('2d');
    }
  }

  /** Main render pass: background → sprites → monitors. */
  render(runtime) {
    const ctx = this._ctx;
    if (!ctx) return;

    ctx.clearRect(0, 0, 480, 360);

    // Collect draw targets (stage + sprites, sorted by layerOrder)
    const drawTargets = runtime.targets.slice()
      .sort((a, b) => a.layerOrder - b.layerOrder);

    // 1. Stage backdrop(s)
    for (const target of drawTargets) {
      if (target.isStage && target.visible) this._drawTarget(ctx, target);
    }

    // 2. Pen layer (Scratch: above backdrop, below sprites)
    if (runtime.pen && typeof runtime.pen.getLayerCanvas === 'function') {
      const layer = runtime.pen.getLayerCanvas();
      if (layer) ctx.drawImage(layer, 0, 0);
    }

    // 3. Sprites and clones
    for (const target of drawTargets) {
      if (!target.isStage && target.visible) this._drawTarget(ctx, target);
    }

    // Say bubbles
    for (const target of drawTargets) {
      if (target.sayText) {
        this._drawSay(ctx, target);
      }
    }

    this.drawMonitors(runtime);
  }

  _drawTarget(ctx, target) {
    const costume = target.costumes[target.currentCostume];
    if (!costume) return;

    // Canvas coordinate conversion: Scratch (0,0) → Canvas (240,180)
    const cx = target.x + 240;
    const cy = 180 - target.y;

    // Try loaded image
    const img = target._images && target._images.get(costume.name);
    if (img && img.complete && img.naturalWidth > 0) {
      const scale = target.size / 100;
      const w = img.naturalWidth  * scale;
      const h = img.naturalHeight * scale;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(((target.direction - 90) * Math.PI) / 180);
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      ctx.restore();
    } else {
      // Placeholder rectangle
      const w = 48 * (target.size / 100);
      const h = 48 * (target.size / 100);
      ctx.save();
      ctx.fillStyle = nameToColor(target.name);
      ctx.globalAlpha = 0.7;
      ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
      ctx.fillStyle = '#fff';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(target.name.slice(0, 8), cx, cy + 3);
      ctx.restore();
    }
  }

  _drawSay(ctx, target) {
    const cx = target.x + 240;
    const cy = 180 - target.y;
    const text = target.sayText;
    if (!text) return;

    ctx.save();
    ctx.font = '12px sans-serif';
    const w = ctx.measureText(text).width + 12;
    const h = 20;
    const bx = cx - w / 2;
    const by = cy - h - 30;

    ctx.fillStyle = 'white';
    ctx.strokeStyle = '#aaa';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect
      ? ctx.roundRect(bx, by, w, h, 5)
      : ctx.rect(bx, by, w, h);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#333';
    ctx.fillText(text, cx, by + 14);
    ctx.restore();
  }

  drawMonitors(runtime) {
    const ctx = this._ctx;
    if (!ctx) return;

    let y = 5;
    const x = 5;

    // Variable monitors
    for (const target of runtime.targets) {
      for (const name of target.variables.names()) {
        if (!target.variables.isMonitorVisible(name)) continue;
        const val = target.variables.get(name);
        const label = `${name}: ${val}`;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(x, y, 100, 16);
        ctx.fillStyle = 'white';
        ctx.font = '11px sans-serif';
        ctx.fillText(label, x + 3, y + 12);
        ctx.restore();
        y += 18;
      }
    }
  }
}
