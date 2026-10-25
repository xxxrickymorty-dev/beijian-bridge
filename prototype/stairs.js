/*!
 * BridgeStairs — 北涧桥 两岸桥头踏步（石/木 折返楼梯）
 *
 * 独立 classic script：挂 window.BridgeStairs，无 import / 无构建 / 无外部贴图。
 * 依赖调用方传入的 THREE（页面里是 vendor/three.min.js，r128）。
 * 不改 index.html，也不碰任何已有对象；dispose() 只清理自己创建的东西。
 *
 * 用法：
 *   var stairs = BridgeStairs.build(THREE, {side:'both'});
 *   scene.add(stairs.group);
 *   stairs.reveal();          // 全部显示
 *   stairs.revealStep(5);     // 显示 parts[0..5]（自下而上逐级）
 *   stairs.dispose();         // 幂等
 *
 * ---------------------------------------------------------------------------
 * 坐标（与 prototype/index.html 对齐；下列均为「右岸」x>0，左岸按 x → -x 镜像）
 * ---------------------------------------------------------------------------
 *  桥台      x 13.2 .. 17.6      y -2.60 .. 0.26   z ±3.80
 *  牛头      x 13.2 .. 15.2      y  0.25 .. 1.55   z ±3.40
 *  桥面板    x ±15.675           y  6.24 .. 6.40   z ±2.50   （板中心 6.32）
 *  端柱      x ±14.6             y  1.55 .. 6.08   z ±1.90
 *
 *  梯段 A（下段，向 +z 上行）  x 15.35 .. 16.30   z -2.50 .. 2.10
 *  中间平台                    x 15.20 .. 17.60   z  2.10 .. 3.80   顶 y 3.29
 *  梯段 B（上段，向 -z 上行）  x 16.50 .. 17.45   z -3.60 .. 2.10
 *  顶部平台                    x 15.00 .. 17.60   z -3.80 .. -2.50  顶 y 6.32
 *  顶部平台支撑体              x 15.25 .. 16.50   z -3.80 .. -2.50  y 0.26 .. 6.18
 *  内侧挡墙 x 15.20..15.35 / 中间墙 x 16.30..16.50 / 外侧挡墙 x 17.45..17.60
 *
 * 踏步：22 级 × 0.27545 = 6.06（0.26 → 6.32）
 *   A 段 11 级，tread 0.4182（斜率 33.4°）；B 段 11 级，tread 0.5182（斜率 28.0°）
 *   两级之间高度差 ≤0.28、踏面 ≥0.30，都在可走范围内。
 *
 * 三点说明：
 *  1) 楼梯顶（顶部平台面）取 y = 6.32，即桥面板中面；桥面板顶在 6.40，
 *     所以上桥时还有 0.08 m 的门槛——就是桥面板本身的厚度，不是悬空台阶。
 *  2) 梯段 B 走在 x ≥ 16.50，完全在桥面 x 轮廓（±15.675）之外，
 *     所以上段永远不会钻到桥面底下；梯段 A 最高只到 y 3.29，净空 ≥2.9 m。
 *  3) 顶部平台内缘取 x = 15.00，正好对上廊屋栏杆的端头（栏杆 x -15..15），
 *     进桥的洞口宽 0.675 m（x 15.00..15.675），在桥面 z = -2.50 一侧。
 *  4) 桥台顶 y = 0.26 与 |x|≈25.4 处的岸台同高；紧邻桥台的河岸在 y ≈ -2.58，
 *     所以楼梯落脚点是桥台顶（桥头台地），不是水边滩地。
 */
(function (global) {
  'use strict';

  var VERSION = '1.0.0';

  /* ===================== 常量：与 index.html / environment.md 对齐 ===================== */
  var COORDS = {
    X: 14.2,                 // 半跨
    Y0: 0.9,                 // 起拱点
    GROUND_Y: -2.6,          // 地面
    ABUT: { x: 15.4, y: -1.17, sx: 4.4, sy: 2.86, sz: 7.6 },
    HEAD: { x: 14.2, y: 0.9, sx: 2.0, sy: 1.3, sz: 6.8 },
    DECK_Y: 6.32,            // 桥面板中心
    DECK_THICK: 0.16,        // 桥面板顶 = 6.40
    DECK_X_EDGE: 15.675,     // 桥面外缘（14.7 + 1.95/2）
    DECK_Z: 2.5,
    BASE_Y: 0.26,            // 桥台顶 = 楼梯底
    TOP_Y: 6.32              // 楼梯顶 = 桥面边缘
  };

  var RISERS = 22;           // 总级数
  var N_A = 11;              // 下段级数
  var PARAPET = 0.30;        // 挡墙高出踏面
  var LAND_TH = 0.14;        // 平台板厚
  var RAIL_H = 0.80;         // 栏杆高
  var RAIL_T = 0.07;         // 栏杆料厚

  /* 右岸平面布置（左岸镜像 x） */
  var X_IN = [15.20, 15.35];     // 内侧挡墙
  var X_A = [15.35, 16.30];      // 梯段 A
  var X_SP = [16.30, 16.50];     // 中间墙
  var X_B = [16.50, 17.45];      // 梯段 B
  var X_OU = [17.45, 17.60];     // 外侧挡墙
  var Z_A = [-2.50, 2.10];       // 梯段 A 起止（向 +z 上行）
  var Z_B = [2.10, -3.60];       // 梯段 B 起止（向 -z 上行）
  var Z_MID = [2.10, 3.80];      // 中间平台
  var Z_TOP = [-3.80, -2.50];    // 顶部平台
  var X_TOP_IN = 15.00;          // 顶部平台内缘（对上栏杆端头）

  /* ===================== 小工具 ===================== */
  function lin(THREE, hex) {
    var c = new THREE.Color(hex);
    if (typeof c.convertSRGBToLinear === 'function') c.convertSRGBToLinear();
    return c;
  }

  function srgb(THREE, tex) {
    if (tex.encoding !== undefined && THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;
    else if (THREE.SRGBColorSpace !== undefined) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function setShadows(m) { m.castShadow = true; m.receiveShadow = true; return m; }

  /* ===================== 程序化贴图（canvas，无外部图片） ===================== */
  /* 石材：细颗粒 + 斑驳，不做横向砌缝——高瘦方块拉伸 UV 时不会出现竖条纹 */
  function stoneTexture(THREE) {
    if (typeof document === 'undefined') return null;
    var c = document.createElement('canvas'); c.width = c.height = 256;
    var g = c.getContext('2d');
    g.fillStyle = '#7f7a72'; g.fillRect(0, 0, 256, 256);
    var i, x, y, r;
    for (i = 0; i < 40; i++) {                       // 大尺度斑驳
      x = Math.random() * 256; y = Math.random() * 256; r = 18 + Math.random() * 44;
      var dark = Math.random() < 0.5;
      var grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, dark ? 'rgba(58,54,49,.30)' : 'rgba(196,190,178,.22)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    for (i = 0; i < 9000; i++) {                     // 细颗粒
      var v = Math.random(), a = 0.05 + Math.random() * 0.16;
      g.fillStyle = v < 0.5 ? 'rgba(38,35,31,' + a + ')' : 'rgba(214,208,196,' + (a * 0.8) + ')';
      g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random(), 1 + Math.random());
    }
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return srgb(THREE, t);
  }

  function woodTexture(THREE) {
    if (typeof document === 'undefined') return null;
    var c = document.createElement('canvas'); c.width = c.height = 256;
    var g = c.getContext('2d');
    g.fillStyle = '#e6ddcb'; g.fillRect(0, 0, 256, 256);
    for (var i = 0; i < 48; i++) {
      var y = Math.random() * 256, a = 0.04 + Math.random() * 0.10;
      g.strokeStyle = 'rgba(96,68,42,' + a + ')';
      g.lineWidth = 0.6 + Math.random() * 1.3;
      g.beginPath();
      for (var x = 0; x <= 256; x += 16) {
        var yy = y + Math.sin(x / 256 * Math.PI * 2 + i) * 1.6 + (Math.random() - 0.5) * 0.9;
        if (x === 0) g.moveTo(x, yy); else g.lineTo(x, yy);
      }
      g.stroke();
    }
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return srgb(THREE, t);
  }

  function makeMaterials(THREE, opts) {
    var texOn = opts.textures !== false;
    var stoneTex = texOn ? stoneTexture(THREE) : null;
    var woodTex = texOn ? woodTexture(THREE) : null;

    var body = new THREE.MeshStandardMaterial({ color: lin(THREE, opts.stoneColor !== undefined ? opts.stoneColor : 0x8b8579), roughness: 0.94, metalness: 0 });
    if (stoneTex) { body.map = stoneTex; body.bumpMap = stoneTex; body.bumpScale = 0.018; }

    var step = new THREE.MeshStandardMaterial({ color: lin(THREE, opts.stepColor !== undefined ? opts.stepColor : 0x9c968a), roughness: 0.90, metalness: 0 });
    if (stoneTex) { step.map = stoneTex; step.bumpMap = stoneTex; step.bumpScale = 0.024; }

    var wood = new THREE.MeshStandardMaterial({ color: lin(THREE, opts.woodColor !== undefined ? opts.woodColor : 0x8a6a45), roughness: 0.85, metalness: 0 });
    if (woodTex) { wood.map = woodTex; wood.bumpMap = woodTex; wood.bumpScale = 0.02; }

    return { body: body, step: step, wood: wood, textures: [stoneTex, woodTex] };
  }

  /* ===================== 几何小工具 ===================== */
  /* 世界轴对齐方块；x0<x1 / y0<y1 / z0<z1 */
  function box(THREE, x0, x1, y0, y1, z0, z1, material) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), material);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return setShadows(m);
  }

  /* 任意方向料：p1/p2 为 THREE.Vector3，截面 sx × sy，长轴沿 p1→p2 */
  function beam(THREE, p1, p2, sx, sy, material) {
    var dir = new THREE.Vector3().subVectors(p2, p1);
    var len = dir.length() || 1e-4;
    var m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, len), material);
    m.position.copy(p1).add(p2).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize());
    return setShadows(m);
  }

  /* ===================== 单侧（右岸）构建 ===================== */
  function buildSide(THREE, mats, cfg) {
    var side = cfg.side;              // +1 右岸 / -1 左岸
    var baseY = cfg.baseY, topY = cfg.topY, riser = cfg.riser;
    var nA = cfg.nA, nB = cfg.nB, treadA = cfg.treadA, treadB = cfg.treadB;
    var yMid = cfg.yMid;
    var group = new THREE.Group();
    group.name = side > 0 ? 'bridge-stairs-right' : 'bridge-stairs-left';
    var parts = [];

    function add(mesh, label) {
      mesh.userData.stairPart = parts.length;
      mesh.userData.stairLabel = label;
      group.add(mesh);
      parts.push(mesh);
      return mesh;
    }
    /* x 镜像封装：右岸原样，左岸 x → -x */
    function B(x0, x1, y0, y1, z0, z1, mat) {
      var a = side > 0 ? x0 : -x1, b = side > 0 ? x1 : -x0;
      return box(THREE, a, b, y0, y1, z0, z1, mat);
    }
    function V(x, y, z) { return new THREE.Vector3(side > 0 ? x : -x, y, z); }

    /* ---------- 梯段 A（下段，+z 上行） ---------- */
    var i, z0, z1, yTop;
    for (i = 1; i <= nA; i++) {
      z0 = Z_A[0] + (i - 1) * treadA;
      z1 = Z_A[0] + i * treadA;
      yTop = baseY + i * riser;
      add(B(X_A[0], X_A[1], baseY, yTop, z0, z1, mats.step), 'A-step-' + i);
      add(B(X_IN[0], X_IN[1], baseY, yTop + PARAPET, z0, z1, mats.body), 'A-parapet-inner-' + i);
    }

    /* ---------- 中间平台 ---------- */
    add(B(X_IN[0], X_OU[1], baseY, yMid, Z_MID[0], Z_MID[1], mats.body), 'landing-mid');
    add(B(X_IN[0], X_IN[1], yMid, yMid + PARAPET, Z_MID[0], Z_MID[1], mats.body), 'landing-mid-parapet-inner');
    add(B(X_SP[0], X_SP[1], yMid, yMid + PARAPET, Z_MID[0], Z_MID[1], mats.body), 'landing-mid-parapet-spine');
    add(B(X_OU[0], X_OU[1], yMid, yMid + PARAPET, Z_MID[0], Z_MID[1], mats.body), 'landing-mid-parapet-outer');
    add(B(X_IN[0], X_OU[1], yMid, yMid + PARAPET, Z_MID[1] - 0.15, Z_MID[1], mats.body), 'landing-mid-parapet-back');

    /* ---------- 顶部平台支撑体 ---------- */
    add(B(X_IN[0] + 0.05, X_SP[1], baseY, topY - LAND_TH, Z_TOP[0], Z_TOP[1], mats.body), 'landing-top-support');

    /* ---------- 梯段 B（上段，-z 上行） ---------- */
    var j, zb0, zb1, yTopB;
    for (j = 1; j <= nB; j++) {
      zb1 = Z_B[0] - (j - 1) * treadB;
      zb0 = Z_B[0] - j * treadB;
      yTopB = yMid + j * riser;
      add(B(X_B[0], X_B[1], baseY, yTopB, zb0, zb1, mats.step), 'B-step-' + j);
      add(B(X_SP[0], X_SP[1], baseY, yTopB + PARAPET, zb0, zb1, mats.body), 'B-parapet-spine-' + j);
      add(B(X_OU[0], X_OU[1], baseY, yTopB + PARAPET, zb0, zb1, mats.body), 'B-parapet-outer-' + j);
    }

    /* ---------- 顶部平台 ---------- */
    add(B(X_TOP_IN, X_OU[1], topY - LAND_TH, topY, Z_TOP[0], Z_TOP[1], mats.step), 'landing-top');
    add(B(X_OU[0], X_OU[1], topY, topY + PARAPET, Z_TOP[0], Z_TOP[1], mats.body), 'landing-top-parapet-outer');
    add(B(X_TOP_IN, X_TOP_IN + 0.15, topY, topY + PARAPET, Z_TOP[0], Z_TOP[1], mats.body), 'landing-top-parapet-inner');
    add(B(X_TOP_IN, X_OU[1], topY, topY + PARAPET, Z_TOP[0], Z_TOP[0] + 0.15, mats.body), 'landing-top-parapet-back');

    /* ---------- 栏杆（简单立柱 + 一道扶手，木色） ---------- */
    if (cfg.railing) {
      var xcB = (X_OU[0] + X_OU[1]) / 2;
      var xcIn = (X_IN[0] + X_IN[1]) / 2;
      function rail(p1, p2, label) {
        add(beam(THREE, p1, p2, RAIL_T, RAIL_T * 1.25, mats.wood), label + '-rail');
        var dx = p2.x - p1.x, dy = p2.y - p1.y, dz = p2.z - p1.z;
        var len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        var n = Math.max(2, Math.round(len / 1.3));
        for (var k = 0; k < n; k++) {
          var t = n === 1 ? 0 : k / (n - 1);
          var x = p1.x + dx * t, y = p1.y + dy * t, z = p1.z + dz * t;
          var post = box(THREE, x - RAIL_T / 2, x + RAIL_T / 2, y, y + RAIL_H, z - RAIL_T / 2, z + RAIL_T / 2, mats.wood);
          add(post, label + '-post-' + k);
        }
      }
      /* 梯段 B 外侧：沿踏口线 */
      rail(V(xcB, yMid + PARAPET, Z_B[0]), V(xcB, topY + PARAPET, Z_B[1]), 'rail-B-outer');
      /* 中间平台外侧 + 后缘 */
      rail(V(xcB, yMid + PARAPET, Z_MID[0]), V(xcB, yMid + PARAPET, Z_MID[1]), 'rail-mid-outer');
      rail(V(X_IN[0], yMid + PARAPET, Z_MID[1] - 0.075), V(X_OU[1], yMid + PARAPET, Z_MID[1] - 0.075), 'rail-mid-back');
      /* 梯段 A 内侧 */
      rail(V(xcIn, baseY + PARAPET, Z_A[0]), V(xcIn, yMid + PARAPET, Z_A[1]), 'rail-A-inner');
      /* 顶部平台外侧 + 后缘 */
      rail(V(xcB, topY + PARAPET, Z_TOP[0]), V(xcB, topY + PARAPET, Z_TOP[1]), 'rail-top-outer');
      rail(V(X_TOP_IN, topY + PARAPET, Z_TOP[0] + 0.075), V(X_OU[1], topY + PARAPET, Z_TOP[0] + 0.075), 'rail-top-back');
    }

    return { group: group, parts: parts };
  }

  /* ===================== build ===================== */
  function build(THREE, opts) {
    if (!THREE) throw new Error('BridgeStairs.build: 需要 THREE');
    opts = opts || {};

    var side = opts.side || 'both';
    var wantL = (side === 'both' || side === 'left');
    var wantR = (side === 'both' || side === 'right');
    var baseY = opts.baseY !== undefined ? opts.baseY : COORDS.BASE_Y;
    var topY = opts.topY !== undefined ? opts.topY : COORDS.TOP_Y;
    var risers = opts.risers || RISERS;
    var nA = opts.stepsLower || N_A;
    var nB = risers - nA;
    if (nB < 1) { nB = 1; nA = risers - 1; }

    var cfg = {
      baseY: baseY, topY: topY,
      riser: (topY - baseY) / risers,
      nA: nA, nB: nB,
      treadA: (Z_A[1] - Z_A[0]) / nA,
      treadB: (Z_B[0] - Z_B[1]) / nB,
      yMid: baseY + nA * ((topY - baseY) / risers),
      railing: opts.railing !== false
    };

    var mats = makeMaterials(THREE, opts);
    var root = new THREE.Group();
    root.name = 'bridge-stairs';
    var parts = [];

    var built = [];
    [wantR ? 1 : 0, wantL ? -1 : 0].forEach(function (s) {
      if (!s) return;
      var one = buildSide(THREE, mats, { side: s, baseY: cfg.baseY, topY: cfg.topY, riser: cfg.riser, nA: cfg.nA, nB: cfg.nB, treadA: cfg.treadA, treadB: cfg.treadB, yMid: cfg.yMid, railing: cfg.railing });
      root.add(one.group);
      built.push(one.parts);
    });

    /* 两岸按层交错，parts 才是真正自下而上的一串（先右岸第 1 级，再左岸第 1 级…） */
    if (built.length === 1) {
      parts = built[0];
    } else if (built.length >= 2) {
      var n = Math.min(built[0].length, built[1].length), k;
      for (k = 0; k < n; k++) { parts.push(built[0][k]); parts.push(built[1][k]); }
      for (k = n; k < built[0].length; k++) parts.push(built[0][k]);
      for (k = n; k < built[1].length; k++) parts.push(built[1][k]);
    }
    for (var pi = 0; pi < parts.length; pi++) parts[pi].userData.stairPart = pi;

    if (opts.parent) opts.parent.add(root);

    /* ---- 逐步显形 ---- */
    var hidden = !!opts.hidden;
    var disposed = false;
    if (hidden) for (var q = 0; q < parts.length; q++) parts[q].visible = false;

    function reveal() {
      for (var i = 0; i < parts.length; i++) parts[i].visible = true;
    }
    /* 显示 parts[0..i]（自下而上）；i<0 全隐藏 */
    function revealStep(i) {
      for (var k = 0; k < parts.length; k++) parts[k].visible = (k <= i);
    }

    var tris = 0;
    root.traverse(function (o) {
      if (!o.isMesh || !o.geometry) return;
      var g = o.geometry;
      tris += (g.index ? g.index.count : (g.attributes.position ? g.attributes.position.count : 0)) / 3;
    });

    return {
      version: VERSION,
      group: root,
      parts: parts,
      coords: COORDS,
      config: {
        baseY: baseY, topY: topY, risers: risers,
        riser: cfg.riser, treadLower: cfg.treadA, treadUpper: cfg.treadB,
        slopeLowerDeg: Math.atan(cfg.riser / cfg.treadA) * 180 / Math.PI,
        slopeUpperDeg: Math.atan(cfg.riser / cfg.treadB) * 180 / Math.PI,
        landingMidY: cfg.yMid, sides: (wantR ? 1 : 0) + (wantL ? 1 : 0)
      },
      stats: { meshes: parts.length, triangles: tris },
      reveal: reveal,
      revealStep: revealStep,
      dispose: function () {
        if (disposed) return;
        disposed = true;
        if (root.parent) root.parent.remove(root);
        root.traverse(function (o) {
          if (o.isMesh) {
            if (o.geometry) o.geometry.dispose();
            var m = o.material;
            if (m) {
              if (m.map) m.map.dispose();
              if (m.bumpMap) m.bumpMap.dispose();
              m.dispose();
            }
          }
        });
        parts.length = 0;
      }
    };
  }

  var API = {
    version: VERSION,
    build: build,
    coords: COORDS,
    layout: {
      risers: RISERS, stepsLower: N_A,
      x: { inner: X_IN, lower: X_A, spine: X_SP, upper: X_B, outer: X_OU, topInner: X_TOP_IN },
      z: { lower: Z_A, upper: Z_B, landingMid: Z_MID, landingTop: Z_TOP },
      parapet: PARAPET, railHeight: RAIL_H, landingThickness: LAND_TH
    }
  };

  global.BridgeStairs = API;
  if (typeof module !== 'undefined' && module.exports) module.exports.BridgeStairs = API;

})(typeof window !== 'undefined' ? window : this);
