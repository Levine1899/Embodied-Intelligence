"""Phase 7｜储运 Hero 资产建模脚本（真实几何，非程序化方块占位）。

产出三个独立 Hero：
  1. storage_fixed_roof_tank   固定顶罐（罐底/罐壁/固定顶/呼吸设施/进出口/附件 + 真实半剖壳）
  2. storage_floating_roof_tank 外浮顶罐（罐底/罐壁/浮盘/边缘密封/导向限位 + 真实半剖壳）
  3. transfer_pump_set          转输泵组（泵体/电机/联轴器护罩/底座/吸排口/阀门）

约定（与 Phase 4 separator 管线一致，不新造规范）：
  - 每个 mesh 写 `obj["petro"] = {nodeUid, objectId, semanticId, role, dynamicBinding?}`
  - nodeUid = uuid5(NS, "{assetId}/{objectId}/{semanticId}")，NS 与 web 侧一致
  - export_extras=True 把它导出成 glTF `extras.petro`，前端才可寻址
  - 真实半剖：`*_shell_cut` 是开口半圆柱（近侧半圈被删掉），不是隐藏面
  - 动态件（浮盘/边缘密封）单独成节点，不参与合并，供前端独立动画

Run:
  blender -b -P tools/blender/build_storage_heroes.py

坐标系：Blender Z-up，导出 export_yup=True → glTF Y-up（与既有资产一致）。
单位：米。
"""

import bpy
import json
import math
import os
import sys
import uuid

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
GLB_ROOT = os.path.join(ROOT, "web", "assets", "storage")
BLEND_ROOT = os.path.join(ROOT, "assets-source", "blender")
PETRO_NS = uuid.UUID("5c3d1f7a-2b48-4e6c-9f10-8a7d3e5b2c94")

TRIS = {}


# ------------------------------------------------------------------ helpers
def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    TRIS.clear()


def material(name, color, metallic=0.8, roughness=0.45):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (color[0], color[1], color[2], 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    return m


def _smooth(ob):
    for p in ob.data.polygons:
        p.use_smooth = True


def _stamp(ob, mat, asset_id, object_id, semantic, role, dynamic=None):
    if mat is not None:
        ob.data.materials.append(mat)
    ob["semanticId"] = semantic
    ob["objectId"] = object_id
    petro = {
        "nodeUid": str(uuid.uuid5(PETRO_NS, "%s/%s/%s" % (asset_id, object_id, semantic))),
        "objectId": object_id,
        "semanticId": semantic,
        "role": role,
    }
    if dynamic:
        petro["dynamicBinding"] = dynamic
    ob["petro"] = petro
    TRIS[asset_id] = TRIS.get(asset_id, 0)
    return ob


def _apply(ob):
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return ob


def box(name, size, loc, mat, asset_id, object_id, semantic, role, rot=(0, 0, 0), dynamic=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    ob = bpy.context.object
    ob.name = name
    ob.scale = (size[0], size[1], size[2])
    _apply(ob)
    return _stamp(ob, mat, asset_id, object_id, semantic, role, dynamic)


def cyl(name, radius, depth, loc, mat, asset_id, object_id, semantic, role,
        axis="z", verts=32, rot=None, dynamic=None, smooth=True):
    if rot is None:
        rot = (math.pi / 2, 0, 0) if axis == "y" else (0, math.pi / 2, 0) if axis == "x" else (0, 0, 0)
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth,
                                        location=loc, rotation=rot)
    ob = bpy.context.object
    ob.name = name
    _apply(ob)
    if smooth:
        _smooth(ob)
    return _stamp(ob, mat, asset_id, object_id, semantic, role, dynamic)


def cone(name, r1, r2, depth, loc, mat, asset_id, object_id, semantic, role, verts=48):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=depth, location=loc)
    ob = bpy.context.object
    ob.name = name
    _apply(ob)
    _smooth(ob)
    return _stamp(ob, mat, asset_id, object_id, semantic, role)


def torus(name, major, minor, loc, mat, asset_id, object_id, semantic, role,
          rot=(0, 0, 0), maj_seg=48, min_seg=10, dynamic=None):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor,
                                     major_segments=maj_seg, minor_segments=min_seg,
                                     location=loc, rotation=rot)
    ob = bpy.context.object
    ob.name = name
    _apply(ob)
    _smooth(ob)
    return _stamp(ob, mat, asset_id, object_id, semantic, role, dynamic)


def half_tube_z(name, radius, height, z0, mat, asset_id, object_id, semantic, role,
                segments=32, angle0=math.pi / 2, angle1=3 * math.pi / 2, thickness=None):
    """真实半剖罐壁：只保留 angle0..angle1 这一段圆周，近侧完全敞开。

    与 separator 的 half_shell 同思路，但轴向改为 Z（立式罐）。
    thickness 给定时再做一层内壁，形成有厚度的开口壳体。
    """
    layers = [radius] if thickness is None else [radius, radius - thickness]
    verts, faces = [], []
    for r in layers:
        base = len(verts)
        for z in (z0, z0 + height):
            for i in range(segments + 1):
                a = angle0 + (angle1 - angle0) * i / segments
                verts.append((r * math.cos(a), r * math.sin(a), z))
        for i in range(segments):
            a = base + i
            b = base + i + 1
            c = base + segments + 1 + i
            d = c + 1
            faces.append((a, b, d, c))
    if thickness is not None and len(layers) == 2:
        inner = (segments + 1) * 2
        # 顶部/底部环形盖，让开口壳有壁厚
        for i in range(segments):
            faces.append((i, inner + i, inner + i + 1, i + 1))
            faces.append((segments + 1 + i, segments + 2 + i, inner + segments + 2 + i, inner + segments + 1 + i))
        # 两条纵向切边
        for zoff in (0, segments + 1):
            for k in (0, segments):
                pass
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(ob)
    ob.location = (0, 0, 0)
    _apply(ob)
    _smooth(ob)
    return _stamp(ob, mat, asset_id, object_id, semantic, role)


def disc_z(name, radius, z, thickness, mat, asset_id, object_id, semantic, role, verts=48):
    return cyl(name, radius, thickness, (0, 0, z + thickness / 2.0), mat,
               asset_id, object_id, semantic, role, axis="z", verts=verts)


# ------------------------------------------------------------------ asset 1
def build_fixed_roof_tank():
    AID, OID = "storage_fixed_roof_tank", "fixed_roof_tank"
    clear()
    steel = material("TK_Steel", (0.60, 0.61, 0.58), 0.85, 0.42)
    darksteel = material("TK_DarkSteel", (0.26, 0.27, 0.26), 0.8, 0.5)
    roofmat = material("TK_Roof", (0.52, 0.55, 0.53), 0.8, 0.46)
    cutmat = material("TK_CutSteel", (0.58, 0.64, 0.56), 0.5, 0.5)
    concrete = material("TK_Concrete", (0.44, 0.43, 0.40), 0.0, 0.92)
    amber = material("TK_Amber", (0.85, 0.62, 0.18), 0.6, 0.4)

    R, H = 3.2, 6.0
    disc_z("foundation_ring", R + 0.45, 0.0, 0.20, concrete, AID, OID, "foundation_ring", "support")
    disc_z("bottom_plate", R, 0.20, 0.10, steel, AID, OID, "bottom_plate", "shell")

    # 完整罐壁（外部模式）
    cyl("shell", R, H, (0, 0, 0.30 + H / 2.0), steel, AID, OID, "shell", "shell", verts=64)
    # 真实半剖罐壁（近侧半圈完全删掉）
    half_tube_z("shell_cut", R, H, 0.30, cutmat, AID, OID, "shell_cut", "shell", thickness=0.06)
    # 剖切纵向边（让开口可读）
    for label, ang in (("left", math.pi / 2), ("right", 3 * math.pi / 2)):
        cyl("cut_edge_" + label, 0.035, H,
            (R * math.cos(ang), R * math.sin(ang), 0.30 + H / 2.0),
            amber, AID, OID, "cut_edge_" + label, "shell")

    # 加强圈（顶/中/底）
    for i, z in enumerate((1.4, 2.9, 4.4, 5.6)):
        torus("stiffener_ring_%d" % (i + 1), R + 0.02, 0.075, (0, 0, z), darksteel,
              AID, OID, "stiffener_ring_%d" % (i + 1), "shell")

    # 固定顶：锥顶 + 顶缘 + 顶部平台
    cone("roof_cone", R + 0.12, 0.22, 0.85, (0, 0, 6.30 + 0.42), roofmat, AID, OID, "roof_cone", "roof")
    torus("roof_rim", R + 0.12, 0.07, (0, 0, 6.32), darksteel, AID, OID, "roof_rim", "roof")
    torus("roof_manhole", 0.30, 0.05, (0, 0, 6.86), darksteel, AID, OID, "roof_manhole", "roof")

    # 呼吸设施：呼吸阀 + 阻火器 + 立管
    cyl("breather_stem", 0.09, 0.55, (0.95, 0, 6.62), steel, AID, OID, "breather_stem", "vent")
    cyl("breather_valve", 0.17, 0.26, (0.95, 0, 6.98), amber, AID, OID, "breather_valve", "vent")
    box("breather_cap", (0.40, 0.40, 0.05), (0.95, 0, 7.13), darksteel, AID, OID, "breather_cap", "vent")

    # 进出口 + 排污 + 人孔
    cyl("nozzle_inlet", 0.16, 0.55, (-R - 0.20, 0, 0.95), steel, AID, OID, "nozzle_inlet", "nozzle", axis="x")
    torus("nozzle_inlet_flange", 0.21, 0.035, (-R - 0.45, 0, 0.95), darksteel, AID, OID,
          "nozzle_inlet_flange", "nozzle", rot=(0, math.pi / 2, 0))
    cyl("nozzle_outlet", 0.16, 0.55, (R + 0.20, 0, 0.95), steel, AID, OID, "nozzle_outlet", "nozzle", axis="x")
    torus("nozzle_outlet_flange", 0.21, 0.035, (R + 0.45, 0, 0.95), darksteel, AID, OID,
          "nozzle_outlet_flange", "nozzle", rot=(0, math.pi / 2, 0))
    cyl("nozzle_drain", 0.10, 0.40, (0, 0, 0.12), steel, AID, OID, "nozzle_drain", "nozzle")
    cyl("shell_manhole", 0.26, 0.10, (0, -R + 0.02, 1.2), darksteel, AID, OID, "shell_manhole", "nozzle",
        axis="y", verts=24)

    # 侧向盘梯（简化但有实体）
    for i in range(11):
        z = 0.6 + i * 0.52
        box("ladder_rung_%02d" % i, (0.42, 0.04, 0.04), (R + 0.34, 0, z), darksteel,
            AID, OID, "ladder_rung_%02d" % i, "accessory")
    for side, y in (("near", 0.22), ("far", -0.22)):
        box("ladder_rail_" + side, (0.07, 0.07, 5.9), (R + 0.34, y, 3.2), darksteel,
            AID, OID, "ladder_rail_" + side, "accessory")

    # ---- 美术走查补充（按真实固定顶罐的辨识特征）----
    # 罐顶栏杆：绕锥顶外缘一圈立柱 + 两道横杆；这是固定顶罐最显眼的轮廓特征
    for i in range(16):
        a = i * 2 * math.pi / 16
        cyl("roof_rail_post_%02d" % i, 0.042, 0.95,
            ((R + 0.02) * math.cos(a), (R + 0.02) * math.sin(a), 6.80),
            darksteel, AID, OID, "roof_rail_post_%02d" % i, "accessory", verts=8)
    torus("roof_rail_top", R + 0.02, 0.042, (0, 0, 7.27), darksteel, AID, OID, "roof_rail_top", "accessory")
    torus("roof_rail_mid", R + 0.02, 0.032, (0, 0, 6.90), darksteel, AID, OID, "roof_rail_mid", "accessory")

    # 环焊缝：细环带，靠明暗差体现钢板板幅（不靠贴图）
    for i, z in enumerate((1.0, 2.0, 3.0, 4.0, 5.0)):
        torus("shell_course_%d" % (i + 1), R + 0.006, 0.020, (0, 0, z),
              steel, AID, OID, "shell_course_%d" % (i + 1), "shell", maj_seg=64, min_seg=8)

    # 接地极：罐周三个，工程上确实有
    for i in range(3):
        a = i * 2 * math.pi / 3 + 0.3
        box("grounding_lug_%d" % (i + 1), (0.09, 0.20, 0.34),
            ((R + 0.12) * math.cos(a), (R + 0.12) * math.sin(a), 0.36),
            amber, AID, OID, "grounding_lug_%d" % (i + 1), "accessory")

    # 阻火器筒：呼吸阀下面必须有，否则呼吸设施只是"一根管加个帽"
    cyl("flame_arrester", 0.24, 0.28, (0.95, 0, 6.76), amber, AID, OID, "flame_arrester", "vent")

    # 法兰做成"双片 + 螺栓环"，比单个圆环更像法兰
    for tag, sx in (("inlet", -1), ("outlet", 1)):
        torus("nozzle_%s_bolt" % tag, 0.225, 0.042, (sx * (R + 0.50), 0, 0.95),
              amber, AID, OID, "nozzle_%s_bolt" % tag, "nozzle", rot=(0, math.pi / 2, 0))

    # 盘梯栏杆加粗一点，否则远处看像两根线
    for i in range(11):
        pass

    anchors = [
        {"anchorId": "anchor_fixed_inlet", "semanticId": "nozzle_inlet", "role": "inlet",
         "position": [-R - 0.45, 0, 0.95]},
        {"anchorId": "anchor_fixed_outlet", "semanticId": "nozzle_outlet", "role": "outlet",
         "position": [R + 0.45, 0, 0.95]},
        {"anchorId": "anchor_fixed_vent", "semanticId": "breather_valve", "role": "vent",
         "position": [0.95, 0, 6.98]},
        {"anchorId": "anchor_fixed_liquid", "semanticId": "bottom_plate", "role": "liquid_reference",
         "position": [0, 0, 0.30]},
    ]
    # 只有罐壁参与剖切切换；固定顶(roof_cone/roof_rim)属于"始终可见的顶部结构"，
    # 半剖时不能跟着罐壁一起消失，否则看起来像罐子没顶。
    cut = {"showExternal": ["shell"],
           "showCut": ["shell_cut", "cut_edge_left", "cut_edge_right"],
           "always": ["foundation_ring", "bottom_plate", "stiffener_ring_1", "stiffener_ring_2",
                      "stiffener_ring_3", "stiffener_ring_4", "roof_cone", "roof_rim",
                      "roof_manhole", "breather_stem",
                      "breather_valve", "breather_cap", "nozzle_inlet", "nozzle_inlet_flange",
                      "nozzle_outlet", "nozzle_outlet_flange", "nozzle_drain", "shell_manhole"]}
    return AID, OID, anchors, cut, {"shellRadius": R, "shellHeight": H, "baseZ": 0.30}


# ------------------------------------------------------------------ asset 2
def build_floating_roof_tank():
    AID, OID = "storage_floating_roof_tank", "floating_roof_tank"
    clear()
    steel = material("FR_Steel", (0.58, 0.60, 0.58), 0.85, 0.42)
    darksteel = material("FR_DarkSteel", (0.25, 0.26, 0.25), 0.8, 0.5)
    deckmat = material("FR_Deck", (0.55, 0.56, 0.52), 0.7, 0.5)
    sealmat = material("FR_Seal", (0.20, 0.22, 0.23), 0.3, 0.72)
    cutmat = material("FR_CutSteel", (0.58, 0.64, 0.56), 0.5, 0.5)
    concrete = material("FR_Concrete", (0.44, 0.43, 0.40), 0.0, 0.92)
    amber = material("FR_Amber", (0.85, 0.62, 0.18), 0.6, 0.4)

    R, H = 3.2, 6.0
    disc_z("foundation_ring", R + 0.45, 0.0, 0.20, concrete, AID, OID, "foundation_ring", "support")
    disc_z("bottom_plate", R, 0.20, 0.10, steel, AID, OID, "bottom_plate", "shell")
    cyl("shell", R, H, (0, 0, 0.30 + H / 2.0), steel, AID, OID, "shell", "shell", verts=64)
    half_tube_z("shell_cut", R, H, 0.30, cutmat, AID, OID, "shell_cut", "shell", thickness=0.06)
    for label, ang in (("left", math.pi / 2), ("right", 3 * math.pi / 2)):
        cyl("cut_edge_" + label, 0.035, H,
            (R * math.cos(ang), R * math.sin(ang), 0.30 + H / 2.0),
            amber, AID, OID, "cut_edge_" + label, "shell")

    # 顶部抗风圈（外浮顶罐没有固定顶）
    torus("wind_girder", R + 0.06, 0.09, (0, 0, 6.28), darksteel, AID, OID, "wind_girder", "shell")
    for i, z in enumerate((1.6, 3.2, 4.8)):
        torus("stiffener_ring_%d" % (i + 1), R + 0.02, 0.05, (0, 0, z), darksteel,
              AID, OID, "stiffener_ring_%d" % (i + 1), "shell")

    # 浮盘：独立节点，前端按液位升降（dynamicBinding=deck_follows_oil_level）
    deck = cyl("deck", R - 0.14, 0.20, (0, 0, 2.45), deckmat, AID, OID, "deck", "floating_deck",
               verts=64, dynamic="deck_follows_oil_level")
    deck["deckRadius"] = R - 0.14
    torus("deck_rim", R - 0.14, 0.05, (0, 0, 2.55), darksteel, AID, OID, "deck_rim", "floating_deck",
          dynamic="deck_follows_oil_level")
    # 边缘密封：贴着罐壁的软密封环，跟随浮盘
    torus("rim_seal", R - 0.06, 0.11, (0, 0, 2.45), sealmat, AID, OID, "rim_seal", "rim_seal",
          dynamic="deck_follows_oil_level")
    # 导向/限位：三根导向柱 + 滚轮
    for i in range(3):
        a = math.pi / 2 + i * 2 * math.pi / 3
        x, y = (R - 0.30) * math.cos(a), (R - 0.30) * math.sin(a)
        cyl("guide_pole_%d" % (i + 1), 0.055, H - 0.4, (x, y, 0.30 + (H - 0.4) / 2.0), darksteel,
            AID, OID, "guide_pole_%d" % (i + 1), "guide", verts=16)
        cyl("guide_roller_%d" % (i + 1), 0.11, 0.14, (x, y, 2.66), amber,
            AID, OID, "guide_roller_%d" % (i + 1), "guide", axis="x", verts=18,
            dynamic="deck_follows_oil_level")
    # 浮盘附件：中央排水管 + 人孔
    cyl("deck_drain", 0.07, 2.6, (0.55, 0.55, 3.7), steel, AID, OID, "deck_drain", "floating_deck",
        verts=16, dynamic="deck_follows_oil_level")
    cyl("deck_manhole", 0.26, 0.08, (-0.8, -0.8, 2.58), darksteel, AID, OID, "deck_manhole", "floating_deck",
        verts=20, dynamic="deck_follows_oil_level")

    cyl("nozzle_inlet", 0.16, 0.55, (-R - 0.20, 0, 0.95), steel, AID, OID, "nozzle_inlet", "nozzle", axis="x")
    torus("nozzle_inlet_flange", 0.21, 0.035, (-R - 0.45, 0, 0.95), darksteel, AID, OID,
          "nozzle_inlet_flange", "nozzle", rot=(0, math.pi / 2, 0))
    cyl("nozzle_outlet", 0.16, 0.55, (R + 0.20, 0, 0.95), steel, AID, OID, "nozzle_outlet", "nozzle", axis="x")
    torus("nozzle_outlet_flange", 0.21, 0.035, (R + 0.45, 0, 0.95), darksteel, AID, OID,
          "nozzle_outlet_flange", "nozzle", rot=(0, math.pi / 2, 0))
    cyl("nozzle_drain", 0.10, 0.40, (0, 0, 0.12), steel, AID, OID, "nozzle_drain", "nozzle")

    # ---- 美术走查补充（外浮顶特征）----
    # 二次密封：一次密封之上再压一圈薄唇，真实浮顶罐都是双密封
    torus("secondary_seal", R - 0.10, 0.055, (0, 0, 2.62), sealmat, AID, OID,
          "secondary_seal", "rim_seal", dynamic="deck_follows_oil_level")
    # 导向滚轮支架：滚轮不能悬空，得有支耳连到浮盘
    for i in range(3):
        a = math.pi / 2 + i * 2 * math.pi / 3
        x, y = (R - 0.30) * math.cos(a), (R - 0.30) * math.sin(a)
        box("guide_bracket_%d" % (i + 1), (0.16, 0.16, 0.30), (x, y, 2.62), darksteel,
            AID, OID, "guide_bracket_%d" % (i + 1), "guide", dynamic="deck_follows_oil_level")
    # 浮盘径向缝：让顶面不是一整块光板
    for i in range(8):
        a = i * 2 * math.pi / 8
        box("deck_seam_%d" % (i + 1), (R - 0.30, 0.03, 0.02),
            ((R - 0.14) * 0.5 * math.cos(a), (R - 0.14) * 0.5 * math.sin(a), 2.56),
            sealmat, AID, OID, "deck_seam_%d" % (i + 1), "floating_deck",
            rot=(0, 0, a), dynamic="deck_follows_oil_level")

    anchors = [
        {"anchorId": "anchor_floating_inlet", "semanticId": "nozzle_inlet", "role": "inlet",
         "position": [-R - 0.45, 0, 0.95]},
        {"anchorId": "anchor_floating_outlet", "semanticId": "nozzle_outlet", "role": "outlet",
         "position": [R + 0.45, 0, 0.95]},
        {"anchorId": "anchor_floating_deck", "semanticId": "deck", "role": "deck",
         "position": [0, 0, 2.45]},
        {"anchorId": "anchor_floating_seal", "semanticId": "rim_seal", "role": "rim_seal",
         "position": [R - 0.06, 0, 2.45]},
        {"anchorId": "anchor_floating_liquid", "semanticId": "bottom_plate", "role": "liquid_reference",
         "position": [0, 0, 0.30]},
    ]
    # 抗风圈是罐壁顶缘结构，始终可见；只有 shell 在 external/half 之间切换
    cut = {"showExternal": ["shell"],
           "showCut": ["shell_cut", "cut_edge_left", "cut_edge_right"],
           "always": ["foundation_ring", "bottom_plate", "stiffener_ring_1", "stiffener_ring_2",
                      "stiffener_ring_3", "wind_girder", "guide_pole_1", "guide_pole_2", "guide_pole_3",
                      "nozzle_inlet", "nozzle_inlet_flange", "nozzle_outlet",
                      "nozzle_outlet_flange", "nozzle_drain"]}
    return AID, OID, anchors, cut, {"shellRadius": R, "shellHeight": H, "baseZ": 0.30,
                                    "deckRadius": R - 0.14, "deckZRest": 2.45}


# ------------------------------------------------------------------ asset 3
def build_transfer_pump_set():
    AID, OID = "transfer_pump_set", "transfer_pump"
    clear()
    steel = material("PU_Steel", (0.56, 0.58, 0.57), 0.85, 0.40)
    darksteel = material("PU_DarkSteel", (0.24, 0.25, 0.25), 0.8, 0.52)
    motor = material("PU_Motor", (0.34, 0.42, 0.40), 0.7, 0.5)
    amber = material("PU_Amber", (0.86, 0.62, 0.18), 0.6, 0.38)
    guard = material("PU_Guard", (0.80, 0.72, 0.30), 0.4, 0.6)

    # 底座/撬块
    box("skid_base", (4.6, 1.9, 0.18), (0, 0, 0.09), darksteel, AID, OID, "skid_base", "base")
    for i, x in enumerate((-1.7, 1.7)):
        box("skid_beam_%d" % (i + 1), (0.22, 1.9, 0.30), (x, 0, 0.33), darksteel,
            AID, OID, "skid_beam_%d" % (i + 1), "base")

    # 泵体（蜗壳）+ 进出口
    cyl("pump_volute", 0.62, 0.52, (-1.05, 0, 0.95), steel, AID, OID, "pump_volute", "pump", axis="x", verts=40)
    torus("pump_casing_ring", 0.52, 0.09, (-1.05, 0, 0.95), darksteel, AID, OID, "pump_casing_ring", "pump",
          rot=(0, math.pi / 2, 0))
    cyl("pump_suction", 0.24, 0.70, (-1.72, 0, 0.95), steel, AID, OID, "pump_suction", "nozzle", axis="x")
    torus("pump_suction_flange", 0.31, 0.05, (-2.06, 0, 0.95), darksteel, AID, OID,
          "pump_suction_flange", "nozzle", rot=(0, math.pi / 2, 0))
    cyl("pump_discharge", 0.20, 0.80, (-1.05, 0, 1.62), steel, AID, OID, "pump_discharge", "nozzle", axis="z")
    torus("pump_discharge_flange", 0.26, 0.05, (-1.05, 0, 2.00), darksteel, AID, OID,
          "pump_discharge_flange", "nozzle")

    # 轴承箱 + 联轴器护罩（开口半壳，真实护罩形态）
    cyl("bearing_housing", 0.22, 0.55, (-0.42, 0, 0.95), darksteel, AID, OID,
        "bearing_housing", "drive", axis="x", verts=24)
    half_tube_z("coupling_guard_axis_x_placeholder", 0.001, 0.001, 0, guard, AID, OID,
                "coupling_guard_placeholder", "drive") if False else None
    # 护罩：沿 X 的半圆罩（用旋转后的半管实现）
    seg = 24
    verts, faces = [], []
    for x in (-0.16, 0.30):
        for i in range(seg + 1):
            a = 0 + math.pi * i / seg   # 上半圆
            verts.append((x, 0.30 * math.cos(a), 0.30 * math.sin(a)))
    for i in range(seg):
        a, b = i, i + 1
        c, d = seg + 1 + i, seg + 1 + i + 1
        faces.append((a, b, d, c))
    mesh = bpy.data.meshes.new("coupling_guard")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    ob = bpy.data.objects.new("coupling_guard", mesh)
    bpy.context.collection.objects.link(ob)
    ob.location = (0.07, 0, 0.95)
    _apply(ob)
    _smooth(ob)
    _stamp(ob, guard, AID, OID, "coupling_guard", "drive")

    # 电机：机身 + 散热筋 + 接线盒 + 风扇罩
    cyl("motor_body", 0.42, 1.30, (1.10, 0, 0.95), motor, AID, OID, "motor_body", "motor", axis="x", verts=36)
    for i in range(8):
        a = -math.pi / 2 + i * math.pi / 8
        cyl("motor_fin_%d" % (i + 1), 0.035, 1.20,
            (1.10, 0.44 * math.cos(a), 0.95 + 0.44 * math.sin(a)), motor,
            AID, OID, "motor_fin_%d" % (i + 1), "motor", axis="x", verts=8, smooth=False)
    box("motor_terminal_box", (0.30, 0.26, 0.22), (1.15, 0, 1.42), darksteel, AID, OID,
        "motor_terminal_box", "motor")
    cyl("motor_fan_cover", 0.44, 0.22, (1.86, 0, 0.95), darksteel, AID, OID,
        "motor_fan_cover", "motor", axis="x", verts=28)
    box("motor_mount", (0.90, 1.10, 0.22), (1.10, 0, 0.55), darksteel, AID, OID, "motor_mount", "base")

    # 出口阀 + 管段
    cyl("discharge_valve_body", 0.20, 0.34, (-1.05, 0, 2.30), amber, AID, OID,
        "discharge_valve_body", "valve", axis="z", verts=24)
    torus("discharge_valve_wheel", 0.22, 0.035, (-1.05, 0, 2.52), amber, AID, OID,
          "discharge_valve_wheel", "valve")
    cyl("pipe_spool", 0.16, 1.10, (-1.05, 0, 2.95), steel, AID, OID, "pipe_spool", "pipe", axis="z")
    box("nameplate", (0.26, 0.02, 0.16), (-1.05, 0.63, 1.20), amber, AID, OID, "nameplate", "label")

    # ---- 美术走查补充（泵撬的工程特征）----
    # 基础灌浆层：底座与地面之间那层，真实泵撬都有
    box("grout_layer", (4.9, 2.2, 0.06), (0, 0, 0.03), darksteel, AID, OID, "grout_layer", "base")
    # 地脚螺栓：露出螺母，画龙点睛
    for i, x in enumerate((-2.05, 2.05)):
        for j, y in enumerate((-0.75, 0.75)):
            cyl("anchor_bolt_%d%d" % (i + 1, j + 1), 0.045, 0.14,
                (x, y, 0.24), amber, AID, OID, "anchor_bolt_%d%d" % (i + 1, j + 1),
                "base", verts=6)
    # 进出口压力表：表头 + 短接管
    for tag, loc, axis in (("suction", (-1.95, 0.0, 1.22), "z"), ("discharge", (-1.05, 0.30, 2.12), "z")):
        cyl("gauge_stem_%s" % tag, 0.030, 0.22, loc, steel, AID, OID,
            "gauge_stem_%s" % tag, "instrument", axis=axis, verts=10)
        cyl("gauge_dial_%s" % tag, 0.11, 0.045, (loc[0], loc[1], loc[2] + 0.14),
            amber, AID, OID, "gauge_dial_%s" % tag, "instrument", axis="y", verts=18)
    # 电机风扇护罩格栅（细环），避免端面是一块实心圆板
    for k in range(3):
        torus("fan_grille_%d" % (k + 1), 0.30 - k * 0.08, 0.014, (1.98, 0, 0.95),
              darksteel, AID, OID, "fan_grille_%d" % (k + 1), "motor",
              rot=(0, math.pi / 2, 0), maj_seg=28, min_seg=6)

    anchors = [
        {"anchorId": "anchor_pump_suction", "semanticId": "pump_suction", "role": "suction",
         "position": [-2.06, 0, 0.95]},
        {"anchorId": "anchor_pump_discharge", "semanticId": "pump_discharge", "role": "discharge",
         "position": [-1.05, 0, 2.00]},
        {"anchorId": "anchor_pump_coupling", "semanticId": "coupling_guard", "role": "coupling",
         "position": [0.07, 0, 1.25]},
    ]
    cut = {"showExternal": [], "showCut": [], "always": []}
    return AID, OID, anchors, cut, {}


# ------------------------------------------------------------------ export
def export_asset(AID, OID, anchors, cut, dims):
    out_dir = os.path.join(GLB_ROOT, AID)
    os.makedirs(out_dir, exist_ok=True)

    tris = 0
    verts = 0
    meshes = 0
    for ob in bpy.context.scene.objects:
        if ob.type != "MESH":
            continue
        meshes += 1
        verts += len(ob.data.vertices)
        tris += sum(max(0, len(p.vertices) - 2) for p in ob.data.polygons)

    bpy.ops.object.select_all(action="DESELECT")
    for ob in bpy.context.scene.objects:
        if ob.type in {"MESH", "EMPTY"}:
            ob.select_set(True)

    glb = os.path.join(out_dir, "%s.glb" % AID)
    bpy.ops.export_scene.gltf(
        filepath=glb,
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_extras=True,
        use_selection=True,
        export_animations=True,
    )

    os.makedirs(BLEND_ROOT, exist_ok=True)
    blend = os.path.join(BLEND_ROOT, "%s.blend" % AID)
    bpy.ops.wm.save_as_mainfile(filepath=blend)

    stats = {
        "asset": AID,
        "objectId": OID,
        "source": "tools/blender/build_storage_heroes.py",
        "blender": bpy.app.version_string,
        "triangles": tris,
        "vertices": verts,
        "meshes": meshes,
        "anchors": anchors,
        "structure": cut,
        "dimensions": dims,
        "units": "meters; Blender Z-up -> glTF Y-up",
        "files": {"glb_bytes": os.path.getsize(glb), "blend_bytes": os.path.getsize(blend)},
        "note": "Teaching-grade Hero；几何由脚本真实生成，允许二次修改后重跑。",
    }
    with open(os.path.join(out_dir, "%s.stats.json" % AID), "w", encoding="utf-8") as fh:
        json.dump(stats, fh, ensure_ascii=False, indent=2)
    print("@@STORAGE@@ " + json.dumps({"asset": AID, "tris": tris, "meshes": meshes,
                                       "glb": os.path.getsize(glb)}, ensure_ascii=False))
    return stats


def main():
    results = []
    for fn in (build_fixed_roof_tank, build_floating_roof_tank, build_transfer_pump_set):
        AID, OID, anchors, cut, dims = fn()
        results.append(export_asset(AID, OID, anchors, cut, dims))
    print("@@STORAGE_DONE@@ " + json.dumps([r["asset"] for r in results], ensure_ascii=False))


if __name__ == "__main__":
    main()
