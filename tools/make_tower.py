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


# ---------------------------------------------------------------- 侧线 + 馏分去向
SIDE = [
    ("Naphtha", 21.0, "石脑油"),
    ("Kerosene", 18.4, "煤油"),
    ("Diesel", 15.8, "柴油"),
    ("GasOil", 13.2, "常压渣油"),
]
for name, z, cn in SIDE:
    cyl(f"Pipe_Side_{name}", 0.22, 6.6, (ATM_R + 3.3, 0, z), rot=(0, 1.5708, 0), seg=14, material=PIPE_COOL)
    box(f"Box_{name}", (1.6, 1.6, 1.2), (ATM_R + 7.3, 0, z - 0.3), BOX)

# 塔顶 → 冷凝器
cyl("Pipe_Top_Vapor", 0.4, 1.9, (ATM_R + 0.95, 0, 27.4), rot=(0, 1.5708, 0), seg=16, material=PIPE_COOL)
cyl("Pipe_Top_Vertical", 0.4, 2.0, (ATM_R, 0, 27.0), seg=16, material=PIPE_COOL)
box("Condenser", (2.4, 3.0, 1.8), (VAC_X - 0.6, 0, 28.3), STEEL)

# 泵
cyl("Pump_1", 0.8, 1.6, (3.4, 2.6, 1.0), rot=(0.0, 0, 0), seg=20, material=STEEL_DARK)
cyl("Pump_2", 0.8, 1.6, (5.2, 2.6, 1.0), seg=20, material=STEEL_DARK)

# 地坪网格（细线，便于站住空间感）
bpy.ops.mesh.primitive_plane_add(size=120, location=(0, 0, 0))
GROUND = assign(bpy.context.object, mat("Ground", (0.055, 0.075, 0.09), 0.1, 0.95))
GROUND.name = "Ground"


# 半壳（带壁厚 + 切面封盖，半剖显示用）
HALF = [
    half_shell("Tower_Atmospheric_ShellHalf", ATM_X, ATM_R, ATM_BASE, ATM_BASE + ATM_H),
    half_shell("Tower_Vacuum_ShellHalf", VAC_X, VAC_R, VAC_BASE, VAC_BASE + VAC_H),
]
# ---------------------------------------------------------------- 锚点（网页坐标另存 meta）
ANCHORS = {
    "anchor_tower_overview": (0.0, 0.0, 14.0),
    "anchor_tower_feed": (-4.5, 0.0, 13.0),
    "anchor_tower_trays": (0.0, 0.0, 16.0),
    "anchor_tower_vacuum": (VAC_X, 0.0, 9.0),
    "anchor_tower_products": (ATM_R + 7.3, 0.0, 17.0),
}
for k, v in ANCHORS.items():
    empty(k, v)


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
        "cutaway_show_only": ["Tray_", "VacTray_"],
        "hotspots": {
            "hs_crude_feed": "Pipe_Feed_Horizontal",
            "hs_heater": "Heater",
            "hs_atm_tower": "Tower_Atmospheric_Shell",
            "hs_vacuum": "Tower_Vacuum_Shell",
            "hs_products": "Box_",
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
