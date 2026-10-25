# 东岸桥头屋规格 · `prototype/bridgehead.js`

东岸（x > 0）两层木构桥头屋：石台基 + 敞廊 + 二层格扇窗 / 挑台 + 歇山式（两坡）瓦顶带翘角。
独立 classic script，挂 `window.BridgeHead`，不引外部模型 / 贴图，不依赖构建。

- 交付：`prototype/bridgehead.js`
- 依赖：页面里的 `vendor/three.min.js`（当前 **r128**）
- 无副作用：不改 `index.html`；只在自己 `dispose()` 时清理自己创建的对象
- 尺寸：台基 **5.0 × 6.1 m**，含出檐 **5.73 × 6.76 m**，总高 **6.32 m**

## 1. API

```js
var bh = BridgeHead.build(THREE, opts);
// opts（全部可选）
//   parent    : 直接挂进去的父节点（默认不挂，自己 scene.add(bh.group)）
//   hidden    : true 则先全部隐藏，配合 revealStep 逐件显形（默认 false，建好即可见）
//   textures  : false 则不用程序化 canvas 贴图，纯色（默认 true；Node 下无 document 也自动降级）
//   stoneColor / woodColor / woodDarkColor / woodLightColor / tileColor / tileDarkColor
//             : 覆盖石材 / 木构 / 深色木枋 / 浅色柱 / 瓦面 / 正脊颜色

scene.add(bh.group);
bh.reveal();          // 全部显示
bh.revealStep(12);    // 显示 parts[0..12]（自下而上）；revealStep(-1) 全隐藏
bh.dispose();         // 幂等：移出父节点 + 释放几何/材质/贴图
```

返回对象：

| 字段 | 说明 |
|---|---|
| `group` | 根节点 `THREE.Group`，名字 `bridgehead-east` |
| `parts` | 有序网格数组，自下而上（按世界包围盒 `min.y` 排序；屋面 / 正脊强制排最后） |
| `reveal()` | 全部显示 |
| `revealStep(i)` | 显示 `parts[0..i]`；`i < 0` 全隐藏 |
| `dispose()` | 幂等；同一材质 / 几何 / 贴图只释放一次 |
| `config` | `{baseY, footprint, totalHeight, stories, groundHeight, upperHeight, roofSpan, roofDepth}` |
| `stats` | `{meshes, triangles}`，构建后即可读（当前 **95 / 1,234**） |
| `coords` | 坐标常量（调试用） |

`parts` 里每个网格都带 `userData.bridgeheadPart`（序号）与 `userData.bridgeheadLabel`
（如 `plinth`、`ground-post-1-2`、`balcony-bracket-3`、`lattice-window-2`、`roof-west`、`ridge-cap`）。

## 2. 坐标与高度

与 `index.html` / `stairs.js` 一致。只做东岸，左岸不镜像。

### 2.1 与既有构件的关系

| 既有构件 | x | y | z |
|---|---|---|---|
| 岸台（`stairs` 分类里的石台） | 17.10 … 23.30 | -0.26 … **0.26** | ±3.20 |
| 桥面板 | ≤ **15.675** | 6.24 … 6.40 | ±2.50 |
| 桥头踏步（`stairs.js`） | 15.20 … **17.60** | 0.26 … 6.32 | -3.80 … 3.80 |
| 桥台 | 13.20 … 17.60 | -2.60 … 0.26 | ±3.80 |

### 2.2 桥头屋自身

| 构件 | x | y | z |
|---|---|---|---|
| 石台基 | 18.10 … 23.10 | **0.26** … 0.62 | -3.05 … 3.05 |
| 台基压顶 | 18.06 … 23.14 | 0.56 … 0.64 | -3.09 … 3.09 |
| 入口石步 | 17.78 … 18.10 | 0.26 … 0.47 | -1.05 … 1.05 |
| 敞廊地面 | 18.20 … 23.00 | 0.64 … 0.72 | -2.96 … 2.96 |
| 敞廊柱（8 根） | 18.45 / 22.75 | 0.64 … 3.16 | ±2.70 / ±0.90 |
| 柱头额枋 | 18.36 … 22.84 | 2.96 … 3.12 | 见构件 |
| 二层楼板 | 18.10 … 23.10 | 3.16 … 3.32 | -3.02 … 3.02 |
| 挑台（朝桥 -x） | 17.74 … 18.28 | 3.16 … 3.30 | -2.86 … 2.86 |
| 挑台栏杆顶 | 17.76 … 17.84 | 4.06 … 4.14 | -2.90 … 2.90 |
| 二层墙身 | 18.24 … 22.96 | 3.32 … 5.30 | -2.88 … 2.88 |
| 前檐格扇窗（3 樘） | 18.232（贴面） | 3.98 … 5.08 | 宽 1.0，中心 -1.90 / 0 / 1.90 |
| 两山格扇窗（4 樘） | 中心 19.55 / 21.65 | 3.98 … 5.08 | ±2.885（贴面） |
| 瓦顶（含出檐） | 17.74 … 23.46 | 5.12 … 6.46 | -3.34 … 3.34 |
| 正脊 | 20.60 | 6.46 | -3.34 … 3.34 |
| 正脊压顶 | 20.48 … 20.72 | 6.46 … **6.58** | -3.38 … 3.38 |

### 2.3 层高

| 项 | 数值 |
|---|---|
| 台基顶（= 岸台顶） | **0.26** |
| 敞廊地面 | 0.64（台基压顶面） |
| 敞廊净高 | 3.16 - 0.64 = **2.52 m** |
| 二层楼板 | 3.16 … 3.32（厚 0.16） |
| 二层墙身净高 | 5.30 - 3.32 = **1.98 m** |
| 檐口（未翘） | 5.12；在墙线 x=18.24 处约 **5.31** |
| 正脊 | 6.46 |
| 压顶顶面（总高） | **6.58 - 0.26 = 6.32 m** |

> 总高 **6.32 m 正好等于桥面板中面 6.32**（板顶 6.40）。
> 屋脊与桥面同高，从桥面看过去，桥头屋的上层窗和瓦顶就在视线高度上。

### 2.4 避让校核

- 桥面板外缘 **15.675** → 桥头屋最西侧（搏风板外皮）**17.735**，净距 **2.06 m**。
- 踏步外缘 **17.60** → 桥头屋最西侧 **17.735**，净距 **0.135 m**；两者不相接，也不留可走的缝。
- 台基完全落在岸台顶面内：西 1.00 m、东 0.20 m、南北各 0.15 m。
- 挑台 / 瓦顶在 z 方向出到 ±2.86 / ±3.34，超出岸台 ±3.20，但底面最低 3.16，**不占岸台体积**。
- Node 里用 `Box3` 逐件求交（容差 1e-4）：与桥面板、踏步、岸台、桥台**均无体积相交**；
  所有构件最低点 = **0.26**，没有悬空、没有埋进岸台。

## 3. 构造拆解

自下而上：

1. **石台基**：台基体 + 压顶 + 入口石步。
2. **敞廊**：木地面、8 根柱（两列四行）、柱头额枋、两道穿枋、后檐填充墙。前檐与两山敞开。
3. **楼板**：3 道楼板搁栅 + 整块楼板（3.16 … 3.32）。
4. **挑台**：4 根斜撑托住挑台地板，挑台朝 -x（桥的方向）；栏杆 5 根立柱 + 上下枋 + 4 片木格扇。
5. **二层墙身**：后墙、两山墙、前檐槛墙 / 窗上枋 / 4 道窗间柱、4 根角柱；前檐 3 樘格扇窗。
6. **山墙**：两片带厚度三角山墙 + 山尖小格扇窗；两山各 2 樘格扇窗。
7. **瓦顶**：檐口垫板、4 根檐下斜撑、两坡曲面瓦（`t^0.80` 凹曲面 + 檐口起翘 + 四角起翘）、
   4 道檩条（压在瓦面下）、两山搏风板（各 4 段）、正脊压顶。

`parts` 排序：先按 `Box3.min.y` 自下而上；屋面 / 正脊 / 搏风板用 `userData.revealY`
强制排到最后，避免「檐口最低点 5.24」把屋面排到檩条（5.16）前面。

## 4. 集成到 `prototype/index.html`

> 本次交付**没有改** `index.html`。按下面 4 步接进去即可。

### 4.1 加 script 标签

在 `stairs.js` 之后、主 IIFE 之前：

```html
<script src="stairs.js"></script>
<script src="bridgehead.js"></script>
```

### 4.2 加分类

```js
const GALLERY_CATS = ['stairs','deck','support','columns','beams','rails','purlins','rafters','roof','pav','bridgehead'];
```

`base` 里补一项（**必须补**：`buildGallery` 的循环会对每个 cat 取 `base[k]`）：

```js
const base = {
  // ...
  pav: MAT_GAL.clone(),
  bridgehead: MAT_GAL.clone()   // 只为满足循环；桥头屋实际用自己的材质
};
```

> `galleryMats.bridgehead` 不会被贴到桥头屋上。桥头屋是自带 7 个材质的独立组，
> 因此它**不参与** `galleryMats` 的透明淡入，而是靠 `parts` 逐件显形。

### 4.3 在 `buildGallery()` 里建

在楼梯 / 两岸石台之后加（顺序不影响渲染）：

```js
// 东岸桥头屋（模块缺失时跳过）
if(window.BridgeHead){
  try{
    const bh = window.BridgeHead.build(T, {});
    galleryGroups.bridgehead.add(bh.group);
    galleryGroups.bridgehead.visible = !!instant;
    bh.group.traverse(function(o){ if(o.isMesh) o.visible = !!instant; });
    galleryBridgehead = bh;
  }catch(e){}
}
```

在 `let gallery = null, galleryMats = null, galleryGroups = null, galleryRoof = null;` 附近补：

```js
let galleryBridgehead = null;
```

### 4.4 详细流程「收尾」逐件显形

`doFinishAll()` 现在先 `gallery.traverse(... visible = true)`。要在收尾时让桥头屋自下而上长出来，
在 `setGalleryOpaque()` 之后、`showToast(...)` 之前插：

```js
if(galleryBridgehead){
  galleryBridgehead.revealStep(-1);          // 先全部藏起来
  const bh = galleryBridgehead;
  bh.parts.forEach(function(m, i){
    setTimeout(function(){ m.visible = true; }, i * 12);
  });
}
```

- 95 件 × 12 ms ≈ **1.14 s**，仍落在收尾现有的 1400 ms 窗口内。
- 不要在每一件里调 `updateShadows()`——阴影是静态的，逐件刷新会白白多跑 95 次 shadow pass。
  `finish()` 末尾本来就有一次 `updateShadows()`，够用。

### 4.5 其余路径

| 路径 | 行为 |
|---|---|
| 速览 `doGallery()` → `revealGallery()` | `GALLERY_CATS` 已含 `bridgehead`，整组直接可见；不播逐件动画 |
| 匠作「收尾」 | 4.4 的 12 ms 逐件显形 |
| `?built=1` → `buildGallery(true, …)` | `instant = true`，建好即全可见；`buildStatic()` 末尾会刷新阴影 |
| 模块缺失 | `if(window.BridgeHead)` 静默跳过，`galleryGroups.bridgehead` 留空组，不报错 |

### 4.6 为什么挂在 `gallery`（= `bridge`）而不是 `site`

桥头屋必须和**岸台**保持同一高度。岸台在 `galleryGroups.stairs` 里，跟着 `bridge` 走；
压载后 `bridge.position.y = -0.02`（不是 0），岸台顶面因此在世界坐标 0.24。
桥头屋也挂在 `gallery` 下，基底同样落到 0.24，**相对接触不变**。

若把桥头屋改挂 `site`（模块支持 `parent: site`），它会停在 0.26，而岸台在 0.24，
看上去会浮起 2 cm。要改就两边一起改：岸台搬到 `site`，桥头屋也用 `parent: site`。

## 5. 性能

| | 数值 |
|---|---|
| 网格（主 pass draw call） | **95** |
| 三角面 | **1,234** |
| 材质 | 7（石材 / 木 / 深木 / 浅木 / 瓦 / 深瓦 / 窗） |
| 程序化贴图 | 4（石 256²、木 256²、瓦 256²、格扇 128²） |
| 投影 caster | **82**（13 片窗 / 栏板贴面 `castShadow=false`） |
| 每帧 CPU | 0（无 `update()`、无逐帧分配） |

- 全 BoxGeometry / PlaneGeometry + 2 片 9×9 网格瓦面，三角面很低；成本主要在 **draw call**。
  在现有廊屋约 245 次的基础上再加 95 次，桌面无压力，低端移动端要留意。
- 要省 draw call，按收益排序：
  1. 去掉两山搏风板（16 件）→ 79；
  2. 去掉两山格扇窗（4 件）→ 75；
  3. 挑台栏板改整片（4 → 1）→ 72；
  4. 敞廊柱 8 根减到 4 根 → 68。
- 阴影是静态的（`shadowMap.autoUpdate=false`），只在 `updateShadows()` 时进 shadow pass；
  逐件显形期间不刷新，收尾结束统一刷一次。
- `dispose()` 对几何 / 材质 / 贴图去重后释放，重复调用安全。

## 6. 注意与取舍

- **台基是 5.0 × 6.1，不是 5 × 7。** 岸台进深只有 z ±3.20（6.4 m），做 7 m 台基会越出岸台；
  含出檐的瓦顶是 5.73 × 6.76，视觉上仍是「5 × 7 左右」的体量。要真做 7 m，得先把岸台 z 加到 ±3.6。
- **与踏步留 0.135 m 缝**，不连接。桥头屋是岸上的建筑，不是跨在踏步上的门楼；
  进桥仍走踏步顶部平台（x 15.00 … 15.675 的 0.675 m 洞口）。
- **二层地面在 3.16，不从桥面 6.32 进入。** 它是一层的室内楼板，不是桥面标高；
  总高 6.32 是屋脊与桥面齐平，不是二层楼面与桥面齐平。
- **敞廊没有门、没有室内陈设**；后檐有一片填充墙，前檐与两山敞开。
- **只做东岸**，西岸不镜像；两岸高差没有做。
- **窗是贴面**（`PlaneGeometry` + 程序化格扇纹理），不是真的窗洞；从极近距离侧看会看出是平面。
- **材质是程序化 canvas**，不是真实石材 / 杉木 / 小青瓦扫描；颜色按场景的暖光 + ACES 调过。
- **显形后要刷一次阴影**：模块拿不到 renderer，`reveal()` / `revealStep()` 不会自己调
  `updateShadows()`。集成路径由 `finish()` 兜底；单独用时手动补一次。
- **结构视图**：桥头屋没有 `userData.system`，不会被「拱架 / 三节苗 / 五节苗」误隐藏或上色；
  但它在 `gallery` 组里，切到「拱架」隐藏整座廊屋时会一起消失——和楼梯、岸台一致。

## 7. 自检

```
node --check prototype/bridgehead.js
```

构建期在 Node（r128，`textures:false`）里跑过：

- 包围盒 x 17.735 … 23.465、y 0.260 … 6.580、z -3.380 … 3.380；总高 **6.320**。
- 95 件全部最低点 ≥ 0.26，最低点严格 = 0.26；无悬空。
- 与桥面板 / 踏步 / 岸台 / 桥台 `Box3` 求交均为 **0**（容差 1e-4）。
- `parts` 的 `min.y` 自下而上；屋面 / 正脊按 `revealY` 排在最后。
- `reveal()` / `revealStep(i)` / `revealStep(-1)` / `dispose()`（两次）/ `hidden` /
  `textures:false` / `parent` 均通过。
- 浏览器预览（`three r128` + 静态阴影）确认：瓦垄、格扇、挑台、敞廊、翘角均正常，无穿模、
  无 z-fighting、无贴图丢失。
