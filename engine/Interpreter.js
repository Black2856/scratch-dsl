/**
 * Interpreter.js
 * Core DSL interpreter. Executes step arrays as generators.
 *
 * Yield Protocol:
 * { type: 'frame' }                     - Pause until next frame
 * { type: 'waitSeconds', secs: N }      - Wait N seconds
 * { type: 'waitUntil', fn: () => bool } - Wait until condition is true
 * { type: 'waitThreads', threads: [] }  - Wait until all specified threads complete
 * { type: 'waitPromise', promise: P }   - Wait until Promise resolves
 */

// ─── Scratch comparison helpers ──────────────────────────────────────────

function scratchEq(a, b) {
  const sa = String(a).trim();
  const sb = String(b).trim();
  if (sa === '' || sb === '') return sa === sb;
  const na = Number(sa), nb = Number(sb);
  if (!isNaN(na) && !isNaN(nb)) return na === nb;
  return sa.toLowerCase() === sb.toLowerCase();
}

function scratchLt(a, b) {
  const sa = String(a).trim();
  const sb = String(b).trim();
  if (sa === '' || sb === '') return sa < sb;
  const na = Number(sa), nb = Number(sb);
  if (!isNaN(na) && !isNaN(nb)) return na < nb;
  return sa.toLowerCase() < sb.toLowerCase();
}

function scratchGt(a, b) {
  return scratchLt(b, a);
}

// ─── Reporter evaluation (synchronous) ───────────────────────────────────

/**
 * Evaluate a reporter node and return its value synchronously.
 * @param {*} node - Literal or { op, ... }
 * @param {SpriteRuntime} target
 * @param {object} ctx - { args: { name: value } }
 * @param {Runtime} runtime
 * @returns {*}
 */
export function evalReporter(node, target, ctx, runtime) {
  // Literal values
  if (node === null || node === undefined) return 0;
  if (typeof node !== 'object') return node;

  const op = node.op;

  switch (op) {
    // ── Variable / Arg ──
    case 'var': {
      const name = node.name;
      if (target.variables.has(name)) return target.variables.get(name);
      if (runtime.stage && runtime.stage.variables.has(name)) return runtime.stage.variables.get(name);
      return 0;
    }
    case 'arg': {
      return (ctx && ctx.args && node.name in ctx.args) ? ctx.args[node.name] : 0;
    }

    // ── List reporters ──
    case 'listGet': {
      const listName = node.list;
      const idx = evalReporter(node.index, target, ctx, runtime);
      const store = target.lists.has(listName) ? target.lists
        : (runtime.stage && runtime.stage.lists.has(listName) ? runtime.stage.lists : null);
      if (!store) return '';
      return store.itemAt(listName, Number(idx));
    }
    case 'listIndexOf': {
      const listName = node.list;
      const item = evalReporter(node.item, target, ctx, runtime);
      const store = target.lists.has(listName) ? target.lists
        : (runtime.stage && runtime.stage.lists.has(listName) ? runtime.stage.lists : null);
      if (!store) return 0;
      return store.indexOf(listName, item);
    }
    case 'listLength': {
      const listName = node.list;
      const store = target.lists.has(listName) ? target.lists
        : (runtime.stage && runtime.stage.lists.has(listName) ? runtime.stage.lists : null);
      if (!store) return 0;
      return store.length(listName);
    }
    case 'listContains': {
      const listName = node.list;
      const item = evalReporter(node.item, target, ctx, runtime);
      const store = target.lists.has(listName) ? target.lists
        : (runtime.stage && runtime.stage.lists.has(listName) ? runtime.stage.lists : null);
      if (!store) return false;
      return store.contains(listName, item);
    }

    // ── Arithmetic ──
    case 'add': return Number(evalReporter(node.a, target, ctx, runtime)) + Number(evalReporter(node.b, target, ctx, runtime));
    case 'sub': return Number(evalReporter(node.a, target, ctx, runtime)) - Number(evalReporter(node.b, target, ctx, runtime));
    case 'mul': return Number(evalReporter(node.a, target, ctx, runtime)) * Number(evalReporter(node.b, target, ctx, runtime));
    case 'div': {
      const divisor = Number(evalReporter(node.b, target, ctx, runtime));
      if (divisor === 0) return Infinity;
      return Number(evalReporter(node.a, target, ctx, runtime)) / divisor;
    }
    case 'mod': {
      const a = Number(evalReporter(node.a, target, ctx, runtime));
      const b = Number(evalReporter(node.b, target, ctx, runtime));
      if (b === 0) return NaN;
      return ((a % b) + b) % b; // always positive mod
    }

    // ── Comparison ──
    case 'lt': return scratchLt(evalReporter(node.a, target, ctx, runtime), evalReporter(node.b, target, ctx, runtime));
    case 'gt': return scratchGt(evalReporter(node.a, target, ctx, runtime), evalReporter(node.b, target, ctx, runtime));
    case 'eq': return scratchEq(evalReporter(node.a, target, ctx, runtime), evalReporter(node.b, target, ctx, runtime));

    // ── Logic ──
    case 'and': return !!(evalReporter(node.a, target, ctx, runtime) && evalReporter(node.b, target, ctx, runtime));
    case 'or':  return !!(evalReporter(node.a, target, ctx, runtime) || evalReporter(node.b, target, ctx, runtime));
    case 'not': return !evalReporter(node.a, target, ctx, runtime);

    // ── Random ──
    case 'random': {
      const from = Number(evalReporter(node.from, target, ctx, runtime));
      const to   = Number(evalReporter(node.to,   target, ctx, runtime));
      const lo = Math.min(from, to);
      const hi = Math.max(from, to);
      if (Number.isInteger(lo) && Number.isInteger(hi)) {
        return Math.floor(Math.random() * (hi - lo + 1)) + lo;
      }
      return Math.random() * (hi - lo) + lo;
    }

    // ── String ──
    case 'join': return String(evalReporter(node.a, target, ctx, runtime)) + String(evalReporter(node.b, target, ctx, runtime));
    case 'letterOf': {
      const text = String(evalReporter(node.text, target, ctx, runtime));
      const idx  = Number(evalReporter(node.index, target, ctx, runtime));
      if (idx < 1 || idx > text.length) return '';
      return text[Math.floor(idx) - 1];
    }
    case 'lengthOf': return String(evalReporter(node.text, target, ctx, runtime)).length;
    case 'contains': {
      const text = String(evalReporter(node.text, target, ctx, runtime)).toLowerCase();
      const sub  = String(evalReporter(node.sub,  target, ctx, runtime)).toLowerCase();
      return text.includes(sub);
    }

    // ── Math ──
    case 'round': return Math.round(Number(evalReporter(node.n, target, ctx, runtime)));
    case 'mathop': {
      const fn = node.fn;
      const n  = Number(evalReporter(node.n, target, ctx, runtime));
      const DEG = Math.PI / 180;
      switch (fn) {
        case 'abs':     return Math.abs(n);
        case 'floor':   return Math.floor(n);
        case 'ceiling': return Math.ceil(n);
        case 'sqrt':    return Math.sqrt(n);
        case 'sin':     return Math.sin(n * DEG);
        case 'cos':     return Math.cos(n * DEG);
        case 'tan':     return Math.tan(n * DEG);
        case 'asin':    return Math.asin(n) / DEG;
        case 'acos':    return Math.acos(n) / DEG;
        case 'atan':    return Math.atan(n) / DEG;
        case 'ln':      return Math.log(n);
        case 'log':     return Math.log10(n);
        case 'e ^':     return Math.exp(n);
        case '10 ^':    return Math.pow(10, n);
        default:        return 0;
      }
    }

    // ── Motion reporters ──
    case 'xPos':         return target.x;
    case 'yPos':         return target.y;
    case 'direction':    return target.direction;
    case 'costumeNumber': return target.getCostumeNumber();
    case 'costumeName':   return target.getCostumeName();
    case 'size':          return target.size;
    case 'volume':        return target.volume;

    // ── Sensing reporters ──
    case 'mouseX':   return runtime.input ? runtime.input.mouseX() : 0;
    case 'mouseY':   return runtime.input ? runtime.input.mouseY() : 0;
    case 'mouseDown': return runtime.input ? runtime.input.isMouseDown() : false;
    case 'keyPressed': {
      const key = evalReporter(node.key, target, ctx, runtime);
      return runtime.input ? runtime.input.isKeyDown(String(key)) : false;
    }
    case 'timer':    return runtime.getTimer ? runtime.getTimer() : 0;
    case 'distanceTo': {
      const tgt = evalReporter(node.target, target, ctx, runtime);
      return target.distanceTo(String(tgt));
    }
    case 'touching': {
      const tgt = evalReporter(node.target, target, ctx, runtime);
      return target.touching(String(tgt));
    }
    case 'answer':   return runtime._answer ?? '';

    default:
      // Unknown reporter — return 0
      return 0;
  }
}

// ─── Step execution (generator) ──────────────────────────────────────────

/**
 * Execute an array of steps as a generator.
 * @param {Array} steps - DSL step array
 * @param {SpriteRuntime} target
 * @param {object} ctx - { args: {} }
 * @param {Runtime} runtime
 * @yields yield protocol values
 */
export function* runSteps(steps, target, ctx, runtime) {
  for (const step of steps) {
    yield* runStep(step, target, ctx, runtime);
  }
}

function* runStep(step, target, ctx, runtime) {
  const type = step.type;

  switch (type) {

    // ─── Motion ──────────────────────────────────────────────────────
    case 'setX':
      target.setX(evalReporter(step.x, target, ctx, runtime));
      break;

    case 'setY':
      target.setY(evalReporter(step.y, target, ctx, runtime));
      break;

    case 'changeX':
      target.changeX(evalReporter(step.value, target, ctx, runtime));
      break;

    case 'changeY':
      target.changeY(evalReporter(step.value, target, ctx, runtime));
      break;

    case 'pointInDirection':
      target.pointInDirection(evalReporter(step.direction, target, ctx, runtime));
      break;

    case 'glideTo': {
      const secs = evalReporter(step.secs, target, ctx, runtime);
      const x    = evalReporter(step.x,    target, ctx, runtime);
      const y    = evalReporter(step.y,    target, ctx, runtime);
      yield* target.glideTo(secs, x, y);
      break;
    }

    case 'ifOnEdgeBounce':
      target.ifOnEdgeBounce();
      break;

    // ─── Looks ───────────────────────────────────────────────────────
    case 'show':
      target.show();
      break;

    case 'hide':
      target.hide();
      break;

    case 'switchCostume':
      target.switchCostume(evalReporter(step.name, target, ctx, runtime));
      break;

    case 'nextCostume':
      target.nextCostume();
      break;

    case 'switchBackdrop':
      if (runtime.stage) {
        runtime.stage.switchBackdrop(evalReporter(step.name, target, ctx, runtime));
      }
      break;

    case 'setSize':
      target.setSize(evalReporter(step.size, target, ctx, runtime));
      break;

    case 'changeSize':
      target.changeSize(evalReporter(step.value, target, ctx, runtime));
      break;

    case 'goToFrontBack':
      // Layer ordering — simplified
      break;

    case 'goForwardBackward':
      // Layer ordering — simplified
      break;

    case 'say':
      target.say(evalReporter(step.message, target, ctx, runtime));
      break;

    // ─── Sound ───────────────────────────────────────────────────────
    case 'playSound': {
      const soundName = evalReporter(step.sound, target, ctx, runtime);
      if (runtime.sound) runtime.sound.play(String(soundName));
      break;
    }

    case 'playSoundUntilDone': {
      const soundName = evalReporter(step.sound, target, ctx, runtime);
      if (runtime.sound) {
        const promise = runtime.sound.playUntilDone(String(soundName));
        yield { type: 'waitPromise', promise };
      }
      break;
    }

    case 'stopAllSounds':
      if (runtime.sound) runtime.sound.stopAll();
      break;

    case 'setVolume':
      target.volume = Math.max(0, Math.min(100, Number(evalReporter(step.value, target, ctx, runtime))));
      break;

    case 'changeVolume':
      target.volume = Math.max(0, Math.min(100, target.volume + Number(evalReporter(step.value, target, ctx, runtime))));
      break;

    // ─── Events ──────────────────────────────────────────────────────
    case 'broadcast': {
      const name = String(evalReporter(step.name, target, ctx, runtime));
      runtime.broadcast(name);
      break;
    }

    case 'broadcastAndWait': {
      const name = String(evalReporter(step.name, target, ctx, runtime));
      const threads = runtime._startBroadcastThreads(name);
      if (threads.length > 0) {
        yield { type: 'waitThreads', threads };
      }
      break;
    }

    // ─── Control ─────────────────────────────────────────────────────
    case 'wait': {
      const secs = Number(evalReporter(step.secs, target, ctx, runtime));
      if (secs > 0) {
        yield { type: 'waitSeconds', secs };
      }
      break;
    }

    case 'repeat': {
      const times = Math.round(Number(evalReporter(step.times, target, ctx, runtime)));
      for (let i = 0; i < times; i++) {
        yield* runSteps(step.steps, target, ctx, runtime);
        yield { type: 'frame' };
      }
      break;
    }

    case 'forever': {
      while (true) {
        yield* runSteps(step.steps, target, ctx, runtime);
        yield { type: 'frame' };
      }
    }

    // eslint-disable-next-line no-fallthrough (unreachable after forever)
    case 'if': {
      const cond = evalReporter(step.condition, target, ctx, runtime);
      if (cond) {
        yield* runSteps(step.then, target, ctx, runtime);
      }
      break;
    }

    case 'ifElse': {
      const cond = evalReporter(step.condition, target, ctx, runtime);
      if (cond) {
        yield* runSteps(step.then, target, ctx, runtime);
      } else {
        yield* runSteps(step.else, target, ctx, runtime);
      }
      break;
    }

    case 'waitUntil': {
      yield {
        type: 'waitUntil',
        fn: () => !!evalReporter(step.condition, target, ctx, runtime),
      };
      break;
    }

    case 'repeatUntil': {
      while (!evalReporter(step.condition, target, ctx, runtime)) {
        yield* runSteps(step.steps, target, ctx, runtime);
        yield { type: 'frame' };
      }
      break;
    }

    case 'stop': {
      const tgt = step.target;
      if (tgt === 'all') {
        runtime.threads.stopAll();
      } else if (tgt === 'this') {
        // ThreadRunner handles this via return
        return;
      } else if (tgt === 'others') {
        // Stop other scripts of this sprite
        runtime.threads.stopOtherScriptsOf(target, null);
      }
      break;
    }

    case 'createClone': {
      const tgtName = step.target;
      if (tgtName === 'myself') {
        runtime.clones.createClone(target);
      } else {
        const sprite = runtime.getTargetByName(tgtName);
        if (sprite) runtime.clones.createClone(sprite);
      }
      break;
    }

    case 'deleteClone': {
      if (target.isClone) {
        runtime.clones.deleteClone(target);
        return; // Stop this thread
      }
      break;
    }

    // ─── Sensing ─────────────────────────────────────────────────────
    case 'resetTimer':
      runtime.timerStart = runtime._now();
      break;

    case 'askAndWait': {
      // Simplified: just set answer to empty and continue
      // In a full implementation this would show a UI prompt
      runtime._answer = '';
      break;
    }

    // ─── Variables ───────────────────────────────────────────────────
    case 'set': {
      const name = step.var;
      const value = evalReporter(step.value, target, ctx, runtime);
      if (target.variables.has(name)) {
        target.variables.set(name, value);
      } else if (runtime.stage && runtime.stage.variables.has(name)) {
        runtime.stage.variables.set(name, value);
      }
      break;
    }

    case 'change': {
      const name = step.var;
      const delta = evalReporter(step.value, target, ctx, runtime);
      if (target.variables.has(name)) {
        target.variables.change(name, delta);
      } else if (runtime.stage && runtime.stage.variables.has(name)) {
        runtime.stage.variables.change(name, delta);
      }
      break;
    }

    case 'showVar': {
      const name = step.var;
      if (target.variables.has(name)) {
        target.variables.showMonitor(name);
      } else if (runtime.stage && runtime.stage.variables.has(name)) {
        runtime.stage.variables.showMonitor(name);
      }
      break;
    }

    case 'hideVar': {
      const name = step.var;
      if (target.variables.has(name)) {
        target.variables.hideMonitor(name);
      } else if (runtime.stage && runtime.stage.variables.has(name)) {
        runtime.stage.variables.hideMonitor(name);
      }
      break;
    }

    // ─── Lists ───────────────────────────────────────────────────────
    case 'listAdd': {
      const listName = step.list;
      const item = evalReporter(step.item, target, ctx, runtime);
      const store = target.lists.has(listName) ? target.lists
        : (runtime.stage && runtime.stage.lists.has(listName) ? runtime.stage.lists : null);
      if (store) store.add(listName, item);
      break;
    }

    case 'listDeleteAt': {
      const listName = step.list;
      const index = evalReporter(step.index, target, ctx, runtime);
      const store = target.lists.has(listName) ? target.lists
        : (runtime.stage && runtime.stage.lists.has(listName) ? runtime.stage.lists : null);
      if (store) store.deleteAt(listName, index);
      break;
    }

    case 'listDeleteAll': {
      const listName = step.list;
      const store = target.lists.has(listName) ? target.lists
        : (runtime.stage && runtime.stage.lists.has(listName) ? runtime.stage.lists : null);
      if (store) store.deleteAll(listName);
      break;
    }

    case 'listInsertAt': {
      const listName = step.list;
      const index = evalReporter(step.index, target, ctx, runtime);
      const item  = evalReporter(step.item,  target, ctx, runtime);
      const store = target.lists.has(listName) ? target.lists
        : (runtime.stage && runtime.stage.lists.has(listName) ? runtime.stage.lists : null);
      if (store) store.insertAt(listName, index, item);
      break;
    }

    case 'listReplaceAt': {
      const listName = step.list;
      const index = evalReporter(step.index, target, ctx, runtime);
      const item  = evalReporter(step.item,  target, ctx, runtime);
      const store = target.lists.has(listName) ? target.lists
        : (runtime.stage && runtime.stage.lists.has(listName) ? runtime.stage.lists : null);
      if (store) store.replaceAt(listName, index, item);
      break;
    }

    case 'showList': {
      const listName = step.list;
      const store = target.lists.has(listName) ? target.lists
        : (runtime.stage && runtime.stage.lists.has(listName) ? runtime.stage.lists : null);
      if (store) store.showMonitor(listName);
      break;
    }

    case 'hideList': {
      const listName = step.list;
      const store = target.lists.has(listName) ? target.lists
        : (runtime.stage && runtime.stage.lists.has(listName) ? runtime.stage.lists : null);
      if (store) store.hideMonitor(listName);
      break;
    }

    // ─── Procedures ──────────────────────────────────────────────────
    case 'call': {
      const procName = step.proc;
      const procDef = target._procedures[procName]
        ?? (runtime.stage && runtime.stage._procedures[procName]);

      if (!procDef) break;

      const args = {};
      for (const [k, v] of Object.entries(step.args ?? {})) {
        args[k] = evalReporter(v, target, ctx, runtime);
      }

      const newCtx = { args };
      yield* runSteps(procDef.steps, target, newCtx, runtime);
      break;
    }

    // ─── Pen ─────────────────────────────────────────────────────────
    case 'penClear':
      if (runtime.pen) runtime.pen.clear();
      break;

    case 'penStamp':
      if (runtime.pen) runtime.pen.stamp(target);
      break;

    case 'penDown':
      if (runtime.pen) runtime.pen.penDown(target);
      break;

    case 'penUp':
      if (runtime.pen) runtime.pen.penUp(target);
      break;

    case 'penSetColor':
      if (runtime.pen) runtime.pen.setColor(target, String(evalReporter(step.color, target, ctx, runtime)));
      break;

    case 'penSetSize':
      if (runtime.pen) runtime.pen.setSize(target, evalReporter(step.size, target, ctx, runtime));
      break;

    case 'penChangeSize':
      if (runtime.pen) runtime.pen.changeSize(target, evalReporter(step.value, target, ctx, runtime));
      break;

    default:
      // Unknown step type — ignore
      break;
  }
}
