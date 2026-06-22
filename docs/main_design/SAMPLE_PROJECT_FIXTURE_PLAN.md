# サンプル作品fixture計画

## 目的

AI生成、Runtime確認、SB3 export、実エディタ確認に共通利用できる小さな作品群を管理する。

## Phase 7 baseline

優先対象のうち、次の11 fixtureを
`tests/fixtures/phase7SampleProjects.ts`へ追加した。

`hello-world`, `motion-basic`, `variable-score`, `broadcast-basic`,
`list-basic`, `keyboard-control`, `procedure-basic`, `clone-basic`,
`pen-basic`, `sound-basic`, `full-feature-minimal`

素材bytesは`tests/fixtures/phase7SampleAssets.ts`が
同梱例`full-feature-minimal`の`assets/`配下から読み込む。

## 共通方針

- 1 fixtureは原則1つの主目的に限定する。
- `createMinimalProject()`を基点に必要箇所だけを追加する。
- 固定IDを使い、保存ごとに再採番しない。
- assetは作品の`assets/`から選び、MD5整合済みとする。
- validator、Runtime、SB3 exportの期待値をfixture定義と同時に決める。
- E2EはCanvas、DOM input、audioなどブラウザが必要な場合だけ追加する。

## fixture一覧

表中の「必須」は将来のfixture実装時に必要、「不要」は主目的上不要、「候補」は費用対効果を見て追加する。

| fixture | 目的 | 主なopcode | asset | validator | Runtime | Renderer/E2E | SB3 export | 実エディタ |
|---|---|---|---|---|---|---|---|---|
| hello-world | 最小作品と可視データ更新 | `event_whenflagclicked`, `data_setvariableto`, `data_showvariable` | 不要 | 必須 | 必須 | 不要 | 必須 | 必須 |
| motion-basic | 座標移動 | `motion_movesteps`（`motion_gotoxy`はSB3形状確認のみ） | costume | 必須 | 必須 | 必須 | 必須 | 必須 |
| looks-costume-switch | costume切替 | `looks_switchcostumeto`, `looks_nextcostume` | 2 costumes | 必須 | 必須 | 必須 | 必須 | 必須 |
| keyboard-control | key入力移動 | `event_whenkeypressed`, motion | costume | 必須 | 必須 | 必須 | 必須 | 候補 |
| mouse-click | mouse down検出 | `control_forever`, `control_if`, `sensing_mousedown`, data/motion | costume | 必須 | 必須 | 必須 | 必須 | 候補 |
| variable-score | global/local variable | `data_setvariableto`, `data_changevariableby`, `data_variable` | 不要 | 必須 | 必須 | 不要 | 必須 | 必須 |
| list-basic | list更新と参照 | `data_addtolist`, `data_itemoflist`, `data_lengthoflist` | 不要 | 必須 | 必須 | 不要 | 必須 | 候補 |
| broadcast-basic | 非同期broadcast | `event_broadcast`, `event_whenbroadcastreceived` | 不要 | 必須 | 必須 | 不要 | 必須 | 必須 |
| broadcast-and-wait | 待機意味論 | `event_broadcastandwait` | 不要 | 必須 | 必須 | 不要 | 必須 | 候補 |
| clone-basic | clone lifecycle | `control_create_clone_of`, `control_start_as_clone`, `control_delete_this_clone` | costume | 必須 | 必須 | 必須 | 必須 | 必須 |
| procedure-basic | 引数付きprocedure | `procedures_definition`, `procedures_prototype`, `procedures_call`, `argument_reporter_string_number` | 不要 | 必須 | 必須 | 不要 | 必須 | 必須 |
| procedure-warp | warpと明示wait | procedure opcodes、`control_repeat`, `control_wait` | 不要 | 必須 | 必須 | 不要 | 必須 | 必須 |
| pen-basic | 円形の点と移動線 | `pen_clear`, `pen_penDown`, `pen_penUp`, `pen_setPenSizeTo`, `motion_movesteps` | costume任意 | 必須 | 必須 | 必須 | 必須 | 必須 |
| sound-basic | load/play/stop | `sound_play`, `sound_playuntildone`, `sound_stopallsounds`, `sound_setvolumeto` | sound | 必須 | 必須 | 必須 | 必須 | 必須 |
| monitor-basic | variable/list monitor | `data_showvariable`, `data_hidevariable`, `data_showlist`, `data_hidelist` | 不要 | 必須 | 必須 | 将来候補 | 必須 | 必須 |
| full-feature-minimal | 全経路のsmoke test | broadcast、data、procedure、clone、pen、sound | costume+sound | 必須 | 必須 | 必須 | 必須 | 必須 |

opcode名の最終確定は実装済みmetadataを正本とする。例えばclick hatやsay blockは現時点のmetadataにないため、この計画では`mouse-click`を`sensing_mousedown`、`hello-world`を可視variableで構成する。未登録opcodeが必要になった場合は、そのままfixtureへ追加せず計画を見直す。

## asset計画

- 現在のcostume fixtureはDetermination glyph `c0041.png`を使う。
- 現在のsound fixtureは`カーソル移動6.mp3`を使う。
- 外部素材を勝手に追加しない。
- bytes、assetId、md5extの対応表をfixture近傍へ置く。
- ライセンス不明の外部assetを採用しない。

## テスト計画

### validator

全fixtureを`validateProject()`へ渡し、error 0件を要求する。warningがあるfixtureは理由と許容期限を記録する。

### Runtime

clock、input、audio、renderer portを必要に応じてfake化し、green flag後のtarget state、variable/list、thread完了、clone数、port呼出しを検証する。

### 実VMでの目視確認

座標、costume、click、keyboard、pen、clone、audio gesture など視覚・音声の確認は、
`.sb3` を実Scratch VM（`npm run preview` / `npm run shot`）で実行して行う。
画像比較を導入する場合は許容差と環境を固定する。

### SB3 export

全fixtureでpackage、ZIP entry、scratch-parser受理を確認する。代表fixtureではproject.jsonのblock、asset、monitor、extensionsも確認する。

### 実エディタ

「必須」のfixtureをScratch公式エディタとTurboWarpの手動確認対象とする。Phase 7開始時は`hello-world`、`motion-basic`、`clone-basic`、`procedure-basic`、`pen-basic`、`sound-basic`、`full-feature-minimal`を優先する。

## 導入順

1. hello-world、motion-basic、variable-score。
2. broadcast-basic、list-basic、keyboard-control。
3. procedure-basic、clone-basic、pen-basic、sound-basic。
4. warp、monitor、full-feature-minimal。

各fixtureの完了条件は、計画されたvalidator・Runtime・SB3 testが通り、手動対象には[SB3_REAL_EDITOR_VERIFICATION_SPEC.md](./SB3_REAL_EDITOR_VERIFICATION_SPEC.md)の結果記録があることである。
