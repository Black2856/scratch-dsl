# Runtime仕様

## 公式構造から採用する責務

公式 `Runtime` はtargets、threads、sequencer、renderer、audio engine、I/O device、monitor state、extension primitivesを統括し、`startHats` と `greenFlag` を提供する。本実装も同じ境界を採用するが、初期描画はCanvas 2Dとする。

## lifecycle

| 操作 | 仕様 |
|---|---|
| load | DSL検証、asset解決、Stage先頭でtargets構築、block index構築 |
| start | clock/input/audioを開始しschedulerを起動 |
| greenFlag | 既存実行を停止・状態を整え、`event_whenflagclicked` hatsを起動 |
| tick | input snapshot取得、threads実行、monitor更新、render |
| stopAll | 全thread停止、音停止、質問/UI待機解除 |
| dispose | targets、skins、audio nodes、listenersを解放 |

## opcode実行契約

primitiveは `(args, util)` 相当で呼び出す。`util` はtarget、thread、runtime、stack frame、branch起動、yield、hat起動を提供する。reporterは値、commandは原則値なし、非同期commandはthreadを待機状態へ移す。

## 時間とスケジューリング

- 通常は60 TPS、互換モードは30 TPSを基準とする。
- 1 Runtime stepの実行budgetは公式と同じくtick間隔の75%を基準とする。
- scheduler clockは単調増加時刻を使う。
- `wait` はdeadlineをframeへ保存し、busy loopしない。
- `forever` や後方分岐は少なくともtick境界でyieldし、ブラウザを占有しない。
- warpは画面更新を挟まない実行を優先するが、無限占有防止のtime budgetを設ける。公式Sequencerにもwarp時間制限がある。
- 公式warp連続実行上限は約500 ms。実装では設定可能にする。

## エラー

- malformed block、missing input、unknown targetは `ErrorReporter` にproject/target/thread/block/opcodeを記録する。
- 単一threadの実行例外はそのthreadを停止する。runtime全体停止は破損した共有状態に限定する。
- Scratchの型変換は専用`Cast`層に集約し、JavaScriptの暗黙変換へ任せない。

## 音

`sound_play` は開始後直ちに継続、`sound_playuntildone` は`SoundPlayer.finished()`が解決するまでthread待機、`sound_stopallsounds` は全targetを停止する。

- `finished()`は次の`stop` eventで解決する。自然終了、明示停止、再トリガーによる旧再生のtake時が対象になる。
- 停止は25 ms (`DECAY_DURATION=0.025`) のfade-outを開始するが、待機Promiseはfade完了時ではなくtake時の`stop`で解決する。
- 同一sound IDはSoundBank内で1つの主SoundPlayerを再利用する。再生開始後25 ms以内の再トリガーは同じsourceを使い、旧待機だけを完了させるdebounceになる。
- 25 ms経過後の再トリガーは旧sourceをfade-out用playerへ移し、新sourceを開始する。一時的に両方が鳴る。
- 同一soundを別target/cloneが再生する場合、前targetの主再生を停止してtarget/effect所有を切り替える。
- target停止はそのtargetが最後に再生したsoundのみ、stop allはSoundBank内の全主playerを停止する。
- volumeはtarget単位0..100。pitchは再生速度 `2^(value/120)`、panは-100..100のequal-power panning。VM側がpitchを-360..360、panを-100..100へclampする。
- pitch変更は再生時間も変える。volume/effect変更は短いrampでclick noiseを抑える。

## 優先度

P0はgreen flag、motion/looks基本、wait/if/forever、keyboard/mouse、broadcast、variable/list、単純音。P1はclone、procedure、monitor、pen。高度なsensing、音声効果、extensionはP2以降。
