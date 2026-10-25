# 精细材质层规格 · `prototype/precision-materials.js`

把木头、青瓦、石材从「纯色 + 一张灰纹理」抬到 2–5 m 近景能读的级别：albedo + normal + roughness 三张图全部现场程序化生成。
独立 classic script，挂 `window.BridgeMaterials`，不引外部图片 / 模型，不依赖构建。

- 交付：`prototype/precision-materials.js`
- 依赖：页面里的 `vendor/three.min.js`（当前 **r128**：`sRGBEncoding` / `CanvasTexture` / `DataTexture`）
- 无副作用：不改 `index.html`；只写自己的缓存，`dispose()` 只清理自己创建的贴图
- 贴图上限 **512²**，POT，双轴严格无缝；albedo 走 sRGB，normal / roughness 走线性

```js
node --check prototype/precision-materials.js   // 必须通过
```

## 1. API

```js
BridgeMaterials.wood(THREE, hex, opts)   // → MeshStandardMaterial
BridgeMaterials.tile(THREE, opts)        // → MeshStandardMaterial
BridgeMaterials.stone(THREE, opts)       // → MeshStandardMaterial
BridgeMaterials.upgrade(THREE, material, kind, opts)  // → 克隆后的 Material
BridgeMaterials.dispose()                // 释放全部缓存贴图
BridgeMaterials.stats()                  // 纹理数 / 估算显存 / 中间场
```

`wood` 的 `opts`（全部可选）：

| 参数 | 默认 | 说明 |
|---|---|---|
| `roughness` | `0.82` | 目标粗糙度。贴图均值 0.88，材质 roughness 会自动除以它做补偿 |
| `grainScale` | `1` | 年轮疏密。`1` ≈ 每张贴图 7 圈；0.4–3 |
| `knots` | `2` | 节疤数量，0–6。**参与缓存 key**：`knots:0` 会另生成一套法线/粗糙 |
| `repeat` | `[2, 2]` | 数字或 `[x, y]`；**参与缓存 key** |
| `size` | `512` | 64–512，取不超过它的 2 的幂 |
| `anisotropy` | `4` | 1–16，默认取自 `BridgeMaterials.defaults.anisotropy` |
| `normalScale` | `0.9` | 法线强度系数（贴图本身已有正确的凹凸幅度） |
| `grainAxis` | `'v'` | 木纹方向。`'v'` 沿构件长度（默认）；`'u'` 横纹，用于板材或对齐旧 `WOOD_TEX` |
| `seed` | `20261022` | 噪声种子，参与缓存 key |

`tile` / `stone` 额外收 `color`（tile 默认 `#404A50`，stone 默认 `#9A9286`）；`tile` 默认 `repeat:[10,2]`，`stone` 默认 `[2,2]`。

`upgrade` 的 `kind`：`'wood' | 'tile' | 'stone'`。保留原 `color` 与 `map`，只补 `normalMap` / `roughnessMap`，并清掉旧 `bumpMap`（避免和 normal 叠加）。
`upgrade` 里 `repeat` 是**乘在原 map 上的倍率**；默认 wood/stone 为 `[1,1]`，tile 为 `[1,2]`（见 §6）。

`stats()` 返回 `{textures, approxBytes, fieldBytes, details, albedos, fitted}`。

贴图在**首次调用**时同步生成并进入缓存（不预生成、不联网）：建 7 种木料只会生成 1 套法线/粗糙 + 7 张 albedo，后面任何同 key 调用都直接命中。

## 2. 每张图里画了什么

| 类别 | 高度场 | albedo | roughness |
|---|---|---|---|
| 木 | 年轮（竖向窄晚材线 + 交界细黑线）、纤维、管孔、两个椭圆节疤（相位高斯包 → 闭合涡纹） | 色号烘焙 + 晚材变深 + 冷暖偏移 + 凹处散射提亮 | 晚材/节疤略粗，其余 0.88±0.10 |
| 瓦 | 竖向瓦垄（每 4 垄一道高起的筒瓦）、每垄横向搭接线（随噪声轻微弯曲）、垄沟 | 深蓝灰 + 每瓦/每垄微差 + 垄背受光 + 瓦头亮边 + 沟内苔痕 | 0.88±0.10，垄沟/搭接线更粗 |
| 石 | 大色斑 + 细颗粒 + 矿粒 + 稀疏麻点（凹坑） + 极弱层理 | 暖灰 + 色斑 + 坑内变暗 | 0.88±0.10，坑边更粗 |

三张图共用同一个高度场，所以「看到的纹」和「摸到的凹凸」对齐。

## 3. 替换现有 `MAT_*`

`index.html` 里的对应关系（**未改动该文件**，下面是接线建议）：

| 现有 | 现在怎么来的 | 替换成 |
|---|---|---|
| `MAT_SAN` | `woodMat(0xb08f63)` | `wood(T, 0xb08f63, {roughness:.8, repeat:[1.6,2.4]})` |
| `MAT_WU` | `woodMat(0x7d3b28)` | `wood(T, 0x7d3b28, {roughness:.82, repeat:[1.6,2.4]})` |
| `MAT_HEAD` | `woodMat(0x2e251d, .9)` | `wood(T, 0x2e251d, {roughness:.9, repeat:[1.6,2.4]})` |
| `MAT_JOINT` | `woodMat(0x32281f, .8)` | `wood(T, 0x32281f, {roughness:.85, repeat:[1.6,2.4]})` |
| `MAT_SCISSOR` | `woodMat(0x5a3b2b, .9)` | `wood(T, 0x5a3b2b, {roughness:.88, repeat:[1.6,2.4]})` |
| `MAT_DECK` | `woodMat(0x6b4c31, .88)` | `wood(T, 0x6b4c31, {roughness:.88, repeat:[1.6,2.4]})` |
| `MAT_GAL` | `woodMat(0x46311f, .9)` | `wood(T, 0x46311f, {roughness:.9, repeat:[1.6,2.4]})` |
| `MAT_STONE` | `mat(0x3b342c, .95)` | `stone(T, {color:0x9a9286, repeat:[2,2]})` |
| `MAT_ROOF` | `mat(0x453f37, .92)` + `TILE_TEX` | `tile(T, {color:0x404a50, repeat:[10,2]})` |
| `MAT_PROP` | 半透明脚手架 | 保留纯色（半透明不该叠 normal） |

接线（`index.html` 里约 10 行）：

```html
<script src="vendor/three.min.js"></script>
<script src="precision-materials.js"></script>   <!-- 放在主 IIFE 之前 -->
```

```js
const BM = window.BridgeMaterials;
BM.defaults.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

const MAT_SAN  = BM.wood(T, 0xb08f63, {roughness:.8,  repeat:[1.6,2.4]});
// …其余木料同 repeat[1.6,2.4]，这样法线/粗糙度贴图全员共享
const MAT_ROOF = BM.tile(T,  {color:0x404a50, repeat:[10,2]});   // 不要再赋 TILE_TEX
const MAT_STONE= BM.stone(T, {color:0x9a9286, repeat:[2,2]});
```

替换后 `WOOD_TEX`、`TILE_TEX`、`woodTexture()`、`tileTexture()`、`woodMat()` 都不再被引用，可一并删掉（省约 1.75 MB 显存）。

`MAT_ROOF` 的 `side = DoubleSide` 由 `buildGallery()` 在克隆上设置，保持不变；`makeSegment()` 的逐根 `color.multiplyScalar(0.9–1.08)` 仍然有效（白底 × 亮度微差）。

## 4. 尺寸与显存

单张 512² RGBA + 完整 mip 链：`512×512×4×4/3 ≈ 1.398 MB`（≈1.33 MiB）。
256² 为 0.349 MB，128² 为 0.087 MB。

推荐替换集实测（7 种木色共用一个 repeat、木/瓦/石各一套）：

| 项 | 张数 | 小计 |
|---|---|---|
| 木材 detail（normal + rough，7 色共享） | 2 | 2.80 MB |
| 木材 albedo（7 色） | 7 | 9.79 MB |
| 青瓦 detail + albedo | 3 | 4.19 MB |
| 石材 detail + albedo | 3 | 4.19 MB |
| **合计** | **15** | **≈ 21.0 MB** |

另有 CPU 侧中间场（每套 detail 的 `tone` + `hue` 各 512² 字节，约 0.5 MB/套）：推荐集 3 套约 1.5 MB，`dispose()` 一并释放。

每多一种 **repeat** 或 **knots** 取值，就多一套 detail（+2.8 MB）。所以：
- 全桥木料尽量共用一个 `repeat`，不要一根一个值；
- 小构件（木销/关节）想要更细的纹理，用 `size:256` 单独一套，别改 repeat；
- `knots:0` 只给不需要节疤的小件时，也按“多一套 detail”计费。

移动端：`size:256` 时同一套降到 **≈ 5.2 MB**，生成耗时约 1/4。建议按 `matchMedia('(max-width:760px)')` 二选一。

## 5. 性能

Node 22 实测（无 GPU，纯生成；浏览器 V8 同量级）：

| 操作 | 耗时 |
|---|---|
| 第一块木料（wood detail 512² + 1 张 albedo） | **≈ 95 ms** |
| 同 repeat 的每多一种木色（只生成 albedo） | **≈ 2–5 ms** |
| 换一套 detail（改 repeat / knots / grainScale，+2 张图） | **≈ 40–55 ms** |
| 青瓦（detail + albedo） | **≈ 55 ms** |
| 石材（detail + albedo） | **≈ 55 ms** |
| `upgrade`（detail 已存在时只做贴图适配） | **< 1 ms** |
| 上面推荐的整套 15 张 | **≈ 210 ms** |

耗时主要在高度场（每像素 5–10 次可平铺噪声），albedo 只是同一套场的重着色，所以 7 种木色几乎不加时间。

- 一次性、同步，发生在建材质时。放在 `buildPreview()` / `buildStatic()` 之前，不要塞进动画帧。
- 绘制调用不增加：仍是每种材质一组；每材质多采 1 张纹理（原来 map + bump 两张，现在 map + normal + rough 三张）。
- 不写阴影贴图、不改 renderer 设置；normal map 不参与 shadow pass。
- 三张图都开 mipmap + 各向异性（默认 4），远处不会闪烁；`RepeatWrapping` 全程开启。

## 6. 近景与远景

**2–5 m 近景**：年轮线宽 ≈ 1–2 px（512 图、7 圈）、管孔 2–3 px；瓦垄 64 px/垄、搭接线 5–8 px；石麻点 4–10 px。`repeat:[1.6,2.4]` 下，木料 1 张贴图 ≈ 0.67 m（周向）/ 1–4 m（轴向，随构件长度）；`tile repeat:[10,2]` 下 1 张贴图 ≈ 3.2 m × 2 m。这个比例是照相机最近 22 m、节点特写 2 m 调的。

**50 m 远景不露平铺**：

1. 噪声按整数周期取模（`noise2(x, y, px, py)`），上下左右严格无缝；两张图的 2×2 拼贴验收过。
2. 低频变化（风化、色斑、垄沟苔痕）压得很低（±5–10%），即使重复也读不出「同一块」。
3. `repeat` 建议取非整数（如 `1.6 / 2.4`），相邻构件的接缝不落在同一条视线上。
4. `makeSegment()` 本来就有逐根 ±9% 的明度抖动，保留了它，等于给每根木头再打散一次。
5. 各向异性 + mipmap 让远处的瓦垄并成灰面，而不是摩尔纹。

## 7. 注意与已知取舍

- **颜色是烘进 albedo 的，材质 `color` 恒为白色。** `material.color.set(0x…)` 只能做乘法染色，不会重新生成纹理；要换木色请再调用 `wood()`（同 repeat 下只多一张 albedo）。
- **粗糙度是乘出来的。** `roughnessMap` 均值 0.88，`material.roughness = opts.roughness / 0.88`。直接改 `material.roughness` 会让整体偏亮/偏哑；要么改 `opts.roughness`，要么按同一公式换算。
- **贴图实例是共享的。** 同 key 的材质共用同一张 `map` / `normalMap` / `roughnessMap`。不要在材质上直接改 `map.repeat/offset`（会波及同 key 的所有材质），用 `opts.repeat` 或自己 `texture.clone()`。
- **`repeat` / `knots` / `grainScale` / `grainAxis` / `size` / `anisotropy` / `seed` 都在缓存 key 里。** 多一个取值就多一套贴图，先规划再接线。
- **`upgrade` 的 tile 默认 1×2**：旧 `TILE_TEX` 是 16 道横垄 / 8 列，本层是 8 行 / 8 垄，乘 2 后横垄才对得上。换成自己的 albedo 时显式传 `repeat`。`upgrade` 会清掉 `bumpMap`（原 `WOOD_TEX` 的 bump），避免双重扰动。
- **`upgrade(..., 'wood')` 默认横纹（`grainAxis:'u'`）**，因为旧 `WOOD_TEX` 的纹是横的；`wood(t, hex)` 自己默认竖纹（沿构件长度）。给横纹板材建新材质时记得传 `grainAxis:'u'`，否则纹理会和开料方向不符。
- **屋顶 UV 是整片 0–1。** `roofSurface()` 的 u/v 不分尺寸，所以主屋面（32 m）和中央楼阁（7.2 m）共用一个材质时，楼阁上的瓦垄会变密约 4 倍。楼阁若进近景，给它单独克隆一个材质并把 `repeat.x` 收到 2.5–3。
- **镜像屋面（`mainB.scale.z = -1`）法线会翻。** 负缩放让切空间 Y 反向，近看那半边屋顶的凹凸是反的。要较真就给那半边单独克隆材质并设 `normalScale.y = -1`，或者用翻转 UV 的第二块几何替代负缩放。
- **半透明不要叠**：`MAT_PROP` 这类 `transparent + opacity` 的材质加 normal map 会在排序时闪，保持纯色。
- **生成必须在 DOM 之后。** 模块内部用 `document.createElement('canvas')`；放在 `<head>` 里同步执行会拿不到完整 document。
- **`dispose()` 之后材质仍持有引用**：three 会从 canvas / typed array 重新上传。要真正释放，先移除网格、`material.dispose()`，再 `BridgeMaterials.dispose()`。
- **只对 r128 负责**：用的是 `texture.encoding = THREE.sRGBEncoding`（不是 `colorSpace`）、`MeshStandardMaterial`、`DataTexture`。升 r152+ 需要把 `encoding` 换成 `colorSpace`、`sRGBEncoding` 换成 `SRGBColorSpace`。
- 没有 AO / detail map / parallax：再近（<1 m）会看到 512 的像素极限；这个原型的最近机位是节点特写约 2 m，够用。
- 没有 envMap：高光只来自现场几盏灯，粗糙度变化在暗部不明显；这是当前光照决定的，不是贴图问题。

## 8. 自检

```
node --check prototype/precision-materials.js
```

本次交付额外在 Node 里用 canvas/THREE 桩跑过：

- 7 色木 + 瓦 + 石：`stats()` = 17 张 / 23.8 MB（比 §4 的 15 张多一套 wood detail，来自 `knots:0` 对照），构建 ≈ 260 ms；
- 木/瓦 albedo 各做 2×2 拼贴，接缝处无色阶断口；
- `upgrade()` 保留 `color` 与 `map`、清掉 `bumpMap`、`normalMap.repeat` 正确继承原 map；
- 生成的 7 张关键图逐张看过（512²）：木纹有年轮、管孔、节疤；瓦有竖垄与横搭接；石有麻点与色斑。

没有在真实 WebGL 里出图（本机无头环境未接浏览器）；法线方向按 `flipY=false` + `n = normalize(-dh/du, -dh/dv, 1)` 推导，若接入后发现凹凸是反的，优先检查这一步与镜像屋面。
