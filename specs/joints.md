# 榫卯节点层规格 · `prototype/joints.js`

把「榫头 / 卯口 / 木销 / 方套 / 别压半榫」画到近景能读出来。
独立 classic script，挂 `window.BridgeJoints`，只做几何：不建场景、不碰 DOM、不加灯。

- 交付：`prototype/joints.js`
- 依赖：页面里的 `vendor/three.min.js`（当前 **r128**，用到 `ExtrudeGeometry` 挖孔的方环）
- 无副作用：不改 `index.html`；每个函数收 `THREE`，返回 `THREE.Object3D`，由调用方自己 `add`
- ★ 全部为**示意几何**，不是测绘复原。低多边形、无布尔运算

```js
node --check prototype/joints.js     // 必须通过
```

## 1. API

| 函数 | 返回 group 的坐标 | mesh 数 |
|---|---|---|
| `tenon(THREE, a, b, z, opts)` | 已摆到 a/b 端的世界坐标 | 2 |
| `mortise(THREE, x, y, z, opts)` | 已摆到 (x,y,z) | 2（`frame:false` → 1） |
| `peg(THREE, x, y, z, opts)` | 已摆到 (x,y,z) | 3（`heads:false` → 1） |
| `node(THREE, node, opts)` | **在原点，子对象是世界坐标** | 12 |
| `crossing(THREE, x, y, z, opts)` | **在原点，子对象是世界坐标** | 10 |
| `headMortises(THREE, headMesh, opts)` | **在原点，子对象是牛头局部坐标** | 3 排 9；7 排 21 |

便利函数：`BridgeJoints.nodeList('san'|'wu')` → 该套苗的**内节点**描述数组（纯几何，不用 THREE），
直接喂给 `node()`。另导出 `BridgeJoints.coords`、`BridgeJoints.palette`、
`BridgeJoints.materials(THREE)`（按 色+粗糙度 共享的默认材质；改它 = 改所有默认节点）。

`opts` 摘要（完整注释在源码里）：

```js
tenon  { size:{w,h,len}, material, shoulderMaterial, memberR, end:'a'|'b', collar, edges }
mortise{ w, h, d, axis:'x'|'y'|'z', material, rimMaterial, rim, rimH, frame }
peg    { r, len, axis:'x'|'y'|'z', material, heads }
node   { material, tenonMaterial, shoulderMaterial, slotMaterial, pegMaterial,
         memberR, tenonSize, sleeveSize:{len,h,w}, slotW, slotH, slots, pegR }
crossing{ sign, angleA, angleB, h, lenA, lenB, notch, material, tieMaterial, tieLength, tieDrop, pegR }
headMortises{ rows, y, size:{w,h,d}, material, frameMaterial, frame,
              pegX, pegY, pegAxis, pegLen, pegR, pegHeads }
```

## 2. 坐标约定

沿用 `index.html`：半跨 `X=14.2`、起拱点 `Y0=0.9`、三节苗 `z=+0.17`、五节苗 `z=-0.17`、
苗（圆木）直径 `0.34`（`beam2D(a,b,z,h,w)` 里 `w=0.34`；注意 `h` 在原型里没被用）、7 排 `RIBS`。

```
SAN = [[-14.2,0.9], [-4.8,6.0], [4.8,6.0], [14.2,0.9]]          三节苗 3 段
WU  = [[-14.2,0.9], [-9,4.9], [-4.3,5.55], [4.3,5.55], [9,4.9], [14.2,0.9]]   五节苗 5 段
```

- **内节点**（苗与苗的接头）：
  - 三节苗 2 个：`(-4.8, 6.0)`、`(4.8, 6.0)`
  - 五节苗 4 个：`(-9.0, 4.9)`、`(-4.3, 5.55)`、`(4.3, 5.55)`、`(9.0, 4.9)`
- **别压交叉**（三节苗 × 五节苗）2 个：`(∓6.08, 5.30)`。
  左岸是三节苗 seg0 × 五节苗 seg1；右岸是三节苗 seg2 × 五节苗 seg3。
  实测交点 `(-6.084, 5.303)` / `(6.084, 5.303)`，与 `buildTies()` 用的 `x=±6.08, y=5.30` 一致。
  两根木在交叉处的真实倾角：三节苗 `28.48°`、五节苗 `7.87°`（夹角 ≈20.6°）。
- **端节点**（苗落在牛头上）4 个：`(±14.2, 0.9)`。不是内节点，是榫头入牛头卯口。

## 3. 要细化的节点 / 交叉点

按优先级：

1. **6 个内节点** —— `nodeList('san')` + `nodeList('wu')`，共 6 套。
2. **2 个别压交叉** —— `crossing(THREE, ±6.08, 5.30, 0)`。
3. **2 处牛头卯口** —— `headMesh.add(headMortises(THREE, headMesh))`。
4. （可选）**4 个端节点** —— 苗端出一个榫头入牛头：
   `tenon(THREE, SAN[0], SAN[1], Z_SAN, {end:'a'})`，其余三个同理。

**只在中央排做**（`RIBS[3] = 0`）。7 排全做会把 mesh 数乘 7（约 770），不值得。

## 4. 建议尺寸

| 件 | 参数 | 默认值 | 依据 |
|---|---|---|---|
| 榫头 | `size.w / h / len` | `0.16 / 0.12 / 0.30` | 圆木径 0.34；节点上取 `0.42` 长，才露得出方套 |
| 榫肩方箍 | `0.07 × (2R+0.03) × (2R+0.03)` | `0.07 × 0.37 × 0.37` | 比方木大 0.03，四角露出才看得见 |
| 卯口 | `w / h / d` | `0.19 / 0.15 / 0.22` | 比榫头大 0.02–0.03 的余量 |
| 卯口木框 | `rim / rimH` | `0.035 / 0.09` | 凸起读作「槽口有边」 |
| 木销 | `r / len` | `0.075 / 0.5` | 与 `addHeadDetails` 现有的销一致 |
| 节点方套 | `sleeveSize {len,h,w}` | `0.26 / 0.44 / 0.44` | 替代原型 `joint()` 的 ⌀0.6×0.72 圆箍 |
| 节点上的销 | `r / len` | `0.055 / 0.74` | 销帽 ⌀0.17 < 卯口 0.18，不把卯口盖死 |
| 别压木 | `h / lenA / lenB / notch` | `0.34 / 1.5 / 1.5 / 0.56` | 断面取圆木径 |
| 横串 | `tieLength / tieDrop` | `5.0 / -0.13` | 与 `buildTies()` 的 5.0 一致，正好串住 7 排 |
| 牛头卯口 | `size {w,h,d}` | `1.5 / 0.34 / 0.20` | 宽 1.5 与原型 `addHeadDetails` 的槽一致 |
| 牛头卯口排位 | `rows` | `RIBS[0], RIBS[3], RIBS[6]` = `-2.4 / 0 / 2.4` | 对上原型的 `-2.3 / 0 / 2.3` |

## 5. 集成点

### 5.1 `finishPlacement()` —— 内节点（中央排）

现在：

```js
} else {
  addJointsAt(mesh);
  const mm = mesh.userData;
  mm.dir = Math.abs(mm.a[0]) < Math.abs(mm.b[0]) ? 1 : -1;
  RIBS.forEach(function(dz){ ... 复制成排 ... });
  placed.push({mesh:mesh, ...});
}
```

`addJointsAt()` 保持不动（那两枚小暗圆箍仍可留作过渡）。在它后面加一次节点细化的检查：

```js
/* 顶部加两个状态 */
const detailed = {};      // 'san:1' → 已加
const placedSegs = {};    // 'san:0' → 已落位

function addNodeDetails(system, seg){
  placedSegs[system + ':' + seg] = true;
  const n = segmentCount(system);
  for(let i = 1; i < n; i++){
    const key = system + ':' + i;
    if(detailed[key]) continue;
    if(!placedSegs[system + ':' + (i-1)] || !placedSegs[key]) continue;   // 两段都到位才装
    bridge.add(BridgeJoints.node(THREE, BridgeJoints.nodeList(system)[i-1]));
    detailed[key] = true;
    updateShadows();
  }
}
```

```js
/* finishPlacement 里，addJointsAt(mesh) 之后 */
addNodeDetails(mesh.userData.system, mesh.userData.seg);
```

只对**被拖的那根**调用（中央排），成排复制出来的 clone 不调用 → 天然只在中央排做。
两段都到位才装，避免榫头孤零零挂在半截苗上。

`?built` 静态分支走的是 `makeArch(bridge)`，不经过 `finishPlacement`，要补一次：

```js
/* buildStatic() 里，makeArch(bridge) 之后 */
['san','wu'].forEach(function(sys){
  BridgeJoints.nodeList(sys).forEach(function(n){
    bridge.add(BridgeJoints.node(THREE, n));
  });
});
```

### 5.2 `buildTies()` —— 别压交叉

现在画的是一个暗色套块 + 一根 5.0 长的横串。整段替换：

```js
function buildTies(){
  [-6.08, 6.08].forEach(function(x){
    bridge.add(BridgeJoints.crossing(THREE, x, 5.30, 0));   // 默认横串 5.0，串住 7 排
  });
}
```

`buildTies()` 现在有三个调用点：`doBraces()`（`state.mode !== 'detail'` 时才顺带打）、
「打横串」那一步（`id:'ties'` 的 action，详细模式走这里）、以及 `buildStatic()`。
三个点都只调一次，时机正好是「锁拱」——两套苗在这里互相别住。
默认 `sign` 按 `x` 的正负推，左右岸自动镜像，所以 `crossing(THREE, -6.08, …)` 与
`crossing(THREE, 6.08, …)` 会自动呈镜像。

### 5.3 `addHeadDetails(head)` —— 牛头卯口

整个函数体替换成一行：

```js
function addHeadDetails(head){
  head.add(BridgeJoints.headMortises(THREE, head));
}
```

`headMortises()` 返回的是**牛头局部坐标**，所以必须 `head.add(...)`，不能加到 `bridge`。
`index.html` 里牛头是 `block(±X, Y0, 0, 2.0, 1.3, 6.8, …)`，没有旋转/缩放，局部 z 就是世界 z。

调用点已经有两处，都不用改：

- `finishPlacement()` 里 `if(mesh.userData.block){ … addHeadDetails(mesh); }` → 被拖的那块牛头
- `makeArch()` 里 `[-X, X].forEach(function(x){ const h = block(...); addHeadDetails(h); group.add(h); })`
  → `?built` 静态分支的两块牛头

注意：`makeArch()` 里两块牛头**各调一次**，所以 `headMortises()` 必须能被重复调用
（它是纯函数、材质共享，重复调用没问题）。

### 5.4 接线

```html
<script src="vendor/three.min.js"></script>
<script src="joints.js"></script>          <!-- 放在主 IIFE 之前 -->
```

主 IIFE 里取一句 `const JOINTS = window.BridgeJoints;` 即可（缺失时应能降级，别让整页挂掉）。

## 6. 近景镜头（必须补，否则看不到）

> 命名注意：`index.html` 里 `state.mode === 'detail'` 已经用来表示**详细步骤模式**
> （`buildDetailSteps()`，多了「打横串」等步骤），和这里的「镜头近景」不是一回事。
> 近景机位另起名字，建议 `'node'` / `'closeup'`，别复用 `detail`。

默认机位 `camera.position.set(14, 10, 43)`、`controls.minDistance = 22`、
`controls.target.set(0, 5.2, 0)`。一个 0.1–0.4 m 的榫头在 40 m 外只有几个像素——
**不补近景运镜，这一层等于白做。**

建议：

1. 把 6 个内节点 + 2 个交叉点的世界坐标做成一个列表（`nodeList('san'/'wu')` + `(±6.08, 5.30, 0)`）。
2. 加一个「节点」视图按钮 / 键：把 `camera` 与 `controls.target` 一起 tween 到
   `节点 + (1.2, 0.8, 1.6)` 与节点本身（距离约 2–3 m；37° fov 下画面宽约 1.5–2.2 m，正好装下一个节点）。
3. 进近景时：`controls.minDistance = 0.8`、`controls.maxPolarAngle = 1.9`（好俯看牛头卯口）、
   关掉 `autoRotate`；退出时把 `minDistance` 还原成 22、`maxPolarAngle` 还原成 1.52。
4. 近景期间**收窄阴影相机**。`key.shadow.camera` 现在是 `±34 / -14…26`、`mapSize 2048`，
   即 68 m 上摊 2048 texel ≈ 3.3 cm/texel——0.1 m 的榫头只有 3 个 texel，阴影会糊成一团。
   收到节点周围 ±3 m（mapSize 保持 2048 → 1.5 mm/texel），或把 mapSize 提到 4096。
   `renderer.shadowMap.autoUpdate = false`，收窄后记得 `updateShadows()`。
5. 雾不用动：`FogExp2` 在 2–3 m 上几乎无影响（深色场景 0.011 / 环境层 0.0036 都一样）。

## 7. 性能

- 单个 `node()`：12 mesh / **256 三角面**（实测）。`crossing()` 10 mesh。`headMortises()` 3 排 9 mesh。
- 中央排全做：`6×12 + 2×10 + 2×9 = 110` mesh ≈ 2.5k 三角面，可忽略。
- 7 排全做 ≈ 770 mesh，draw call 明显上升，**不要做**。
- 材质按 (色, 粗糙度) 缓存共享；`BridgeJoints.materials(THREE)` 拿到的就是同一份。
- 全部 mesh `castShadow = receiveShadow = true`；描边是 `LineSegments`（不投影、不算 mesh）。

## 8. 注意与已知取舍

- **全部示意**：不是测绘，尺寸是给近景读轮廓用的。
- **卯口的「凹」是假的**：没有 CSG。做法是「凸起的方环（`ExtrudeGeometry` 挖孔，1 个 mesh）
  + 一块略高于表面的近黑板」。远看是暗槽，贴到侧面看会看出暗板是凸的。
- **两苗接近共线时榫头会被埋**：五节苗中节点（`x=±4.3`）几乎就是直的，一根苗的榫头会有一段
  没进对面那根圆木里。近景主要靠方套 + 卯口 + 木销读。要彻底解决得给圆木开槽（CSG）。
- **`crossing()` 的横串默认 5.0 长**（对齐 `buildTies`），在 3/4 近景里会朝镜头伸出来挡住节点；
  近景时建议传 `{tieLength: 2.6}`，或从正侧视（沿 -z）看。
- **牛头卯口的销沿 x**（与原型 `addHeadDetails` 一致），视觉上像「躺在槽里」；
  想更像「横穿把苗锁住」，传 `{pegAxis:'z'}`。
- 别压两根木的真实夹角 ≈20.6°，缺口是按**各自轴向**切的简化，不是真实斜搭接的切口。
- 7 排在真实桥上是逐排都有榫卯的；这里只在中央排做，是「看得清」与「性能」的取舍。
- 牛头将来若带旋转/缩放，`headMortises()` 的局部坐标假设就不成立，要换成世界坐标版本。

## 9. 自检

```
node --check prototype/joints.js
```

已做（临时预览页，验完即删）：

- `node --check` 通过。
- 无头 Chrome 出图确认：`node()` 的 3/4 / 正侧视 / 俯视三种机位下，
  方套、卯口木框、木销销帽、两根榫头都读得出来；`crossing()` 的缺口台阶与横串可见；
  `headMortises()` 的 3 个卯口木框 + 槽内木销清楚；`tenon / mortise / peg` 三个基本件正常。
- 用节点坐标抽查：三节苗 seg0 × 五节苗 seg1 交点 `(-6.084, 5.303)`，
  与 `crossing(-6.08, 5.30, 0)` 的锚点一致。
