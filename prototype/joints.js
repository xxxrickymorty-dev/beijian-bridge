/*!
 * 编梁 · 北涧桥 — 榫卯节点层 (mortise & tenon close-up detail)
 *
 * 目的：把「榫头 / 卯口 / 木销 / 方套」这四件事在近景里画清楚。
 * 只做几何，不建场景、不碰 DOM、不加灯、不改别人：每个函数收 THREE，
 * 返回一个 THREE.Object3D，由调用方自己 add 到 group 里。
 *
 * ★ 全部为示意几何（schematic），不是测绘、不是真实榫卯的尺寸复原。
 *   低多边形、无布尔运算：所谓「凹进去的卯口」是用一圈凸起的方环
 *   + 一块略高于表面的暗色板示意出来的，不是真的挖了个洞。
 *
 * 坐标沿用 index.html：
 *   半跨 X=14.2、起拱点 Y0=0.9、三节苗 z=+0.17、五节苗 z=-0.17、
 *   苗（圆木）直径 0.34（beam2D 的 w=0.34）、7 排 RIBS。
 *   三节苗 SAN = [[-14.2,.9],[-4.8,6],[4.8,6],[14.2,.9]]
 *   五节苗 WU  = [[-14.2,.9],[-9,4.9],[-4.3,5.55],[4.3,5.55],[9,4.9],[14.2,.9]]
 *   三节苗 × 五节苗 的别压交叉在 x=±6.08, y≈5.30（buildTies 的横串位置）。
 *
 * 返回对象的坐标约定（重要）：
 *   tenon / mortise / peg      —— 返回的 group 已摆在传入的世界坐标上，直接 add
 *   node / crossing            —— 返回的 group 在原点，子对象是世界坐标，直接 add
 *   headMortises               —— 返回的 group 在原点，子对象是「牛头局部坐标」，
 *                                 用法：headMesh.add(BridgeJoints.headMortises(THREE, headMesh))
 *
 * 每个函数 ≤ 15 个 mesh（边线是 LineSegments，不算 mesh）：
 *   tenon 2 / mortise 2 / peg 3 / node 12 / crossing 10 / headMortises 9（3 排）
 *   ——只有 headMortises 传 opts.rows = 7 排时会到 21。
 * 所有 mesh 都 castShadow / receiveShadow。
 *
 * 用法：
 *   var J = window.BridgeJoints;
 *   bridge.add(J.node(THREE, J.nodeList('san')[0]));
 *   bridge.add(J.crossing(THREE, -6.08, 5.30, 0));
 *   headMesh.add(J.headMortises(THREE, headMesh));
 *
 * 依赖：vendor/three.min.js（r128）。无构建。
 */
(function (global) {
  'use strict';

  /* ============================================================ 常量 */

  var COORDS = {
    bridgeHalfSpan: 14.2,
    springingY: 0.9,
    sanZ: 0.17,
    wuZ: -0.17,
    memberDiameter: 0.34,          // beam2D(a,b,z,h,w) 里 w=0.34 → 圆木直径
    headTopY: 0.65,                // 牛头 block 是 2.0×1.3×6.8，局部顶面在 +0.65
    headWidth: 2.0,
    headDepth: 6.8,
    ribs: [-2.4, -1.6, -0.8, 0, 0.8, 1.6, 2.4],   // 7 排
    headSlotZ: [-2.4, 0, 2.4],                     // 默认 3 个卯口 = RIBS[0],RIBS[3],RIBS[6]
    crossingX: 6.08,
    crossingY: 5.30,
    sanAngle: Math.atan2(5.1, 9.4),                // ≈ 28.46°，三节苗在交叉点处的倾角
    wuAngle: Math.atan2(0.65, 4.7),                // ≈ 7.87°，五节苗在交叉点处的倾角
    SAN: [[-14.2, 0.9], [-4.8, 6.0], [4.8, 6.0], [14.2, 0.9]],
    WU: [[-14.2, 0.9], [-9.0, 4.9], [-4.3, 5.55], [4.3, 5.55], [9.0, 4.9], [14.2, 0.9]]
  };

  /* 默认「老木」暗色。要跟桥体同色就传 opts.material 覆盖。 */
  var PALETTE = {
    tenon: 0x6a4f30,        // 榫头（削细的方榫）
    shoulder: 0x54402a,     // 榫肩（圆木被削方的那一段）
    mortiseRim: 0x3b2d1d,   // 卯口木框
    slot: 0x140e08,         // 卯口槽底（近黑）
    peg: 0x2f2419,          // 木销
    collar: 0x32281f,       // 节点夹板 / 卯座（与 index.html 的 MAT_JOINT 一致）
    tie: 0x2e251d,          // 横串（与 MAT_HEAD 一致）
    notch: 0x4a3826         // 别压半榫的两块带缺口木
  };

  /* ============================================================ 材质 */

  var matCache = {};

  /* 默认材质按 (色, 粗糙度) 共享，避免 7 排 × 3 卯口造出几十个材质 */
  function aged(THREE, hex, rough) {
    var key = hex + '|' + rough;
    var hit = matCache[key];
    if (hit && hit.three === THREE) return hit.mat;
    var m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(hex).convertSRGBToLinear(),
      roughness: rough === undefined ? 0.86 : rough,
      metalness: 0
    });
    matCache[key] = { three: THREE, mat: m };
    return m;
  }

  /* ============================================================ 小工具 */

  function boxMesh(THREE, material, sx, sy, sz) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  function cylMesh(THREE, material, r, len, seg) {
    var m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg || 8), material);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  /* 描边：近景里木块的转折全靠它读出来（LineSegments，不是 mesh） */
  function addEdges(THREE, mesh, opacity) {
    var e = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry),
      new THREE.LineBasicMaterial({
        color: 0x1a1209,
        transparent: true,
        opacity: opacity === undefined ? 0.45 : opacity
      })
    );
    e.castShadow = false;
    e.receiveShadow = false;
    mesh.add(e);
    return e;
  }

  /* 圆柱默认沿 y；转成沿 x / z */
  function orientCylinder(mesh, axis) {
    if (axis === 'x') mesh.rotation.z = Math.PI / 2;
    else if (axis === 'z') mesh.rotation.x = Math.PI / 2;
  }

  /* group 的局部 +z 对齐到给定轴（卯口的开口方向） */
  function orientGroupToAxis(group, axis) {
    if (axis === 'x') group.rotation.y = Math.PI / 2;        // 局部 +z → 世界 +x
    else if (axis === 'y') group.rotation.x = -Math.PI / 2;  // 局部 +z → 世界 +y
    /* axis 'z'：不转 */
  }

  /* 方环：外框 (w+2t)×(h+2t)，内孔 w×h，沿局部 +z 挤出 depth。1 个 mesh。 */
  function squareRingGeometry(THREE, w, h, t, depth) {
    var ow = w + 2 * t, oh = h + 2 * t;
    var shape = new THREE.Shape();
    shape.moveTo(-ow / 2, -oh / 2);
    shape.lineTo(ow / 2, -oh / 2);
    shape.lineTo(ow / 2, oh / 2);
    shape.lineTo(-ow / 2, oh / 2);
    shape.closePath();
    var hole = new THREE.Path();
    hole.moveTo(-w / 2, -h / 2);
    hole.lineTo(-w / 2, h / 2);
    hole.lineTo(w / 2, h / 2);
    hole.lineTo(w / 2, -h / 2);
    hole.closePath();
    shape.holes.push(hole);
    return new THREE.ExtrudeGeometry(shape, {
      depth: depth,
      bevelEnabled: false,
      steps: 1,
      curveSegments: 1
    });
  }

  /* ============================================================ 榫头 */

  /**
   * 榫头 (tenon)
   *
   * 真实对应：编梁拱「苗」端部被削细的方榫（直榫），配木销孔。
   *   一根圆木要跟另一根接上，端头先削成方断面，再收成更小的方榫；
   *   圆木变方的那一圈台阶就是「榫肩」。
   *   这里的木销孔不画（由 peg() 单独加），榫肩用一圈比方木略大的方箍示意。
   *
   * 几何为示意：不是按真实榫卯比例复原，方箍/榫头尺寸都是给近景看轮廓用的。
   *
   * @param THREE
   * @param a  [x,y] 构件一端
   * @param b  [x,y] 构件另一端（a→b 只用来定轴向）
   * @param z  构件所在 z
   * @param opts {
   *   size:{w,h,len}  榫头 宽(z)/高(局部y)/伸出长  默认 {0.16, 0.12, 0.30}
   *   material        榫头材质，默认暗色老木
   *   shoulderMaterial 榫肩材质
   *   memberR         圆木半径，默认 0.17（直径 0.34）
   *   end             'a'（默认）或 'b'：榫头长在哪一端
   *   collar          是否画榫肩方箍，默认 true
   *   edges           是否描边，默认 true
   * }
   * @returns THREE.Group（已摆到 a/b 端的世界坐标上）
   */
  function tenon(THREE, a, b, z, opts) {
    opts = opts || {};
    var size = opts.size || {};
    var tw = size.w === undefined ? 0.16 : size.w;
    var th = size.h === undefined ? 0.12 : size.h;
    var tl = size.len === undefined ? 0.30 : size.len;
    var R = opts.memberR === undefined ? COORDS.memberDiameter / 2 : opts.memberR;
    var material = opts.material || aged(THREE, PALETTE.tenon, 0.84);
    var shoulderMaterial = opts.shoulderMaterial || opts.material || aged(THREE, PALETTE.shoulder, 0.86);
    var atB = opts.end === 'b';
    var end = atB ? b : a;
    var other = atB ? a : b;

    var dx = end[0] - other[0], dy = end[1] - other[1];
    var len = Math.hypot(dx, dy) || 1;

    var g = new THREE.Group();
    g.position.set(end[0], end[1], z);
    g.rotation.z = Math.atan2(dy, dx);   // 局部 +x = 构件轴向（朝外）

    /* 榫肩：圆木削方的那一段。比方木略大一点，四角露出来才看得见。 */
    if (opts.collar !== false) {
      var collar = boxMesh(THREE, shoulderMaterial, 0.07, 2 * R + 0.03, 2 * R + 0.03);
      collar.position.x = -0.025;
      if (opts.edges !== false) addEdges(THREE, collar, 0.5);
      g.add(collar);
    }

    /* 榫头：收细的方榫，沿构件轴向外伸 */
    var tongue = boxMesh(THREE, material, tl, th, tw);
    tongue.position.x = tl / 2;
    if (opts.edges !== false) addEdges(THREE, tongue, 0.5);
    g.add(tongue);

    g.userData.joint = 'tenon';
    g.userData.end = atB ? 'b' : 'a';
    g.userData.schematic = true;
    return g;
  }

  /* ============================================================ 卯口 */

  /**
   * 卯口 (mortise)
   *
   * 真实对应：构件上凿出来、等榫头插进来的方孔（牛头顶面的卯口、
   *   苗端被凿的卯眼、夹板上的穿榫槽）。
   *
   * 几何为示意（低多边形、不做布尔运算）：
   *   1) 一圈凸起的方环（木框，ExtrudeGeometry 挖孔）——读作「槽口有边」；
   *   2) 槽底是一块比表面高 0.035 的近黑板——读作「凹进去的黑洞」。
   *   两者叠起来，近景里就是一个带边的暗槽。真正的「凹」要 CSG，这里不做。
   *
   * @param THREE
   * @param x,y,z 槽口所在位置（槽口外沿的中心点）
   * @param opts {
   *   w,h      槽口内孔 宽 / 高         默认 0.19 / 0.15
   *   d        槽深（只影响暗板的厚薄） 默认 0.22
   *   axis     'x' | 'y' | 'z'：榫头插入方向，也就是开口朝向  默认 'y'（从上往下插）
   *   material 槽底材质（近黑）
   *   rimMaterial 木框材质
   *   rim      木框宽度，默认 0.035；rimH 木框凸起高度，默认 0.09
   *   frame    是否画木框，默认 true
   * }
   * @returns THREE.Group（已摆到 (x,y,z)）
   */
  function mortise(THREE, x, y, z, opts) {
    opts = opts || {};
    var axis = opts.axis || 'y';
    var w = opts.w === undefined ? 0.19 : opts.w;
    var h = opts.h === undefined ? 0.15 : opts.h;
    var d = opts.d === undefined ? 0.22 : opts.d;
    var rim = opts.rim === undefined ? 0.035 : opts.rim;
    var rimH = opts.rimH === undefined ? 0.09 : opts.rimH;
    var lift = opts.lift === undefined ? 0.035 : opts.lift;
    var material = opts.material || aged(THREE, PALETTE.slot, 0.95);
    var rimMaterial = opts.rimMaterial || opts.frameMaterial || aged(THREE, PALETTE.mortiseRim, 0.88);

    var g = new THREE.Group();
    g.position.set(x, y, z);
    orientGroupToAxis(g, axis);   // 局部 +z = 开口朝向

    /* 槽底暗板：略高于表面，露出 lift 这么厚的一层黑，读作洞 */
    var cavLen = d + 0.14;
    var cavity = boxMesh(THREE, material, w - 0.006, h - 0.006, cavLen);
    cavity.position.z = lift - cavLen / 2;
    g.add(cavity);

    /* 木框：一圈比方环，比槽底再高一点，框出槽口 */
    if (opts.frame !== false) {
      var ring = new THREE.Mesh(squareRingGeometry(THREE, w, h, rim, rimH), rimMaterial);
      ring.position.z = -0.02;
      ring.castShadow = true;
      ring.receiveShadow = true;
      g.add(ring);
    }

    g.userData.joint = 'mortise';
    g.userData.axis = axis;
    g.userData.schematic = true;
    return g;
  }

  /* ============================================================ 木销 */

  /**
   * 木销 (peg)
   *
   * 真实对应：编梁拱里穿榫而过的圆木销（「无钉无铆」的那根销）。
   *   榫头插进卯口之后，横向打一根销，把两个构件锁住，越压越紧。
   *
   * 几何为示意：销帽是两片薄圆片，只为在近景里交代「销是穿透的」。
   *
   * @param THREE
   * @param x,y,z 销中心
   * @param opts {
   *   r    半径，默认 0.075（与 index.html addHeadDetails 的销一致）
   *   len  长度，默认 0.5
   *   axis 'x' | 'y' | 'z'，默认 'z'（横穿桥面方向）
   *   material 材质
   *   heads 两端是否加销帽，默认 true
   * }
   * @returns THREE.Group（已摆到 (x,y,z)）
   */
  function peg(THREE, x, y, z, opts) {
    opts = opts || {};
    var axis = opts.axis || 'z';
    var r = opts.r === undefined ? 0.075 : opts.r;
    var len = opts.len === undefined ? 0.5 : opts.len;
    var material = opts.material || aged(THREE, PALETTE.peg, 0.9);

    var g = new THREE.Group();
    g.position.set(x, y, z);

    var shaft = cylMesh(THREE, material, r, len, 8);
    orientCylinder(shaft, axis);
    g.add(shaft);

    if (opts.heads !== false) {
      [-1, 1].forEach(function (s) {
        var cap = cylMesh(THREE, material, r * 1.55, 0.045, 8);
        orientCylinder(cap, axis);
        var off = s * (len / 2);
        if (axis === 'x') cap.position.x = off;
        else if (axis === 'y') cap.position.y = off;
        else cap.position.z = off;
        g.add(cap);
      });
    }

    g.userData.joint = 'peg';
    g.userData.axis = axis;
    g.userData.schematic = true;
    return g;
  }

  /* ============================================================ 节点装配 */

  function memberEndIndex(m, node) {
    var da = Math.hypot(m.a[0] - node.x, m.a[1] - node.y);
    var db = Math.hypot(m.b[0] - node.x, m.b[1] - node.y);
    return db <= da ? 'b' : 'a';
  }

  /* 构件在节点这一端，指向节点的单位方向 */
  function memberDirAt(m, end) {
    var near = end === 'b' ? m.b : m.a;
    var far = end === 'b' ? m.a : m.b;
    var dx = near[0] - far[0], dy = near[1] - far[1];
    var len = Math.hypot(dx, dy) || 1;
    return [dx / len, dy / len];
  }

  /**
   * 一个拱节点的装配 (arch node)
   *
   * 真实对应：编梁拱「短木接力」的接头——两根苗首尾相接，端头削方、
   *   出榫入卯，两侧夹板夹住，再横打一根木销锁死。三节苗的两个接头在
   *   x=±4.8, y=6.0；五节苗的四个接头在 x=±9.0/±4.3。
   *
   * 这里的四件事：
   *   1) 接头上一圈方套（卯座，沿两苗的平均方向摆）——这个节点的可见标记，
   *      对应 index.html 里 joint() 画的那个暗色圆箍，这里换成方的、带卯口的
   *   2) 每根进节点的苗，端头出一个方榫（tenon，自带榫肩方箍）
   *   3) 方套两侧外面各一个卯口（mortise，开口朝 ±z，从侧视也能看见）
   *   4) 一根木销（peg）沿 z 穿透方套
   *
   * 几何为示意：两根苗接近共线时（五节苗中节点几乎就是直的），榫头会有一段
   *   没进对面那根圆木里，近景主要靠方套 + 卯口 + 木销读出来。
   *   要彻底解决，得给圆木开槽（CSG），这里不做。
   *
   * @param THREE
   * @param node { x, y, z, system:'san'|'wu', members:[{a,b,system}, ...] }
   *             z 省略时按 system 取 0.17 / -0.17
   * @param opts {
   *   material, tenonMaterial, slotMaterial, pegMaterial
   *   memberR    圆木半径，默认 0.17
   *   tenonSize  传给 tenon 的 size
   *   sleeveSize {len, h, w} 方套 沿轴长/面内高/横向宽  默认 {0.26, 0.44, 0.44}
   *   slotW, slotH 方套上卯口的大小，默认 0.18 / 0.26
   *   tenonSize  传给 tenon 的 size，节点上默认 {w:.16, h:.12, len:.42}
   *               （比单根 tenon 的默认 0.30 长，榫头才露得出方套外面）
   *   slots      是否画卯口，默认 true
   * }
   * @returns THREE.Group（在原点，子对象是世界坐标）
   */
  function node(THREE, node, opts) {
    opts = opts || {};
    var nx = node.x, ny = node.y;
    var nz = node.z !== undefined ? node.z
      : (node.system === 'wu' ? COORDS.wuZ : COORDS.sanZ);
    var members = node.members || [];
    var R = opts.memberR === undefined ? COORDS.memberDiameter / 2 : opts.memberR;
    var tenonSize = opts.tenonSize || { w: 0.16, h: 0.12, len: 0.42 };

    var sleeveMaterial = opts.material || aged(THREE, PALETTE.collar, 0.88);
    var tenonMaterial = opts.tenonMaterial || opts.material || aged(THREE, PALETTE.tenon, 0.84);
    var shoulderMaterial = opts.shoulderMaterial || aged(THREE, PALETTE.shoulder, 0.86);
    var slotMaterial = opts.slotMaterial || aged(THREE, PALETTE.slot, 0.95);
    var pegMaterial = opts.pegMaterial || aged(THREE, PALETTE.peg, 0.9);

    var g = new THREE.Group();

    /* 两苗的平均方向：方套就沿它摆 */
    var sumX = 0, sumY = 0;
    var ends = members.map(function (m) {
      var e = memberEndIndex(m, node);
      var d = memberDirAt(m, e);
      sumX += d[0]; sumY += d[1];
      return e;
    });
    var avgAng = (sumX === 0 && sumY === 0) ? 0 : Math.atan2(sumY, sumX);

    /* 1) 方套（卯座） */
    var ss = opts.sleeveSize || {};
    var sLen = ss.len === undefined ? 0.26 : ss.len;
    var sH = ss.h === undefined ? 0.44 : ss.h;
    var sW = ss.w === undefined ? 0.44 : ss.w;
    var sleeve = boxMesh(THREE, sleeveMaterial, sLen, sH, sW);
    sleeve.position.set(nx, ny, nz);
    sleeve.rotation.z = avgAng;
    addEdges(THREE, sleeve, 0.4);
    g.add(sleeve);

    /* 3) 卯口：开在方套两侧外面 */
    if (opts.slots !== false) {
      [-1, 1].forEach(function (side) {
        var mg = mortise(THREE, nx, ny, nz + side * (sW / 2 + 0.001), {
          axis: 'z',
          w: opts.slotW === undefined ? 0.18 : opts.slotW,
          h: opts.slotH === undefined ? 0.26 : opts.slotH,
          d: 0.10,
          rim: 0.028,
          rimH: 0.075,
          material: slotMaterial
        });
        /* 先按 side 翻个面，再整体绕 z 跟方套一起倾斜 */
        var qFlip = new THREE.Quaternion();
        if (side < 0) qFlip.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
        var qTilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), avgAng);
        mg.quaternion.copy(qTilt).multiply(qFlip);
        g.add(mg);
      });
    }

    /* 2) 榫头（含榫肩） */
    members.forEach(function (m, i) {
      g.add(tenon(THREE, m.a, m.b, nz, {
        end: ends[i],
        size: tenonSize,
        material: tenonMaterial,
        shoulderMaterial: shoulderMaterial,
        memberR: R
      }));
    });

    /* 4) 木销：沿 z 穿透方套。销径比卯口窄一点，销帽才不会把卯口盖死 */
    g.add(peg(THREE, nx, ny, nz, {
      axis: 'z',
      r: opts.pegR === undefined ? 0.055 : opts.pegR,
      len: sW + 0.30,
      material: pegMaterial
    }));

    g.userData.joint = 'node';
    g.userData.system = node.system;
    g.userData.schematic = true;
    return g;
  }

  /* ============================================================ 别压 / 半榫 */

  /**
   * 别压（半榫 / 十字搭接）—— 三节苗 × 五节苗 的交叉点
   *
   * 真实对应：第一系统（三节苗）和第二系统（五节苗）在 x=±6.08, y≈5.30 处
   *   上下叠压，两套拱在这里互相「别」住。两套苗一上一下错开，各自在交叉处
   *   让掉半个断面，对方填进来——就是半榫（half-lap）。
   *
   * 画法（示意，不做布尔运算）：
   *   A（三节苗方向）在交叉段只留「下半」，B（五节苗方向）在交叉段只留「上半」，
   *   两块半高木在交叉处正好凑成整断面，缺口台阶看得见 = 咬住了。
   *   再加一根横串（沿 z 串住各排苗）和一根木销。
   *
   * 几何为示意：两根木在真实里夹角 ≈20.6°，这里的缺口是按各自轴向切的简化。
   *
   * @param THREE
   * @param x,y,z 交叉点（左岸用 -6.08, 5.30；右岸 +6.08, 5.30）
   * @param opts {
   *   sign     +1 / -1，决定两根木的倾斜方向；默认按 x 的正负推（x<0 → +1）
   *   angleA   三节苗倾角，默认 COORDS.sanAngle * sign
   *   angleB   五节苗倾角，默认 COORDS.wuAngle * sign
   *   h        木断面边长，默认 0.34（圆木直径）
   *   lenA,lenB 两根木在交叉点附近的总长，默认各 1.5
   *   notch    交叉段（缺口）长度，默认 0.56
   *   material 带缺口木的材质
   *   tieLength 横串长度，默认 5.0（与 index.html buildTies 一致）
   *   tieDrop  横串相对交叉点的高度偏移，默认 -0.13
   * }
   * @returns THREE.Group（在原点，子对象是世界坐标）
   */
  function crossing(THREE, x, y, z, opts) {
    opts = opts || {};
    var sign = opts.sign === undefined ? (x < 0 ? 1 : -1) : (opts.sign < 0 ? -1 : 1);
    var angA = opts.angleA === undefined ? COORDS.sanAngle * sign : opts.angleA;
    var angB = opts.angleB === undefined ? COORDS.wuAngle * sign : opts.angleB;
    var H = opts.h === undefined ? COORDS.memberDiameter : opts.h;
    var LA = opts.lenA === undefined ? 1.5 : opts.lenA;
    var LB = opts.lenB === undefined ? 1.5 : opts.lenB;
    var notch = opts.notch === undefined ? 0.56 : opts.notch;
    var material = opts.material || aged(THREE, PALETTE.notch, 0.86);
    var tieMaterial = opts.tieMaterial || opts.material || aged(THREE, PALETTE.tie, 0.9);
    var pegMaterial = opts.pegMaterial || aged(THREE, PALETTE.peg, 0.9);

    var g = new THREE.Group();

    /* 一根木 = 左段整断面 + 交叉段半断面 + 右段整断面；half = 'lower' | 'upper' */
    function lapBar(angle, total, half) {
      var sub = new THREE.Group();
      sub.position.set(x, y, z);
      sub.rotation.z = angle;
      var side = (total - notch) / 2;
      var off = (total + notch) / 4;
      [-1, 1].forEach(function (s) {
        var piece = boxMesh(THREE, material, side, H, H);
        piece.position.x = s * off;
        addEdges(THREE, piece, 0.42);
        sub.add(piece);
      });
      var mid = boxMesh(THREE, material, notch, H / 2, H);
      mid.position.y = half === 'lower' ? -H / 4 : H / 4;
      addEdges(THREE, mid, 0.5);
      sub.add(mid);
      return sub;
    }

    /* A = 三节苗，留下半；B = 五节苗，留上半 → 交叉处正好互填 */
    g.add(lapBar(angA, LA, 'lower'));
    g.add(lapBar(angB, LB, 'upper'));

    /* 横串：沿 z 串住各排苗（对应 buildTies 里 5.0 长的那根） */
    var tieLen = opts.tieLength === undefined ? 5.0 : opts.tieLength;
    var tieDrop = opts.tieDrop === undefined ? -0.13 : opts.tieDrop;
    var tie = boxMesh(THREE, tieMaterial, 0.2, 0.2, tieLen);
    tie.position.set(x, y + tieDrop, z);
    addEdges(THREE, tie, 0.35);
    g.add(tie);

    /* 木销：横穿半榫，把两块带缺口的木钉在一起 */
    g.add(peg(THREE, x, y, z, {
      axis: 'z',
      r: opts.pegR === undefined ? 0.075 : opts.pegR,
      len: H + 0.42,
      material: pegMaterial
    }));

    g.userData.joint = 'crossing';
    g.userData.schematic = true;
    return g;
  }

  /* ============================================================ 牛头卯口 */

  /**
   * 牛头上的卯口排 (head mortises)
   *
   * 真实对应：牛头（横向主梁）顶面按苗的排数凿出的一排卯口，
   *   各排苗端坐进卯口、再打木销锁住。index.html 的 addHeadDetails 现在
   *   画了 3 个浅槽 + 3 根销，这里把它升级成「卯口（带木框）+ 木销」。
   *
   * 位置：默认取 3 个排位 = RIBS[0], RIBS[3], RIBS[6]（-2.4 / 0 / 2.4），
   *   正好对上原来的 -2.3 / 0 / 2.3。要一排一个，传 opts.rows = COORDS.ribs。
   *
   * ★ 坐标是「牛头的局部坐标」，返回的 group 要 add 到 headMesh 上：
   *     headMesh.add(BridgeJoints.headMortises(THREE, headMesh));
   *   （index.html 里牛头没有旋转/缩放，所以局部 z 就是世界 z。）
   *
   * 几何为示意：槽深 0.20 是视觉深度，不是真实凿深。
   *
   * @param THREE
   * @param headMesh 牛头那块 block（只用来读默认尺寸，函数不修改它）
   * @param opts {
   *   rows      排位 z 数组，默认 COORDS.headSlotZ（3 个）
   *   y         牛头顶面局部高度，默认 0.65
   *   size      {w,h,d} 默认 {1.5, 0.34, 0.20}（宽沿 x，宽 1.5 与原型一致）
   *   material  槽底材质；frameMaterial 木框材质
   *   frame     是否画卯口木框，默认 true
   *   pegX,pegY,pegAxis,pegLen,pegR,pegHeads  木销参数
   *             （默认 pegX 0.34 / pegY 顶面+0.05 / axis 'x' / len 0.5 / r 0.075，
   *               与 index.html 现有的销一致；pegHeads 默认 false）
   * }
   * @returns THREE.Group（在原点，子对象是牛头局部坐标）→ headMesh.add(...)
   */
  function headMortises(THREE, headMesh, opts) {
    opts = opts || {};
    var rows = opts.rows || COORDS.headSlotZ;
    var topY = opts.y === undefined ? COORDS.headTopY : opts.y;
    var size = opts.size || {};
    var w = size.w === undefined ? 1.5 : size.w;
    var h = size.h === undefined ? COORDS.memberDiameter : size.h;
    var d = size.d === undefined ? 0.20 : size.d;
    var material = opts.material || aged(THREE, PALETTE.slot, 0.95);
    var frameMaterial = opts.frameMaterial || aged(THREE, PALETTE.mortiseRim, 0.88);
    var pegMaterial = opts.pegMaterial || aged(THREE, PALETTE.peg, 0.9);

    var g = new THREE.Group();

    rows.forEach(function (rz) {
      g.add(mortise(THREE, 0, topY, rz, {
        axis: 'y',                 // 苗从上方坐进卯口
        w: w, h: h, d: d,
        material: material,
        rimMaterial: frameMaterial,
        frame: opts.frame !== false
      }));
      g.add(peg(THREE, opts.pegX === undefined ? 0.34 : opts.pegX,
        opts.pegY === undefined ? topY + 0.05 : opts.pegY, rz, {
          axis: opts.pegAxis || 'x',
          r: opts.pegR === undefined ? 0.075 : opts.pegR,
          len: opts.pegLen === undefined ? 0.5 : opts.pegLen,
          material: pegMaterial,
          heads: opts.pegHeads === undefined ? false : opts.pegHeads
        }));
    });

    g.userData.joint = 'head-mortises';
    g.userData.rows = rows.slice();
    g.userData.schematic = true;
    return g;
  }

  /* ============================================================ 便利函数 */

  /**
   * 生成某套苗的「内节点」描述（端点不算，端点是桥台/牛头）。
   * 纯几何，不需要 THREE。直接喂给 node()：
   *   J.nodeList('san').forEach(function(n){ bridge.add(J.node(THREE, n)); });
   *
   * @param system 'san' | 'wu'
   * @returns [{ x, y, z, system, members:[{a,b,system}, ...] }]
   */
  function nodeList(system) {
    var pts = system === 'wu' ? COORDS.WU : COORDS.SAN;
    var z = system === 'wu' ? COORDS.wuZ : COORDS.sanZ;
    var out = [];
    for (var i = 1; i < pts.length - 1; i++) {
      var members = [];
      members.push({ a: pts[i - 1], b: pts[i], system: system });
      members.push({ a: pts[i], b: pts[i + 1], system: system });
      out.push({
        x: pts[i][0], y: pts[i][1], z: z,
        system: system, members: members
      });
    }
    return out;
  }

  /* ============================================================ 导出 */

  var BridgeJoints = {
    version: '0.1.0',
    coords: COORDS,
    palette: PALETTE,
    /* 共享的默认材质（改它 = 改所有默认节点） */
    materials: function (THREE) {
      return {
        tenon: aged(THREE, PALETTE.tenon, 0.84),
        shoulder: aged(THREE, PALETTE.shoulder, 0.86),
        mortiseRim: aged(THREE, PALETTE.mortiseRim, 0.88),
        slot: aged(THREE, PALETTE.slot, 0.95),
        peg: aged(THREE, PALETTE.peg, 0.9),
        collar: aged(THREE, PALETTE.collar, 0.88),
        tie: aged(THREE, PALETTE.tie, 0.9),
        notch: aged(THREE, PALETTE.notch, 0.86)
      };
    },
    tenon: tenon,
    mortise: mortise,
    peg: peg,
    node: node,
    crossing: crossing,
    headMortises: headMortises,
    nodeList: nodeList
  };

  global.BridgeJoints = BridgeJoints;
})(typeof window !== 'undefined' ? window : this);
