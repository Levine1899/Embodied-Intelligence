"""Hero asset batch for the oil-industry sandbox (Blender 4.5, headless).

Five assets, each merged by material for low draw-call OBJ use:
  separator, pumpjack, wellhead, floating_roof_tank, heater

Run:
  blender -b -P tools/make_hero_assets.py -- [--render]

Outputs under web/assets/hero/<id>/:
  <id>.obj / <id>.mtl / <id>.meta.json / <id>.stats.json / preview.png (optional)

This is teaching-grade medium detail, not engineering-grade digital twin.
"""
import json
import math
import os
import sys

import bpy
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_ROOT = os.path.join(ROOT, "web", "assets", "hero")
RENDER = "--render" in sys.argv

# ------------------------------------------------------------------ helpers
def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    return scene


def material(name, color, metallic=0.85, roughness=0.42):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


def finish(obj, mat, name):
    obj.name = name
    obj.data.materials.append(mat)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


def cyl(name, mat, radius, depth, loc, rot=(0, 0, 0), verts=32, smooth=True):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    if smooth:
        for poly in obj.data.polygons:
            poly.use_smooth = True
    return obj


def box(name, mat, size, loc, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    obj.scale = size
    obj.data.materials.append(mat)
    return obj


def sphere(name, mat, radius, loc, scale=(1, 1, 1), seg=32, ring=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=ring, radius=radius, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    obj.data.materials.append(mat)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


def torus(name, mat, major, minor, loc, rot=(0, 0, 0), major_seg=32, minor_seg=10):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, location=loc, rotation=rot,
                                     major_segments=major_seg, minor_segments=minor_seg)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


def rod_between(name, mat, p1, p2, radius=0.06, verts=16):
    """Cylinder connecting two points (world space)."""
    p1 = Vector(p1)
    p2 = Vector(p2)
    mid = (p1 + p2) / 2
    direction = p2 - p1
    length = direction.length
    if length < 1e-5:
        return None
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=length, location=mid)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    obj.data.materials.append(mat)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


def arc_plate(name, mat, radius, depth, thickness, start_deg, end_deg, loc, steps=16):
    """Curved plate in the XZ plane, extruded along Y (horsehead shape)."""
    verts = []
    faces = []
    a0 = math.radians(start_deg)
    a1 = math.radians(end_deg)
    for i in range(steps + 1):
        a = a0 + (a1 - a0) * i / steps
        x = math.cos(a) * radius
        z = math.sin(a) * radius
        for dy in (-depth / 2, depth / 2):
            for dr in (0, thickness):
                verts.append((x * (1 + dr / radius), dy, z * (1 + dr / radius)))
    for i in range(steps):
        b = i * 4
        n = (i + 1) * 4
        faces.append((b + 0, n + 0, n + 2, b + 2))
        faces.append((b + 1, b + 3, n + 3, n + 1))
        faces.append((b + 2, n + 2, n + 3, b + 3))
        faces.append((b + 0, b + 1, n + 1, n + 0))
    faces.append((0, 2, 3, 1))
    faces.append((steps * 4, steps * 4 + 1, steps * 4 + 3, steps * 4 + 2))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    obj.data.materials.append(mat)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


def join_by_material(asset_id):
    groups = {}
    for obj in [o for o in bpy.context.scene.objects if o.type == "MESH"]:
        key = obj.data.materials[0].name if obj.data.materials else "Unassigned"
        groups.setdefault(key, []).append(obj)
    merged = []
    for mat_name, objects in groups.items():
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        if len(objects) > 1:
            bpy.ops.object.join()
        joined = bpy.context.object
        joined.name = "%s__%s" % (asset_id, mat_name)
        merged.append(joined)
    # apply transforms so OBJ export has clean coordinates
    bpy.ops.object.select_all(action="SELECT")
    bpy.context.view_layer.objects.active = merged[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return merged


def asset_stats(asset_id, anchors, budget):
    triangles = 0
    vertices = 0
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    for obj in meshes:
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
        vertices += len(obj.data.vertices)
    xs = []
    ys = []
    zs = []
    for obj in meshes:
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            xs.append(world.x)
            ys.append(world.y)
            zs.append(world.z)
    size = [round(max(xs) - min(xs), 3), round(max(ys) - min(ys), 3), round(max(zs) - min(zs), 3)]
    return {
        "asset": asset_id,
        "triangles": triangles,
        "vertices": vertices,
        "meshes": len(meshes),
        "materials": len(set(o.data.materials[0].name for o in meshes if o.data.materials)),
        "size_m": {"x": size[0], "y": size[1], "z": size[2]},
        "anchors": anchors,
        "budget": budget,
        "units": "meters",
        "up_axis_after_export": "Y",
        "note": "Teaching-grade medium detail; not an engineering model."
    }


def export_asset(asset_id, anchors, budget, preview_camera=None):
    out = os.path.join(OUT_ROOT, asset_id)
    os.makedirs(out, exist_ok=True)
    obj_path = os.path.join(out, "%s.obj" % asset_id)
    bpy.ops.wm.obj_export(filepath=obj_path, export_materials=True, apply_modifiers=True,
                          forward_axis="NEGATIVE_Z", up_axis="Y")
    stats = asset_stats(asset_id, anchors, budget)
    stats["files"] = {"obj_bytes": os.path.getsize(obj_path)}
    mtl_path = os.path.join(out, "%s.mtl" % asset_id)
    if os.path.exists(mtl_path):
        stats["files"]["mtl_bytes"] = os.path.getsize(mtl_path)
    with open(os.path.join(out, "%s.meta.json" % asset_id), "w", encoding="utf-8") as fh:
        json.dump(stats, fh, ensure_ascii=False, indent=2)
    with open(os.path.join(out, "%s.stats.json" % asset_id), "w", encoding="utf-8") as fh:
        json.dump(stats, fh, ensure_ascii=False, indent=2)
    print("@@HERO@@ %s tris=%d meshes=%d size=%s" % (asset_id, stats["triangles"], stats["meshes"], stats["size_m"]))
    return stats


def setup_preview(asset_id, max_dim):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 32
    scene.cycles.use_denoising = True
    scene.cycles.device = "CPU"
    scene.render.resolution_x = 640
    scene.render.resolution_y = 480
    scene.render.film_transparent = False
    world = bpy.data.worlds.new("PreviewWorld")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.03, 0.035, 0.035, 1)
    scene.world = world

    bpy.ops.mesh.primitive_plane_add(size=max_dim * 6, location=(0, 0, 0))
    floor = bpy.context.object
    floor.data.materials.append(material("PreviewFloor", (0.10, 0.10, 0.09), 0.0, 0.9))

    def area(name, loc, energy, size):
        light = bpy.data.lights.new(name, type="AREA")
        light.energy = energy
        light.size = size
        obj = bpy.data.objects.new(name, light)
        bpy.context.collection.objects.link(obj)
        obj.location = loc
        direction = Vector((0, 0, max_dim * 0.35)) - obj.location
        obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        return obj

    area("Key", (max_dim * 1.1, -max_dim * 1.3, max_dim * 1.4), 30 * max_dim * max_dim, max_dim * 2)
    area("Fill", (-max_dim * 1.5, -max_dim * 0.6, max_dim * 0.8), 12 * max_dim * max_dim, max_dim * 2)
    area("Rim", (0, max_dim * 1.7, max_dim * 1.1), 16 * max_dim * max_dim, max_dim * 1.6)

    cam_data = bpy.data.cameras.new("PreviewCam")
    cam_data.lens = 50
    cam = bpy.data.objects.new("PreviewCam", cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = (max_dim * 1.55, -max_dim * 1.75, max_dim * 1.05)
    target = Vector((0, 0, max_dim * 0.38))
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    scene.render.filepath = os.path.join(OUT_ROOT, asset_id, "preview.png")
    bpy.ops.render.render(write_still=True)


# ------------------------------------------------------------------ assets
def build_separator():
    reset_scene()
    steel = material("Steel", (0.62, 0.60, 0.55), 0.9, 0.38)
    light = material("LightSteel", (0.80, 0.78, 0.72), 0.85, 0.34)
    dark = material("DarkSteel", (0.22, 0.21, 0.19), 0.8, 0.5)
    amber = material("Amber", (0.85, 0.63, 0.29), 0.6, 0.4)
    gauge = material("Gauge", (0.9, 0.9, 0.85), 0.2, 0.3)

    cyl("shell", steel, 1.05, 4.2, (0, 0, 1.35), rot=(0, math.pi / 2, 0), verts=48)
    for sign in (-1, 1):
        sphere("head_%s" % sign, light, 1.05, (sign * 2.1, 0, 1.35), scale=(0.34, 1, 1), seg=48, ring=24)
    for sign in (-1, 1):
        x = sign * 1.45
        box("saddle_%s" % sign, dark, (0.56, 2.5, 1.2), (x, 0, 0.60))
        box("base_%s" % sign, dark, (1.1, 3.1, 0.24), (x, 0, 0.12))
    cyl("gas_nozzle", steel, 0.20, 0.55, (0, 0, 2.55), verts=24)
    cyl("gas_flange", steel, 0.31, 0.08, (0, 0, 2.84), verts=24)
    cyl("water_nozzle", steel, 0.18, 0.45, (0, 0, 0.15), verts=24)
    cyl("inlet", amber, 0.24, 0.55, (-2.55, 0, 1.35), rot=(0, math.pi / 2, 0), verts=24)
    cyl("inlet_flange", amber, 0.37, 0.08, (-2.83, 0, 1.35), rot=(0, math.pi / 2, 0), verts=24)
    cyl("outlet", amber, 0.20, 0.55, (2.55, 0, 1.10), rot=(0, math.pi / 2, 0), verts=24)
    cyl("outlet_flange", amber, 0.31, 0.08, (2.83, 0, 1.10), rot=(0, math.pi / 2, 0), verts=24)
    cyl("manway", light, 0.34, 0.12, (1.0, 0, 2.24), rot=(math.pi / 2, 0, 0), verts=28)
    torus("manway_ring", dark, 0.34, 0.035, (1.0, 0.02, 2.24), rot=(math.pi / 2, 0, 0))
    cyl("gauge", gauge, 0.13, 0.06, (-1.2, 0, 2.42), rot=(math.pi / 2, 0, 0), verts=24)
    torus("gauge_ring", dark, 0.14, 0.02, (-1.2, 0.02, 2.42), rot=(math.pi / 2, 0, 0))
    for x, z, tag in ((0.0, 2.90, "gas"), (-2.55, 1.65, "inlet")):
        torus("wheel_%s" % tag, amber, 0.18, 0.025, (x, 0, z), rot=(math.pi / 2, 0, 0))
    for i in range(5):
        cyl("rung_%02d" % i, dark, 0.025, 0.7, (-1.9, 0, 0.55 + i * 0.34), rot=(math.pi / 2, 0, 0), verts=10)

    join_by_material("separator")
    anchors = [
        {"id": "inlet", "name": "原油进口", "pos": [-2.83, 0, 1.35]},
        {"id": "outlet", "name": "油出口", "pos": [2.83, 0, 1.10]},
        {"id": "gas", "name": "气出口", "pos": [0, 0, 2.9]},
        {"id": "water", "name": "水出口", "pos": [0, 0, 0.15]}
    ]
    return export_asset("separator", anchors, {"triangles": 12000, "drawCalls": 8}), 3.0


def build_pumpjack():
    reset_scene()
    steel = material("Steel", (0.62, 0.60, 0.55), 0.9, 0.38)
    light = material("LightSteel", (0.80, 0.78, 0.72), 0.85, 0.34)
    dark = material("DarkSteel", (0.22, 0.21, 0.19), 0.8, 0.5)
    amber = material("Amber", (0.85, 0.63, 0.29), 0.6, 0.4)

    # base skid
    box("skid", dark, (5.0, 2.6, 0.28), (0, 0, 0.14))
    box("skid_beam_a", dark, (4.6, 0.22, 0.34), (0, -0.95, 0.48))
    box("skid_beam_b", dark, (4.6, 0.22, 0.34), (0, 0.95, 0.48))

    # A-frame: two legs per side, from skid to the beam pivot
    pivot = (-0.2, 0.0, 3.6)
    for sx in (-1.15, 0.55):
        for sy in (-1.0, 1.0):
            rod_between("leg_%.2f_%.1f" % (sx, sy), steel, (sx, sy, 0.3), (pivot[0], sy * 0.45, pivot[2] - 0.25), 0.09, 14)
    box("pivot_cross", steel, (0.3, 2.1, 0.3), (pivot[0], 0, pivot[2] - 0.2))
    # Samson post at the rear
    rod_between("samson_post", steel, (-2.3, 0, 0.4), (-1.55, 0, 3.15), 0.16, 18)
    rod_between("samson_brace", steel, (-1.55, 0, 3.15), (-2.5, 0, 1.6), 0.08, 12)

    # walking beam (slightly inclined) and horsehead at the front
    beam_z = 3.42
    box("beam", light, (3.6, 0.34, 0.34), (0.0, 0, beam_z + 0.1), rot=(0, math.radians(-2.5), 0))
    box("beam_rear", steel, (0.6, 0.5, 0.5), (-1.55, 0, beam_z + 0.02))
    # horsehead: curved plate at the beam front, opening downward
    arc_plate("horsehead", light, 0.95, 0.42, 0.12, -80, 80, (1.9, 0, beam_z + 0.02))
    box("horsehead_mount", steel, (0.5, 0.46, 0.6), (1.9, 0, beam_z))
    box("horsehead_back", steel, (0.14, 0.46, 1.95), (2.02, 0, beam_z))
    # bridle + polished rod down to the wellhead area
    rod_between("bridle", dark, (2.5, 0, beam_z - 0.5), (2.5, 0, 1.05), 0.03, 8)
    box("carrier_bar", steel, (0.7, 0.25, 0.12), (2.55, 0, 1.0))

    # crank + counterweights at the rear
    cyl("crank_axle", steel, 0.20, 1.8, (-2.35, 0, 2.0), rot=(math.pi / 2, 0, 0), verts=24)
    for sy in (-0.75, 0.75):
        box("crank_web_%.1f" % sy, steel, (1.1, 0.18, 0.45), (-2.35, sy, 2.0))
        box("counterweight_%.1f" % sy, dark, (0.95, 0.36, 1.05), (-2.85, sy, 2.0))
        cyl("crank_pin_%.1f" % sy, amber, 0.08, 0.2, (-2.0, sy, 2.0), rot=(math.pi / 2, 0, 0), verts=12)
    # gearbox + motor
    box("gearbox", dark, (1.2, 1.1, 1.0), (-2.7, 0, 1.0))
    cyl("motor", steel, 0.38, 1.1, (-3.55, 0, 0.85), rot=(0, math.pi / 2, 0), verts=24)
    cyl("motor_fan", dark, 0.4, 0.14, (-4.12, 0, 0.85), rot=(0, math.pi / 2, 0), verts=18)
    box("walkway", amber, (2.6, 0.55, 0.08), (0.2, 1.35, 1.0))
    for i in range(9):
        rod_between("walk_rail_%02d" % i, dark, (-0.9 + i * 0.32, 1.62, 1.0), (-0.9 + i * 0.32, 1.62, 1.7), 0.02, 6)
    rod_between("walk_top", dark, (-0.9, 1.62, 1.7), (1.6, 1.62, 1.7), 0.025, 8)

    join_by_material("pumpjack")
    anchors = [
        {"id": "horsehead", "name": "驴头", "pos": [2.7, 0, 3.45]},
        {"id": "beam", "name": "游梁", "pos": [0.3, 0, 3.5]},
        {"id": "crank", "name": "曲柄", "pos": [-2.35, 0, 2.0]},
        {"id": "motor", "name": "电机", "pos": [-3.55, 0, 0.85]}
    ]
    return export_asset("pumpjack", anchors, {"triangles": 10000, "drawCalls": 6}), 5.5


def build_wellhead():
    reset_scene()
    steel = material("Steel", (0.62, 0.60, 0.55), 0.9, 0.38)
    light = material("LightSteel", (0.80, 0.78, 0.72), 0.85, 0.34)
    dark = material("DarkSteel", (0.22, 0.21, 0.19), 0.8, 0.5)
    amber = material("Amber", (0.85, 0.63, 0.29), 0.6, 0.4)

    cyl("base_flange", dark, 0.62, 0.18, (0, 0, 0.09), verts=32)
    cyl("casing_head", steel, 0.42, 0.75, (0, 0, 0.55), verts=32)
    cyl("master_valve", light, 0.30, 0.55, (0, 0, 1.15), verts=28)
    for z in (0.95, 1.45):
        cyl("master_flange_%.2f" % z, steel, 0.42, 0.10, (0, 0, z), verts=32)
    cyl("spool", steel, 0.24, 0.55, (0, 0, 1.75), verts=28)
    cyl("top_flange", steel, 0.36, 0.12, (0, 0, 2.05), verts=32)
    # wing valves left/right
    for sign in (-1, 1):
        x = sign * 1.0
        cyl("wing_%s" % sign, light, 0.20, 1.1, (sign * 0.55, 0, 1.35), rot=(0, math.pi / 2, 0), verts=24)
        cyl("wing_flange_%s" % sign, steel, 0.30, 0.10, (x, 0, 1.35), rot=(0, math.pi / 2, 0), verts=24)
        torus("wing_wheel_%s" % sign, amber, 0.17, 0.025, (x + sign * 0.06, 0, 1.35), rot=(0, math.pi / 2, 0))
        cyl("wing_stem_%s" % sign, amber, 0.03, 0.24, (x + sign * 0.08, 0, 1.35), rot=(0, math.pi / 2, 0), verts=10)
    # pressure gauge
    cyl("gauge_stem", steel, 0.04, 0.4, (-0.35, 0, 1.95), verts=10)
    cyl("gauge", light, 0.13, 0.06, (-0.35, 0.22, 2.05), rot=(math.pi / 2, 0, 0), verts=20)
    torus("gauge_ring", amber, 0.14, 0.02, (-0.35, 0.25, 2.05), rot=(math.pi / 2, 0, 0))
    # handwheel on master
    torus("master_wheel", amber, 0.22, 0.03, (0, -0.36, 1.15), rot=(math.pi / 2, 0, 0))

    join_by_material("wellhead")
    anchors = [
        {"id": "top", "name": "井口顶部", "pos": [0, 0, 2.1]},
        {"id": "wing", "name": "翼阀", "pos": [1.1, 0, 1.35]}
    ]
    return export_asset("wellhead", anchors, {"triangles": 8000, "drawCalls": 6}), 2.5


def build_floating_tank():
    reset_scene()
    steel = material("Steel", (0.62, 0.60, 0.55), 0.9, 0.38)
    light = material("LightSteel", (0.80, 0.78, 0.72), 0.85, 0.34)
    dark = material("DarkSteel", (0.22, 0.21, 0.19), 0.8, 0.5)
    amber = material("Amber", (0.85, 0.63, 0.29), 0.6, 0.4)

    R, H = 5.0, 6.0
    cyl("shell", steel, R, H, (0, 0, H / 2), verts=64)
    cyl("bottom", dark, R + 0.1, 0.12, (0, 0, 0.06), verts=64)
    torus("wind_girder", steel, R + 0.06, 0.12, (0, 0, H * 0.92), major_seg=64)
    torus("rim", amber, R + 0.02, 0.05, (0, 0, H + 0.02), major_seg=64)
    # floating deck near mid-height
    deck_z = H * 0.45
    cyl("deck", light, R - 0.18, 0.16, (0, 0, deck_z), verts=64)
    torus("seal", amber, R - 0.16, 0.10, (0, 0, deck_z + 0.02), major_seg=64)
    for i in range(8):
        a = i / 8 * math.pi * 2
        cyl("guide_%d" % i, dark, 0.04, H, (math.cos(a) * (R - 0.45), math.sin(a) * (R - 0.45), H / 2), verts=8)
    # roof platform + ladder on the shell
    box("platform", dark, (1.6, 1.6, 0.08), (R - 0.4, 0, H + 0.4))
    for i in range(8):
        cyl("ladder_%02d" % i, dark, 0.03, 0.5, (R + 0.15, 0, 0.6 + i * 0.75), rot=(math.pi / 2, 0, 0), verts=8)
        cyl("ladder_side_%02d" % i, dark, 0.025, 0.7, (R + 0.15, -0.25, 0.6 + i * 0.75), verts=6)
    # inlet / outlet
    cyl("inlet", amber, 0.24, 0.8, (R + 0.35, 0, 1.2), rot=(0, math.pi / 2, 0), verts=24)
    cyl("outlet", amber, 0.24, 0.8, (R + 0.35, 0, 0.7), rot=(0, math.pi / 2, 0), verts=24)
    # bund wall (teaching signal, low)
    for sign in (-1, 1):
        box("bund_%s" % sign, dark, (0.3, 12.0, 0.5), (sign * 6.6, 0, 0.25))
        box("bund_%s_z" % sign, dark, (13.5, 0.3, 0.5), (0, sign * 6.6, 0.25))

    join_by_material("floating_roof_tank")
    anchors = [
        {"id": "deck", "name": "浮盘", "pos": [0, 0, H * 0.45]},
        {"id": "rim", "name": "罐顶边缘", "pos": [0, 0, H]},
        {"id": "inlet", "name": "进口", "pos": [R + 0.7, 0, 1.2]}
    ]
    return export_asset("floating_roof_tank", anchors, {"triangles": 10000, "drawCalls": 6}), 9.0


def build_heater():
    reset_scene()
    steel = material("Steel", (0.62, 0.60, 0.55), 0.9, 0.38)
    light = material("LightSteel", (0.80, 0.78, 0.72), 0.85, 0.34)
    dark = material("DarkSteel", (0.22, 0.21, 0.19), 0.8, 0.5)
    amber = material("Amber", (0.85, 0.63, 0.29), 0.6, 0.4)

    box("cabin", steel, (4.2, 3.2, 3.0), (0, 0, 1.5))
    box("roof", light, (4.4, 3.4, 0.2), (0, 0, 3.1))
    cyl("stack", dark, 0.42, 6.0, (1.2, 0, 6.0), verts=28)
    cyl("stack_cap", steel, 0.55, 0.12, (1.2, 0, 9.05), verts=28)
    # burner
    box("burner", dark, (0.9, 0.9, 0.5), (-1.8, 0, 1.4))
    cyl("fuel_line", amber, 0.10, 1.4, (-2.7, 0, 0.7), rot=(0, math.pi / 2, 0), verts=18)
    # tubes on the outside of the cabin front (visible teaching abstraction)
    for i in range(4):
        z = 1.15 + i * 0.55
        cyl("tube_%d" % i, amber, 0.09, 3.6, (0, -1.72, z), rot=(0, math.pi / 2, 0), verts=14)
        cyl("tube_elbow_%d" % i, amber, 0.09, 0.9, (1.8, -1.72, z), rot=(math.pi / 2, 0, 0), verts=14)
        cyl("tube_return_%d" % i, amber, 0.09, 0.9, (-1.8, -1.72, z), rot=(math.pi / 2, 0, 0), verts=14)
    # corner posts / frame so the cabin reads as a furnace, not a plain box
    for sx in (-2.05, 2.05):
        for sy in (-1.55, 1.55):
            box("frame_post_%.0f_%.0f" % (sx, sy), dark, (0.18, 0.18, 3.0), (sx, sy, 1.5))
    box("frame_top", dark, (4.3, 3.3, 0.16), (0, 0, 3.02))
    # inlet/outlet headers
    cyl("inlet_header", steel, 0.24, 1.2, (-2.3, 0, 1.0), rot=(0, math.pi / 2, 0), verts=20)
    cyl("outlet_header", steel, 0.24, 1.2, (2.3, 0, 1.0), rot=(0, math.pi / 2, 0), verts=20)
    # access platform + ladder
    box("platform", dark, (1.4, 1.2, 0.08), (0, -1.9, 3.25))
    for i in range(7):
        cyl("rung_%02d" % i, dark, 0.025, 0.5, (-1.4, -2.1, 0.6 + i * 0.42), rot=(0, math.pi / 2, 0), verts=8)

    join_by_material("heater")
    anchors = [
        {"id": "stack", "name": "烟囱", "pos": [1.2, 0, 9.0]},
        {"id": "outlet", "name": "出口", "pos": [2.3, 0, 1.0]},
        {"id": "burner", "name": "燃烧器", "pos": [-1.8, 0, 1.4]}
    ]
    return export_asset("heater", anchors, {"triangles": 8000, "drawCalls": 6}), 10.0


# ------------------------------------------------------------------ main
def main():
    os.makedirs(OUT_ROOT, exist_ok=True)
    builders = [
        ("separator", build_separator),
        ("pumpjack", build_pumpjack),
        ("wellhead", build_wellhead),
        ("floating_roof_tank", build_floating_tank),
        ("heater", build_heater),
    ]
    summary = []
    for asset_id, builder in builders:
        stats, max_dim = builder()
        summary.append(stats)
        if RENDER:
            setup_preview(asset_id, max_dim)
    print("@@HERO_SUMMARY@@" + json.dumps(summary, ensure_ascii=False))
    with open(os.path.join(OUT_ROOT, "index.json"), "w", encoding="utf-8") as fh:
        json.dump(summary, fh, ensure_ascii=False, indent=2)


main()
