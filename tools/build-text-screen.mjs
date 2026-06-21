/**
 * build-text-screen.mjs
 * Determination フォントから生成したグリフ(base64 PNG)を画像ファイルに書き出し、
 * 文字描画テスト画面の DSL (spec/text-screen.dsl.json) を生成する。
 *
 * Scratch には文字表示ブロックが無いため、1文字=1コスチューム(画像)とし、
 * カスタムブロック writeText が文字列を1文字ずつクローン生成して並べる方式を採る。
 *
 * グリフPNG(resorce/font/determination/glyphs/cXXXX.png)が既にあれば、それだけで
 * DSL を再生成できる。PNG を作り直すには tools/_glyphs.json が必要（ブラウザで生成）:
 *   1) node tools/serve.js 8123
 *   2) http://localhost:8123/web/index.html を開き DevTools コンソールで
 *      determination.ttf を FontFace 読込→各文字を canvas で描画→toDataURL を
 *      { cell:{CW,CH,FS}, glyphs:{ "<hex>":"<base64>" } } として tools/_glyphs.json に保存
 *   3) node tools/build-text-screen.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GLYPH_JSON = path.join(ROOT, 'tools', '_glyphs.json');
const GLYPH_DIR_REL = 'resorce/font/determination/glyphs';
const GLYPH_DIR = path.join(ROOT, GLYPH_DIR_REL);
const DSL_OUT = path.join(ROOT, 'spec', 'text-screen.dsl.json');

const SPACING = 17;
let CW = 18, CH = 28; // 既定セル寸法（_glyphs.json があれば上書き）
let written = 0;

// ── 1. PNG 書き出し（_glyphs.json があるときのみ）────────────────
fs.mkdirSync(GLYPH_DIR, { recursive: true });
if (fs.existsSync(GLYPH_JSON)) {
  const data = JSON.parse(fs.readFileSync(GLYPH_JSON, 'utf8'));
  if (data.cell) ({ CW, CH } = data.cell);
  for (const [hex, b64] of Object.entries(data.glyphs)) {
    fs.writeFileSync(path.join(GLYPH_DIR, `c${hex}.png`), Buffer.from(b64, 'base64'));
    written++;
  }
}

// ── 2. コスチューム一覧は glyphs ディレクトリの cXXXX.png から構築 ──
const costumes = fs.readdirSync(GLYPH_DIR)
  .filter((f) => /^c[0-9a-fA-F]{4}\.png$/.test(f))
  .sort()
  .map((file) => {
    const ch = String.fromCharCode(parseInt(file.slice(1, 5), 16));
    return {
      name: ch,                                 // コスチューム名 = その文字（switchCostume で一致）
      file: `${GLYPH_DIR_REL}/${file}`,
      dataFormat: 'png',
      bitmapResolution: 1,
      rotationCenterX: CW / 2,
      rotationCenterY: CH / 2,
    };
  });
if (costumes.length === 0) {
  console.error('グリフPNGが見つかりません。先にブラウザで _glyphs.json を生成してください。');
  process.exit(1);
}

// ── 3. DSL 部品 ──────────────────────────────────────────────────
const V = (name) => ({ op: 'var', name });
const ARG = (name) => ({ op: 'arg', name });

// writeText(text, x, y): 文字列を1文字ずつ pen の stamp で焼き付けて x から spacing 間隔で並べる。
// 1文字ごとに「コスチュームをその文字へ切替 → 位置へ移動 → スタンプ」を繰り返す。
// クローンを使わないのでクローン数(300)上限の影響を受けない。
const writeText = {
  name: 'writeText',
  params: [
    { name: 'text', type: 'string' },
    { name: 'x', type: 'number' },
    { name: 'y', type: 'number' },
  ],
  warp: true,
  steps: [
    { type: 'set', var: 'i', value: 1 },
    { type: 'repeat', times: { op: 'lengthOf', text: ARG('text') }, steps: [
      { type: 'set', var: 'gchar', value: { op: 'letterOf', text: ARG('text'), index: V('i') } },
      { type: 'switchCostume', name: V('gchar') },
      { type: 'setX', x: { op: 'add', a: ARG('x'),
        b: { op: 'mul', a: { op: 'sub', a: V('i'), b: 1 }, b: V('spacing') } } },
      { type: 'setY', y: ARG('y') },
      // 空白はスタンプ不要（透明）
      { type: 'if', condition: { op: 'not', a: { op: 'eq', a: V('gchar'), b: ' ' } }, then: [
        { type: 'penStamp' },
      ] },
      { type: 'change', var: 'i', value: 1 },
    ] },
  ],
};

// テスト画面の表示内容
const LINES = [
  ['* DETERMINATION FONT TEST', -214, 150],
  ['ABCDEFGHIJKLMNOPQRSTUVWXYZ', -214, 112],
  ['abcdefghijklmnopqrstuvwxyz', -214, 84],
  ['0123456789 .,!?:;-+=*/()', -214, 56],
  ['THE QUICK BROWN FOX', -214, 8],
  ['JUMPS OVER THE LAZY DOG.', -214, -20],
  ['* STAY DETERMINED.', -214, -80],
];

const greenFlag = {
  event: { type: 'green_flag' },
  steps: [
    { type: 'hide' },          // 描画担当スプライト本体は隠す（stamp は非表示でも焼ける）
    { type: 'penClear' },      // 前回の描画を消す
    { type: 'set', var: 'spacing', value: SPACING },
    ...LINES.map(([text, x, y]) => ({ type: 'call', proc: 'writeText', args: { text, x, y } })),
  ],
};

const dsl = {
  meta: { name: 'Determination Text Screen', dslVersion: '1.0' },
  broadcasts: [],
  stage: {
    name: 'Stage', isStage: true,
    tempo: 60, videoTransparency: 50, videoState: 'on', textToSpeechLanguage: null,
    currentCostume: 0,
    costumes: [],          // 背景なし（黒は web 側 CSS）
    sounds: [], variables: {}, lists: {}, procedures: [], scripts: [],
  },
  sprites: [
    {
      name: 'Glyph', isStage: false,
      x: 0, y: 0, size: 100, direction: 90,
      visible: false, draggable: false, rotationStyle: "don't rotate",
      currentCostume: 0,
      costumes,
      sounds: [],
      variables: { i: 1, gchar: '', spacing: SPACING },
      lists: {},
      procedures: [writeText],
      scripts: [greenFlag],
    },
  ],
};

fs.writeFileSync(DSL_OUT, JSON.stringify(dsl, null, 2) + '\n');

const nonSpaceChars = LINES.reduce((n, [t]) => n + t.replace(/ /g, '').length, 0);
console.log(`glyph PNG written : ${written} (${GLYPH_DIR_REL}/)`);
console.log(`costumes in DSL   : ${costumes.length}`);
console.log(`DSL written       : spec/text-screen.dsl.json`);
console.log(`test lines        : ${LINES.length}, pen stamps (non-space chars): ${nonSpaceChars}`);
