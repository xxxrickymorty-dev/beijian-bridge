/*!
 * BridgeHead — 北涧桥 四角桥头屋（两层木构住家，precision-layout.md §4.3）
 *
 * 独立 classic script：挂 window.BridgeHead，无 import / 无构建 / 无外部贴图。
 * 依赖调用方传入的 THREE（页面里是 vendor/three.min.js，r128）。
 *
 * 用法：
 *   var bh = BridgeHead.build(THREE, { corner: 'SE', baseDepth: 2.75, hidden: true });
 *   bh.group.position.set(sx * 20.5, 5.35, sz * 5.15);   // 落位（floor 5.35 = 台地 + 台基）
 *   if (北岸) bh.group.scale.z = -1;                      // 镜像到北侧
 *   bh.parts   // 自下而上排序的构件数组，供 revealCat 逐件显形
 *
 * ---------------------------------------------------------------------------
 * 局部坐标（原点 = 一层地面中心；x 沿桥，z 负边朝河/朝外，正边贴廊屋）
 * ---------------------------------------------------------------------------
 *  石台基      x -3.30..3.30   y -baseDepth..0    z -2.35..2.35
 *  一层地面    x -3.10..3.10   y 0..0.08
 *  一层柱网    x ±2.85         z -1.95 / 0 / 1.95，柱高 2.45
 *  二层楼板    y 2.53..2.68
 *  二层墙身    y 2.68..4.90（前檐三樘格扇窗，两山各两樘）
 *  檐口        y 5.30（z ±2.70，含出檐）
 *  正脊        y 6.40（脊压顶 6.52；world 5.35 + 6.40 = 11.75，比廊屋脊高、比楼阁矮）
 *
 * 四幢落位（world）：x = ±20.5（占 x 17.3..23.7），z = ±5.15（占 z 2.9..7.4）；
 * 台基深度：东岸 2.75（落到东台地 2.67），西岸 4.35（落到西台地 1.07）。
 */
(function (global) {
  'use strict';

  var VERSION = '2.0.0';

  var FLOOR_Y = 0;               // 一层地面（局部）
  var GF_TOP = 2.53;             // 一层柱顶 / 二层楼板底
  var SLAB_TOP = 2.68;           // 二层楼板顶
  var WALL_TOP = 4.90;           // 二层墙顶
  var EAVE_Y = 5.30;             // 檐口
  var RIDGE_Y = 6.40;            // 正脊
  var RIDGE_CAP = 6.52;          // 脊压顶
  var ROOF_HALF_X = 3.5;         // 屋面 x 半长（含出梢）
  var ROOF_HALF_Z = 2.70;        // 檐口 z 半宽（含出檐）
  var BODY = { x0: -3.10, x1: 3.10, z0: -2.20, z1: 2.20 };

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

  function setShadows(m, cast) {
    m.castShadow = cast !== false;
    m.receiveShadow = true;
    return m;
  }

  function std(THREE, hex, o) {
    o = o || {};
    return new THREE.MeshStandardMaterial({
      color: lin(THREE, hex),
      roughness: o.roughness !== undefined ? o.roughness : 0.84,
      metalness: 0,
      side: o.side || THREE.FrontSide
    });
  }

  /* ===================== 程序化贴图（canvas，无外部图片） ===================== */
  function stoneTexture(THREE) {
    if (typeof document === 'undefined') return null;
    var c = document.createElement('canvas'); c.width = c.height = 256;
    var g = c.getContext('2d');
    g.fillStyle = '#8a857c'; g.fillRect(0, 0, 256, 256);
    /* 石砌水平缝 + 竖向错缝，把台基读成「砌」而不是「抹」 */
    g.strokeStyle = 'rgba(40,38,34,.4)'; g.lineWidth = 2;
    for (var yy = 0; yy < 256; yy += 32) {
      g.beginPath(); g.moveTo(0, yy); g.lineTo(256, yy); g.stroke();
      for (var xx = ((yy / 32) % 2) * 32; xx < 256; xx += 64) {
        g.beginPath(); g.moveTo(xx, yy); g.lineTo(xx, yy + 32); g.stroke();
      }
    }
    var i;
    for (i = 0; i < 26; i++) {
      var x = Math.random() * 256, y = Math.random() * 256, r = 14 + Math.random() * 40;
      var dark = Math.random() < 0.5;
      var grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, dark ? 'rgba(52,49,44,.28)' : 'rgba(198,192,180,.18)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    for (i = 0; i < 5000; i++) {
      var v = Math.random(), a = 0.05 + Math.random() * 0.13;
      g.fillStyle = v < 0.5 ? 'rgba(36,33,29,' + a + ')' : 'rgba(216,210,198,' + (a * 0.75) + ')';
      g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random(), 1 + Math.random());
    }
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2, 1.4);
    t.anisotropy = 4;
    return srgb(THREE, t);
  }

  function woodTexture(THREE) {
    if (typeof document === 'undefined') return null;
    var c = document.createElement('canvas'); c.width = c.height = 256;
    var g = c.getContext('2d');
    g.fillStyle = '#e2d6c2'; g.fillRect(0, 0, 256, 256);
    for (var i = 0; i < 52; i++) {
      var y = Math.random() * 256, a = 0.04 + Math.random() * 0.11;
      g.strokeStyle = 'rgba(88,60,36,' + a + ')';
      g.lineWidth = 0.6 + Math.random() * 1.4;
      g.beginPath();
      for (var x = 0; x <= 256; x += 16) {
        var yy = y + Math.sin(x / 256 * Math.PI * 2 + i) * 1.7 + (Math.random() - 0.5) * 0.9;
        if (x === 0) g.moveTo(x, yy); else g.lineTo(x, yy);
      }
      g.stroke();
    }
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return srgb(THREE, t);
  }

  function tileTexture(THREE) {
    if (typeof document === 'undefined') return null;
    var c = document.createElement('canvas'); c.width = c.height = 256;
    var g = c.getContext('2d');
    g.fillStyle = '#b9c4ca'; g.fillRect(0, 0, 256, 256);
    for (var y = 0; y < 256; y += 16) {
      g.fillStyle = 'rgba(52,66,76,.44)'; g.fillRect(0, y, 256, 2);
      g.fillStyle = 'rgba(255,255,255,.10)'; g.fillRect(0, y + 2, 256, 1);
    }
    for (var x = 0; x < 256; x += 32) {
      g.fillStyle = 'rgba(52,66,76,.20)'; g.fillRect(x, 0, 1, 256);
      g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(x + 1, 0, 1, 256);
    }
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3, 1.6);
    t.anisotropy = 4;
    return srgb(THREE, t);
  }

  function latticeTexture(THREE) {
    if (typeof document === 'undefined') return null;
    var c = document.createElement('canvas'); c.width = c.height = 128;
    var g = c.getContext('2d');
    g.fillStyle = '#241a12'; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#c09a6a'; g.lineWidth = 4;
    g.strokeRect(3, 3, 122, 122);
    var i;
    for (i = 14; i < 128; i += 14) {
      g.fillStyle = '#b08a5c';
      g.fillRect(i, 8, 3, 112);
    }
    for (i = 42; i < 128; i += 42) {
      g.fillStyle = 'rgba(190,152,104,.92)';
      g.fillRect(8, i, 112, 3);
    }
    var t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    return srgb(THREE, t);
  }

  function makeMaterials(THREE, opts) {
    var texOn = opts.textures !== false;
    var stoneTex = texOn ? stoneTexture(THREE) : null;
    var woodTex = texOn ? woodTexture(THREE) : null;
    var tileTex = texOn ? tileTexture(THREE) : null;
    var latticeTex = texOn ? latticeTexture(THREE) : null;

    var stone = std(THREE, opts.stoneColor !== undefined ? opts.stoneColor : 0x59544a, { roughness: 0.95 });
    if (stoneTex) { stone.map = stoneTex; stone.bumpMap = stoneTex; stone.bumpScale = 0.02; }

    var timber = std(THREE, opts.woodColor !== undefined ? opts.woodColor : 0x4a3222, { roughness: 0.86 });
    if (woodTex) { timber.map = woodTex; timber.bumpMap = woodTex; timber.bumpScale = 0.014; }

    var timberDark = std(THREE, opts.woodDarkColor !== undefined ? opts.woodDarkColor : 0x332215, { roughness: 0.90 });
    if (woodTex) { timberDark.map = woodTex; timberDark.bumpMap = woodTex; timberDark.bumpScale = 0.014; }

    var timberLight = std(THREE, opts.woodLightColor !== undefined ? opts.woodLightColor : 0x6a4a2f, { roughness: 0.84 });
    if (woodTex) { timberLight.map = woodTex; timberLight.bumpMap = woodTex; timberLight.bumpScale = 0.012; }

    var tile = std(THREE, opts.tileColor !== undefined ? opts.tileColor : 0x66737c, { roughness: 0.92, side: THREE.DoubleSide });
    if (tileTex) { tile.map = tileTex; tile.bumpMap = tileTex; tile.bumpScale = 0.02; }

    var tileDark = std(THREE, opts.tileDarkColor !== undefined ? opts.tileDarkColor : 0x515c64, { roughness: 0.92 });
    if (tileTex) { tileDark.map = tileTex; tileDark.bumpMap = tileTex; tileDark.bumpScale = 0.02; }

    var windowMat = std(THREE, 0x2a1d12, { roughness: 0.72 });
    if (latticeTex) { windowMat.map = latticeTex; }
    windowMat.emissive = lin(THREE, 0x241408);
    windowMat.emissiveIntensity = 0.7;

    return {
      stone: stone, timber: timber, timberDark: timberDark, timberLight: timberLight,
      tile: tile, tileDark: tileDark, window: windowMat,
      maps: [stoneTex, woodTex, tileTex, latticeTex]
    };
  }

  /* ===================== 几何小工具 ===================== */
  function box(THREE, x0, x1, y0, y1, z0, z1, material) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), material);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return setShadows(m);
  }

  function beam(THREE, p1, p2, sx, sy, material) {
    var dir = new THREE.Vector3().subVectors(p2, p1);
    var len = dir.length() || 1e-4;
    var m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, len), material);
    m.position.copy(p1).add(p2).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize());
    return setShadows(m);
  }

  /* XY 贴片（法线朝 ±z） */
  function planeZ(THREE, z, x0, x1, y0, y1, material, faceNeg) {
    var m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), material);
    if (faceNeg) m.rotation.y = Math.PI;
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, z);
    return setShadows(m, false);
  }

  /* 一片瓦坡：脊在 z=0（局部），向 sign 方向下落到檐口；檐口起翘 */
  function roofSlope(THREE, material, sign) {
    var cols = 8, rows = 8, i, j;
    var pos = [], uv = [], idx = [];
    for (i = 0; i <= cols; i++) {
      var x = -ROOF_HALF_X + 2 * ROOF_HALF_X * i / cols;
      var ex = Math.pow(Math.max(0, Math.abs(x) / ROOF_HALF_X - 0.80) / 0.20, 2);
      for (j = 0; j <= rows; j++) {
        var t = j / rows;
        var z = sign * ROOF_HALF_Z * t;
        var lift = 0.10 * Math.pow(Math.max(0, t - 0.82) / 0.18, 2);
        var corner = 0.34 * ex * Math.pow(t, 2.2);
        var y = RIDGE_Y - (RIDGE_Y - EAVE_Y) * Math.pow(t, 0.85) + lift + corner;
        pos.push(x, y, z);
        uv.push(i / cols, t);
      }
    }
    for (i = 0; i < cols; i++) {
      for (j = 0; j < rows; j++) {
        var a = i * (rows + 1) + j, b = a + 1, c = a + rows + 1, d = c + 1;
        if (sign > 0) { idx.push(a, c, b, b, c, d); }
        else { idx.push(a, b, c, b, d, c); }
      }
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return setShadows(new THREE.Mesh(geo, material));
  }

  /* 山墙三角（带厚度，xy 平面挤出 z） */
  function gablePanel(THREE, material, z) {
    var half = ROOF_HALF_X - 0.30;
    var shape = new THREE.Shape();
    shape.moveTo(-half, WALL_TOP);
    shape.lineTo(half, WALL_TOP);
    shape.lineTo(0, RIDGE_Y - 0.04);
    shape.lineTo(-half, WALL_TOP);
    var geo = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false, curveSegments: 1 });
    var m = new THREE.Mesh(geo, material);
    m.position.set(0, 0, z);
    return setShadows(m);
  }

  /* ===================== 构建 ===================== */
  /* opts.corner: 'SE'|'SW'|'NE'|'NW'（只影响命名与兜底镜像，落位/镜像由调用方做）
     opts.baseDepth: 石台基向下的深度（东岸 2.75 / 西岸 4.35） */
  function build(THREE, opts) {
    if (!THREE) throw new Error('BridgeHead.build: 需要 THREE');
    opts = opts || {};
    var baseDepth = opts.baseDepth !== undefined ? opts.baseDepth : 2.75;
    var corner = opts.corner || 'SE';

    var mats = makeMaterials(THREE, opts);
    var root = new THREE.Group();
    root.name = 'bridgehead-' + corner.toLowerCase();
    var parts = [];

    function add(mesh, label, noCast) {
      mesh.userData.bridgeheadLabel = label;
      if (noCast) mesh.castShadow = false;
      root.add(mesh);
      parts.push(mesh);
      return mesh;
    }
    function B(x0, x1, y0, y1, z0, z1, material, label) {
      return add(box(THREE, x0, x1, y0, y1, z0, z1, material), label);
    }

    /* ---------- 1. 石台基（从台地顶砌到一层地面） ---------- */
    B(-3.30, 3.30, -baseDepth, 0, -2.35, 2.35, mats.stone, 'plinth');
    B(-3.34, 3.34, -0.07, 0.01, -2.39, 2.39, mats.stone, 'plinth-cap');

    /* ---------- 2. 一层：地面 + 柱 + 墙 ---------- */
    B(BODY.x0, BODY.x1, FLOOR_Y, FLOOR_Y + 0.08, BODY.z0, BODY.z1, mats.timber, 'ground-deck');

    var postX = [-2.85, 0, 2.85], postZ = [-1.95, 0, 1.95], pi, pj;
    for (pi = 0; pi < postX.length; pi++) {
      for (pj = 0; pj < postZ.length; pj++) {
        B(postX[pi] - 0.09, postX[pi] + 0.09, FLOOR_Y + 0.08, GF_TOP,
          postZ[pj] - 0.09, postZ[pj] + 0.09, mats.timberLight, 'ground-post-' + pi + '-' + pj);
      }
    }
    /* 一层：后墙 + 两山封板，前檐敞开 */
    B(BODY.x0 + 0.04, BODY.x1 - 0.04, FLOOR_Y + 0.08, GF_TOP, BODY.z1 - 0.10, BODY.z1, mats.timberDark, 'ground-back-wall');
    B(BODY.x0, BODY.x0 + 0.10, FLOOR_Y + 0.08, GF_TOP, BODY.z0, BODY.z1, mats.timberDark, 'ground-side-w');
    B(BODY.x1 - 0.10, BODY.x1, FLOOR_Y + 0.08, GF_TOP, BODY.z0, BODY.z1, mats.timberDark, 'ground-side-e');

    /* 柱头额枋（四周） */
    B(-3.02, 3.02, GF_TOP - 0.16, GF_TOP, BODY.z0, BODY.z0 + 0.12, mats.timberDark, 'head-front');
    B(-3.02, 3.02, GF_TOP - 0.16, GF_TOP, BODY.z1 - 0.12, BODY.z1, mats.timberDark, 'head-back');
    B(BODY.x0, BODY.x0 + 0.12, GF_TOP - 0.16, GF_TOP, BODY.z0, BODY.z1, mats.timberDark, 'head-w');
    B(BODY.x1 - 0.12, BODY.x1, GF_TOP - 0.16, GF_TOP, BODY.z0, BODY.z1, mats.timberDark, 'head-e');

    /* ---------- 3. 二层楼板 ---------- */
    [-1.5, 0, 1.5].forEach(function (z, i) {
      B(-3.06, 3.06, GF_TOP - 0.12, GF_TOP, z - 0.07, z + 0.07, mats.timberDark, 'floor-joist-' + i);
    });
    B(-3.14, 3.14, GF_TOP, SLAB_TOP, -2.28, 2.28, mats.timber, 'upper-floor-slab');

    /* ---------- 4. 二层墙身 ---------- */
    /* 后墙 + 两山实墙 */
    B(-3.02, 3.02, SLAB_TOP, WALL_TOP, BODY.z1 - 0.10, BODY.z1, mats.timber, 'upper-back-wall');
    B(BODY.x0 + 0.02, BODY.x0 + 0.12, SLAB_TOP, WALL_TOP, BODY.z0, BODY.z1, mats.timber, 'upper-side-w');
    B(BODY.x1 - 0.12, BODY.x1 - 0.02, SLAB_TOP, WALL_TOP, BODY.z0, BODY.z1, mats.timber, 'upper-side-e');

    /* 前檐：窗下槛墙 / 窗上枋 / 窗间柱 */
    B(-3.02, 3.02, SLAB_TOP, 3.60, BODY.z0, BODY.z0 + 0.10, mats.timber, 'upper-front-sill');
    B(-3.02, 3.02, 4.50, WALL_TOP, BODY.z0, BODY.z0 + 0.10, mats.timber, 'upper-front-head');
    var mullX = [-3.02, -1.06, 1.06, 3.02], mi;
    for (mi = 0; mi < mullX.length - 1 + 1; mi++) {
      var mx = mullX[mi];
      var w = (mi === 0 || mi === mullX.length - 1) ? 0.10 : 0.14;
      B(mx - w / 2, mx + w / 2, 3.60, 4.50, BODY.z0, BODY.z0 + 0.10, mats.timber,
        'upper-front-mullion-' + mi);
    }

    /* 前檐格扇窗（三樘） */
    var winX = [-2.02, 0, 2.02], wi;
    for (wi = 0; wi < winX.length; wi++) {
      add(planeZ(THREE, BODY.z0 + 0.045, winX[wi] - 0.86, winX[wi] + 0.86, 3.62, 4.48, mats.window, false),
        'lattice-window-' + (wi + 1));
    }

    /* 两山格扇窗（各两樘） */
    var swX = [-1.9, 1.9], swi;
    for (swi = 0; swi < swX.length; swi++) {
      add(planeZ(THREE, BODY.z0 + 0.005, swX[swi] - 0.55, swX[swi] + 0.55, 3.30, 4.50, mats.window, true),
        'side-window-w-' + (swi + 1));
      add(planeZ(THREE, BODY.z1 - 0.005, swX[swi] - 0.55, swX[swi] + 0.55, 3.30, 4.50, mats.window, false),
        'side-window-e-' + (swi + 1));
    }

    /* 四角柱 */
    [[-3.10, -2.94], [2.94, 3.10]].forEach(function (cx, ci) {
      [[-2.26, -2.10], [2.10, 2.26]].forEach(function (cz, cj) {
        B(cx[0], cx[1], SLAB_TOP, WALL_TOP + 0.46, cz[0], cz[1], mats.timberDark,
          'corner-post-' + ci + '-' + cj);
      });
    });

    /* 上下枋（压住窗框） */
    B(-3.06, 3.06, SLAB_TOP + 0.06, SLAB_TOP + 0.16, BODY.z0 - 0.02, BODY.z0 + 0.12, mats.timberDark, 'trim-low');
    B(-3.06, 3.06, WALL_TOP - 0.06, WALL_TOP + 0.04, BODY.z0 - 0.02, BODY.z0 + 0.12, mats.timberDark, 'trim-high');

    /* ---------- 5. 山墙 ---------- */
    add(gablePanel(THREE, mats.timber, -2.24), 'gable-n');
    add(gablePanel(THREE, mats.timber, 2.16), 'gable-s');
    add(planeZ(THREE, -2.245, -0.42, 0.42, 5.10, 5.90, mats.window, true), 'gable-lattice-n');
    add(planeZ(THREE, 2.165, -0.42, 0.42, 5.10, 5.90, mats.window, false), 'gable-lattice-s');

    /* ---------- 6. 瓦顶 ---------- */
    B(-3.10, 3.10, WALL_TOP, WALL_TOP + 0.10, -2.92, 2.92, mats.timberDark, 'wall-plate');   // 檐口垫板

    /* 檐下斜撑 */
    var ebX = [-2.4, -0.8, 0.8, 2.4], ei;
    for (ei = 0; ei < ebX.length; ei++) {
      add(beam(THREE,
        new THREE.Vector3(ebX[ei], WALL_TOP - 0.06, -2.10),
        new THREE.Vector3(ebX[ei], EAVE_Y + 0.04, -2.62),
        0.08, 0.10, mats.timberDark), 'eave-bracket-' + (ei + 1));
    }

    /* 两坡瓦面（自下而上最后出现） */
    var roofN = roofSlope(THREE, mats.tile, -1);
    roofN.userData.revealY = RIDGE_CAP + 0.10;
    add(roofN, 'roof-north');
    var roofS = roofSlope(THREE, mats.tile, 1);
    roofS.userData.revealY = RIDGE_CAP + 0.11;
    add(roofS, 'roof-south');

    /* 搏风板：沿两坡屋面边缘收口 */
    var edgeT = [0, 0.25, 0.5, 0.75, 1], si, xx, ej, t;
    var exEdge = Math.pow(Math.max(0, (ROOF_HALF_X - 0.04) / ROOF_HALF_X - 0.80) / 0.20, 2);
    for (si = -1; si <= 1; si += 2) {
      for (xx = -1; xx <= 1; xx += 2) {
        var prevPt = null;
        for (ej = 0; ej < edgeT.length; ej++) {
          t = edgeT[ej];
          var ex = xx * ROOF_HALF_X * t;
          var ez = si * ROOF_HALF_Z * t;
          var ey = RIDGE_Y - (RIDGE_Y - EAVE_Y) * Math.pow(t, 0.85)
            + 0.10 * Math.pow(Math.max(0, t - 0.82) / 0.18, 2)
            + 0.34 * exEdge * Math.pow(t, 2.2) - 0.05;
          var pt = new THREE.Vector3(ex, ey, ez);
          if (prevPt) {
            var bb = add(beam(THREE, prevPt, pt, 0.07, 0.14, mats.tileDark),
              'bargeboard-' + (xx > 0 ? 'e' : 'w') + (si > 0 ? 's' : 'n') + '-' + ej);
            bb.userData.revealY = RIDGE_CAP + 0.09;
          }
          prevPt = pt;
        }
      }
    }

    /* 正脊 */
    var ridge = B(-0.14, 0.14, RIDGE_Y, RIDGE_CAP, -ROOF_HALF_Z - 0.24, ROOF_HALF_Z + 0.24,
      mats.tileDark, 'ridge-cap');
    ridge.userData.revealY = RIDGE_CAP + 0.12;

    /* 檩条：两坡各两道 */
    var tPurlin = [0.42, 0.78], ti;
    for (ti = 0; ti < tPurlin.length; ti++) {
      t = tPurlin[ti];
      var pz = ROOF_HALF_Z * t;
      var py = RIDGE_Y - (RIDGE_Y - EAVE_Y) * Math.pow(t, 0.85) - 0.18;
      B(-3.34, 3.34, py, py + 0.12, pz - 0.06, pz + 0.06, mats.timberDark, 'purlin-s-' + (ti + 1));
      B(-3.34, 3.34, py, py + 0.12, -pz - 0.06, -pz + 0.06, mats.timberDark, 'purlin-n-' + (ti + 1));
    }

    /* ---------- 7. parts 按高度排序（自下而上） ---------- */
    root.updateMatrixWorld(true);
    var tmpBox = new THREE.Box3(), sorted = [], k;
    for (k = 0; k < parts.length; k++) {
      tmpBox.setFromObject(parts[k]);
      sorted.push({
        mesh: parts[k],
        y: parts[k].userData.revealY !== undefined ? parts[k].userData.revealY : tmpBox.min.y,
        label: parts[k].userData.bridgeheadLabel || ''
      });
    }
    sorted.sort(function (a, b) {
      if (a.y !== b.y) return a.y - b.y;
      return a.label < b.label ? -1 : (a.label > b.label ? 1 : 0);
    });
    parts.length = 0;
    for (k = 0; k < sorted.length; k++) {
      parts.push(sorted[k].mesh);
      parts[k].userData.bridgeheadPart = k;
    }

    if (opts.parent) opts.parent.add(root);

    /* ---------- 8. 显形 / 释放 ---------- */
    var disposed = false;
    if (opts.hidden) for (k = 0; k < parts.length; k++) parts[k].visible = false;

    function reveal() {
      for (var i = 0; i < parts.length; i++) parts[i].visible = true;
    }
    function revealStep(i) {
      for (var j = 0; j < parts.length; j++) parts[j].visible = (j <= i);
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
      coords: {
        floorY: FLOOR_Y, baseDepth: baseDepth,
        groundTop: GF_TOP, slabTop: SLAB_TOP, wallTop: WALL_TOP,
        eaveY: EAVE_Y, ridgeY: RIDGE_Y, ridgeCap: RIDGE_CAP,
        footprint: { x0: -3.34, x1: 3.34, z0: -2.39, z1: 2.39 }
      },
      config: {
        corner: corner,
        footprint: { w: 6.68, d: 4.78 },
        totalHeight: RIDGE_CAP,
        stories: 2
      },
      stats: { meshes: parts.length, triangles: tris },
      reveal: reveal,
      revealStep: revealStep,
      dispose: function () {
        if (disposed) return;
        disposed = true;
        if (root.parent) root.parent.remove(root);
        var geos = [], ms = [], maps = [], i, m, map;
        root.traverse(function (o) {
          if (o.isMesh) {
            if (o.geometry && geos.indexOf(o.geometry) < 0) geos.push(o.geometry);
            m = o.material;
            if (m && ms.indexOf(m) < 0) ms.push(m);
          }
        });
        for (i = 0; i < geos.length; i++) geos[i].dispose();
        for (i = 0; i < ms.length; i++) {
          m = ms[i];
          if (m.map && maps.indexOf(m.map) < 0) maps.push(m.map);
          if (m.bumpMap && maps.indexOf(m.bumpMap) < 0) maps.push(m.bumpMap);
          m.dispose();
        }
        for (i = 0; i < maps.length; i++) { map = maps[i]; if (map && map.dispose) map.dispose(); }
        parts.length = 0;
      }
    };
  }

  var API = {
    version: VERSION,
    build: build,
    /* 四幢落位：world x = ±20.5, z = ±5.15, 地面 5.35（= 桥面端部 5.22 + 台基压顶） */
    corners: [
      { corner: 'SE', x: 20.5, z: -5.15, flipZ: false, baseDepth: 2.75 },
      { corner: 'SW', x: -20.5, z: -5.15, flipZ: false, baseDepth: 4.35 },
      { corner: 'NE', x: 20.5, z: 5.15, flipZ: true, baseDepth: 2.75 },
      { corner: 'NW', x: -20.5, z: 5.15, flipZ: true, baseDepth: 4.35 }
    ],
    floorY: 5.35
  };

  global.BridgeHead = API;
  if (typeof module !== 'undefined' && module.exports) module.exports.BridgeHead = API;

})(typeof window !== 'undefined' ? window : this);
