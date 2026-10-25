# 声音层 · BridgeAudio

`prototype/audio.js`：单个 classic script，无依赖、无外部音频、无网络。全部声音由 Web Audio 的振荡器和噪声实时合成；语音用 `speechSynthesis`。

```html
<script src="audio.js"></script>
<script src="vendor/three.min.js"></script>
<!-- 主脚本 -->
```

`index.html` 目前未接入；下面是建议接法。

## API

| 调用 | 作用 |
|---|---|
| `BridgeAudio.init()` | 惰性创建 AudioContext、总线、混响、噪声缓冲。可重复调用。 |
| `BridgeAudio.unlock()` | 在用户手势里恢复 AudioContext；若之前调用过 `musicStart()`，此时开始淡入。返回 `Promise<boolean>`。 |
| `BridgeAudio.setMusic(on)` / `musicStart()` / `musicStop()` | 音乐层（水声 + 垫 + 稀疏拨弦）。启动有 5 秒淡入，停止有 2.2 秒淡出。 |
| `BridgeAudio.setVoice(on)` | 语音开关；关闭时取消当前朗读。 |
| `BridgeAudio.setSfx(on)` | 音效开关。 |
| `BridgeAudio.setMuted(on)` | 总静音：主增益降到 0，取消朗读。不影响各通道的开关记忆。 |
| `BridgeAudio.state()` | `{music, voice, sfx, muted}`。 |
| `BridgeAudio.sfx(name, opts)` | `knock` `creak` `chime` `whoosh` `success` `error`；`opts = {gain, pitch, freq}`。未解锁/静音/关音效时返回 `false`。 |
| `BridgeAudio.say(text, opts)` | 中文朗读。先 `cancel()` 上一条；`opts = {lang, rate, pitch, volume}`。超过 80 字会被截短。 |
| `BridgeAudio.sayLine(key, opts)` | 读 `BridgeAudio.lines` 里的内置短句：`start` `head` `san` `wu` `braces` `props` `load` `gallery` `finish` `encourage` `break`。 |
| `BridgeAudio.step(index, label)` | 极轻的过渡音（约 -33 dB），只做步骤标记，不朗读。 |

`BridgeAudio.supported`：`{audio, speech}`，可用来隐藏/禁用声音按钮。内置短句可以在 `BridgeAudio.lines` 上逐条改写（例如 `BridgeAudio.lines.finish = '…'`），`sayLine()` 读的就是这个对象；也可以绕开它，直接 `say(copy.finish)`。

## 接进现有流程

| 位置 | 建议 |
|---|---|
| `start()` | 按钮点击里先 `BridgeAudio.unlock()`，再 `musicStart()`；`sayLine('start')`。开场镜头后拉可配 `sfx('whoosh', {gain:.5})`。 |
| `showCTA()` 的 `btn.onclick` | 每次点击都是手势：补一句 `BridgeAudio.unlock()`，第一次点击就能出声。 |
| 拖拽 `pointerdown` | 目前有 `knock(120,.1,.12)`，换成 `sfx('knock', {gain:.35, pitch:1.1})`。 |
| `finishPlacement()` | 现有两声 `knock` 换成 `sfx('knock', {pitch:.9+Math.random()*.2})`，55 ms 后补一声 `gain:.4`。放错弹回时不要用 `error`，最多 `sayLine('encourage')`，并节流（20 秒一次）。 |
| `beginStep()` | 只调 `step(state.step, s.label)`。不要每步朗读；在 `s.system === 'san' && s.index === 0` 时 `sayLine('san')`，五节苗同理，牛头第一步 `sayLine('head')`。 |
| `doBraces()` | 开头 `sfx('creak')`；每根落位 `sfx('knock', {gain:.4})`；0.9 秒后 `sayLine('braces')`。 |
| `doRemoveProps()` | 开头 `sfx('creak')`；380 ms 桥体微沉时 `sfx('knock', {gain:.8, pitch:.7})`；约 0.8 秒后 `sayLine('props')`。 |
| `doLoad()` | 落重时 `sfx('knock', {gain:1, pitch:.55})` + `creak()`；力流亮起后 `sayLine('load')`。 |
| `doGallery()` | 屋顶下落 `sfx('whoosh')`；铺面、立柱、盖瓦三个节点各一声轻 `knock`；结束 `sfx('success', {gain:.6})`；约 1 秒后 `sayLine('gallery')`。 |
| `finish()` | `sayLine('finish')` + `sfx('success', {gain:.5})`；音乐不要停。 |
| `breakOne()` | `sfx('error', {gain:.7})`（低而短，不刺耳）+ `sayLine('break')`；`restoreBreak()` 用 `sfx('chime', {gain:.6})`。 |
| `applyView()` / `toggleSide()` | `sfx('whoosh', {gain:.3})`；切力流可加一声很轻的 `chime`。 |
| `#soundBtn` | `BridgeAudio.setMuted(!BridgeAudio.state().muted)`，文案跟着 `state().muted` 走；点击本身也是 `unlock()` 时机。要分通道就用 `setMusic` / `setVoice` / `setSfx`。 |
| 回车入卯 | `sfx('knock')`，与鼠标落位一致。 |

## 音量

| 层 | 值 |
|---|---|
| master | `0.72`（总静音时 `0.0001`） |
| 音乐总线 | `0.50`，说话时压低到 `0.19`（`duck 0.38`），结束后 0.9 秒恢复 |
| 垫音 pad | 0.13，三个振荡器再乘 0.55/0.3/0.3；低通 620–1020 Hz |
| 拨弦 | 0.055–0.10，每 2.2–7.7 秒一次；偶尔加一个装饰音 |
| 水声 | 0.045（滤波噪声，慢速起伏） |
| 鸟鸣 | 0.011–0.019，9–26 秒随机一次 |
| 音效总线 | `0.85`；knock 峰值 0.42、creak 0.075、chime 0.10、whoosh 0.10、success 0.075×4、error 0.055、step 0.022 |
| 语音 | utterance `volume 0.92`；`rate 0.92` |

音乐只在 `unlock()` 之后淡入；语音不经过 AudioContext，`setMuted` 和 `setVoice` 会主动拦截。

## 浏览器注意

- **自动播放策略**：`init()` 可以在加载时调用，但 `unlock()` 必须发生在 click / pointerdown / keydown 里。未恢复前 `sfx()` 直接返回 `false`，音乐也不会启动。
- **默认值**：`music/voice/sfx` 都是开，但页面加载时没有任何声音，直到 `musicStart()` + `unlock()`。若按 `PLAN.md §9` 要“声音默认关”，在加载时先 `setMuted(true)`，让声音按钮负责解禁。
- **iOS / Safari**：切后台后 AudioContext 可能变成 `interrupted`；在 `visibilitychange` 或下一次 pointerdown 再调一次 `unlock()`。`resume()` 是异步的，不要假设调用后立刻出声。
- **speechSynthesis**：`getVoices()` 首次可能为空，代码监听 `voiceschanged` 并优先 `zh-CN` / `zh-Hans` / 本地语音；没有中文语音时仍以 `lang='zh-CN'` 尝试，实际音色由系统决定。`cancel()` 在部分 Chrome 上不触发 `onend`，所以有兜底计时器恢复音乐。系统可能截断长句，内置文案都控制在 30 字内。
- **后台标签页**：定时器会被节流，拨弦间隔会变得不均；环境垫音不受影响，可以接受。
- **无 Web Audio 时**：所有音频方法安全空转；若 `speechSynthesis` 可用，`say()` 仍能工作（`supported.speech` 可判断）。
- **本地文件**：`file://` 下 Web Audio 正常；个别浏览器的语音需要本地静态服务（`python -m http.server`）。
- `musicStop()` 后还有 2.4 秒的尾音清理；立即 `musicStart()` 会先清掉旧节点再建新层，不会叠音。
- 音乐是生成式的，每次运行音高、节奏都不同；混响脉冲也是运行时合成，不读任何素材。
