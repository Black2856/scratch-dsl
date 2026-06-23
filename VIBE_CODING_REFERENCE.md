# 作品オーサリング・プロンプト（vibe coding 用）

> **このファイルは vibe coding で作品をつくるとき AI に読み込ませるプロンプトである。**
> 以下の規約に従って `workspace/<name>/` の Scratch 作品を実装・編集すること。

## あなたのタスク

ユーザーが望む Scratch 作品を、このツールの **DSL** として
`workspace/<name>/project.ts`（大きければ `workspace/<name>/src/` に分割）へ実装し、
`npm run sb3 -- <name>`（形式検証）と `npm run preview -- <name>`（実Scratch VMで実行）で
確認できる状態にする。

## 絶対に守る規約

1. **正本は DSL**。`project.ts` の `DslProject` だけが正本。生成された `project.json` / `.sb3` /
   Runtime 状態を編集・入力にしない。変更は DSL を直して再生成する。
2. **登録済み opcode だけ**を使う（正本 `src/blocks/opcodeMetadata.ts`）。未登録 opcode・推測の
   opcode・silent no-op を使わない。迷ったら `getOpcodeMetadata('<opcode>')` で input/field/shadow/
   shape/target を確認する（§5）。
3. **大きい作品は分割する**。`project.ts` は組み立てと `default export` の main に保ち、
   スプライト/機能ごとに `workspace/<name>/src/` のモジュールへ分けて import する（§2）。
4. **ブロックグラフは §4 のビルダーで生成する**（手書きの `parent/next/shadow/id` は事故るため）。
5. **id はプロジェクト全体で一意**、作品名は英数字始まり、shadow / broadcast / asset のルール（§8）を守る。
6. 完成の定義: `npm run sb3 -- <name>` が `scratch-parser: pass`、かつ意図した挙動が
   `npm run preview` / `npm run shot` で確認できること。

このツールは実Scratch VM（`@scratch/scratch-vm` + `scratch-render`）で `.sb3` を実行して
視覚・音・挙動を確認する。本リポジトリに自作レンダラは無い（DSL→検証→SB3 が責務）。
使えるブロックの正本は `src/blocks/opcodeMetadata.ts`。

---

## 1. ワークフロー

```powershell
npm run new -- <name>          # workspace/<name>/ に雛形
# workspace/<name>/project.ts（と src/）を編集
npm run preview -- <name>      # 実Scratch VM + scratch-renderで実行（見た目・音・挙動の確認）
npm run shot -- <name> --keys 1,space   # screenshot + VM状態JSON（自動/AI確認用）
npm run sb3 -- <name>          # .sb3 出力（scratch-parser形式検証つき）
```

---

## 2. ファイル構成と「分割方針」

小さい作品は `project.ts` 1 ファイルでよい。**大きい作品は `project.ts` を“main（組み立てと
default export）”だけにし、スプライト/機能ごとに `workspace/<name>/src/` へ分割する。**

```text
workspace/<name>/
  project.ts          # main: 各モジュールを import して DslProject を組み立て default export
  src/                # この作品の DSL コード（分割）
    builder.ts        # （推奨）ブロックグラフ生成ヘルパー（§4）
    stage.ts          # Stage 定義
    sprites/
      hero.ts         # スプライト1の costume/sound/scripts
      enemy.ts
    lib/
      helpers.ts      # 共通の作りかけ部品
  assets.json
  assets/
  output/
```

- `project.ts` から `./src/...` を、型は `../../src/validation/projectValidator.ts` を import できる
  （ローダーは動的 import + node の type stripping で `.ts` のネスト import に対応。**検証済み**）。
  - `project.ts`（深さ `workspace/<name>/`）→ リポジトリ src は `../../src/...`
  - `src/builder.ts`（深さ `workspace/<name>/src/`）→ リポジトリ src は `../../../src/...`
- 1 作品 = 1 ディレクトリ。素材はその作品の `assets/` に同梱（共有プールなし）。
- 共通の Runtime/SB3 ロジックを workspace 側へ持ち込まない（それはリポジトリの `src/` の責務）。

### main（`project.ts`）の形

```ts
import type {DslProject} from '../../src/validation/projectValidator.ts';
import {buildStage} from './src/stage.ts';
import {hero} from './src/sprites/hero.ts';
import {enemy} from './src/sprites/enemy.ts';

const project: DslProject = {
    schemaVersion: '1.0.0',
    project: {id: '<name>', name: '<name>'},
    stage: buildStage(),
    sprites: [hero(), enemy()],
    assets: [/* §6 */],
    monitors: [],
    extensions: [],            // pen を使うなら ['pen']
    meta: {source: 'workspace/<name>/project.ts'}
};
export default project;        // または: export {project}
```

---

## 3. DSL の形（最低限）

### DslProject
`schemaVersion('1.0.0')`, `project{id,name}`, `stage`, `sprites[]`, `assets[]`, `monitors[]`,
`extensions[]`, `meta{source}`。

### Target（Stage / Sprite 共通）
`id, name, isStage, variables[], lists[], broadcasts[], blocks{}, scripts[], comments[],
currentCostume, costumes[], sounds[], volume, layerOrder`
- Sprite はさらに: `visible, x, y, size, direction, draggable, rotationStyle`
- Stage はさらに: `tempo, videoTransparency, videoState, textToSpeechLanguage`、`isStage: true`
- `variables[]` = `{id, name, value, isCloud:false}`、`lists[]` = `{id, name, values:[]}`
- `broadcasts[]` = `{id, name}`（**broadcast 宣言は Stage が持つ**。global）

### Block
```ts
{ id, opcode, next, parent, inputs, fields, shadow, topLevel, mutation? }
```
- `inputs`: `{ NAME: {block, shadow} }`
  - 値入力（数値/文字列/menu）: shadow primitive を作り `{block: shadowId, shadow: shadowId}`
  - reporter/boolean を差す: `{block: reporterId, shadow: defaultShadowId | null}`
  - substack（C ブロックの中身）: `{block: 最初の子ブロックId, shadow: null}`
- `fields`: `{ NAME: {value, id?} }`
  - variable / list / broadcast 参照は **`id` 必須**（例 `{value:'score', id:'v-score'}`）
- `shadow`: shadow ブロックは `true`。その opcode は metadata の `shadow` 指定と一致させる
  （例 数値入力なら `math_number`、文字列なら `text`、色なら `colour_picker`、menu はその menu opcode）
- `topLevel`: hat / 単独トップブロックは `true`、parent は `null`
- `scripts[]`: **topLevel な hat ブロックの id の配列**

### Costume / Sound / Monitor
- costume: `{id, name, assetId, dataFormat, md5ext, bitmapResolution, rotationCenterX, rotationCenterY}`
  - `id` と `assetId` は別物（`id` はコスチューム固有、`assetId` は素材の MD5）
  - bitmap（png）は `bitmapResolution`（Scratch 標準背景は 960×360 等で 2）、回転中心は**native px**
- sound: `{id, name, assetId, dataFormat:'wav'|'mp3', md5ext, format:'', rate, sampleCount}`
- monitor（変数表示）: `{id, opcode:'data_variable', mode:'default', visible:true,
  params:{VARIABLE:'<name>'}, spriteName:null, value:'', x, y}`

---

## 4. ビルダー（肥大化対策・強く推奨）

生のブロックグラフ（`id/parent/next/shadow` 手書き）は冗長で事故りやすい。**metadata から
期待 shadow を自動解決するジェネリックビルダー**を `workspace/<name>/src/builder.ts` に置くと、
スクリプトを「コマンドの配列」で書ける。以下はそのまま使える最小版。

```ts
// workspace/<name>/src/builder.ts
import type {DslBlock} from '../../../src/validation/projectValidator.ts';
import {getOpcodeMetadata} from '../../../src/blocks/opcodeMetadata.ts';

type Fields = Record<string, {value: string | number; id?: string}>;
interface Rep {op: string; inputs?: Record<string, In>; fields?: Fields}
interface Sub {sub: Cmd[]}
export type In = number | string | Rep | Sub;
export interface Cmd {op: string; inputs?: Record<string, In>; fields?: Fields; mutation?: Record<string, unknown>}
export interface Hat {op: string; inputs?: Record<string, In>; fields?: Fields; mutation?: Record<string, unknown>}
export interface Script {hat: Hat; body: Cmd[]}

const DEFAULTS: Record<string, string | number> = {
    math_number: 0, math_positive_number: 0, math_whole_number: 0,
    math_integer: 0, math_angle: 90, text: '', colour_picker: '#1133ff'
};

export const makeBuilder = (prefix: string) => {
    const blocks: Record<string, DslBlock> = {};
    const scripts: string[] = [];
    let n = 0;
    const id = () => `${prefix}-${n++}`;
    const put = (b: DslBlock) => (blocks[b.id] = b, b.id);
    const field = (op: string) => Object.keys(getOpcodeMetadata(op)?.fields ?? {})[0] ?? 'NUM';

    const shadow = (op: string, value: string | number, parent: string, refId?: string) =>
        put({id: id(), opcode: op, next: null, parent, inputs: {},
            fields: {[field(op)]: refId ? {value, id: refId} : {value}}, shadow: true, topLevel: false});

    const isRep = (v: In): v is Rep => typeof v === 'object' && v !== null && 'op' in v;
    const isSub = (v: In): v is Sub => typeof v === 'object' && v !== null && 'sub' in v;

    const input = (pid: string, pop: string, name: string, v: In): DslBlock['inputs'][string] => {
        const m = getOpcodeMetadata(pop)?.inputs[name];
        const sop = m?.shadow, kind = m?.kind;
        if (isSub(v) || kind === 'substack') return {block: stack(isSub(v) ? v.sub : [], pid), shadow: null};
        if (isRep(v)) {
            const r = reporter(v, pid);
            return sop ? {block: r, shadow: shadow(sop, DEFAULTS[sop] ?? '', pid)} : {block: r, shadow: null};
        }
        if (kind === 'boolean') return {block: null, shadow: null};
        const op = sop ?? 'text';
        const ref = op === 'event_broadcast_menu' ? `bc-${v}` : undefined; // broadcast は id 必須（命名は揃える）
        const s = shadow(op, v as string | number, pid, ref);
        return {block: s, shadow: s};
    };
    const reporter = (spec: Rep, parent: string) => {
        const self = id(); const inputs: DslBlock['inputs'] = {};
        put({id: self, opcode: spec.op, next: null, parent, inputs, fields: spec.fields ?? {}, shadow: false, topLevel: false});
        for (const [k, v] of Object.entries(spec.inputs ?? {})) inputs[k] = input(self, spec.op, k, v);
        return self;
    };
    const stack = (cmds: Cmd[], parent: string): string | null => {
        let first: string | null = null, prev: string | null = null;
        for (const c of cmds) {
            const self = id(); const inputs: DslBlock['inputs'] = {};
            put({id: self, opcode: c.op, next: null, parent: prev ?? parent, inputs,
                fields: c.fields ?? {}, shadow: false, topLevel: false, ...(c.mutation ? {mutation: c.mutation} : {})});
            for (const [k, v] of Object.entries(c.inputs ?? {})) inputs[k] = input(self, c.op, k, v);
            if (prev) blocks[prev].next = self;
            first ??= self; prev = self;
        }
        return first;
    };
    const addScript = (s: Script) => {
        const hat = id(); const hi: DslBlock['inputs'] = {};
        put({id: hat, opcode: s.hat.op, next: null, parent: null, inputs: hi, fields: s.hat.fields ?? {},
            shadow: false, topLevel: true, ...(s.hat.mutation ? {mutation: s.hat.mutation} : {})});
        for (const [k, v] of Object.entries(s.hat.inputs ?? {})) hi[k] = input(hat, s.hat.op, k, v);
        scripts.push(hat);
        const f = stack(s.body, hat);
        if (f) { blocks[hat].next = f; blocks[f].parent = hat; }
    };
    return {blocks, scripts, addScript};
};
```

使い方（メニューやリテラルは値だけ渡す。reporter は `{op, inputs}`、変数 field は `{value, id}`）:

```ts
// workspace/<name>/src/sprites/hero.ts
import {makeBuilder, type Cmd} from '../builder.ts';

const b = makeBuilder('hero');
const setv = (name: string, id: string, v: any): Cmd =>
    ({op: 'data_setvariableto', inputs: {VALUE: v}, fields: {VARIABLE: {value: name, id}}});

b.addScript({hat: {op: 'event_whenflagclicked'}, body: [
    {op: 'motion_gotoxy', inputs: {X: -100, Y: 0}},
    {op: 'looks_sayforsecs', inputs: {MESSAGE: 'こんにちは!', SECS: 2}},
    {op: 'control_repeat', inputs: {TIMES: 4, SUBSTACK: {sub: [
        {op: 'motion_changexby', inputs: {DX: 50}},
        {op: 'control_wait', inputs: {DURATION: 0.2}}
    ]}}},
    {op: 'motion_goto', inputs: {TO: '_random_'}},   // menu はリテラル文字列でOK
    setv('score', 'v-score', {op: 'operator_add', inputs: {NUM1: 1, NUM2: 2}})  // reporter
]});

export const hero = () => ({
    id: 'hero', isStage: false as const, name: 'Hero', variables: [], lists: [], broadcasts: [],
    blocks: b.blocks, scripts: b.scripts, comments: [], currentCostume: 0,
    costumes: [/* §6 */], sounds: [], volume: 100, layerOrder: 1, visible: true,
    x: 0, y: 0, size: 100, direction: 90, draggable: false, rotationStyle: 'all around' as const
});
```

---

## 5. 使える opcode（正本 = `src/blocks/opcodeMetadata.ts`）

カテゴリ概観（実装済み。詳細な input/field/shadow は metadata を見る）:

- **event**: `event_whenflagclicked / whenkeypressed / whenbroadcastreceived / broadcast / broadcastandwait /
  whenthisspriteclicked / whenstageclicked / whenbackdropswitchesto / whengreaterthan`
- **control**: `wait / repeat / forever / if / if_else / stop / create_clone_of / delete_this_clone /
  start_as_clone / wait_until / repeat_until / while`
- **motion**: `movesteps / turnright / turnleft / gotoxy / pointindirection / changexby / setx / changeyby /
  sety / setrotationstyle / xposition / yposition / direction / goto / glideto / glidesecstoxy /
  pointtowards / ifonedgebounce`
- **looks**: `show / hide / switchcostumeto / nextcostume / changesizeby / setsizeto / gotofrontback /
  goforwardbackwardlayers / say / sayforsecs / think / thinkforsecs / switchbackdropto /
  switchbackdroptoandwait / nextbackdrop / changeeffectby / seteffectto / cleargraphiceffects /
  costumenumbername / backdropnumbername / size`
- **sound**: `play / playuntildone / stopallsounds / changevolumeby / setvolumeto / volume /
  changeeffectby / seteffectto / cleareffects`
- **sensing**: `keypressed / mousedown / mousex / mousey / touchingobject / touchingcolor /
  coloristouchingcolor / distanceto / askandwait / answer / setdragmode / loudness / timer /
  resettimer / of / current / dayssince2000 / online / username`
- **operator**: `add / subtract / multiply / divide / random / lt / equals / gt / and / or / not /
  join / letter_of / length / contains / mod / round / mathop`
- **data**: `variable / setvariableto / changevariableby / showvariable / hidevariable /
  listcontents / addtolist / deleteoflist / deletealloflist / insertatlist / replaceitemoflist /
  itemoflist / itemnumoflist / lengthoflist / listcontainsitem / showlist / hidelist`
- **pen**（`extensions: ['pen']`）: `clear / stamp / penDown / penUp / setPenColorToColor /
  changePenSizeBy / setPenSizeTo / changePenColorParamBy / setPenColorParamTo`
- **procedures**（カスタムブロック）: `definition / prototype / call / argument_reporter_string_number /
  argument_reporter_boolean`（mutation で proccode / argumentids / argumentnames / warp を持つ）

迷ったら `getOpcodeMetadata('<opcode>')` の `inputs` / `fields` / `shape` / `target` を確認する。

---

## 6. アセット

`assets.json` と DSL の costume/sound の両方に同じ `assetId`（= 実 bytes の MD5）と
`md5ext`（= `assetId.dataFormat`）を書く。MD5 はリポジトリの `computeMd5` で算出する:

```js
// node --no-warnings --experimental-strip-types でこのスクリプトを repo ルートから実行
import {readFile} from 'node:fs/promises';
import {computeMd5} from './src/assets/md5.ts';
const bytes = new Uint8Array(await readFile('workspace/<name>/assets/sprite/foo.png'));
console.log(computeMd5(bytes)); // -> assetId
```

`assets.json` の各 entry: `{assetId, md5ext, dataFormat, kind:'costume'|'sound', mimeType, source}`。
`source` はリポジトリルート基準（例 `workspace/<name>/assets/sprite/foo.png`）。
DSL の `assets[]` は `{id:assetId, kind, dataFormat, md5ext, source}` で manifest と一致させる。

---

## 7. 確認

- `npm run preview -- <name>`: 実 Scratch VM + scratch-render で見た目・音・挙動を確認（正本）。
- `npm run shot -- <name> [--keys ...]`: screenshot を `output/<name>-shot.png` に、VM状態を JSON で取得（自動/AI 確認）。
- `npm run sb3 -- <name>`: `.sb3` 形式を `scratch-parser` で検証。

---

## 8. よくある落とし穴

- **id はプロジェクト全体で一意**。block / variable / list / broadcast / costume / sound / asset すべて。
  costume の `id` と `assetId` は別物にする。
- 作品名は**英数字始まり**（`[a-zA-Z0-9][a-zA-Z0-9_-]*`）。
- **broadcast** は Stage が `broadcasts[]` で宣言し、`event_broadcast_menu` / hat の field は `{value, id}` を揃える。
- **shadow ブロックは `shadow:true`**、opcode は metadata の shadow 指定と一致（数値=`math_number` 等）。
- **scripts に入れるのは topLevel な hat だけ**。各ブロックの `parent`/`next` を整合させる。
- **登録済み opcode のみ**使う（`src/blocks/opcodeMetadata.ts` に無いものは使わない）。
- pen を使うなら `extensions: ['pen']` を付ける。
- Stage は座標/向きを持たない（motion reporter は 0 / 90 を返す）。

詳細設計: `docs/main_design/{DSL_AUTHORING_GUIDE_FOR_AI, WORKSPACE_PROJECT_FLOW,
AI_GENERATION_WORKFLOW_SPEC}.md`、`docs/templates/`。
