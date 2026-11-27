"""Phase 8｜L5 产品去向 Hero 资产（真实几何，不是占位方块）。

产出 7 个 GLB / 16 个可辨识节点，每个产品绑定到其中的一个节点：

  products_fuel_containers  汽油桶 / 柴油卧桶 / 航煤立罐
  products_asphalt          沥青块（材料） + 道路剖面（应用场景，独立节点）
  products_plastics         树脂颗粒（原料） + 塑料瓶（制品）
  products_wax              蜡块
  products_fiber            纤维丝束（材料） + 织物（制品）
  products_rubber           橡胶颗粒（材料） + 胎面（制品）
  products_nonpetro         玻璃板 / 棉铃 / 水泥袋 / 盐晶

约定与 Phase 4/7 一致：
  - 每个 mesh 写 obj["petro"] = {nodeUid, objectId, semanticId, role}
  - nodeUid = uuid5(NS, "{assetId}/{objectId}/{semanticId}")
  - export_extras=True → glTF extras.petro，前端可按 nodeUid 寻址
  - 材料样本与制品/场景**分成不同节点**：沥青块 ≠ 道路剖面，树脂颗粒 ≠ 塑料瓶

Run: blender -b -P tools/blender/build_product_heroes.py
"""

import bpy
import json
import math
import os
import uuid

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
GLB_ROOT = os.path.join(ROOT, "web", "assets", "products")
BLEND_ROOT = os.path.join(ROOT, "assets-source", "blender")
PETRO_NS = uuid.UUID("5c3d1f7a-2b48-4e6c-9f10-8a7d3e5b2c94")


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def mat(name, color, metallic=0.25, roughness=0.6):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (color[0], color[1], color[2], 1.0)
    b.inputs["Metallic"].default_value = metallic
    b.inputs["Roughness"].default_value = roughness
    return m


def _smooth(ob):
    for p in ob.data.polygons:
        p.use_smooth = True


def _stamp(ob, m, asset_id, object_id, semantic, role):
    if m is not None:
        ob.data.materials.append(m)
    ob["semanticId"] = semantic
    ob["objectId"] = object_id
    ob["petro"] = {
        "nodeUid": str(uuid.uuid5(PETRO_NS, "%s/%s/%s" % (asset_id, object_id, semantic))),
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


def box(AID, OID, name, size, loc, m, role="part", rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    ob = bpy.context.object
    ob.name = name
    ob.scale = size
    _apply(ob)
    return _stamp(ob, m, AID, OID, name, role)


def cyl(AID, OID, name, r, h, loc, m, role="part", axis="z", verts=24, rot=None):
    if rot is None:
        rot = (math.pi / 2, 0, 0) if axis == "y" else (0, math.pi / 2, 0) if axis == "x" else (0, 0, 0)
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=h, location=loc, rotation=rot)
    ob = bpy.context.object
    ob.name = name
    _apply(ob)
    _smooth(ob)
    return _stamp(ob, m, AID, OID, name, role)


def cone(AID, OID, name, r1, r2, h, loc, m, role="part", verts=24):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=h, location=loc)
    ob = bpy.context.object
    ob.name = name
    _apply(ob)
    _smooth(ob)
    return _stamp(ob, m, AID, OID, name, role)


def torus(AID, OID, name, major, minor, loc, m, role="part", rot=(0, 0, 0), maj=32, mn=10):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor,
                                     major_segments=maj, minor_segments=mn,
                                     location=loc, rotation=rot)
    ob = bpy.context.object
    ob.name = name
    _apply(ob)
    _smooth(ob)
    return _stamp(ob, m, AID, OID, name, role)


def sphere(AID, OID, name, r, loc, m, role="part", scale=(1, 1, 1), seg=20, ring=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=ring, radius=r, location=loc)
    ob = bpy.context.object
    ob.name = name
    ob.scale = scale
    _apply(ob)
    _smooth(ob)
    return _stamp(ob, m, AID, OID, name, role)


def join_as(AID, OID, name, parts, m, role):
    """把一组零件合成一个节点（如"一堆颗粒"就是一个可拾取节点）。"""
    bpy.ops.object.select_all(action="DESELECT")
    for ob in parts:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    ob = bpy.context.object
    ob.name = name
    ob["semanticId"] = name
    ob["objectId"] = OID
    ob["petro"] = {
        "nodeUid": str(uuid.uuid5(PETRO_NS, "%s/%s/%s" % (AID, OID, name))),
        "objectId": OID,
        "semanticId": name,
        "role": role,
    }
    return ob


def export_asset(AID, OID, notes):
    out_dir = os.path.join(GLB_ROOT, AID)
    os.makedirs(out_dir, exist_ok=True)

    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    tris = sum(sum(max(0, len(p.vertices) - 2) for p in o.data.polygons) for o in meshes)
    verts = sum(len(o.data.vertices) for o in meshes)

    bpy.ops.object.select_all(action="DESELECT")
    for ob in bpy.context.scene.objects:
        if ob.type in {"MESH", "EMPTY"}:
            ob.select_set(True)

    glb = os.path.join(out_dir, "%s.glb" % AID)
    bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB", export_apply=True,
                              export_yup=True, export_extras=True, use_selection=True,
                              export_animations=True)

    os.makedirs(BLEND_ROOT, exist_ok=True)
    blend = os.path.join(BLEND_ROOT, "%s.blend" % AID)
    bpy.ops.wm.save_as_mainfile(filepath=blend)

    stats = {
        "asset": AID,
        "objectId": OID,
        "source": "tools/blender/build_product_heroes.py",
        "blender": bpy.app.version_string,
        "triangles": tris,
        "vertices": verts,
        "meshes": len(meshes),
        "nodes": [o["petro"]["semanticId"] for o in meshes if o.get("petro")],
        "notes": notes,
        "files": {"glb_bytes": os.path.getsize(glb), "blend_bytes": os.path.getsize(blend)},
        "note": "教学示意级产品模型；几何由脚本生成，允许改后重跑。",
    }
    with open(os.path.join(out_dir, "%s.stats.json" % AID), "w", encoding="utf-8") as fh:
        json.dump(stats, fh, ensure_ascii=False, indent=2)
    print("@@PRODUCT@@ " + json.dumps({"asset": AID, "meshes": len(meshes), "tris": tris,
                                       "glb": os.path.getsize(glb)}, ensure_ascii=False))


# ------------------------------------------------------------------ 燃料容器
def build_fuel_containers():
    AID, OID = "products_fuel_containers", "fuel_products"
    clear()
    red = mat("PF_Red", (0.55, 0.12, 0.10), 0.35, 0.45)
    yellow = mat("PF_Yellow", (0.72, 0.55, 0.10), 0.35, 0.45)
    grey = mat("PF_Grey", (0.55, 0.56, 0.55), 0.6, 0.42)
    dark = mat("PF_Dark", (0.20, 0.21, 0.22), 0.5, 0.55)

    # 汽油：扁平塑料桶 + 提手 + 加油口
    box(AID, "gasoline_can", "gasoline_can", (0.62, 0.30, 0.66), (0, 0, 0.36), red, "product")
    box(AID, "gasoline_can", "gasoline_can_handle", (0.30, 0.10, 0.06), (0, 0, 0.72), dark, "product")
    cyl(AID, "gasoline_can", "gasoline_can_neck", 0.07, 0.12, (0.22, 0, 0.72), dark, "product", verts=14)
    cyl(AID, "gasoline_can", "gasoline_can_cap", 0.09, 0.05, (0.22, 0, 0.80), yellow, "product", verts=14)

    # 柴油：卧式钢桶 + 两道箍
    cyl(AID, "diesel_drum", "diesel_drum", 0.32, 0.86, (0.95, 0, 0.36), grey, "product", axis="x", verts=28)
    for i, x in enumerate((0.70, 1.20)):
        torus(AID, "diesel_drum", "diesel_drum_rib_%d" % (i + 1), 0.325, 0.025, (x, 0, 0.36), dark, "product",
              rot=(0, math.pi / 2, 0))

    # 航煤：立式细高罐 + 加注口（与汽油桶、柴油桶轮廓明显不同）
    cyl(AID, "jet_fuel_cartridge", "jet_fuel_cartridge", 0.23, 0.86, (1.95, 0, 0.45), grey, "product", verts=26)
    cone(AID, "jet_fuel_cartridge", "jet_fuel_cartridge_shoulder", 0.23, 0.10, 0.14, (1.95, 0, 0.95), grey, "product")
    cyl(AID, "jet_fuel_cartridge", "jet_fuel_cartridge_neck", 0.08, 0.12, (1.95, 0, 1.06), dark, "product", verts=14)
    box(AID, "jet_fuel_cartridge", "jet_fuel_cartridge_label", (0.16, 0.02, 0.22), (1.95, 0.235, 0.52), yellow, "product")

    return export_asset(AID, OID, ["三种燃料用三种可辨识容器，避免只靠文字区分"])


# ------------------------------------------------------------------ 沥青
def build_asphalt():
    AID, OID = "products_asphalt", "asphalt_products"
    clear()
    black = mat("PA_Asphalt", (0.06, 0.06, 0.07), 0.05, 0.85)
    stone = mat("PA_Stone", (0.35, 0.34, 0.32), 0.0, 0.9)
    paint = mat("PA_Paint", (0.80, 0.78, 0.72), 0.0, 0.6)

    # 材料样本：不规则块（压扁球 + 两个凸起），放在左侧
    sphere(AID, "asphalt_lump", "asphalt_lump", 0.34, (-0.75, 0, 0.26), black, "material", scale=(1.15, 1.0, 0.62), seg=16, ring=10)
    sphere(AID, "asphalt_lump", "asphalt_lump_chip_a", 0.13, (-0.98, 0.16, 0.16), black, "material", scale=(1.2, 0.9, 0.7), seg=12, ring=8)
    sphere(AID, "asphalt_lump", "asphalt_lump_chip_b", 0.10, (-0.52, -0.18, 0.14), black, "material", scale=(1.0, 1.1, 0.7), seg=12, ring=8)

    # 应用场景：道路剖面（基层 + 沥青层 + 标线），单独一个节点，绝不代表材料本身
    box(AID, "road_section", "road_section", (1.15, 0.72, 0.10), (0.85, 0, 0.05), stone, "application_scene")
    box(AID, "road_section", "road_section_asphalt_course", (1.15, 0.72, 0.07), (0.85, 0, 0.135), black, "application_scene")
    box(AID, "road_section", "road_section_marking", (1.15, 0.05, 0.012), (0.85, 0.16, 0.176), paint, "application_scene")
    return export_asset(AID, OID, ["沥青块=材料样本；道路剖面=应用场景，两者是不同节点"])


# ------------------------------------------------------------------ 塑料
def build_plastics():
    AID, OID = "products_plastics", "plastic_products"
    clear()
    resin = mat("PP_Resin", (0.86, 0.87, 0.85), 0.05, 0.35)
    bottle = mat("PP_Bottle", (0.55, 0.72, 0.78), 0.15, 0.30)
    cap = mat("PP_Cap", (0.20, 0.35, 0.55), 0.2, 0.45)

    # 原料：一堆树脂颗粒（合成一个节点）
    parts = []
    for i in range(12):
        a = i * 2.399
        rr = 0.04 + (i % 3) * 0.012
        x = -0.72 + 0.13 * math.cos(a) * (1 + (i % 4) * 0.35)
        y = 0.13 * math.sin(a) * (1 + (i % 3) * 0.3)
        z = 0.09 + (i % 4) * 0.055
        parts.append(cyl(AID, "resin_pellets", "resin_pellet_%02d" % i, rr, rr * 1.6, (x, y, z), resin, "material", verts=10))
    join_as(AID, "resin_pellets", "resin_pellets", parts, resin, "material")

    # 制品：塑料瓶（瓶身 + 肩 + 颈 + 盖 + 标签）
    cyl(AID, "plastic_bottle", "plastic_bottle", 0.20, 0.52, (0.80, 0, 0.30), bottle, "manufactured_item", verts=26)
    cone(AID, "plastic_bottle", "plastic_bottle_shoulder", 0.20, 0.08, 0.14, (0.80, 0, 0.63), bottle, "manufactured_item")
    cyl(AID, "plastic_bottle", "plastic_bottle_neck", 0.075, 0.10, (0.80, 0, 0.73), bottle, "manufactured_item", verts=16)
    cyl(AID, "plastic_bottle", "plastic_bottle_cap", 0.095, 0.07, (0.80, 0, 0.81), cap, "manufactured_item", verts=16)
    cyl(AID, "plastic_bottle", "plastic_bottle_label", 0.203, 0.18, (0.80, 0, 0.34), cap, "manufactured_item", verts=26)
    return export_asset(AID, OID, ["树脂颗粒=材料；塑料瓶=制品。任务里只能绑制品节点"])


# ------------------------------------------------------------------ 石蜡
def build_wax():
    AID, OID = "products_wax", "wax_products"
    clear()
    wax = mat("PW_Wax", (0.93, 0.90, 0.80), 0.0, 0.55)
    wick = mat("PW_Wick", (0.25, 0.22, 0.20), 0.0, 0.8)
    box(AID, "wax_block", "wax_block", (0.58, 0.42, 0.34), (0, 0, 0.19), wax, "material")
    box(AID, "wax_block", "wax_block_bevel", (0.50, 0.36, 0.05), (0, 0, 0.38), wax, "material", rot=(0, 0.12, 0))
    cyl(AID, "wax_block", "wax_wick", 0.014, 0.12, (0, 0, 0.45), wick, "material", verts=8)
    return export_asset(AID, OID, ["块状蜡材；顶部斜切与烛芯提醒它是蜡制品原料"])


# ------------------------------------------------------------------ 合成纤维
def build_fiber():
    AID, OID = "products_fiber", "fiber_products"
    clear()
    fibre = mat("PB_Fiber", (0.92, 0.93, 0.94), 0.05, 0.35)
    cloth = mat("PB_Cloth", (0.55, 0.58, 0.66), 0.0, 0.85)
    band = mat("PB_Band", (0.30, 0.35, 0.45), 0.2, 0.5)

    # 材料：丝束（一束细丝 + 两端扎带）
    parts = []
    for i in range(9):
        a = i * 0.7
        parts.append(cyl(AID, "fiber_tow", "fiber_fil_%02d" % i, 0.022, 0.72,
                         (-0.72 + 0.05 * math.cos(a), 0.05 * math.sin(a), 0.42), fibre, "material", verts=8))
    join_as(AID, "fiber_tow", "fiber_tow", parts, fibre, "material")
    torus(AID, "fiber_tow", "fiber_tow_band_a", 0.10, 0.022, (-0.72, 0, 0.14), band, "material", maj=20, mn=8)
    torus(AID, "fiber_tow", "fiber_tow_band_b", 0.10, 0.022, (-0.72, 0, 0.70), band, "material", maj=20, mn=8)

    # 制品：织物（平板 + 经纬线）
    box(AID, "textile_weave", "textile_weave", (0.70, 0.62, 0.03), (0.80, 0, 0.10), cloth, "manufactured_item")
    for i in range(6):
        box(AID, "textile_weave", "textile_warp_%d" % (i + 1), (0.012, 0.62, 0.012),
            (0.80 - 0.28 + i * 0.112, 0, 0.122), cloth, "manufactured_item")
        box(AID, "textile_weave", "textile_weft_%d" % (i + 1), (0.70, 0.012, 0.012),
            (0.80, -0.25 + i * 0.10, 0.122), cloth, "manufactured_item")
    return export_asset(AID, OID, ["丝束=材料；织物=制品。两者分开，避免把纺织品当纤维原料"])


# ------------------------------------------------------------------ 合成橡胶
def build_rubber():
    AID, OID = "products_rubber", "rubber_products"
    clear()
    rubber = mat("PR_Rubber", (0.12, 0.12, 0.13), 0.0, 0.9)
    tread = mat("PR_Tread", (0.16, 0.16, 0.17), 0.0, 0.85)

    # 材料：生胶颗粒（不规则小块合成一个节点）
    parts = []
    for i in range(10):
        a = i * 2.1
        parts.append(box(AID, "rubber_granules", "rubber_granule_%02d" % i, (0.11, 0.09, 0.08),
                         (-0.72 + 0.09 * math.cos(a) * (1 + (i % 3) * 0.4),
                          0.09 * math.sin(a) * (1 + (i % 2) * 0.5),
                          0.08 + (i % 3) * 0.07), rubber, "material", rot=(a, a * 0.5, 0)))
    join_as(AID, "rubber_granules", "rubber_granules", parts, rubber, "material")

    # 制品：胎面（环 + 花纹块）
    torus(AID, "tire_tread", "tire_tread", 0.34, 0.13, (0.82, 0, 0.30), tread, "manufactured_item",
          rot=(math.pi / 2, 0, 0), maj=36, mn=14)
    for i in range(12):
        a = i * math.pi / 6
        box(AID, "tire_tread", "tire_block_%02d" % i, (0.06, 0.10, 0.05),
            (0.82 + 0.44 * math.cos(a), 0.44 * math.sin(a), 0.30), tread, "manufactured_item",
            rot=(0, 0, a))
    return export_asset(AID, OID, ["生胶颗粒=材料；胎面=制品"])


# ------------------------------------------------------------------ 非石油
def build_nonpetro():
    AID, OID = "products_nonpetro", "nonpetro_products"
    clear()
    glass = mat("PN_Glass", (0.62, 0.78, 0.80), 0.1, 0.12)
    cglass = mat("PN_GlassEdge", (0.40, 0.55, 0.58), 0.1, 0.2)
    cotton = mat("PN_Cotton", (0.94, 0.93, 0.90), 0.0, 0.9)
    stem = mat("PN_Stem", (0.32, 0.30, 0.20), 0.0, 0.8)
    bag = mat("PN_CementBag", (0.58, 0.55, 0.48), 0.0, 0.8)
    salt = mat("PN_Salt", (0.95, 0.95, 0.96), 0.0, 0.25)

    # 玻璃板
    box(AID, "glass_pane", "glass_pane", (0.62, 0.02, 0.50), (-1.05, 0, 0.32), glass, "material")
    box(AID, "glass_pane", "glass_pane_edge", (0.64, 0.03, 0.03), (-1.05, 0, 0.07), cglass, "material")

    # 棉铃
    for i in range(5):
        a = i * 1.257
        sphere(AID, "cotton_boll", "cotton_boll_%d" % (i + 1), 0.13,
               (-0.35 + 0.11 * math.cos(a), 0.11 * math.sin(a), 0.30 + (i % 2) * 0.07),
               cotton, "material", scale=(1, 1, 0.9), seg=14, ring=10)
    cyl(AID, "cotton_boll", "cotton_stem", 0.02, 0.24, (-0.35, 0, 0.12), stem, "material", verts=8)

    # 水泥袋
    box(AID, "cement_bag", "cement_bag", (0.52, 0.32, 0.36), (0.38, 0, 0.19), bag, "material")
    box(AID, "cement_bag", "cement_bag_top", (0.30, 0.18, 0.08), (0.38, 0, 0.40), bag, "material", rot=(0, 0.16, 0))

    # 盐晶
    for i in range(6):
        a = i * 1.9
        box(AID, "salt_crystal", "salt_crystal_%d" % (i + 1), (0.10, 0.10, 0.10),
            (1.05 + 0.07 * math.cos(a), 0.07 * math.sin(a), 0.08 + (i % 3) * 0.08),
            salt, "material", rot=(a * 0.3, a * 0.2, a))
    return export_asset(AID, OID, ["四件非石油路线物品也给了真实模型，避免'对比项'只是占位"])


def main():
    for fn in (build_fuel_containers, build_asphalt, build_plastics, build_wax,
               build_fiber, build_rubber, build_nonpetro):
        fn()
    print("@@PRODUCT_DONE@@")


if __name__ == "__main__":
    main()
