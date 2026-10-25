# 廊屋内部陈设规格 · `prototype/interior.js`

廊屋不是只有柱子和瓦。中央神龛、两侧长凳、三块匾额、一张香案、四个柱头雀替——让人一进桥就能看出这里被使用过。

独立 classic script，挂 `window.BridgeInterior`，不引外部模型 / 贴图，不依赖构建。

- 交付：`prototype/interior.js`
- 依赖：页面里的 `vendor/three.min.js`（当前 **r128**）
- 无副作用：不改 `index.html`；只在自己 `dispose()` 时清理自己创建的对象
- 自检：`node --check prototype/interior.js` 通过

## 1. API

```js
var interior = BridgeInterior.build(THREE, opts);
// opts（全部可选）
//   hidden    : true 则 parts 先全部隐藏，配合 reveal() 逐步显形（默认 false）
//   parent    : 直接挂进去的父节点（默认不挂，自己 scene.add(interior.group)）
//   textures  : false 则不用程序化 canvas 木纹，纯色（默认 true；低端机可关）
//   shrine    : false 不建神龛（默认 true）
//   benches   : false 不建两条长凳（默认 true）
//   incense   : false 不建香案（默认 true）
//   plaques   : false 不建三块匾额（默认 true）
//   brackets  : false 不建四个雀替（默认 true）

galleryGroups.interior.add(interior.group);
galleryGroups.interior.visible = true;   // 父组自己也要可见
interior.reveal();                 // 全部显示
interior.reveal({stagger:80});     // 按 parts 顺序每隔 80 ms 显示一组
interior.dispose();                // 幂等：移出父节点 + 释放几何 / 材质 / 贴图
```

返回对象：

| 字段 | 说明 |
|---|---|
| `group` | 根节点 `THREE.Group`，名字 `bridge-interior` |
| `parts` | 有序数组（11 项），每项是 `THREE.Group`，按显形顺序排列 |
| `reveal(opts?)` | 显示全部；`opts.stagger` 毫秒则逐组显示。会把组内 mesh 一起设为可见 |
| `dispose()` | 幂等；移除根节点，释放 79 个几何、7 个材质、1 张 128² 贴图 |
| `stats` | `{meshes, triangles, materials, textures}`，构建后即可读 |
| `coords` / `layout` | 坐标约定与常量（调试用） |

`parts` 顺序与 `userData.interiorLabel`：

| # | label | 内容 |
|---|---|---|
| 0 | `bench-right` | +z 侧长凳（坐板 + 4 腿 + 横撑 + 3 靠背柱 + 靠背） |
| 1 | `bench-left` | -z 侧长凳 |
| 2 | `shrine-base` | 神龛基座 + 供桌 + 浅浮雕板 + 台面 |
| 3 | `shrine-cabinet` | 龛身（背板、两侧、底、顶、檐口、小歇山） |
| 4 | `shrine-offering` | 神主牌 + 两只烛台 + 两支蜡烛 |
| 5 | `shrine-lattice` | 格扇（外框 4 + 竖 5 + 横 3） |
| 6 | `incense-table` | 香案 + 香炉 |
| 7 | `plaque-entry-1` | 西端（x=-13.90）匾额 |
| 8 | `plaque-entry-2` | 东端（x=+13.90）匾额 |
| 9 | `plaque-center` | 中央匾额（x=0） |
| 10 | `brackets` | 四个柱头雀替 |

## 2. 坐标

与 `index.html` / `buildGallery()` 一致：桥面板顶 **y = 6.40**，半跨 X=14.2，廊柱每 2 m 一根。

| 既有构件 | x | y | z |
|---|---|---|---|
| 桥面板 | ±15.675 | 6.24 … **6.40** | ±2.50 |
| 廊柱 | -14 … 14（每 2 m） | 6.45 … 8.45 | ±2.15（截面 0.2 × 0.2） |
| 横向梁 | -14 … 14（每 2 m） | **8.38 … 8.58** | 0（截面 0.2 × 4.6） |
| 纵向梁 | -15 … 15 | 8.39 … 8.57 | ±2.15（截面 0.16 × 0.18） |
| 旧长凳 | ±5.50 | 6.66 … 6.78 | ±1.54 … ±1.96 |
| 旧栏杆 | ±15 | 6.95 … 7.60 | ±2.20 |

| 新构件 | x | y | z |
|---|---|---|---|
| 神龛基座 | -0.90 … 0.90 | 6.40 … 6.48 | 0.94 … 1.50 |
| 供桌 | -0.85 … 0.85 | 6.48 … 7.02 | 0.97 … 1.47 |
| 龛身 | -0.78 … 0.78 | 7.10 … 7.66 | 0.97 … 1.47 |
| 格扇 | -0.83 … 0.83 | 7.14 … 7.62 | 0.95 … 0.99 |
| 小歇山 | -0.93 … 0.93 | 7.72 … 7.88 | 0.90 … 1.51 |
| 香案 | ±0.33 | 6.40 … 7.16 | 0.56 … 0.92 |
| 长凳（右 / +z） | 6.80 … 12.20 | 6.40 … 7.24 | 1.14 … 1.50 |
| 长凳（左 / -z） | -12.20 … -6.80 | 6.40 … 7.24 | -1.50 … -1.14 |
| 匾额 · 两端 | ±13.90（板厚 0.08） | 8.00 … 8.40 | ±0.82（中央 ±1.02） |
| 雀替 | ±11.58 … ±11.86 | 7.88 … 8.39 | ±2.09 … ±2.21 |

整体包围盒：**x ±13.95，y 6.40 … 8.40，z ±2.21**，全部在桥面 `|x| ≤ 14`、`|z| ≤ 2.3` 内。

### 2.1 神龛

- 面宽 **1.70 m**（沿桥长 x），进深 0.46 m，靠 +z 一侧，格扇面朝 **-z（桥中线）**。
  人沿桥走时从侧面看到龛身；站在桥中线回头看，正对格扇。这样不占中央走道。
- 从下到上：基座 0.08 → 供桌 0.54 → 台面 0.08 → 龛身 0.56 → 檐口 0.06 → 小歇山（最高 7.88）。
- 格扇是「外框 4 根 + 竖 5 根 + 横 3 根」，格心是暗龛，能透见神主牌和两支蜡烛；不做文字。
- 神龛后沿 z=1.50，旧长凳前沿 z=1.54，**留 4 cm**；不碰旧长凳。
- 供桌前沿 z=0.97；香案后沿 z=0.92，**留 5 cm**。

### 2.2 长凳

- 只放在两端开间 `x 6.80 … 12.20`，与中央 `x ±5.5` 的旧长凳错开。
- 是独立坐凳：坐板顶 **6.91**（高于旧长凳 6.78）、四条腿落地、外侧一道矮靠背（顶 7.24）。
- 靠背在 `z ±1.46`，旧长凳在 `z ±1.54`，**留 4 cm**；不与旧长凳、旧栏杆、廊柱相交。

### 2.3 匾额

- 三块：两端 `x=±13.90`、中央 `x=0`；板顶 **8.36**，梁底 8.38，销钉顶到 8.40，进梁 2 cm。
- 两端 1.50 × 0.30，中央 1.90 × 0.34；深色板心 + 暖木边框 + 两颗小销钉，**不贴文字**。
- 中央匾额在神龛正上方；龛顶 7.88，匾额背板底 7.96，**留 8 cm**。

### 2.4 香案与雀替

- 香案 0.66 × 0.36，顶 7.00，正中一只小香炉；在神龛前 0.05 m，不碰龛身。
- 四个雀替在 `x=±12`、`z=±2.15`，从柱头内侧斜撑到纵向梁底；水平投影 0.28 m，
  完全落在柱内侧，**不与柱身相交**（斜撑下角贴到柱面，臂端留 4 cm）。

### 2.5 走道

- 长凳处净宽 `z -1.14 … 1.14` = **2.28 m**。
- 香案处最窄：香案前沿 0.56 到对侧旧长凳 -1.54 = **2.10 m**。
- 神龛占 `z 0.94 … 1.51`、`x ±0.90`，只占一侧，不堵死走道；中央 `z=0` 仍可直行。

## 3. 集成（`prototype/index.html`）

> 当前 `index.html` 已经由集成那一轮接好：`GALLERY_CATS` 增加了 `'interior'`，
> `buildGallery()` 里有 `window.BridgeInterior` 调用，`<script src="interior.js">` 也已加。
> 本节记录现状；行号会随主文件改动漂移，代码片段为准。

### 3.1 现状（已完成）

```html
<!-- index.html 第 291 行 -->
<script src="interior.js"></script>
```

```js
// 第 1228 行
const GALLERY_CATS = ['stairs','deck','support','columns','beams','rails',
                      'purlins','rafters','roof','pav','bridgehead','interior'];

// 第 1248 行（base 里）
interior: MAT_GAL.clone()

// buildGallery()，桥头屋之后（第 1294–1301 行）
if(window.BridgeInterior){
  try{
    const it = window.BridgeInterior.build(T, {});
    galleryGroups.interior.add(it.group);
    galleryDetailParts.interior = it.parts || [];
    it.group.traverse(function(o){ if(o.isMesh) o.visible = !!instant; });
  }catch(e){}
}
```

- **速览模式**：`doGallery()` → `revealGallery()` 会把 `interior` 分类（和其余分类一起）
  `traverse` 成全可见，所以神龛、长凳、匾额在 **「起廊屋」** 这一步一起出现。
- **匠作模式**：`doFinishAll()` 在 **「收尾」** 先 `revealCat('bridgehead', 12)`，
  再 `revealCat('interior', 20)`。`revealCat()` 现在优先读 `galleryDetailParts.interior`
  （就是本模块的 11 个 `parts`），所以内部陈设是 **11 组、每组间隔 20 ms** 落位的，
  不是整组弹出；`finish()` 随后会调 `updateShadows()`。
- **静态模式** `?built=1` / `?detail`：`buildGallery(true, …)`，`instant=true`，直接可见。
- 结构视图（拱架 / 三节苗 / 五节苗）会藏掉整个 `gallery`，内部陈设跟着消失，这是预期行为。

### 3.2 可选：速览模式也逐组落位

匠作模式已经有 20 ms 的逐组节奏；速览模式仍是整组出现。因为本模块材质是不透明的，
不会跟随 `galleryMats` 淡入，所以它会在「起廊屋」第一帧直接出现。想让它也一组一组落位：

```js
// revealGallery()：跳过 interior 的整组显示
GALLERY_CATS.forEach(function(k){
  if(!galleryGroups[k] || k === 'interior') return;
  galleryGroups[k].visible = true;
  galleryGroups[k].traverse(function(o){ o.visible = true; });
});
// …原有 tween…

// 等廊屋主体落定后（约 900 ms）
setTimeout(function(){
  galleryGroups.interior.visible = true;
  const parts = galleryDetailParts.interior || [];
  parts.forEach(function(p, i){
    setTimeout(function(){
      p.visible = true;
      p.traverse(function(o){ o.visible = true; });
    }, i * 60);
  });
  updateShadows();
}, 900);
```

- 也可以先在 `buildGallery()` 里保存模块对象（`let interior = …`），再直接
  `interior.reveal({stagger:80})`。`reveal()` 会连带把组内 mesh 设可见，
  所以即使调用方之前执行过 `it.group.traverse(o => o.isMesh && (o.visible = false))` 也能显形。
- 静态阴影是 `shadowMap.autoUpdate = false`，逐组显形后补 `updateShadows()`
  （速览模式的 `finish()` 本来就会调一次，但补上更稳）。
- 不改主文件也可以保持现状：功能完整，只是速览模式少了这个节奏。

## 4. 性能

| | 全开（默认） | 无雀替 | 无匾额 | 无长凳 | 只神龛 |
|---|---|---|---|---|---|
| 网格（draw call） | **79** | 71 | 67 | 59 | 30 |
| 三角面 | **1,068** | 972 | 924 | 828 | 424 |
| 材质 / 贴图 | 7 / 1 张 128² | 7 / 1 | 7 / 1 | 7 / 1 | 7 / 1 |

- 材质是 7 个共用材质，即使关掉某组也仍会创建；未用到的不会产生 draw call
  （`stats.materials` 恒为 7，`stats.textures` 为 1）。

- 全部 `castShadow = receiveShadow = true`；阴影 pass 里最多再 +79 个 draw call，
  且只在 `updateShadows()` 后重算一次（静态阴影）。
- 没有 `update()`、没有逐帧分配、没有粒子；构建后零运行时开销。
- 低端机可传 `{textures:false}`（纯色，7 个材质仍在）或按上表关组件；
  移动端若 draw call 吃紧，优先关 `brackets`（8 个）与 `plaques`（12 个），
  神龛和长凳是「有人住过」的主要读数，不建议砍。
- `dispose()` 会释放 79 个几何、7 个材质、1 张贴图；幂等，可在重建廊屋前调用。

## 5. 自检

```
node --check prototype/interior.js
```

构建期用随包 r128 在 Node 里跑过：

- `stats`：79 meshes / 1,068 triangles / 7 materials / 1 texture。
- 包围盒：x ±13.95，y 6.40 … 8.40，z ±2.21；没有一件低于桥面 6.40。
- 与既有构件的 `Box3` 逐件求交（廊柱、横梁、纵梁、旧栏杆、旧长凳、楼阁柱）：
  **0 处 > 2 cm 的相交**。
- 有意的贴合只有两处：匾额销钉进梁底 2 cm；格扇外框嵌进龛身 2 cm。都藏在缝里。
- `reveal()` / `reveal({stagger})` / `hidden` / `parent` / `textures:false` / `dispose()`（幂等）通过。
- 已用 mock 廊屋近景与真实 `index.html?built=1&closeup=1` 各看一遍：
  神龛、格扇、长凳、匾额的位置与遮挡关系正常。

## 6. 注意与取舍

- **净空偏低。** 廊屋横梁底只有 8.38（桥面 6.40 上方 1.98 m），匾额板底在 7.96–8.00，
  离桥面约 1.56–1.60 m。现在没有行人模型和碰撞，视觉上成立；将来做第一人称漫游，
  要么抬高梁架，要么把匾额缩到 0.20–0.24 m 高，或改成贴在梁侧而不是吊在梁下。
- **内部偏暗。** 廊屋有瓦顶，神龛和匾额处在屋顶阴影里，远景看是暖深木色，近景才看清格扇。
  这是现有日光场景的既有明暗关系；若要让内部在广角镜头里也读得出来，
  可加一盏很弱的檐下补光（不放在本模块里，避免改场景光照），或把 `wood` / `woodDark` 提亮一档。
- **匾额没有字。** 按需求只做深色板 + 边框 + 销钉；将来要加「北涧桥」等字样，
  在板心前 1–2 cm 加一张 canvas 文字贴图平面即可，不用改几何。
- **神龛朝向是「面朝桥中线」，不是面朝桥的纵向。** 1.70 m 面宽沿 x（桥长），
  格扇法线朝 -z。这样它靠一侧、留出 2.1 m 走道；若改成面朝 +x/-x，
  要么占掉中央走道，要么得挪到端开间，和「中央神龛」冲突。
- **没有碰撞 / 导航。** 长凳、香案、神龛都只是几何；将来做可行走模式，
  至少要给香案和神龛加碰撞体（香案在中央神龛前 0.05 m）。
- **香案在走道一侧。** 香案中心在 z=0.74、x=0，站在桥中线直行不会撞上；
  但它确实占掉 `z 0.56 … 0.92` 一条。要更空旷可传 `{incense:false}`。
- **不参与结构视图。** 内部陈设没有 `userData.system`，不会被力流上色；
  `applyView()` 藏 `gallery` 时它们跟着消失，这是刻意的（结构视图只看拱）。
- **与桥头屋的显隐关系。** 速览模式里两者都在 `revealGallery()` 的整组 `traverse` 中一起出现；
  匠作模式里 `doFinishAll()` 先 `revealCat('bridgehead', 12)`、再 `revealCat('interior', 20)`，
  所以内部陈设比桥头屋晚约 0.5 s。如果将来把桥头屋拆成独立步骤，内部的 20 ms 节奏可以保留。
- 几何为示意，非测绘比例；木纹是 128² 程序化 canvas，不是真实木材扫描。
