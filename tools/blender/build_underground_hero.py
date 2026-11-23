"""Build the phase-04 underground geology / wellbore Hero asset.

Run with the portable Blender 4.5:
  blender -b -P tools/blender/build_underground_hero.py

Outputs:
  assets-source/blender/underground_hero.blend
  web/assets/underground/underground.obj + .mtl
  web/assets/underground/underground.glb
  docs/phase-reports/evidence/phase-04/asset-*.png
  docs/phase-reports/evidence/phase-04/underground-asset-manifest.json

The asset is a teaching cutaway, not a real reservoir model. Coordinates are
metres in the scene; the page places the asset at the subsurface zone anchor.
"""
import bpy
import json
import math
import os
import hashlib
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
BLEND = os.path.join(ROOT, 'assets-source', 'blender', 'underground_hero.blend')
OBJ = os.path.join(ROOT, 'web', 'assets', 'underground', 'underground.obj')
GLB = os.path.join(ROOT, 'web', 'assets', 'underground', 'underground.glb')
EVID = os.path.join(ROOT, 'docs', 'phase-reports', 'evidence', 'phase-04')
MANIFEST = os.path.join(EVID, 'underground-asset-manifest.json')


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def clear():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for block in list(bpy.data.meshes):
        if block.users == 0:
            bpy.data.meshes.remove(block)
    for block in list(bpy.data.materials):
        if block.users == 0:
            bpy.data.materials.remove(block)


def material(name, color, roughness=0.9, metallic=0.0, alpha=1.0, emission=None):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    if emission:
        bsdf.inputs['Emission Color'].default_value = (*emission, 1)
        bsdf.inputs['Emission Strength'].default_value = 0.35
    if alpha < 1:
        bsdf.inputs['Alpha'].default_value = alpha
        m.blend_method = 'BLEND'
    return m


def mesh_object(name, verts, faces, mat, semantic=None, object_id=None, layer_index=None):
    me = bpy.data.meshes.new(name + '_mesh')
    me.from_pydata(verts, [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    ob.data.materials.append(mat)
    if semantic:
        ob['semanticId'] = semantic
    if object_id:
        ob['objectId'] = object_id
    if layer_index is not None:
        ob['layerIndex'] = layer_index
    return ob


def wavy_layer(name, top, bottom, mat, layer_index, amp=0.22, phase=0.0):
    nx, nz = 30, 20
    xs = [-9 + 18 * i / (nx - 1) for i in range(nx)]
    zs = [-6 + 12 * j / (nz - 1) for j in range(nz)]

    def wave(x, z, base, k):
        return base + amp * (math.sin(x * 0.62 + phase + k) + 0.55 * math.cos(z * 0.9 - phase * 0.7))

    verts = []
    for level in (0, 1):
        for z in zs:
            for x in xs:
                verts.append((x, z, wave(x, z, top if level == 0 else bottom, level * 1.7)))
    faces = []
    stride = nx * nz
    for j in range(nz - 1):
        for i in range(nx - 1):
            a = j * nx + i
            b = a + 1
            c = a + nx
            d = c + 1
            faces.append((a, b, d, c))              # top surface
            faces.append((stride + a, stride + c, stride + d, stride + b))  # bottom
    # side walls
    for j in range(nz - 1):
        for i, jj in ((0, j), (nx - 1, j)):
            a = jj * nx + i
            b = (jj + 1) * nx + i
            faces.append((a, b, stride + b, stride + a))
    for i in range(nx - 1):
        for jj in (0, nz - 1):
            a = jj * nx + i
            b = a + 1
            faces.append((a, stride + a, stride + b, b))
    return mesh_object(name, verts, faces, mat, name, 'underground_hero', layer_index)


def cyl(name, radius, depth, loc, mat, vertices=24, semantic=None, object_id=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
    ob = bpy.context.object
    ob.name = name
    ob.data.materials.append(mat)
    if semantic:
        ob['semanticId'] = semantic
    if object_id:
        ob['objectId'] = object_id
    return ob


def box(name, size, loc, mat, semantic=None, object_id=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    ob = bpy.context.object
    ob.name = name
    ob.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
    ob.data.materials.append(mat)
    if semantic:
        ob['semanticId'] = semantic
    if object_id:
        ob['objectId'] = object_id
    return ob


def torus(name, major, minor, loc, mat, semantic=None):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, location=loc)
    ob = bpy.context.object
    ob.name = name
    ob.data.materials.append(mat)
    if semantic:
        ob['semanticId'] = semantic
    return ob


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
    scene.render.film_transparent = False
    cam_data = bpy.data.cameras.new('asset_cam_' + name)
    cam = bpy.data.objects.new('asset_cam_' + name, cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = location
    look_at(cam, target)
    cam_data.lens = 48
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


clear()
os.makedirs(os.path.dirname(OBJ), exist_ok=True)
os.makedirs(EVID, exist_ok=True)

mat_over = material('mat_geo_overburden', (0.34, 0.27, 0.19), 0.96)
mat_cap = material('mat_geo_caprock', (0.28, 0.29, 0.26), 0.92)
mat_res = material('mat_geo_reservoir', (0.46, 0.31, 0.12), 0.88, emission=(0.25, 0.12, 0.03))
mat_base = material('mat_geo_basement', (0.16, 0.18, 0.19), 0.98)
mat_steel = material('mat_well_steel', (0.42, 0.44, 0.41), 0.42, 0.75)
mat_cement = material('mat_well_cement', (0.33, 0.34, 0.31), 0.95)
mat_amber = material('mat_well_amber', (0.72, 0.42, 0.12), 0.45, 0.4, emission=(0.2, 0.08, 0.01))
mat_pad = material('mat_surface_pad', (0.22, 0.22, 0.19), 0.95)

# Geological layers: non-uniform, wavy boundaries; four layers + basement.
over = wavy_layer('geo_overburden', 0.0, -2.35, mat_over, 0, 0.22, 0.2)
cap = wavy_layer('geo_caprock', -2.35, -4.45, mat_cap, 1, 0.16, 1.4)
res = wavy_layer('geo_reservoir_layer', -4.45, -7.55, mat_res, 2, 0.28, 2.2)
base = wavy_layer('geo_basement', -7.55, -12.0, mat_base, 3, 0.18, 3.1)

# A lenticular reservoir body inside the reservoir layer.
bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, location=(0, 0, -6.0))
lens = bpy.context.object
lens.name = 'reservoir_lens'
lens.scale = (5.6, 3.2, 1.15)
lens.data.materials.append(mat_res)
lens['objectId'] = 'reservoir'
lens['semanticId'] = 'reservoir_lens'

# Wellbore: casing, cement sheath, production tubing and perforation band.
casing = cyl('well_casing', 0.30, 8.6, (0, 0, -3.0), mat_steel, 28, 'well_casing', 'wellbore')
cement = cyl('well_cement', 0.52, 8.6, (0, 0, -3.0), mat_cement, 28, 'well_cement', 'wellbore')
tubing = cyl('well_tubing', 0.13, 8.2, (0, 0, -2.8), mat_amber, 20, 'well_tubing', 'wellbore')
for i in range(10):
    a = i * math.tau / 10
    perf = cyl('well_perforation_%02d' % i, 0.045, 0.16,
               (math.cos(a) * 0.48, math.sin(a) * 0.48, -5.6), mat_amber, 8, 'well_perforation', 'wellbore')
    perf.rotation_euler = (math.pi / 2, 0, a)

# Wellhead / christmas tree and surface pad.
pad = box('surface_pad', (4.0, 4.0, 0.22), (0, 0, 0.11), mat_pad, 'surface_pad')
head = box('wellhead_tree', (1.1, 1.1, 1.1), (0, 0, 0.72), mat_steel, 'wellhead_tree', 'wellhead')
valve1 = torus('wellhead_valve', 0.34, 0.055, (0, 0, 1.33), mat_amber, 'wellhead_valve')
valve1.rotation_euler = (math.pi / 2, 0, 0)
outlet = cyl('wellhead_outlet', 0.10, 1.3, (0.9, 0, 1.0), mat_steel, 12, 'wellhead_outlet')
outlet.rotation_euler = (0, math.pi / 2, 0)

# Surface production flowline from the wellhead toward the gathering area.
bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.09, depth=7.2, location=(4.2, -1.5, 0.52))
flow = bpy.context.object
flow.name = 'well_flowline'
flow.rotation_euler = (0, math.pi / 2, math.radians(23))
flow.data.materials.append(mat_steel)
flow['semanticId'] = 'well_flowline'
flow['objectId'] = 'wellbore'
flow['flowDirection'] = 'wellhead_to_gathering'

# Semantic anchor empties (exported in GLB; manifest records their coordinates).
for name, loc in {
    'wellhead_anchor': (0, 0, 1.6),
    'wellbore_top_anchor': (0, 0, 0.9),
    'wellbore_reservoir_anchor': (0, 0, -5.8),
    'reservoir_anchor': (0, 0, -6.0),
}.items():
    bpy.ops.object.empty_add(type='PLAIN_AXES', location=loc)
    e = bpy.context.object
    e.name = name
    e['semanticId'] = name
    e['objectId'] = 'wellhead' if 'wellhead' in name else ('reservoir' if 'reservoir' in name else 'wellbore')

# Label object for asset metadata.
root = bpy.data.objects.new('asset_underground_hero', None)
root['assetId'] = 'underground_hero'
root['source'] = 'project-generated Blender geometry'
root['license'] = 'Project internal asset; verify distribution rights before external reuse.'
root['teachingNote'] = 'Stylised teaching cutaway; not a real reservoir or geological scale.'
bpy.context.collection.objects.link(root)

# Camera / light for .blend inspection.
scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light = 'STUDIO'
scene.display.shading.color_type = 'MATERIAL'
scene.display.shading.show_shadows = True
scene.world.color = (0.03, 0.035, 0.038)

# Save source with a 45-degree inspection camera.
cam_data = bpy.data.cameras.new('asset_cam_hero')
cam = bpy.data.objects.new('asset_cam_hero', cam_data)
bpy.context.collection.objects.link(cam)
cam.location = (16, -18, 8)
look_at(cam, (0, 0, -5))
cam_data.lens = 52
scene.camera = cam
bpy.ops.wm.save_as_mainfile(filepath=BLEND)

# Export OBJ/MTL and GLB (OBJ is the runtime format already supported by ObjLite).
bpy.ops.object.select_all(action='DESELECT')
for ob in bpy.context.scene.objects:
    if ob.type in {'MESH', 'EMPTY'}:
        ob.select_set(True)
bpy.context.view_layer.objects.active = root
try:
    bpy.ops.wm.obj_export(filepath=OBJ, export_selected_objects=True, export_materials=True,
                          export_triangulated_mesh=True, forward_axis='NEGATIVE_Z', up_axis='Y')
except TypeError:
    bpy.ops.wm.obj_export(filepath=OBJ, export_selected_objects=True, export_materials=True)
try:
    bpy.ops.export_scene.gltf(filepath=GLB, export_format='GLB', use_selection=True,
                              export_yup=True, export_apply=True, export_extras=True)
except Exception as exc:
    print('GLB export warning:', exc)

# Asset inspection renders.
render_view('front', (0, -36, 3.5), (0, 0, -5.5))
render_view('side', (36, 0, 3.5), (0, 0, -5.5))
render_view('45', (30, -34, 14), (0, 0, -5.5))
render_view('wellbore-close', (8, -16, -0.5), (0, 0, -4.6))
render_view('reservoir-cutaway', (12, -18, 0.5), (0, 0, -5.6),
            hide={'geo_overburden', 'geo_caprock'})
render_view('wellbore-structure', (10, -18, -0.5), (0, 0, -4.2),
            hide={'geo_overburden', 'geo_caprock', 'geo_reservoir_layer', 'geo_basement'})

objects = []
for ob in bpy.context.scene.objects:
    if ob.type == 'MESH':
        objects.append({
            'name': ob.name,
            'type': ob.type,
            'objectId': ob.get('objectId', 'underground_hero'),
            'semanticId': ob.get('semanticId', ob.name),
            'layerIndex': ob.get('layerIndex'),
            'dimensions': [round(v, 3) for v in ob.dimensions],
            'location': [round(v, 3) for v in ob.location],
        })
manifest = {
    'assetId': 'underground_hero',
    'generatedAt': '2026-11-23',
    'source': 'project-generated Blender 4.5.16 geometry',
    'license': 'Project internal asset; verify distribution rights before external reuse.',
    'teachingNote': 'Stylised teaching cutaway; four geological layers, lenticular reservoir, wellbore and wellhead. Not a real reservoir, not a real geological scale.',
    'units': 'metres; Blender Z-up; exported OBJ Y-up',
    'scale': 1.0,
    'origin': 'wellhead/surface centre at local (0,0,0)',
    'dimensions': {'x': 18.0, 'depth': 12.0, 'vertical': 13.6},
    'files': {
        'blend': os.path.relpath(BLEND, ROOT).replace('\\', '/'),
        'obj': os.path.relpath(OBJ, ROOT).replace('\\', '/'),
        'mtl': os.path.relpath(OBJ[:-4] + '.mtl', ROOT).replace('\\', '/'),
        'glb': os.path.relpath(GLB, ROOT).replace('\\', '/'),
    },
    'sha256': {
        'blend': sha256(BLEND),
        'obj': sha256(OBJ),
        'mtl': sha256(OBJ[:-4] + '.mtl') if os.path.exists(OBJ[:-4] + '.mtl') else None,
        'glb': sha256(GLB) if os.path.exists(GLB) else None,
    },
    'materials': ['mat_geo_overburden', 'mat_geo_caprock', 'mat_geo_reservoir', 'mat_geo_basement',
                  'mat_well_steel', 'mat_well_cement', 'mat_well_amber', 'mat_surface_pad'],
    'objects': objects,
    'inspectionViews': [
        'asset-front.png', 'asset-side.png', 'asset-45.png',
        'asset-wellbore-close.png', 'asset-reservoir-cutaway.png',
        'asset-wellbore-structure.png'
    ],
    'anchors': {
        'wellhead_anchor': [0, 1.6, 0],
        'wellbore_top_anchor': [0, 0.9, 0],
        'wellbore_reservoir_anchor': [0, -5.8, 0],
        'reservoir_anchor': [0, -6.0, 0],
    },
    'limitations': [
        'No real geological data or real reservoir scale.',
        'Layer boundaries are stylised waves, not measured horizons.',
        'Wellbore parts are simplified teaching geometry, not engineering casing design.',
        'OBJ has no custom properties; Blender object names and this manifest carry semantic IDs.'
    ],
}
with open(MANIFEST, 'w', encoding='utf-8') as f:
    json.dump(manifest, f, ensure_ascii=False, indent=2)

print('ASSET_OK', json.dumps({'blend': BLEND, 'obj': OBJ, 'glb': os.path.exists(GLB),
                              'views': 6, 'objects': len(objects)}, ensure_ascii=False))
