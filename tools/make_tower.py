"""常减压蒸馏装置 · 程序化建模（Blender 4.5 headless）

用法：
    blender -b -P make_tower.py -- <输出目录>

产出：
    tower.obj / tower.mtl     网页用（Y-up，OBJ 分组按对象名）
    tower.glb                 母版，给外包/后续精修
    tower.meta.json           锚点、热点、包围盒（网页坐标，Y-up）
    render-overview.png       外观 3/4 视角
    render-cutaway.png        剖切视角（临时切掉塔体前半，仅用于渲染）

坐标约定：Blender 里 Z 向上；OBJ 默认导出后为 Y-up，映射关系
    web.x = b.x, web.y = b.z, web.z = -b.y
脚本会用 Heater 的包围盒自检这条映射。
"""

import bpy
import bmesh
import math
import json
import os
import sys
from mathutils import Vector

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = ARGS[0] if ARGS else os.path.join(os.path.dirname(__file__), "out")
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)


# ---------------------------------------------------------------- 材质
def mat(name, rgb, metallic=0.55, roughness=0.45, emission=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
    b.inputs["Metallic"].default_value = metallic
    b.inputs["Roughness"].default_value = roughness
    m.diffuse_color = (rgb[0], rgb[1], rgb[2], 1.0)  # Workbench 渲染用这个颜色
    if emission:
        b.inputs["Emission Color"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
        b.inputs["Emission Strength"].default_value = emission
    return m


STEEL = mat("Steel", (0.31, 0.38, 0.43))
STEEL_DARK = mat("SteelDark", (0.22, 0.29, 0.34))
HEATER = mat("Heater", (0.44, 0.33, 0.22), 0.35, 0.6)
TRAY = mat("Tray", (0.66, 0.71, 0.74), 0.65, 0.4)
BOX = mat("ProductBox", (0.27, 0.40, 0.46), 0.4, 0.55)
PIPE_HOT = mat("PipeHot", (0.62, 0.42, 0.14), 0.5, 0.4, 1.2)
PIPE_COOL = mat("PipeCool", (0.14, 0.45, 0.53), 0.5, 0.4, 1.0)
CONCRETE = mat("Concrete", (0.34, 0.33, 0.30), 0.04, 0.95)
INSULATION = mat("Insulation", (0.56, 0.53, 0.46), 0.18, 0.82)
SAFETY = mat("SafetyYellow", (0.62, 0.48, 0.16), 0.25, 0.60)


def assign(obj, material):
    obj.data.materials.clear()
    obj.data.materials.append(material)
    return obj


def cyl(name, r, h, loc, rot=(0, 0, 0), seg=48, material=STEEL):
    bpy.ops.mesh.primitive_cylinder_add(vertices=seg, radius=r, depth=h, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    return assign(o, material)


def box(name, size, loc, material=STEEL):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc)
    o = bpy.context.object
    o.name = name
    # cube 默认边长 1，scale 直接取目标尺寸（不是 size/2，否则只有一半大）
    o.scale = (size[0], size[1], size[2])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return assign(o, material)


def sphere(name, r, loc, scale_z=1.0, material=STEEL):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=32, ring_count=16)
    o = bpy.context.object
    o.name = name
    o.scale = (1, 1, scale_z)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return assign(o, material)


def pipe_poly(name, pts, r=0.20, material=PIPE_COOL, seg=14):
    """Axis-aligned teaching pipe with visible elbows; no floating endpoints."""
    for i in range(len(pts) - 1):
        a, b = Vector(pts[i]), Vector(pts[i + 1])
        d = b - a
        L = d.length
        if L < 1e-6:
            continue
        mid = (a + b) / 2
        if abs(d.x) >= abs(d.y) and abs(d.x) >= abs(d.z):
            cyl(f"{name}_Seg{i}", r, L, tuple(mid), rot=(0, math.pi / 2, 0), seg=seg, material=material)
        elif abs(d.y) >= abs(d.z):
            cyl(f"{name}_Seg{i}", r, L, tuple(mid), rot=(math.pi / 2, 0, 0), seg=seg, material=material)
        else:
            cyl(f"{name}_Seg{i}", r, L, tuple(mid), seg=seg, material=material)
    for i, pt in enumerate(pts):
        sphere(f"{name}_Elbow{i}", r * 1.12, pt, material=material)


def steel_post(name, x, y, z0, z1, size=0.18):
    h = max(0.1, z1 - z0)
    box(name, (size, size, h), (x, y, z0 + h / 2), STEEL_DARK)
    box(name + "_Foot", (size * 2.4, size * 2.4, 0.18), (x, y, 0.09), CONCRETE)


def empty(name, loc):
    bpy.ops.object.empty_add(type="PLAIN_AXES", location=loc)
    o = bpy.context.object
    o.name = name
    return o


def half_shell(name, x, r_out, z0, z1, thickness=0.14, segments=48, material=STEEL):
    """带壁厚、且切面封盖的半圆柱壳（半剖显示用）。
    保留 +Y 一侧（导出后位于网页 -Z 侧，正对默认相机）。"""
    r_in = r_out - thickness
    verts, faces = [], []
    for i in range(segments + 1):
        a = math.pi * i / segments
        ca, sa = math.cos(a), math.sin(a)
        for (r, z) in ((r_out, z0), (r_out, z1), (r_in, z0), (r_in, z1)):
            verts.append((x + r * ca, r * sa, z))

    def vid(i, k):
        return i * 4 + k

    for i in range(segments):
        faces.append((vid(i, 0), vid(i + 1, 0), vid(i + 1, 1), vid(i, 1)))       # 外壁
        faces.append((vid(i, 2), vid(i, 3), vid(i + 1, 3), vid(i + 1, 2)))       # 内壁
        faces.append((vid(i, 1), vid(i + 1, 1), vid(i + 1, 3), vid(i, 3)))       # 顶部环
        faces.append((vid(i, 0), vid(i, 2), vid(i + 1, 2), vid(i + 1, 0)))       # 底部环
    # 两片切面封盖（就是"剖开后看到的金属壁厚"）
    faces.append((vid(0, 0), vid(0, 1), vid(0, 3), vid(0, 2)))
    faces.append((vid(segments, 0), vid(segments, 2), vid(segments, 3), vid(segments, 1)))

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    return assign(obj, material)



def half_dome(name, x, z0, radius, squash=0.38, thickness=0.14, rings=12, segs=24, material=STEEL):
    """带壁厚与切面封盖的半穹顶（保留 +Y 一侧，与半壳一致）。"""
    def prof(dim):
        pts = []
        for i in range(rings + 1):
            t = (math.pi / 2) * i / rings
            pts.append((dim * math.sin(t), z0 + dim * squash * math.cos(t)))
        return pts

    po, pi = prof(radius), prof(radius - thickness)
    verts, faces = [], []

    def idx(s, i, k):
        return (s * (rings + 1) + i) * 2 + k

    for s in range(segs + 1):
        phi = math.pi * s / segs
        ca, sa = math.cos(phi), math.sin(phi)
        for i in range(rings + 1):
            ro, zo = po[i]
            ri, zi = pi[i]
            verts.append((x + ro * ca, ro * sa, zo))
            verts.append((x + ri * ca, ri * sa, zi))

    for s in range(segs):
        for i in range(rings):
            faces.append((idx(s, i, 0), idx(s + 1, i, 0), idx(s + 1, i + 1, 0), idx(s, i + 1, 0)))       # 外表面
            faces.append((idx(s, i, 1), idx(s, i + 1, 1), idx(s + 1, i + 1, 1), idx(s + 1, i, 1)))       # 内表面
        faces.append((idx(s, rings, 0), idx(s + 1, rings, 0), idx(s + 1, rings, 1), idx(s, rings, 1)))   # 底环
    for s in (0, segs):                                                                                  # 两片切面封盖
        for i in range(rings):
            a, b, cc, d = idx(s, i, 0), idx(s, i, 1), idx(s, i + 1, 1), idx(s, i + 1, 0)
            faces.append((a, d, cc, b) if s == 0 else (a, b, cc, d))

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    return assign(obj, material)

def build_trays(name, x, r, levels, caps=8, material=TRAY):
    """塔板 + 泡罩 + 降液板，合并成一个对象，避免网页里几百个 draw call。"""
    parts = []
    for idx, z in enumerate(levels):
        bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=r, depth=0.10, location=(x, 0, z))
        tray = bpy.context.object
        tray.name = f"{name}_plate_{idx}"
        parts.append(assign(tray, material))
        for k in range(caps):
            a = 2 * math.pi * k / caps
            bpy.ops.mesh.primitive_cylinder_add(
                vertices=10, radius=0.17, depth=0.13,
                location=(x + math.cos(a) * r * 0.62, math.sin(a) * r * 0.62, z + 0.10))
            parts.append(assign(bpy.context.object, material))
        # 降液板：从塔板一侧向下延伸
        a = 2 * math.pi * (idx % caps) / caps
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(x + math.cos(a) * r * 0.78, math.sin(a) * r * 0.78, z - 0.42))
        dc = bpy.context.object
        dc.scale = (0.46, 0.10, 0.80)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        parts.append(assign(dc, material))

    bpy.ops.object.select_all(action="DESELECT")
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    joined = bpy.context.object
    joined.name = name
    return joined



# ---------------------------------------------------------------- 常压塔
ATM_X, ATM_Y, ATM_R, ATM_BASE, ATM_H = 0.0, 0.0, 2.2, 2.0, 24.0
atm_mid = ATM_BASE + ATM_H / 2
cyl("Tower_Atmospheric_Shell", ATM_R, ATM_H, (ATM_X, ATM_Y, atm_mid))
cyl("Tower_Atmospheric_Skirt", ATM_R + 0.45, 2.0, (ATM_X, ATM_Y, 1.0), material=STEEL_DARK)
sphere("Tower_Atmospheric_Dome", ATM_R, (ATM_X, ATM_Y, ATM_BASE + ATM_H), scale_z=0.38)

# 塔板：16 层（含泡罩与降液板，合并成一个对象）
build_trays("Trays_A", ATM_X, ATM_R - 0.16, [4.6 + i * 1.28 for i in range(16)])

# 平台栏杆（两层）
for z in (10.0, 18.0):
    bpy.ops.mesh.primitive_torus_add(major_radius=ATM_R + 0.7, minor_radius=0.07, location=(ATM_X, ATM_Y, z))
    o = bpy.context.object
    o.name = f"Railing_{int(z)}"
    assign(o, STEEL_DARK)
    for k in range(6):
        import math
        a = k * math.pi / 3
        cyl(f"Post_{int(z)}_{k}", 0.05, 1.0, (ATM_X + math.cos(a) * (ATM_R + 0.7), ATM_Y + math.sin(a) * (ATM_R + 0.7), z + 0.5), seg=8, material=STEEL_DARK)

# 人孔
for z in (12.0, 22.0):
    cyl(f"Manway_{int(z)}", 0.32, 0.3, (ATM_R - 0.02, 0, z), rot=(0, 1.5708, 0), seg=16, material=STEEL_DARK)

# 接管 + 法兰（三个高度，沿塔壁）
for z, ang in ((9.0, 0.35), (16.0, 5.55), (24.0, 2.2)):
    nx = ATM_X + math.cos(ang) * (ATM_R + 0.3)
    ny = ATM_Y + math.sin(ang) * (ATM_R + 0.3)
    cyl(f"Nozzle_{int(z)}", 0.26, 0.72, (nx, ny, z), rot=(0, 1.5708, ang), seg=14, material=STEEL_DARK)
    fx = ATM_X + math.cos(ang) * (ATM_R + 0.66)
    fy = ATM_Y + math.sin(ang) * (ATM_R + 0.66)
    cyl(f"Flange_{int(z)}", 0.4, 0.12, (fx, fy, z), rot=(0, 1.5708, ang), seg=16, material=STEEL_DARK)

# 梯子
box("Ladder", (0.5, 0.12, ATM_H - 2), (ATM_X - ATM_R - 0.35, 0, ATM_BASE + (ATM_H - 2) / 2), STEEL_DARK)


# ---------------------------------------------------------------- 减压塔
VAC_X, VAC_R, VAC_BASE, VAC_H = 7.6, 2.6, 2.0, 15.0
cyl("Tower_Vacuum_Shell", VAC_R, VAC_H, (VAC_X, 0, VAC_BASE + VAC_H / 2))
sphere("Tower_Vacuum_Dome", VAC_R, (VAC_X, 0, VAC_BASE + VAC_H), scale_z=0.35)
cyl("Tower_Vacuum_Skirt", VAC_R + 0.4, 1.6, (VAC_X, 0, 0.8), material=STEEL_DARK)

# 减压塔塔板（含泡罩与降液板）
build_trays("Trays_V", VAC_X, VAC_R - 0.16, [4.2 + i * 1.3 for i in range(9)], caps=6)


# ---------------------------------------------------------------- 加热炉
HEAT_X, HEAT_Y, HEAT_Z = -7.0, 0.0, 4.5
box("Heater", (4.5, 4.5, 5.0), (HEAT_X, HEAT_Y, HEAT_Z), HEATER)
cyl("Heater_Chimney", 0.55, 7.0, (HEAT_X, HEAT_Y, HEAT_Z + 2.5 + 3.5), seg=24, material=STEEL_DARK)

# 加热炉 → 常压塔 进料：先竖直上升，再水平进塔
cyl("Pipe_Feed_Riser", 0.38, 6.0, (HEAT_X, 0, 10.0), seg=20, material=PIPE_HOT)
cyl("Pipe_Feed_Horizontal", 0.38, 4.9, (HEAT_X + 2.45, 0, 13.0), rot=(0, 1.5708, 0), seg=20, material=PIPE_HOT)

# 常压塔底 → 减压塔
cyl("Pipe_Bottom_To_Vacuum", 0.34, 5.6, (ATM_R + (VAC_X - VAC_R - ATM_R) / 2, 0, 3.2), rot=(0, 1.5708, 0), seg=18, material=PIPE_HOT)


# ---------------------------------------------------------------- 侧线 + 侧线汽提/产品出路
# 三路侧线分别进入三台小型汽提塔；塔底产品经管廊到界区法兰。
# 坐标：常压塔 x=0，减压塔 x=7.6；汽提塔放在北侧（Blender +Y，网页 -Z）的空地。
SIDE = [
    ("Naphtha", 21.0, "石脑油", 3.4, 4.8),
    ("Kerosene", 18.4, "煤油", 5.0, 5.9),
    ("Diesel", 15.8, "柴油", 6.6, 7.0),
]
for name, z, cn, sx, sy in SIDE:
    # 塔壁接管 + 法兰
    cyl(f"Nozzle_Side_{name}", 0.22, 0.70, (ATM_R + 0.35, 0, z), rot=(0, math.pi / 2, 0), seg=16, material=STEEL_DARK)
    cyl(f"Flange_Side_{name}", 0.34, 0.12, (ATM_R + 0.72, 0, z), rot=(0, math.pi / 2, 0), seg=16, material=STEEL_DARK)
    # 塔壁 → 北侧管廊 → 汽提塔顶部
    pipe_poly(f"Pipe_Side_{name}", [
        (ATM_R + 0.35, 0, z),
        (ATM_R + 0.35, sy, z),
        (sx, sy, z),
        (sx, sy, 9.0),
    ], r=0.22, material=PIPE_COOL)
    # 高架侧线支撑
    steel_post(f"SideRack_Col_{name}_A", ATM_R + 0.75, sy, 0, z)
    steel_post(f"SideRack_Col_{name}_B", (ATM_R + 0.75 + sx) / 2, sy, 0, z)

    # 小型侧线汽提塔：裙座 + 筒体 + 顶盖
    box(f"Stripper_{name}_Foundation", (1.8, 1.8, 0.30), (sx, sy, 0.15), CONCRETE)
    cyl(f"Stripper_{name}_Skirt", 0.66, 1.0, (sx, sy, 0.75), seg=24, material=STEEL_DARK)
    cyl(f"Stripper_{name}_Shell", 0.55, 8.0, (sx, sy, 5.0), seg=28, material=STEEL)
    sphere(f"Stripper_{name}_Dome", 0.55, (sx, sy, 9.0), scale_z=0.30, material=STEEL)

    # 汽提塔底产品线 → 界区法兰（短管廊，全部落到支撑）
    fy = sy
    pipe_poly(f"Pipe_Rundown_{name}", [
        (sx, fy, 1.0),
        (8.3, fy, 1.0),
    ], r=0.17, material=PIPE_HOT)
    cyl(f"BatteryLimit_{name}", 0.30, 0.16, (8.4, fy, 1.0), rot=(0, math.pi / 2, 0), seg=18, material=STEEL_DARK)
    box(f"BatteryLimit_{name}_Support", (0.30, 0.30, 1.0), (8.4, fy, 0.5), STEEL_DARK)
    box(f"BatteryLimit_{name}_Foot", (0.9, 0.9, 0.16), (8.4, fy, 0.08), CONCRETE)
    for j, px in enumerate((4.2, 6.2, 8.4)):
        steel_post(f"RundownRack_{name}_{j}", px, fy, 0, 1.0, 0.14)

# 塔顶 → 冷凝器
# 塔顶气相线：一根连续立管 + 弯头 + 水平管，直接接到冷凝器。
# 不再保留两段互相错位的短管，避免任何视角下看起来断开。
cyl("Pipe_Top_Vertical", 0.4, 2.85, (ATM_R, 0, 27.425), seg=16, material=PIPE_COOL)
sphere("Pipe_Top_Elbow", 0.46, (ATM_R, 0, 28.85), material=PIPE_COOL)
cyl("Pipe_Top_Condenser", 0.4, 3.6, ((ATM_R + 5.8) / 2, 0, 28.85), rot=(0, 1.5708, 0), seg=16, material=PIPE_COOL)
# 卧式塔顶冷凝器 + 鞍座 + 独立钢框架（不再用悬空方块）
cyl("Condenser_Shell", 0.85, 3.0, (7.0, 0, 28.4), rot=(0, math.pi / 2, 0), seg=28, material=STEEL)
sphere("Condenser_Head_A", 0.86, (5.5, 0, 28.4), scale_z=0.18, material=STEEL_DARK)
sphere("Condenser_Head_B", 0.86, (8.5, 0, 28.4), scale_z=0.18, material=STEEL_DARK)
for i, x in enumerate((6.1, 7.9)):
    box(f"Condenser_Saddle_{i}", (0.55, 1.5, 0.75), (x, 0, 27.7), STEEL_DARK)
    box(f"Condenser_Beam_{i}", (0.22, 3.4, 0.20), (x, 1.7, 27.5), STEEL_DARK)
for i, (x, y) in enumerate(((5.8, 3.4), (8.2, 3.4))):
    steel_post(f"Condenser_Frame_{i}", x, y, 0, 27.5, 0.26)
# 冷凝器框架的纵向主梁，把两根立柱和两根鞍座梁连成整体
box("Condenser_Frame_LongBeam", (2.8, 0.22, 0.22), (7.0, 3.4, 27.5), STEEL_DARK)
# 回流罐：冷凝器下方的小型卧式罐，放在同一框架上
cyl("Reflux_Drum", 0.55, 1.8, (7.0, 0.2, 25.5), rot=(0, math.pi / 2, 0), seg=22, material=STEEL)
sphere("Reflux_Drum_Head_A", 0.56, (6.1, 0.2, 25.5), scale_z=0.15, material=STEEL_DARK)
sphere("Reflux_Drum_Head_B", 0.56, (7.9, 0.2, 25.5), scale_z=0.15, material=STEEL_DARK)
box("Reflux_Drum_Beam", (2.8, 0.22, 0.22), (7.0, 3.4, 25.2), STEEL_DARK)
box("Reflux_Drum_Cantilever_A", (0.20, 3.4, 0.20), (6.3, 1.7, 25.2), STEEL_DARK)
box("Reflux_Drum_Cantilever_B", (0.20, 3.4, 0.20), (7.7, 1.7, 25.2), STEEL_DARK)
box("Reflux_Drum_Saddle_A", (0.45, 1.2, 0.6), (6.3, 0.2, 24.9), STEEL_DARK)
box("Reflux_Drum_Saddle_B", (0.45, 1.2, 0.6), (7.7, 0.2, 24.9), STEEL_DARK)
pipe_poly("Pipe_Condenser_To_Drum", [(7.0, 0, 27.6), (7.0, 0, 26.1)], r=0.20, material=PIPE_COOL)

# 泵
cyl("Pump_1", 0.8, 1.6, (3.4, 2.6, 1.0), rot=(0.0, 0, 0), seg=20, material=STEEL_DARK)
cyl("Pump_2", 0.8, 1.6, (5.2, 2.6, 1.0), seg=20, material=STEEL_DARK)

# ---------------------------------------------------------------- 装置群：换热/泵组/管廊/平台/基础
# 这些是视觉可辨识的成套设备，不改变塔体三状态的语义命名。

# 设备基础
box("Foundation_Atm", (6.2, 6.2, 0.35), (ATM_X, ATM_Y, 0.18), CONCRETE)
box("Foundation_Vac", (6.4, 6.0, 0.35), (VAC_X, 0, 0.18), CONCRETE)
box("Foundation_Heater", (5.4, 5.4, 0.30), (HEAT_X, HEAT_Y, 0.15), CONCRETE)

# 换热器组：三台卧式管壳式换热器 + 鞍座/接管/封头
def exchanger(name, x, y, z, length=5.0, radius=0.82):
    cyl(name + "_Shell", radius, length, (x, y, z), rot=(0, math.pi / 2, 0), seg=24, material=STEEL)
    for dx in (-length * 0.30, length * 0.30):
        box(name + "_Saddle", (0.55, 1.5, 1.05), (x + dx, y, z - 0.95), STEEL_DARK)
    cyl(name + "_Head_A", radius * 1.02, 0.16, (x - length / 2, y, z), rot=(0, math.pi / 2, 0), seg=24, material=STEEL_DARK)
    cyl(name + "_Head_B", radius * 1.02, 0.16, (x + length / 2, y, z), rot=(0, math.pi / 2, 0), seg=24, material=STEEL_DARK)
    cyl(name + "_Nozzle", 0.18, 0.90, (x, y, z + 0.82), seg=12, material=PIPE_COOL)
    cyl(name + "_Nozzle_Out", 0.18, 0.90, (x, y, z - 0.82), seg=12, material=PIPE_COOL)

exchanger("Exchanger_1", -12.5, -3.0, 4.4, 5.2, 0.82)
exchanger("Exchanger_2", -12.5, 3.0, 4.4, 5.2, 0.82)
exchanger("Exchanger_3", -8.5, -3.0, 4.4, 4.2, 0.70)
for i, ex in enumerate(("Exchanger_1", "Exchanger_2", "Exchanger_3")):
    box(ex + "_Base", (5.8 if i < 2 else 4.8, 2.3, 0.28), (-12.5 if i < 2 else -8.5, -3.0 if i != 1 else 3.0, 0.14), CONCRETE)

# 泵组：底座、三台泵、电机、出口管、阀门手轮
box("PumpSkid_Base", (6.4, 3.8, 0.28), (4.2, -6.2, 0.14), CONCRETE)
for i in range(3):
    px = 2.2 + i * 1.8
    cyl("Pump_A_%d_Body" % i, 0.46, 1.35, (px, -6.2, 0.95), rot=(0, math.pi / 2, 0), seg=18, material=STEEL)
    box("Pump_A_%d_Motor" % i, (1.0, 0.75, 0.75), (px + 1.0, -6.2, 0.85), STEEL_DARK)
    cyl("Pump_A_%d_Suction" % i, 0.16, 1.2, (px - 1.05, -6.2, 1.25), rot=(0, math.pi / 2, 0), seg=12, material=PIPE_HOT)
    cyl("Pump_A_%d_Discharge" % i, 0.13, 1.8, (px, -6.2, 2.0), seg=12, material=PIPE_COOL)
    # 阀门手轮：细圆环 + 辐条，远看是手轮而不是圆点
    bpy.ops.mesh.primitive_torus_add(major_radius=0.30, minor_radius=0.035, location=(px, -6.2, 2.75))
    wheel = bpy.context.object
    wheel.name = "Pump_A_%d_ValveWheel" % i
    wheel.rotation_euler[0] = math.pi / 2
    assign(wheel, SAFETY)

# 管廊/管架：三跨立柱 + 两层横梁 + 工艺管线
for i in range(4):
    box("PipeRack_Column_%d" % i, (0.24, 0.24, 6.5), (10.5 + i * 2.2, -9.4, 3.25), STEEL_DARK)
for z in (3.1, 5.6):
    box("PipeRack_Beam_%d" % int(z * 10), (7.2, 0.18, 0.18), (13.8, -9.4, z), STEEL_DARK)
for j, (yy, zz, col) in enumerate((( -9.75, 3.75, PIPE_COOL), (-9.5, 5.0, PIPE_HOT), (-9.2, 5.9, PIPE_COOL))):
    cyl("PipeRack_Pipe_%d" % j, 0.12, 7.0, (13.8, yy, zz), rot=(0, math.pi / 2, 0), seg=12, material=col)

# 常压塔操作平台/格栅/栏杆/直梯；不藏进完整壳体内部
for z in (10.0, 18.0):
    box("Platform_Grate_%d" % int(z), (5.3, 1.55, 0.10), (ATM_X, -3.25, z), STEEL_DARK)
    for sx in (-2.45, 2.45):
        box("Platform_Post_%d_%d" % (int(z), int(sx * 10)), (0.08, 0.08, 1.1), (ATM_X + sx, -3.95, z + 0.55), STEEL_DARK)
    box("Platform_Rail_%d" % int(z), (5.3, 0.07, 0.07), (ATM_X, -3.95, z + 1.05), SAFETY)

# 直梯：真实横档，替代原来的薄板
for i in range(22):
    z = 1.15 + i * 0.82
    box("Ladder_Rung_%d" % i, (0.62, 0.07, 0.055), (ATM_R + 0.42, -3.30, z), STEEL_DARK)
box("Ladder_Rail_L", (0.07, 0.07, 18.0), (ATM_R + 0.75, -3.30, 9.5), STEEL_DARK)
box("Ladder_Rail_R", (0.07, 0.07, 18.0), (ATM_R + 0.10, -3.30, 9.5), STEEL_DARK)

# 塔体保温带（只作外观细节；l4 会在剖切时隐藏）
for z in (7.5, 13.5, 20.5):
    cyl("Insulation_Band_%d" % int(z), ATM_R + 0.035, 0.62, (ATM_X, 0, z), seg=40, material=INSULATION)

# 平台楼梯（简化踏步）
for i in range(10):
    box("Stair_%d" % i, (0.80, 0.24, 0.10), (ATM_R + 1.05, -4.35 + i * 0.17, 0.65 + i * 0.92), STEEL_DARK)

# 地坪网格（细线，便于站住空间感）
bpy.ops.mesh.primitive_plane_add(size=120, location=(0, 0, 0))
GROUND = assign(bpy.context.object, mat("Ground", (0.055, 0.075, 0.09), 0.1, 0.95))
GROUND.name = "Ground"


# 半壳（带壁厚 + 切面封盖，半剖显示用）
HALF = [
    half_shell("Tower_Atmospheric_ShellHalf", ATM_X, ATM_R, ATM_BASE, ATM_BASE + ATM_H),
    half_shell("Tower_Vacuum_ShellHalf", VAC_X, VAC_R, VAC_BASE, VAC_BASE + VAC_H),
    half_dome("Tower_Atmospheric_DomeHalf", ATM_X, ATM_BASE + ATM_H, ATM_R, 0.38),
    half_dome("Tower_Vacuum_DomeHalf", VAC_X, VAC_BASE + VAC_H, VAC_R, 0.35),
]
# ---------------------------------------------------------------- 锚点（网页坐标另存 meta）
ANCHORS = {
    "anchor_tower_overview": (0.0, 0.0, 14.0),
    "anchor_tower_feed": (-4.5, 0.0, 13.0),
    "anchor_tower_trays": (0.0, 0.0, 16.0),
    "anchor_tower_vacuum": (VAC_X, 0.0, 9.0),
    # 产品/界区锚点，Blender 源坐标（Z-up）。网页值由下方 [x, z, -y] 派生为 (8.4, 1.0, -5.9)。
    # 依据：OBJ 中 BatteryLimit_* 9 个对象的实际包围盒为 x∈[7.95, 8.85]、y∈[0, 1.30]、z∈[-7.45, -4.35]，
    # 中心 (8.4, 0.65, -5.9)；锚点取 (8.4, 1.0, -5.9) 落在界区法兰高度上。
    # 历史问题：该值曾被写成 (8.4, 6.0, -5.9)，使网页锚点抬高约 5 m，重跑后更会变成 (8.4, -5.9, -6.0) 落到地面以下。
    "anchor_tower_products": (8.4, 5.9, 1.0),
}
for k, v in ANCHORS.items():
    empty(k, v)


# ---------------------------------------------------------------- 保存可编辑源
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BLEND_DIR = os.path.join(ROOT, "assets-source", "blender")
os.makedirs(BLEND_DIR, exist_ok=True)
blend_path = os.path.join(BLEND_DIR, "tower_hero.blend")
bpy.ops.wm.save_as_mainfile(filepath=blend_path)
print("[ok] blend:", blend_path, os.path.getsize(blend_path) if os.path.exists(blend_path) else "MISSING")

# ---------------------------------------------------------------- 导出
obj_path = os.path.join(OUT, "tower.obj")
bpy.ops.object.select_all(action="SELECT")
bpy.ops.wm.obj_export(
    filepath=obj_path,
    export_materials=True,
    export_normals=True,
    export_uv=True,
    apply_modifiers=True,
    forward_axis="NEGATIVE_Z",
    up_axis="Y",
)

glb_path = os.path.join(OUT, "tower.glb")
bpy.ops.export_scene.gltf(filepath=glb_path, export_format="GLB", use_selection=False)


# ---------------------------------------------------------------- 自检：Heater 在 OBJ 里的包围盒
def obj_bbox(path, group_name):
    xs, ys, zs = [], [], []
    cur = None
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if line.startswith("o "):
                cur = line.split(None, 1)[1].strip()
            elif line.startswith("v ") and cur and cur.startswith(group_name):
                _, x, y, z = line.split()[:4]
                xs.append(float(x)); ys.append(float(y)); zs.append(float(z))
    if not xs:
        return None
    return [min(xs), min(ys), min(zs), max(xs), max(ys), max(zs)]


heater_o = obj_bbox(obj_path, "Heater")
# Blender 里 Heater 中心 (-7, 0, 4.5)，尺寸 4.5/4.5/5 → Z 2..7
meta = {
    "model": "常减压蒸馏装置（程序化示意）",
    "units": "meter-ish，示意比例",
    "coordinate_system": "Y-up，与 THREE 默认一致",
    "anchor_blender_z_up": ANCHORS,
    "anchor_web_y_up": {k: [v[0], v[2], -v[1]] for k, v in ANCHORS.items()},
    "heater_bbox_obj_y_up": heater_o,
    "groups": {
        "cutaway_hide": ["Tower_Atmospheric_Shell", "Tower_Atmospheric_Dome"],
        "cutaway_show_only": ["Trays_A", "Trays_V"],
        "hotspots": {
            "hs_crude_feed": "Pipe_Feed_Horizontal",
            "hs_heater": "Heater",
            "hs_atm_tower": "Tower_Atmospheric_Shell",
            "hs_vacuum": "Tower_Vacuum_Shell",
            "hs_products": "BatteryLimit_",
        },
    },
}
with open(os.path.join(OUT, "tower.meta.json"), "w", encoding="utf-8") as f:
    json.dump(meta, f, ensure_ascii=False, indent=2)

print("[ok] OBJ  :", obj_path, os.path.getsize(obj_path), "bytes")
print("[ok] GLB  :", glb_path, os.path.getsize(glb_path), "bytes")
print("[ok] heater bbox (Y-up):", heater_o)
print("[ok] anchors (Y-up):", meta["anchor_web_y_up"])


# ---------------------------------------------------------------- 渲染（Workbench，headless 稳）
def setup_render():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1200
    scene.render.film_transparent = False
    d = scene.display.shading
    d.light = "STUDIO"
    d.color_type = "MATERIAL"
    d.show_shadows = True
    d.show_cavity = True
    d.cavity_type = "BOTH"
    d.background_type = "VIEWPORT"
    d.background_color = (0.04, 0.07, 0.09)
    world = bpy.data.worlds.new("W")
    scene.world = world
    world.color = (0.03, 0.05, 0.06)


def add_camera(loc, look_at):
    bpy.ops.object.camera_add(location=loc)
    cam = bpy.context.object
    direction = Vector(look_at) - Vector(loc)
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = 50
    bpy.context.scene.camera = cam
    return cam


def render_to(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("[ok] render:", path, os.path.getsize(path) if os.path.exists(path) else "MISSING")


try:
    setup_render()
    for o in HALF:
        o.hide_render = True
    add_camera((-40.0, -54.0, 36.0), (1.0, 0.0, 12.5))
    render_to(os.path.join(OUT, "render-overview.png"))

    # 剖切渲染：隐藏整壳，显示半壳
    for n in ("Tower_Atmospheric_Shell", "Tower_Atmospheric_Dome", "Tower_Vacuum_Shell", "Tower_Vacuum_Dome"):
        o = bpy.data.objects.get(n)
        if o:
            o.hide_render = True
    for o in HALF:
        o.hide_render = False

    add_camera((-42.0, -54.0, 34.0), (0.8, 0.0, 13.0))
    render_to(os.path.join(OUT, "render-cutaway.png"))
except Exception as e:  # 渲染失败不影响导出
    print("[warn] 渲染失败：", e)

print("[done]")
