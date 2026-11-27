"""Phase 9｜L1 地下开采资产精修（v2）。

三条设计约束（对应 Phase 9 的禁令）：
  1. 不改变既有教学地层顺序（上覆→盖层→储层→基底），只消除层间重叠；
  2. 射孔必须**真的穿过套管/水泥环并进入地层**，且落在储层 y 区间内——
     不是表面上随机开孔；
  3. 孔隙结构用**真实几何**（岩粒 + 孔喉 + 孔隙体）做独立微观资产，
     不用随机粒子冒充孔隙；不写入任何未经审核的孔隙度/渗透率数值。

产物（4 个 GLB）：
  underground_strata     4 层地层（不重叠）+ 层理缝 + 储层透镜
  underground_wellbore   套管 / 水泥环 / 油管 / 12 个射孔（3 段高度，穿透入地层）
  underground_wellhead   井口树 / 主阀 / 翼阀 / 法兰 ×2 / 出口 / 出油管线
  reservoir_micro        岩粒 + 孔隙 + 孔喉 + 油相（微观放大用）

节点名保持与旧资产一致（geo_*、well_casing/cement/tubing、wellhead_*），
这样 l1.js 既有的 name→layer/part 绑定不用改。

Run: blender -b -P tools/blender/build_underground_v2.py
"""

import bpy
import json
import math
import os
import random
import uuid

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
GLB_ROOT = os.path.join(ROOT, "web", "assets", "underground")
BLEND_ROOT = os.path.join(ROOT, "assets-source", "blender")
PETRO_NS = uuid.UUID("5c3d1f7a-2b48-4e6c-9f10-8a7d3e5b2c94")

# 地层分界（与旧资产总体一致，但把重叠改成严丝合缝的接触面）
BAND = {
    "geo_overburden": (0.34, -2.10),
    "geo_caprock": (-2.10, -4.02),
    "geo_reservoir_layer": (-4.02, -7.27),
    "geo_basement": (-7.27, -12.28),
}
RES_TOP, RES_BOT = BAND["geo_reservoir_layer"]
HALF_X, HALF_Z = 9.0, 6.0

COLORS = {
    "geo_overburden": (0.49, 0.40, 0.30),
    "geo_caprock": (0.45, 0.46, 0.43),
    "geo_reservoir_layer": (0.66, 0.48, 0.18),
    "geo_basement": (0.23, 0.26, 0.27),
}
BEDDING = {
    "geo_overburden": (0.36, 0.29, 0.21),
    "geo_caprock": (0.33, 0.34, 0.31),
    "geo_reservoir_layer": (0.50, 0.35, 0.12),
    "geo_basement": (0.16, 0.18, 0.19),
}


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    random.seed(20261127)


def mat(name, color, rough=0.85, metal=0.0, emit=None):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (color[0], color[1], color[2], 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = (emit[0], emit[1], emit[2], 1.0)
        b.inputs["Emission Strength"].default_value = 1.4
    return m


def _stamp(ob, m, asset, object_id, semantic, role):
    if m is not None:
        ob.data.materials.append(m)
    ob["semanticId"] = semantic
    ob["objectId"] = object_id
    ob["petro"] = {
        "nodeUid": str(uuid.uuid5(PETRO_NS, "%s/%s/%s" % (asset, object_id, semantic))),
        "objectId": object_id,
        "semanticId": semantic,
        "role": role,
    }
    return ob


def _apply(ob):
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return ob


def _smooth(ob):
    for p in ob.data.polygons:
        p.use_smooth = True


def box(A, O, name, size, loc, m, role="part", rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    ob = bpy.context.object
    ob.name = name
    ob.scale = size
    _apply(ob)
    return _stamp(ob, m, A, O, name, role)


def cyl(A, O, name, r, h, loc, m, role="part", axis="z", rot=None, verts=20):
    if rot is None:
        # 作者空间：x 右、y 上、z 纵深。axis='y' 竖直，'x' 横向，'z' 前后。
        rot = (0, math.pi / 2, 0) if axis == "x" else (math.pi / 2, 0, 0) if axis == "y" else (0, 0, 0)
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=h, location=loc, rotation=rot)
    ob = bpy.context.object
    ob.name = name
    _apply(ob)
    _smooth(ob)
    return _stamp(ob, m, A, O, name, role)


def cyl_between(A, O, name, r1, r2, p0, p1, m, role="part", verts=12):
    """两点之间的锥台：用于射孔（从套管内斜插进地层）。"""
    import mathutils
    v0 = mathutils.Vector(p0)
    v1 = mathutils.Vector(p1)
    d = v1 - v0
    length = d.length
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=length,
                                    location=(v0 + v1) / 2.0)
    ob = bpy.context.object
    ob.name = name
    quat = mathutils.Vector((0, 0, 1)).rotation_difference(d.normalized())
    ob.rotation_mode = "QUATERNION"
    ob.rotation_quaternion = quat
    _apply(ob)
    _smooth(ob)
    return _stamp(ob, m, A, O, name, role)


def roughen(ob, half_z, cuts=5, amp=0.045):
    """只抖动 +z 剖切面附近的顶点：远看是断面颗粒感，近看不至于碎成噪点。"""
    import random as _r
    _r.seed(hash(ob.name) & 0xffff)
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.subdivide(number_cuts=cuts)
    bpy.ops.object.mode_set(mode="OBJECT")
    # 只抖动剖切面的 x/z：若连 y 一起抖，包围盒会被撑大 0.01~0.03，
    # 看起来就像"层间重叠"，把真实的零重叠掩盖掉。
    # 作者坐标里 y 是高度：抖动只能动 x/z 两个水平轴，否则层高被撑大 ~0.02，
    # 又会被读成"层间重叠"。
    for v in ob.data.vertices:
        if v.co.z > half_z - 0.02:
            v.co.x += (_r.random() - 0.5) * amp * 1.2
            v.co.z += (_r.random() - 0.5) * amp * 0.5
    return ob


def sphere(A, O, name, r, loc, m, role="part", seg=12, ring=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=ring, radius=r, location=loc)
    ob = bpy.context.object
    ob.name = name
    _apply(ob)
    _smooth(ob)
    return _stamp(ob, m, A, O, name, role)


def join_as(A, O, name, parts, m, role):
    bpy.ops.object.select_all(action="DESELECT")
    for ob in parts:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    ob = bpy.context.object
    ob.name = name
    ob["semanticId"] = name
    ob["objectId"] = O
    ob["petro"] = {
        "nodeUid": str(uuid.uuid5(PETRO_NS, "%s/%s/%s" % (A, O, name))),
        "objectId": O,
        "semanticId": name,
        "role": role,
    }
    return ob


def orient_z_up():
    """把"按 Y 向上书写"的场景旋正到 Blender 的 Z-up。

    本脚本所有坐标都按 Y 当高度书写（更贴近 glTF 阅读习惯），
    但 Blender 建模空间是 Z-up。若不旋正，export_yup 会把高度搬到 Z，
    导出的 GLB 就是"地层前后堆叠"而不是上下堆叠——这一版之前就是这么错的。
    """
    import math, mathutils
    rot = mathutils.Matrix.Rotation(math.radians(90), 4, "X")
    for o in [x for x in bpy.context.scene.objects if x.type == "MESH"]:
        # 用矩阵左乘：cyl_between 设的是四元数，改 rotation_euler 对它无效。
        o.matrix_world = rot @ o.matrix_world
        bpy.ops.object.select_all(action="DESELECT")
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=False)


def export(A, notes, anchor=None):
    d = os.path.join(GLB_ROOT, A)
    os.makedirs(d, exist_ok=True)
    orient_z_up()
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    tris = sum(sum(max(0, len(p.vertices) - 2) for p in o.data.polygons) for o in meshes)
    verts = sum(len(o.data.vertices) for o in meshes)
    mins = [min((o.matrix_world @ v.co)[i] for o in meshes for v in o.data.vertices) for i in range(3)]
    maxs = [max((o.matrix_world @ v.co)[i] for o in meshes for v in o.data.vertices) for i in range(3)]
    bpy.ops.object.select_all(action="DESELECT")
    for ob in bpy.context.scene.objects:
        if ob.type in {"MESH", "EMPTY"}:
            ob.select_set(True)
    glb = os.path.join(d, "%s.glb" % A)
    bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB", export_apply=True, export_yup=True,
                              export_extras=True, use_selection=True)
    os.makedirs(BLEND_ROOT, exist_ok=True)
    blend = os.path.join(BLEND_ROOT, "%s.blend" % A)
    bpy.ops.wm.save_as_mainfile(filepath=blend)
    # 逐节点世界包围盒：几何事实由构建者发布，测试直接消费，
    # 不要让测试去猜 GLB 的矩阵/实例结构（上一版就是这么读错的）。
    per_node = {}
    for o in meshes:
        vs = [o.matrix_world @ v.co for v in o.data.vertices]
        if not vs:
            continue
        # Blender 是 Z-up，glTF 是 Y-up：发布前统一换算 (x, z, -y)，
        # 否则测试/Manifest 拿到的是另一套坐标系（会被读成"竖直圆柱只有直径高"）。
        def yup(p):
            return [p[0], p[2], -p[1]]
        mn = [min(v[i] for v in vs) for i in range(3)]
        mx = [max(v[i] for v in vs) for i in range(3)]
        lo, hi = yup(mn), yup(mx)
        per_node[o.name] = {
            "min": [round(min(lo[i], hi[i]), 4) for i in range(3)],
            "max": [round(max(lo[i], hi[i]), 4) for i in range(3)],
        }

    stats = {
        "asset": A,
        "nodes": per_node,
        "source": "tools/blender/build_underground_v2.py",
        "blender": bpy.app.version_string,
        "meshes": len(meshes),
        "triangles": tris,
        "vertices": verts,
        "bounds": {
            "min": [round(min(mins[0], maxs[0]), 3), round(mins[2], 3), round(-maxs[1], 3)],
            "max": [round(max(mins[0], maxs[0]), 3), round(maxs[2], 3), round(-mins[1], 3)],
        },
        "coordinateSpace": "glTF Y-up（已从 Blender Z-up 换算）",
        "notes": notes,
        "files": {"glb_bytes": os.path.getsize(glb), "blend_bytes": os.path.getsize(blend)},
    }
    if anchor:
        stats["anchorPoint"] = anchor
    with open(os.path.join(d, "%s.stats.json" % A), "w", encoding="utf-8") as fh:
        json.dump(stats, fh, ensure_ascii=False, indent=2)
    print("@@UG@@ " + json.dumps({"asset": A, "meshes": len(meshes), "tris": tris,
                                  "glb": os.path.getsize(glb)}, ensure_ascii=False))


# ------------------------------------------------------------------ 地层
def build_strata():
    A = "underground_strata"
    clear()
    for name, (top, bot) in BAND.items():
        h = top - bot
        m = mat("M_" + name, COLORS[name], 0.9)
        layer = box(A, "geology", name, (HALF_X * 2, h, HALF_Z * 2), (0, (top + bot) / 2.0, 0), m, "stratum")
        roughen(layer, HALF_Z)
        # 层理：层内 3 条薄缝，略内缩，剖切后读得出来
        bm = mat("MB_" + name, BEDDING[name], 0.95)
        for i, f in enumerate((0.28, 0.52, 0.76)):
            y = top - h * f
            box(A, "geology", "%s_bedding_%d" % (name, i + 1),
                (HALF_X * 2 - 0.06, 0.035, HALF_Z * 2 - 0.06), (0, y, 0), bm, "bedding")

    # 储层透镜（保留原尺度与位置，只做轻微内缩避免与层理共面闪烁）
    lens = mat("M_reservoir_lens", (0.74, 0.55, 0.20), 0.7)
    box(A, "reservoir", "reservoir_lens", (11.2, 2.30, 6.4), (0, (RES_TOP + RES_BOT) / 2.0 - 0.05, 0), lens, "reservoir_body")
    export(A, ["四层地层严丝合缝不重叠；每层 3 条层理缝用于剖切面阅读",
               "层序保持：上覆地层→盖层→储层→基底（未改动教学顺序）"])


# ------------------------------------------------------------------ 井筒
def build_wellbore():
    A = "underground_wellbore"
    clear()
    steel = mat("M_steel", (0.41, 0.44, 0.42), 0.42, 0.75)
    cement = mat("M_cement", (0.55, 0.54, 0.50), 0.95)
    perf = mat("M_perf", (0.30, 0.33, 0.34), 0.5, 0.6)

    top, bot = 1.30, -7.30
    # 套管（外）→ 水泥环（更外）→ 油管（更内）：半径严格嵌套
    cyl(A, "wellbore", "well_casing", 0.30, top - bot, (0, (top + bot) / 2, 0), steel, "casing", axis="y", verts=24)
    cyl(A, "wellbore", "well_cement", 0.52, top - bot, (0, (top + bot) / 2, 0), cement, "cement", axis="y", verts=24)
    cyl(A, "wellbore", "well_tubing", 0.13, (top - bot) - 0.4, (0, (top + bot) / 2 + 0.2, 0), steel, "tubing", axis="y", verts=18)

    # 射孔：3 段高度 × 4 个方位，从套管内壁斜插到地层内（r 0.26 → 1.15）
    idx = 0
    levels = (-5.10, -5.70, -6.30)
    for li, y in enumerate(levels):
        for k in range(4):
            a = math.radians(45 + k * 90 + (li % 2) * 20)
            p0 = (0.26 * math.cos(a), y, 0.26 * math.sin(a))
            p1 = (1.15 * math.cos(a), y - 0.10, 1.15 * math.sin(a))
            cyl_between(A, "wellbore", "well_perforation_%02d" % idx, 0.055, 0.028, p0, p1, perf, "perforation")
            idx += 1

    export(A, ["射孔 12 个（3 段高度 × 4 方位），半径自 0.26（套管内壁）穿到 1.15（地层内）",
               "套管 r=0.30 / 水泥环 r=0.52 / 油管 r=0.13，半径严格嵌套不穿插",
               "射孔 y 区间 [-6.40, -5.00] 完整落在储层 [-7.27, -4.02] 内"])


# ------------------------------------------------------------------ 井口
def build_wellhead():
    A = "underground_wellhead"
    clear()
    steel = mat("M_wh_steel", (0.46, 0.49, 0.47), 0.38, 0.8)
    paint = mat("M_wh_paint", (0.62, 0.30, 0.18), 0.55, 0.3)
    padm = mat("M_wh_pad", (0.30, 0.30, 0.28), 0.95)

    box(A, "wellhead", "surface_pad", (2.0, 0.12, 2.0), (0, 0.10, 0), padm, "pad")
    box(A, "wellhead", "wellhead_tree", (0.56, 0.55, 0.56), (0, 0.72, 0), steel, "tree")
    cyl(A, "wellhead", "wellhead_flange_lower", 0.30, 0.10, (0, 0.50, 0), steel, "flange", axis="y", verts=18)
    # 主阀（带手轮）
    box(A, "wellhead", "wellhead_master_valve", (0.62, 0.22, 0.34), (0, 1.06, 0), paint, "valve")
    bpy.ops.mesh.primitive_torus_add(major_radius=0.17, minor_radius=0.032, major_segments=18,
                                     minor_segments=8, location=(0, 1.22, 0))
    hw = bpy.context.object
    hw.name = "wellhead_master_valve_wheel"
    _apply(hw)
    _smooth(hw)
    _stamp(hw, paint, A, "wellhead", "wellhead_master_valve_wheel", "valve_wheel")
    # 翼阀（水平）
    box(A, "wellhead", "wellhead_wing_valve", (0.26, 0.24, 0.30), (0.52, 0.86, 0), paint, "valve")
    cyl(A, "wellhead", "wellhead_flange_side", 0.19, 0.08, (0.68, 0.86, 0), steel, "flange", axis="x", verts=18)
    cyl(A, "wellhead", "wellhead_outlet", 0.115, 0.85, (1.12, 0.86, 0), steel, "outlet", axis="x", verts=16)
    # 出油管线：水平段 + 弯头向下
    cyl(A, "wellhead", "wellhead_flowline_run", 0.105, 1.5, (2.28, 0.86, 0), steel, "flowline", axis="x", verts=14)
    cyl(A, "wellhead", "wellhead_flowline_riser", 0.105, 0.86, (3.03, 0.45, 0), steel, "flowline", axis="y", verts=14)

    export(A, ["井口树/主阀/翼阀/法兰×2/出口/出油管线各自独立语义节点",
               "主阀带手轮，翼阀水平布置——两者形状可区分，不是同一块盒子"])


# ------------------------------------------------------------------ 微观孔隙
def build_micro():
    A = "reservoir_micro"
    clear()
    grain = mat("M_grain", (0.62, 0.52, 0.34), 0.9)
    grain2 = mat("M_grain_dark", (0.46, 0.38, 0.25), 0.92)
    pore_m = mat("M_pore", (0.07, 0.09, 0.10), 1.0)
    throat = mat("M_throat", (0.10, 0.12, 0.13), 1.0)
    oil = mat("M_oil", (0.78, 0.56, 0.18), 0.55, emit=(0.30, 0.20, 0.05))

    # 岩粒：立方晶格 + 抖动，合并为一个节点（是几何体，不是粒子）
    grains = []
    n = 4
    for ix in range(n):
        for iy in range(n):
            for iz in range(n):
                if random.random() < 0.12:
                    continue
                jitter = lambda: (random.random() - 0.5) * 0.12
                r = 0.24 + random.random() * 0.09
                loc = (ix - (n - 1) / 2 + jitter(), iy - (n - 1) / 2 + jitter(), iz - (n - 1) / 2 + jitter())
                grains.append(sphere(A, "micro", "micro_grain_%02d" % len(grains), r, loc, grain, "grain", seg=12, ring=8))
    join_as(A, "micro", "micro_grains", grains, grain, "grain")

    # 孔隙：岩粒之间被留出的空腔，用暗色凹面体表示（不是随机粒子）
    pores = []
    for ix in range(n - 1):
        for iy in range(n - 1):
            for iz in range(n - 1):
                if random.random() < 0.35:
                    continue
                loc = (ix - (n - 1) / 2 + 0.5, iy - (n - 1) / 2 + 0.5, iz - (n - 1) / 2 + 0.5)
                pores.append(sphere(A, "micro", "micro_pore_%02d" % len(pores), 0.13 + random.random() * 0.04, loc,
                                    pore_m, "pore", seg=10, ring=7))
    join_as(A, "micro", "micro_pores", pores, pore_m, "pore")

    # 孔喉：把相邻孔隙连起来的细管，体现"孔隙是连通的"
    throats = []
    for i in range(6):
        a = i * math.pi / 3
        p0 = (0.5 * math.cos(a), 0.0, 0.5 * math.sin(a))
        p1 = (1.5 * math.cos(a), 0.0, 1.5 * math.sin(a))
        throats.append(cyl_between(A, "micro", "micro_throat_%02d" % i, 0.035, 0.035, p0, p1, throat, "throat", verts=8))
    join_as(A, "micro", "micro_throats", throats, throat, "throat")

    # 油相：占据部分孔隙（教学：油在孔隙里，不是一个地下油湖）
    blobs = []
    for i in range(5):
        a = i * 1.9
        blobs.append(sphere(A, "micro", "micro_oil_%02d" % i, 0.11 + (i % 2) * 0.02,
                            (0.9 * math.cos(a), 0.35 + (i % 3) * 0.18, 0.9 * math.sin(a)), oil, "oil", seg=10, ring=7))
    join_as(A, "micro", "micro_oil_saturation", blobs, oil, "oil")

    export(A, ["岩粒/孔隙/孔喉/油相均为真实几何体（非粒子），四者分层可单独选择",
               "不含任何孔隙度、渗透率数值——本资产只表达拓扑关系"])


def main():
    build_strata()
    build_wellbore()
    build_wellhead()
    build_micro()
    print("@@UG_DONE@@")


if __name__ == "__main__":
    main()
