/*!
 * 编梁 · 北涧桥 — 环境层
 * 桥外的一条溪、两岸青山、低山水雾。纯程序生成，无外部贴图 / 模型。
 *
 * 色板（sRGB，注释里的值就是调色时用的值）：
 *   天顶   #58A7D4   天边   #E2EFF0   日光   #FFE7C2   雾   #DFEAE2
 *   远山   #7EA1AA / #4F7B76 / #2F5B45（由远到近，青蓝 → 青绿）
 *   草坡   #5D8A49   深林   #3E6539   土     #7D7353   湿石 #66735E
 *   溪水   深 #1D6B67   浅 #58A08D   波光 #D6EFE0
 *   木色沿用桥体：杉木 #B08F63、老木 #7D3B28、青瓦 #9AA0A2
 *
 * 用法：
 *   var env = BridgeEnv.build(scene, THREE, { lights: true });
 *   // 每帧：env.update(clock.elapsedTime);
 *   // 清理：env.dispose();
 *
 * 坐标约定（与 index.html 一致）：
 *   桥半跨 X=14.5，水面 WATER_Y=-5.00，桥面 6.32（离水 11.22）。
 *   溪流沿 z 流动，水面宽约 26.4 m，桥台石外缘 |x|=13.2 正好压在水线上，
 *   两岸在 |x|=20.5 抬成台地（东 2.67 / 西 1.07），石阶和桥头屋都落在台地上。
 *
 * 复杂度：默认约 9k–11k 三角面，全部不投影；low 质量再减一半。
 */
(function (global) {
  'use strict';

  var PALETTE = {
    skyZenith: 0x58a7d4,
    skyHorizon: 0xe2eff0,
    sunWarm: 0xffe7c2,
    haze: 0xdfeae2,
    mountainNear: 0x2f5b45,
    mountainNearTop: 0x457054,
    mountainMid: 0x4f7b76,
    mountainMidTop: 0x689189,
    mountainFar: 0x7ea1aa,
    mountainFarTop: 0x9dbac0,
    grass: 0x5d854b,
    forest: 0x3a5f3c,
    earth: 0x7d7353,
    wetStone: 0x66735e,
    waterDeep: 0x0d4043,
    waterShallow: 0x39756c,
    waterCrest: 0xd2ead8,
    pine: 0x37612f,
    pineLight: 0x446e3e,
    broadleaf: 0x446f34,
    broadleafLight: 0x557c42,
    trunk: 0x624a34,
    rock: 0x848b7d
  };

  var COORDS = {
    bridgeHalfSpan: 14.5,
    groundY: -5.9,
    bedY: -6.2,
    waterY: -5.0,
    abutmentFace: 13.2,
    rockFaceOut: 14.8,
    shelfY: 0.1,
    terraceIn: 18.6,
    terraceEdge: 19.0,
    terraceOut: 30,
    terraceEast: 2.67,
    terraceWest: 1.07,
    riverHalfWidth: 20,
    riverLength: 220
  };

  function BridgeEnv() {}

  BridgeEnv.palette = PALETTE;
  BridgeEnv.coords = COORDS;

  /* ------------------------------------------------------------ 地形 */
  /* 峡谷横断面（从左岸到右岸）：
   *   |x| < 13.2  河床 −6.20（被水面盖住）
   *   13.2…15.9   贴着桥台石的陡崖，从 −5.90 抬到 −1.60（很陡但不是直墙）
   *   15.9…18.6   崖下岩台缓坡，散大块石，抬到 0.10
   *   18.6…19.0   岸坡抬到台地（东 2.67 / 西 1.07）
   *   19.0…30     台地：桥头石阶、桥头屋落脚的地方
   *   > 30        山坡继续上去
   * 台地高差来自实测：桥面 6.32 距水面 11.22，东岸台地高、西岸低，
   * 所以东 16 级、西 26 级石阶，都落在 6.32 的桥面上。
   * 纯函数，index.html 也用它来放石阶、将军柱、桥头屋。
   */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function ripple(xAbs, z, side, amp) {
    return Math.sin(z * 0.075 + side * 1.9) * amp * 0.55 +
      Math.sin(z * 0.028 - xAbs * 0.13 + side) * amp * 1.1 +
      Math.sin(z * 0.19 + xAbs * 0.47) * amp * 0.22;
  }

  function smoothStep(t) { return t * t * (3 - 2 * t); }

  /* 廉价二维值噪声 0..1：给地形顶点色加中频色斑，打散大块平涂 */
  function vnoise(x, z, seed) {
    var xi = Math.floor(x), zi = Math.floor(z);
    var xf = x - xi, zf = z - zi;
    function h(ix, iz) {
      var n = (ix * 374761393 + iz * 668265263 + seed * 1442695041) | 0;
      n = (n ^ (n >> 13)) | 0;
      n = (n * 1274126177) | 0;
      return ((n ^ (n >> 16)) >>> 0) / 4294967296;
    }
    var u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
    return h(xi, zi) * (1 - u) * (1 - v) + h(xi + 1, zi) * u * (1 - v) +
      h(xi, zi + 1) * (1 - u) * v + h(xi + 1, zi + 1) * u * v;
  }

  function terrainY(x, z) {
    var xAbs = Math.abs(x);
    var side = x < 0 ? -1 : 1;
    var terrace = side > 0 ? COORDS.terraceEast : COORDS.terraceWest;
    if (xAbs <= COORDS.abutmentFace) return COORDS.bedY;
    if (xAbs < 15.9) {
      // 桥台外的陡崖：贴着桥台石，仍很陡但不再是直墙（−5.90 → −1.60）
      var k0 = (xAbs - COORDS.abutmentFace) / (15.9 - COORDS.abutmentFace);
      return -5.90 + (-1.60 + 5.90) * smoothStep(k0) +
        ripple(xAbs, z, side, 0.16 * k0);
    }
    if (xAbs < COORDS.terraceIn) {
      // 崖下的岩台缓坡，散着大块石（−1.60 → 0.10）
      var k1 = (xAbs - 15.9) / (COORDS.terraceIn - 15.9);
      return -1.60 + (COORDS.shelfY + 1.60) * smoothStep(k1) +
        ripple(xAbs, z, side, 0.09);
    }
    if (xAbs < COORDS.terraceEdge) {
      var k2 = (xAbs - COORDS.terraceIn) / (COORDS.terraceEdge - COORDS.terraceIn);
      return COORDS.shelfY + (terrace - COORDS.shelfY) * smoothStep(k2) +
        ripple(xAbs, z, side, 0.04);
    }
    if (xAbs < COORDS.terraceOut) {
      return terrace + ripple(xAbs, z, side, 0.05);
    }
    var t = xAbs - COORDS.terraceOut;
    var h = terrace + 0.34 * t + 0.0075 * t * t;
    if (h > 10) h = 10 + (h - 10) * 0.08;
    return h + ripple(xAbs, z, side, 0.30 * (t / (t + 3.5)));
  }

  BridgeEnv.terrainY = terrainY;

  /* ------------------------------------------------------------ 小工具 */

  function color(THREE, hex) {
    return new THREE.Color(hex).convertSRGBToLinear();
  }

  function makeRng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function clamp01(v) {
    return v < 0 ? 0 : (v > 1 ? 1 : v);
  }

  function radialTexture(THREE, inner, mid, size, blobs, rnd) {
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var g = c.getContext('2d');
    g.clearRect(0, 0, size, size);
    var half = size * 0.5;
    var grd = g.createRadialGradient(half, half, size * 0.02, half, half, half);
    grd.addColorStop(0, 'rgba(255,255,255,' + inner + ')');
    grd.addColorStop(0.42, 'rgba(255,255,255,' + mid + ')');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    for (var i = 0; i < blobs; i++) {
      var bx = size * (0.28 + rnd() * 0.44);
      var by = size * (0.28 + rnd() * 0.44);
      var br = size * (0.10 + rnd() * 0.16);
      var b = g.createRadialGradient(bx, by, 1, bx, by, br);
      b.addColorStop(0, 'rgba(255,255,255,' + (mid * 0.55) + ')');
      b.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = b;
      g.beginPath();
      g.arc(bx, by, br, 0, Math.PI * 2);
      g.fill();
    }
    var tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  /* ------------------------------------------------------------ 主入口 */

  BridgeEnv.build = function (scene, THREE, opts) {
    if (!scene || !THREE) {
      throw new Error('BridgeEnv.build(scene, THREE, opts) needs a THREE scene and namespace.');
    }
    opts = opts || {};

    var low = opts.quality === 'low';
    var rnd = makeRng(opts.seed === undefined ? 20261022 : opts.seed);
    var group = new THREE.Group();
    group.name = 'BridgeEnv';

    var geos = [];
    var mats = [];
    var texs = [];
    var disposed = false;

    function geo(g) { geos.push(g); return g; }
    function mat(m) { mats.push(m); return m; }
    function tex(t) { texs.push(t); return t; }

    var sunDir = new THREE.Vector3(0.52, 0.70, 0.44).normalize();

    var cZenith = color(THREE, PALETTE.skyZenith);
    var cHorizon = color(THREE, PALETTE.skyHorizon);
    var cWarm = color(THREE, PALETTE.sunWarm);

    /* ---------------------------------------------------------- 1. 天 */
    var skyGeo = geo(new THREE.SphereGeometry(230, low ? 20 : 32, low ? 10 : 16));
    var pos = skyGeo.attributes.position;
    var skyColors = new Float32Array(pos.count * 3);
    var dir = new THREE.Vector3();
    var cTmp = new THREE.Color();
    for (var si = 0; si < pos.count; si++) {
      dir.set(pos.getX(si), pos.getY(si), pos.getZ(si)).normalize();
      var up = clamp01(dir.y);
      cTmp.copy(cHorizon).lerp(cZenith, Math.pow(up, 0.40));
      var glow = Math.pow(Math.max(0, dir.dot(sunDir)), 5) * (1 - up * 0.32);
      cTmp.lerp(cWarm, glow * 0.62);
      skyColors[si * 3] = cTmp.r;
      skyColors[si * 3 + 1] = cTmp.g;
      skyColors[si * 3 + 2] = cTmp.b;
    }
    skyGeo.setAttribute('color', new THREE.BufferAttribute(skyColors, 3));
    var skyMat = mat(new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false
    }));
    var sky = new THREE.Mesh(skyGeo, skyMat);
    sky.name = 'env-sky';
    sky.frustumCulled = false;
    group.add(sky);

    /* 日轮：一张程序化的柔光贴图，两个 sprite 叠出光晕。 */
    var sunTex = tex(radialTexture(THREE, 0.95, 0.30, 256, 0, rnd));
    var sunMatCore = mat(new THREE.SpriteMaterial({
      map: sunTex, color: 0xfff4d9, transparent: true, opacity: 0.92,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false
    }));
    var sunCore = new THREE.Sprite(sunMatCore);
    sunCore.position.copy(sunDir).multiplyScalar(198);
    sunCore.scale.set(16, 16, 1);
    group.add(sunCore);

    var sunMatHalo = mat(new THREE.SpriteMaterial({
      map: sunTex, color: 0xffe9c4, transparent: true, opacity: 0.20,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false
    }));
    var sunHalo = new THREE.Sprite(sunMatHalo);
    sunHalo.position.copy(sunCore.position);
    sunHalo.scale.set(78, 78, 1);
    group.add(sunHalo);

    /* ---------------------------------------------------------- 2. 远山 */
    /* 三圈完整的山脊环，相机绕桥转的时候背面也有山。 */
    function ridgeAt(a, baseH, amp, phase) {
      return baseH + amp * (
        0.55 * Math.sin(a * 3.0 + phase) +
        0.28 * Math.sin(a * 7.0 - phase * 1.7) +
        0.17 * Math.sin(a * 13.0 + phase * 2.1)
      );
    }

    function makeRidge(radius, baseH, amp, phase, lowHex, highHex) {
      var seg = low ? 64 : 96;
      var rows = 3;
      var verts = [];
      var cols = [];
      var idx = [];
      var lo = color(THREE, lowHex);
      var hi = color(THREE, highHex);
      var baseY = -7.5;

      for (var i = 0; i <= seg; i++) {
        var a = (i / seg) * Math.PI * 2;
        var r = radius + Math.sin(a * 4.0 + phase) * 1.8;
        var ridge = ridgeAt(a, baseH, amp, phase);
        for (var j = 0; j < rows; j++) {
          var t = j / (rows - 1);
          var y = baseY + (ridge - baseY) * t;
          verts.push(Math.cos(a) * r, y, Math.sin(a) * r);
          cTmp.copy(lo).lerp(hi, Math.pow(t, 1.25));
          var n = Math.sin(a * 9.0 + t * 2.0 + phase) * 0.035;
          cols.push(cTmp.r + n, cTmp.g + n, cTmp.b + n * 0.7);
        }
      }
      for (var k = 0; k < seg; k++) {
        for (var row = 0; row < rows - 1; row++) {
          var a0 = k * rows + row;
          var b0 = a0 + rows;
          idx.push(a0, a0 + 1, b0, a0 + 1, b0 + 1, b0);
        }
      }
      var g = geo(new THREE.BufferGeometry());
      g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      g.setIndex(idx);
      var m = mat(new THREE.MeshBasicMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        fog: true
      }));
      var mesh = new THREE.Mesh(g, m);
      mesh.name = 'env-mountain';
      group.add(mesh);
      return mesh;
    }

    makeRidge(88, 15.0, 4.6, 0.7, PALETTE.mountainNear, PALETTE.mountainNearTop);
    makeRidge(130, 23.0, 6.8, 2.9, PALETTE.mountainMid, PALETTE.mountainMidTop);
    makeRidge(172, 33.0, 9.0, 5.1, PALETTE.mountainFar, PALETTE.mountainFarTop);

    /* ---------------------------------------------------------- 3. 两岸 */
    /* 断面在文件头部 terrainY()，这里只按岸别转发，保证地形与石阶同源。 */
    function bankHeight(xAbs, z, side) { return terrainY(side * xAbs, z); }

    var cGrass = color(THREE, PALETTE.grass);
    var cForest = color(THREE, PALETTE.forest);
    var cEarth = color(THREE, PALETTE.earth);
    var cWet = color(THREE, PALETTE.wetStone);
    var cRock = color(THREE, PALETTE.rock);
    var cBank = new THREE.Color();

    /* 草地微粒贴图：灰阶斑驳，乘在顶点色上，把大面积平涂打散成草簇 */
    var grassTex = tex((function () {
      var c = document.createElement('canvas');
      c.width = c.height = 256;
      var g = c.getContext('2d');
      g.fillStyle = '#f4f4f4';
      g.fillRect(0, 0, 256, 256);
      for (var i = 0; i < 2600; i++) {
        var x = rnd() * 256, y = rnd() * 256, r = 1 + rnd() * 2.6;
        var dark = rnd() < 0.55;
        g.fillStyle = dark
          ? 'rgba(58,78,40,' + (0.05 + rnd() * 0.09) + ')'
          : 'rgba(238,242,224,' + (0.05 + rnd() * 0.08) + ')';
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      }
      g.strokeStyle = 'rgba(52,74,36,0.08)';
      g.lineWidth = 1;
      for (var j = 0; j < 420; j++) {
        var bx = rnd() * 256, by = rnd() * 256;
        var a = rnd() * Math.PI * 2, l = 3 + rnd() * 7;
        g.beginPath(); g.moveTo(bx, by);
        g.lineTo(bx + Math.cos(a) * l, by + Math.sin(a) * l);
        g.stroke();
      }
      var t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.encoding = THREE.sRGBEncoding;
      t.anisotropy = 4;
      return t;
    })());

    function bankColor(xAbs, z, y, out) {
      var n = Math.sin(xAbs * 1.7 + z * 0.9) * 0.5 + 0.5;
      var w = COORDS.waterY;
      if (y < w + 0.55) {
        out.copy(cWet).lerp(cEarth, clamp01((y - w) / 0.6));
      } else if (y < w + 2.8) {
        out.copy(cEarth).lerp(cGrass, clamp01((y - w - 0.55) / 2.25));
      } else {
        out.copy(cGrass).lerp(cForest, clamp01((y - w - 2.8) / 9.0));
      }
      // 峡谷陡崖与水线湿石：越靠河心越像石头（按 x 判断，不按高度，
      // 否则台地那 2.5 m 的岸壁会被染成草绿色）
      var rocky = clamp01((19.8 - xAbs) / 1.6) * clamp01((w + 8.2 - y) / 4.0);
      var cliff = clamp01((17.2 - xAbs) / 3.2) * clamp01((4.5 - y) / 6.5);
      rocky = Math.max(rocky, cliff * 0.9);
      if (rocky > 0) out.lerp(cRock, rocky * 0.78);
      out.offsetHSL(0, 0.02 * (n - 0.5), 0.035 * (n - 0.5));
      // 中频草斑与干湿变化（特征 ~8 m，顶点间距 ~4 m，采样充分）
      var patch = vnoise(xAbs * 0.13, z * 0.13, 7);
      out.offsetHSL((patch - 0.5) * 0.045, (patch - 0.5) * 0.05, (patch - 0.5) * 0.11);
      return out;
    }

    function buildBank(side) {
      var xs = low
        ? [13.2, 13.7, 14.2, 14.8, 15.6, 16.5, 17.5, 18.2, 18.6, 18.8, 19.0, 20.5, 22, 24, 26.5, 30, 36, 44, 56, 70, 86]
        : [13.2, 13.5, 13.8, 14.1, 14.4, 14.8, 15.2, 15.7, 16.2, 16.8, 17.3, 17.8, 18.2, 18.6, 18.8, 19.0, 19.6, 20.5, 21.4, 22.5, 24, 26, 28.5, 31, 34, 38, 44, 52, 62, 74, 86];
      var zSeg = low ? 30 : 58;
      var verts = [];
      var cols = [];
      var uvs = [];
      var idx = [];

      for (var i = 0; i < xs.length; i++) {
        var xAbs = xs[i];
        var x = side * xAbs;
        for (var j = 0; j <= zSeg; j++) {
          var z = -110 + (220 * j) / zSeg;
          var y = bankHeight(xAbs, z, side);
          verts.push(x, y, z);
          uvs.push(x / 7, z / 7);
          bankColor(xAbs, z, y, cBank);
          cols.push(cBank.r, cBank.g, cBank.b);
        }
      }
      for (var ci = 0; ci < xs.length - 1; ci++) {
        for (var cj = 0; cj < zSeg; cj++) {
          var a = ci * (zSeg + 1) + cj;
          var b = a + (zSeg + 1);
          var c = a + 1;
          var d = b + 1;
          if (side < 0) {
            idx.push(a, b, c, b, d, c);
          } else {
            idx.push(a, c, b, b, c, d);
          }
        }
      }
      var g = geo(new THREE.BufferGeometry());
      g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      var m = mat(new THREE.MeshLambertMaterial({ vertexColors: true, map: grassTex }));
      var mesh = new THREE.Mesh(g, m);
      mesh.name = 'env-bank-' + (side > 0 ? 'right' : 'left');
      group.add(mesh);
    }

    buildBank(-1);
    buildBank(1);

    /* ---------------------------------------------------------- 4. 溪 */
    /* 平面只有 2 个三角面，波纹全在片元里算；雾走 three 的 fog chunk。 */
    var waterUniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uDeep: { value: color(THREE, PALETTE.waterDeep) },
        uShallow: { value: color(THREE, PALETTE.waterShallow) },
        uCrest: { value: color(THREE, PALETTE.waterCrest) }
      }
    ]);

    var waterMat = mat(new THREE.ShaderMaterial({
      uniforms: waterUniforms,
      fog: true,
      vertexShader: [
        'varying vec2 vUv;',
        'varying vec3 vWorld;',
        '#include <fog_pars_vertex>',
        'void main() {',
        '  vUv = uv;',
        '  vec4 world = modelMatrix * vec4(position, 1.0);',
        '  vWorld = world.xyz;',
        '  vec4 mvPosition = viewMatrix * world;',
        '  gl_Position = projectionMatrix * mvPosition;',
        '  #include <fog_vertex>',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform float uTime;',
        'uniform vec3 uDeep;',
        'uniform vec3 uShallow;',
        'uniform vec3 uCrest;',
        'varying vec2 vUv;',
        'varying vec3 vWorld;',
        '#include <fog_pars_fragment>',
        'void main() {',
        '  float across = abs(vUv.x - 0.5) * 2.0;',
        '  vec3 col = mix(uDeep, uShallow, smoothstep(0.10, 1.0, across) * 0.32);',
        '  float flow = vUv.y * 95.0 - uTime * 0.7 + sin(vUv.x * 7.0 + uTime * 0.08) * 1.1;',
        '  float a = sin(flow) * 0.5 + 0.5;',
        '  float b = sin(flow * 2.3 + vUv.x * 23.0 + uTime * 0.37) * 0.5 + 0.5;',
        '  float crest = smoothstep(0.78, 0.98, a * 0.68 + b * 0.32);',
        '  col = mix(col, uCrest, crest * 0.055);',
        '  float band = sin(vUv.y * 15.0 - uTime * 0.18 + vUv.x * 4.0) * 0.5 + 0.5;',
        '  col = mix(col, uShallow, band * 0.035);',
        '  gl_FragColor = vec4(col, 1.0);',
        '  #include <tonemapping_fragment>',
        '  #include <encodings_fragment>',
        '  #include <fog_fragment>',
        '}'
      ].join('\n')
    }));

    var waterGeo = geo(new THREE.PlaneGeometry(COORDS.riverHalfWidth * 2, COORDS.riverLength, 1, 1));
    var water = new THREE.Mesh(waterGeo, waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = COORDS.waterY;
    water.name = 'env-river';
    group.add(water);
    var waterTime = waterMat.uniforms.uTime;

    /* ---------------------------------------------------------- 5. 树 */
    /* 两岸的低模松与阔叶，全部 InstancedMesh，共享几何与材质。 */
    var plants = [];
    var pines = [];
    var broads = [];

    function canPlant(x, z) {
      // 桥头屋四幢（x ±17.3..23.7, z ±2.9..7.4）与石阶口不种树
      if (Math.abs(x) > 15.5 && Math.abs(x) < 25.5 && Math.abs(z) < 9.0) return false;
      for (var i = 0; i < plants.length; i++) {
        var dx = plants[i].x - x;
        var dz = plants[i].z - z;
        if (dx * dx + dz * dz < 6.25) return false;
      }
      return true;
    }

    function plant(kind, xAbs, z, scale) {
      var side = rnd() < 0.5 ? -1 : 1;
      var x = side * xAbs;
      if (!canPlant(x, z)) return false;
      // 默认机位在 z=72 望向桥：z>18 且靠河的两岸不种树，避免挡镜头
      if (z > 18 && xAbs < 40) return false;
      var y = bankHeight(xAbs, z, side);
      if (y < COORDS.waterY + 0.45) return false; // 太靠水，根系泡在溪里
      var item = { x: x, z: z, y: y, s: scale, side: side };
      plants.push(item);
      if (kind === 'pine') pines.push(item); else broads.push(item);
      return true;
    }

    var pineTarget = low ? 26 : 46;
    var broadTarget = low ? 16 : 30;

    // 两棵近桥的树，先定下来，给桥头一点重量（东岸大阔叶呼应千年樟树）
    plant('broad', -21.5, 11.5, 1.6);
    plant('pine', 21.4, -8.0, 1.3);

    var guard = 0;
    while (pines.length < pineTarget && guard++ < 800) {
      var px = 20.6 + Math.pow(rnd(), 1.45) * 42;
      var pz = -84 + rnd() * 168;
      plant('pine', px, pz, 0.85 + rnd() * 0.55);
    }
    guard = 0;
    while (broads.length < broadTarget && guard++ < 800) {
      var bx = 20.6 + Math.pow(rnd(), 1.35) * 44;
      var bz = -84 + rnd() * 168;
      plant('broad', bx, bz, 0.85 + rnd() * 0.45);
    }

    var dummy = new THREE.Object3D();
    var instColor = new THREE.Color();

    function instanceColor() {
      return 0.90 + rnd() * 0.18;
    }

    // 树干：松与阔叶共用一根单位圆柱
    var trunkGeo = geo(new THREE.CylinderGeometry(0.18, 0.27, 1, 5, 1));
    var trunkMat = mat(new THREE.MeshLambertMaterial({ color: PALETTE.trunk }));
    var trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, plants.length);
    trunkMesh.name = 'env-trunks';
    var ti = 0;
    for (var pi = 0; pi < plants.length; pi++) {
      var p = plants[pi];
      var isPine = pines.indexOf(p) !== -1;
      var trunkH = (isPine ? 1.8 : 1.5) * p.s;
      dummy.position.set(p.x, p.y + trunkH * 0.5, p.z);
      dummy.rotation.set(0, rnd() * Math.PI * 2, 0);
      dummy.scale.set(p.s, trunkH, p.s);
      dummy.updateMatrix();
      trunkMesh.setMatrixAt(ti++, dummy.matrix);
    }
    trunkMesh.instanceMatrix.needsUpdate = true;
    group.add(trunkMesh);

    // 松：三层锥
    var coneGeo = geo(new THREE.ConeGeometry(1, 1, low ? 5 : 7, 1));
    var coneMat = mat(new THREE.MeshLambertMaterial({ color: 0xffffff }));
    var coneMesh = new THREE.InstancedMesh(coneGeo, coneMat, pines.length * 3);
    coneMesh.name = 'env-pines';
    var ci = 0;
    [0, 1, 2].forEach(function (tier) {
      for (var i2 = 0; i2 < pines.length; i2++) {
        var tp = pines[i2];
        var s = tp.s;
        var base = [1.30, 2.55, 3.65][tier] * s;
        var hgt = [2.35, 2.05, 1.75][tier] * s;
        var rad = [1.45, 1.05, 0.66][tier] * s;
        dummy.position.set(tp.x, tp.y + base + hgt * 0.5, tp.z);
        dummy.rotation.set(0, rnd() * Math.PI * 2, 0);
        dummy.scale.set(rad, hgt, rad);
        dummy.updateMatrix();
        coneMesh.setMatrixAt(ci, dummy.matrix);
        instColor.copy(color(THREE, PALETTE.pine)).lerp(color(THREE, PALETTE.pineLight), rnd());
        instColor.multiplyScalar(instanceColor());
        coneMesh.setColorAt(ci, instColor);
        ci++;
      }
    });
    coneMesh.instanceMatrix.needsUpdate = true;
    if (coneMesh.instanceColor) coneMesh.instanceColor.needsUpdate = true;
    group.add(coneMesh);

    // 阔叶：两团二十面体
    var leafGeo = geo(new THREE.IcosahedronGeometry(1, 0));
    var leafMat = mat(new THREE.MeshLambertMaterial({ color: 0xffffff }));
    var leafMesh = new THREE.InstancedMesh(leafGeo, leafMat, broads.length * 2);
    leafMesh.name = 'env-broadleaf';
    var li = 0;
    for (var bi = 0; bi < broads.length; bi++) {
      var bp = broads[bi];
      var bs = bp.s;
      var clumps = [
        { dx: 0, dy: 2.55, dz: 0, r: 1.75 },
        { dx: 0.85, dy: 3.05, dz: 0.25, r: 1.10 }
      ];
      for (var cj = 0; cj < clumps.length; cj++) {
        var cl = clumps[cj];
        dummy.position.set(bp.x + cl.dx * bs, bp.y + cl.dy * bs, bp.z + cl.dz * bs);
        dummy.rotation.set(rnd() * 0.5, rnd() * Math.PI * 2, rnd() * 0.5);
        dummy.scale.set(cl.r * bs, cl.r * bs * 0.86, cl.r * bs);
        dummy.updateMatrix();
        leafMesh.setMatrixAt(li, dummy.matrix);
        instColor.copy(color(THREE, PALETTE.broadleaf)).lerp(color(THREE, PALETTE.broadleafLight), Math.pow(rnd(), 1.3));
        instColor.multiplyScalar(instanceColor());
        leafMesh.setColorAt(li, instColor);
        li++;
      }
    }
    leafMesh.instanceMatrix.needsUpdate = true;
    if (leafMesh.instanceColor) leafMesh.instanceColor.needsUpdate = true;
    group.add(leafMesh);

    // 低灌木：复用阔叶的几何与材质，把裸坡填起来
    var shrubCount = low ? 14 : 26;
    var shrubs = new THREE.InstancedMesh(leafGeo, leafMat, shrubCount);
    shrubs.name = 'env-shrubs';
    for (var shi = 0; shi < shrubCount; shi++) {
      var shSide = rnd() < 0.5 ? -1 : 1;
      var shxAbs = 20.2 + rnd() * 36;
      var shz = -86 + rnd() * 172;
      var shy = bankHeight(shxAbs, shz, shSide);
      var shs = 0.45 + rnd() * 0.65;
      dummy.position.set(shSide * shxAbs, shy + shs * 0.42, shz);
      dummy.rotation.set(0, rnd() * Math.PI * 2, 0);
      dummy.scale.set(shs * 1.5, shs * 0.85, shs * 1.4);
      dummy.updateMatrix();
      shrubs.setMatrixAt(shi, dummy.matrix);
      instColor.copy(color(THREE, PALETTE.forest)).lerp(color(THREE, PALETTE.grass), 0.25 + rnd() * 0.5);
      instColor.multiplyScalar(0.9 + rnd() * 0.2);
      shrubs.setColorAt(shi, instColor);
    }
    shrubs.instanceMatrix.needsUpdate = true;
    if (shrubs.instanceColor) shrubs.instanceColor.needsUpdate = true;
    group.add(shrubs);

    /* ---------------------------------------------------------- 6. 岸石 */
    var rockGeo = geo(new THREE.IcosahedronGeometry(1, 0));
    var rockMat = mat(new THREE.MeshLambertMaterial({ color: 0xffffff }));
    var rockCount = low ? 10 : 18;
    var rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
    rocks.name = 'env-rocks';
    for (var ri = 0; ri < rockCount; ri++) {
      var rs = rnd() < 0.5 ? -1 : 1;
      /* 前一半散在崖脚水线（大块），后一半点在台地草坡 */
      var atToe = ri < rockCount / 2;
      var rxAbs = atToe ? (15.3 + rnd() * 2.2) : (19.1 + rnd() * 3.2);
      var rz = -52 + rnd() * 104;
      var ry = bankHeight(rxAbs, rz, rs);
      var rscale = atToe ? (0.8 + rnd() * 1.1) : (0.45 + rnd() * 0.85);
      dummy.position.set(rs * rxAbs, ry + rscale * 0.22, rz);
      dummy.rotation.set(rnd() * 0.5, rnd() * Math.PI * 2, rnd() * 0.5);
      dummy.scale.set(rscale * (0.9 + rnd() * 0.5), rscale * 0.62, rscale * (0.8 + rnd() * 0.5));
      dummy.updateMatrix();
      rocks.setMatrixAt(ri, dummy.matrix);
      instColor.copy(color(THREE, PALETTE.rock)).multiplyScalar(atToe ? (0.72 + rnd() * 0.2) : (0.88 + rnd() * 0.24));
      rocks.setColorAt(ri, instColor);
    }
    rocks.instanceMatrix.needsUpdate = true;
    if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
    group.add(rocks);

    /* ---------------------------------------------------------- 7. 水雾 */
    /* 用面向相机的柔光 sprite，避免水平雾片在水面上切出白色圆环。 */
    var mistData = [];
    if (opts.mist !== false) {
      var mistTex = tex(radialTexture(THREE, 0.42, 0.18, 256, 6, rnd));
      var mistMat = mat(new THREE.SpriteMaterial({
        map: mistTex,
        color: 0xf7fbf4,
        transparent: true,
        opacity: 0.11,
        depthWrite: false,
        fog: true
      }));
      var mistSpecs = [
        { x: -14, z: -66, y: -3.80, w: 44, h: 7 },
        { x: 12, z: -46, y: -3.70, w: 34, h: 6 },
        { x: -6, z: -28, y: -3.80, w: 36, h: 6 }
      ];
      for (var mi = 0; mi < mistSpecs.length; mi++) {
        var ms = mistSpecs[mi];
        var mm = new THREE.Sprite(mistMat);
        mm.position.set(ms.x, ms.y, ms.z);
        mm.scale.set(ms.w, ms.h, 1);
        mm.renderOrder = 3;
        mm.name = 'env-mist';
        group.add(mm);
        mistData.push({ mesh: mm, x: ms.x, z: ms.z, phase: rnd() * Math.PI * 2 });
      }
    }

    /* ---------------------------------------------------------- 8. 光 */
    var lights = null;
    if (opts.lights !== false) {
      var hemi = new THREE.HemisphereLight(0xd9edf5, 0x57724a, 0.55);
      hemi.name = 'env-hemi';
      group.add(hemi);

      // 秋日清晨：低角度侧光，影子拉长；index.html 会给这盏开阴影
      var sun = new THREE.DirectionalLight(0xffd9a4, 1.3);
      sun.position.set(34, 36, 24);
      sun.castShadow = false;
      sun.name = 'env-sun';
      group.add(sun);

      var fill = new THREE.DirectionalLight(0xa9cfe0, 0.22);
      fill.position.set(-30, 18, -26);
      fill.castShadow = false;
      fill.name = 'env-fill';
      group.add(fill);

      lights = { hemi: hemi, sun: sun, fill: fill };
    }

    /* ---------------------------------------------------------- 9. 雾 */
    var prevFog = scene.fog;
    var ownFog = null;
    if (opts.fog !== false) {
      var fogColor = opts.fogColor === undefined ? PALETTE.haze : opts.fogColor;
      var fogDensity = opts.fogDensity === undefined ? 0.0050 : opts.fogDensity;
      // r128 的雾在输出编码之后混合，颜色按 sRGB 直接给
      ownFog = new THREE.FogExp2(fogColor, fogDensity);
      scene.fog = ownFog;
    }

    scene.add(group);

    /* ---------------------------------------------------------- 统计 */
    var tris = 0;
    group.traverse(function (o) {
      if (!o.isMesh || !o.geometry) return;
      var g = o.geometry;
      var count = g.index ? g.index.count : (g.attributes.position ? g.attributes.position.count : 0);
      var per = Math.floor(count / 3);
      tris += per * (o.isInstancedMesh ? o.count : 1);
    });

    /* ---------------------------------------------------------- 每帧 */
    function update(t) {
      if (disposed) return;
      var time = t || 0;
      waterTime.value = time % 3600;
      for (var i = 0; i < mistData.length; i++) {
        var d = mistData[i];
        d.mesh.position.x = d.x + Math.sin(time * 0.055 + d.phase) * 2.1;
        d.mesh.position.z = d.z + Math.cos(time * 0.041 + d.phase * 1.3) * 1.3;
      }
    }

    /* ---------------------------------------------------------- 清理 */
    function dispose() {
      if (disposed) return;
      disposed = true;
      if (group.parent) group.parent.remove(group);
      for (var i = 0; i < geos.length; i++) geos[i].dispose();
      for (var j = 0; j < mats.length; j++) mats[j].dispose();
      for (var k = 0; k < texs.length; k++) texs[k].dispose();
      geos.length = 0;
      mats.length = 0;
      texs.length = 0;
      mistData.length = 0;
      if (ownFog && scene.fog === ownFog) scene.fog = prevFog;
    }

    return {
      group: group,
      update: update,
      dispose: dispose,
      lights: lights,
      sun: lights ? lights.sun : null,
      stats: { triangles: tris, plants: plants.length, drawObjs: group.children.length }
    };
  };

  global.BridgeEnv = BridgeEnv;
})(window);
