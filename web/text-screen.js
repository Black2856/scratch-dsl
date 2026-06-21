/**
 * text-screen.js
 * Determination フォントによる画像文字描画テスト画面。
 * DSL(spec/text-screen.dsl.json) を Runtime で実行し、Glyph スプライトの
 * writeText カスタムブロックが各文字をクローンとして描画する。
 */
import { Runtime, loadCostumeImages } from '../engine/index.js';

const canvas    = document.getElementById('stage');
const btnDraw   = document.getElementById('btn-draw');
const btnStop   = document.getElementById('btn-stop');
const stCostume = document.getElementById('st-costumes');

let runtime = null;

async function init() {
  const res = await fetch('../spec/text-screen.dsl.json');
  if (!res.ok) throw new Error(`DSL fetch failed: ${res.status}`);
  const dsl = await res.json();

  runtime = new Runtime({ canvas });
  runtime.loadProject(dsl);

  // コスチューム画像（グリフPNG）をロード。serve.js はルート配信なので basePath '/'。
  await loadCostumeImages(runtime, { basePath: '/' });

  window.__runtime = runtime;
  window.__textState = () => ({
    costumes: (runtime.getTargetByName('Glyph')?.costumes.length) ?? 0,
  });

  const glyph = runtime.getTargetByName('Glyph');
  stCostume.textContent = glyph ? glyph.costumes.length : 0;
  console.log('[text-screen] runtime ready, glyph costumes:', glyph?.costumes.length);
}

async function run() {
  if (!runtime) {
    btnDraw.disabled = true;
    btnDraw.textContent = '⌛ 読み込み中...';
    try {
      await init();
    } catch (e) {
      console.error('[text-screen] init failed:', e);
      btnDraw.textContent = '▶ 描画（緑の旗）';
      btnDraw.disabled = false;
      return;
    }
    btnDraw.disabled = false;
  }
  runtime.greenFlag();
  runtime.startTick();
  btnDraw.textContent = '↺ 再描画';
}

btnDraw.addEventListener('click', run);
btnStop.addEventListener('click', () => { if (runtime) runtime.stop(); });

// 利便性: ロード後に自動描画
run();
