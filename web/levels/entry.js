/* 关卡通用入口：多个关卡共用左下角按钮列，并在关卡内屏蔽总览的拖拽/选中 */
(function () {
  const stage = window.__stage;
  if (!stage) return;

  let box = null;
  window.__levelHooks = window.__levelHooks || {};

  /* 主入口：点三维场景里那个节点。chip 只是备选与可见性提示。 */
  window.__lvlEntry = function (index, label, onClick) {
    window.__levelHooks[index] = onClick;
    /* 关卡各建一个 group 挂在同一 scene 上，进关时必须只留自己那一组 */
    window.__levelGroups = window.__levelGroups || [];
    window.__lvlGroup = function (i, g) {
      window.__levelGroups[i] = g;
      if (g) g.visible = false;
    };
    const onlyMine = function (i) {
      (window.__levelGroups || []).forEach(function (g, k) { if (g) g.visible = (k === i); });
    };
    window.__onlyLevelGroup = onlyMine;
    window.__levelHooks[index] = function () {
      onlyMine(index);
      const r = onClick.apply(this, arguments);
      const mine = (window.__levelGroups || [])[index];
      if (mine) mine.visible = true;
      return r;
    };
    if (stage.refreshTaskPanel) setTimeout(function () { stage.refreshTaskPanel(); }, 0);

    /* —— 操作示意动画：告诉小朋友这一步该干什么 —— */
    /* 每个关卡都会跑一遍这段注册，观察器只建一次，索引按当前面板的 id 现取 */
    if (!window.__demoMount) {
      const KIND = ['drag', 'tap', 'drag', 'tap', 'tap'];
      const TEXT = [
        '按住这条滑块，往右拖',
        '点一下分离器的出口',
        '按住液位条，往右拖',
        '点一个产品，再点它出现的位置',
        '点出石油化工常见下游产品'
      ];
      window.__demoMount = function () {
        const panel = document.querySelector('.lvl.on');
        if (!panel) return;
        const host = panel.querySelector('.lvl__act');
        if (!host || host.hidden) return;
        if (host.querySelector('.lvl__demo')) return;
        const actId = host.id || '';
        let levelId = panel.dataset.levelId || '';
        if (!levelId && /^l\d-act$/.test(actId)) levelId = actId.slice(0, 2);
        if (levelId === 'l1') return; // 阶段 08：地下开采只保留滑块，不显示通用操作引导
        if (levelId === 'l4' || levelId === 'l2' || levelId === 'l3') return; // l4/l2 有分步说明；l3 用设备-液位-泵送分区，避免通用引导条遮挡设备
        const ids = ['l1', 'l2', 'l3', 'l4', 'l5'];
        const idx = levelId ? ids.indexOf(levelId) : Array.prototype.indexOf.call(document.querySelectorAll('.lvl'), panel);
        if (idx < 0) return;
        const kind = KIND[idx] || 'tap';
        const wrap = document.createElement('div');
        wrap.className = 'lvl__demo lvl__demo--' + kind;
        const track = document.createElement('span');
        track.className = 'lvl__demo-track';
        const knob = document.createElement('span');
        knob.className = 'lvl__demo-knob';
        track.appendChild(knob);
        if (kind === 'tap') {
          const ripple = document.createElement('span');
          ripple.className = 'lvl__demo-ripple';
          track.appendChild(ripple);
        }
        const label = document.createElement('span');
        label.className = 'lvl__demo-t';
        label.textContent = TEXT[idx] || '';
        wrap.appendChild(track);
        wrap.appendChild(label);
        host.insertBefore(wrap, host.firstChild);
      };
      new MutationObserver(window.__demoMount).observe(document.body, {
        childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class']
      });
      setInterval(window.__demoMount, 1200);
    }
    setTimeout(window.__demoMount, 700);

    if (!box) {
      box = document.createElement('div');
      box.className = 'lvl-entries';
      box.innerHTML = '<span class="lvl-entries__tip">点场景里发光的设备进入细节</span>';
      const resetBtn = document.createElement('button');
      resetBtn.type = 'button';
      resetBtn.className = 'lvl-entry lvl-entry--ghost';
      resetBtn.textContent = '重置五关进度';
      resetBtn.onclick = function () { if (stage.resetProgress) stage.resetProgress(); };
      box.appendChild(resetBtn);
      stage.viewport.appendChild(box);
    }
    /* 不再生成「▶ 进入 0X」按钮：入口是点场景里的设备，右栏还有一个「进入本环节」 */
    return null;
  };

  /* 悬停：有对应关卡的节点显示手型 */
  const hoverRay = new window.THREE.Raycaster();
  const hoverNdc = new window.THREE.Vector2();
  let hovering = false;
  stage.viewport.addEventListener('pointermove', function (e) {
    if (stage.isLevel()) return;
    const rect = stage.viewport.getBoundingClientRect();
    hoverNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    hoverNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    hoverRay.setFromCamera(hoverNdc, stage.camera);
    const hits = hoverRay.intersectObjects(stage.scene.children, true);
    let idx = -1;
    for (let i = 0; i < hits.length && idx < 0; i++) {
      let o = hits[i].object;
      while (o && o.userData.stage === undefined) o = o.parent;
      if (o && o.userData.stage !== undefined) idx = o.userData.stage;
    }
    const want = idx >= 0 && window.__levelHooks[idx] ? 'pointer' : '';
    if (want !== (hovering ? 'pointer' : '')) {
      stage.viewport.style.cursor = want;
      hovering = want === 'pointer';
    }
  });

  /* 关卡内：拦掉总览的指针事件，避免拖拽旋转与节点选中 */
  // 只拦 wheel：pointerdown 必须放行，否则关卡里无法拖拽旋转视角。
  // 节点选中改由 immersion.js 在关卡内直接返回。
  ['wheel'].forEach(function (type) {
    stage.viewport.addEventListener(type, function (e) {
      if (!stage.isLevel()) return;
      if (e.target.closest('.lvl, .lvl-entry')) return;
      e.stopPropagation();
    }, true);
  });


  /* 原生 range 在这个叠层里拖拽会丢行程（只走到一半），改为自己算位置 */
  function bindRange(input) {
    if (!input || input.dataset.boundRange) return;
    input.dataset.boundRange = '1';
    let active = false;
    const set = function (e) {
      const r = input.getBoundingClientRect();
      const t = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      const v = Math.round(t * (Number(input.max || 100) - Number(input.min || 0)) + Number(input.min || 0));
      if (String(v) !== input.value) {
        input.value = v;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    };
    input.addEventListener('pointerdown', function (e) {
      active = true;
      try { input.setPointerCapture(e.pointerId); } catch (err) {}
      set(e);
      e.preventDefault();
    });
    input.addEventListener('pointermove', function (e) { if (active) set(e); });
    ['pointerup', 'pointercancel'].forEach(function (t) {
      input.addEventListener(t, function () { active = false; });
    });
  }

  /* 关卡面板每次出现就绑一次（模块加载时元素还不存在） */
  const rangeObserver = new MutationObserver(function () {
    document.querySelectorAll('.lvl input[type=range]').forEach(bindRange);
  });
  rangeObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class'] });
  setTimeout(function () { document.querySelectorAll('.lvl input[type=range]').forEach(bindRange); }, 600);
  /* —— 流动粒子：一个曲线上的持续物流 —— */
  const THREE0 = window.THREE;
  const flows = [];
  let ticking = false;

  window.__makeFlow = function (scene, curve, opts) {
    const o = Object.assign({ count: 16, color: 0xd8a24a, size: 0.075, speed: 0.16, spread: 0.9, opacity: 1 }, opts || {});
    const group = new THREE0.Group();
    const mat = new THREE0.MeshBasicMaterial({ color: o.color, transparent: true, opacity: o.opacity });
    const items = [];
    for (let i = 0; i < o.count; i++) {
      const m = new THREE0.Mesh(new THREE0.SphereGeometry(o.size, 8, 6), mat);
      m.userData.t = i / o.count;
      group.add(m);
      items.push(m);
    }
    scene.add(group);
    const api = {
      group, speed: o.speed, paused: false,
      update(dt) {
        if (this.paused) return;
        items.forEach(function (m) {
          m.userData.t = (m.userData.t + dt * api.speed) % 1;
          const p = curve.getPoint(m.userData.t);
          m.position.copy(p);
          const s = 0.7 + 0.5 * Math.sin(m.userData.t * Math.PI);
          m.scale.setScalar(s * o.spread);
        });
      }
    };
    flows.push({ scene, update: api.update.bind(api) });
    if (!ticking) {
      ticking = true;
      let last = performance.now();
      (function tick(now) {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        const active = window.__stage && window.__stage.isLevel() ? window.__stage.scene : null;
        flows.forEach(function (f) { if (f.scene === active) f.update(dt); });
        requestAnimationFrame(tick);
      })(performance.now());
    }
    return api;
  };
  window.__lvlLabel = function (text, hex) {
    const THREE = window.THREE;
    const measure = document.createElement('canvas').getContext('2d');
    const font = '600 34px "Microsoft YaHei UI", sans-serif';
    measure.font = font;
    const textW = Math.ceil(measure.measureText(text).width);
    const w = Math.max(96, textW + 28), h = 60;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = 'rgba(10,20,26,0.85)';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = hex || '#7f929b';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);
    ctx.fillStyle = hex || '#dfe9ee';
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 1);
    const tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = 4;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sp.scale.set((w / h) * 0.62, 0.62, 1);
    return sp;
  };
})();
