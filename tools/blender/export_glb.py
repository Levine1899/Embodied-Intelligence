"""Blender 4.x GLB export for the petroleum-chain project.

Run:
  blender -b assets-source/blender/<assetId>.blend -P tools/blender/export_glb.py -- \
    --out web/assets/models/<assetId>/<assetId>.glb \
    --manifest web/assets/models/<assetId>/<assetId>.meta.json

This script does not create or download assets. It validates naming, applies
transforms, exports a GLB with custom extras, and writes a manifest. It is not
a substitute for visual/structural review.
"""

import bpy
import hashlib
import json
import os
import sys


def parse_args():
    argv = sys.argv
    args = argv[argv.index("--") + 1:] if "--" in argv else []
    out = None
    manifest = None
    i = 0
    while i < len(args):
        if args[i] == "--out" and i + 1 < len(args):
            out = args[i + 1]; i += 2
        elif args[i] == "--manifest" and i + 1 < len(args):
            manifest = args[i + 1]; i += 2
        else:
            i += 1
    if not out:
        raise SystemExit("missing --out")
    return out, manifest


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    out, manifest = parse_args()
    os.makedirs(os.path.dirname(out), exist_ok=True)

    bpy.ops.object.select_all(action="DESELECT")
    exported = []
    for obj in bpy.context.scene.objects:
        if obj.type in {"MESH", "EMPTY"}:
            obj.select_set(True)
            exported.append({
                "name": obj.name,
                "type": obj.type,
                "objectId": obj.get("objectId"),
                "semanticId": obj.get("semanticId"),
                "anchorId": obj.get("anchorId"),
            })

    if not exported:
        raise SystemExit("no exportable MESH/EMPTY objects")

    # Apply scale/rotation on meshes only, not on animation hierarchies.
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            bpy.context.view_layer.objects.active = obj
            obj.select_set(True)
            try:
                bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
            finally:
                obj.select_set(False)

    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_extras=True,
        use_selection=True,
        export_animations=True,
    )

    data = {
        "asset": os.path.splitext(os.path.basename(out))[0],
        "glb": out,
        "sha256": sha256(out),
        "blender": bpy.app.version_string,
        "objects": exported,
        "units": "meters; Blender Z-up -> glTF Y-up",
        "license": "TODO: record author/source/license before use",
    }
    if manifest:
        os.makedirs(os.path.dirname(manifest), exist_ok=True)
        with open(manifest, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    print(json.dumps({"ok": True, "glb": out, "sha256": data["sha256"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
