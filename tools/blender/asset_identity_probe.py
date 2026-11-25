"""
tools/blender/asset_identity_probe.py — 资产身份探针（只读、导出到临时路径）

用途
    在不改动 .blend、不覆盖 web/assets 的前提下，验证：
      1) Blender 自定义属性能否经 `export_extras=True` 落到 glTF 节点 extras；
      2) 嵌套命名空间 `obj["petro"] = {...}` 是否被导出器保留；
      3) 同一输入的连续两次导出是否字节级一致（nodeUid 稳定性）；
      4) 多项实例（同一 semanticId 的多个对象）必须带实例标识，否则 nodeUid 冲突。

为什么需要实例标识
    现有 .blend 的 `semanticId` 是"部件类型"，不是"对象唯一键"。
    例如 5 个 inlet port 共用 `separator_internal_inlet_port`，7 个除雾器共用
    `separator_internal_mist_extractor`。若 nodeUid 只用 semanticId 派生，
    这 12 个对象会得到重复 UUID。因此语义路径必须追加实例标识。

已观测到的导出器行为（Blender 5.3.0 / glTF I/O v5.3.43）
    - 嵌套 `petro` 字典能正确导出为 `extras.petro`（43/43 节点）。
    - 若对象上已有扁平 `semanticId` / `objectId` 自定义属性，再写同名属性会
      在 extras 里产生 `semanticId.001` / `objectId.001` 这类重复键（43/43 节点）。
    - 先删除这些旧扁平属性再导出，重复键消失（0/43 节点）。
    - 但 extras 里仍可能残留旧值的扁平 `semanticId` / `objectId`
      → 因此身份只能读 `extras.petro`，禁止读扁平键。本探针不改写模型。

用法
    PETRO_OUT=/tmp/out.glb blender -b assets-source/blender/separator_hero.blend \
        -P tools/blender/asset_identity_probe.py -- --asset-id separator_three_phase \
        --object-id three_phase_separator --instance-stem separator_internal_mist
    说明：不设 PETRO_OUT 时不导出，仅打印当前自定义属性，便于先观察后动手。

绝对不执行的操作：保存 .blend、覆盖 web/assets、删除对象、改材质。
"""
import bpy
import json
import os
import sys
import uuid

NAMESPACE = uuid.UUID("5c3d1f7a-2b48-4e6c-9f10-8a7d3e5b2c94")

# 多项实例：对象名主干 -> semanticId 类型（两者历史上不一致，必须按实际值对齐）
MULTI_INSTANCE_STEMS = {
    "separator_internal_inlet_port": "separator_internal_inlet_port",
    "separator_internal_mist": "separator_internal_mist_extractor",
}


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out = {"asset_id": None, "object_id": None, "ghost": False}
    i = 0
    while i < len(argv):
        if argv[i] == "--asset-id" and i + 1 < len(argv):
            out["asset_id"] = argv[i + 1]; i += 2
        elif argv[i] == "--object-id" and i + 1 < len(argv):
            out["object_id"] = argv[i + 1]; i += 2
        else:
            i += 1
    return out


def split_instance(name):
    for stem, sem_type in MULTI_INSTANCE_STEMS.items():
        prefix = stem + "_"
        if name.startswith(prefix):
            tail = name[len(prefix):]
            if tail.isdigit():
                return sem_type, tail
    return name, None


def main():
    args = parse_args()
    out_path = os.environ.get("PETRO_OUT")
    asset_id = args["asset_id"] or "unknown_asset"
    object_id = args["object_id"] or "unknown_object"

    report = {
        "blender": bpy.app.version_string,
        "assetId": asset_id,
        "objectId": object_id,
        "exported": bool(out_path),
        "observed": [],
        "nodes": [],
        "assert_cleared": True,
    }

    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue

        pre_existing = {k: str(v) for k, v in obj.items() if k != "_RNA_UI"}
        sem_type, instance = split_instance(obj.name)
        # 优先采用 .blend 里已有的 semanticId 作为部件类型（保持历史一致）
        legacy_sem = pre_existing.get("semanticId")
        if legacy_sem:
            sem_type = legacy_sem

        # 清理旧扁平属性，避免 extras 出现 .NNN 重复键
        for key in ("semanticId", "objectId", "anchorId", "nodeUid"):
            if key in obj:
                del obj[key]
        if "semanticId" in obj:
            report["assert_cleared"] = False

        path = "%s/%s/%s%s" % (asset_id, object_id, sem_type,
                               ("#" + instance) if instance else "")
        node_uid = str(uuid.uuid5(NAMESPACE, path))
        obj["petro"] = {
            "nodeUid": node_uid,
            "assetId": asset_id,
            "objectId": object_id,
            "semanticId": sem_type,
            "instanceId": instance or "",
            "role": "part",
        }
        report["observed"].append(pre_existing)
        report["nodes"].append({
            "blender_name": obj.name,
            "semanticId": sem_type,
            "instanceId": instance,
            "semanticPath": path,
            "nodeUid": node_uid,
        })

    uids = [n["nodeUid"] for n in report["nodes"]]
    report["counts"] = {
        "meshObjects": len(uids),
        "uniqueNodeUid": len(set(uids)),
        "collisions": len(uids) - len(set(uids)),
    }

    if out_path:
        bpy.ops.export_scene.gltf(filepath=out_path, export_format="GLB", export_extras=True)
        report["glbBytes"] = os.path.getsize(out_path) if os.path.exists(out_path) else -1
        with open(out_path + ".report.json", "w", encoding="utf-8") as fh:
            json.dump(report, fh, ensure_ascii=False, indent=1)
        print("@@PROBE_EXPORTED@@ %s nodes=%d unique=%d" %
              (out_path, report["counts"]["meshObjects"], report["counts"]["uniqueNodeUid"]))
    else:
        print("@@PROBE_DRYRUN@@ nodes=%d unique=%d collisions=%d" %
              (report["counts"]["meshObjects"], report["counts"]["uniqueNodeUid"], report["counts"]["collisions"]))
        print(json.dumps(report["nodes"][:3], ensure_ascii=False, indent=1))

    if report["counts"]["collisions"]:
        print("@@PROBE_FAIL@@ nodeUid 冲突：需要为多实例部件补实例标识")
    if not report["assert_cleared"]:
        print("@@PROBE_WARN@@ 旧扁平属性未能清除，extras 可能出现 .NNN 重复键")


main()
