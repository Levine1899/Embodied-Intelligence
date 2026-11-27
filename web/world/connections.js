/* 工艺连接的可复用渲染层（Phase 3）
 *
 * 唯一数据源：web/data/process-connections.json
 * 端点坐标：一律取自 tower.manifest.json 的 anchors[].position（assetLocal）
 * 中间点：只取自 connection.waypoints（assetLocal）
 *
 * 坐标约定：本模块只在 assetLocal 里建几何，然后整体挂到调用方给的 assetRoot（unit）下，
 * 由 assetRoot 自己的 matrixWorld 完成 SCALE 等变换。关卡脚本不得再叠加任何未声明的偏移；
 * 需要偏移时只能写进 connection.display.displayOffset（仍在 assetLocal，米）。
 *
 * 对外接口（window.PETRO_CONNECTIONS）：
 *   load()                       读取 JSON（幂等）
 *   setManifest(m)               注入 Manifest，提供 anchors 坐标
 *   list() / get(id)             取连接
 *   resolvePoints(id)            assetLocal 折线点（含 displayOffset）
 *   statusLabel(id)              UI 状态文案（非 approved 时强制标注）
 *   create(id, opts)             建 Group（教学线 + 箭头 + 粒子），返回句柄
 *   update(dt)                   推进所有粒子
 *   dispose()                    清理
 */
(function () {
  var THREE = window.THREE;
  var DATA_URL = 'data/process-connections.json';

  var state = {
    data: null,
    byId: {},
    manifest: null,
    pending: null,
    items: [],
  };

  function load(url) {
    if (state.pending) return state.pending;
    var target = url || DATA_URL;
    state.pending = fetch(target)
      .then(function (r) {
        if (!r.ok) throw new Error('process-connections ' + r.status);
        return r.json();
      })
      .then(function (d) {
        state.data = d;
        state.byId = {};
        (d.connections || []).forEach(function (c) { state.byId[c.connectionId] = c; });
        return d;
      });
    return state.pending;
  }

  function setManifest(m) { state.manifest = m; }

  function anchorsById() {
    var out = {};
    ((state.manifest && state.manifest.anchors) || []).forEach(function (a) { out[a.anchorId] = a; });
    return out;
  }

  function list() { return (state.data && state.data.connections) || []; }
  function get(id) { return state.byId[id] || null; }

  /* assetLocal 折线：from 锚点 → waypoints → to 锚点，各自叠加 displayOffset。
   * 端点绝不来自 JSON，只来自 Manifest。 */
  function resolvePoints(id) {
    var c = get(id);
    if (!c) return null;
    var anchors = anchorsById();
    var a = anchors[c.from.anchorId];
    var b = anchors[c.to.anchorId];
    if (!a || !b) return null;
    var off = (c.display && c.display.displayOffset) || [0, 0, 0];
    var pts = [a.position].concat(c.waypoints, [b.position]).map(function (p) {
      return new THREE.Vector3(p[0] + off[0], p[1] + off[1], p[2] + off[2]);
    });
    return pts;
  }

  function resolveCurve(id) {
    var pts = resolvePoints(id);
    if (!pts || pts.length < 2) return null;
    /* 用 CurvePath + LineCurve3 保持折线原样：Catmull-Rom 会把弯头圆角化，
     * 那样教学线就不再与实体管线的拐角一致。 */
    var path = new THREE.CurvePath();
    for (var i = 0; i < pts.length - 1; i++) path.add(new THREE.LineCurve3(pts[i], pts[i + 1]));
    return path;
  }

  function statusLabel(id) {
    var c = get(id);
    if (!c) return '';
    var b = c.basis || {};
    if (b.reviewStatus === 'approved') return '';
    if (b.reviewStatus === 'rejected') return '工艺依据已驳回 · 不渲染';
    if (b.reviewStatus === 'pendingBasis' || b.pendingBasis) return '待工艺审核 · 教学示意';
    return '教学示意 · 未经工艺审核';
  }

  function isRenderable(id) {
    var c = get(id);
    if (!c) return false;
    return (c.basis || {}).reviewStatus !== 'rejected';
  }

  function tokenColor(token, fallback) {
    if (!window.getComputedStyle) return fallback;
    var v = getComputedStyle(document.documentElement).getPropertyValue(token || '').trim();
    return v || fallback;
  }

  function create(id, opts) {
    opts = opts || {};
    if (!isRenderable(id)) return null;
    var c = get(id);
    var pts = resolvePoints(id);
    if (!pts) return null;

    var color = tokenColor(c.displayColorToken, '#79c0ff');
    var group = new THREE.Group();
    group.name = 'Connection_' + id;
    group.userData.connectionId = id;
    group.userData.basisStatus = c.basis.reviewStatus;
    group.userData.statusLabel = statusLabel(id);

    var lineRadius = (c.display && c.display.lineRadius) || 0.03;

    /* 教学线：与实体管线同一条折线，稍微抬起避免 z-fighting */
    var lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
    var line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({
      color: new THREE.Color(color), transparent: true, opacity: 0.95,
    }));
    line.name = 'ConnectionLine_' + id;
    line.renderOrder = 3;
    group.add(line);

    /* 方向箭头：在路径中段按切线朝向 */
    var path = resolveCurve(id);
    var arrow = null;
    if (path) {
      var t = 0.5;
      var pMid = path.getPointAt(t);
      var tan = path.getTangentAt(t).normalize();
      arrow = new THREE.Mesh(
        new THREE.ConeGeometry(Math.max(lineRadius * 3.2, 0.09), Math.max(lineRadius * 9, 0.3), 12),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(color) })
      );
      arrow.name = 'ConnectionArrow_' + id;
      arrow.position.copy(pMid);
      arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
      group.add(arrow);
    }

    /* 粒子：沿同一条曲线运动，数量/速度/大小来自 JSON */
    var particles = null;
    if (c.display && c.display.particles && path) {
      var count = c.display.particleCount || 16;
      var size = c.display.particleSize || 0.08;
      var geo = new THREE.SphereGeometry(size, 10, 8);
      var mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.9 });
      particles = [];
      var pgroup = new THREE.Group();
      pgroup.name = 'ConnectionParticles_' + id;
      for (var i = 0; i < count; i++) {
        var m = new THREE.Mesh(geo, mat);
        m.userData.t = i / count;
        pgroup.add(m);
        particles.push(m);
      }
      group.add(pgroup);
    }

    var handle = {
      id: id,
      group: group,
      line: line,
      arrow: arrow,
      particles: particles,
      points: pts,
      curve: path,
      speed: (c.display && c.display.particleSpeed) || 0.3,
      direction: c.direction || 'forward',
      visible: { overview: !!(c.display && c.display.overview), detail: !!(c.display && c.display.detail) },
      setVisible: function (v) { group.visible = !!v; },
      setDetail: function (lv) {
        group.visible = lv === 'overview' ? handle.visible.overview : handle.visible.detail;
      },
      worldPoints: function () {
        var out = [];
        for (var k = 0; k < pts.length; k++) out.push(group.localToWorld(pts[k].clone()));
        return out;
      },
    };
    state.items.push(handle);
    return handle;
  }

  function update(dt) {
    for (var i = 0; i < state.items.length; i++) {
      var h = state.items[i];
      if (!h.particles || !h.group.visible) continue;
      var step = h.speed * dt * (h.direction === 'reverse' ? -1 : 1);
      for (var k = 0; k < h.particles.length; k++) {
        var m = h.particles[k];
        m.userData.t = (m.userData.t + step) % 1;
        if (m.userData.t < 0) m.userData.t += 1;
        var p = h.curve.getPointAt(m.userData.t);
        if (p) m.position.copy(p);
      }
    }
  }

  function dispose() {
    state.items.forEach(function (h) {
      if (h.group && h.group.parent) h.group.parent.remove(h.group);
    });
    state.items = [];
  }

  function resolvedSummary() {
    return list().map(function (c) {
      var pts = resolvePoints(c.connectionId);
      return {
        connectionId: c.connectionId,
        basisStatus: (c.basis || {}).reviewStatus,
        statusLabel: statusLabel(c.connectionId),
        renderable: isRenderable(c.connectionId),
        points: pts ? pts.map(function (p) { return [p.x, p.y, p.z]; }) : null,
      };
    });
  }

  window.PETRO_CONNECTIONS = {
    load: load,
    setManifest: setManifest,
    list: list,
    get: get,
    resolvePoints: resolvePoints,
    resolveCurve: resolveCurve,
    statusLabel: statusLabel,
    isRenderable: isRenderable,
    create: create,
    update: update,
    dispose: dispose,
    resolvedSummary: resolvedSummary,
    get data() { return state.data; },
    get items() { return state.items; },
  };
})();
