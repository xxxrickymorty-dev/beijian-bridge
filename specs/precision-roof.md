# 精确屋瓦层规格 · `prototype/precision-roof.js`

把「一片瓦顶」从一张曲面细化成：**实体瓦垄 + 起翘脊梁 + 封檐板 + 可选脊端剪影**。
独立 classic script，挂 `window.BridgeRoofDetail`，只做几何：不建场景、不碰 DOM / 灯 / 相机。

- 交付：`prototype/precision-roof.js`
- 依赖：页面里的 `vendor/three.min.js`（当前 **r128**）
- 无副作用：不改 `index.html`；`build(THREE, opts)` 返回 `{ group, parts, reveal, dispose, … }`
- 无外部资源：不加载图片 / 模型；未传 `tileMaterial` 时才用 canvas 生成一张瓦纹
- 全部低模；瓦垄每垄 1 个 mesh，不使用 InstancedMesh（每垄几何不同，且需要逐垄显形）

```bash
node --check prototype/precision-roof.js     # 必须通过
```

## 1. API

```js
var rd = BridgeRoofDetail.build(THREE, opts);
galleryGroups.roof.add(rd.group);
rd.reveal({ stagger: 60 });
// rd.revealStep(8);
// rd.dispose();
```

| 返回字段 | 说明 |
|---|---|
| `group` | `THREE.Group`，名字 `bridge-roof-detail`；子对象直接是世界坐标 |
| `parts` | 可显形单元数组，顺序 = 盖瓦顺序（见 §3） |
| `reveal(opts)` | `opts.stagger` 毫秒/件；返回件数；`stagger<=0` 时一次全显 |
| `revealStep(i)` | 只显示 `parts[0..i]`，其余隐藏；`i<0` 全隐 |
| `dispose()` | 幂等；从父节点移除、释放自建 geometry / 材质 / 贴图；**不释放调用方传入的材质** |
| `config` | 归一化后的关键参数（length / courseCount / ridgeLift…） |
| `stats` | `{ meshes, triangles, parts }` |

### opts

| 参数 | 默认 | 说明 |
|---|---|---|
| `length` | `32` | x 向总长（主廊屋 32；楼阁一层 7.2；二层 4.6） |
| `halfWidth` | `4.0` | 单坡 z 向宽（主 4.0；楼阁 3.0 / 2.0） |
| `ridgeY` | `9.55` | 脊线高（主 9.55；楼阁 11.9 / 12.75） |
| `eaveY` | `8.05` | 檐口基准高（主 8.05；楼阁 11.0 / 12.1） |
| `courseCount` | `10` | 瓦垄数（脊→檐） |
| `tileMaterial` | `null` | 瓦面 / 脊梁材质；**不 clone**，直接借用 |
| `frameMaterial` | `null` | 封檐板 / 脊饰材质；**不 clone**，直接借用 |
| `sides` | `'both'` | `'both'` / `'front'`（+z）/ `'back'`（-z）/ `[1,-1]` |
| `xSegments` | `0` | 0 = 按长度自动（8–36） |
| `profile` | `null` | `function(x, t) -> y`，覆盖默认剖面 |
| `tileOffset` | `0.030` | 瓦面沿屋面法线的抬升，防 z-fighting（含 t 向弦差余量） |
| `lipHeight` | `0.032` | 下缘压边抬起高度 |
| `lipThick` | `0.012` | 压边立面厚度 |
| `lipLength` | `0.34` | 压边长度占比（相对一垄） |
| `ridgeBeam` | `true` | 是否建脊梁 |
| `ridgeBeamHeight` | `0.26` | 脊梁断面高 |
| `ridgeBeamDepth` | `0.36` | 脊梁断面底宽 |
| `ridgeOverhang` | `0.06` | 脊梁两端各外伸量 |
| `ridgeLift` | `0` | 0 = 自动 `clamp(halfWidth*0.06, .06, .24)` |
| `ridgeDip` | `0.105` | 脊梁底 = `ridgeY - ridgeDip`（用来包住旧脊块） |
| `ornaments` | `true` | 是否加脊端剪影 |
| `ornamentScale` | `0` | 0 = 自动 `clamp(halfWidth/4, .45, 1)` |
| `ornamentDepth` | `0.14` | 剪影挤出厚度 |
| `eaveFascia` | `true` | 是否加封檐板 |
| `fasciaDepth` | `0.07` | 封檐板出挑深度 |
| `fasciaDrop` | `0.16` | 封檐板下挂高度 |
| `fasciaGap` | `0.004` | 封檐板内面离屋面边缘的缝 |
| `fasciaRise` | `0.03` | 封檐板顶高出檐口 |
| `shadow` | `true` | 全部 mesh 的 cast/receiveShadow |
| `hidden` | `false` | true = 初始全隐，等 `reveal()` / 调用方显形 |

## 2. 几何契约（与 `roofSurface()` 对齐）

`index.html` 的 `roofSurface()`：

```js
t = j / rows;                     z = t * halfW
lift   = .16 * ((max(0, t-.82)) / .18)^2
corner = .8 * ((max(0, ex-.8)) / .2)^2 * t^2.2      // ex = |x| / (length/2)
y = ridgeY - (ridgeY-eaveY) * t^1.45 + lift + corner
```

**关键**：原型里 `cols = 2`，x 方向只有 `-L/2 / 0 / +L/2` 三列。网格在 x 上做的是
**线性插值**，所以本模块默认取：

```js
corner = 0.8 * t^2.2 * ex          // 线性，不是 max(0, ex-.8)^2
```

这样瓦垄的每个采样点在 x 上都落在 `roofSurface()` 的实际三角面上，不会插进屋面或悬空。
但 `t` 方向仍有一个小差别：`roofSurface` 只有 `rows = 14`，瓦垄按连续公式采样。
在 `t≈0.82` 的起翘拐点附近，14 行网格的三角面会比解析面高出约 **2 cm**（三角化后的
“扭面脊”）。所以 `tileOffset` 默认取 **0.030**，实测瓦面到真实三角面的最小竖向间隙
约 **0.007**（32 m 主屋面，12 垄）；`tileOffset` 不要低于 0.024。

- 若以后把 `roofSurface` 的 `cols` 改大，请同步改公式，或传 `opts.profile(x, t)`。
- 法线由 `x` / `t` 两个方向的切向量叉乘得到；法线外偏 `tileOffset`。
- 瓦垄沿 x 扫掠；下缘压边（lip）比下一垄瓦面高 `lipHeight - lipThick ≈ 0.02`，
  形成真实叠压和阴影线，而不是共面贴图。
- 后坡（z<0）单独建几何并翻转绕序，保证法线朝上（不是 `scale.z = -1`）。
- 本模块不建屋面板本身；它假设 `roofSurface()` 已经在场景里。

## 3. `parts` 顺序与盖瓦节奏

`parts` 按 **檐口 → 脊** 排列，正好是传统盖瓦的施工顺序：

| 序号 | 内容 | 数量（`sides:'both'`） |
|---|---|---|
| 0–1 | 封檐板（前坡 / 后坡） | 2（`eaveFascia:false` 时 0） |
| 2 … 2+2N-1 | 瓦垄：第 1 垄（檐口）前/后，第 2 垄前/后 … | 2N |
| 倒数第 3 | 脊梁 | 1 |
| 末 2 | 东 / 西脊端剪影 | 2（`ornaments:false` 时 0） |

每件 `userData`：

```js
{ roofPart, roofKind, roofLabel, roofCourse?, roofSide?, roofEnd? }
// kind: 'fascia' | 'course' | 'ridge' | 'ornament'
// label 例：'第 1 垄瓦 · 前坡'、'脊梁（两端起翘）'、'东脊端'
```

**建议时序**（主屋面，12 垄 = 29 件）：

| 方式 | 参数 | 总时长 |
|---|---|---|
| `rd.reveal()` | `stagger: 60` | `29 × 60 ≈ 1.74 s` |
| `rd.reveal()` | `stagger: 90` | `29 × 90 ≈ 2.6 s` |
| `revealCat('roof', 60)` | 每件 60 ms | `29 × 60 + 260 ≈ 2.0 s` |
| `revealCat('roof', 90)`（当前 `doRoof`） | 每件 90 ms | `29 × 90 + 260 ≈ 2.9 s` |

楼阁两层（7 垄 + 5 垄）分别 19 / 13 件；建议 `delay` 45–55 ms。

## 4. 接进 `buildGallery`

**不要**直接 `galleryDetailParts.roof = rd.parts`。`revealCat()` 的逻辑是：

```js
const kids = galleryDetailParts[cat]?.length ? galleryDetailParts[cat] : g.children;
```

只写 `rd.parts` 会把原有的 `roofSurface` 两块、旧脊块、檐口块排除在显形序列外。
正确做法是先收集基础件，再拼上细部件。

### 主廊屋（`roof` 组）

```js
// 原来的 4 块先收起来
const roofBase = [];
const mainA = roofSurface(32, 4.0, 9.55, 8.05, galleryMats.roof); add('roof', mainA); roofBase.push(mainA);
const mainB = roofSurface(32, 4.0, 9.55, 8.05, galleryMats.roof); mainB.scale.z = -1; add('roof', mainB); roofBase.push(mainB);
const ridgeBlock = gblock(0, 9.55, 0, 32, .2, .26, galleryMats.roof); add('roof', ridgeBlock); roofBase.push(ridgeBlock);
[-4.0, 4.0].forEach(function(z){
  const e = gblock(0, 8.22, z, 32, .1, .14, galleryMats.roof); add('roof', e); roofBase.push(e);
});

// 细部
if(window.BridgeRoofDetail){
  try{
    const rd = BridgeRoofDetail.build(T, {
      length: 32, halfWidth: 4.0, ridgeY: 9.55, eaveY: 8.05,
      courseCount: 12,
      tileMaterial: galleryMats.roof,   // 借用：透明度补间、setGalleryOpaque 都生效
      frameMaterial: galleryMats.pav,   // 封檐板 / 脊饰用木色
      hidden: !instant
    });
    galleryGroups.roof.add(rd.group);
    if(instant) rd.group.traverse(function(o){ if(o.isMesh) o.visible = true; });
    galleryDetailParts.roof = roofBase.concat(rd.parts);
  }catch(e){}
}
```

> 若希望封檐板也跟瓦一起淡入，把 `frameMaterial` 改成 `galleryMats.roof`。

### 中央楼阁（`pav` 组）

两层各自独立 build，`pav` 的 `parts` 按「一层瓦 → 一层脊 → 二层瓦 → 二层脊」拼：

```js
const pavBase = [];
const p1 = roofSurface(7.2, 3.0, 11.9, 11.0, galleryMats.roof); add('pav', p1); pavBase.push(p1);
const p1b = roofSurface(7.2, 3.0, 11.9, 11.0, galleryMats.roof); p1b.scale.z = -1; add('pav', p1b); pavBase.push(p1b);
const p1r = gblock(0, 11.9, 0, 7.2, .18, .24, galleryMats.roof); add('pav', p1r); pavBase.push(p1r);

const p2 = roofSurface(4.6, 2.0, 12.75, 12.1, galleryMats.roof); add('pav', p2); pavBase.push(p2);
const p2b = roofSurface(4.6, 2.0, 12.75, 12.1, galleryMats.roof); p2b.scale.z = -1; add('pav', p2b); pavBase.push(p2b);
const p2r = gblock(0, 12.75, 0, 4.6, .16, .22, galleryMats.roof); add('pav', p2r); pavBase.push(p2r);

if(window.BridgeRoofDetail){
  try{
    const d1 = BridgeRoofDetail.build(T, {
      length: 7.2, halfWidth: 3.0, ridgeY: 11.9, eaveY: 11.0,
      courseCount: 7, tileMaterial: galleryMats.roof, frameMaterial: galleryMats.pav, hidden: !instant
    });
    const d2 = BridgeRoofDetail.build(T, {
      length: 4.6, halfWidth: 2.0, ridgeY: 12.75, eaveY: 12.1,
      courseCount: 5, tileMaterial: galleryMats.roof, frameMaterial: galleryMats.pav, hidden: !instant
    });
    galleryGroups.pav.add(d1.group); galleryGroups.pav.add(d2.group);
    if(instant){
      d1.group.traverse(function(o){ if(o.isMesh) o.visible = true; });
      d2.group.traverse(function(o){ if(o.isMesh) o.visible = true; });
    }
    galleryDetailParts.pav = pavBase.slice(0, 3).concat(d1.parts, pavBase.slice(3), d2.parts);
  }catch(e){}
}
```

注意：`pavBase.slice(0,3)` 是一层基础 + 一层脊块，`slice(3)` 是二层基础 + 二层脊块；
中间的 `d1.parts` 自带一层封檐/瓦/脊/脊饰。

### 与现有 reveal 的关系

- `revealGallery()`（整桥一次性建出）：屋顶组整体下沉 1.2 m 后回位，`galleryMats.roof`
  透明度补间会同时作用到瓦垄 / 脊梁；封檐 / 脊饰用 `galleryMats.pav` 则晚 850 ms 淡入。
  这个路径不走 `galleryDetailParts`，所有子 mesh 一次显形（符合“整桥落成”的语义）。
- `doRoof()` / `revealCat('roof', delay)`（分步建桥）：走 `galleryDetailParts.roof`，
  按 §3 的顺序逐垄出现。每件会做 0.7→1 的缩放弹入；瓦垄的 pivot 在各自垄中心，
  脊梁在脊线中心，剪影在基座，不会绕世界原点乱飞。

## 5. 性能（`stats` 实测，r128 / Node）

| 场景 | courseCount | parts | meshes | triangles |
|---|---:|---:|---:|---:|
| 主廊屋（双坡） | 12 | 29 | 29 | **4 996** |
| 楼阁一层（双坡） | 7 | 19 | 19 | 1 004 |
| 楼阁二层（双坡，无脊饰） | 5 | 13 | 13 | 700 |
| 主廊屋（单坡、无封檐、有脊饰） | 4 | 7 | 7 | 412 |
| 三层全上 | — | 61 | 61 | ≈ 6 700 |

- 每垄 = 1 个 mesh = 1 个 draw call；主屋面 29 个，整套 61 个。
- 几何量很低（< 7k tris），真正的成本是 draw call 和阴影 pass；每件都 cast/receive。
- 没有用 InstancedMesh：每垄的 t 区间不同、轮廓不同，实例化省不了几何，
  反而破坏逐垄 `parts`。若只要静态远景，可把 `courses` 合并成 1–2 个 mesh（本模块未做）。
- 阴影：`shadow:false` 可整体关掉；远景或移动端建议关掉封檐/脊饰的阴影。

## 6. 注意事项 / 坑

1. **材质所有权**：`tileMaterial` / `frameMaterial` 是借用的，`dispose()` 不释放。
   这样 `galleryMats.roof` 的透明度补间、`setGalleryOpaque()` 才能继续作用。
   自建 fallback 材质和 canvas 贴图会由 `dispose()` 释放。
2. **必须 DoubleSide**：瓦垄是开放薄带（没有底面）。`galleryMats.roof` 在
   `buildGallery` 里已设 `T.side = T.DoubleSide`。若传入 `FrontSide` 材质，从檐下仰视会缺面。
3. **阴影 acne**：瓦面只比屋面板高 3 cm，默认 `shadow.bias = 0` 时会出现细密的自阴影条纹。
   当前页面 `key.shadow.bias = -0.0006`（`index.html` L369 / L480）在测试中干净；
   若改灯光，优先给平行光加 `shadow.normalBias ≈ 0.02–0.03`，或把瓦面 `receiveShadow=false`。
4. **旧脊块**：默认 `ridgeDip=0.105`、`ridgeBeamDepth=0.36`、`ridgeBeamHeight=0.26`、
   两端外伸 0.06，是为了**完整包住** `index.html` 里 `gblock(0, ridgeY, 0, L, .2, .26)`
   的旧脊块，且六个面都不共面。改这几个数时要么保持“更大”，要么把旧脊块删掉。
5. **旧檐口块**：`gblock(0, 8.22, ±4.0, 32, .1, .14)` 与封檐板体积相交，但无共面；
   封檐板外皮在 `z = ±4.074`，旧块外皮在 `±4.07`，差 4 mm。若删旧块，封檐板会更干净。
6. **角部起翘是线性的**：为了贴 `cols=2` 的网格（见 §2）。如果只改 `roofSurface`
   的公式而不同步，瓦垄会插进屋面。真要做解析曲面就传 `opts.profile`。
7. **UV 与瓦纹**：瓦垄 `uv = (x/L, t)`，与 `roofSurface` 的 UV 连续，所以
   `TILE_TEX` 的横纹会从屋面板延续到瓦面；物理压边线和贴图横纹是两个频率，
   近看会略密。若想要更干净，可给瓦垄换一张“每垄一条”的贴图，或把 `tileMaterial`
   换成纯色材质（本模块的 fallback 就是纯色 + 细瓦纹）。
8. **pivot / 缩放弹入**：`revealCat` 对 `isMesh` 的 part 做 0.7→1 的缩放。
   瓦垄 pivot 在该垄中心，长 32 m 的垄会从中间向两端“铺开”；如果觉得幅度太大，
   把 `galleryDetailParts[cat]` 里的对象包成 `Group`（`revealCat` 只对 mesh 缩放），
   或改用 `rd.reveal({stagger})` 自己控制。
9. **单坡**：`sides:'front'` 时封檐/瓦垄只做 +z，但脊梁与脊饰仍按整条脊线建
   （它们属于脊，不属于某一坡）。`ridgeBeam:false` 时脊饰会自动落到 `ridgeY - 0.02`
   （直接坐在脊线上），不会悬空。
10. **背坡绕序**：后坡不是 `scale.z=-1`，而是独立几何 + 翻转索引；这样法线、阴影、
    贴图都不会翻。改 `buildCourse` 的索引时注意 `side` 分支。
11. **fallback 贴图需要 `document`**：Node 里 `document` 不存在时自动退化为纯色材质，
    `node --check` 和 `require()` 测试都能过；浏览器里才会生成瓦纹 canvas。
12. **不建屋面板**：本模块是“面层”，必须叠在 `roofSurface()` 之上；单独 add 会看到
    瓦垄悬空（但几何本身是完整的）。

## 7. 验证

```bash
node --check prototype/precision-roof.js
```

运行时自检（Node + vendor/three）：

```js
const THREE = require('./prototype/vendor/three.min.js');
require('./prototype/precision-roof.js');
const rd = BridgeRoofDetail.build(THREE, {
  length: 32, halfWidth: 4, ridgeY: 9.55, eaveY: 8.05, courseCount: 12,
  tileMaterial: new THREE.MeshStandardMaterial({side: THREE.DoubleSide}),
  frameMaterial: new THREE.MeshStandardMaterial()
});
console.log(rd.stats);          // { meshes: 29, triangles: 4996, parts: 29 }
console.log(rd.parts[2].userData.roofLabel); // '第 1 垄瓦 · 前坡'
rd.reveal({stagger: 60});
rd.dispose(); rd.dispose();     // 幂等
```

已核对：
- 所有顶点 / 法线有限（无 NaN）；
- 主屋面 12 垄瓦面到 `roofSurface` 真实三角面的最小竖向间隙约 0.007（无 z-fighting）；
- 前后坡瓦垄法线均朝上，脊梁 / 封檐板为外向法线；
- 脊端剪影有向体积为正（两个端都朝外）；
- `dispose()` 后 `group.parent === null`，重复调用不抛错。
