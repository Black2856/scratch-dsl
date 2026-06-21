/**
 * SpriteRuntime.js
 * Runtime state and methods for a single Scratch sprite (or clone).
 * The Stage also uses this class with isStage=true.
 */
import { VariableStore } from './VariableStore.js';
import { ListStore } from './ListStore.js';

export class SpriteRuntime {
  /**
   * @param {object} def - Target DSL definition
   * @param {object} runtime - Runtime instance
   */
  constructor(def, runtime) {
    this._def = def;
    this._runtime = runtime;

    this.name = def.name;
    this.isStage = def.isStage === true;

    // Motion state (sprites only; stage ignores)
    this.x = def.x ?? 0;
    this.y = def.y ?? 0;
    this.size = def.size ?? 100;
    this.direction = def.direction ?? 90;
    this.visible = def.visible ?? true;
    this.draggable = def.draggable ?? false;
    this.rotationStyle = def.rotationStyle ?? 'all around';

    // Costumes
    this.costumes = def.costumes ?? [];
    this.currentCostume = def.currentCostume ?? 0;

    // Sounds
    this.sounds = def.sounds ?? [];
    this.volume = 100;

    // Clone state
    this.isClone = false;
    this.isOriginal = true;

    // Variables and lists
    this.variables = new VariableStore();
    for (const [name, val] of Object.entries(def.variables ?? {})) {
      this.variables.define(name, val);
    }

    this.lists = new ListStore();
    for (const [name, items] of Object.entries(def.lists ?? {})) {
      this.lists.define(name, items);
    }

    // Procedures
    this._procedures = {};
    for (const proc of (def.procedures ?? [])) {
      this._procedures[proc.name] = proc;
    }

    // Rendering
    this.layerOrder = 0;
    this.sayText = null;

    // Loaded images cache (costume name -> HTMLImageElement).
    // Clones share the original's map so loaded costume images render on clones too.
    this._images = def._images ?? new Map();
  }

  // ─── Motion ───────────────────────────────────────────────────────────

  setX(v) { const ox = this.x, oy = this.y; this.x = Number(v); this._penMove(ox, oy); }
  setY(v) { const ox = this.x, oy = this.y; this.y = Number(v); this._penMove(ox, oy); }
  changeX(d) { const ox = this.x, oy = this.y; this.x += Number(d); this._penMove(ox, oy); }
  changeY(d) { const ox = this.x, oy = this.y; this.y += Number(d); this._penMove(ox, oy); }

  /** ペンが下りていれば移動軌跡を線として pen レイヤに描く。 */
  _penMove(oldX, oldY) {
    const pen = this._runtime && this._runtime.pen;
    if (pen) pen.moveTo(this, oldX, oldY, this.x, this.y);
  }

  pointInDirection(d) {
    this.direction = Number(d);
  }

  /**
   * Generator: glide to (x,y) over `secs` seconds.
   * Yields { type: 'frame' } each frame until done.
   */
  *glideTo(secs, x, y) {
    secs = Number(secs);
    x = Number(x);
    y = Number(y);

    if (secs <= 0) {
      this.x = x;
      this.y = y;
      return;
    }

    const startX = this.x;
    const startY = this.y;
    const startTime = this._runtime._now();
    const endTime = startTime + secs * 1000;
    let prevX = this.x, prevY = this.y;

    while (true) {
      yield { type: 'frame' };
      const now = this._runtime._now();
      if (now >= endTime) {
        this.x = x;
        this.y = y;
        this._penMove(prevX, prevY);
        break;
      }
      const t = (now - startTime) / (secs * 1000);
      this.x = startX + (x - startX) * t;
      this.y = startY + (y - startY) * t;
      this._penMove(prevX, prevY);
      prevX = this.x;
      prevY = this.y;
    }
  }

  ifOnEdgeBounce() {
    const hw = 240;
    const hh = 180;
    if (this.x < -hw || this.x > hw || this.y < -hh || this.y > hh) {
      // Reverse horizontal or vertical
      let dir = this.direction;
      if (this.x <= -hw || this.x >= hw) {
        dir = 180 - dir;
      } else {
        dir = -dir;
      }
      this.direction = ((dir % 360) + 360) % 360;
      this.clampToStage();
    }
  }

  clampToStage() {
    this.x = Math.max(-240, Math.min(240, this.x));
    this.y = Math.max(-180, Math.min(180, this.y));
  }

  // ─── Looks ────────────────────────────────────────────────────────────

  show() { this.visible = true; }
  hide() { this.visible = false; }

  switchCostume(nameOrNum) {
    if (typeof nameOrNum === 'number') {
      const idx = Math.round(nameOrNum) - 1;
      if (idx >= 0 && idx < this.costumes.length) {
        this.currentCostume = idx;
      }
    } else {
      const idx = this.costumes.findIndex(c => c.name === nameOrNum);
      if (idx >= 0) this.currentCostume = idx;
    }
  }

  nextCostume() {
    if (this.costumes.length === 0) return;
    this.currentCostume = (this.currentCostume + 1) % this.costumes.length;
  }

  setSize(v) { this.size = Number(v); }
  changeSize(d) { this.size += Number(d); }

  getCostumeNumber() { return this.currentCostume + 1; }

  getCostumeName() {
    const c = this.costumes[this.currentCostume];
    return c ? c.name : '';
  }

  say(msg) {
    this.sayText = (msg === '' || msg == null) ? null : String(msg);
  }

  // ─── Sensing ─────────────────────────────────────────────────────────

  distanceTo(targetName) {
    if (targetName === '_mouse_') {
      const mx = this._runtime.input ? this._runtime.input.mouseX() : 0;
      const my = this._runtime.input ? this._runtime.input.mouseY() : 0;
      return Math.sqrt((this.x - mx) ** 2 + (this.y - my) ** 2);
    }
    const other = this._runtime.getTargetByName(targetName);
    if (!other) return 0;
    return Math.sqrt((this.x - other.x) ** 2 + (this.y - other.y) ** 2);
  }

  touching(targetName) {
    // Simplified bounding-box collision
    if (targetName === '_mouse_') {
      const mx = this._runtime.input ? this._runtime.input.mouseX() : 0;
      const my = this._runtime.input ? this._runtime.input.mouseY() : 0;
      return Math.abs(this.x - mx) < 20 && Math.abs(this.y - my) < 20;
    }
    if (targetName === '_edge_') {
      return this.x < -235 || this.x > 235 || this.y < -175 || this.y > 175;
    }
    const other = this._runtime.getTargetByName(targetName);
    if (!other) return false;
    return Math.abs(this.x - other.x) < 40 && Math.abs(this.y - other.y) < 40;
  }

  // ─── Clone support ────────────────────────────────────────────────────

  /** Returns a DSL-compatible def object representing the current state. */
  createCloneData() {
    const varsCopy = {};
    for (const name of this.variables.names()) {
      varsCopy[name] = this.variables.get(name);
    }
    const listsCopy = {};
    for (const name of this.lists.names()) {
      listsCopy[name] = Array.from(this.lists.get(name));
    }
    return {
      ...this._def,
      x: this.x,
      y: this.y,
      size: this.size,
      direction: this.direction,
      visible: this.visible,
      currentCostume: this.currentCostume,
      variables: varsCopy,
      lists: listsCopy,
      _images: this._images, // share loaded costume images with the clone
    };
  }

  // ─── Serialization ────────────────────────────────────────────────────

  snapshotForSb3() {
    return {
      name: this.name,
      isStage: this.isStage,
      x: this.x,
      y: this.y,
      size: this.size,
      direction: this.direction,
      visible: this.visible,
      draggable: this.draggable,
      rotationStyle: this.rotationStyle,
      currentCostume: this.currentCostume,
      costumes: this.costumes,
      sounds: this.sounds,
      volume: this.volume,
      variables: this.variables.snapshot(),
      lists: this.lists.snapshot(),
    };
  }
}
