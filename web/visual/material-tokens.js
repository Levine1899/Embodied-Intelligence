/**
 * Phase 10｜视觉令牌与统一渲染策略。
 *
 * 为什么单独成文件：材质口径如果散落在 5 个关卡里，总览和近景迟早会不一致。
 * 这里只定义"口径"，不搬运素材；GLB 资产保留建模时 authored 的 PBR 参数，
 * 令牌用于程序化材质（地层、井筒、流体等）与统一渲染策略。
 */
(function (global) {
  'use strict';

  /* 颜色是 sRGB 十六进制（给人看的口径）；转 linear 由 Three 的 ColorManagement 负责。 */
  const TOKENS = {
    steel_coated:      { label: '涂装碳钢', hex: '#6E7A80', metalness: 0.72, roughness: 0.42 },
    steel_stainless:   { label: '不锈钢',   hex: '#9AA4A8', metalness: 0.88, roughness: 0.28 },
    steel_galvanized:  { label: '镀锌钢',   hex: '#A9B2B4', metalness: 0.62, roughness: 0.52 },
    pipe_insulated:    { label: '保温管',   hex: '#B9A98C', metalness: 0.10, roughness: 0.88 },
    concrete:          { label: '混凝土',   hex: '#8C8C86', metalness: 0.00, roughness: 0.94 },
    rock_sandstone:    { label: '砂岩',     hex: '#B99C6B', metalness: 0.00, roughness: 0.92 },
    rock_mudstone:     { label: '泥岩',     hex: '#7C7A72', metalness: 0.00, roughness: 0.90 },
    reservoir:         { label: '储层',     hex: '#C9A25E', metalness: 0.00, roughness: 0.86 },
    fluid_oil:         { label: '油（教学）', hex: '#C98A2E', metalness: 0.00, roughness: 0.34, opacity: 0.86, transparent: true },
    fluid_water:       { label: '水（教学）', hex: '#3E7FA6', metalness: 0.00, roughness: 0.22, opacity: 0.72, transparent: true },
    fluid_gas:         { label: '气（教学）', hex: '#9FD3D8', metalness: 0.00, roughness: 0.10, opacity: 0.42, transparent: true },
  };

  /* 统一渲染策略：tone mapping / 曝光 / DPR 上限 / 透明层与阴影口径。 */
  const POLICY = {
    toneMapping: 'ACESFilmic',
    exposure: 1.15,          /* 原 1.2，下调以避免浅色岩层过曝（Phase 9 实测过曝） */
    maxDPR: 2,
    minDPR: 1,
    shadows: 'key-structures-only',
    transparent: {
      depthWrite: false,
      depthTest: true,
      renderOrder: { fluid: 6, pore: 7, overlay: 8 },
    },
  };

  function applyRendererPolicy(renderer, THREE) {
    if (!renderer || !THREE) return null;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = POLICY.exposure;
    const dpr = Math.max(POLICY.minDPR, Math.min(global.devicePixelRatio || 1, POLICY.maxDPR));
    renderer.setPixelRatio(dpr);
    return { toneMapping: 'ACESFilmic', exposure: POLICY.exposure, pixelRatio: dpr };
  }

  function toMaterial(tokenName, THREE, overrides) {
    const t = TOKENS[tokenName];
    if (!t) throw new Error('unknown material token: ' + tokenName);
    const o = overrides || {};
    const m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(o.hex || t.hex),
      metalness: o.metalness !== undefined ? o.metalness : t.metalness,
      roughness: o.roughness !== undefined ? o.roughness : t.roughness,
      transparent: !!(o.transparent !== undefined ? o.transparent : t.transparent),
      opacity: o.opacity !== undefined ? o.opacity : (t.opacity !== undefined ? t.opacity : 1),
    });
    if (m.transparent) {
      m.depthWrite = POLICY.transparent.depthWrite;
      m.depthTest = POLICY.transparent.depthTest;
    }
    return m;
  }

  /** 令牌自检：任何缺失字段都会在 CI 里被这条打到，而不是等到画面不对。 */
  function audit() {
    const problems = [];
    Object.keys(TOKENS).forEach((k) => {
      const t = TOKENS[k];
      if (!/^#[0-9A-Fa-f]{6}$/.test(t.hex)) problems.push(k + ': bad hex');
      if (typeof t.metalness !== 'number' || t.metalness < 0 || t.metalness > 1) problems.push(k + ': metalness');
      if (typeof t.roughness !== 'number' || t.roughness < 0 || t.roughness > 1) problems.push(k + ': roughness');
      if (!t.label) problems.push(k + ': no label');
    });
    return { count: Object.keys(TOKENS).length, problems };
  }

  global.PetroVisual = { TOKENS, POLICY, applyRendererPolicy, toMaterial, audit };
})(window);
