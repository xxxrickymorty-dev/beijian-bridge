/*!
 * JointGallery — 榫卯节点图鉴（独立小窗口，逐个动画演示桥上的六种接合）
 *
 * 自包含 classic script：挂 window.JointGallery，样式/ DOM 全部自己注入，
 * 不改 index.html 的任何对象。用法：
 *   JointGallery.open();          // 打开（默认第一式）
 *   JointGallery.open(3);         // 打开并定位到第 3 式
 *   JointGallery.close();
 *   JointGallery.isOpen()
 *
 * 每一式 = 一个迷你三维场景 + 装配动画（构件沿真实插入方向滑/落到位，
 * 木销最后打穿）+ 两句讲解。可拖动旋转、滚轮缩放，「重播」重放装配。
 * 打开期间才跑自己的 RAF；关闭即停，不占主体验的帧。
 *
 * 六式（与 prototype/index.html 的实际构造一一对应）：
 *   1 牛头承插   2 搭接穿销   3 别压半榫
 *   4 骑搭节点   5 平苗叠压   6 柱脚暗榫
 *
 * 示意几何：不是测绘复原，尺寸给近景看清楚用的。
 */
(function (global) {
  'use strict';

  var VERSION = '1.0.0';

  /* ============================================================ 样式 */
  var CSS = [
    '.jg-veil{position:fixed;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;',
    'background:rgba(10,8,6,.62);backdrop-filter:blur(3px);opacity:0;pointer-events:none;transition:opacity .35s;}',
    '.jg-veil.open{opacity:1;pointer-events:auto;}',
    '.jg-card{width:min(860px,94vw);background:#161210;border:1px solid rgba(233,223,205,.16);border-radius:4px;',
    'box-shadow:0 24px 70px rgba(0,0,0,.55);color:#e9dfcd;font-family:"PingFang SC","Microsoft YaHei",sans-serif;',
    'transform:translateY(10px);transition:transform .35s;}',
    '.jg-veil.open .jg-card{transform:none;}',
    '.jg-head{display:flex;align-items:baseline;gap:12px;padding:16px 20px 10px;border-bottom:1px solid rgba(233,223,205,.12);}',
    '.jg-head h2{margin:0;font-family:"Source Han Serif SC","Songti SC","SimSun",serif;font-size:20px;letter-spacing:.12em;font-weight:600;}',
    '.jg-head .sub{font-size:10.5px;letter-spacing:.16em;color:#7c7061;}',
    '.jg-head .x{margin-left:auto;background:none;border:1px solid rgba(233,223,205,.25);color:#b3a48d;',
    'width:30px;height:30px;border-radius:2px;cursor:pointer;font-size:14px;line-height:1;}',
    '.jg-head .x:hover{color:#e9dfcd;border-color:rgba(233,223,205,.5);}',
    '.jg-tabs{display:flex;flex-wrap:wrap;gap:6px;padding:12px 20px 0;}',
    '.jg-tabs button{font-size:11.5px;letter-spacing:.06em;color:#b3a48d;background:transparent;',
    'border:1px solid rgba(233,223,205,.18);border-radius:2px;padding:6px 11px;cursor:pointer;transition:.15s;}',
    '.jg-tabs button:hover{color:#e9dfcd;}',
    '.jg-tabs button.on{color:#161210;background:#e9dfcd;border-color:#e9dfcd;}',
    '.jg-stage{position:relative;height:400px;margin:14px 20px 0;background:radial-gradient(ellipse at 50% 62%,#241c14 0%,#120e0b 78%);',
    'border:1px solid rgba(233,223,205,.1);border-radius:3px;overflow:hidden;}',
    '.jg-stage canvas{display:block;width:100%;height:100%;}',
    '.jg-hint{position:absolute;left:12px;top:10px;font-size:10px;letter-spacing:.14em;color:#5e554a;pointer-events:none;}',
    '.jg-scrub{position:absolute;left:14px;bottom:16px;width:38%;accent-color:#d75b3c;cursor:pointer;}',
    '.jg-replay{position:absolute;right:12px;bottom:10px;font-size:11px;letter-spacing:.1em;color:#e9dfcd;',
    'background:rgba(20,17,15,.7);border:1px solid rgba(233,223,205,.4);border-radius:2px;padding:6px 14px;cursor:pointer;}',
    '.jg-replay:hover{background:#e9dfcd;color:#161210;}',

    '.jg-caption{padding:14px 20px 18px;display:flex;gap:18px;align-items:flex-start;}',
    '.jg-nav{display:flex;gap:6px;flex:none;}',
    '.jg-nav button{width:34px;height:34px;background:transparent;border:1px solid rgba(233,223,205,.2);',
    'color:#b3a48d;border-radius:2px;cursor:pointer;font-size:15px;}',
    '.jg-nav button:hover{color:#e9dfcd;border-color:rgba(233,223,205,.5);}',
    '.jg-text h3{margin:0 0 6px;font-family:"Source Han Serif SC","Songti SC","SimSun",serif;font-size:17px;letter-spacing:.08em;}',
    '.jg-text h3 em{font-style:normal;color:#d75b3c;margin-right:8px;font-size:12px;letter-spacing:.2em;}',
    '.jg-text p{margin:0;font-size:12.5px;line-height:1.9;color:#c4b6a0;}',
    '@media (max-width:760px){.jg-stage{height:300px;}.jg-caption{flex-direction:column;gap:10px;}}'
  ].join('\n');

  /* ============================================================ 讲解文案 */
  /* 每式的 build 见下面 DEMOS：几何 + 装配时间线 */

  /* ============================================================ 小工具 */
  function lin(THREE, hex) {
    var c = new THREE.Color(hex);
    if (typeof c.convertSRGBToLinear === 'function') c.convertSRGBToLinear();
    return c;
  }
  function wood(THREE, hex, rough) {
    return new THREE.MeshStandardMaterial({
      color: lin(THREE, hex),
      roughness: rough === undefined ? 0.84 : rough,
      metalness: 0
    });
  }
  function edges(THREE, mesh, opacity) {
    var e = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry),
      new THREE.LineBasicMaterial({ color: 0x1a1209, transparent: true, opacity: opacity || 0.4 })
    );
    mesh.add(e);
    return mesh;
  }
  function boxMesh(THREE, mat, sx, sy, sz, withEdges) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    if (withEdges !== false) edges(THREE, m);
    return m;
  }
  function cylMesh(THREE, mat, r, len, axis) {
    var m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14), mat);
    if (axis === 'x') m.rotation.z = Math.PI / 2;
    return m;
  }
  /* 带帽竖销 */
  function pegMesh(THREE, mat, len, r) {
    var g = new THREE.Group();
    var shaft = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), mat);
    g.add(shaft);
    [-1, 1].forEach(function (s) {
      var cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.6, r * 1.6, 0.05, 10), mat);
      cap.position.y = s * (len / 2 + 0.03);
      g.add(cap);
    });
    return g;
  }
  /* 卯口示意：暗槽板 + 一圈木框 */
  function mortisePlate(THREE, mat, rimMat, w, d) {
    var g = new THREE.Group();
    var hole = boxMesh(THREE, mat, w - 0.02, 0.03, d - 0.02, false);
    hole.position.y = 0.015;
    g.add(hole);
    var t = 0.05;
    [[0, -(d + t) / 2], [0, (d + t) / 2]].forEach(function (p) {
      var bar = boxMesh(THREE, rimMat, w + t * 2, 0.05, t);
      bar.position.set(p[0], 0.03, p[1]);
      g.add(bar);
    });
    [[-(w + t) / 2, 0], [(w + t) / 2, 0]].forEach(function (p) {
      var bar = boxMesh(THREE, rimMat, t, 0.05, d);
      bar.position.set(p[0], 0.03, p[1]);
      g.add(bar);
    });
    return g;
  }
  /* 沿轴 (dir 已归一) 摆一根梁：center 为梁中点 */
  function placeBeam(mesh, center, dir) {
    mesh.position.set(center[0], center[1], center[2]);
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(dir[0], dir[1], dir[2]).normalize()
    );
    return mesh;
  }

  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  /* ============================================================ 材质（懒建，三块共用） */
  var M = null;
  function mats(THREE) {
    if (M) return M;
    M = {
      san: wood(THREE, 0xb08f63),        // 三节苗：蜜色杉木
      wu: wood(THREE, 0x9c4a30),         // 五节苗：红褐
      dark: wood(THREE, 0x2e251d, 0.9),  // 牛头 / 节点木
      joint: wood(THREE, 0x32281f, 0.88),// 木销
      slot: wood(THREE, 0x140e08, 0.95), // 卯口槽底
      rim: wood(THREE, 0x54402a, 0.86)   // 卯口木框
    };
    return M;
  }

  /* ============================================================ 六式 */
  /* 每式返回 { name, sub, desc, cam:[x,y,z], build(T, root) -> parts }
     part = { obj, from:{p:[..], ry?}, to:{p:[..], ry?}, t0, t1 }  （t 为 0..1 的时间片） */

  var DEMOS = [

    /* ---------- 1 牛头承插 ---------- */
    {
      name: '牛头承插',
      sub: '苗头 · 卯口 · 穿销',
      desc: '苗头削成方榫，插进牛头顶面凿开的卯口；再打一根穿销锁死。两套拱骨的全部推力，都从这排卯口传进牛头、压到桥台上。',
      cam: [2.4, 1.9, 3.1],
      build: function (T, root) {
        var m = mats(T), parts = [];
        var head = boxMesh(T, m.dark, 1.5, 1.0, 1.3);
        head.position.set(0, -0.5, 0);
        root.add(head);
        root.add((function () {
          var plate = mortisePlate(T, m.slot, m.rim, 0.55, 0.45);
          plate.position.set(0, 0.005, 0);
          return plate;
        })());
        /* 斜苗：端头（方榫）插进卯口。梁组局部 Y = 插接方向 d，
           榫头在局部 +y 端 = 指向卯口的一端 */
        var beamG = new T.Group();
        var d = [0.86, -0.5, 0];                     // 从梁身指向卯口
        beamG.add(cylMesh(T, m.san, 0.21, 1.5));
        var collar = boxMesh(T, m.rim, 0.5, 0.09, 0.5);
        collar.position.y = 0.66;
        beamG.add(collar);
        var tongue = boxMesh(T, m.san, 0.26, 0.34, 0.26);
        tongue.position.y = 0.85;
        beamG.add(tongue);
        /* 榫头端 E=(0,0.15,0)，梁中点 = E - d*0.75 */
        var cx = 0 - d[0] * 0.75, cy = 0.15 - d[1] * 0.75;
        var to = new T.Vector3(cx, cy, 0);
        placeBeam(beamG, [cx, cy, 0], d);
        var from = new T.Vector3(cx - d[0] * 1.25, cy - d[1] * 1.25, 0);
        beamG.position.copy(from);
        root.add(beamG);
        parts.push({ obj: beamG, fromP: from, toP: to, t0: 0.04, t1: 0.44 });
        /* 穿销：从牛头前上方打下去，穿过苗头 */
        var peg = pegMesh(T, m.joint, 0.9, 0.075);
        peg.position.set(0, 1.3, 0);
        root.add(peg);
        parts.push({ obj: peg, fromP: new T.Vector3(0, 1.3, 0), toP: new T.Vector3(0, 0.32, 0), t0: 0.56, t1: 0.78 });
        return parts;
      }
    },

    /* ---------- 2 搭接穿销 ---------- */
    {
      name: '搭接穿销',
      sub: '短苗接长 · 竖销受剪',
      desc: '同一套系统的短苗在节点处接长：端头对搭，竖向木销从上穿下。拱越大苗越短，全靠这一路销子把短料接力成大跨；销子受剪，越压咬得越死。',
      cam: [2.9, 1.5, 3.2],
      build: function (T, root) {
        var m = mats(T), parts = [];
        var left = cylMesh(T, m.san, 0.21, 1.5, 'x');
        left.position.set(-0.73, 0, 0);
        root.add(left);
        root.add((function () {
          var plate = mortisePlate(T, m.slot, m.rim, 0.3, 0.5);
          plate.rotation.y = Math.PI / 2;
          plate.position.set(-0.02, 0.21, 0);
          return plate;
        })());
        var right = cylMesh(T, m.san, 0.21, 1.5, 'x');
        root.add(right);
        parts.push({
          obj: right,
          fromP: new T.Vector3(2.1, 0, 0), toP: new T.Vector3(0.73, 0, 0),
          t0: 0.05, t1: 0.45
        });
        [[0.02, 0.62, 0.8], [0.4, 0.72, 0.92]].forEach(function (cfg) {
          var peg = pegMesh(T, m.joint, 1.0, 0.07);
          peg.position.set(cfg[0], 1.25, 0);
          root.add(peg);
          parts.push({ obj: peg, fromP: new T.Vector3(cfg[0], 1.25, 0), toP: new T.Vector3(cfg[0], 0, 0), t0: cfg[1], t1: cfg[2] });
        });
        return parts;
      }
    },

    /* ---------- 3 别压半榫 ---------- */
    {
      name: '别压半榫',
      sub: '两套斜苗互锁 · 「别」与「压」',
      desc: '两套拱骨的斜苗在交点各刻掉一半断面、互相咬合：上面的压不住转动，下面的别不住滑移。交点上再加一块节点木、两根木销夹紧——「顶、别、撑、压」的「别压」就发生在这里。',
      cam: [2.7, 1.7, 3.3],
      build: function (T, root) {
        var m = mats(T), parts = [];
        /* 带半高缺口的梁：两段整断面 + 中段半断面 */
        function lapBeam(mat, angle, midAt) {
          var g = new T.Group();
          var seg = 0.62, notch = 0.5, half = 0.2;
          [-1, 1].forEach(function (s) {
            var piece = boxMesh(T, mat, seg, 0.4, 0.4);
            piece.position.x = s * (seg + notch) / 2;
            g.add(piece);
          });
          var mid = boxMesh(T, mat, notch, half, 0.4);
          mid.position.y = midAt;                    // -0.1 留下半 / +0.1 留上半
          g.add(mid);
          g.rotation.z = angle;
          return g;
        }
        var lower = lapBeam(m.san, -0.2, -0.1);
        root.add(lower);
        var upper = lapBeam(m.wu, 0.16, 0.1);
        var uTo = new T.Vector3(0.05, 0.0, 0);       /* 与下梁同轴心：缺口互补、真正互锁 */
        var uFrom = new T.Vector3(1.35, 0.62, 0);
        upper.position.copy(uFrom);
        root.add(upper);
        parts.push({ obj: upper, fromP: uFrom, toP: uTo, t0: 0.22, t1: 0.58 });
        var block = boxMesh(T, m.dark, 0.46, 0.24, 0.72);
        block.position.set(0, 0.78, 0);
        root.add(block);
        parts.push({ obj: block, fromP: new T.Vector3(0, 0.78, 0), toP: new T.Vector3(0, 0.3, 0), t0: 0.64, t1: 0.8 });
        [[-0.14, 0.82, 0.94], [0.14, 0.86, 0.98]].forEach(function (cfg) {
          var peg = pegMesh(T, m.joint, 1.15, 0.065);
          peg.position.set(cfg[0], 1.35, 0);
          root.add(peg);
          parts.push({ obj: peg, fromP: new T.Vector3(cfg[0], 1.35, 0), toP: new T.Vector3(cfg[0], 0.28, 0), t0: cfg[1], t1: cfg[2] });
        });
        return parts;
      }
    },

    /* ---------- 4 骑搭节点 ---------- */
    {
      name: '骑搭节点',
      sub: '五节苗搭在三节苗上 · 节点木隔层',
      desc: '五节苗的斜苗从上面搭到三节苗的斜苗上，两层之间垫一块节点木隔开，免得木料互相磨损；木销竖向穿锁三层。五节苗先落在三节苗的斜杆上，再抬到中央托住平苗。',
      cam: [2.8, 1.8, 3.2],
      build: function (T, root) {
        var m = mats(T), parts = [];
        var lower = cylMesh(T, m.san, 0.24, 1.9, 'x');
        /* cylMesh('x') 已把轴转到世界 X；再叠加俯仰角 = π/2 + 坡度（覆盖会变竖杆） */
        lower.rotation.z = Math.PI / 2 + 0.45;
        root.add(lower);
        var upper = new T.Group();
        var ub = cylMesh(T, m.wu, 0.17, 1.5, 'x');
        ub.rotation.z = Math.PI / 2 - 0.18;
        upper.add(ub);
        root.add(upper);
        var uFrom = new T.Vector3(1.6, 1.35, 0), uTo = new T.Vector3(0.05, 0.56, 0);
        upper.position.copy(uFrom);
        parts.push({ obj: upper, fromP: uFrom, toP: uTo, t0: 0.06, t1: 0.48 });
        var block = boxMesh(T, m.dark, 0.42, 0.18, 0.62);
        root.add(block);
        parts.push({ obj: block, fromP: new T.Vector3(0.1, 1.15, 0), toP: new T.Vector3(0.04, 0.36, 0), t0: 0.54, t1: 0.7 });
        [[-0.1, 0.74, 0.88], [0.18, 0.8, 0.95]].forEach(function (cfg) {
          var peg = pegMesh(T, m.joint, 1.0, 0.06);
          peg.position.set(cfg[0], 1.3, 0);
          root.add(peg);
          parts.push({ obj: peg, fromP: new T.Vector3(cfg[0], 1.3, 0), toP: new T.Vector3(cfg[0], 0.28, 0), t0: cfg[1], t1: cfg[2] });
        });
        return parts;
      }
    },

    /* ---------- 5 平苗叠压 ---------- */
    {
      name: '平苗叠压',
      sub: '三节苗承面 · 五节苗托底 · 长销穿两层',
      desc: '中央平直段：三节苗平苗在上、直接承桥面；五节苗平苗从下面托住它，隔一层节点木。长木销从上穿透两层平苗——两套系统在跨中就这样互相顶死。',
      cam: [3.1, 1.7, 3.3],
      build: function (T, root) {
        var m = mats(T), parts = [];
        var upper = boxMesh(T, m.san, 2.1, 0.32, 0.52);
        upper.position.set(0, 0.18, 0);
        root.add(upper);
        var lower = boxMesh(T, m.wu, 2.1, 0.28, 0.46);
        root.add(lower);
        parts.push({ obj: lower, fromP: new T.Vector3(-2.3, -0.2, 0), toP: new T.Vector3(0, -0.2, 0), t0: 0.05, t1: 0.45 });
        var pad = boxMesh(T, m.dark, 0.5, 0.07, 0.6);
        root.add(pad);
        parts.push({ obj: pad, fromP: new T.Vector3(0, 0.9, 0), toP: new T.Vector3(0, 0.01, 0), t0: 0.52, t1: 0.66 });
        [[0, 0.7, 0.88], [0.55, 0.78, 0.96]].forEach(function (cfg) {
          var peg = pegMesh(T, m.joint, 1.15, 0.06);
          peg.position.set(cfg[0], 1.35, 0);
          root.add(peg);
          parts.push({ obj: peg, fromP: new T.Vector3(cfg[0], 1.35, 0), toP: new T.Vector3(cfg[0], 0, 0), t0: cfg[1], t1: cfg[2] });
        });
        return parts;
      }
    },

    /* ---------- 6 柱脚暗榫 ---------- */
    {
      name: '柱脚暗榫',
      sub: '柱脚入梁 · 柱头留卯',
      desc: '廊柱柱脚削出方榫，插进桥面梁凿开的卯口，侧面再打一根暗销；柱头留着卯口等上面的梁。84 根廊柱就这样把廊屋和拱架连成一体，荷载经柱脚交给拱。',
      cam: [2.5, 1.6, 3.0],
      build: function (T, root) {
        var m = mats(T), parts = [];
        var beam = boxMesh(T, m.san, 1.7, 0.28, 0.6);
        beam.position.set(0, -0.3, 0);
        root.add(beam);
        root.add((function () {
          var plate = mortisePlate(T, m.slot, m.rim, 0.24, 0.24);
          plate.position.set(0, -0.145, 0);
          return plate;
        })());
        var col = new T.Group();
        var shaft = boxMesh(T, m.rim, 0.24, 0.85, 0.24);
        shaft.position.y = 0.335;
        col.add(shaft);
        var tenon = boxMesh(T, m.rim, 0.15, 0.2, 0.15);
        tenon.position.y = -0.14;
        col.add(tenon);
        var cFrom = new T.Vector3(0, 1.5, 0), cTo = new T.Vector3(0, 0.28, 0);
        col.position.copy(cFrom);
        root.add(col);
        parts.push({ obj: col, fromP: cFrom, toP: cTo, t0: 0.06, t1: 0.5 });
        var peg = pegMesh(T, m.joint, 0.62, 0.055);
        peg.rotation.z = Math.PI / 2;
        peg.position.set(0, -0.14, 1.0);
        root.add(peg);
        parts.push({ obj: peg, fromP: new T.Vector3(0, -0.14, 1.0), toP: new T.Vector3(0, -0.14, 0), t0: 0.6, t1: 0.8 });
        return parts;
      }
    }
  ];

  /* ============================================================ 运行时 */
  var S = {
    open: false,
    idx: 0,
    renderer: null,
    scene: null,
    camera: null,
    controls: null,
    root: null,
    parts: null,
    t0: 0,
    manual: null,
    raf: 0,
    dom: null,
    DUR: 4.6            // 每式装配总时长（秒）
  };

  function ensureDom(THREE) {
    if (S.dom) return;
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    var veil = document.createElement('div');
    veil.className = 'jg-veil';
    veil.innerHTML =
      '<div class="jg-card">' +
        '<div class="jg-head"><h2>榫卯节点图鉴</h2><span class="sub">JOINT ATLAS · 六式 · 示意几何</span>' +
        '<button class="x" data-jg="close" title="关闭">✕</button></div>' +
        '<div class="jg-tabs"></div>' +
        '<div class="jg-stage"><canvas></canvas><span class="jg-hint">拖动旋转 · 滚轮缩放</span>' +
        '<input class="jg-scrub" data-jg="scrub" type="range" min="0" max="1000" value="1000" title="拖动看装配过程">' +
        '<button class="jg-replay" data-jg="replay">↻ 重播装配</button></div>' +
        '<div class="jg-caption"><div class="jg-nav">' +
        '<button data-jg="prev" title="上一式">‹</button><button data-jg="next" title="下一式">›</button></div>' +
        '<div class="jg-text"><h3></h3><p></p></div></div>' +
      '</div>';
    document.body.appendChild(veil);

    S.dom = {
      veil: veil,
      tabs: veil.querySelector('.jg-tabs'),
      canvas: veil.querySelector('canvas'),
      scrub: veil.querySelector('.jg-scrub'),
      h3: veil.querySelector('.jg-text h3'),
      p: veil.querySelector('.jg-text p'),
      stage: veil.querySelector('.jg-stage')
    };

    DEMOS.forEach(function (d, i) {
      var b = document.createElement('button');
      b.textContent = (i + 1) + ' ' + d.name;
      b.addEventListener('click', function () { show(i); });
      S.dom.tabs.appendChild(b);
    });

    veil.addEventListener('click', function (e) {
      var act = e.target && e.target.getAttribute && e.target.getAttribute('data-jg');
      if (act === 'close') close();
      else if (act === 'replay') replay();
      else if (act === 'prev') show((S.idx + DEMOS.length - 1) % DEMOS.length);
      else if (act === 'next') show((S.idx + 1) % DEMOS.length);
      else if (e.target === veil) close();
    });
    S.dom.scrub.addEventListener('input', function () {
      S.manual = parseInt(S.dom.scrub.value, 10) / 1000;
    });

    window.addEventListener('keydown', function (e) {
      if (!S.open) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') show((S.idx + DEMOS.length - 1) % DEMOS.length);
      else if (e.key === 'ArrowRight') show((S.idx + 1) % DEMOS.length);
      else if (e.key === 'r' || e.key === 'R') replay();
    });

    /* 三维小舞台 */
    S.renderer = new THREE.WebGLRenderer({ canvas: S.dom.canvas, antialias: true, alpha: true });
    S.renderer.setClearColor(0x000000, 0);
    S.renderer.outputEncoding = THREE.sRGBEncoding;
    S.scene = new THREE.Scene();
    S.camera = new THREE.PerspectiveCamera(40, 1, 0.05, 60);
    S.camera.position.set(2.6, 1.7, 3.2);
    S.controls = new THREE.OrbitControls(S.camera, S.dom.canvas);
    S.controls.enableDamping = true;
    S.controls.dampingFactor = 0.08;
    S.controls.enablePan = false;
    S.controls.minDistance = 1.2;
    S.controls.maxDistance = 9;
    S.controls.target.set(0, 0.05, 0);

    var hemi = new THREE.HemisphereLight(0xfff2e0, 0x3a2c1e, 0.85);
    S.scene.add(hemi);
    var key = new THREE.DirectionalLight(0xffe0b0, 1.5);
    key.position.set(3, 5, 4);
    S.scene.add(key);
    var fill = new THREE.DirectionalLight(0xa9cfe0, 0.45);
    fill.position.set(-4, 2, -3);
    S.scene.add(fill);

    var ground = new THREE.Mesh(
      new THREE.CircleGeometry(2.1, 40),
      new THREE.MeshBasicMaterial({ color: 0x2a2118, transparent: true, opacity: 0.55 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.72;
    S.scene.add(ground);

    S.root = new THREE.Group();
    S.scene.add(S.root);

    sizeStage();
    window.addEventListener('resize', sizeStage);
  }

  function sizeStage() {
    if (!S.dom) return;
    var w = S.dom.stage.clientWidth, h = S.dom.stage.clientHeight;
    if (!w || !h) return;
    S.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    S.renderer.setSize(w, h, false);
    S.camera.aspect = w / h;
    S.camera.updateProjectionMatrix();
  }

  function show(i) {
    var T = window.THREE;
    ensureDom(T);
    S.idx = (i + DEMOS.length) % DEMOS.length;
    var d = DEMOS[S.idx];
    /* 清场重建 */
    while (S.root.children.length) S.root.remove(S.root.children[0]);
    S.parts = d.build(T, S.root);
    S.t0 = performance.now();
    S.manual = null;
    S.dom.scrub.value = 1000;
    S.camera.position.set(d.cam[0], d.cam[1], d.cam[2]);
    S.controls.target.set(0, 0.05, 0);
    /* 方位角锁在初始视角 ±55°：梁都沿 x 摆，转到轴线上就看不出交叉了 */
    var az0 = Math.atan2(d.cam[2], d.cam[0]);
    S.controls.minAzimuthAngle = az0 - 0.95;
    S.controls.maxAzimuthAngle = az0 + 0.95;
    S.controls.autoRotate = false;      // 装配过程中不转，播完再缓缓转
    Array.prototype.forEach.call(S.dom.tabs.children, function (b, k) {
      b.className = k === S.idx ? 'on' : '';
    });
    S.dom.h3.innerHTML = '<em>' + String(S.idx + 1).padStart(2, '0') + '</em>' + d.name +
      ' <span style="font-size:11px;color:#7c7061;letter-spacing:.1em;">' + d.sub + '</span>';
    S.dom.p.textContent = d.desc;
    if (!S.open) {
      S.dom.veil.classList.add('open');
      S.open = true;
      sizeStage();
    }
    loop();
  }

  function replay() {
    var d = DEMOS[S.idx];
    while (S.root.children.length) S.root.remove(S.root.children[0]);
    S.parts = d.build(window.THREE, S.root);
    S.t0 = performance.now();
    S.manual = null;
    S.dom.scrub.value = 1000;
    loop();
  }

  function applyParts(now, forceP) {
    var p = forceP !== undefined ? forceP : (S.manual !== null ? S.manual : Math.min(1, (now - S.t0) / (S.DUR * 1000)));
    for (var i = 0; i < S.parts.length; i++) {
      var pt = S.parts[i];
      var k = (p - pt.t0) / (pt.t1 - pt.t0);
      k = Math.max(0, Math.min(1, k));
      var e = easeInOut(k);
      pt.obj.position.set(
        pt.fromP.x + (pt.toP.x - pt.fromP.x) * e,
        pt.fromP.y + (pt.toP.y - pt.fromP.y) * e,
        pt.fromP.z + (pt.toP.z - pt.fromP.z) * e
      );
    }
    return p;
  }

  function loop() {
    cancelAnimationFrame(S.raf);
    var step = function () {
      if (!S.open) return;
      applyParts(performance.now());
      S.controls.update();
      S.renderer.render(S.scene, S.camera);
      S.raf = requestAnimationFrame(step);
    };
    S.raf = requestAnimationFrame(step);
  }

  function open(idx) {
    show(idx === undefined ? 0 : idx);
  }
  function close() {
    S.open = false;
    cancelAnimationFrame(S.raf);
    if (S.dom) S.dom.veil.classList.remove('open');
  }

  global.JointGallery = {
    version: VERSION,
    open: open,
    close: close,
    isOpen: function () { return S.open; },
    /* 调试/测试用：立即把装配摆到 p（0..1）并渲染一帧 */
    _snap: function (p) {
      applyParts(performance.now(), p === undefined ? 1 : p);
      S.renderer.render(S.scene, S.camera);
    },
    _state: S,
    demos: DEMOS.map(function (d) { return d.name; })
  };

})(typeof window !== 'undefined' ? window : this);
