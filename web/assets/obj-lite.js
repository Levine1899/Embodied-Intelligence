/* Shared OBJ parser for hero assets (no external loader).
 * Supports: v / vn / f (polygons triangulated), o / g / usemtl, optional MTL Kd.
 * Returns a THREE.Group with one mesh per material (or per object when no usemtl).
 * Not a full OBJ implementation: no smoothing groups, textures, negative indices, or lines.
 */
(function (global) {
  'use strict';

  function parseMTL(text) {
    const colors = {};
    let current = null;
    text.split('\n').forEach(function (line) {
      const parts = line.trim().split(/\s+/);
      if (parts[0] === 'newmtl') {
        current = parts.slice(1).join(' ');
        colors[current] = { color: 0x9b968a, metalness: 0.7, roughness: 0.45 };
      } else if (parts[0] === 'Kd' && current) {
        const r = Math.round(parseFloat(parts[1]) * 255);
        const g = Math.round(parseFloat(parts[2]) * 255);
        const b = Math.round(parseFloat(parts[3]) * 255);
        colors[current].color = (r << 16) | (g << 8) | b;
      }
    });
    return colors;
  }

  function parseOBJ(text, mtl) {
    const positions = [];
    const normals = [];
    const buckets = new Map();
    let bucket = null;

    function getBucket(name, material) {
      const key = (name || 'mesh') + '|' + (material || '');
      if (!buckets.has(key)) {
        buckets.set(key, { name: name || 'mesh', material: material || null, pos: [], nrm: [], idx: [], map: new Map(), count: 0 });
      }
      return buckets.get(key);
    }

    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (line.charCodeAt(0) === 118 && line.charCodeAt(1) === 32) { // "v "
        const a = line.split(/\s+/);
        positions.push(+a[1], +a[2], +a[3]);
      } else if (line.charCodeAt(0) === 118 && line.charCodeAt(1) === 110 && line.charCodeAt(2) === 32) { // "vn "
        const a = line.split(/\s+/);
        normals.push(+a[1], +a[2], +a[3]);
      } else if (line.charCodeAt(0) === 111 && line.charCodeAt(1) === 32) { // "o "
        bucket = getBucket(line.slice(2).trim(), null);
      } else if (line.charCodeAt(0) === 103 && line.charCodeAt(1) === 32) { // "g "
        bucket = getBucket(line.slice(2).trim(), null);
      } else if (line.indexOf('usemtl ') === 0) {
        const material = line.slice(7).trim();
        bucket = bucket && !bucket.material ? bucket : getBucket(bucket ? bucket.name : 'mesh', material);
        bucket.material = material;
      } else if (line.charCodeAt(0) === 102 && line.charCodeAt(1) === 32) { // "f "
        if (!bucket) bucket = getBucket('mesh', null);
        const face = line.split(/\s+/).slice(1);
        const indices = [];
        for (let k = 0; k < face.length; k += 1) {
          const parts = face[k].split('/');
          const vi = parseInt(parts[0], 10);
          const ni = parts[2] ? parseInt(parts[2], 10) : 0;
          const key = vi + '/' + ni;
          if (!bucket.map.has(key)) {
            const index = bucket.count;
            bucket.map.set(key, index);
            bucket.pos.push(positions[(vi - 1) * 3], positions[(vi - 1) * 3 + 1], positions[(vi - 1) * 3 + 2]);
            if (ni) bucket.nrm.push(normals[(ni - 1) * 3], normals[(ni - 1) * 3 + 1], normals[(ni - 1) * 3 + 2]);
            bucket.count += 1;
          }
          indices.push(bucket.map.get(key));
        }
        for (let t = 1; t < indices.length - 1; t += 1) {
          bucket.idx.push(indices[0], indices[t], indices[t + 1]);
        }
      }
    }

    const root = new THREE.Group();
    bucket = null;
    buckets.forEach(function (b) {
      if (!b.pos.length) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      if (b.nrm.length === b.pos.length) {
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
      } else {
        geo.computeVertexNormals();
      }
      geo.setIndex(b.idx);
      const spec = (b.material && mtl[b.material]) || { color: 0x9b968a, metalness: 0.7, roughness: 0.45 };
      const mat = new THREE.MeshStandardMaterial({
        color: spec.color,
        metalness: spec.metalness,
        roughness: spec.roughness,
        side: THREE.FrontSide
      });
      mat.name = b.material || 'material';
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = b.name;
      mesh.userData.materialName = b.material;
      root.add(mesh);
    });
    return root;
  }

  function load(objUrl, mtlUrl) {
    const started = performance.now();
    return Promise.all([
      fetch(objUrl).then(function (r) { if (!r.ok) throw new Error('OBJ ' + r.status); return r.text(); }),
      mtlUrl ? fetch(mtlUrl).then(function (r) { return r.ok ? r.text() : ''; }).catch(function () { return ''; }) : Promise.resolve('')
    ]).then(function (result) {
      const root = parseOBJ(result[0], parseMTL(result[1] || ''));
      root.userData.parseMs = Math.round((performance.now() - started) * 10) / 10;
      return root;
    });
  }

  global.ObjLite = { load: load, parseOBJ: parseOBJ, parseMTL: parseMTL };
})(window);
