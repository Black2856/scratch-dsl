/**
 * pen.test.js
 * Pen ブロック（penClear/penStamp/penDown/penUp/penSetColor/penSetSize/penChangeSize）の
 * 実行とペン状態をヘッドレスで検証し、DSL→sb3 の pen 拡張 / pen_* opcode も検証する。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Runtime } from '../engine/Runtime.js';
import { Sb3Generator } from '../tools/generate-sb3.js';

function makeRuntime(dsl) {
  const rt = new Runtime({ canvas: null, soundBridge: null });
  rt.loadProject(dsl);
  return rt;
}
const stepN = (rt, n) => { for (let i = 0; i < n; i++) rt.stepFrame(); };

function penDsl(steps) {
  return {
    stage: { name: 'Stage', isStage: true, variables: {}, lists: {}, procedures: [], scripts: [] },
    sprites: [{
      name: 'P', isStage: false,
      x: 0, y: 0, size: 100, direction: 90, visible: true, draggable: false, rotationStyle: 'all around',
      currentCostume: 0, costumes: [], sounds: [], variables: {}, lists: {}, procedures: [],
      scripts: [{ event: { type: 'green_flag' }, steps }],
    }],
    broadcasts: [],
  };
}

test('pen steps update pen state and do not throw headless', () => {
  const rt = makeRuntime(penDsl([
    { type: 'penDown' },
    { type: 'penSetColor', color: '#ff0000' },
    { type: 'penSetSize', size: 5 },
    { type: 'penChangeSize', value: 3 },
    { type: 'setX', x: 50 },   // moveTo (pen down) — must not throw headless
    { type: 'penStamp' },      // no-op headless — must not throw
    { type: 'penUp' },
    { type: 'penClear' },
  ]));
  rt.greenFlag();
  stepN(rt, 3);
  const sprite = rt.getTargetByName('P');
  const state = rt.pen._getState(sprite);
  assert.equal(state.color, '#ff0000');
  assert.equal(state.size, 8);     // 5 + 3
  assert.equal(state.down, false); // penUp
});

test('penDown leaves pen down until penUp', () => {
  const rt = makeRuntime(penDsl([
    { type: 'penDown' },
    { type: 'changeX', value: 10 },
  ]));
  rt.greenFlag();
  stepN(rt, 2);
  assert.equal(rt.pen._getState(rt.getTargetByName('P')).down, true);
});

test('DSL with pen compiles to sb3 with pen extension and opcodes', () => {
  const proj = new Sb3Generator(penDsl([
    { type: 'penClear' },
    { type: 'penStamp' },
    { type: 'penSetColor', color: '#00ff00' },
  ])).build();
  assert.deepEqual(proj.extensions, ['pen']);
  const sprite = proj.targets.find(t => t.name === 'P');
  const ops = Object.values(sprite.blocks).map(b => b.opcode);
  assert.ok(ops.includes('pen_clear'));
  assert.ok(ops.includes('pen_stamp'));
  assert.ok(ops.includes('pen_setPenColorToColor'));
});

test('DSL without pen has empty extensions', () => {
  const proj = new Sb3Generator(penDsl([{ type: 'setX', x: 10 }])).build();
  assert.deepEqual(proj.extensions, []);
});
