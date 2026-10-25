# 桥头踏步规格 · `prototype/stairs.js`

两岸桥头折返楼梯：把桥台顶（y≈0.26）接到廊屋桥面边缘（y≈6.32），让人能从岸上走到桥上。
独立 classic script，挂 `window.BridgeStairs`，不引外部模型 / 贴图，不依赖构建。

- 交付：`prototype/stairs.js`
- 依赖：页面里的 `vendor/three.min.js`（当前 **r128**）
- 无副作用：不改 `index.html`；只在自己 `dispose()` 时清理自己创建的对象

## 1. API

```js
var stairs = BridgeStairs.build(THREE, opts);
// opts（全部可选）
//   side      : 'both' | 'left' | 'right'（默认 'both'）
//   parent    : 直接挂进去的父节点（默认不挂，自己 scene.add(stairs.group)）
//   hidden    : true 则先全部隐藏，配合 revealStep 逐级显形（默认 false，建好即可见）
//   textures  : false 则不用程序化 canvas 贴图，纯色（默认 true）
//   railing   : false 则不建栏杆（默认 true）
//   baseY     : 楼梯底（默认 0.26 = 桥台顶）
//   topY      : 楼梯顶（默认 6.32 = 桥面板中面）
//   risers    : 总级数（默认 22）
//   stepsLower: 下段级数（默认 11；上段 = risers - stepsLower）
//   stoneColor / stepColor / woodColor : 覆盖石材 / 踏面 / 木栏杆颜色

scene.add(stairs.group);
stairs.reveal();        // 全部显示
stairs.revealStep(5);   // 显示 parts[0..5]（自下而上逐级）；revealStep(-1) 全隐藏
stairs.dispose();       // 幂等：移出父节点 + 释放几何/材质/贴图
```

返回对象：

| 字段 | 说明 |
|---|---|
| `group` | 根节点 `THREE.Group`，名字 `bridge-stairs`，内含 `bridge-stairs-right` / `bridge-stairs-left` |
| `parts` | 有序网格数组，自下而上。`side:'both'` 时两岸按层交错（右第 1 级 → 左第 1 级 → …） |
| `reveal()` | 全部显示 |
| `revealStep(i)` | 显示 `parts[0..i]`；`i < 0` 全隐藏 |
| `dispose()` | 幂等 |
| `config` | `{baseY, topY, risers, riser, treadLower, treadUpper, slopeLowerDeg, slopeUpperDeg, landingMidY, sides}` |
| `stats` | `{meshes, triangles}`，构建后即可读 |
| `coords` / `layout` | 坐标约定与平面布置常量（调试用） |

`parts` 里每个网格都带 `userData.stairPart`（序号）与 `userData.stairLabel`（如 `A-step-3`、`B-parapet-outer-7`、`rail-top-back-rail`）。

## 2. 坐标约定

与 `index.html` / `environment.md` 一致：半跨 `X=14.2`、起拱点 `Y0=0.9`、地面 `GROUND_Y=-2.6`。
下列均为**右岸**（x>0）；左岸按 **x → -x** 镜像。

| 既有构件 | x | y | z |
|---|---|---|---|
| 桥台 | 13.2 … 17.6 | -2.60 … **0.26** | ±3.80 |
| 牛头 | 13.2 … 15.2 | 0.25 … 1.55 | ±3.40 |
| 桥面板 | ±15.675 | 6.24 … **6.40** | ±2.50 |
| 端柱（桥面下） | 14.51 … 14.69 | 1.55 … 6.08 | ±1.90 |
| 廊屋栏杆 | -15 … 15 | 6.95 … 7.05 | ±2.20 |

| 楼梯构件 | x | y | z |
|---|---|---|---|
| 内侧挡墙 | 15.20 … 15.35 | 0.26 … 踏步高+0.30 | 见梯段 |
| 梯段 A（下段，向 **+z** 上行） | 15.35 … 16.30 | 0.26 … 3.29 | **-2.50 … 2.10** |
| 中间墙 | 16.30 … 16.50 | 0.26 … 踏步高+0.30 | 见梯段 |
| 梯段 B（上段，向 **-z** 上行） | 16.50 … 17.45 | 0.26 … 6.32 | **2.10 … -3.60** |
| 外侧挡墙 | 17.45 … 17.60 | 0.26 … 踏步高+0.30 | 见梯段 |
| 中间平台 | 15.20 … 17.60 | 0.26 … **3.29** | 2.10 … 3.80 |
| 顶部平台支撑体 | 15.25 … 16.50 | 0.26 … 6.18 | -3.80 … -2.50 |
| 顶部平台 | **15.00** … 17.60 | 6.18 … **6.32** | -3.80 … -2.50 |

- 楼梯整体落在桥台轮廓内（x 15.20…17.60 ≤ 桥台外缘 17.60；z -3.80…3.80），
  且完全避开牛头（x ≤ 15.20）与端柱（x 14.6）。
- 梯段 B 走在 **x ≥ 16.50**，整段都在桥面 x 轮廓（±15.675）**之外**，所以上段不会钻到桥面底下。
- 梯段 A 最高只到 y 3.29，桥面板底 6.24 → 净空 ≥ 2.9 m。
- 顶部平台内缘 x=15.00 正好对上廊屋栏杆的端头（栏杆 x -15…15），
  进桥洞口 = **x 15.00 … 15.675，宽 0.675 m**，在桥面 z = -2.50 一侧（廊屋尽端是敞口）。

## 3. 踏步数

| 项 | 数值 |
|---|---|
| 总升高 | 6.32 - 0.26 = **6.06 m** |
| 级数 | **22** |
| 踢面（riser） | 6.06 / 22 = **0.27545 m**（≤ 0.28 ✔） |
| 梯段 A | 11 级，踏面（tread）= 4.60 / 11 = **0.4182 m**（≥ 0.30 ✔），斜率 **33.4°** |
| 梯段 B | 11 级，踏面 = 5.70 / 11 = **0.5182 m**（≥ 0.30 ✔），斜率 **28.0°** |
| 中间平台 | 顶 y = 0.26 + 11 × 0.27545 = **3.29 m**，尺寸 2.40 × 1.70 m |
| 顶部平台 | 顶 y = **6.32 m**，尺寸 2.60 × 1.30 m |

- 每级都是**从桥台顶 y=0.26 起算的实心方块**：本级直接坐在桥台上，并与下一级共面贴合，
  没有悬空踏步（下段 33.4° 偏陡，但在可走范围内；上段 28.0°）。
- 折返：由 z=-2.50 沿 +z 上 11 级到中间平台，转身沿 -z 上 11 级到顶部平台，再进桥面。

## 4. 集成步骤（`prototype/index.html`）

> 本次交付**没有改** `index.html`。集成那一轮已经在 `buildGallery()` 里留好了调用点
> （约 1199–1207 行），**只差一行 `<script>` 标签**——没有它 `window.BridgeStairs` 是 undefined，
> `if(window.BridgeStairs)` 会静默跳过，楼梯不会出现。

### 4.1 唯一缺的一步：加 script 标签

`index.html` 现在只有这 5 个：

```html
<script src="vendor/three.min.js"></script>
<script src="vendor/OrbitControls.js"></script>
<script src="copy.js"></script>
<script src="audio.js"></script>
<script src="environment.js"></script>
```

在**主 IIFE 之前**补一行即可（顺序在 `environment.js` 之后）：

```html
<script src="stairs.js"></script>
```

### 4.2 已有的调用点（不用动）

```js
// buildGallery() 里，桥面之前
// 上桥台阶（模块缺失时跳过）
if(window.BridgeStairs){
  try{
    const st = window.BridgeStairs.build(T, {});
    galleryGroups.stairs.add(st.group);
    galleryGroups.stairs.visible = !!instant;
    st.group.traverse(function(o){ if(o.isMesh) o.visible = !!instant; });
  }catch(e){}
}
```

和 `GALLERY_CATS` 里的 `'stairs'` 分类（排在第一位）配合：

- **逐级建造路径**：`doDeck()` 里先 `revealCat('stairs', 40, …)` 再 `revealCat('deck', 45, …)`
  —— 楼梯和桥面一起出现，楼梯先落。
- **`doGallery()` 一次性路径**：`revealGallery()` 会把每个分类 `traverse` 成全可见。
- **静态模式** `?built=1`：`buildGallery(true, false)`，`instant=true`，楼梯直接可见。

> `revealCat('stairs', …)` 按 `galleryGroups.stairs.children` 遍历，而这里只有 1 个子节点（我的根组），
> 所以是「整组弹出 + 缩放 0.7→1」，内部每一级不单独播。想让 22 级一级一级长出来，
> 得改成遍历 `stairs.parts`（用 `revealStep(i)`），见 4.3。

### 4.3 可选：一级一级长出来

```js
const st = BridgeStairs.build(T, { hidden:true });   // 先全隐藏
galleryGroups.stairs.add(st.group);
// 展开时（例如 doDeck 里）
st.parts.forEach(function(m, i){
  setTimeout(function(){
    m.visible = true;
    m.scale.setScalar(.72);
    tweenNum(m.scale, 'x', 1, .18, easeOut);
    tweenNum(m.scale, 'y', 1, .18, easeOut);
    tweenNum(m.scale, 'z', 1, .18, easeOut);
  }, i * 40);
});
// 或直接 st.revealStep(i)
```

### 4.4 为什么挂在 `galleryGroups.stairs` 而不是 `site`

楼梯几何上属于桥台，但集成时挂进了廊屋分组，好处是跟着廊屋一起显形 / 淡入；
代价是它会在 `bridge` 组里 —— `bridge` 在「拆架 / 压载」时整体微沉 0.07 m，
所以楼梯会跟着沉 7 cm。视觉上可以忽略（楼梯底坐在桥台顶，下沉 7 cm 会轻微吃进桥台），
要完全避免就把 `parent` 传 `site`，别用 `galleryGroups.stairs.add()`。

### 4.5 结构视图不受影响

「全部 / 拱架 / 三节苗 / 五节苗」只遍历 `bridge` 里带 `userData.system` 的构件，
楼梯没有 `userData.system`，不会被误隐藏或误上色。

## 5. 性能

| | 单侧 | 两侧（默认） | 两侧 + 无栏杆 |
|---|---|---|---|
| 三角面 | 1,056 | 2,112 | 1,560 |
| 网格（draw call） | 88 | 176 | 130 |
| 材质 | 3（共用） | 3 | 3 |
| 贴图 | 2 × 256² canvas | 同 | 0（纯色） |

- 三角面很低（全 BoxGeometry）；成本主要在 **draw call**：默认 +176 个网格。
  移动端或想省 draw call，可传 `{side:'both', railing:false}`（130）或只做一侧（88）。
- 3 个材质全侧共用（石材 / 踏面 / 木栏杆），2 张程序化 canvas 贴图随 `dispose()` 释放。
- 全部 `castShadow = receiveShadow = true`，会进阴影 pass。场景阴影是**静态**的
  （`shadowMap.autoUpdate=false`，只在有 tween 时刷新），所以：
  逐级建造路径靠 `revealCat` 的缩放 tween 触发刷新；静态模式 `buildStatic()` 末尾本来就有
  `updateShadows()`。若自己手动 `parent.add(group)`，记得补一次 `updateShadows()`。
- 无逐帧分配、无动画、无 `update()`。

## 6. 注意与已知取舍

- **要生效必须先加 `<script src="stairs.js"></script>`**（见 4.1）。调用点已经在了，
  但标签没加，`if(window.BridgeStairs)` 会静默跳过——这是目前唯一的「不显示」原因。
- **楼梯挂进了 `bridge`**（经 `galleryGroups.stairs`），所以「拆架 / 压载」时那 0.07 m 微沉会带上它。
  想彻底不跟着沉，就改用 `parent: site`。
- **落脚点是桥台顶（0.26），不是水边滩地。** 紧邻桥台的河岸在 |x|≈17.8 处只有 y≈-2.58，
  岸坡要到 |x|≈25.4 才抬到 0.26。所以人是从 |x|≈25 的岸台走过来、再上桥台顶；
  桥台外沿到岸坡之间那 2.8 m 的高差（桥头台地 / 挡墙）**不在本层范围**，
  要让整条路都走得通，得再补一段岸坡整治或台阶。
- **进桥洞口宽 0.675 m**：廊屋栏杆在 |x|=15 结束，桥面伸到 15.675，正好留出这个缺口。
  想更宽，要改 `index.html` 里那两根 30 m 长的栏杆（把端头往里收）。
- **楼梯顶 6.32 是桥面板中面**，桥面板顶在 6.40，所以上桥时还有 **0.08 m 门槛**——
  那就是桥面板自己的厚度，不是悬空台阶。若要齐平，把 `topY` 传 6.40 即可
  （此时踢面 6.14/22 = 0.2791，仍 ≤ 0.28）。
- **下段 33.4° 偏陡**（上段 28.0°）。想更缓就要更长进深：桥台进深只有 7.6 m，
  折返两跑已经是这个轮廓里能拿到的最缓方案；单跑（7.2 m 跑 22 级）会到 40°。
- **只做几何，不做碰撞 / 行走模拟**：没有导航网格，人不能真的走上去，只是「看着能走」。
- **没有桥头屋**。`PLAN.md` 里「桥头屋与楼梯」的另一半（廊亭 / 桥头屋）仍未做；
  真做桥头屋时，它会和楼梯抢 x≈16…18 这块地，需要重新校高度（`environment.md` 第 6 节也提过）。
- **两岸是镜像**，没有做「东高西低」的高差（`PLAN.md` 考据清单里廊屋分间的高差还没核）。
- 几何为示意，非测绘比例；材质是程序化 canvas，不是真实石材贴图。

## 7. 自检

```
node --check prototype/stairs.js
```

构建期已用随包 r128 在 Node 里跑过一遍（`Box3` 逐件求交）：

- 22 级踏步高度严格 = 0.26 + i×0.27545，底全部落在 0.26（**无悬空踏步**）；相邻踏步面贴合。
- 楼梯与**桥面板、牛头、端柱、廊屋栏杆**均无体积相交（只在顶部平台与桥面 z=-2.50 处相邻）。
- 内部相交只剩预期接头：挡墙转角、栏杆埋进挡墙、顶部平台压住梯段 B 顶两级。
- `reveal()` / `revealStep(i)` / `revealStep(-1)` / `dispose()`（幂等）/ `parent` / `hidden` / `textures:false` / 单侧 均通过。
