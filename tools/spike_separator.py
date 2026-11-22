"""Spike asset: three-phase separator (Blender 4.5, headless).

Run:
  blender -b -P tools/spike_separator.py

Outputs:
  web/assets/spike/separator.glb
  web/assets/spike/separator.obj / .mtl
  web/assets/spike/separator.stats.json
  web/assets/spike/separator.blend

This is a proof-of-concept asset for the GLB pipeline, not final art.
"""
import json
import math
import os
import sys

import bpy
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "web", "assets", "spike")
os.makedirs(OUT, exist_ok=True)

# ---------------------------------------------------------------- clean scene
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = "METRIC"


def material(name, color, metallic=0.85, roughness=0.42):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


STEEL = material("Steel", (0.62, 0.60, 0.55), 0.9, 0.38)
LIGHT = material("LightSteel", (0.80, 0.78, 0.72), 0.85, 0.34)
DARK = material("DarkSteel", (0.22, 0.21, 0.19), 0.8, 0.5)
AMBER = material("Amber", (0.85, 0.63, 0.29), 0.6, 0.4)
GAUGE = material("Gauge", (0.9, 0.9, 0.85), 0.2, 0.3)


def add_material(obj, mat):
    obj.data.materials.append(mat)


def smooth(obj):
    for poly in obj.data.polygons:
        poly.use_smooth = True


# ---------------------------------------------------------------- shell
bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=1.05, depth=4.2,
                                    location=(0, 0, 1.35), rotation=(0, math.pi / 2, 0))
shell = bpy.context.object
shell.name = "Separator_Shell"
add_material(shell, STEEL)
smooth(shell)

# heads (ellipsoidal, scaled spheres)
for sign in (-1, 1):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=1.05,
                                         location=(sign * 2.1, 0, 1.35))
    head = bpy.context.object
    head.name = "Separator_Head_%s" % ("W" if sign < 0 else "E")
    head.scale = (0.42, 1.0, 1.0)
    add_material(head, LIGHT)
    smooth(head)

# ---------------------------------------------------------------- saddles
for sign in (-1, 1):
    x = sign * 1.45
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, 0, 0.30))
    saddle = bpy.context.object
    saddle.name = "Separator_Saddle_%s" % ("W" if sign < 0 else "E")
    saddle.scale = (0.28, 1.25, 0.60)
    add_material(saddle, DARK)

    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, 0, 0.06))
    pad = bpy.context.object
    pad.name = "Separator_BasePlate_%s" % ("W" if sign < 0 else "E")
    pad.scale = (0.55, 1.55, 0.12)
    add_material(pad, DARK)

# ---------------------------------------------------------------- nozzles
def nozzle(name, x, y, z, radius, length, axis, mat=STEEL):
    rot = (0, 0, 0)
    if axis == "x":
        rot = (0, math.pi / 2, 0)
    elif axis == "y":
        rot = (math.pi / 2, 0, 0)
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=radius, depth=length,
                                        location=(x, y, z), rotation=rot)
    obj = bpy.context.object
    obj.name = name
    add_material(obj, mat)
    # flange
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=radius * 1.55, depth=0.08,
                                        location=(x, y, z + (length / 2 if axis == "z" else 0)), rotation=rot)
    flange = bpy.context.object
    flange.name = name + "_Flange"
    add_material(flange, mat)
    return obj


nozzle("Separator_GasNozzle", 0.0, 0.0, 2.55, 0.20, 0.55, "z")
nozzle("Separator_WaterNozzle", 0.0, 0.0, 0.15, 0.18, 0.45, "z")
nozzle("Separator_Inlet", -2.55, 0.0, 1.35, 0.24, 0.55, "x", AMBER)
nozzle("Separator_OilOutlet", 2.55, 0.0, 1.10, 0.20, 0.55, "x", AMBER)

# ---------------------------------------------------------------- manway + gauge + ladder
bpy.ops.mesh.primitive_cylinder_add(vertices=28, radius=0.34, depth=0.12,
                                    location=(1.0, 0.0, 2.24), rotation=(math.pi / 2, 0, 0))
manway = bpy.context.object
manway.name = "Separator_Manway"
add_material(manway, LIGHT)
bpy.ops.mesh.primitive_torus_add(major_radius=0.34, minor_radius=0.035,
                                 location=(1.0, 0.0, 2.30), rotation=(math.pi / 2, 0, 0))
ring = bpy.context.object
ring.name = "Separator_ManwayRing"
add_material(ring, DARK)

bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.13, depth=0.06,
                                    location=(-1.2, 0.0, 2.42), rotation=(math.pi / 2, 0, 0))
gauge = bpy.context.object
gauge.name = "Separator_Gauge"
add_material(gauge, GAUGE)
bpy.ops.mesh.primitive_torus_add(major_radius=0.14, minor_radius=0.02,
                                 location=(-1.2, 0.0, 2.46), rotation=(math.pi / 2, 0, 0))
gauge_ring = bpy.context.object
gauge_ring.name = "Separator_GaugeRing"
add_material(gauge_ring, DARK)

# valve wheels on top nozzles (visual signature)
for x, z in ((0.0, 2.85), (-2.55, 1.65)):
    bpy.ops.mesh.primitive_torus_add(major_radius=0.18, minor_radius=0.025,
                                     location=(x, 0.0, z), rotation=(math.pi / 2, 0, 0))
    wheel = bpy.context.object
    wheel.name = "Separator_ValveWheel_%s" % ("gas" if x == 0 else "inlet")
    add_material(wheel, AMBER)

# ladder rungs (instanced-looking, but explicit for spike)
for i in range(6):
    bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=0.025, depth=0.75,
                                        location=(-1.9, 0.0, 0.55 + i * 0.32), rotation=(math.pi / 2, 0, 0))
    rung = bpy.context.object
    rung.name = "Separator_LadderRung_%02d" % i
    add_material(rung, DARK)

# ---------------------------------------------------------------- apply transforms
bpy.ops.object.select_all(action="SELECT")
bpy.context.view_layer.objects.active = shell
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

# ---------------------------------------------------------------- stats
triangles = 0
vertices = 0
for obj in bpy.context.scene.objects:
    if obj.type != "MESH":
        continue
    mesh = obj.data
    mesh.calc_loop_triangles()
    triangles += len(mesh.loop_triangles)
    vertices += len(mesh.vertices)

# ---------------------------------------------------------------- export
glb = os.path.join(OUT, "separator.glb")
bpy.ops.export_scene.gltf(
    filepath=glb,
    export_format="GLB",
    use_selection=False,
    export_apply=True,
    export_yup=True,
    export_materials="EXPORT",
)
obj_path = os.path.join(OUT, "separator.obj")
bpy.ops.wm.obj_export(
    filepath=obj_path,
    export_materials=True,
    apply_modifiers=True,
    forward_axis="NEGATIVE_Z",
    up_axis="Y",
)
blend = os.path.join(OUT, "separator.blend")
bpy.ops.wm.save_as_mainfile(filepath=blend)

stats = {
    "asset": "three_phase_separator",
    "source": "tools/spike_separator.py",
    "blender": bpy.app.version_string,
    "triangles": triangles,
    "vertices": vertices,
    "objects": len([o for o in bpy.context.scene.objects if o.type == "MESH"]),
    "size_m": {"length": 5.2, "diameter": 2.1, "height": 2.9},
    "files": {
        "glb_bytes": os.path.getsize(glb),
        "obj_bytes": os.path.getsize(obj_path),
        "blend_bytes": os.path.getsize(blend),
    },
    "note": "Spike asset for pipeline validation; not final production art.",
}
with open(os.path.join(OUT, "separator.stats.json"), "w", encoding="utf-8") as fh:
    json.dump(stats, fh, ensure_ascii=False, indent=2)

print("@@SPIKE_STATS@@" + json.dumps(stats, ensure_ascii=False))
