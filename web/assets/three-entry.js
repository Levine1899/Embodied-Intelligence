/**
 * 唯一的 Three.js runtime 入口（Phase 6）。
 *
 * 这个文件是**唯一**允许 import `three` 的地方；由 scripts/build-three.mjs
 * 用 esbuild 打成 web/assets/three.bundle.js，以经典脚本（非 module）方式加载，
 * 从而保证：
 *   1. THREE 与 GLTFLoader 来自同一个 npm 包实例（同一个 three@0.180.0）；
 *   2. 页面里只存在一套 runtime —— 如果已经有人加载过旧 three.browser.js，
 *      这里直接抛错而不是悄悄覆盖；
 *   3. 经典脚本拿到的 window.THREE 接口与迁移前完全一致（levels/*.js 无需改动）。
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const EXPECTED_REVISION = '180';

if (typeof window === 'undefined') {
  throw new Error('[three-entry] 只能在浏览器环境中执行');
}

/* 防止双 runtime：如果 window.THREE 已经存在且不是本 bundle 写入的，说明页面
 * 同时引了旧 three.browser.js。两个不同实例会出现 "instanceof 判型失败"、
 * 材质/几何互不兼容等难以定位的问题，必须在入口处拦住。 */
if (window.THREE && window.THREE.__petroRuntime !== 'bundle') {
  throw new Error(
    '[three-entry] 检测到已存在的 window.THREE（很可能来自旧 three.browser.js）。' +
      '页面不允许同时加载两套 Three.js runtime；请移除旧 <script src="assets/three.browser.js">。',
  );
}

if (String(THREE.REVISION) !== EXPECTED_REVISION) {
  throw new Error(
    `[three-entry] THREE.REVISION 期望 ${EXPECTED_REVISION}，实际 ${THREE.REVISION}。` +
      'three 版本与构建时应精确锁定（见 package.json 的 "three": "0.180.0"）。',
  );
}

/* 标记来源，供运行时自检与 E2E 断言使用（不可写、不可配置，避免被冒改） */
Object.defineProperty(THREE, '__petroRuntime', { value: 'bundle', enumerable: false });
Object.defineProperty(window, '__PETRO_THREE_REVISION', {
  value: THREE.REVISION,
  enumerable: true,
  writable: false,
  configurable: false,
});

window.THREE = THREE;
window.GLTFLoader = GLTFLoader;

/* 冒烟自检：加载器必须真的可用，否则等关卡用到时才发现就太晚了 */
if (typeof window.GLTFLoader !== 'function') {
  throw new Error('[three-entry] GLTFLoader 未正确导出');
}
