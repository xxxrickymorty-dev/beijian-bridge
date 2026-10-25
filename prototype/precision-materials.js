/*!
 * 编梁 · 北涧桥 — 精细材质层  precision-materials.js
 *
 * 用 canvas / typed array 现场生成「albedo + normal + roughness」三张图，
 * 把木头、青瓦、石材从「一块纯色 + 一张灰纹理」抬到 2–5 m 近景能读的级别。
 * 全部程序化，无外部图片、无网络、无构建；只用 three r128 的公开 API。
 *
 * 用法（放在 three.min.js 之后、主 IIFE 之前）：
 *
 *   var m = BridgeMaterials.wood(THREE, 0xb08f63, { roughness: .8, repeat: [1.6, 2.4] });
 *   var t = BridgeMaterials.tile(THREE, { color: 0x404a50, repeat: [8, 2] });
 *   var s = BridgeMaterials.stone(THREE, { color: 0x9a9286, repeat: [2, 2] });
 *   var up = BridgeMaterials.upgrade(THREE, MAT_SAN, 'wood');   // 保留原 color / map，只补 normal + roughness
 *   BridgeMaterials.dispose();                                   // 释放所有缓存贴图
 *
 * 约定：
 *   · 贴图按 key 缓存，重复调用不会重复生成 / 上传；返回的材质本身不缓存（clone 自便）。
 *   · 颜色烘进 albedo，所以材质的 color 是白色；`material.color.multiplyScalar()` 仍可做明暗微差。
 *   · roughnessMap 以 ROUGH_MEAN(0.88) 为均值，material.roughness 会除以它做补偿，
 *     传入的 opts.roughness 就是最终想要的粗糙度（±12% 细节起伏）。
 *   · 所有图最大 512²，POT，双轴无缝；贴图坐标 flipY=false，albedo 走 sRGB。
 *   · 只写自己的缓存；不改调用方任何对象。
 */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------ 常量 */

  var MAX_SIZE = 512;          // 上限，规范要求 512²
  var MIN_SIZE = 64;
  var ROUGH_MEAN = 0.88;       // roughnessMap 的均值；material.roughness 用它补偿
  var TONE_MIN = 0.55;         // 明度场编码区间：0.55 … 1.15
  var TONE_SPAN = 0.60;
  var DEFAULT_SEED = 20261022;

  /* 可在建材质之前改；建议设成 Math.min(8, renderer.capabilities.getMaxAnisotropy()) */
  var GLOBAL = { anisotropy: 4 };

  var DEFAULTS = {
    wood: {
      size: 512,
      roughness: 0.82,
      normalScale: 0.9,
      repeat: [2, 2],
      anisotropy: 4,
      grainScale: 1,
      knots: 2,
      seed: DEFAULT_SEED
    },
    tile: {
      size: 512,
      roughness: 0.78,
      normalScale: 1.0,
      color: 0x404a50,
      repeat: [10, 2],
      anisotropy: 4,
      seed: DEFAULT_SEED + 1
    },
    stone: {
      size: 512,
      roughness: 0.92,
      normalScale: 0.85,
      color: 0x9a9286,
      repeat: [2, 2],
      anisotropy: 4,
      seed: DEFAULT_SEED + 2
    }
  };

  /* 各类别的高度场 → 法线强度（在像素梯度上加权，不是物理斜率） */
  var NORMAL_STRENGTH = { wood: 1.6, tile: 2.2, stone: 1.4 };

  /* ------------------------------------------------------------ 缓存 */

  var DETAILS = Object.create(null);   // key -> {normal, rough, tone, hue, size, kind}
  var ALBEDOS = Object.create(null);   // key -> CanvasTexture
  var FITTED = Object.create(null);    // key -> 复制过 transform 的贴图（upgrade 用）
  var STAT = { textures: 0, bytes: 0, fields: 0 };

  function bytesFor(size) { return size * size * 4 * 4 / 3; } // RGBA + mip 链

  /* ------------------------------------------------------------ 1. 随机与噪声 */

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function smoothstep(a, b, x) {
    var t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function makeRng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /* 32 位整数 hash → [0,1)。整数格点坐标，配合取模即可做「可平铺」噪声。 */
  function hash2(ix, iy, seed) {
    var h = Math.imul(ix | 0, 374761393) ^
            Math.imul(iy | 0, 668265263) ^
            Math.imul(seed | 0, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = h ^ (h >>> 16);
    return (h >>> 0) / 4294967296;
  }

  /* 双轴周期可平铺的 value noise：px / py 为整数周期（格点数）。 */
  function noise2(x, y, px, py, seed) {
    var xi = Math.floor(x), yi = Math.floor(y);
    var fx = x - xi, fy = y - yi;
    var x0 = xi % px; if (x0 < 0) x0 += px;
    var y0 = yi % py; if (y0 < 0) y0 += py;
    var x1 = (x0 + 1) % px;
    var y1 = (y0 + 1) % py;
    var u = fx * fx * (3 - 2 * fx);
    var v = fy * fy * (3 - 2 * fy);
    var a = hash2(x0, y0, seed), b = hash2(x1, y0, seed);
    var c = hash2(x0, y1, seed), d = hash2(x1, y1, seed);
    var ab = a + (b - a) * u;
    var cd = c + (d - c) * u;
    return ab + (cd - ab) * v;
  }

  /* 分形噪声。每层频率翻倍、周期同步翻倍，所以整张图仍然无缝。 */
  function fbm(x, y, px, py, oct, seed) {
    var sum = 0, amp = 0.5, norm = 0;
    for (var i = 0; i < oct; i++) {
      sum += amp * noise2(x, y, px, py, seed + i * 31);
      norm += amp;
      x *= 2; y *= 2; px *= 2; py *= 2; amp *= 0.5;
    }
    return sum / norm;
  }

  /* ------------------------------------------------------------ 2. 高度 / 明度场 */

  /* 木节：中心留在离边 0.25 以内，再用边缘窗淡出，保证平铺不露缝。 */
  function placeKnots(count, seed) {
    var out = [];
    var rnd = makeRng((seed ^ 0x9e3779b9) >>> 0);
    var n = Math.max(0, Math.round(count));
    for (var i = 0; i < n; i++) {
      var rx = 0.022 + rnd() * 0.020;
      out.push({
        cx: 0.26 + rnd() * 0.48,
        cy: 0.30 + rnd() * 0.40,
        rx: rx,
        ry: rx * (2.4 + rnd() * 1.2),
        amp: 0.9 + rnd() * 0.9
      });
    }
    return out;
  }

  /* 转置四张场：把「沿 v 的纹理」变成「沿 u 的纹理」，供 upgrade 对齐旧 WOOD_TEX。 */
  function transposeFields(f, N) {
    var height = f.height, tone = f.tone, hue = f.hue, rough = f.rough;
    var y, x, a, b, t;
    for (y = 1; y < N; y++) {
      for (x = 0; x < y; x++) {
        a = y * N + x;
        b = x * N + y;
        t = height[a]; height[a] = height[b]; height[b] = t;
        t = tone[a]; tone[a] = tone[b]; tone[b] = t;
        t = hue[a]; hue[a] = hue[b]; hue[b] = t;
        t = rough[a]; rough[a] = rough[b]; rough[b] = t;
      }
    }
    return f;
  }

  /*
   * 木材：轴向纹理（默认沿 v 走）+ 年轮线 + 涡状节疤 + 纤维毛刺。
   * 三张图共用同一个高度场，所以「看到的纹」和「摸到的凹凸」是对齐的。
   */
  function woodFields(N, cfg, seed) {
    var total = N * N;
    var height = new Float32Array(total);
    var tone = new Uint8Array(total);
    var hue = new Int8Array(total);
    var rough = new Uint8Array(total);

    var rings = Math.max(3, Math.round(7 * cfg.grainScale));
    var knots = placeKnots(cfg.knots, seed);
    var knotCount = knots.length;
    var x, y, i;

    for (y = 0; y < N; y++) {
      var v = (y + 0.5) / N;
      for (x = 0; x < N; x++) {
        var u = (x + 0.5) / N;
        i = y * N + x;

        var w1 = fbm(u * 3, v * 3, 3, 3, 3, seed + 11);   // 低频弯曲 / 风化
        var w2 = fbm(u * 6, v * 6, 6, 6, 2, seed + 23);   // 中频起伏
        var fiber = noise2(u * 56, v * 7, 56, 7, seed + 37);   // 竖向纤维
        var micro = noise2(u * 144, v * 24, 144, 24, seed + 53); // 细毛刺
        var pore = noise2(u * 210, v * 64, 210, 64, seed + 67);  // 管孔

        /* 相位：u 方向 N 圈年轮，用可平铺噪声扭曲 */
        var d = u * rings + (w1 - 0.5) * 0.6 + (w2 - 0.5) * 0.18;

        /* 节疤：给相位叠一个高斯包，等值线就绕着它闭合 */
        var knotMask = 0;
        if (knotCount) {
          var edge = Math.min(u, 1 - u, v, 1 - v);
          var win = smoothstep(0.0, 0.10, edge);
          if (win > 0) {
            for (var k = 0; k < knotCount; k++) {
              var kn = knots[k];
              var dx = (u - kn.cx) / kn.rx;
              var dy = (v - kn.cy) / kn.ry;
              var q = dx * dx + dy * dy;
              if (q < 12) {
                d += kn.amp * Math.exp(-q * 0.9) * win;
                if (q < 3) {
                  var km = Math.exp(-q * 1.8) * win;
                  if (km > knotMask) knotMask = km;
                }
              }
            }
          }
        }

        var fr = d - Math.floor(d);
        var line = smoothstep(0.70, 1.0, fr);
        line *= line;                                   // 晚材：窄而深的一条
        var bd = Math.min(fr, 1 - fr);
        var core = smoothstep(0.03, 0.0, bd);           // 年轮交界的一根细黑线
        var poreMask = smoothstep(0.72, 0.96, pore);    // 稀疏管孔

        var rid = ((Math.floor(d) % rings) + rings) % rings;
        var ringTone = (hash2(rid, 0, seed + 71) - 0.5) * 0.05;

        var t = 1.0 +
                (fiber - 0.5) * 0.09 +
                (micro - 0.5) * 0.05 +
                (w1 - 0.5) * 0.08 +
                ringTone -
                line * 0.30 -
                core * 0.14 -
                poreMask * 0.06 -
                knotMask * 0.42;

        var hgt = -line * 0.45 -
                  core * 0.18 +
                  (fiber - 0.5) * 0.32 +
                  (w2 - 0.5) * 0.16 +
                  (micro - 0.5) * 0.10 -
                  poreMask * 0.07 +
                  knotMask * 0.14;

        var rgh = 0.88 +
                  line * 0.10 +
                  core * 0.05 +
                  poreMask * 0.04 +
                  (micro - 0.5) * 0.09 +
                  (w1 - 0.5) * 0.05 +
                  knotMask * 0.05;

        var hh = (w1 - 0.5) * 0.8 +
                 line * 0.35 +
                 knotMask * 0.5 +
                 (fiber - 0.5) * 0.15;

        height[i] = hgt;
        tone[i] = clamp((t - TONE_MIN) / TONE_SPAN, 0, 1) * 255;
        hue[i] = clamp(hh, -1, 1) * 127;
        rough[i] = clamp(rgh, 0.5, 1) * 255;
      }
    }

    return { height: height, tone: tone, hue: hue, rough: rough };
  }

  /*
   * 青瓦：竖向瓦垄（每 4 垄一道高起的筒瓦）+ 每垄横向搭接的阴影 + 垄沟积灰。
   * 瓦垄沿 v 连续，所以整片屋面读起来是「竖瓦垄 + 横搭接」，不是方格。
   * 垄数、行数都是整数，u / v 两端严格对齐，可平铺。
   */
  function tileFields(N, cfg, seed) {
    var total = N * N;
    var height = new Float32Array(total);
    var tone = new Uint8Array(total);
    var hue = new Int8Array(total);
    var rough = new Uint8Array(total);

    var COLS = 8, ROWS = 8;
    var x, y, i;

    for (y = 0; y < N; y++) {
      var v = (y + 0.5) / N;
      for (x = 0; x < N; x++) {
        var u = (x + 0.5) / N;
        i = y * N + x;

        var cu = u * COLS, cv = v * ROWS;
        var ci = Math.floor(cu), cj = Math.floor(cv);
        var su = cu - ci;
        var gv = cv - cj;
        var col = ((ci % COLS) + COLS) % COLS;
        var row = ((cj % ROWS) + ROWS) % ROWS;

        var rib = Math.sin(Math.PI * su);              // 0 垄沟 → 1 瓦背
        var groove = 1 - rib;
        groove *= groove;                              // 沟底收窄

        /* 每 4 垄一道筒瓦，压得更高 */
        var cover = (col % 4 === 0) ? 1.0 : 0.62;

        var grain = fbm(u * 22, v * 18, 22, 18, 2, seed + 17);
        var dirt = fbm(u * 4, v * 3, 4, 3, 3, seed + 29);

        /* 搭接线随低频噪声轻微弯曲，避免整片屋顶读成方格 */
        var gvw = gv + (dirt - 0.5) * 0.05;
        var cd = Math.min(gvw, 1 - gvw);
        if (cd < 0) cd = 0;
        var lap = Math.exp(-(cd * cd) / 0.0064);

        var tileJit = (hash2(col, row, seed + 5) - 0.5) * 0.03;
        var ribTone = (hash2(col, 0, seed + 81) - 0.5) * 0.05;
        var courseTone = (hash2(0, row, seed + 91) - 0.5) * 0.04;

        /* 瓦背高光 / 瓦头下沿的受光窄带：打破纯网格的对称感 */
        var crest = rib * rib; crest *= crest; crest *= crest;   // 窄高光
        var lip = smoothstep(0.055, 0.11, gv) * (1 - smoothstep(0.11, 0.20, gv));

        /* 苔 / 积灰：偏在垄沟和搭接线里 */
        var moss = smoothstep(0.40, 0.80, dirt) * (groove * 0.70 + lap * 0.50);

        var t = 0.96 +
                tileJit +
                ribTone +
                courseTone +
                (rib - 0.5) * cover * 0.22 +
                crest * cover * 0.10 +
                lip * 0.08 -
                lap * 0.20 -
                groove * 0.05 +
                (grain - 0.5) * 0.08 -
                moss * 0.18;

        var hgt = rib * cover * 0.50 -
                  lap * 0.62 -
                  groove * 0.08 +
                  (grain - 0.5) * 0.07;

        var rgh = 0.88 -
                  rib * cover * 0.04 +
                  lap * 0.09 +
                  groove * 0.04 +
                  (grain - 0.5) * 0.08 +
                  moss * 0.05;

        var hh = -moss * 0.80 +
                 (dirt - 0.5) * 0.20;

        height[i] = hgt;
        tone[i] = clamp((t - TONE_MIN) / TONE_SPAN, 0, 1) * 255;
        hue[i] = clamp(hh, -1, 1) * 127;
        rough[i] = clamp(rgh, 0.5, 1) * 255;
      }
    }

    return { height: height, tone: tone, hue: hue, rough: rough };
  }

  /*
   * 暖灰石：大块色斑 + 细颗粒 + 稀疏麻点（pitting）+ 极弱的层理。
   */
  function stoneFields(N, cfg, seed) {
    var total = N * N;
    var height = new Float32Array(total);
    var tone = new Uint8Array(total);
    var hue = new Int8Array(total);
    var rough = new Uint8Array(total);

    var x, y, i;

    for (y = 0; y < N; y++) {
      var v = (y + 0.5) / N;
      for (x = 0; x < N; x++) {
        var u = (x + 0.5) / N;
        i = y * N + x;

        var n1 = fbm(u * 5, v * 5, 5, 5, 3, seed + 13);      // 大色斑
        var n2 = fbm(u * 18, v * 18, 18, 18, 2, seed + 27);  // 细颗粒
        var n3 = noise2(u * 72, v * 72, 72, 72, seed + 41);  // 矿粒
        var pitN = fbm(u * 26, v * 26, 26, 26, 2, seed + 59);

        var pit = smoothstep(0.62, 0.88, pitN);
        pit *= pit;
        var bed = Math.sin(v * Math.PI * 12) * 0.5 + 0.5;     // 弱层理，整数周期

        var t = 0.96 +
                (n1 - 0.5) * 0.18 +
                (n2 - 0.5) * 0.12 +
                (n3 - 0.5) * 0.06 +
                (bed - 0.5) * 0.04 -
                pit * 0.22;

        var hgt = (n1 - 0.5) * 0.55 +
                  (n2 - 0.5) * 0.28 +
                  (n3 - 0.5) * 0.10 +
                  (bed - 0.5) * 0.06 -
                  pit * 0.70;

        var rgh = 0.88 +
                  (n2 - 0.5) * 0.10 +
                  pit * 0.10 +
                  (n1 - 0.5) * 0.06;

        var hh = (n1 - 0.5) * 0.5 +
                 (n2 - 0.5) * 0.3 -
                 pit * 0.2;

        height[i] = hgt;
        tone[i] = clamp((t - TONE_MIN) / TONE_SPAN, 0, 1) * 255;
        hue[i] = clamp(hh, -1, 1) * 127;
        rough[i] = clamp(rgh, 0.5, 1) * 255;
      }
    }

    return { height: height, tone: tone, hue: hue, rough: rough };
  }

  /* ------------------------------------------------------------ 3. 贴图 */

  function makeDataTexture(THREE, data, N, cfg, isColor) {
    var tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = cfg.anisotropy;
    tex.flipY = false;
    tex.repeat.set(cfg.repeat[0], cfg.repeat[1]);
    if (isColor) tex.encoding = THREE.sRGBEncoding;
    tex.needsUpdate = true;
    return tex;
  }

  /* 由高度场求切线空间法线：n = normalize(-dh/du, -dh/dv, 1)，边界环绕。 */
  function makeNormalTexture(THREE, height, N, strength, cfg) {
    var data = new Uint8Array(N * N * 4);
    var p = 0, x, y;

    for (y = 0; y < N; y++) {
      var ym = (y === 0) ? N - 1 : y - 1;
      var yp = (y === N - 1) ? 0 : y + 1;
      var row = y * N, rowM = ym * N, rowP = yp * N;

      for (x = 0; x < N; x++) {
        var xm = (x === 0) ? N - 1 : x - 1;
        var xp = (x === N - 1) ? 0 : x + 1;

        var gx = -(height[row + xp] - height[row + xm]) * strength;
        var gy = -(height[rowP + x] - height[rowM + x]) * strength;
        var inv = 1 / Math.sqrt(gx * gx + gy * gy + 1);

        data[p++] = (gx * inv * 0.5 + 0.5) * 255;
        data[p++] = (gy * inv * 0.5 + 0.5) * 255;
        data[p++] = (inv * 0.5 + 0.5) * 255;
        data[p++] = 255;
      }
    }

    return makeDataTexture(THREE, data, N, cfg, false);
  }

  /* 粗糙度：灰度值原样写进 RGB（three 取 .g）。 */
  function makeRoughTexture(THREE, rough, N, cfg) {
    var data = new Uint8Array(N * N * 4);
    var p = 0;
    for (var i = 0; i < rough.length; i++) {
      var r = rough[i];
      data[p++] = r;
      data[p++] = r;
      data[p++] = r;
      data[p++] = 255;
    }
    return makeDataTexture(THREE, data, N, cfg, false);
  }

  /* albedo：把色号烘进明度场，同时带一点冷暖偏移。 */
  function makeAlbedoTexture(THREE, hex, det, cfg) {
    var N = det.size;
    var toneArr = det.tone;
    var hueArr = det.hue;

    var canvas = document.createElement('canvas');
    canvas.width = canvas.height = N;
    var ctx = canvas.getContext('2d');
    var img = ctx.createImageData(N, N);
    var data = img.data;

    var r0 = ((hex >> 16) & 255) / 255;
    var g0 = ((hex >> 8) & 255) / 255;
    var b0 = (hex & 255) / 255;

    var i, p = 0;
    for (i = 0; i < toneArr.length; i++) {
      var t = TONE_MIN + (toneArr[i] / 255) * TONE_SPAN;
      var h = hueArr[i] / 127;
      var lift = (1 - t) * 0.04;      // 凹处补一点散射，避免暗木直接压成黑

      var r = r0 * t * (1 + h * 0.055) + lift;
      var g = g0 * t * (1 - h * 0.006) + lift;
      var b = b0 * t * (1 - h * 0.060) + lift;

      data[p++] = r * 255;
      data[p++] = g * 255;
      data[p++] = b * 255;
      data[p++] = 255;
    }

    ctx.putImageData(img, 0, 0);

    var tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.flipY = false;
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = cfg.anisotropy;
    tex.repeat.set(cfg.repeat[0], cfg.repeat[1]);
    tex.needsUpdate = true;
    return tex;
  }

  /* ------------------------------------------------------------ 4. 缓存与组装 */

  function fitSize(n) {
    n = +n || MAX_SIZE;
    var s = MIN_SIZE;
    while (s * 2 <= n && s < MAX_SIZE) s *= 2;
    return s;
  }

  function normRepeat(r) {
    var x, y;
    if (r === undefined || r === null) return [1, 1];
    if (typeof r === 'number') { x = y = r; }
    else { x = r[0]; y = r[1] === undefined ? r[0] : r[1]; }
    x = +x; y = +y;
    if (!isFinite(x) || x <= 0) x = 1;
    if (!isFinite(y) || y <= 0) y = 1;
    return [x, y];
  }

  function makeConfig(kind, opts) {
    var D = DEFAULTS[kind];
    opts = opts || {};
    var isWood = kind === 'wood';

    var aniso = opts.anisotropy !== undefined ? opts.anisotropy : (GLOBAL.anisotropy || D.anisotropy);

    return {
      kind: kind,
      size: fitSize(opts.size !== undefined ? opts.size : D.size),
      repeat: normRepeat(opts.repeat !== undefined ? opts.repeat : D.repeat),
      anisotropy: clamp(Math.round(aniso), 1, 16),
      roughness: opts.roughness !== undefined ? clamp(+opts.roughness, 0.05, 1) : D.roughness,
      normalScale: opts.normalScale !== undefined ? clamp(+opts.normalScale, 0, 3) : D.normalScale,
      /* 只有木材用得到这几个参数；瓦/石固定住，免得无意义的 cache key 分叉 */
      grainScale: isWood ? clamp(opts.grainScale !== undefined ? +opts.grainScale : (D.grainScale || 1), 0.4, 3) : 1,
      knots: isWood ? clamp(Math.round(opts.knots !== undefined ? +opts.knots : (D.knots || 0)), 0, 6) : 0,
      grainAxis: (isWood && opts.grainAxis === 'u') ? 'u' : 'v',
      seed: (opts.seed !== undefined ? opts.seed : D.seed) | 0
    };
  }

  function detailKey(kind, cfg) {
    return kind + '|' + cfg.size +
           '|' + cfg.repeat[0] + 'x' + cfg.repeat[1] +
           '|' + cfg.anisotropy +
           '|' + cfg.grainScale +
           '|' + cfg.knots +
           '|' + cfg.grainAxis +
           '|' + cfg.seed;
  }

  function getDetail(THREE, kind, cfg) {
    var key = detailKey(kind, cfg);
    var rec = DETAILS[key];
    if (rec) return rec;

    var f;
    if (kind === 'tile') f = tileFields(cfg.size, cfg, cfg.seed);
    else if (kind === 'stone') f = stoneFields(cfg.size, cfg, cfg.seed);
    else {
      f = woodFields(cfg.size, cfg, cfg.seed);
      if (cfg.grainAxis === 'u') transposeFields(f, cfg.size);
    }

    var normal = makeNormalTexture(THREE, f.height, cfg.size, NORMAL_STRENGTH[kind] || 1.4, cfg);
    var rough = makeRoughTexture(THREE, f.rough, cfg.size, cfg);

    rec = {
      key: key,
      kind: kind,
      size: cfg.size,
      normal: normal,
      rough: rough,
      tone: f.tone,
      hue: f.hue
    };
    DETAILS[key] = rec;

    STAT.textures += 2;
    STAT.bytes += bytesFor(cfg.size) * 2;
    STAT.fields += cfg.size * cfg.size * 2;   // tone(Uint8) + hue(Int8)
    return rec;
  }

  function getAlbedo(THREE, kind, hex, det, cfg) {
    var key = 'a|' + (hex >>> 0).toString(16) + '|' + det.key;
    var tex = ALBEDOS[key];
    if (tex) return tex;

    tex = makeAlbedoTexture(THREE, hex, det, cfg);
    ALBEDOS[key] = tex;
    STAT.textures += 1;
    STAT.bytes += bytesFor(det.size);
    return tex;
  }

  function buildMaterial(THREE, kind, hex, cfg) {
    var det = getDetail(THREE, kind, cfg);
    var albedo = getAlbedo(THREE, kind, hex, det, cfg);

    var m = new THREE.MeshStandardMaterial({
      color: 0xffffff,          // 颜色已烘进 albedo
      map: albedo,
      normalMap: det.normal,
      roughnessMap: det.rough,
      roughness: clamp(cfg.roughness / ROUGH_MEAN, 0, 1),
      metalness: 0
    });

    m.normalScale.set(cfg.normalScale, cfg.normalScale);
    m.userData.bridgeMaterial = {
      kind: kind,
      color: hex,
      detail: det.key,
      roughness: cfg.roughness
    };
    return m;
  }

  /* ------------------------------------------------------------ 5. 公开 API */

  function assertThree(THREE) {
    if (!THREE || !THREE.MeshStandardMaterial || !THREE.DataTexture || !THREE.CanvasTexture) {
      throw new Error('BridgeMaterials: 需要先加载 three r128（MeshStandardMaterial / DataTexture / CanvasTexture）');
    }
  }

  function toHex(v) {
    if (typeof v === 'string') {
      var s = v.charAt(0) === '#' ? v.slice(1) : v;
      var n = parseInt(s, 16);
      return isFinite(n) ? (n & 0xffffff) : 0xffffff;
    }
    if (v && v.isColor) return v.getHex() & 0xffffff;
    return (v === undefined || v === null) ? 0xffffff : (v & 0xffffff);
  }

  /**
   * 木材。返回的材质 color 为白色，颜色在 albedo 里；贴图按 key 缓存。
   * @param {Object} THREE
   * @param {number|string} hex   sRGB 色号（不要传已 convertSRGBToLinear 的 Color）
   * @param {Object} opts         { roughness, grainScale, knots, repeat, size, anisotropy,
   *                                normalScale, grainAxis:'v'|'u', seed }
   *                              grainAxis 默认 'v'（沿构件长度）；'u' 用于横纹板材 / 对齐旧贴图
   */
  function wood(THREE, hex, opts) {
    assertThree(THREE);
    var cfg = makeConfig('wood', opts);
    return buildMaterial(THREE, 'wood', toHex(hex), cfg);
  }

  /**
   * 青瓦。opts = { color, repeat, size, anisotropy, roughness, normalScale, seed }
   */
  function tile(THREE, opts) {
    assertThree(THREE);
    opts = opts || {};
    var cfg = makeConfig('tile', opts);
    var hex = toHex(opts.color !== undefined ? opts.color : DEFAULTS.tile.color);
    return buildMaterial(THREE, 'tile', hex, cfg);
  }

  /**
   * 暖灰石。opts = { color, repeat, size, anisotropy, roughness, normalScale, seed }
   */
  function stone(THREE, opts) {
    assertThree(THREE);
    opts = opts || {};
    var cfg = makeConfig('stone', opts);
    var hex = toHex(opts.color !== undefined ? opts.color : DEFAULTS.stone.color);
    return buildMaterial(THREE, 'stone', hex, cfg);
  }

  /*
   * 贴图变换：尽量复用缓存实例；只有需要跟原 map 的 repeat/offset/rotation 对齐时才 clone。
   * clone 共享 canvas / typed array，不重新生成像素。
   */
  function fitted(THREE, tex, rep, src) {
    var rot = src ? src.rotation : 0;
    var ox = src ? src.offset.x : 0;
    var oy = src ? src.offset.y : 0;

    if (Math.abs(rep[0] - tex.repeat.x) < 1e-6 &&
        Math.abs(rep[1] - tex.repeat.y) < 1e-6 &&
        Math.abs(rot - tex.rotation) < 1e-6 &&
        Math.abs(ox - tex.offset.x) < 1e-6 &&
        Math.abs(oy - tex.offset.y) < 1e-6) {
      return tex;
    }

    var key = tex.uuid + '|' + rep[0] + ',' + rep[1] + '|' + rot + '|' + ox + ',' + oy;
    if (FITTED[key]) return FITTED[key];

    var t = tex.clone();
    t.repeat.set(rep[0], rep[1]);
    t.rotation = rot;
    t.offset.set(ox, oy);
    if (src) {
      t.wrapS = src.wrapS;
      t.wrapT = src.wrapT;
      t.center.copy(src.center);
      t.anisotropy = src.anisotropy || tex.anisotropy;
    } else {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
    }
    t.needsUpdate = true;

    FITTED[key] = t;
    STAT.textures += 1;
    STAT.bytes += bytesFor(tex.image && tex.image.width ? tex.image.width : 512);
    return t;
  }

  /**
   * 给现有材质补 normal / roughness，保留原 color 与 map（clone 后返回）。
   * 会清掉旧 bumpMap（避免和 normalMap 叠加出脏边）。
   * @param {Object} THREE
   * @param {THREE.Material} material
   * @param {'wood'|'tile'|'stone'} kind
   * @param {Object} opts  { repeat, size, anisotropy, normalScale, grainAxis, seed }
   */
  function upgrade(THREE, material, kind, opts) {
    assertThree(THREE);
    if (!material) return null;

    kind = (kind === 'tile' || kind === 'stone') ? kind : 'wood';
    opts = opts || {};

    /*
     * 贴图统一按 1×1 生成，变换放到 clone 上，避免互踩。
     * tile 默认 1×2：旧 TILE_TEX 是 16 道横垄 / 8 列，本层是 8 垄 / 8 条瓦垄，
     * 乘 2 之后横垄才对得上；换成自己的 albedo 时记得显式传 repeat。
     */
    var mult = opts.repeat !== undefined ? normRepeat(opts.repeat) : (kind === 'tile' ? [1, 2] : [1, 1]);
    var cfg = makeConfig(kind, opts);
    cfg.repeat = [1, 1];
    /* 旧 WOOD_TEX 的纹是横的（沿 u），默认转置一套法线去对齐；显式传 grainAxis 可覆盖 */
    if (kind === 'wood' && opts.grainAxis === undefined) cfg.grainAxis = 'u';

    var det = getDetail(THREE, kind, cfg);
    var m = material.clone();
    var src = m.map || null;

    var rep = [mult[0], mult[1]];
    if (src) {
      rep[0] *= src.repeat.x;
      rep[1] *= src.repeat.y;
    }

    if (m.isMeshStandardMaterial) {
      m.normalMap = fitted(THREE, det.normal, rep, src);
      m.roughnessMap = fitted(THREE, det.rough, rep, src);
      m.normalScale.set(
        opts.normalScale !== undefined ? clamp(+opts.normalScale, 0, 3) : 0.55,
        opts.normalScale !== undefined ? clamp(+opts.normalScale, 0, 3) : 0.55
      );
      if (m.roughness !== undefined) m.roughness = clamp(m.roughness / ROUGH_MEAN, 0, 1);
      if (m.bumpMap) { m.bumpMap = null; m.bumpScale = 0; }
      m.needsUpdate = true;
    } else if (m.normalMap !== undefined) {
      /* 非 Standard（如 Phong）：只补法线，不动颜色 */
      m.normalMap = fitted(THREE, det.normal, rep, src);
      m.needsUpdate = true;
    }

    return m;
  }

  /** 释放所有缓存贴图与中间场数据。之后再调用会重新生成。 */
  function dispose() {
    var k;
    for (k in DETAILS) {
      DETAILS[k].normal.dispose();
      DETAILS[k].rough.dispose();
      DETAILS[k].tone = null;
      DETAILS[k].hue = null;
    }
    for (k in ALBEDOS) ALBEDOS[k].dispose();
    for (k in FITTED) FITTED[k].dispose();

    DETAILS = Object.create(null);
    ALBEDOS = Object.create(null);
    FITTED = Object.create(null);
    STAT.textures = 0;
    STAT.bytes = 0;
    STAT.fields = 0;
  }

  /** 纹理统计，用于验收 / 性能记录。 */
  function stats() {
    return {
      textures: STAT.textures,
      approxBytes: Math.round(STAT.bytes),
      fieldBytes: STAT.fields,
      details: Object.keys(DETAILS).length,
      albedos: Object.keys(ALBEDOS).length,
      fitted: Object.keys(FITTED).length
    };
  }

  var BridgeMaterials = {
    version: '1.0.0',
    defaults: GLOBAL,
    wood: wood,
    tile: tile,
    stone: stone,
    upgrade: upgrade,
    dispose: dispose,
    stats: stats
  };

  global.BridgeMaterials = BridgeMaterials;

}(typeof window !== 'undefined' ? window : this));
