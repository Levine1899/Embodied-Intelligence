/* Mini GLB parser for the pipeline spike only.
 * Supports: glTF 2.0 GLB, POSITION/NORMAL attributes, indices,
 * pbrMetallicRoughness base color / metallic / roughness, node transforms.
 * Does NOT support: textures, skinning, animations, morph targets, Draco.
 * Production should vendor the official Three.js GLTFLoader instead.
 */
(function (global) {
  'use strict';

  const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
  const ARRAY_TYPES = {
    5120: Int8Array,
    5121: Uint8Array,
    5122: Int16Array,
    5123: Uint16Array,
    5125: Uint32Array,
    5126: Float32Array
  };

  function parseGLB(buffer) {
    const dv = new DataView(buffer);
    if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not GLB');
    const version = dv.getUint32(4, true);
    if (version !== 2) throw new Error('GLB version ' + version);
    const total = dv.getUint32(8, true);
    let offset = 12;
    let json = null;
    let bin = null;
    let binOffset = 0;
    while (offset < total) {
      const length = dv.getUint32(offset, true);
      const type = dv.getUint32(offset + 4, true);
      const dataStart = offset + 8;
      if (type === 0x4e4f534a) {
        json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, dataStart, length)));
      } else if (type === 0x004e4942) {
        bin = buffer;
        binOffset = dataStart;
      }
      offset = dataStart + length;
    }
    if (!json) throw new Error('no JSON chunk');
    return { json: json, bin: bin, binOffset: binOffset };
  }

  function accessorArray(glb, index) {
    const acc = glb.json.accessors[index];
    const bv = glb.json.bufferViews[acc.bufferView];
    const comps = COMPONENTS[acc.type];
    const CT = ARRAY_TYPES[acc.componentType];
    if (!comps || !CT) throw new Error('unsupported accessor ' + acc.type + '/' + acc.componentType);
    const byteOffset = (bv.byteOffset || 0) + (acc.byteOffset || 0);
    const stride = bv.byteStride || 0;
    const elementBytes = comps * CT.BYTES_PER_ELEMENT;
    if (stride && stride !== elementBytes) {
      throw new Error('interleaved accessor not supported in spike');
    }
    return new CT(glb.bin, glb.binOffset + byteOffset, acc.count * comps);
  }

  function buildMaterial(def) {
    const pbr = (def && def.pbrMetallicRoughness) || {};
    const color = pbr.baseColorFactor || [0.6, 0.6, 0.58, 1];
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color[0], color[1], color[2]),
      metalness: pbr.metallicFactor != null ? pbr.metallicFactor : 0.8,
      roughness: pbr.roughnessFactor != null ? pbr.roughnessFactor : 0.45,
      side: def && def.doubleSided ? THREE.DoubleSide : THREE.FrontSide
    });
    mat.name = (def && def.name) || 'material';
    return mat;
  }

  function buildPrimitive(glb, primitive, materials) {
    const attrs = primitive.attributes || {};
    if (attrs.POSITION == null) throw new Error('primitive without POSITION');
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(accessorArray(glb, attrs.POSITION), 3));
    if (attrs.NORMAL != null) {
      geometry.setAttribute('normal', new THREE.BufferAttribute(accessorArray(glb, attrs.NORMAL), 3));
    }
    if (primitive.indices != null) {
      geometry.setIndex(new THREE.BufferAttribute(accessorArray(glb, primitive.indices), 1));
    } else {
      geometry.computeVertexNormals();
    }
    const matIndex = primitive.material;
    const mat = matIndex != null && materials[matIndex] ? materials[matIndex] : new THREE.MeshStandardMaterial({ color: 0x9b968a, metalness: 0.8, roughness: 0.45 });
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.name = 'primitive';
    return mesh;
  }

  function applyNodeTransform(obj, node) {
    if (node.matrix) {
      const m = new THREE.Matrix4().fromArray(node.matrix);
      m.decompose(obj.position, obj.quaternion, obj.scale);
    } else {
      if (node.translation) obj.position.fromArray(node.translation);
      if (node.rotation) obj.quaternion.fromArray(node.rotation);
      if (node.scale) obj.scale.fromArray(node.scale);
    }
  }

  function buildScene(glb) {
    const json = glb.json;
    const materials = (json.materials || []).map(buildMaterial);
    const nodes = json.nodes || [];
    const meshes = json.meshes || [];
    const root = new THREE.Group();
    root.name = 'glb-root';

    function buildNode(index, parent) {
      const node = nodes[index];
      if (!node) return;
      const obj = new THREE.Group();
      obj.name = node.name || ('node_' + index);
      applyNodeTransform(obj, node);
      if (node.mesh != null) {
        meshes[node.mesh].primitives.forEach(function (primitive) {
          obj.add(buildPrimitive(glb, primitive, materials));
        });
      }
      (node.children || []).forEach(function (child) { buildNode(child, obj); });
      parent.add(obj);
    }

    const sceneDef = json.scenes && json.scenes[json.scene || 0];
    if (sceneDef) {
      (sceneDef.nodes || []).forEach(function (index) { buildNode(index, root); });
    } else {
      nodes.forEach(function (node, index) {
        if (node.mesh != null) buildNode(index, root);
      });
    }
    return root;
  }

  function stats(root) {
    let triangles = 0;
    let meshes = 0;
    const materials = new Set();
    root.traverse(function (o) {
      if (!o.isMesh) return;
      meshes += 1;
      const pos = o.geometry.getAttribute('position');
      triangles += o.geometry.index ? o.geometry.index.count / 3 : pos.count / 3;
      materials.add(o.material);
    });
    return { triangles: Math.round(triangles), meshes: meshes, materials: materials.size };
  }

  global.MiniGLB = {
    load: function (url) {
      const started = performance.now();
      return fetch(url).then(function (r) {
        if (!r.ok) throw new Error('fetch ' + r.status);
        return r.arrayBuffer();
      }).then(function (buffer) {
        const t0 = performance.now();
        const glb = parseGLB(buffer);
        const root = buildScene(glb);
        const info = stats(root);
        return {
          root: root,
          bytes: buffer.byteLength,
          parseMs: Math.round((performance.now() - t0) * 10) / 10,
          fetchMs: Math.round((t0 - started) * 10) / 10,
          triangles: info.triangles,
          meshes: info.meshes,
          materials: info.materials
        };
      });
    }
  };
})(window);
