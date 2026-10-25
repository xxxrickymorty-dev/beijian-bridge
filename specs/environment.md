# 环境层规格 · `prototype/environment.js`

日间「青山绿水」环境。独立 classic script，挂 `window.BridgeEnv`，不引外部模型 / 贴图，不依赖构建。
给北涧桥（净跨 29 m）配一条溪、两岸青山、低山水雾，亮而不甜。

- 交付：`prototype/environment.js`
- 依赖：页面里的 `vendor/three.min.js`（当前 **r128**）
- 无副作用：不改 `index.html`；只在自己 `dispose()` 时清理自己创建的对象

## 1. API

```js
var env = BridgeEnv.build(scene, THREE, opts);
// opts（全部可选）
//   lights  : false 时不加灯，只做环境（默认 true）
//   fog     : false 时不改 scene.fog，沿用调用方的雾（默认 true）
//   fogColor: 覆盖雾色（默认 #DFEAE2）
//   fogDensity: 覆盖雾浓度（默认 0.0036）
//   mist    : false 时不加水雾 sprite（默认 true）
//   quality : 'low' 减半山脊分段与植被（默认 'high'）
//   seed    : 植被随机种子（默认 20261022）

env.update(clock.elapsedTime); // 每帧；只动水的时间 uniform 与 3 片水雾
env.dispose();                // 释放几何/材质/贴图，并从 scene 移除 group，还原 scene.fog
```

返回对象：

| 字段 | 说明 |
|---|---|
| `group` | 所有环境对象的根节点（含灯）。隐藏它即可整层关掉 |
| `update(t)` | `t` 为秒。无逐帧分配 |
| `dispose()` | 幂等 |
| `lights` | `{hemi, sun, fill}` 或 `null`（`lights:false`） |
| `sun` | 暖阳方向光引用，方便与桥的阴影灯对齐 |
| `stats` | `{triangles, plants, drawObjs}`，构建后即可读 |

另导出常量：`BridgeEnv.palette`（色板）、`BridgeEnv.coords`（坐标约定）。

## 2. 坐标约定

与 `index.html` 一致：桥半跨 `X=14.2`、地面 `GROUND_Y=-2.6`、水面 `WATER_Y=-2.55`。
溪流**沿 z 流动**（桥沿 x 跨越），河岸在 |x| 两侧。

| 项目 | 数值 | 说明 |
|---|---|---|
| 水面 | `y=-2.55` | 平面 40 × 220，只有 2 个三角面，波纹在片元里算 |
| 河宽 | 水面 |x|≤20 | 可见岸线约 |x|≈18.0–18.4 |
| 坡脚 | |x|=17.8 | 桥台外缘 17.6，留 0.2 m 净距，**不穿插桥台** |
| 岸顶 | 约 y=10（|x|≥55） | 抬成峡谷，不挡远山脊线 |
| 远山 | r=88 / 130 / 172 | 山脊高约 15 / 23 / 33 m，三圈 360°，绕桥转都有背景 |
| 树 | |x|≥20.6，|z|≤84 | 岸石 |x| 19.1–22.3；水雾 y≈-1.0…-1.2 |
| 天空穹 | r=230 | 需 `camera.far ≥ 300`（日光 sprite 在 198） |

坡面高度与种树共用同一个 `bankHeight(xAbs, z, side)`，所以树不会浮空或陷进坡里。

## 3. 色板

| 用途 | sRGB | 用途 | sRGB |
|---|---|---|---|
| 天顶 | `#58A7D4` | 天边 | `#E2EFF0` |
| 日光 | `#FFE7C2` | 雾 | `#DFEAE2` |
| 近山（底/顶） | `#2F5B45` / `#457054` | 中山 | `#4F7B76` / `#689189` |
| 远山 | `#7EA1AA` / `#9DBAC0` | 草坡 | `#5D8A49` |
| 深林 | `#3E6539` | 土 | `#7D7353` |
| 湿石 | `#66735E` | 岸石 | `#848B7D` |
| 水·深 | `#1D6B67` | 水·浅 | `#58A08D` |
| 水·波光 | `#D6EFE0` | 松 | `#37612F` / `#4F7C3A` |
| 阔叶 | `#446F34` / `#66914A` | 树干 | `#624A34` |

木色不在这里定义：桥体沿用 `index.html` 的杉木 `#B08F63`、老木 `#7D3B28`、青瓦 `#9AA0A2`。

## 4. 集成步骤

`index.html` 里现有对象与灯的处理：

**删掉 / 隐藏**

1. `sky`（z=-62 的 220×60 平面）和 `hills`（z=-48）——它们在新山脊环**里面**，会挡住远山。必须去掉。
2. `river`（46×8 的深色条）——方向不对，且 `y=-2.58` 与新水面 `-2.55` 只差 3 cm，会 z-fighting。
3. `ground`（220×220 深色径向贴图，`y=-2.6`）——建议 `ground.visible=false`。新水面盖住河道内的部分，但河道外/远端的深色底会从坡地缝隙里透出来。
   - 仍想要桥的落地阴影的话：不要把地面删掉，改成把它重着色为岸绿并压到 `y=-2.62`，或另加一块只接阴影的浅色平面；环境自身不接收阴影。
4. 灯：删 `HemisphereLight(0xb9c8c4,0x2a1c13,.52)`、`fill`、`front`、`bounce`、`rim`。
   - `key` 只有一种情况保留：**要桥的投影**。那就把它挪到与环境太阳同向、降强度：
     `key.position.set(32,44,26); key.intensity = 0.7;`（其余交给环境灯）
   - 全删则桥不投影（环境从不投影），由 `BridgeEnv` 的 `sun + hemi + fill` 照明。

**保留 / 调整**

- `scene.background`：环境自带天空穹，全方向覆盖，旧深色背景实际看不到；可留可换。
- `scene.fog`：环境默认换成 `FogExp2(#DFEAE2, 0.0036)`，`dispose()` 会还原原引用。自己管雾就传 `{fog:false}`。
  （r128 的雾在输出编码**之后**混合，所以雾色按 sRGB 直接给，别 `convertSRGBToLinear`。）
- `camera.far`：保持 ≥300。
- 渲染器：`outputEncoding=sRGBEncoding`、`ACESFilmicToneMapping`、`toneMappingExposure ≈1.05–1.15`（按 1.08 调的）。
- 拖拽时的 HUD / 阴影无关：环境全部 `castShadow=false / receiveShadow=false`。

**接线（约 4 行）**

```html
<script src="environment.js"></script>   <!-- 放在主 IIFE 之前 -->
```

```js
// 建场景、相机之后，buildPreview()/buildStatic() 之前
const env = BridgeEnv.build(scene, THREE, {
  lights: true,
  quality: matchMedia('(max-width:760px)').matches ? 'low' : 'high'
});

// animate() 里
env.update(clock.elapsedTime);

// 调试
window.__proto.env = env;
```

## 5. 性能

实测（一次临时预览页里读 `env.stats`）：

| | high（默认） | low |
|---|---|---|
| 三角面 | 10,804 | 5,080 |
| 植物 | 76 | 42 |
| `group.children` | 20 | 20 |

- 目标 <20k：默认约 10.8k，`low` 约 5.1k。
- 组内 20 个对象：天空穹 1、日光 sprite 2、山脊 3、河岸 2、水 1、树干 1、松 1、阔叶 1、灌木 1、岸石 1、水雾 3、灯 3。绘制调用很低。
- 几何全部共享：所有松层共用一个 cone、阔叶与灌木共用一个 icosahedron、所有树干共用一个 cylinder、岸石共用一个 icosahedron。
- 只有 2 张程序化 canvas 贴图（256²，日光与水雾），随 `dispose()` 释放。
- 水是 2 个三角面 + 片元波纹；水雾是 sprite；`update()` 每帧只写 1 个 uniform 和 3 个 sprite 位置，无分配。
- 全层无阴影：不新增 shadow pass，不参与既有阴影贴图。
- 移动端：`quality:'low'`；极弱设备可再传 `mist:false`。

## 6. 注意与已知取舍

- **河是直段**，没有弯道、滩、跌水。几何为示意，和 `PLAN.md` 的口径一致。
- 水面**没有反射**，桥也**不投影到水上**。要「溪面反光」得再加一层或换反射方案。
- 两岸是解析平滑坡面，没有台地/岩壁；起伏感来自颜色分层 + 岸石 + 灌木。
- 坡脚取 17.8 而不是 16，是为了让开 4.4 m 宽、外缘 17.6 的桥台；代价是可见河道约 36 m 宽。将来做桥头屋/楼梯（|x|≈16–18）会落在坡地第一排柱子上，要重校高度。
- 植被按 `opts.seed` 确定性生成。改树的数量会连带改变后续随机（颜色、岸石）——对比截图时别改 seed。
- 水的自定义 `ShaderMaterial` 用了 `THREE.UniformsLib.fog` + `encodings_fragment`，在随包 r128 下正确；升到 r152+ 需要把 chunk 名改成 `colorspace_fragment`。
- 桥的临时支架在 x=±3.9、伸到 y=-2.6，现在会**立在溪里**。当作「在水中搭架」看没问题；要干净就把支架底部收到岸上。
- 天空是 BackSide 球体网格，不是 `scene.background`。加后处理或改 `camera.far` 时注意别把它裁掉。

## 7. 自检

```
node --check prototype/environment.js
```

本层在无头 Chrome（SwiftShader）下从正面 / 背面两个机位出过图，确认：远山三层有层次、岸线贴着桥台、水面无 z-fighting、`dispose()` 后 `scene.children` 归零且 `scene.fog` 还原。
