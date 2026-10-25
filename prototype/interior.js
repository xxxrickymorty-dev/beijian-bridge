/*!
 * BridgeInterior — 北涧桥 廊屋内部陈设（神龛 / 长凳 / 匾额 / 香案 / 雀替）
 *
 * 独立 classic script：挂 window.BridgeInterior，无 import / 无构建 / 无外部图片。
 * 依赖调用方传入的 THREE（页面里是 vendor/three.min.js，r128）。
 * 不改 index.html，也不碰任何已有对象；dispose() 只清理自己创建的东西。
 *
 * 用法：
 *   var interior = BridgeInterior.build(THREE, {hidden:true});
 *   galleryGroups.interior.add(interior.group);   // 或 scene.add
 *   interior.reveal();                            // 全部显示
 *   interior.reveal({stagger:70});                // 逐个显示（parts 顺序）
 *   interior.dispose();                           // 幂等
 *
 * ---------------------------------------------------------------------------
 * 坐标（与 prototype/index.html 的 buildGallery 对齐；桥面顶 y = 6.40，四柱九檩断面）
 * ---------------------------------------------------------------------------
 *  桥面       x ±23.70          y 6.24 .. 6.40（拱背，bendToCamber 跟弯）
 *  檐柱       21 榀             y deck .. deck+2.55   z ±2.45（截面 .22）
 *  金柱       21 榀             y deck .. deck+3.75   z ±1.35（截面 .2）
 *  穿枋       每榀一道           y deck+2.38 .. 2.56   z ±2.45 通长
 *  栏杆       通长              y deck+0.68 / 1.23    z ±2.25
 *  风雨板     每间一块           y deck+0.09 .. 1.04   z ±2.58
 *
 *  神龛（面朝桥中线 -z，宽 1.70 沿 x，z 中心 1.44 让开金柱）
 *    基座     x -0.90 .. 0.90   y 6.40 .. 6.48   z 1.18 .. 1.70
 *    龛身     x -0.78 .. 0.78   y 7.10 .. 7.66
 *    小歇山   最高 7.88
 *  香案        x ±0.33           y 6.40 .. 7.16   z 0.56 .. 0.92（含香炉）
 *  长凳 ×4段   x ±5.50 .. ±13.50  y 6.40 .. 7.24   zc ±1.80（边廊，靠背贴栏杆 2.18）
 *  匾额 ×3     x -14.22 / 0 / +14.22（落在榀上），板顶 y 8.70（贴穿枋底 8.78 平板位）
 *  雀替 ×4     x ±11.85（榀上）   y 8.43 .. 8.91   z ±2.45（檐柱头斜撑檐枋）
 *
 * 四件事：
 *  1) 全部落在桥面轮廓内（|x| ≤ 14.22，|z| ≤ 2.22），不碰檐柱（2.45）、金柱（1.35）、风雨板（2.58）。
 *  2) 神龛靠 +z 一侧、面朝 -z（桥中线），走道净宽 ≥ 2.4 m（长凳让出中央）。
 *  3) 长凳按段放在两端边廊（x ±5.5..±13.5），中央神龛段留空；带腿带靠背。
 *  4) 匾额吊在穿枋底（板顶 8.70），歇山小顶最高 7.88，与中央匾额背板底留空。
 *
 * 低模：全部 BoxGeometry / 低段数 CylinderGeometry，约 1,200 三角面、90 个网格。
 */
(function (global) {
  'use strict';

  var VERSION = '1.0.0';

  /* ===================== 常量 ===================== */
  var DECK_Y = 6.40;                     // 桥面板顶

  var SHRINE = {
    w: 1.70,                             // 面宽（沿桥长 x）
    d: 0.46,                             // 进深
    zc: 1.44,                            // 中心 z（面朝 -z；让开 f10 金柱 z ±1.35）
    plinthH: 0.08,
    altarH: 0.54,
    topH: 0.08,
    cabH: 0.56,
    capH: 0.06
  };

  var BENCH = {
    runs: [[5.50, 13.50], [-13.50, -5.50]],  // 边廊通长，中央神龛/楼阁段（±5.5）留空
    zc: 1.80,                              // 边廊中（金柱 1.35 与栏杆 2.25 之间）
    halfD: 0.18,
    seatTop: 6.91,
    seatTh: 0.09,
    legH: 0.42,
    backZ: 2.18,                           // 矮靠背贴栏杆内侧
    backTop: 7.24
  };

  var TABLE = {
    w: 0.66, d: 0.36, zc: 0.74,
    topY: 7.00, topTh: 0.06
  };

  /* 匾额吊在檐柱间穿枋底（穿枋底 = deck + 2.38 = 8.78 的平板位；bendToCamber 会跟着拱背走） */
  var PLAQUES = [
    { name: 'plaque-entry-1', x: -14.22, w: 1.50, h: 0.30, top: 8.70 },
    { name: 'plaque-entry-2', x: 14.22, w: 1.50, h: 0.30, top: 8.70 },
    { name: 'plaque-center', x: 0, w: 1.90, h: 0.34, top: 8.70 }
  ];

  /* 雀替：檐柱头（z ±2.45）斜撑纵向檐枋（枋底 deck + 2.53） */
  var BRACKET = { xs: [-11.85, 11.85], z: 2.45, y0: 8.43, y1: 8.91, reach: 0.30, inset: 0.12 };

  var COORDS = {
    deckY: DECK_Y,
    shrine: { x: 0, z: SHRINE.zc, w: SHRINE.w, d: SHRINE.d, face: -1, top: 7.88 },
    benches: { runs: BENCH.runs, z: [BENCH.zc, -BENCH.zc], seatY: BENCH.seatTop },
    table: { x: 0, z: TABLE.zc, topY: TABLE.topY },
    plaques: PLAQUES.map(function (p) { return { name: p.name, x: p.x, y: p.top, z: 0, w: p.w }; }),
    brackets: { xs: BRACKET.xs, z: BRACKET.z, y: BRACKET.y0 }
  };

  /* ===================== 小工具 ===================== */
  function lin(THREE, hex) {
    var c = new THREE.Color(hex);
    if (typeof c.convertSRGBToLinear === 'function') c.convertSRGBToLinear();
    return c;
  }

  function srgb(THREE, tex) {
    if (!tex) return tex;
    if (tex.encoding !== undefined && THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;
    else if (THREE.SRGBColorSpace !== undefined) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function shadows(m) {
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  /* 世界轴对齐方块；x0<x1 / y0<y1 / z0<z1 */
  function box(THREE, x0, x1, y0, y1, z0, z1, material) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), material);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return shadows(m);
  }

  /* 带旋转的板（用于小歇山的两坡） */
  function slab(THREE, cx, cy, cz, w, h, d, rx, material) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(cx, cy, cz);
    m.rotation.x = rx;
    return shadows(m);
  }

  function cylinder(THREE, cx, cy, cz, rTop, rBottom, h, seg, material) {
    var m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg), material);
    m.position.set(cx, cy, cz);
    return shadows(m);
  }

  /* ===================== 程序化木纹（无外部图片） ===================== */
  function woodTexture(THREE) {
    if (typeof document === 'undefined') return null;
    var c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    var g = c.getContext('2d');
    g.fillStyle = '#ddcbaa';
    g.fillRect(0, 0, 128, 128);
    var i, x;
    for (i = 0; i < 26; i++) {
      var y = Math.random() * 128;
      var a = 0.04 + Math.random() * 0.08;
      g.strokeStyle = 'rgba(92,64,40,' + a + ')';
      g.lineWidth = 0.5 + Math.random() * 1.1;
      g.beginPath();
      for (x = 0; x <= 128; x += 8) {
        var yy = y + Math.sin(x / 128 * Math.PI * 2 + i) * 1.4 + (Math.random() - 0.5) * 0.8;
        if (x === 0) g.moveTo(x, yy); else g.lineTo(x, yy);
      }
      g.stroke();
    }
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 2;
    return srgb(THREE, t);
  }

  function makeMaterials(THREE, opts) {
    var tex = opts.textures === false ? null : woodTexture(THREE);
    var list = [];

    function wood(hex, rough, metal) {
      var m = new THREE.MeshStandardMaterial({
        color: lin(THREE, hex),
        roughness: rough === undefined ? 0.84 : rough,
        metalness: metal || 0
      });
      if (tex) { m.map = tex; }
      list.push(m);
      return m;
    }

    return {
      tex: tex,
      list: list,
      wood: wood(0x8a6742, 0.82),        // 神龛、长凳、香案：暖杉木
      woodDark: wood(0x573b26, 0.86),    // 梁下构件、雀替
      frame: wood(0x5c4028, 0.78),       // 匾额边框
      board: wood(0x241610, 0.92),       // 匾心 / 龛内暗部
      roof: wood(0x40301f, 0.88),        // 龛顶小瓦
      metal: wood(0x7a6440, 0.45, 0.30), // 香炉
      wax: wood(0xd8c8a6, 0.72)          // 烛台 / 神主
    };
  }

  /* ===================== 神龛 ===================== */
  function buildShrine(THREE, mats) {
    var W = SHRINE.w, D = SHRINE.d, ZC = SHRINE.zc;
    var x0 = -W / 2, x1 = W / 2;
    var z0 = ZC - D / 2, z1 = ZC + D / 2;

    var baseY = DECK_Y + SHRINE.plinthH;             // 6.48
    var altarTop = baseY + SHRINE.altarH;            // 7.02
    var slabTop = altarTop + SHRINE.topH;            // 7.10
    var cabTop = slabTop + SHRINE.cabH;              // 7.66
    var capTop = cabTop + SHRINE.capH;               // 7.72

    /* ---- 基座 + 供桌 ---- */
    var base = new THREE.Group();
    base.add(box(THREE, x0 - 0.05, x1 + 0.05, DECK_Y, baseY, z0 - 0.03, z1 + 0.03, mats.woodDark));
    base.add(box(THREE, x0, x1, baseY, altarTop, z0, z1, mats.wood));
    base.add(box(THREE, x0 + 0.10, x1 - 0.10, baseY + 0.13, altarTop - 0.09, z0 - 0.018, z0 + 0.002, mats.woodDark)); // 供桌浅浮雕板
    base.add(box(THREE, x0 - 0.04, x1 + 0.04, altarTop, slabTop, z0 - 0.03, z1 + 0.03, mats.woodDark));

    /* ---- 龛身：背板 + 两侧 + 底/顶 ---- */
    var body = new THREE.Group();
    body.add(box(THREE, x0 + 0.08, x1 - 0.08, slabTop, cabTop, z1 - 0.06, z1, mats.board));       // 背板
    body.add(box(THREE, x0 + 0.08, x0 + 0.16, slabTop, cabTop, z0, z1 - 0.06, mats.woodDark));    // 左侧
    body.add(box(THREE, x1 - 0.16, x1 - 0.08, slabTop, cabTop, z0, z1 - 0.06, mats.woodDark));    // 右侧
    body.add(box(THREE, x0 + 0.08, x1 - 0.08, slabTop, slabTop + 0.06, z0, z1 - 0.06, mats.woodDark)); // 底
    body.add(box(THREE, x0 + 0.08, x1 - 0.08, cabTop - 0.06, cabTop, z0, z1 - 0.06, mats.woodDark));   // 顶
    body.add(box(THREE, x0 - 0.10, x1 + 0.10, cabTop, capTop, z0 - 0.03, z1 + 0.03, mats.woodDark));   // 檐口

    /* 小歇山：两坡板，脊沿 x，最高 7.86 */
    var ridgeY = capTop + 0.07;
    body.add(slab(THREE, 0, ridgeY, ZC + 0.14, W + 0.16, 0.05, 0.34, 0.38, mats.roof));
    body.add(slab(THREE, 0, ridgeY, ZC - 0.14, W + 0.16, 0.05, 0.34, -0.38, mats.roof));
    body.add(box(THREE, -0.94, 0.94, ridgeY + 0.05, ridgeY + 0.09, ZC - 0.10, ZC + 0.10, mats.woodDark));

    /* ---- 龛内：神主 + 两只烛台 ---- */
    var offering = new THREE.Group();
    offering.add(box(THREE, -0.12, 0.12, slabTop + 0.10, slabTop + 0.40, ZC + 0.10, ZC + 0.14, mats.board));
    offering.add(cylinder(THREE, -0.34, slabTop + 0.05, ZC + 0.09, 0.035, 0.035, 0.10, 8, mats.metal));
    offering.add(cylinder(THREE, 0.34, slabTop + 0.05, ZC + 0.09, 0.035, 0.035, 0.10, 8, mats.metal));
    offering.add(cylinder(THREE, -0.34, slabTop + 0.13, ZC + 0.09, 0.012, 0.012, 0.16, 6, mats.wax));
    offering.add(cylinder(THREE, 0.34, slabTop + 0.13, ZC + 0.09, 0.012, 0.012, 0.16, 6, mats.wax));

    /* ---- 格扇：外框 4 + 竖 3 + 横 2 ---- */
    var lattice = new THREE.Group();
    var lx0 = -0.83, lx1 = 0.83;
    var ly0 = slabTop + 0.04, ly1 = cabTop - 0.04;   // 7.14 .. 7.62
    var lz0 = z0 - 0.02, lz1 = z0 + 0.02;            // 0.95 .. 0.99
    var bar = 0.04;

    lattice.add(box(THREE, lx0, lx0 + bar, ly0, ly1, lz0, lz1, mats.woodDark));
    lattice.add(box(THREE, lx1 - bar, lx1, ly0, ly1, lz0, lz1, mats.woodDark));
    lattice.add(box(THREE, lx0, lx1, ly1 - bar, ly1, lz0, lz1, mats.woodDark));
    lattice.add(box(THREE, lx0, lx1, ly0, ly0 + bar, lz0, lz1, mats.woodDark));

    var vx = [-0.54, -0.27, 0, 0.27, 0.54], vi;
    for (vi = 0; vi < vx.length; vi++) {
      lattice.add(box(THREE, vx[vi] - bar / 2, vx[vi] + bar / 2, ly0 + bar, ly1 - bar, lz0, lz1, mats.wood));
    }
    var hy = [ly0 + 0.13, ly0 + 0.24, ly0 + 0.35], hi;
    for (hi = 0; hi < hy.length; hi++) {
      lattice.add(box(THREE, lx0 + bar, lx1 - bar, hy[hi] - bar / 2, hy[hi] + bar / 2, lz0, lz1, mats.wood));
    }

    return { base: base, body: body, offering: offering, lattice: lattice };
  }

  /* ===================== 长凳（独立坐凳，带腿与矮靠背；一段 = 一个 x 区间） ===================== */
  function buildBench(THREE, mats, side, run) {
    var g = new THREE.Group();
    var x0 = run[0], x1 = run[1];
    var zc = BENCH.zc * side;
    var z0 = zc - BENCH.halfD, z1 = zc + BENCH.halfD;
    var seatY0 = BENCH.seatTop - BENCH.seatTh;      // 6.82

    g.add(box(THREE, x0, x1, seatY0, BENCH.seatTop, z0, z1, mats.wood));       // 坐板

    var step = Math.min(2.4, (x1 - x0) / 3), nx = Math.max(2, Math.round((x1 - x0) / step));
    for (var li = 0; li <= nx; li++) {
      (function (lx) {
        [-1, 1].forEach(function (o) {
          var lz = zc + o * 0.11;
          g.add(box(THREE, lx - 0.05, lx + 0.05, DECK_Y, seatY0, lz - 0.045, lz + 0.045, mats.woodDark));
        });
      })(x0 + (x1 - x0) * li / nx);
    }
    g.add(box(THREE, x0 + 0.30, x1 - 0.30, 6.56, 6.62, zc - 0.03, zc + 0.03, mats.woodDark)); // 横撑

    var bz = BENCH.backZ * side;
    [x0 + 0.20, (x0 + x1) / 2, x1 - 0.20].forEach(function (px) {
      g.add(box(THREE, px - 0.03, px + 0.03, BENCH.seatTop, BENCH.backTop - 0.12, bz - 0.03, bz + 0.03, mats.woodDark));
    });
    g.add(box(THREE, x0 + 0.12, x1 - 0.12, BENCH.backTop - 0.12, BENCH.backTop, bz - 0.035, bz + 0.035, mats.wood));

    return g;
  }

  /* ===================== 香案 ===================== */
  function buildTable(THREE, mats) {
    var g = new THREE.Group();
    var x0 = -TABLE.w / 2, x1 = TABLE.w / 2;
    var z0 = TABLE.zc - TABLE.d / 2, z1 = TABLE.zc + TABLE.d / 2;
    var topY0 = TABLE.topY - TABLE.topTh;

    g.add(box(THREE, x0, x1, topY0, TABLE.topY, z0, z1, mats.wood));

    [x0 + 0.05, x1 - 0.05].forEach(function (lx) {
      [z0 + 0.05, z1 - 0.05].forEach(function (lz) {
        g.add(box(THREE, lx - 0.03, lx + 0.03, DECK_Y, topY0, lz - 0.03, lz + 0.03, mats.woodDark));
      });
    });
    g.add(box(THREE, x0 + 0.05, x1 - 0.05, 6.56, 6.62, z0 + 0.05, z0 + 0.08, mats.woodDark));
    g.add(box(THREE, x0 + 0.05, x1 - 0.05, 6.56, 6.62, z1 - 0.08, z1 - 0.05, mats.woodDark));

    g.add(cylinder(THREE, 0, TABLE.topY + 0.05, TABLE.zc, 0.075, 0.06, 0.10, 10, mats.metal));
    g.add(cylinder(THREE, 0, TABLE.topY + 0.13, TABLE.zc, 0.055, 0.075, 0.05, 10, mats.metal));

    return g;
  }

  /* ===================== 匾额（无文字，深板 + 边框 + 两销钉） ===================== */
  function buildPlaque(THREE, mats, cfg) {
    var g = new THREE.Group();
    var x = cfg.x, w = cfg.w, h = cfg.h, top = cfg.top;
    var thBack = 0.06, thFace = 0.08;

    g.add(box(THREE, x - thBack / 2, x + thBack / 2, top - h - 0.06, top, -w / 2 - 0.07, w / 2 + 0.07, mats.frame));
    g.add(box(THREE, x - thFace / 2, x + thFace / 2, top - h - 0.02, top - 0.04, -w / 2, w / 2, mats.board));

    [-1, 1].forEach(function (o) {
      var z = o * w * 0.30;
      g.add(box(THREE, x - 0.05, x + 0.05, top - 0.02, top + 0.04, z - 0.02, z + 0.02, mats.woodDark));
    });

    return g;
  }

  /* ===================== 雀替（柱头斜撑，沿梁长方向，落在柱内侧） ===================== */
  function buildBrackets(THREE, mats) {
    var g = new THREE.Group();
    var i, s;

    for (i = 0; i < BRACKET.xs.length; i++) {
      var x = BRACKET.xs[i];
      var dir = x < 0 ? 1 : -1;                       // 指向桥跨中心
      for (s = -1; s <= 1; s += 2) {
        var zc = BRACKET.z * s;
        var xFace = x + dir * BRACKET.inset;          // 柱内侧表面
        var xTip = x + dir * (BRACKET.inset + BRACKET.reach);
        var dx = xTip - xFace;                        // 0.28
        var dy = BRACKET.y1 - BRACKET.y0;             // 0.49
        var len = Math.sqrt(dx * dx + dy * dy);

        var diag = new THREE.Mesh(new THREE.BoxGeometry(len, 0.09, 0.09), mats.woodDark);
        diag.position.set((xFace + xTip) / 2, (BRACKET.y0 + BRACKET.y1) / 2, zc);
        diag.rotation.z = Math.atan2(dy, dx);
        g.add(shadows(diag));

        g.add(box(THREE, Math.min(xFace, xTip), Math.max(xFace, xTip),
          BRACKET.y1 - 0.06, BRACKET.y1, zc - 0.06, zc + 0.06, mats.woodDark));
      }
    }

    return g;
  }

  /* ===================== build ===================== */
  function build(THREE, opts) {
    if (!THREE) throw new Error('BridgeInterior.build: 需要 THREE');
    opts = opts || {};

    var hidden = !!opts.hidden;
    var mats = makeMaterials(THREE, opts);
    var root = new THREE.Group();
    root.name = 'bridge-interior';
    var parts = [];

    function addPart(name, group) {
      group.name = 'interior-' + name;
      group.userData.interiorPart = parts.length;
      group.userData.interiorLabel = name;
      if (hidden) group.visible = false;
      root.add(group);
      parts.push(group);
      return group;
    }

    /* 先家具、后神龛、最后匾额与雀替：parts 顺序就是显形顺序 */
    if (opts.benches !== false) {
      for (var bi = 0; bi < BENCH.runs.length; bi++) {
        addPart('bench-right-' + bi, buildBench(THREE, mats, 1, BENCH.runs[bi]));
        addPart('bench-left-' + bi, buildBench(THREE, mats, -1, BENCH.runs[bi]));
      }
    }

    if (opts.shrine !== false) {
      var sh = buildShrine(THREE, mats);
      addPart('shrine-base', sh.base);
      addPart('shrine-cabinet', sh.body);
      addPart('shrine-offering', sh.offering);
      addPart('shrine-lattice', sh.lattice);
    }

    if (opts.incense !== false) addPart('incense-table', buildTable(THREE, mats));

    if (opts.plaques !== false) {
      for (var i = 0; i < PLAQUES.length; i++) {
        addPart(PLAQUES[i].name, buildPlaque(THREE, mats, PLAQUES[i]));
      }
    }

    if (opts.brackets !== false) addPart('brackets', buildBrackets(THREE, mats));

    if (opts.parent) opts.parent.add(root);

    /* ---- 显示 / 释放 ---- */
    var timers = [];
    var disposed = false;

    function clearTimers() {
      for (var k = 0; k < timers.length; k++) clearTimeout(timers[k]);
      timers.length = 0;
    }

    function reveal(revealOpts) {
      if (disposed) return 0;
      var stagger = (revealOpts && revealOpts.stagger) || 0;
      clearTimers();
      root.visible = true;
      for (var k = 0; k < parts.length; k++) {
        (function (p, idx) {
          function show() {
            p.visible = true;
            /* 兼容调用方曾把内部 mesh 逐个隐藏（如 buildGallery 的 instant 分支） */
            p.traverse(function (o) { o.visible = true; });
          }
          if (!stagger) { show(); return; }
          timers.push(setTimeout(show, idx * stagger));
        })(parts[k], k);
      }
      return parts.length;
    }

    var meshes = 0, tris = 0;
    root.traverse(function (o) {
      if (!o.isMesh || !o.geometry) return;
      meshes++;
      var geo = o.geometry;
      tris += (geo.index ? geo.index.count : (geo.attributes.position ? geo.attributes.position.count : 0)) / 3;
    });

    return {
      version: VERSION,
      group: root,
      parts: parts,
      coords: COORDS,
      stats: { meshes: meshes, triangles: Math.round(tris), materials: mats.list.length, textures: mats.tex ? 1 : 0 },
      reveal: reveal,
      dispose: function () {
        if (disposed) return;
        disposed = true;
        clearTimers();
        if (root.parent) root.parent.remove(root);
        root.traverse(function (o) {
          if (o.isMesh && o.geometry) o.geometry.dispose();
        });
        if (mats.tex) mats.tex.dispose();
        for (var k = 0; k < mats.list.length; k++) mats.list[k].dispose();
        parts.length = 0;
      }
    };
  }

  var API = {
    version: VERSION,
    build: build,
    coords: COORDS,
    layout: {
      deckY: DECK_Y,
      shrine: SHRINE,
      bench: BENCH,
      table: TABLE,
      plaques: PLAQUES,
      bracket: BRACKET
    }
  };

  global.BridgeInterior = API;
  if (typeof module !== 'undefined' && module.exports) module.exports.BridgeInterior = API;

})(typeof window !== 'undefined' ? window : this);
