# MANUAL_VERIFICATION_ALL

`workspace/manual-verification`（ultra-test）の全機能を、HTMLJS preview と
Scratch 公式エディタ / TurboWarp の両方で手動確認するためのチェックリスト。

- 正本は 1 つの DSL（`workspace/manual-verification/project.ts`）のみ。
- 同じ DSL から HTMLJS preview と SB3 export を行う。
- 確認モードはカテゴリ別に broadcast / hat で分割しており、巨大な直列
  スクリプトにはしていない。
- 未実装・不安定な機能は **pass 扱いにせず**、本書の支援状況マトリクスで
  `supported` / `partial` / `manual-only` / `unsupported` を明記する。

## 1. 実行方法

```powershell
npm run preview -- manual-verification   # HTMLJS preview（ブラウザ）
npm run sb3 -- manual-verification       # SB3 出力 + scratch-parser 検証
```

- preview はブラウザで開き、緑の旗で開始、Stop で停止。Canvas に
  フォーカスした状態でキー操作する（クリックして Canvas を選択）。
- 音声はブラウザ仕様上、最初のユーザー操作（緑の旗クリック等）後に鳴る。
- SB3 出力: `workspace/manual-verification/output/manual-verification.sb3`
  - エクスポート時に scratch-parser を通す（`scratch-parser: pass` を確認）。
  - ハッシュ記録例: `certutil -hashfile output\manual-verification.sb3 SHA256`

## 2. 画面表示（変数 monitor）

Stage のグローバル変数を monitor として常時表示する。HTMLJS preview では
`CanvasRenderer.renderMonitors` が変数 monitor を Canvas 左上に重ねて描画する。

| 表示 | 変数名 | 意味 |
|---|---|---|
| currentMode | `currentMode` | 現在の確認モード |
| currentStep | `currentStep` | 現在の確認ステップ |
| action | `action` | そのステップで実行する操作 |
| expected | `expected` | 期待される結果 |
| actual | `actual` | 実測値 / 実行結果（測定可能な場合） |
| note | `note` | 補足・支援状況 |

注: HTMLJS の Canvas overlay は**変数 monitor のみ**描画する（リスト monitor は
未対応）。Scratch / TurboWarp では変数・リスト両方の monitor が表示される。

## 3. 操作

| キー | 動作 |
|---|---|
| `0` | menu |
| `1` | motion |
| `2` | looks |
| `3` | events-control |
| `4` | variables-lists |
| `5` | sensing-operators |
| `6` | pen |
| `7` | sound |
| `8` | clone-procedure |
| `9` | full-feature-smoke |
| `space` | 次の確認ステップ |
| `r` | 現在モードを step 1 から再実行 |
| マウス移動 / クリック / `space` 長押し | sensing-operators の live 確認操作 |

補足: 確認モードは menu を除き 9 個あるが、要求の操作系は `1〜8` の 8 キー
だった。8 キーで 9 モードを覆えないため、full-feature-smoke のみ `9` を追加で
割り当てている（本書に明記）。

## 4. 支援状況マトリクス

HTMLJS ランタイムは `src/blocks/opcodeMetadata.ts` に定義された opcode の
うち、`src/runtime/primitives.ts` に primitive 実装があるものだけを実行する。
本作業で次のブリッジを追加した（`supported` 化）:

- `operator_*` 全 15 種（reporter 実装）。
- `sensing_keypressed` / `sensing_mousedown` / `sensing_mousex` / `sensing_mousey`。
- `event_whenkeypressed` ハットの入力ディスパッチ（keydown エッジ）。
- 変数 monitor の Canvas overlay 描画。
- `looks_*`（show/hide/setsizeto/changesizeby/switchcostumeto/nextcostume/
  gotofrontback/goforwardbackwardlayers）と `motion_turnright`/`turnleft`/
  `pointindirection`/`setrotationstyle`/`motion_direction`（モデル可変化 + primitive）。
- broadcast / key ハットのクローン起動、クローンのサウンド再生（クローン seam）。

| カテゴリ / ブロック | HTMLJS | SB3 / 実エディタ | 状況 |
|---|---|---|---|
| events: whenflagclicked / whenbroadcastreceived / broadcast / broadcastandwait | 実行 | 実行 | **supported** |
| events: whenkeypressed | 実行（本作業で追加） | 実行 | **supported** |
| control: wait / repeat / forever / if / if-else / stop | 実行 | 実行 | **supported** |
| control: create_clone_of / delete_this_clone / start_as_clone | 実行 | 実行 | **supported** |
| motion: movesteps / gotoxy / setx / sety / changexby / changeyby / xposition / yposition | 実行 | 実行 | **supported**（移動は Scratch fencing で端をクランプ：partial 挙動あり） |
| motion: turnright / turnleft / pointindirection / setrotationstyle / direction | 実行（本作業で追加） | 実行 | **supported** |
| looks: show / hide / switchcostumeto / nextcostume / changesizeby / setsizeto / gotofrontback / goforwardbackwardlayers | 実行（本作業で追加） | 実行 | **supported**（size/costume の reporter は metadata 未定義のため値は目視。size の costume 相対クランプは未実装：extreme 値で partial） |
| data: 変数 set/change/get | 実行 | 実行 | **supported** |
| data: list add/insert/delete/replace/item/itemnum/length/contains/contents | 実行 | 実行 | **supported** |
| data: 変数/list monitor show/hide | 実行（変数は Canvas 描画／list は状態のみ） | 実行 | **partial**（HTMLJS は list monitor を描画しない） |
| operators: add/subtract/multiply/divide/random/lt/equals/gt/and/or/not/join/letter_of/length/contains | 実行（本作業で追加） | 実行 | **supported** |
| sensing: keypressed / mousedown / mousex / mousey | 実行（本作業で追加） | 実行 | **supported** |
| sound: play / playuntildone / stopallsounds / setvolumeto / changevolumeby / volume | 実行（要ユーザー操作） | 実行 | **supported**（ジェスチャ後に発音：partial） |
| pen: clear / penDown / penUp / stamp / setPenColorToColor / changePenSizeBy / setPenSizeTo | 実行 | 実行 | **supported** |
| procedures: definition / call / argument_reporter_string_number / argument_reporter_boolean | 実行 | 実行 | **supported** |
| say/think、glide、ifonedgebounce、looks effects、sensing touching/answer/timer 等 | 無し | — | **unsupported**（DSL metadata 未定義。本作品では使用しない） |

注意: scratch-parser が SB3 を受理しても、Scratch / TurboWarp 上での表示・
実行・再保存を保証しない（`docs/main_design/POST_PHASE6_STATUS.md` 参照）。
実エディタでの確認は §6 の記録で別途行う。

## 5. モード別チェックリスト

各モードはキー入力 → step 進行（space）で確認する。`actual` / `note` を見て
判定する。`actual='—'` かつ `note=manual-only` のステップは HTMLJS では判定
せず、Scratch / TurboWarp で目視確認する。

### menu（key 0）
- 期待: 操作一覧が action/note に表示される。`actual=menu ready`。

### motion（key 1）
- step1: go to x:0 y:0 → `actual=x=0 y=0`（supported）
- step2: move 50 steps → `actual=x=50`（端では fencing でクランプ）
- step3: change y by 40 → `actual=y=40`
- step4: rotation style all around / turn right 45 / point in direction 135 →
  `actual=dir=135`（supported）。スプライトの回転も目視。

### looks（key 2）— HTMLJS でも反映（supported）
- step1: switch costume B → next costume（A↔B の切替を stage で目視）
- step2: set size 150 → change size -25 → **size が大きくなり 125 になる**を目視
- step3: show / go to front / go backward 1 layer（重なり順・表示を目視）
- 注: size / costume 番号を読む reporter は metadata 未定義のため、値は
  monitor ではなく stage 上で目視する。

### events-control（key 3）
- step1: broadcast "ping"（and wait）→ `actual=1`（receiver が +1）
- step2: repeat 4 add to evLog → `actual=4`
- step3: if/else (evCounter>0) → `note` が THEN/ELSE 分岐を表示
- step4: wait 0.5s → `actual` が waiting... → waited に変化

### variables-lists（key 4）
- step1: set demoVar=7 → `actual=7`
- step2: change demoVar by 3 → `actual=10`
- step3: delete all; add a,b,c; insert z@1; delete @4 → `actual=len=3`
  （list = z,a,b）
- step4: replace item2="A"; item2 → `actual=item2=A`

### sensing-operators（key 5）
- live: マウス移動・クリック・`space` 長押しで `actual` が
  `mouse x,y down=.. space=..` と更新される（supported）。
- step1〜4（space で切替）: `note` に operator 計算結果を表示
  （add / 四則 / boolean / 文字列）。`expected` と一致するか確認。

### pen（key 6）
- step1: clear → 左へ移動 → pen down → 赤 → size4 → move120 → 赤線を目視
- step2: stamp → pen size +4 → move60 → スタンプ＋太線を目視
- step3: pen up → move60 → 新しい線が引かれないことを目視

### sound（key 7）— 要ユーザー操作（緑の旗クリック後）
- step1: play "Cursor Move 6" until done（効果音を聴く）
- step2: set volume 60 → play（音量低下、`actual=volume=60`）
- step3: play "TV Time"（長尺。再生開始のみ確認）
- step4: stop all sounds（停止を確認）

### clone-procedure（key 8）
- step1: create clone of myself → `actual=clones=1`（clone が y=80 に出現）
- step2: call custom block `record [hello]` →
  `actual=procLog len=1 last=hello`
- step3: repeat 3 create clone → clone が横に並ぶ（`actual=clones=N`）
  - 注: refresh broadcast は**既存クローンにも届く**ため、step1 で出来た
    クローンも step3 を実行し clone がカスケードする。step1→space→space と
    進めると Scratch / HTMLJS とも **7 個**になる（クローンが broadcast ハットを
    各自実行する Scratch v14.1.0 挙動。`docs/TURBOWARP_DIFF_AUDIT.md` §11 参照）。

### full-feature-smoke（key 9）
- 1 回で 変数 + events + clone + pen + sound（supported subset）をまとめて実行。
- `actual=ev=1 demoVar=2`、`note=looks / turn-point-direction excluded`。
- pen 線（水色）・効果音・clone を目視/聴取。
- 既存クローンがある状態（例: 先に key 8 を実行）で key 9 を押すと、
  smokeSprite broadcast が**各クローンにも届き**、クローン数ぶん効果音が
  重なって大きくなる（Scratch v14.1.0 と同じ。`docs/TURBOWARP_DIFF_AUDIT.md`
  §11/§12 参照）。フレッシュ状態（クローン 0 個）では 1 回のみ。

## 6. 実エディタ確認の記録

`docs/main_design/SB3_REAL_EDITOR_VERIFICATION_SPEC.md` の手順に従い、
Scratch 公式エディタと TurboWarp で次を確認して記録する。テンプレートは
`docs/templates/REAL_EDITOR_VERIFICATION_TEMPLATE.md` を複製して使う。

```text
fixture: manual-verification (ultra-test)
source commit:
sb3 sha256:
environment (browser / OS):
editor: Scratch official | TurboWarp
verification date:
load: pass/fail
structure (targets/costumes/sounds/blocks/monitors): pass/fail
execution (keys 0-9 / space / r / mouse, 各モード): pass/fail
manual-only items (looks, turn/point/direction): pass/fail（目視）
resave/reload: pass/fail
differences:
evidence (screenshots):
```

確認の要点:
- 6 つの変数 monitor が表示される（Scratch ではリスト monitor も表示可能）。
- キー 0〜9 / space / r でモード遷移・ステップ進行する。
- looks（costume 切替・サイズ・レイヤ）と motion の turn/point/direction が
  HTMLJS / 実エディタの両方で同じく動く。
- pen 描画・clone・custom procedure・sound が期待どおり。
- editor から再保存 → 再読込で主要情報（block / monitor / costume / sound /
  broadcast / 変数・list）が失われない。

## 7. 既知の制約

- HTMLJS の Canvas overlay は変数 monitor のみ描画（list monitor 非対応）。
- looks の size / costume 番号を読む reporter は metadata 未定義のため、値は
  monitor 表示できず stage 上で目視する。size の costume 相対クランプ
  （極端値の制限）は未実装（通常値は Scratch と一致）。
- sound はブラウザのユーザー操作後に発音。"TV Time" は長尺のため preview では
  再生開始のみ確認する。
- costume の rotationCenter は近似値（小さな表示位置ずれが出ることがある）。
- レンダラは devicePixelRatio 対応。main canvas のバックストアは 480×360×DPR で
  描画系を DPR スケールするため、**sprite / クローン / monitor は device 解像度で
  鮮明**。一方 **pen レイヤと stamp は固定 480×360 のまま nearest 合成**するので、
  Scratch の pen 同様に低解像度（粗い）見た目になる。座標系は 480×360 論理のまま。
- scratch-parser 合格は形式検証であり、実エディタでの動作保証ではない。
