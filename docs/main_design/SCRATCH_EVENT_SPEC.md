# Event / Broadcast / Clone仕様

## hats

| hat opcode | 起動条件 | 優先度 |
|---|---|---|
| `event_whenflagclicked` | green flag | P0 |
| `event_whenkeypressed` | 指定keyの押下 | P0 |
| `event_whenthisspriteclicked` | drawable hit後のclick | P1 |
| `event_whenstageclicked` | Stage click | P1 |
| `event_whenbackdropswitchesto` | backdrop変更後 | P1 |
| `event_whengreaterthan` | loudness/timerが閾値を上回るedge | P2 |
| `event_whenbroadcastreceived` | message ID/name一致 | P0 |
| `control_start_as_clone` | clone初期化後 | P1 |

公式 `Runtime.startHats(opcode, matchFields, target)` と同様に、hat検索とthread生成をRuntimeへ集約する。

## Broadcast

- `event_broadcast`: messageを解決し、一致する全original/clone targetのhatsを起動して直ちに継続。
- `event_broadcastandwait`: 起動したthread群をframeへ記録し、全てDONEになるまで送信元threadをyield。
- messageは可能ならIDで一致し、nameは入力・互換読込時の補助とする。
- broadcast受信hatは`restartExistingThreads=true`であり、同一target/top blockが実行中なら並列追加せず再初期化する。
- `broadcast and wait`は起動したThreadオブジェクトがruntimeから除去されるまで待つ。

## Key / mouse

InputManagerはDOM eventをScratch key名とStage座標へ正規化する。CSS拡大率を逆変換し、xは中央基準、yは上向きを正とする。tick途中のDOM状態を直接参照せずsnapshotを使う。

## Clone lifecycle

1. clone sourceを解決。
2. `Runtime.MAX_CLONES = 300`相当のglobal上限を確認。
3. original targetの実行状態をcloneし、drawableを作成。
4. target collectionへ登録。
5. `control_start_as_clone` hatsをclone限定で起動。
6. delete時にclone threads、drawable、音声を破棄してcounterを減らす。

Stageはclone不可。clone個体は保存対象外である。
