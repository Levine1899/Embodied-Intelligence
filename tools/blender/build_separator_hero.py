"""Phase 05 HERO: three-phase separator with internal structure.

Run:
  "D:\\tools\\blender\\blender-4.5.16-windows-x64\\blender.exe" -b -P tools/blender/build_separator_hero.py

Outputs:
  assets-source/blender/separator_hero.blend
  web/assets/separator/separator.obj / .mtl / .glb
  docs/phase-reports/evidence/phase-05/asset-*.png
  docs/phase-reports/evidence/phase-05/separator-asset-manifest.json

The asset is a stylised teaching separator, not engineering equipment.
"""
import json
import math
import os

import bpy
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ASSET_DIR = os.path.join(ROOT, "web", "assets", "separator")
SOURCE_DIR = os.path.join(ROOT, "assets-source", "blender")
EVID = os.path.join(ROOT, "docs", "phase-reports", "evidence", "phase-05")
os.makedirs(ASSET_DIR, exist_ok=True)
os.makedirs(SOURCE_DIR, exist_ok=True)
os.makedirs(EVID, exist_ok=True)


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.length_unit = "METERS"
    return scene


def material(name, color, metallic=0.75, roughness=0.42):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    mat.diffuse_color = (*color, 1.0)
    return mat


def add(obj, mat, semantic=None):
    obj.data.materials.append(mat)
    if semantic:
        obj["semanticId"] = semantic
        obj["objectId"] = "three_phase_separator"
    return obj


def smooth(obj):
    for poly in obj.data.polygons:
        poly.use_smooth = True


def box(name, size, loc, mat, semantic=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    ob = bpy.context.object
    ob.name = name
    ob.scale = size
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return add(ob, mat, semantic)


def cyl(name, radius, depth, loc, mat, axis="z", vertices=32, semantic=None):
    rot = (0, 0, 0)
    if axis == "x":
        rot = (0, math.pi / 2, 0)
    elif axis == "y":
        rot = (math.pi / 2, 0, 0)
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth,
                                        location=loc, rotation=rot)
    ob = bpy.context.object
    ob.name = name
    smooth(ob)
    return add(ob, mat, semantic)


def sphere(name, radius, loc, scale, mat, semantic=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=radius, location=loc)
    ob = bpy.context.object
    ob.name = name
    ob.scale = scale
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    smooth(ob)
    return add(ob, mat, semantic)


def nozzle(name, x, y, z, radius, length, axis, mat, semantic=None):
    cyl(name, radius, length, (x, y, z), mat, axis=axis, vertices=20, semantic=semantic)
    if axis == "z":
        flange_z = z + length / 2
        flange_loc = (x, y, flange_z)
    elif axis == "x":
        flange_loc = (x + length / 2, y, z)
    else:
        flange_loc = (x, y + length / 2, z)
    cyl(name + "_flange", radius * 1.55, 0.08, flange_loc, mat, axis=axis, vertices=20,
        semantic=(semantic + "_flange") if semantic else None)


def look_at(camera, target):
    direction = Vector(target) - camera.location
    camera.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()


def render_view(name, location, target, hide=None):
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'MATERIAL'
    scene.display.shading.show_shadows = True
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 800
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    cam_data = bpy.data.cameras.new('asset_cam_' + name)
    cam = bpy.data.objects.new('asset_cam_' + name, cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = location
    look_at(cam, target)
    cam_data.lens = 50
    scene.camera = cam
    for ob in bpy.context.scene.objects:
        if ob.type == 'MESH':
            ob.hide_render = bool(hide and ob.name in hide)
    scene.render.filepath = os.path.join(EVID, 'asset-' + name + '.png')
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)
    for ob in bpy.context.scene.objects:
        if ob.type == 'MESH':
            ob.hide_render = False


scene = clear()

STEEL = material("Separator_Steel", (0.46, 0.53, 0.52), 0.85, 0.38)
LIGHT = material("Separator_LightSteel", (0.66, 0.68, 0.62), 0.7, 0.4)
DARK = material("Separator_DarkSteel", (0.16, 0.19, 0.19), 0.65, 0.55)
AMBER = material("Separator_Amber", (0.74, 0.48, 0.16), 0.35, 0.5)
WATER = material("Separator_Water", (0.11, 0.33, 0.43), 0.1, 0.6)
GAS = material("Separator_Gas", (0.55, 0.72, 0.68), 0.0, 0.9)
GLASS = material("Separator_Glass", (0.42, 0.66, 0.65), 0.0, 0.25)

# Shell and heads: axial X, center y=2.1, length 6.0, radius 1.0.
cyl("separator_shell", 1.0, 6.0, (0, 0, 2.1), STEEL, axis="x", vertices=48,
    semantic="separator_shell")
sphere("separator_head_left", 1.0, (-3.0, 0, 2.1), (0.42, 1.0, 1.0), LIGHT,
       semantic="separator_head_left")
sphere("separator_head_right", 1.0, (3.0, 0, 2.1), (0.42, 1.0, 1.0), LIGHT,
       semantic="separator_head_right")

# Saddle supports and skid.
for sign, side in ((-1, "left"), (1, "right")):
    x = sign * 1.7
    box("separator_saddle_" + side, (0.45, 2.0, 0.65), (x, 0, 1.05), DARK,
        semantic="separator_saddle_" + side)
    box("separator_base_" + side, (0.85, 2.5, 0.16), (x, 0, 0.2), DARK,
        semantic="separator_base_" + side)
box("separator_skid", (6.8, 2.8, 0.18), (0, 0, 0.09), DARK,
    semantic="separator_skid")

# External nozzles.
nozzle("separator_inlet", -3.35, 0, 2.1, 0.25, 0.9, "x", AMBER, "separator_inlet")
nozzle("separator_gas_outlet", 0.0, 0, 3.48, 0.22, 0.75, "z", STEEL, "separator_gas_outlet")
nozzle("separator_oil_outlet", 3.35, 0.2, 2.1, 0.22, 0.9, "x", AMBER, "separator_oil_outlet")
nozzle("separator_water_outlet", 2.6, -0.9, 1.9, 0.18, 0.65, "z", STEEL,
       "separator_water_outlet")

# Manway, gauge and valve wheel: recognisable equipment signature.
cyl("separator_manway", 0.34, 0.12, (1.1, 0, 3.12), LIGHT, axis="z", vertices=28,
    semantic="separator_manway")
bpy.ops.mesh.primitive_torus_add(major_radius=0.34, minor_radius=0.035,
                                 location=(1.1, 0, 3.2), rotation=(0, 0, 0))
ring = bpy.context.object
ring.name = "separator_manway_ring"
add(ring, DARK, "separator_manway_ring")
cyl("separator_gauge", 0.13, 0.06, (-1.3, 0, 3.15), LIGHT, axis="z", vertices=24,
    semantic="separator_gauge")
bpy.ops.mesh.primitive_torus_add(major_radius=0.18, minor_radius=0.025,
                                 location=(0, 0, 3.95), rotation=(0, 0, 0))
wheel = bpy.context.object
wheel.name = "separator_valve_wheel"
add(wheel, AMBER, "separator_valve_wheel")

# Internal structure: liquid volumes, weir, baffle, mist extractor, inlet distributor.
# The oil/water/gas volumes are separate objects so the web layer can reveal and
# animate them without pretending to be a real multiphase simulation.
box("separator_internal_water", (4.45, 1.45, 0.48), (0.15, 0, 1.68), WATER,
    semantic="separator_internal_water")
box("separator_internal_oil", (4.45, 1.45, 0.55), (0.15, 0, 2.20), AMBER,
    semantic="separator_internal_oil")
box("separator_internal_gas", (4.45, 1.35, 0.52), (0.15, 0, 2.73), GAS,
    semantic="separator_internal_gas")
box("separator_internal_weir", (0.08, 1.55, 0.9), (1.35, 0, 2.3), STEEL,
    semantic="separator_internal_weir")
box("separator_internal_baffle", (0.08, 1.55, 1.15), (-1.25, 0, 2.45), STEEL,
    semantic="separator_internal_baffle")
cyl("separator_internal_inlet_distributor", 0.16, 0.9, (-2.25, 0, 2.1), AMBER,
    axis="x", vertices=20, semantic="separator_internal_inlet_distributor")
for i in range(5):
    x = -2.62 + i * 0.16
    cyl("separator_internal_inlet_port_%02d" % i, 0.045, 0.14, (x, 0.3, 1.88), AMBER,
        axis="z", vertices=10, semantic="separator_internal_inlet_port")
# Slatted mist extractor near gas outlet.
for i in range(7):
    x = -0.75 + i * 0.25
    box("separator_internal_mist_%02d" % i, (0.06, 0.95, 0.35), (x, 0, 2.82), DARK,
        semantic="separator_internal_mist_extractor")
# Vortex breaker above water outlet.
cyl("separator_internal_vortex_breaker", 0.42, 0.12, (2.6, -0.55, 1.85), LIGHT,
    axis="z", vertices=24, semantic="separator_internal_vortex_breaker")

# A subtle cutaway rim around the shell's front face (visual cue, not geometry cut).
bpy.ops.mesh.primitive_torus_add(major_radius=1.015, minor_radius=0.025,
                                 location=(0, 0, 2.1), rotation=(0, math.pi / 2, 0))
rim = bpy.context.object
rim.name = "separator_cutaway_rim"
add(rim, AMBER, "separator_cutaway_rim")

# Apply transforms for stable import; keep object names as semantic nodes.
bpy.ops.object.select_all(action='SELECT')
bpy.context.view_layer.objects.active = bpy.data.objects.get('separator_shell')
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# Render inspection views; internal view hides the shell/heads to expose the cutaway.
render_view('front', (0, 12.5, 4.6), (0, 0, 2.2))
render_view('side', (12.0, 0.5, 5.0), (0, 0, 2.2))
render_view('45', (9.0, 9.2, 6.4), (0, 0, 2.1))
render_view('internal', (8.2, 8.0, 6.8), (0, 0, 2.2),
            hide={'separator_shell', 'separator_head_left', 'separator_head_right'})
render_view('internal-side', (12.0, 0.5, 5.0), (0, 0, 2.2),
            hide={'separator_shell', 'separator_head_left', 'separator_head_right'})

# Save .blend with inspection camera.
cam_data = bpy.data.cameras.new('asset_cam_hero')
cam = bpy.data.objects.new('asset_cam_hero', cam_data)
bpy.context.collection.objects.link(cam)
cam.location = (9.0, 9.2, 6.4)
look_at(cam, (0, 0, 2.1))
cam_data.lens = 50
scene.camera = cam
blend_path = os.path.join(SOURCE_DIR, 'separator_hero.blend')
bpy.ops.wm.save_as_mainfile(filepath=blend_path)

# Export OBJ/MTL and GLB backups.
obj_path = os.path.join(ASSET_DIR, 'separator.obj')
bpy.ops.wm.obj_export(filepath=obj_path, export_materials=True, apply_modifiers=True,
                      forward_axis='NEGATIVE_Z', up_axis='Y')
glb_path = os.path.join(ASSET_DIR, 'separator.glb')
bpy.ops.export_scene.gltf(filepath=glb_path, export_format='GLB', use_selection=False,
                          export_apply=True, export_yup=True, export_materials='EXPORT')

# Counts and semantic inventory.
triangles = 0
vertices = 0
objects = []
for ob in bpy.context.scene.objects:
    if ob.type != 'MESH':
        continue
    mesh = ob.data
    mesh.calc_loop_triangles()
    triangles += len(mesh.loop_triangles)
    vertices += len(mesh.vertices)
    objects.append({
        'name': ob.name,
        'semanticId': ob.get('semanticId', ob.name),
        'objectId': ob.get('objectId', 'three_phase_separator'),
        'triangles': len(mesh.loop_triangles),
        'dimensions': [round(v, 3) for v in ob.dimensions],
    })

manifest = {
    'assetId': 'separator_three_phase',
    'date': '2026-11-23',
    'source': 'project-generated Blender 4.5.16 geometry',
    'license': 'Project internal use; written permission required for external redistribution.',
    'teachingNote': 'Stylised three-phase gravity separator for teaching; not a real CFD or engineering design.',
    'units': 'metres; Blender Z-up; OBJ exported Y-up',
    'dimensions_m': {'length': 6.8, 'diameter': 2.0, 'height': 5.0},
    'origin': 'separator centreline at local (0,0,0); vessel centre y=2.1',
    'files': {
        'blend': 'assets-source/blender/separator_hero.blend',
        'obj': 'web/assets/separator/separator.obj',
        'mtl': 'web/assets/separator/separator.mtl',
        'glb': 'web/assets/separator/separator.glb',
    },
    'anchors': {
        'separator_inlet': [-3.35, 2.1, 0],
        'separator_gas_outlet': [0, 4.1, 0],
        'separator_oil_outlet': [3.35, 2.1, 0.2],
        'separator_water_outlet': [2.6, 1.9, -0.9],
        'separator_centre': [0, 2.1, 0],
    },
    'stats': {'triangles': triangles, 'vertices': vertices, 'meshObjects': len(objects)},
    'objects': objects,
}
with open(os.path.join(EVID, 'separator-asset-manifest.json'), 'w', encoding='utf-8') as fh:
    json.dump(manifest, fh, ensure_ascii=False, indent=2)

print('@@SEPARATOR_ASSET_OK@@' + json.dumps({
    'blend': os.path.getsize(blend_path),
    'obj': os.path.getsize(obj_path),
    'glb': os.path.getsize(glb_path),
    'triangles': triangles,
    'objects': len(objects),
}, ensure_ascii=False))
