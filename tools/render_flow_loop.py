"""渲染首页动图海报：半剖视角左右摆动 + 塔内汽液流动 + 罐间横向输送。

用法：
  blender -b -P tools/render_flow_loop.py -- web/assets/tower

形态说明：
  - 汽相：细长圆锥（底部朝下、尖端朝上），像上升的汽柱
  - 液相：压扁的椭球，像下落液滴
  - 塔板：每层加一圈薄液膜，轻微脉动
  - 罐间：沿管线表面走的小球（加热炉→常压塔、塔底→减压塔、侧线→冷凝器、塔顶→冷凝器）
周期 288 帧 = 12 秒 @24fps；汽相 96、液相 144，都能整除，循环无缝。
"""
import bpy, os, sys, math
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "make_tower.py")

code = open(SRC, encoding="utf-8").read()
build_part = code.split("\ntry:\n")[0]
exec(compile(build_part, "make_tower_build", "exec"), globals())

OUT = os.path.abspath(sys.argv[sys.argv.index("--") + 1]) if "--" in sys.argv else os.getcwd()
os.makedirs(OUT, exist_ok=True)

scene = bpy.context.scene
setup_render()

for o in HALF:
    o.hide_render = False
for n in ("Tower_Atmospheric_Shell", "Tower_Atmospheric_Dome",
          "Tower_Vacuum_Shell", "Tower_Vacuum_Dome"):
    o = bpy.data.objects.get(n)
    if o:
        o.hide_render = True


def action_fcurves(action):
    """Blender 5 的 Action 是 layered Action；旧版才直接有 fcurves。"""
    if action is None:
        return []
    if hasattr(action, "fcurves"):
        return list(action.fcurves)
    out = []
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                out.extend(bag.fcurves)
    return out

FPS = 24
FRAMES = 288
scene.render.fps = FPS
scene.frame_start = 1
scene.frame_end = FRAMES
scene.render.resolution_x = 1920
scene.render.resolution_y = 1200
scene.render.resolution_percentage = 100

VAPOR = mat("FlowVapor", (0.46, 0.96, 1.0))
LIQUID = mat("FlowLiquid", (1.0, 0.60, 0.10))
DROP = mat("FlowDrop", (1.0, 0.74, 0.28))
FILM = mat("FlowFilm", (0.58, 0.32, 0.07))


def cone(name, r, depth, loc, material=STEEL):
    bpy.ops.mesh.primitive_cone_add(vertices=20, radius1=r, depth=depth, location=loc)
    o = bpy.context.object
    o.name = name
    return assign(o, material)


def flow(name, x, r_in, r_out, z0, z1, count, period, material, radius, shape="cone", height=1.1, phase_twist=0.0):
    """塔内上下循环流动。shape: cone（汽柱）/ drop（液滴）。"""
    for i in range(count):
        ang = (i / count) * math.tau * 2.0 + phase_twist
        rr = r_in + (r_out - r_in) * ((i * 5) % count) / max(count - 1, 1)
        px, py = x + rr * math.cos(ang), rr * math.sin(ang)
        if shape == "cone":
            o = cone(f"{name}_{i}", radius, height, (px, py, z0), material=material)
        else:
            o = sphere(f"{name}_{i}", radius, (px, py, z0), scale_z=1.75, material=material)
        for f in range(1, FRAMES + 1):
            t = (((f - 1) / period) + (i / count)) % 1.0
            o.location.z = z0 + (z1 - z0) * t
            o.keyframe_insert("location", index=2, frame=f)


def path_flow(name, pts, count, period, material, radius):
    """沿折线移动的小球（罐间横向输送）。"""
    segs, total = [], 0.0
    for i in range(len(pts) - 1):
        a, b = Vector(pts[i]), Vector(pts[i + 1])
        L = (b - a).length
        segs.append((total, L, a, b))
        total += L
    for i in range(count):
        o = sphere(f"{name}_{i}", radius, pts[0], material=material)
        for f in range(1, FRAMES + 1):
            s = ((((f - 1) / period) + (i / count)) % 1.0) * total
            for s0, L, a, b in segs:
                if s <= s0 + L or (s0, L, a, b) == segs[-1]:
                    t = (s - s0) / L if L else 0.0
                    p = a.lerp(b, min(max(t, 0.0), 1.0))
                    break
            o.location = p
            for idx in (0, 1, 2):
                o.keyframe_insert("location", index=idx, frame=f)


def tray_film(name, x, z, r):
    """塔板上的液膜：一圈薄盘，缓慢脉动。"""
    o = bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=r, depth=0.045,
                                            location=(x, 0, z), )
    o = bpy.context.object
    o.name = name
    assign(o, FILM)
    for f, s in ((1, 1.0), (48, 0.965), (96, 1.0)):
        o.scale = (s, s, 1.0)
        o.keyframe_insert("scale", frame=f)
    for fc in action_fcurves(o.animation_data.action):
        m = fc.modifiers.new("CYCLES")
    return o


# 汽相：细长汽柱
flow("VaporA", ATM_X, 0.35, ATM_R - 0.55, ATM_BASE + 0.7, ATM_BASE + ATM_H - 1.4, 16, 96, VAPOR, 0.19, "cone", 1.05)
flow("VaporV", VAC_X, 0.38, VAC_R - 0.55, VAC_BASE + 0.7, VAC_BASE + VAC_H - 1.2, 11, 96, VAPOR, 0.19, "cone", 0.95)
# 液相：下落液滴
flow("LiquidA", ATM_X, ATM_R - 0.80, ATM_R - 0.30, ATM_BASE + ATM_H - 1.6, ATM_BASE + 0.5, 12, 144, DROP, 0.15, "drop")
flow("LiquidV", VAC_X, VAC_R - 0.85, VAC_R - 0.35, VAC_BASE + VAC_H - 1.4, VAC_BASE + 0.5, 9, 144, DROP, 0.15, "drop")
# 塔板液膜
for i in range(16):
    tray_film(f"FilmA_{i}", ATM_X, 4.6 + i * 1.28 + 0.09, ATM_R - 0.78)
for i in range(9):
    tray_film(f"FilmV_{i}", VAC_X, 4.2 + i * 1.3 + 0.09, VAC_R - 0.82)
# 罐间横向输送
path_flow("FlowFeed", [(-6.8, 0, 7.55), (-6.8, 0, 13.55), (-2.2, 0, 13.55)], 5, 96, LIQUID, 0.15)
path_flow("FlowBottom", [(2.15, 0, 3.68), (5.00, 0, 3.68)], 5, 96, LIQUID, 0.15)
path_flow("FlowTop", [(2.2, 0, 26.4), (2.2, 0, 28.85), (5.8, 0, 28.85)], 4, 96, VAPOR, 0.17)
for name, z, cn, sx, sy in SIDE:
    path_flow(f"FlowSide{int(z * 10)}", [(2.2, 0, z), (2.2, sy, z), (sx, sy, z), (sx, sy, 9.0)], 3, 144, LIQUID, 0.13)

# 相机：绕开口侧（-Y）左右摆动 + 轻微升降
TARGET = Vector((1.0, 0.0, 12.5))
RADIUS, HEIGHT = 76.0, 28.0
BASE_A, SWAY = -math.pi / 2, 0.55
bpy.ops.object.camera_add(location=(TARGET.x + RADIUS, 0, HEIGHT))
cam = bpy.context.object
cam.data.lens = 50
scene.camera = cam
for f in range(1, FRAMES + 1):
    a = BASE_A + SWAY * math.sin(math.tau * (f - 1) / FRAMES)
    h = HEIGHT + 2.4 * math.sin(math.tau * (f - 1) / FRAMES * 2.0)
    loc = Vector((TARGET.x + RADIUS * math.cos(a), TARGET.y + RADIUS * math.sin(a), h))
    cam.location = loc
    cam.rotation_euler = (TARGET - loc).to_track_quat("-Z", "Y").to_euler()
    cam.keyframe_insert("location", frame=f)
    cam.keyframe_insert("rotation_euler", frame=f)
for fc in action_fcurves(cam.animation_data.action):
    for kp in fc.keyframe_points:
        kp.interpolation = "BEZIER"

# 流动粒子匀速
for ob in bpy.data.objects:
    if ob.name.startswith(("Vapor", "Liquid", "Flow")) and ob.animation_data:
        for fc in action_fcurves(ob.animation_data.action):
            for kp in fc.keyframe_points:
                kp.interpolation = "LINEAR"

r = scene.render
# Blender 5.3 的当前构建没有 FFMPEG 输出；先渲染 PNG，再由 ffmpeg 编码。
frames_dir = os.path.join(OUT, "hero-frames")
os.makedirs(frames_dir, exist_ok=True)
for old in os.listdir(frames_dir):
    if old.endswith(".png"):
        os.remove(os.path.join(frames_dir, old))
r.image_settings.file_format = "PNG"
r.filepath = os.path.join(frames_dir, "hero-")
r.use_file_extension = True

bpy.ops.render.render(animation=True)

produced = sorted(f for f in os.listdir(frames_dir) if f.startswith("hero-") and f.endswith(".png"))
print("[ok] frames:", len(produced), produced[:1], produced[-1:])
