# 匠作模式（detail）集成 QA · 问题清单

审计对象：`prototype/index.html`（主 IIFE）、`prototype/copy.js`、`prototype/copy-detail.js`、
`prototype/joints.js`、`prototype/stairs.js`，对照 `specs/copy-detail.md / copy.md / joints.md / stairs.md / audio.md / perf-audit.md`。

**审计快照**：`prototype/index.html` 81,927 B，sha1 `848740601f98`，mtime 2026-10-22 15:02:43。
审计期间 `index.html` 正被另一会话并发修改（本轮新增 `#jointBtn`、`GALLERY_CATS` 里的 `bridgehead/interior`）。
审计结束后同一文件又落了一次 +76 B 的改动（sha1 `0155fdd473de`，82,003 B）：已复核**本文所有结论在该版本上仍然成立**，
只是行号普遍 +2（例：`buildDetailSteps()` 661→663、`revealCat()` 1396→1398、`focusJoint()` 1730→1732、`?detail` 分支 2043→2045）。
**下文行号统一指审计快照；若相差 1–3 行，用文中给出的符号名（函数名 / 选择器）搜索定位。** 本文件只做审读，未改动任何既有文件。

已做的实测：本地 `python -m http.server` + 浏览器面板（390×844）打开 `?autodetail=1`，
结果为 HUD `23 / 23 · 合龙`（即直接建完的静态视图），无控制台异常。这条实测直接证实了 **P0-2**。

---

## 0. 结论速览

| 级别 | 数量 | 内容 |
|---|---|---|
| P0 | 2 | 11–13 步文案与动作错位；`?autodetail=1` 完全跑不起来（被 `?detail` 的子串判断 + `buildStatic()` 吃掉） |
| P1 | 5 | 镜像屋面被 `revealCat` 抹掉；节点重复生成 + 只有单侧榫头 + 不参与结构视图过滤；近景机位 5.2 m / 阴影 3.3 cm/texel；特写落在错误的步；横串几何画了两遍 |
| P2 | 6 | 收尾步无新增内容；`bridgehead/interior` 空分类；23 个刻度被压缩 + HUD 变高；语音索引与 IO；结尾卡片/测验文案；detail 的建库卡顿与阴影刷新 |
| P3 | 6 | `buildSteps` 不重置状态；回车入卯缺守卫；节点提示 toast 压住 HUD；压载后桥体永久 -0.02；缺 copy-detail 时回退到错误文案；新增的 `节点` 按钮把移动端品牌挤成三行 |

**链路完整性**：23 步全部有 `beginStep → (拖拽|CTA) → 步进` 的出口；`runAction()` 对现有 14 个 action id 全部有分支；
未发现未捕获异常或缺失模块导致的崩溃（`BridgeEnv / BridgeJoints / BridgeStairs / BridgeAudio` 都有 `if` 或 `try` 包裹）。

---

## 1. 步骤索引核对（23 步）

`buildDetailSteps()`（661–675）= `buildSimpleSteps()`（631–658）先 `pop()` 掉「起廊屋」，
再依次 push：ties / deck / posts / columns / beams / purlins / rafters / roof / pavilion / finishAll。

| idx | `steps[]`（真实动作） | `runAction` 处理 | `copy-detail.steps[]`（文案） | 一致 |
|---|---|---|---|---|
| 0–1 | beam 牛头（block） | —（拖拽） | 立牛头 · 左/右 | ✓ |
| 2–4 | beam san 0/1/2 | — | 三节苗 · 左/中/右 | ✓ |
| 5–9 | beam wu 0–4 | — | 五节苗 · 一…五 | ✓ |
| 10 | action `braces` | `doBraces()` | 打剪刀苗 | ✓ |
| **11** | action **`props`（拆架）** | `doRemoveProps()` | **打横串** | **✗** |
| **12** | action **`load`（压载）** | `doLoad()` | **拆架** | **✗** |
| **13** | action **`ties`（打横串）** | `doTies()` | **压载** | **✗** |
| 14 | `deck` | `doDeck()` | 铺桥面 | ✓ |
| 15 | `posts` | `doPosts()` | 立将军柱 | ✓ |
| 16 | `columns` | `doColumns()` | 立柱 | ✓ |
| 17 | `beams` | `doBeams()` | 上梁 | ✓ |
| 18 | `purlins` | `doPurlins()` | 架檩 | ✓ |
| 19 | `rafters` | `doRafters()` | 铺椽 | ✓ |
| 20 | `roof` | `doRoof()` | 盖瓦 | ✓ |
| 21 | `pavilion` | `doPavilion()` | 起楼阁 | ✓ |
| 22 | `finishAll` | `doFinishAll()` | 收尾 | ✓ |

`runAction()`（1059–1077）覆盖 `braces / props / load / gallery / ties / deck / posts / columns / beams / purlins / rafters / roof / pavilion / finishAll`，
**没有遗漏的 id**。但它是 14 条并列 `if` 且**没有兜底**：将来加一个 id（比如 `bridgehead`）而忘了分支时，
`hideCTA()` 已经执行、`state.busy` 保持 false，于是没有任何后续动作、CTA 也不再出现 → 软锁死。见 P2-6 的改法。

---

## 2. P0

### P0-1 idx 11–13：标题是「拆架 / 压载 / 横串」，正文、知识点、节点提示、语音全是相邻一步的

**现象**（detail 模式 idx 11 起）：`#stepName` 显示「拆架」，`#hint` 却是「横串把几排苗串成一片…」，
`#know` 讲横串，CTA 按钮写「拆掉支架」，语音念「打横串…」。idx 12 标题「压载」、正文讲拆架；
idx 13 标题「打横串」、正文讲压载。（HUD 上是 12/23、13/23、14/23。）

**证据**
- `index.html` 631–658：`buildSimpleSteps()` 的顺序是 `braces(10) → props(11) → load(12) → gallery(13)`。
- `index.html` 663–664：`arr.pop()` 只去掉 gallery，然后把 `ties` 追加在最后（=13），于是 `props` 仍在 11、`load` 仍在 12。
- `copy-detail.js` 98–118 与 `specs/copy-detail.md` 43–54 的索引表：**11 打横串、12 拆架、13 压载**（`copy-detail.js` 顶部注释 4–6 行也是这个顺序）。
- 错位后的消费点：hint 1666、know 1668、节点 toast 1010+1753、语音 816。

**修法**（`index.html` 661–675，把 ties 插到拆架之前，其余不动）

```js
function buildDetailSteps(){
  const arr = buildSimpleSteps();
  arr.pop();                                     // 去掉「起廊屋」
  arr.splice(11, 0, {kind:'action', id:'ties', label:'打横串',
    hint:'横串把两套苗横向串住，节点不再左右错动。', cta:'打横串'});   // ← 新增，插在 props 前
  arr.push({kind:'action', id:'deck', label:'铺桥面', /* …原样… */});
  // …其余 8 步原样…
  return arr;
}
```

改完的索引：10 剪刀苗 / 11 横串 / 12 拆架 / 13 压载 / 14 铺桥面 … 22 收尾，与 `copy-detail.js` **和** `VOICE_STEPS.detail` 同时对齐（不再需要改文案）。
注意：`arr.splice` 后不要再保留原来那条 `arr.push({…id:'ties'…})`，否则 24 步。

### P0-2 `?autodetail=1` 一步都不演：先被 `?detail` 吃掉，再由 `buildStatic()` 把 `started` 置真

**现象**：打开 `?autodetail=1`，3 秒后直接看到建完的桥 + HUD `23 / 23 合龙`，没有开场、没有运镜、没有结尾卡片。
`setInterval` 因为 `#end` 永远带 `hide` 而永不清除（每 700 ms 空转一次，直到关页）。

**证据**（`index.html`）
- 2043：`if(location.search.indexOf('detail') >= 0)` —— `"?autodetail=1".indexOf('detail') === 2`，命中。
- 2044–2045：`buildSteps('detail'); buildStatic();`
- 2023：`buildStatic()` 里 `state.started = true;`、2024 `state.step = steps.length;`
- 1808：`start(mode)` 第一行 `if(state.started) return;` → 2054 的 `start('detail')` 直接返回。
- 1967：`indexOf('auto')` 也会命中 `?autodetail`，提前排一个 `start('quick')`，同样被 1808 挡掉。
- 实测：390×844 下 HUD 为 `23 / 23`、`合龙`（见文首）。

**修法**（2043–2068 整段换成显式参数解析；顺带修掉 1967 的 `auto`）

```js
const QS = new URLSearchParams(location.search);
const IS_AUTODETAIL = QS.has('autodetail');

if(IS_AUTODETAIL){
  buildSteps('detail');                 // 只建文案/刻度，不要 buildStatic
}else if(QS.has('detail')){
  buildSteps('detail'); buildStatic();  // 静态成品视图（保持原用途）
}else if(QS.has('built')){
  buildStatic();
}else{
  buildPreview();
}

if(QS.has('auto') && !IS_AUTODETAIL) setTimeout(function(){ start('quick'); }, 200);

if(IS_AUTODETAIL){
  setTimeout(function(){
    start('detail');
    if(!state.started){ console.warn('[autodetail] start() refused'); return; }   // ← 防止空转
    let guard = 0;
    const tick = setInterval(function(){
      if(!document.getElementById('end').classList.contains('hide') || ++guard > 400){
        clearInterval(tick); return;
      }
      /* …原逻辑不变… */
    }, 700);
  }, 400);
}
```

---

## 3. P1

### P1-1 `revealCat()` 把镜像屋面抹平：盖瓦/起楼阁之后屋顶只剩半边

**现象**：detail 模式到 idx 20「盖瓦」，从 -z 侧看主屋顶是空的/能看进廊屋内部；正坡则出现共面闪烁
（镜像件被翻成同向后与正面完全重合）。idx 21「起楼阁」两层腰檐同样缺一半。

**证据**
- 镜像靠负缩放：`mainB.scale.z = -1`（1336）、`p1b.scale.z = -1`（1356）、`p2b.scale.z = -1`（1360）。
- `revealCat()` 1405–1408：`o.scale.setScalar(.7)` 把 z 从 -1 覆盖成 +0.7，随后三条 tween 都把 z 补到 **+1**。
  → 镜像面变成与正面同向，-z 半坡消失（并且平面前后重叠）。
- 只影响 detail（quick 的 `revealGallery()` 不做缩放），所以是匠作模式专属回归。

**修法**（1396–1416，改成保存/恢复原 scale）

```js
const s0 = o.scale.clone();
o.scale.copy(s0).multiplyScalar(.7);
tweenNum(o.scale, 'x', s0.x, .18, easeOut);
tweenNum(o.scale, 'y', s0.y, .18, easeOut);
tweenNum(o.scale, 'z', s0.z, .18, easeOut);
```

（`setScalar` 只能用于 scale 恒为 1 的 gblock；`roofSurface` 的镜像件必须走上面这条。）

### P1-2 节点层：同一内节点生成两份、每个节点只有一根榫、且不参与结构视图过滤

**现象**
1) idx 2 落三节苗左段时，`(-4.8, 6.0)` 已有第一个方套+销；idx 3 落中段时同一点又叠一个（方套朝向不同 → 斜插在一起、销重影、深度打架）。
   右岸 `(4.8, 6.0)` 只有一份，正反一对比就看得出来；五节苗同理发生在 idx 7（`(-4.3, 5.55)`）。
2) 每个内节点只有一侧有榫头，另一根苗还没到，榫头孤零零挂在半截；`specs/joints.md` §5.1 明确要求「两段都到位才装」。
3) 合龙后点「三节苗 / 五节苗 / 拱架」：苗被隐藏，但节点方套/榫头/销**仍然可见**，浮在空中
   （`applyView` 1679–1683 只认 `o.userData.system`，而 `node()/tenon()/peg()` 的 mesh 上没有该字段；
   `addJointsAt` 的圆箍有，所以对比之下更明显）。「抽一根」只隐藏 `wu seg1` 的苗，节点留在原地——
   节点同时属于相邻两根，保留本身合理，但断口那根的榫头会悬空（可接受的已知取舍，写进 spec 即可）。

**证据**
- 992–1001：每落一根就 `BridgeJoints.node(… members:[{a,b}] …)` + 额外 `BridgeJoints.tenon(…)`；
  端点取 `p = (a[1] >= b[1]) ? a : b`（较高端）。逐段推：
  - san：seg0 → (-4.8,6)；seg1 → (-4.8,6)（重复）；seg2 → (4.8,6)。3 组 / 2 节点。
  - wu：seg0 → (-9,4.9)；seg1 → (-4.3,5.55)；seg2 → (-4.3,5.55)（重复）；seg3 → (4.3,5.55)；seg4 → (9,4.9)。5 组 / 4 节点。
  → 8 组 / 6 节点，**2 个节点重复**：`(-4.8, 6.0)`（三节苗）与 `(-4.3, 5.55)`（五节苗）。
  注意重复只发生在**左岸**这两点，右岸对称点只有一份 → 「左右长得不一样」是最好认的症状。
  `node()` 单 member 时只出 10 个 mesh（`joints.md` 标注 12 = 双 member）。
- `makeArch()` 2001–2009 在 `r===3` 的循环里做同一件事，`?detail` 静态视图里同样有 2 个重复节点。
- 视图过滤：1679–1683 只认 `o.isMesh && o.userData.system`，而 `node()/tenon()/peg()` 的 mesh 上没有该字段
  （`bridge.add(nodeGroup)` 的那个 Group 才有）；`addJointsAt` 的圆箍有（`joint()` 里写了 `userData.system`），所以对比之下更明显。

**修法**（按 `joints.md` §5.1 的状态机；`index.html` 顶部加两个表）

```js
const placedSegs = {};   // 'san:0' → true
const detailedNode = {}; // 'san:1' → true

function addNodeDetails(system, seg){
  if(!window.BridgeJoints) return;
  placedSegs[system + ':' + seg] = true;
  const list = window.BridgeJoints.nodeList(system);
  for(let i = 1; i < segmentCount(system); i++){
    const key = system + ':' + i;
    if(detailedNode[key]) continue;
    if(!placedSegs[system + ':' + (i-1)] || !placedSegs[key]) continue;  // 两段都到位
    const g = window.BridgeJoints.node(T, list[i-1], {});                // 双 member
    g.traverse(function(o){ if(o.isMesh) o.userData.system = system; }); // 参与视图过滤
    bridge.add(g);
    detailedNode[key] = true;
  }
}
```

- `finishPlacement` 里把 992–1001 整块换成 `if(state.mode === 'detail') addNodeDetails(mesh.userData.system, mesh.userData.seg);`（去掉单独那条 `tenon()`）。
- `makeArch()` 里删掉 2001–2009，改在 `buildStatic()` 里一次性补：
  ```js
  ['san','wu'].forEach(function(sys){
    window.BridgeJoints.nodeList(sys).forEach(function(n){
      const g = window.BridgeJoints.node(T, n, {});
      g.traverse(function(o){ if(o.isMesh) o.userData.system = sys; });
      bridge.add(g);
    });
  });
  ```
- 注意 `colorByForce()`（1517 起）要求 `o.userData.seg !== undefined` 才上色，给节点 mesh 加 `system` 不会污染力流。

### P1-3 近景机位 5.2 m、`minDistance=3`、阴影不换档 → 榫头只有二十几像素，阴影糊成一团

**证据**（1730–1754）
- 1733：`toPos = point + (3.0, 1.5, 4.0)` → |d| = **5.22 m**。垂直 fov 37° → 画面高 = 2·5.22·tan18.5° ≈ **3.49 m**；
  方套 0.44 m 只占 12.6% 画面高；榫头断面 0.16 m ≈ 4.6%（720p 下约 33 px）。`joints.md` §6.2 要求 2–3 m。
- 1737：`controls.minDistance = 3`（spec 0.8），且没改 `maxPolarAngle`（spec 1.9，俯看牛头卯口用），也没收窄阴影相机（spec §6.4）。
- 当前阴影：68 m / 2048 texel ≈ **3.3 cm/texel**（356–367 或 468–478），0.12 m 的榫头只有 3.6 texel。

**修法**

```js
// 顶部：env 分支里一起记住太阳
let shadowLight = key;
// if(env.sun){ … shadowLight = env.sun; }

function focusJoint(point, note){
  const fromPos = camera.position.clone(), fromTarget = controls.target.clone();
  const toPos = point.clone().add(new T.Vector3(1.2, 0.8, 1.6));   // 2.15 m
  cameraFocus = true; controls.enabled = false;
  const minD = controls.minDistance, polar = controls.maxPolarAngle;
  controls.minDistance = 0.9; controls.maxPolarAngle = 1.9;
  const sh = shadowLight.shadow.camera;
  const old = {l:sh.left, r:sh.right, t:sh.top, b:sh.bottom};
  sh.left = -3; sh.right = 3; sh.top = 3; sh.bottom = -3; sh.updateProjectionMatrix();
  updateShadows();
  // …tween 不变…
  // done() 里恢复：minDistance = minD; maxPolarAngle = polar;
  //   sh.left = old.l; … sh.updateProjectionMatrix(); updateShadows();
}
```

（`key` 在 env 存在时会被 `scene.remove(key)`（467），所以必须用 `shadowLight` 而不是继续写 `key`。）

### P1-4 特写落在错误的步：8 根苗每根都推镜，spec 指定的 10/11/13/15 反而没有

**证据**
- 唯一触发点：`finishPlacement()` 1006–1012，条件是 `!mesh.userData.block && state.mode==='detail' && state.jointFocus`
  → 只可能发生在 idx 2–9 的 8 个梁步（其中 2、4、5、6、8、9 是 spec 要求保持固定机位的）。
- `state.jointFocus` 在 `buildSteps()` 682 默认 `detail → true`，所以 detail 一进场就是「每根都推」。
- 10 剪刀苗 / 11 横串 / 13 压载 / 15 将军柱 都是 CTA 步（不走 `finishPlacement`）→ 一次特写都没有。
- `copy-detail.js` 248 的 `viewNotes.joint` 在 `index.html` 里**没有任何消费者**（1708 只按 `viewNotes[mode]` 取 all/arch/san/wu，1714 side，1788 force，1770 break）。

**修法**
- 把 1006 的条件改成显式白名单（对齐 `copy-detail.md` §4）：
  ```js
  const FOCUS_STEPS = [0, 1, 3, 7];   // 梁步里的特写（10/11/13/15 在对应 do* 里单独调）
  if(!mesh.userData.block && state.mode === 'detail' && state.jointFocus &&
     FOCUS_STEPS.indexOf(state.step) >= 0){ … }
  ```
- 在 `doBraces()` 末尾（约 1122）对 `(-6.0, 5.25, 0)` / `(6.0, 5.25, 0)`、`doTies()` 里对 `(±6.08, 5.30, 0)`、`doLoad()` 的落位回调里、`doPosts()` 的将军柱位置各调一次 `focusJoint`（同样受 `state.jointFocus` 控制）。
- 若保留 header 的 `#jointBtn`，把它做成「点一次 = 特写最近一个节点」而不是纯开关；否则改文案为「运镜 · 开/关」。

### P1-5 打横串画了两遍：旧暗块 + `crossing()` 同时存在

**现象**：detail 模式 idx 13（修好 P0-1 后是 idx 11）打横串后，`x=±6.08` 处有两个方套、两根 5 m 横串叠在一起。

**证据**：`buildTies()` 1095–1106 先 `block(x,5.30,0,.55,.55,.78)` + `block(x,5.18,0,.2,.2,5.0)`，
再在 1099–1104 追加 `BridgeJoints.crossing(T, x, 5.30, 0, {})`——而 `crossing()` 自带横串（默认 5.0）与木销。
`specs/joints.md` §5.2 写的是「整段替换」。

**修法**

```js
function buildTies(){
  [-6.08, 6.08].forEach(function(x){
    if(window.BridgeJoints && state.mode === 'detail'){
      const c = window.BridgeJoints.crossing(T, x, 5.30, 0, {tieLength: 2.6}); // 近景不被 5 m 横串挡镜头
      if(c) bridge.add(c);
      return;
    }
    bridge.add(block(x, 5.30, 0, .55, .55, .78, MAT_JOINT.clone()));
    bridge.add(block(x, 5.18, 0, .2, .2, 5.0, MAT_HEAD.clone()));
  });
}
```

（quick 模式保持旧的两块，不受影响；`buildStatic()` 2033 也走同一函数。）

---

## 4. P2

### P2-1 「收尾」什么都不发生：栏杆/长凳在 idx 17、台阶在 idx 14 就已经出场

**证据**：`doBeams()` 1461–1468 先 `revealCat('beams')` 再 `revealCat('rails')`；`doDeck()` 1455 先 `revealCat('stairs')`。
到 22 步时 `doFinishAll()` 1473–1482 只是把已经可见的分组再设一遍 `visible=true`，唯一可见变化是 toast。
与本步 hint（673「栏杆、长凳、台阶」）和 toast（1480）都不符。

**修法**：把 `rails` 从 `doBeams` 移到收尾，让最后一步真的有东西落下：

```js
function doBeams(){ doCat('beams', {delay:40}); }        // 只上梁
function doFinishAll(){
  state.busy = true; hideCTA();
  if(!gallery) buildGallery(false, true);
  revealCat('rails', 45, function(){                      // 栏杆 + 长凳
    setGalleryOpaque();
    showToast('栏杆、长凳、台阶都就位了。人可以从两岸走上来。');
    state.busy = false; state.step++; finish();
  });
}
```

（stairs 仍在铺桥面时出现，符合「先有梯才能上桥」；若要严格对齐文案，把台阶拆到 `finishAll` 也可以，但要同步 `copy-detail` idx 22 的 knowledge。）

### P2-2 `bridgehead` / `interior` 两个分类是空壳：没有模块、没有步骤、没有淡入

**证据**
- 1214：`GALLERY_CATS = […,'pav','bridgehead','interior']`；1222–1235 也为它们建了材质。
- 1271–1285：分别由 `window.BridgeHead` / `window.BridgeInterior` 填充。
- 但 283–290 的 `<script>` 列表里没有 `head.js` / `interior.js`，`prototype/` 下也没有这两个文件 → 两个 Group 永远为空。
- 如果将来补上模块：quick 的 `revealGallery()` 1379–1391 只对 10 个具名材质做 opacity tween，
  `bridgehead/interior` 会等到 `setGalleryOpaque()`（1900 ms）**从 0 直接跳到 1**；detail 没有任何 `revealCat` 调它们 → 只在收尾瞬间出现。

**修法**：二选一——
(a) 暂时从 `GALLERY_CATS` 与 `base` 删掉这两项，等模块到位再加；
(b) 保留并补齐：加 `<script src="head.js">`、`<script src="interior.js">`，在 `buildDetailSteps()` 里加对应 action（`id:'bridgehead'/'interior'`）+ `runAction` 分支 + `revealCat('bridgehead'|'interior')`，并在 `revealGallery()` 里补两条 opacity tween。

### P2-3 HUD：23 个刻度被压到 9.6 px；detail 的 `.know` 恒为 3 行，HUD 明显变高

**证据**
- `.ticks i { width:14px }` + `.ticks{display:flex;gap:4px}`（54–57），`#hud` 内容宽 = 340 − 32 = **308 px**。
- detail：23×14 + 22×4 = **410 px** > 308 → flex-shrink 把每格压到 (308−88)/23 ≈ **9.57 px**（移动端 292 宽时 ≈ 8.9 px）。
  实测 390×844 截图里刻度已变成一条细虚线。quick（14 格 = 248 px）不受影响。
- `.know` 文本 = `'为什么 · ' + knowledge + ' ｜ 节点 · ' + joint`；用 node 实测 23 步全部是 **54–72 字**（最长 72，idx 15 立将军柱），
  11.5 px/308 px ≈ 26.8 字/行 → **恒 3 行**（+8 px margin），比 quick 的 2 行高约 20 px。
  横屏手机（如 667×375）上 HUD 约占 58% 视高并遮住桥身中段。

**修法**

```css
.ticks i{ flex:1 1 0; width:auto; min-width:2px; }        /* 23 格均分，不再压缩 */
@media (max-height:480px){ .know{ display:none; } }        /* 横屏先保 hint */
@media (max-width:760px){ #hud{ max-height:calc(100vh - 120px); overflow:auto; } }
```

若不想隐藏 `.know`，就把 joint 单独放一行并 `-webkit-line-clamp:2`。

### P2-4 语音索引与 copy-detail 的建议不一致，且 360 ms 回调读的是「未来的」`state.step`

**证据**
- `VOICE_STEPS.detail = [0,1,3,7,10,11,13,15,19,21]`（1639）。`specs/copy-detail.md` §6 建议
  `0 牛头、2 三节苗起手、5 五节苗起手、10 剪刀苗、12 拆架、13 压载、15 将军柱、14 铺桥面、22 收尾`。
  现在 2、5 不念（两根「起手」恰恰是最需要解说的），19/21 反而念。
- 811–818：`spokenSteps[idx] = true` 用的是排程时的 index，但回调里 815 读的是**触发时**的 `state.step`。
  当前靠 480/2400 ms 的换步延迟兜住，属于「碰巧不出错」；一旦有人把换步延后改短，就会念下一步的台词。

**修法**

```js
// 我建议的 detail 列表（修好 P0-1 后索引即 copy-detail 索引）
const VOICE_STEPS = {
  quick:  [2,5,10,11,12,13],
  detail: [0,2,5,10,11,12,13,14,15,22]
};
// 回调里捕获 idx
const idx = state.step;
setTimeout(function(){
  const line = COPY.steps[idx];
  if(line && line.voice) AUDIO.say(line.voice);
}, 360);
```

### P2-5 结尾卡片与测验按钮还是 quick 的文案：detail 有 5 题，按钮写「三题小测验」

**证据**
- 266：`<button id="quizBtn" class="ghost">三题小测验</button>`；272 初始 `1 / 3`（会被 `renderQuiz` 覆盖，无害）。
- `COPY.quiz.length` 在 detail 是 5（`copy-detail.js` 197–238），`renderQuiz()` 1894 会显示 `1 / 5`，但卡片按钮仍写「三题」。
- 结尾卡片正文硬编码（255–257「8 根短木…桥面压上去」），detail 的 `COPY.end`（253 行 copy-detail）只在 `finish()` 1798 被朗读，没进 DOM。

**修法**（`buildSteps()` 682 之后）

```js
const qb = document.getElementById('quizBtn');
if(qb) qb.textContent = (state.mode === 'detail' && COPY && COPY.quiz) ? '五题小测验' : '三题小测验';
const endP = document.querySelector('#end .card p');
if(endP && state.mode === 'detail') endP.textContent = '三节苗管跨度，五节苗别住它，剪刀苗管前后，横串把几排串成一片，将军柱把廊屋锁在拱架上。';
```

（`specs/copy-detail.md` §5 也是这个建议：把按钮统一成「知识小测验」最省事。）

### P2-6 detail 的首次建库落在点击回调里，一次创建 ≈360 个 mesh；动态降质永远测不到这一段

**证据**
- `doDeck()` 1451–1457：`buildGallery(false, true)` 在「铺桥面」的点击里同步执行。
- 自建数量：deck 17 + support 18 + columns 30 + beams 17 + rails 6 + purlins 32 + rafters 30 + roof 5 + pav 26 = **181**；
  楼梯模块默认两侧带栏杆 **176**（`specs/stairs.md` §5）+ 岸台/缓坡 4 = **180** → 合计 ≈ **361** 个 mesh，全部 cast+receive shadow。
- 之后 1.2–1.4 s 内 `revealCat` 排了约 30×3 + 32×3 + 17×3 条 scale tween；`animate()` 2091 在 `tweens.length` 时每帧 `needsUpdate=true`，
  即每帧一次约 600+ caster 的 shadow pass（quick 阶段约 430）。
- `autoQuality()` 2072–2081 只在启动后 2.5 s 采样一次（那时是 49 根预览拱 + 地景），`perfDone=true` 之后永不重测 → **真正最重的一帧不会被降质**。

**修法**
- 在「压载」的 1700 ms 等待里预建：`if(!gallery) buildGallery(false, true); gallery.visible = false;`（`buildGallery` 首行有 `if(gallery) return`，不会重复建），铺桥面时只做 `revealCat`。
- `autoQuality()` 加一个「detail 首次 reveal 后」的重采样窗口（例如 `doDeck` 末尾重置 `perfFrames/perfTime/perfDone=false`）。
- 移动端可给楼梯降档：`BridgeStairs.build(T, {railing:false})`（176 → 130）。

---

## 5. P3 / 观察

### P3-1 `buildSteps()` 只换文案不重置世界：现在靠 `start()` 的 `started` 闸门兜住，加「模式切换」时会立刻出问题

`buildSteps()`（677–689）只改 `state.mode / COPY / spokenSteps / steps / jointFocus / ticks`；
`state.step`、`placed`、`braces`、`gallery`、`props.visible`、`loadBlock`、`force`、`isBroken` 都不动。
1808 的 `if(state.started) return` + `.veil.hide{pointer-events:none}`（133）让运行中切模式**在当前 UI 下不可达**（这点是好的），
所以「切模式 / 开测验时正在特写」这两个场景目前都无法发生。但：
- `buildStatic()` 2023 直接把 `state.started` 置真（没走 `start()`）——P0-2 就是踩在这里。
- 将来若在 header 加模式切换，必须补一个完整 `reset()`（清 `tweens`、`bridge` 子节点、`placed`、`state`），`buildSteps` 不够。

**修法**：`buildStatic()` 里用 `state.static = true`，不要动 `started`；`start()` 只在真正开跑时置 `started`。

### P3-2 回车入卯：没有 `e.repeat`、没有测验遮罩判断、也不 `initAudio()`

1855–1860 与 autoBtn 1839–1844 的守卫一致（`active/busy/dragging`），但：
- 长按回车会重复触发（当前被 `busy` 挡住，属侥幸）；
- 测验打开时 `Enter` 会同时走 1953 的 `quizNext` 与 1855 的入卯（当前 `state.active` 为 null 才没出事）；
- `showCTA()` 1054 会 `initAudio()`，回车路径没有 → 全程只用回车时，第一次落位的音效可能因未 `unlock()` 而静音。

**修法**：抽 `function placeNow(){ initAudio(); …placeActive(); }`，三个入口（CTA / autoBtn / Enter）共用；Enter 处理里补
`if(e.repeat) return; if(!quizEl.classList.contains('hide')) return;`。

### P3-3 节点提示 toast 正好压在 HUD 上

`#toast{bottom:92px}`（105–113），`#hud{bottom:30px}`（47–51），detail 的 HUD 高约 215 px（见 P2-3）→ toast 落在 HUD 的上 1/3 内，
`z-index:9` 会盖住 `#hint` 的末行。`focusJoint` 1753 每次特写都会触发。建议把节点说明写进 HUD 的独立一行，或把 `#toast` 抬到 `bottom:calc(30px + 220px)`。

### P3-4 压载后 `bridge.position.y` 永久停在 -0.02

`doLoad()` 1496 的最后一跳是 `-0.02`，之后没有任何归零；`buildGallery()`（deck 步）把廊屋/楼梯挂进 `bridge` → 桥面顶 6.30 vs 楼梯顶 6.32、将军柱底按 `sanY(x)+.17` 算的是绝对高度。2 cm，肉眼几乎看不出，但会让楼梯与桥面差一个门槛；若在意，把 1496 改成 `0`。

### P3-5 `copy-detail.js` 缺失时的回退会显示「起廊屋」文案

`buildSteps()` 679 在 `!window.BridgeCopyDetail` 时回退到 `BridgeCopy`（14 条），但 `steps` 仍是 23 条：
- 11–13 会读到 quick 的「拆架 / 压载 / 起廊屋」→ idx 13（打横串）hint 变成「桥面压住拱。立柱、上梁、盖瓦…」；
- 14–22 无 `c`，回退到 `s.hint`，`#know` 隐藏。

**修法**：`buildSteps('detail')` 里若 `!window.BridgeCopyDetail`，`showToast('匠作文案未加载，已回退到简版提示')` 并考虑直接禁用「匠作模式」按钮（`startDetailBtn.disabled = true`）。

### P3-6 header 多了一个 `节点` 按钮后，390 px 宽时品牌被挤成三行

实测 390×844：三个 73 px 按钮 + 4 个 16 px gap + 36 px padding = **319 px**，留给品牌的只有 ~71 px，
标题折成「编梁 · 北涧 / 桥」、副标题折成「交互原型 / 编 / 木拱」。功能不坏，但版式塌了。
建议把「节点」从 header 移到 `#views`（和 全部/拱架/三节苗 同一组），或移动端只留图标。

---

## 6. 手工验收清单（按顺序做，约 15 分钟）

先起服务：`cd prototype && python -m http.server 8765`，打开 `http://127.0.0.1:8765/index.html`。
控制台里用 `__proto` 读状态：`__proto.state`、`__proto.controls.enabled`、`__proto.controls.minDistance`、`__proto.renderer.info.render.calls`。

1. **`?autodetail=1`（P0-2 回归）**：应在 1 s 内出现「立牛头 · 左岸」、`01 / 23`，然后自动一路跑到结尾卡片；
   现在的结果是 `23 / 23 · 合龙` + 无结尾卡片 → 失败即未修好。
2. **idx 11–13 对照（P0-1）**：点匠作模式，走到 idx 11（HUD 12/23）。标题、hint、CTA 三者必须同时是「打横串」；
   idx 12（13/23）三者同时是「拆架」；idx 13（14/23）同时是「压载」。语音念的必须与标题一致。
3. **杆件特写（P1-3/P1-4）**：第 1 根落位后按回车，镜头应在 ~0.6 s 推近、~1.1 s 后回位；
   推近时方套应占画面高度 ≥20%（现在约 12%），榫头阴影有边缘（现在是一团）。
   回位后立刻 `__proto.controls.enabled === true`、`minDistance === 22`；下一根的可拖 ghost 在 ~2.4 s 出现，且能拖动视角。
   第 3 根落位（idx 3 三节苗中）与第 6 根落位（idx 5 五节苗一）应**不**推镜。
4. **节点重复（P1-2）**：idx 2 落位后 `(-4.8, 6.0)` 应只有一个方套+销；idx 3 落位后该点不应出现第二套（右岸对称点本来就只有一个）。
   合龙后点「三节苗」视角 → 五节苗的方套/榫头/销必须一起隐藏；点「抽一根」→ 只消失 wu 中间那根苗，节点不应整组消失。
5. **屋顶镜像（P1-1）**：idx 20「盖瓦」后绕到桥背面，-z 半坡必须存在；idx 21 两层腰檐同样要前后对称。
6. **横串（P1-5）**：打横串后 `x=±6.08` 只应有一套「两块半榫 + 一根横串 + 一根销」，不应看到两个方套叠着。
7. **收尾（P2-1）**：idx 22 点「收尾」，栏杆/长凳应有逐件落下的动画（现在只有 toast）。
8. **语音（P2-4）**：开语音，从 idx 0 走到 idx 5，应能听到「三节苗起手」「五节苗起手」两条；11/12/13 三条必须对得上标题。
9. **测验（P2-5）**：结尾卡片按钮应写「五题小测验」；答完 5 题显示「答对 N / 5」；键盘 1–4、Enter 可用。
10. **HUD（P2-3）**：detail 的刻度应等分铺满且每格 ≥14 px 的观感（不再是一条细虚线）；
    390×844 与 667×375（横屏）下 `.know` 不应把 HUD 顶到品牌行，toast 不应盖住 hint（P3-3）。
11. **`?detail=1`（P3-1）**：静态成品视图不应出现「节点」开关（它在该视图里没有任何作用），或点它应能跳到某个节点。
12. **性能（P2-6）**：走到「铺桥面」时不应有 >100 ms 的掉帧；`__proto.renderer.info.render.calls` 在 reveal 前后各记一次，
    detail 合龙后总数应 ≈ 600 上下（若 >900，先查 P1-2 的重复节点与 P2-2 的空分类）。
13. **控制台**：全程应无 error / warning（除 P3-5 的缺模块提示）。
