# 拖拽木料卡顿 · 性能审计

对象：`prototype/index.html`
快照：2026-10-22 10:07:51，58,108 B，SHA1 `1BF6627712AC80A6C7A4F5E518510EC3B64C8CED`
（审计期间该文件被另一路改过一次；下面所有行号以此快照为准，SHA1 对不上就重新核对行号。）

方法：逐行静态审计 + 按代码路径数对象 / 数像素 / 数采样（附录 A）。**没有**在浏览器里跑过——第 6 节是实测步骤，凡是估计值都标了「估」。

---

## 0. 结论（先看这三条）

1. **上一轮已经把最大的一刀切掉了**：`shadowMap.autoUpdate=false`（279）、阴影贴图 1024（301）、`powerPreference`（271）、DPR 上限 1.5（272）。我逐路径核过：`pointermove`（775-787）和 `animate`（1544-1576）里没有任何 `needsUpdate`，所以**拖拽期间现在确实是 0 次 shadow pass**。
2. 于是主因转移成两件事：
   - **每帧写 HUD `#tip` + 每次 `pointermove` 读布局**（744-749、1556-1569）。这是唯一「只在拖动时才发生」的成本，和「拖起来才卡、不拖就好」的体感完全吻合。
   - **PCFSoft 每像素 16 次深度采样 × 全屏像素**（275 + 341-348）。阴影贴图静态了，但**采样照旧每帧每像素 16 次**，这一项不会随上次改动下降。
3. 上次改动带来两个新问题，必须在同一批补丁里修掉，否则会被误当成卡顿：
   - **tween 期间阴影不刷新，动画结束整体「跳」一下**（拆架 / 压载 / 廊屋屋顶下落 / 6 根克隆体落位 / 抽一根下沉）。一行可修。
   - **1024 贴图仍套在 68×40 的正交框上**，纹理密度从 3.3 cm/texel 掉到 6.6 cm/texel（横向），木料直径才 0.34 单位 → 阴影边从「软」变「糊+阶梯」。

---

## 1. 已修 / 仍开放

| 状态 | 项 | 位置 |
|---|---|---|
| ✅ 已修 | `powerPreference:"high-performance"` | 271 |
| ✅ 已修 | `setPixelRatio(min(dpr,1.5))` | 272 |
| ✅ 已修 | `shadowMap.autoUpdate=false` + 首次 `needsUpdate` | 279-280 |
| ✅ 已修 | 阴影贴图 2048 → 1024 | 301 |
| ✅ 已修 | 拖拽时 `castShadow=false`，松手/落位恢复 | 771 / 801 / 812 |
| ✅ 已修 | `updateShadows()` 触发点：`beginStep`(677)、`finishPlacement`(857)、回弹(802)、`finish`(1414)、`buildStatic`(1532) | — |
| ✅ 本来就是对的 | `renderHUD()` 只在步进时调用，不在帧循环里（1320-1335） | — |
| ✅ 本来就是对的 | `pointerdown` 只 `intersectObject` 当前这一根，不做全场景 raycast（754） | — |
| ❌ 仍开放 | tween 期间不刷新阴影 → 阴影跳变 | 594-609、1549 |
| ❌ 仍开放 | 1024 贴图 + 68×40 正交框 → texel 6.6 cm | 301-305 |
| ❌ 仍开放 | `key.shadow.radius = 2` 在 PCFSoft 下**完全无效**（见 §4.7） | 309 |
| ❌ 仍开放 | `#tip` 每帧写 `left/top` + 每帧写 `textContent` | 1563-1565 |
| ❌ 仍开放 | `setPointer` 每次 pointermove 都 `getBoundingClientRect()` | 745 |
| ❌ 仍开放 | 克隆体与廊屋材质永久 `transparent=true` | 845-846、1040-1043 |
| ❌ 仍开放 | `updateForce` 在 `visible=false` 时仍每帧跑 114 次 `position.set` | 1299-1308 |
| ❌ 仍开放 | 每帧 `new T.Color` + `position.clone()` | 1560、1571 |
| ❌ 仍开放 | 力流 114 个独立 Mesh = 114 次 draw call | 1269-1293 |
| ❌ 仍开放 | 廊屋 151 个 Mesh / 151 个独立 `BoxGeometry` | 992-998、1033-1154 |
| ❌ 仍开放 | `resize` 不重算 pixelRatio | 1579-1583 |
| ❌ 仍开放 | `window.__proto` 不导出 `renderer`/`scene` → 无法测量 | 1585 |

---

## 2. 逐帧预算（按代码数出来的）

视口按 1440×900 CSS px、DPR 2 → 实际渲染 **2160×1350 = 2.92 MP**（`min(2,1.5)`，272）。
2560×1440 屏幕 DPR 1 → `min(1,1.5)=1` → 3.69 MP。3840×2160 DPR 1 → **8.3 MP，当前没有任何上限**。

### 2.1 对象数

**拖拽阶段**（第 9 步、正在拖五节苗第 5 根，`bridge` 内）：

| 组 | 数量 | 说明 |
|---|---|---|
| 牛头 | 2 | `block()`，cast |
| 牛头细节 | 12 | 3 槽 + 3 销 ×2，**不 cast**（864-875 未设 castShadow） |
| 已落位苗 | 49 | 7 根 × 7 排（原始 1 + `clone` 6，841-852） |
| 节点 joint | 18 | 7 根 × 2 + 牛头 2×2 |
| 当前拖的苗 + outline + ghost | 1 + 2 条线 | 712-724 |
| 桥台 / 支架 | 2 + 4 | 531-544 |
| 环境 | 4 | ground / river / sky / hills |
| 光 | 6 | 1 hemi + 3 dir + 2 point，仅 1 个投影 |

- **caster 合计 ≈ 70**，主 pass **≈ 100 次 draw call**，阴影 pass **0 次/帧**（拖拽期间）。
- 顶点量可忽略：苗 = `CylinderGeometry(...,10)` 42 顶点/根，joint 12 段，全场景 < 2 万顶点。**这不是顶点瓶颈。**

**起廊屋之后**：`buildGallery` 生成 **151 个 Mesh**（23 桥面 + 65 框架 + 37 屋顶 + 26 楼阁，用代码里的循环复算过，见附录 A）。加上拱架 49 + 节点 18 + 牛头 2 + 拉结 4 + 剪刀苗 4 → `bridge` 内 **≈ 233 个 Mesh**，全场景主 pass **≈ 245 次 draw call**，caster ≈ 230。

**力流**：`placed` 里 56 条（8 根 × 7 排）× 2 个点 = 112，加 2 个锥 = **114 个独立 Mesh**（1269-1293），开启时 +114 次 draw call。

### 2.2 每帧 CPU

| 工作 | 次数 | 位置 |
|---|---|---|
| `stepTweens` | 0-14 项，无分配 | 1549 |
| `controls.update()`（damping） | 1 | 1550 |
| `updateForce` | **114 次 `position.set`，即使 `visible=false`** | 1551、1299-1308 |
| `m.position.clone()` | 1 次分配/帧 | 1560 |
| `tipEl.style.left/top` | 2 次样式写/帧 | 1563-1564 |
| `tipEl.textContent =` | **1 次/帧，无论文字变没变** | 1565 |
| `new T.Color()`（压载后） | 1 次分配/帧 | 1571 |
| `renderer.render` | 1 次（+0 次 shadow pass） | 1575 |

### 2.3 每次 pointermove

| 工作 | 位置 |
|---|---|
| `renderer.domElement.getBoundingClientRect()` ← **强制布局** | 745 |
| `raycaster.setFromCamera` | 748 |
| `ray.intersectPlane` | 779 |
| 1 次 `position.set` + 2 次材质写 | 780、785-786 |

`pointermove` 绑在 `window` 上、无节流：120 Hz 屏 + 1000 Hz 鼠标时每秒 60-240 次，每次一次布局读。

### 2.4 填充率（估）

- PCFSoft 每个受光片元 **16 次 `texture2DCompare`**（vendor 里 `SHADOWMAP_TYPE_PCF_SOFT` 分支：4 次直采 + 4 组 `mix` 各 2 次 + 1 组 4 次 = 16）。
- `ground` 220×220 且 `receiveShadow`（341-348），几乎铺满屏幕；苗 / 牛头 / 廊屋全部 `receiveShadow=true` → 基本等于**全屏 × 16 采样**：2.92 MP × 16 ≈ **47 M 次深度采样/帧 ≈ 2.8 G/s @60fps**。
- 叠加：3 个平行光 + 2 个点光（295-326）、`map`+`bumpMap`（443-445，同一张 512² 采样两次）、ACES + sRGB（277-278）。估 150-250 ALU/片元。
- 移动端 390×844 DPR 1.5 = 0.74 MP（采样只有桌面的 1/4），但 GPU 弱 4-6 倍、draw call 245 次 → **移动端瓶颈是 draw call，不是像素**。

---

## 3. 五个最可能的原因（按「能解释拖拽卡顿」排序）

### C1 · 拖动路径每帧写布局 + 每次 pointermove 读布局（只在拖动时发生）

证据（行号精确）：

```js
// 1556-1569 每帧，只要 state.active 存在
const v = m.position.clone();
v.project(camera);
tipEl.style.left = ((v.x*.5+.5)*innerWidth)+'px';     // 1563  ← 写布局属性
tipEl.style.top  = ((-v.y*.5+.5)*innerHeight)+'px';    // 1564  ← 写布局属性
tipEl.textContent = state.active.dragging ? ... ;      // 1565  ← 每帧换文本节点

// 744-749 每次 pointermove
function setPointer(e){
  const r = renderer.domElement.getBoundingClientRect(); // 745 ← 强制同步布局
  ...
```

- `#tip` 的 CSS 只有 `position:fixed` + `transform`（60-66），**没有 left/top**，所以每帧的 `left/top` 写入都在改布局输入；下一帧的 `getBoundingClientRect()` 紧接着把布局刷出来 → 一次典型的「写-读」抖动。
- 顺带被拖累的还有 4 层 `backdrop-filter`：`#legend` 73、`#views` 82、`#cta` 113、`.veil` 120。每次样式/布局失效，这几层都要重新取背景做模糊。`#legend` 在游玩全程可见。
- 为什么排第一：**这是唯一「只在拖动时」的成本**。GPU 那几项在不拖动时同样存在（相机阻尼、autoroate 后的静止画面也照常渲染），只有 DOM 抖动和拖动强相关。体感「粘滞」而非「均匀掉帧」，也符合主线程被布局打断的特征。
- 估：每次 flush 0.3-1.5 ms（4 层 blur + 13 个 ticks 节点），120 次/s → 36-180 ms/s 主线程，且集中在 rAF 前，直接吃掉帧预算。
- 验证：Performance 面板里 `Layout` / `Recalculate Style` 条目在拖动时 ≥60 条/秒，停止拖动立刻归零。

### C2 · PCFSoft 16 次采样 × 全屏像素，DPR 与 MSAA 仍是双份

证据：

```js
const renderer = new T.WebGLRenderer({antialias:true, powerPreference:"high-performance"}); // 271
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));                                   // 272
renderer.shadowMap.type = T.PCFSoftShadowMap;                                              // 275
ground.receiveShadow = true;                                                                // 347
```

- 上次改动只让**阴影贴图不再重画**，但阴影贴图是一张纹理，**采样次数由材质着色器决定，与 `autoUpdate` 无关**。每帧每个受光片元仍然是 16 次 `texture2DCompare`。
- `antialias:true` 在 DPR 1.5 上等于 SSAA(1.5×) + MSAA(4×) 叠加：带宽 ×1.4，边缘收益很小。
- 2560×1440 屏幕 DPR 1 → `min(1,1.5)=1`，`setPixelRatio` 在这里**等于没设**；4K 桌面（DPR 1）渲染 **8.3 MP**，没有任何像素上限。这是「同一份代码在别人机器上特别卡」的最可能解释。
- 为什么排第二：它与拖动无关，但决定「卡到什么程度」。如果 C1 修完还是不够 60fps，就是它。
- 验证：`__proto.renderer.setPixelRatio(1)` 后 fps 提升 >20% → 填充率受限，确认是 C2。

### C3 · 克隆体与廊屋材质永久 `transparent=true`（≈208 次混合 draw）

证据：

```js
const c = mesh.clone(true);
c.material = mesh.material.clone();
c.material.transparent = true;   // 845
c.material.opacity = 0;
...
tweenNum(c.material, 'opacity', 1, .3);   // 849 ← 淡入结束后没有人把 transparent 改回去
```

```js
[deckMat, frameMat, roofMat, pavMat].forEach(function(m){
  m.transparent = true;           // 1041 ← 廊屋 151 个 Mesh 共用这 4 个材质
  m.opacity = instant ? 1 : 0;
});
```

- 淡入早就结束了，但 48 根克隆苗（8 根 × 6 排）+ 151 个廊屋 Mesh + 4 根剪刀苗 + 4 根支架 + 河面 ≈ **208 次混合绘制**永久留在透明队列里。
- 后果：①失去 early-Z（地面先画完也挡不住后面的苗）②每帧透明队列按距离重排，渲染顺序从「近到远」变「远到近」，overdraw 上升 ③移动端每笔混合都要 tile resolve。片元成本不是 1.5×，是 2-3×。
- 为什么排第三：它同时解释「拖到后面几根比第一根卡」——克隆体是一根一根加上去的，第 1 根时 0 个克隆，第 8 根时 48 个。

### C4 · 绘制批次：245 次 draw call / 151 个独立 `BoxGeometry` / 114 个粒子 Mesh

证据：

```js
function gblock(x,y,z,sx,sy,sz,material){
  const m = new T.Mesh(new T.BoxGeometry(sx,sy,sz), material);   // 993 ← 每块一个新 geometry
```

- 廊屋 151 块，**151 个 VBO、151 次 draw**；其中 75 块尺寸完全重复：桥面板 15 块 `1.95×.16×5.0`（1051-1053）、廊柱 30 块 `.2×2.0×.2`（1077-1080）、檩托 30 块 `.12×.3×.12`（1096-1100）。
- 力流 114 个 `Mesh` 共用 geometry 但仍是 114 次 draw（1269-1293）。
- 桌面影响中等（100-245 次 draw 在 ~1-2 ms 量级），**移动端是主因**：245 次 draw 在中端安卓上 ≈ 4-8 ms 纯驱动开销。
- 为什么排第四：桌面如果已经 60fps，这项只会让你掉 2-5 帧；但手机上是硬门槛。

### C5 · 每帧无用功：`updateForce` 不看 `visible`、每帧分配 Color/Vector3

证据：

```js
function updateForce(t){
  if(!forceGroup) return;                       // 1300 ← 只判 null，不判 visible
  forceGroup.children.forEach(function(o){ ... o.position.set(...) });   // 1306
}
```

```js
if(loadBlock && state.force){
  loadBlock.material.emissive = new T.Color(0x1a0c08);   // 1571 ← 每帧 new
```

- 压载后 `forceGroup` 一直存在；`doGallery` 里 `setForce(false)`（1170）只是 `visible=false`，**114 次 `position.set` 从此每帧照跑**，另外 114 个不可见对象的 `matrixWorld` 也会被 compose。
- 每次 `position.set` 会把 matrix 标脏 → 父组 `updateMatrixWorld` 递归全走一遍。估 0.1-0.3 ms/帧。
- 不是主因，但属于「白送的帧预算」，改动 1 行。

**排除项（不是原因，别再猜）**

- 顶点/几何量：全场景 < 2 万顶点，`CylinderGeometry(10)` 只有 42 顶点/根。
- `raycaster` 全场景遍历：不存在。`pointerdown` 只测当前一根（754），`pointermove` 只做平面求交（779）。
- 纹理：512² 木纹 + 256² 瓦 + 512² 地面 + 1024×256 山，合计 < 1 MB，不是显存问题。
- 着色器重编译：材质 `clone()` 会命中 `WebGLPrograms` 缓存（同 key），不会每次重编译。唯一的首次编译在廊屋 `DoubleSide`（1038），被 3 秒忙碌期盖住了。
- GC：60 次/s 的 `Vector3`/`Color` 分配，量级太小，不是长任务来源。

---

## 4. 精确修复

### 4.1 P0 · `#tip` 不再触发布局（C1）

CSS（60-66）改成用 transform 定位，元素固定在原点：

```css
#tip{
  position:fixed;left:0;top:0;z-index:4;
  transform:translate3d(0,0,0) translate(-50%,-115%);
  will-change:transform;
  /* 其余不变 */
}
```

JS（1556-1569 替换）：

```js
const tipPos = new T.Vector3();          // 模块级，只建一次
let tipX = -1, tipY = -1, tipText = '';
...
if(state.active){
  const m = state.active.mesh;
  m.material.emissiveIntensity = .45 + Math.sin(t*3.2)*.2;

  tipPos.copy(m.position); tipPos.y += 1.1; tipPos.project(camera);
  const x = Math.round((tipPos.x*.5+.5)*innerWidth);
  const y = Math.round((-tipPos.y*.5+.5)*innerHeight);
  if(x !== tipX || y !== tipY){                       // 只在真的动了才写
    tipX = x; tipY = y;
    tipEl.style.transform = 'translate3d('+x+'px,'+y+'px,0) translate(-50%,-115%)';
  }
  const txt = state.active.dragging ? '松手入卯 · 回车也行' : '拖动 · 放进红框 · 或按回车';
  if(txt !== tipText){ tipText = txt; tipEl.textContent = txt; }   // 只在变了才写
  tipEl.classList.add('show');
}else{
  tipEl.classList.remove('show');
}
```

注意：内联 `transform` 会覆盖 CSS 里的 `translate(-50%,-115%)`，所以**必须把这一段完整写进内联值**（上面已经写了）。
顺带把「回车」写进提示——现在键盘能用（1455），但屏上没有任何地方说。

### 4.2 P0 · 去掉 pointermove 里的布局读（C1）

canvas 是 `#app{position:fixed;inset:0}` + `body{overflow:hidden}`，其 rect 恒等于视口，直接算：

```js
function setPointer(e){
  pointer.x = (e.clientX / innerWidth) * 2 - 1;     // 745 的 getBoundingClientRect 删掉
  pointer.y = -(e.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
}
```

同时把 pointermove 合并到 rAF（120/1000 Hz 鼠标 → 每帧最多 1 次）：

```js
let pendingMove = null;
window.addEventListener('pointermove', function(e){
  const a = state.active;
  if(!a || !a.dragging) return;
  pendingMove = e;                                  // 775-787 只存事件
});
// animate() 里，renderer.render 之前：
if(pendingMove){ dragTo(pendingMove); pendingMove = null; }
function dragTo(e){
  setPointer(e);
  if(!raycaster.ray.intersectPlane(state.active.plane, hitPoint)) return;
  state.active.mesh.position.set(hitPoint.x, hitPoint.y, state.active.targetZ);
  const a = state.active;
  const near = Math.hypot(a.mesh.position.x-a.targetPos.x, a.mesh.position.y-a.targetPos.y) < 1.5;
  if(near !== a.near){
    a.near = near;
    a.ghost.material.opacity = near ? .95 : .4;
    a.ghost.material.color.setHex(near ? 0xff8a63 : ACC);
  }
}
```

### 4.3 P0 · 修掉上次改动引入的阴影跳变（**必须和上面一起上**）

`animate()` 里 `stepTweens(dt)`（1549）之后加一行：

```js
if(tweens.length) renderer.shadowMap.needsUpdate = true;
```

理由：tween 一定在动几何——克隆体落位（850）、拆架（970-971）、桥体下沉（975-977）、压载下落（1191、1195）、廊屋屋顶下落（1160-1162）、抽一根下沉（1392-1393）。现在这些全部只在 `finishPlacement`/`beginStep` 那一刻刷一次，动画期间阴影是「贴上去的」，动画结束再跳一下。
代价：动画期间每帧一次 shadow pass（本来就是），**静止和拖拽期间仍是 0 次**。
显式 `updateShadows()` 调用点全部保留（幂等，同一帧多次只算一次）。

### 4.4 P0 · `updateForce` 早退 + 去掉每帧分配（C5）

```js
function updateForce(t){
  if(!forceGroup || !forceGroup.visible) return;      // 1300
  ...
}
const EMISSIVE_LOAD = new T.Color(0x1a0c08);          // 1571 的 new 提到模块级
...
if(loadBlock && state.force){
  loadBlock.material.emissive.copy(EMISSIVE_LOAD);
  loadBlock.material.emissiveIntensity = .4 + Math.sin(t*1.6)*.1;
}
```

### 4.5 P1 · 像素预算 + AA 只在低 DPR 时开（C2）

```js
const COARSE = matchMedia('(pointer:coarse)').matches;

function pixelRatio(){
  const dpr = devicePixelRatio || 1;
  const budget = COARSE ? 1.2e6 : 4.2e6;              // 桌面≈1920×1200 的像素量
  const fit = Math.sqrt(budget / (innerWidth*innerHeight));
  return Math.min(dpr, COARSE ? 1.5 : 2, Math.max(0.8, fit));
}

const renderer = new T.WebGLRenderer({
  antialias: !COARSE && (devicePixelRatio||1) <= 1.25,   // 已经在超采样就别再叠 MSAA
  powerPreference: 'high-performance'
});
renderer.setPixelRatio(pixelRatio());
```

实测对照（`budget=4.2e6`）：1440×900@2x → 1.5（**和现在一样，不动画质**）；2560×1440@1x → 1.07；3840×2160@1x → 0.8（8.3 MP→5.3 MP，肉眼在高 DPI 屏上几乎看不出，但这是唯一能救 4K 桌面的开关）。
`resize`（1579-1583）里补 `renderer.setPixelRatio(pixelRatio());`——现在 resize 后 DPR 是旧值。

### 4.6 P1 · 把 1024 贴图的画质补回来（阴影框收紧）

```js
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.left = -24; key.shadow.camera.right = 24;   // 302-303：±34 → ±24
key.shadow.camera.top =  20;  key.shadow.camera.bottom = -12; // 304-305：26/-14 → 20/-12
key.shadow.camera.updateProjectionMatrix();
```

- 现密度：68/1024 = **6.6 cm/texel**（横）、40/1024 = 3.9 cm（纵）。木料直径 0.34 单位 = 34 cm，横向只剩 **5 个 texel** → 这就是「阴影发糊、边上有阶梯」的来源。
- 收紧后：48/1024 = 4.7 cm、32/1024 = 3.1 cm，接近原来的 3.3/1.95，**显存和面数还省 75%**。
- 必须目测校验：牛头在 x=±15.4、宽 4.4 → 世界 x 到 ±17.6；光照方向 (16,24,18) 会把投影往 -x/-z 推，所以**改完一定用侧视看两侧桥台和廊屋檐口的投影有没有被切**。被切就把 `left/right` 放回 ±28（52/1024=5.1 cm，仍好于现状）。

### 4.7 P1 · 删掉 `key.shadow.radius = 2`（无效行）

r128 的 `SHADOWMAP_TYPE_PCF_SOFT` 分支只用 `fract()` 自算 16 个偏移，**完全不读 `shadowRadius`**；只有 `PCF` 和 `VSM` 分支读。当前 `type = PCFSoftShadowMap`，所以 309 行是死代码，谁调它都不会变软。
要更软的边：提高贴图密度（4.6）或换 VSM（`renderer.shadowMap.type = T.VSMShadowMap` + `key.shadow.blurSamples`），后者在 r128 是 1 次采样 + 两次 blur pass，移动端可选，但有漏光风险，桌面别动。

### 4.8 P1 · 淡入结束把 `transparent` 摘掉（C3）

```js
tweenNum(c.material, 'opacity', 1, .3, easeOut, function(){ c.material.transparent = false; });  // 849
```

廊屋 4 个材质同理，在各自 `done` 里置 `transparent=false`（1158-1163 的四个 tween）：

```js
tweenNum(galleryMats.deck, 'opacity', 1, .45, easeOut, function(){ galleryMats.deck.transparent = false; });
```

顺带 `braces`（914-915）也照做。
注意：`transparent` 只影响渲染状态、不影响程序缓存，**不需要** `needsUpdate`，切换无卡顿。48+151 次混合绘制直接消失，overdraw 与移动端 tile resolve 一起降。

### 4.9 P2 · 力流粒子合成 1 个 `Points`（C4）

视觉等价：把现有 `SphereGeometry(.085,6,6)` 换成一张径向渐变的小贴图（跟 `groundTexture()` 同样的做法，16×16 就够），`PointsMaterial({size:.17, sizeAttenuation:true, map:dotTex, transparent:true, blending:AdditiveBlending, depthWrite:false})`。

```js
const list = [];
placed.forEach(function(p){
  if(p.block) return;
  for(let k=0;k<2;k++) list.push({a:p.a, b:p.b, z:p.z, dir:p.dir||1, phase:k*.5+Math.random()*.2});
});
const pos = new Float32Array(list.length*3);
const geo = new T.BufferGeometry();
geo.setAttribute('position', new T.BufferAttribute(pos, 3));
forceGroup = new T.Group(); scene.add(forceGroup);
forceGroup.userData.list = list;
forceGroup.add(new T.Points(geo, dotMat));
```

`updateForce` 改成只写 `pos` 数组 + `geo.attributes.position.needsUpdate = true`：114 次 draw → **1 次**，114 次 matrix compose → 0 次。两个锥保留成 Mesh。

### 4.10 P2 · 廊屋 3 组 InstancedMesh（C4）

75/151 块尺寸完全相同，`gblock` 每次 new `BoxGeometry`（993）：

| 组 | 数量 | 尺寸 | 位置来源 |
|---|---|---|---|
| 桥面板 | 15 | `1.95×.16×5.0` | 1051-1053，x = −14.7…14.7 step 2.1 |
| 廊柱 | 30 | `.2×2.0×.2` | 1077-1080，x = −14…14 step 2，z = ±2.15 |
| 檩托 | 30 | `.12×.3×.12` | 1096-1100，x = −14…14 step 2，z = ±2.15 |

```js
const inst = new T.InstancedMesh(new T.BoxGeometry(1.95,.16,5.0), deckMat, 15);
const mx = new T.Matrix4();
for(let i=0;i<15;i++){ mx.makeTranslation(-14.7 + i*2.1, 6.32, 0); inst.setMatrixAt(i, mx); }
inst.instanceMatrix.needsUpdate = true;
inst.castShadow = inst.receiveShadow = true;
deck.add(inst);
```

151 → **79 次 draw**，151 个 VBO → 79 个。`InstancedMesh` 在 r128 里是可用的（vendor 里有 14 处）。注意 r128 的 InstancedMesh **不支持** `setColorAt` 以外的 per-instance 变化，这几组正好只差平移，够用。

### 4.11 P2 · 移动端档位（PLAN §6 line 89 已经要求）

在**创建 renderer 之前**决定，避免运行时切换触发全材质重编译：

```js
renderer.shadowMap.enabled = !COARSE;   // 274 改成这样
```

无阴影后地面会「飘」，补一块烘焙的桥下接触阴影：一个 `PlaneGeometry(40,10)` + 径向渐变 `CanvasTexture`（照 `groundTexture()` 的写法）+ `MeshBasicMaterial({transparent:true, opacity:.5, depthWrite:false})`，放在 y = GROUND_Y+0.01。1 次 draw 换掉全部 shadow pass + 16 次采样。
再叠 `antialias:false`（4.5）和 DPR 1.5（4.5），移动端预计 2-3×。

---

## 5. 最小补丁顺序（按「改完还保不保画质」排）

**P0 — 30 分钟，像素完全不变**（这是本次的主菜，必须先做）

1. 4.3 阴影 tween 刷新（**先做这一条**，否则 2-4 期间阴影会跳得更明显）
2. 4.1 `#tip` → transform + 变值才写
3. 4.2 `setPointer` 用 `innerWidth/innerHeight`；pointermove 合并到 rAF
4. 4.4 `updateForce` 早退 + `Color`/`Vector3` 提出来
   → 验收：拖动时 Performance 面板 `Layout`/`Recalculate Style` 归零；最长任务 < 20 ms；**画面一个像素都不应该变**（阴影跳变消失算是修好了）。

**P1 — 1-2 小时，视觉几乎无差**

5. 4.5 像素预算 + AA 条件 + resize 里重算
6. 4.6 阴影框收紧（**改完立刻侧视检查桥台/檐口投影**）
7. 4.7 删 `shadow.radius`
8. 4.8 `transparent` 复位
   → 验收：§6 的 DPR1 实验提升 ≥25%；阴影边缘密度目测回到 2048 时代；廊屋之后再转相机不再掉帧。

**P2 — 半天，只影响移动端与廊屋阶段**

9. 4.9 力流 → Points
10. 4.10 廊屋 3 组 InstancedMesh
11. 4.11 移动端档位 + 烘焙接触阴影
   → 验收：中端安卓 `?built=1` 下 ≥30fps，`renderer.info.render.calls ≤ 90`。

顺序的理由：1-4 只改 JS 逻辑和样式写法，不碰任何采样，可单独回滚；5-8 才动像素，每一刀都能用 §6 的「DPR1 / 关阴影」实验单独归因；9-11 只降 draw call，桌面画质不变，风险最低但收益也最小。

---

## 6. 手动测试计划

**Step 0 · 先把测量口打开**（不改这个测不了）：1585 行补两个字段

```js
window.__proto = {camera:camera, controls:controls, state:state, setForce:setForce,
                  archForces:archForces, bridge:bridge, preview:function(){return previewGroup;},
                  renderer:renderer, scene:scene};
```

1. 起服务，别用 `file://`：
   `cd prototype; python -m http.server 8765` → `http://localhost:8765/?auto=1`
2. 贴测量工具（console）：

```js
window.fps = (ms=3000)=>new Promise(r=>{let n=0,t=performance.now();
  (function f(){ n++; performance.now()-t<ms ? requestAnimationFrame(f)
    : r(+(n*1000/(performance.now()-t)).toFixed(1)); })();});
window.longtasks = [];
new PerformanceObserver(l=>longtasks.push(...l.getEntries().map(e=>Math.round(e.duration))))
  .observe({entryTypes:['longtask']});
```

3. **决定性四组实验**（每组都是「按住一根苗左右拖 10 秒」，取 `await fps()` 与 `longtasks`）：

| # | 操作 | 若明显变快 → 结论 | 对应补丁 |
|---|---|---|---|
| a | 基线 | — | — |
| b | `__proto.renderer.setPixelRatio(1)` | 提升 >20% ⇒ 填充率/采样（C2） | 4.5 / 4.6 |
| c | `__proto.renderer.shadowMap.enabled=false; __proto.scene.traverse(o=>{if(o.material)o.material.needsUpdate=true;})` | 再降 15-30% ⇒ 16 taps 是主成本（C2） | 4.5 / 4.11 |
| d | 拖到第 8 根 vs 第 1 根 | 后面明显更卡 ⇒ 透明克隆体 + draw call（C3/C4） | 4.8 / 4.10 |

若 a/b/c 差 <10%：`__proto.renderer.info.render.calls`（拖拽期预期 ≈100，廊屋后 ≈245）+ `longtasks` 里出现 50-150 ms 的长任务 ⇒ 主线程，先查 C1。

4. **Performance 面板**（Chrome，`Ctrl+E` 录 10 秒，期间拖 3 个来回）：
   - Main 轨道：拖拽期间 `Layout` / `Recalculate Style` 条目数——**改前预期 ≥60 条/秒，改后应为 0**。
   - `Frames` 轨道：红色丢帧块占比，改前预期 20-35%，改后 <5%。
   - 帧时间 p95 目标：桌面 ≤16.7 ms；**不允许出现 >50 ms 的任务**（合成 `beginStep` 里 `EdgesGeometry` 构造，预期 <2 ms）。
   - Rendering 抽屉：勾 `Paint flashing`，`#tip` 应只在出现/消失时闪一次，而不是每帧；勾 `Frame Rendering Stats` 看实时 FPS 与 GPU 内存。
5. 回归检查（阴影改动最容易看坏）——开 `?built=1`：
   - 侧视：两侧桥台投影有没有被裁掉（4.6 的框）；
   - 起廊屋动画结束那一刻：屋顶阴影是否**不再跳**（4.3）；
   - 「抽一根」：桥体下沉 0.38 后阴影是否跟着走（4.3）；
   - 拆架：支架倒下时阴影跟着落（4.3）；
   - 手机：`pointercancel`（切到别的 App 再回来）后还能不能继续拖（见 7.2）。

---

## 7. 无障碍 / 移动端问题

1. **触屏抓不住木料**（严重）。苗直径 0.34 单位，在 FOV 37°、距离 ~40、900 px 高视口里只有 **约 11 px 宽**；`pointerdown` 只对当前这一根做 `intersectObject`（754），手指按不准就完全没反应。
   修：给 `state.active.mesh` 挂一个不可见的粗代理（`CylinderGeometry(.9,.9,len,6)` 或一个 Box，`visible=false`），`pointerdown` 时对代理求交。r128 的 `Raycaster` **不检查 `visible`**（`$c` 只判 `layers.test`），所以 `visible=false` 的代理可以被命中，且不进渲染。
2. **缺 `pointercancel`**（严重）。只有 `pointerup`（789）。触屏上被系统手势/来电打断时 `pointerup` 不来 → `state.dragging` 永久 true、`controls.enabled` 永久 false，页面卡死在「正在拖」。
   修：`window.addEventListener('pointercancel', onPointerUp)`，并把 `pointerup` 的逻辑抽成 `onPointerUp`。
3. **`touch-action` 未设**。`canvas{touch-action:none}` 否则 iOS/Android 可能把拖动解释成滚动/缩放（`body{overflow:hidden}` 挡不住手势）。
4. **`prefers-reduced-motion` 全项目 0 处**（PLAN §9 line 129 明确要求）。受影响：`autoRotate`（292、1418）、emissive 脉冲（1558）、ghost 脉冲（1554）、所有 tween。
   修：`const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;` → `autoRotate = autoRotate && !REDUCED`，脉冲幅度置 0，tween 时长 ×0.4。
5. **ARIA 缺口**：`#hud` 步进只写 `textContent`（1320-1335）没有 `aria-live`，读屏不会播报换步；`#toast` 没有 `role="status"`；`#views` 缺 `role="group" aria-label="结构视图"`；`#sideBtn`/`#breakBtn`/`#soundBtn` 是 toggle 但没有 `aria-pressed`（只有 `#forceBtn` 和视图按钮有，1257、1348）；canvas 没有 `aria-label`。
6. **键盘焦点不可见**：CSS 里只有 `:hover`（42、91），**没有任何 `:focus`/`:focus-visible`**（全文件 0 处），Tab 到按钮时看不见焦点；另外 `#tip` 从不提「回车」（1455 支持，README 提了，屏上没有）。
7. **对比度**（按 WCAG 公式算的）：`--ink-3:#7c7061`（13 行）落在 `#14110f` 上 = **3.9:1**，用在 10.5 px 的 `.sub` 和 10 px 的 `.stepnum` → 低于 AA 的 4.5:1；`#legend .note` `#5e554a`（76）= **2.6:1**，不合格（移动端已 `display:none`）。`--accent` 4.9:1 合格。`.hint` 9.5:1 合格。
8. **移动端布局**：`#legend` 在 `top:64px`（156），`#views` 在 `top:150px`（160），`#views` 一显示就压在 legend 上；`#tip` 用 `translate(-50%,-115%)` 且无边界夹取，拖到屏幕顶部时提示会飞出屏幕（1538-1569 也没 clamp）。
9. **高 DPI**：DPR 上限 1.5 让 3x 手机只渲染 0.74 MP 再放大，3D 边缘偏软（DOM 文字不受影响，可接受）；但阴影是 1024²，成本与桌面相同而 GPU 弱 4-6 倍 → **移动端最该先关的正是阴影**（4.11）。

---

## 附录 A · 数字怎么来的

- 视口像素：`innerWidth × innerHeight × min(devicePixelRatio,1.5)²`（272）。
- PCFSoft 16 次采样：`prototype/vendor/three.min.js` 里 `SHADOWMAP_TYPE_PCF_SOFT` 分支的 `texture2DCompare` 调用数（4 直采 + 4 组 `mix`×2 + 1 组 `mix`×4 = 16）；`SHADOWMAP_TYPE_PCF` 分支是 17 次且会乘 `shadowRadius`——所以**换 `PCFShadowMap` 不会更快**。
- 廊屋 151 = 23（桥面）+ 65（框架）+ 37（屋顶）+ 26（楼阁）。用脚本按 1033-1154 的循环变量复算：桥面 `for(x=-14.7;x<=14.7001;x+=2.1)` → 15，再 +2 +4 +2；框架 12 + `for(x=-14;x<=14.0001;x+=2)` 15×3 + 2 + 4 + 2；屋顶 2×(15+1) + 2 + 1 + 2；楼阁 26。
- 拱架：`RIBS` 7 排 ×（3 + 5 段）= 56 根苗，落位 8 次每次 7 根（1 + 6 clone）；节点 2/根。
- 力流：`placed` 56 条 × 2 + 2 锥 = 114。
- 阴影 texel：`(right-left)/mapSize`；68/1024 = 6.6 cm，68/2048 = 3.3 cm（1 单位 = 1 m，看 `X=14.2` 与「净跨 29」）。
- 对比度：WCAG 相对亮度公式手算，未用工具，误差 <0.05。

## 附录 B · 明确不要做的事

- **不要**把 56 根苗合并/实例化：`applyView`（1337-1344）、`breakOne`（1382-1391）、`colorByForce`（1238-1249）都按「单个 mesh 的 `visible` + `userData.system`」工作，改实例化要连带重写这三处；而 56 次 draw 不是瓶颈（瓶颈在像素）。
- **不要**用 `PCFShadowMap` 换性能：见附录 A，17 次 vs 16 次。
- **不要**把 `shadowMap.autoUpdate` 改回 `true`：现在是 0 次/帧，改回去 1 次/帧。
- **不要**在拖拽时把苗 `visible=false`：丢手感。`castShadow=false`（771）已经是最优点。
- **不要**为性能关 `toneMapping`：ACES 是每像素几十个 ALU，不是瓶颈，关了整幅画面会变。
- **不要**在运行时切 `shadowMap.enabled`：已编译的材质需要全部 `needsUpdate=true` 才会去掉阴影代码，中途切换会一次性卡 200-400 ms。移动端档位必须在**创建 renderer 之前**定（4.11）。
