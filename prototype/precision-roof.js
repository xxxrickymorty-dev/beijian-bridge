/*!
 * BridgeRoofDetail — 北涧桥 廊屋 / 楼阁 屋顶瓦作细部（物理瓦垄 · 脊 · 封檐）
 *
 * 独立 classic script：挂 window.BridgeRoofDetail，无 import / 无构建 / 无外部贴图。
 * 依赖调用方传入的 THREE（页面里是 vendor/three.min.js，r128）。
 * 不改 index.html，不碰 DOM、灯、相机；dispose() 只清理自己创建的东西。
 *
 * 做的事：
 *   1) 按 roofSurface() 的同一条曲线剖面，铺一条条实体瓦垄（沿 x 的薄板，
 *      下缘带压边/滴水，逐垄向下叠压）；
 *   2) 脊梁沿 x 起翘（两端上翘），可选脊端卷草/鳌鱼剪影；
 *   3) 檐口封檐板，沿檐口曲线（含角部起翘）走。
 *
 * 坐标与 index.html 完全一致（直接给世界坐标，group 放在原点）：
 *   roofSurface() 的顶点解析式：
 *     y(x,t) = ridgeY - (ridgeY-eaveY) * t^1.45
 *              + 0.16 * ((t-0.82)/0.18)^2          (t > 0.82)
 *              + 0.8 * ((ex-0.8)/0.2)^2 * t^2.2    (ex > 0.8)
 *   ★ 注意：原 roofSurface 的 cols = 2，x 方向只有 -L/2 / 0 / +L/2 三列，
 *     网格在 x 上是线性插值，所以实际三角面等价于：
 *       corner = 0.8 * t^2.2 * ex
 *     本模块默认按后者采样，这样瓦垄不会插进屋面或悬空。
 *     要自定义剖面可传 opts.profile(x, t)。
 *
 * 用法：
 *   var rd = BridgeRoofDetail.build(THREE, {
 *     length: 32, halfWidth: 4.0, ridgeY: 9.55, eaveY: 8.05,
 *     courseCount: 12,
 *     tileMaterial: galleryMats.roof,     // 不传则自建（带程序化瓦纹）
 *     frameMaterial: galleryMats.pav      // 封檐板 / 脊饰
 *   });
 *   galleryGroups.roof.add(rd.group);
 *   rd.reveal({ stagger: 60 });           // 自檐口向脊，逐垄显形
 *   rd.revealStep(8);                     // 只显示 parts[0..8]
 *   rd.dispose();                         // 幂等
 *
 * ★ 材质是“借用”的：传入 tileMaterial / frameMaterial 时不会 clone，
 *   也不会在 dispose() 里释放它们 —— 这样 index.html 对 galleryMats.roof
 *   的透明度补间、setGalleryOpaque() 都能作用到瓦垄上。
 */
(function (root) {
  'use strict';

  var VERSION = '1.0.0';

  /* ============================================================ 默认参数 */
  var DEFAULTS = {
    /* 屋面 */
    length: 32,             // x 向总长
    halfWidth: 4.0,         // 单坡 z 向宽度（roofSurface 的 halfW）
    ridgeY: 9.55,
    eaveY: 8.05,
    sides: 'both',          // 'both' | 'front' | 'back' | [1,-1]（front = +z）
    courseCount: 10,        // 瓦垄数（从脊到檐）
    xSegments: 0,           // 0 = 按 length 自动（8–36）
    profile: null,          // 可选 function(x, t) -> y，覆盖默认剖面

    /* 瓦垄断面（沿法线方向的偏移，单位与场景一致） */
    tileOffset: 0.030,      // 瓦面离屋面的距离，防 z-fighting（含 t 向弦差余量）
    lipHeight: 0.032,       // 下缘压边抬起高度
    lipThick: 0.012,        // 压边立面厚度
    lipLength: 0.34,        // 压边长度，占一垄的比例

    /* 脊 */
    ridgeBeam: true,
    ridgeBeamHeight: 0.26,
    ridgeBeamDepth: 0.36,
    ridgeOverhang: 0.06,    // 脊梁比屋面两端各长一点，避免与旧脊块共面
    ridgeLift: 0,           // 0 = 自动（按 halfWidth）
    ridgeDip: 0.105,        // 脊梁底 = ridgeY - ridgeDip（包住 index.html 的旧脊块）

    /* 脊端装饰（可选，纯剪影挤出） */
    ornaments: true,
    ornamentScale: 0,       // 0 = 自动（按 halfWidth）
    ornamentDepth: 0.14,

    /* 檐口 */
    eaveFascia: true,
    fasciaDepth: 0.07,
    fasciaDrop: 0.16,
    fasciaGap: 0.004,       // 封檐板内面离屋面边缘的缝
    fasciaRise: 0.03,       // 封檐板顶高出檐口

    /* 其它 */
    shadow: true,
    hidden: false           // true = 初始全隐，等 reveal()
  };

  /* ============================================================ 小工具 */

  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function sq(v) { return v * v; }

  function lin(THREE, hex) {
    var c = new THREE.Color(hex);
    if (typeof c.convertSRGBToLinear === 'function') c.convertSRGBToLinear();
    return c;
  }

  function setShadows(m, on) {
    m.castShadow = !!on;
    m.receiveShadow = !!on;
    return m;
  }

  function resolveSides(v) {
    var out = [];
    function push(s) {
      s = s < 0 ? -1 : 1;
      if (out.indexOf(s) < 0) out.push(s);
    }
    if (typeof v === 'string') {
      var s = v.toLowerCase();
      if (s === 'both' || s === 'all') { push(1); push(-1); }
      else if (s === 'front' || s === '+z' || s === 'z+') push(1);
      else if (s === 'back' || s === '-z' || s === 'z-') push(-1);
      else { push(1); push(-1); }
    } else if (Object.prototype.toString.call(v) === '[object Array]') {
      for (var i = 0; i < v.length; i++) if (v[i]) push(v[i]);
      if (!out.length) { push(1); push(-1); }
    } else {
      push(1); push(-1);
    }
    return out;
  }

  function normalize(opts) {
    var p = {}, k;
    for (k in DEFAULTS) if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) p[k] = DEFAULTS[k];
    if (opts) {
      for (k in opts) if (Object.prototype.hasOwnProperty.call(opts, k)) p[k] = opts[k];
    }

    p.length = Math.max(0.5, isNum(p.length) ? p.length : DEFAULTS.length);
    p.halfWidth = Math.max(0.2, isNum(p.halfWidth) ? p.halfWidth : DEFAULTS.halfWidth);
    p.ridgeY = isNum(p.ridgeY) ? p.ridgeY : DEFAULTS.ridgeY;
    p.eaveY = isNum(p.eaveY) ? p.eaveY : DEFAULTS.eaveY;
    p.courseCount = Math.max(1, Math.round(isNum(p.courseCount) ? p.courseCount : DEFAULTS.courseCount));
    p.sides = resolveSides(p.sides);

    p.tileOffset = Math.max(0.004, isNum(p.tileOffset) ? p.tileOffset : DEFAULTS.tileOffset);
    p.lipHeight = Math.max(0.006, isNum(p.lipHeight) ? p.lipHeight : DEFAULTS.lipHeight);
    p.lipThick = clamp(isNum(p.lipThick) ? p.lipThick : DEFAULTS.lipThick, 0.002, p.lipHeight - 0.002);
    p.lipLength = clamp(isNum(p.lipLength) ? p.lipLength : DEFAULTS.lipLength, 0.05, 0.95);

    p.ridgeBeamHeight = Math.max(0.04, isNum(p.ridgeBeamHeight) ? p.ridgeBeamHeight : DEFAULTS.ridgeBeamHeight);
    p.ridgeBeamDepth = Math.max(0.04, isNum(p.ridgeBeamDepth) ? p.ridgeBeamDepth : DEFAULTS.ridgeBeamDepth);
    p.ridgeOverhang = Math.max(0, isNum(p.ridgeOverhang) ? p.ridgeOverhang : DEFAULTS.ridgeOverhang);
    p.ridgeDip = Math.max(0.02, isNum(p.ridgeDip) ? p.ridgeDip : DEFAULTS.ridgeDip);

    if (!isNum(p.ridgeLift) || p.ridgeLift <= 0) {
      p.ridgeLift = clamp(p.halfWidth * 0.06, 0.06, 0.24);
    }
    if (!isNum(p.ornamentScale) || p.ornamentScale <= 0) {
      p.ornamentScale = clamp(p.halfWidth / 4.0, 0.45, 1.0);
    }
    p.ornamentDepth = Math.max(0.04, isNum(p.ornamentDepth) ? p.ornamentDepth : DEFAULTS.ornamentDepth);

    p.fasciaDepth = Math.max(0.02, isNum(p.fasciaDepth) ? p.fasciaDepth : DEFAULTS.fasciaDepth);
    p.fasciaDrop = Math.max(0.04, isNum(p.fasciaDrop) ? p.fasciaDrop : DEFAULTS.fasciaDrop);
    p.fasciaGap = Math.max(0.001, isNum(p.fasciaGap) ? p.fasciaGap : DEFAULTS.fasciaGap);
    p.fasciaRise = isNum(p.fasciaRise) ? p.fasciaRise : DEFAULTS.fasciaRise;

    p.xSegments = (isNum(p.xSegments) && p.xSegments > 0)
      ? Math.round(p.xSegments)
      : clamp(Math.round(p.length / 1.1), 8, 36);
    p.xSegments = clamp(p.xSegments, 4, 64);

    return p;
  }

  /* ============================================================ 剖面 / 法线 */
  /*
   * 默认剖面刻意复刻 roofSurface() 网格的实际形状：
   *   cols = 2 → x 方向线性；角部起翘项按 ex 线性增长。
   * 若 roofSurface 以后改了 cols / 公式，改这里，或传 opts.profile。
   */
  function surfaceY(p, x, t) {
    if (typeof p.profile === 'function') {
      var py = p.profile(x, t);
      if (isNum(py)) return py;
    }
    var halfL = p.length * 0.5;
    var ex = clamp(Math.abs(x) / halfL, 0, 1);
    var base = p.ridgeY - (p.ridgeY - p.eaveY) * Math.pow(t, 1.45);
    var lift = 0.16 * sq(Math.max(0, t - 0.82) / 0.18);
    var corner = 0.8 * Math.pow(t, 2.2) * ex;   // 3 列网格的线性插值
    return base + lift + corner;
  }

  function slopeX(p, x, t) {
    if (typeof p.profile === 'function') {
      var h = Math.max(0.005, p.length * 0.001);
      return (surfaceY(p, x + h, t) - surfaceY(p, x - h, t)) / (2 * h);
    }
    var halfL = p.length * 0.5;
    if (Math.abs(x) < 1e-7) return 0;
    return (x < 0 ? -1 : 1) * 0.8 * Math.pow(t, 2.2) / halfL;
  }

  function slopeT(p, x, t) {
    var h = 1e-3;
    var a = Math.max(0, t - h), b = Math.min(1, t + h);
    return (surfaceY(p, x, b) - surfaceY(p, x, a)) / (b - a || 1);
  }

  /* 外法线：z > 0 为 front，z < 0 时 z 分量取反 */
  function normalAt(p, x, t, side) {
    var W = p.halfWidth;
    var dydx = slopeX(p, x, t);
    var dydt = slopeT(p, x, t);
    var nx = -W * dydx;
    var ny = W;
    var nz = -dydt * side;
    var l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    return [nx / l, ny / l, nz / l];
  }

  function pointAt(p, x, t, side, off) {
    var y = surfaceY(p, x, t);
    if (!off) return [x, y, side * t * p.halfWidth];
    var n = normalAt(p, x, t, side);
    return [
      x + n[0] * off,
      y + n[1] * off,
      side * t * p.halfWidth + n[2] * off
    ];
  }

  /* ============================================================ 程序化瓦纹（仅 fallback） */
  function tileTexture(THREE) {
    if (typeof document === 'undefined' || !document.createElement) return null;
    var c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    var g = c.getContext('2d');
    if (!g) return null;
    g.fillStyle = '#9aa0a2';
    g.fillRect(0, 0, 128, 128);
    for (var y = 0; y < 128; y += 8) {
      g.fillStyle = 'rgba(42,47,49,.42)';
      g.fillRect(0, y, 128, 1.5);
      g.fillStyle = 'rgba(255,255,255,.06)';
      g.fillRect(0, y + 1.5, 128, 0.8);
    }
    for (var x = 0; x < 128; x += 16) {
      g.fillStyle = 'rgba(42,47,49,.16)';
      g.fillRect(x, 0, 1, 128);
    }
    var tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    if (THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;
    else if (THREE.SRGBColorSpace !== undefined) tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  /* ============================================================ 几何构造 */

  /* 单垄瓦：一条沿 x 扫掠的带子，断面 6 点（下缘折出压边） */
  function buildCourse(THREE, p, side, k) {
    var N = p.courseCount;
    var t0 = k / N;
    var t1 = (k + 1) / N;
    var tEnd = Math.min(1, t1 + p.lipLength / N);
    var base = p.tileOffset;

    /* A 顶边 → B 瓦面 → Bc（折边）→ C 压边顶 → Cc（折边）→ D 压边底
     * Bc / Cc 与 B / C 同位置，只为把法线断开，读出折角。 */
    var cross = [
      { t: t0, off: base },
      { t: t1, off: base },
      { t: t1, off: base },
      { t: tEnd, off: base + p.lipHeight },
      { t: tEnd, off: base + p.lipHeight },
      { t: tEnd, off: base + Math.max(0.002, p.lipHeight - p.lipThick) }
    ];
    var strips = [[0, 1], [2, 3], [4, 5]];

    var tMid = (t0 + t1) * 0.5;
    var pivot = pointAt(p, 0, tMid, side, base);
    var n = p.xSegments, L = p.length;
    var pos = [], uv = [], idx = [];
    var i, j;

    for (i = 0; i <= n; i++) {
      var x = -L * 0.5 + L * i / n;
      for (j = 0; j < cross.length; j++) {
        var pt = pointAt(p, x, cross[j].t, side, cross[j].off);
        pos.push(pt[0], pt[1] - pivot[1], pt[2] - pivot[2]);
        uv.push(i / n, cross[j].t);
      }
    }
    for (i = 0; i < n; i++) {
      for (var s = 0; s < strips.length; s++) {
        var r0 = strips[s][0], r1 = strips[s][1];
        var a = i * 6 + r0;
        var b = i * 6 + r1;
        var c = (i + 1) * 6 + r0;
        var d = (i + 1) * 6 + r1;
        /* 后坡的 z 方向反过来，绕序也要翻，否则法线朝下 */
        if (side > 0) idx.push(a, b, c, b, d, c);
        else idx.push(a, c, b, b, c, d);
      }
    }

    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();

    var mesh = new THREE.Mesh(geo, null); /* 材质由调用处统一挂 */
    mesh.position.set(0, pivot[1], pivot[2]);
    setShadows(mesh, p.shadow);
    return mesh;
  }

  /* 闭合断面沿 x 扫掠（脊梁 / 封檐板共用）
   * rows: [ [ [x,y,z], ... ], ... ]，断面在 (z,y) 平面按逆时针给点，4 点封端。 */
  function sweptSolid(THREE, rows) {
    var n = rows.length - 1, m = rows[0].length;
    var pos = [], uv = [], idx = [];
    var i, j;
    for (i = 0; i <= n; i++) {
      for (j = 0; j < m; j++) {
        pos.push(rows[i][j][0], rows[i][j][1], rows[i][j][2]);
        uv.push(i / n, j / m);
      }
    }
    for (i = 0; i < n; i++) {
      for (j = 0; j < m; j++) {
        var j2 = (j + 1) % m;
        var a = i * m + j, b = i * m + j2;
        var c = (i + 1) * m + j, d = (i + 1) * m + j2;
        idx.push(a, c, b, b, c, d); /* 断面逆时针 + 沿 +x 扫掠 → 外法线 */
      }
    }
    if (m === 4) {
      idx.push(0, 1, 2, 0, 2, 3);
      var base = n * m;
      idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo = geo.toNonIndexed();  /* 木构件/脊梁要硬边 */
    geo.computeVertexNormals();
    return geo;
  }

  function buildRidge(THREE, p) {
    var L = p.length, over = p.ridgeOverhang;
    var d = p.ridgeBeamDepth, h = p.ridgeBeamHeight;
    var bottom = p.ridgeY - p.ridgeDip;
    var n = clamp(Math.round(p.xSegments), 10, 40);
    var cross = [
      [-d * 0.5, 0],
      [d * 0.5, 0],
      [d * 0.34, h],
      [-d * 0.34, h]
    ];
    var rows = [], i, j;
    for (i = 0; i <= n; i++) {
      var x = -L * 0.5 - over + (L + over * 2) * i / n;
      var u = Math.min(1, Math.abs(x) / (L * 0.5));
      var rise = p.ridgeLift * Math.pow(Math.max(0, (u - 0.78) / 0.22), 1.7);
      var yb = bottom + rise - p.ridgeY;
      var row = [];
      for (j = 0; j < 4; j++) row.push([x, yb + cross[j][1], cross[j][0]]);
      rows.push(row);
    }
    var geo = sweptSolid(THREE, rows);
    var mesh = new THREE.Mesh(geo, null);
    mesh.position.set(0, p.ridgeY, 0);
    setShadows(mesh, p.shadow);
    return mesh;
  }

  function buildFascia(THREE, p, side) {
    var L = p.length, W = p.halfWidth;
    var zIn = side * (W + p.fasciaGap);
    var zOut = side * (W + p.fasciaGap + p.fasciaDepth);
    var zLo = Math.min(zIn, zOut), zHi = Math.max(zIn, zOut);
    var drop = p.fasciaDrop;
    /* 逆时针（z 向右、y 向上）：左下 → 右下 → 右上 → 左上 */
    var cross = [
      [zLo, -drop],
      [zHi, -drop],
      [zHi, 0],
      [zLo, 0]
    ];
    var n = p.xSegments, i, j;
    var pivotY = surfaceY(p, 0, 1) + p.fasciaRise - drop * 0.5;
    var pivotZ = side * (W + p.fasciaGap + p.fasciaDepth * 0.5);
    var rows = [];
    for (i = 0; i <= n; i++) {
      var x = -L * 0.5 + L * i / n;
      var top = surfaceY(p, x, 1) + p.fasciaRise;
      var row = [];
      for (j = 0; j < 4; j++) {
        row.push([x, top + cross[j][1] - pivotY, cross[j][0] - pivotZ]);
      }
      rows.push(row);
    }
    var geo = sweptSolid(THREE, rows);
    var mesh = new THREE.Mesh(geo, null);
    mesh.position.set(0, pivotY, pivotZ);
    setShadows(mesh, p.shadow);
    return mesh;
  }

  /* 脊端卷草剪影：Shape 挤出，无外部模型 */
  function buildOrnament(THREE, p, endSign) {
    var pts = [
      [-0.04, 0.00], [0.16, 0.00], [0.21, 0.05], [0.30, 0.08],
      [0.40, 0.16], [0.47, 0.30], [0.46, 0.42], [0.40, 0.50],
      [0.30, 0.50], [0.27, 0.43], [0.33, 0.35], [0.34, 0.25],
      [0.28, 0.16], [0.18, 0.11], [0.02, 0.08]
    ];
    var s = p.ornamentScale;
    var shape = new THREE.Shape();
    for (var i = 0; i < pts.length; i++) {
      var px = pts[i][0] * s * endSign;
      var py = pts[i][1] * s;
      if (i === 0) shape.moveTo(px, py);
      else shape.lineTo(px, py);
    }
    shape.closePath();
    var geo = new THREE.ExtrudeGeometry(shape, {
      depth: p.ornamentDepth,
      bevelEnabled: false,
      steps: 1,
      curveSegments: 4
    });
    geo.translate(0, 0, -p.ornamentDepth * 0.5);

    var mesh = new THREE.Mesh(geo, null);
    var baseY = p.ridgeBeam
      ? p.ridgeY - p.ridgeDip + p.ridgeLift + p.ridgeBeamHeight - 0.02
      : p.ridgeY - 0.02;   // 没脊梁时，剪影直接坐在脊线上
    /* 世界 x 烘进几何：调用方按「几何局部 x」压纵坡（camberAt(getX)），
       网格 position 摆 ±26 会让鸱吻吃不到那 1.1 m 沉降，悬在半空 */
    var wx = endSign * (p.length * 0.5 + p.ridgeOverhang * 0.5 - 0.02);
    geo.translate(wx, 0, -p.ornamentDepth * 0.5);
    mesh.position.set(0, baseY, 0);
    setShadows(mesh, p.shadow);
    return mesh;
  }

  /* ============================================================ build() */
  function build(THREE, opts) {
    if (!THREE || !THREE.BufferGeometry) throw new Error('BridgeRoofDetail.build: 需要 THREE');
    var p = normalize(opts);

    var group = new THREE.Group();
    group.name = 'bridge-roof-detail';
    group.userData.roofDetail = { version: VERSION, length: p.length, halfWidth: p.halfWidth };

    var parts = [];
    var ownedMats = [];
    var ownedTex = [];
    var timers = [];
    var disposed = false;

    /* ---- 材质：优先借用调用方的，避免破坏 galleryMats 的透明度动画 ---- */
    var tileMat = opts && opts.tileMaterial ? opts.tileMaterial : null;
    if (!tileMat) {
      var tex = tileTexture(THREE);
      if (tex) ownedTex.push(tex);
      tileMat = new THREE.MeshStandardMaterial({
        color: lin(THREE, 0x55504a),
        roughness: 0.92,
        metalness: 0,
        side: THREE.DoubleSide
      });
      if (tex) {
        tileMat.map = tex;
        tileMat.bumpMap = tex;
        tileMat.bumpScale = 0.02;
      }
      ownedMats.push(tileMat);
    }
    var frameMat = opts && opts.frameMaterial ? opts.frameMaterial : null;
    if (!frameMat) {
      frameMat = new THREE.MeshStandardMaterial({
        color: lin(THREE, 0x46311f),
        roughness: 0.9,
        metalness: 0
      });
      ownedMats.push(frameMat);
    }

    function addPart(mesh, kind, meta) {
      mesh.material = (kind === 'course' || kind === 'ridge') ? tileMat : frameMat;
      mesh.userData.roofPart = parts.length;
      mesh.userData.roofKind = kind;
      mesh.userData.roofLabel = meta && meta.label ? meta.label : kind;
      if (meta) {
        if (meta.course !== undefined) mesh.userData.roofCourse = meta.course;
        if (meta.side !== undefined) mesh.userData.roofSide = meta.side;
        if (meta.end !== undefined) mesh.userData.roofEnd = meta.end;
      }
      mesh.visible = !p.hidden;
      group.add(mesh);
      parts.push(mesh);
      return mesh;
    }

    /* ---- 1. 封檐板（先上，托住檐口） ---- */
    if (p.eaveFascia) {
      for (var fi = 0; fi < p.sides.length; fi++) {
        var fs = p.sides[fi];
        addPart(buildFascia(THREE, p, fs), 'fascia', {
          side: fs,
          label: '封檐板 · ' + (fs > 0 ? '前坡' : '后坡')
        });
      }
    }

    /* ---- 2. 瓦垄：自檐口向脊，逐垄；每垄先前坡后后坡 ---- */
    for (var k = p.courseCount - 1; k >= 0; k--) {
      for (var si = 0; si < p.sides.length; si++) {
        var side = p.sides[si];
        addPart(buildCourse(THREE, p, side, k), 'course', {
          course: k,
          side: side,
          label: '第 ' + (p.courseCount - k) + ' 垄瓦 · ' + (side > 0 ? '前坡' : '后坡')
        });
      }
    }

    /* ---- 3. 脊梁 ---- */
    if (p.ridgeBeam) {
      addPart(buildRidge(THREE, p), 'ridge', { label: '脊梁（两端起翘）' });
    }

    /* ---- 4. 脊端装饰 ---- */
    if (p.ornaments) {
      addPart(buildOrnament(THREE, p, 1), 'ornament', { end: 1, label: '东脊端' });
      addPart(buildOrnament(THREE, p, -1), 'ornament', { end: -1, label: '西脊端' });
    }

    /* ---- 显示 / 释放 ---- */
    function clearTimers() {
      for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
      timers.length = 0;
    }

    function show(part) {
      part.visible = true;
      /* 兼容调用方曾把内部 mesh 逐个隐藏（buildGallery 的 instant 分支） */
      part.traverse(function (o) { o.visible = true; });
    }

    function reveal(revealOpts) {
      if (disposed) return 0;
      var stagger = (revealOpts && isNum(revealOpts.stagger)) ? Math.max(0, revealOpts.stagger) : 0;
      clearTimers();
      group.visible = true;
      for (var i = 0; i < parts.length; i++) {
        (function (part, idx) {
          if (!stagger) { show(part); return; }
          timers.push(setTimeout(function () { show(part); }, idx * stagger));
        })(parts[i], i);
      }
      return parts.length;
    }

    function revealStep(i) {
      if (disposed) return;
      clearTimers();
      group.visible = true;
      for (var k = 0; k < parts.length; k++) {
        if (k <= i) show(parts[k]);
        else parts[k].visible = false;
      }
    }

    /* ---- 统计 ---- */
    var meshes = 0, tris = 0;
    group.traverse(function (o) {
      if (!o.isMesh || !o.geometry) return;
      meshes++;
      var g = o.geometry;
      tris += (g.index ? g.index.count : (g.attributes.position ? g.attributes.position.count : 0)) / 3;
    });

    return {
      version: VERSION,
      group: group,
      parts: parts,
      config: {
        length: p.length,
        halfWidth: p.halfWidth,
        ridgeY: p.ridgeY,
        eaveY: p.eaveY,
        courseCount: p.courseCount,
        sides: p.sides.slice(),
        tileOffset: p.tileOffset,
        ridgeLift: p.ridgeLift,
        ornamentScale: p.ornamentScale
      },
      stats: { meshes: meshes, triangles: Math.round(tris), parts: parts.length },
      reveal: reveal,
      revealStep: revealStep,
      dispose: function () {
        if (disposed) return;
        disposed = true;
        clearTimers();
        if (group.parent) group.parent.remove(group);
        group.traverse(function (o) {
          if (o.isMesh && o.geometry) o.geometry.dispose();
        });
        for (var i = 0; i < ownedTex.length; i++) ownedTex[i].dispose();
        for (var j = 0; j < ownedMats.length; j++) ownedMats[j].dispose();
        ownedTex.length = 0;
        ownedMats.length = 0;
        parts.length = 0;
      }
    };
  }

  /* ============================================================ 导出 */
  root.BridgeRoofDetail = {
    version: VERSION,
    build: build,
    defaults: DEFAULTS
  };

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
