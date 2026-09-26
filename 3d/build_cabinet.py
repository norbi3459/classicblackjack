"""Builds the Classic Black Jack cabinet from scratch, saves the .blend and renders previews.

Run:  blender --background --factory-startup --python build_cabinet.py
"""
import bpy
import bmesh
import math
import os
import sys
import time
from mathutils import Vector

ROOT = os.path.dirname(os.path.abspath(__file__))
TEX = os.path.join(ROOT, "textures")
RENDERS = os.path.join(ROOT, "renders")
os.makedirs(RENDERS, exist_ok=True)

ONLY_SAVE = "--no-render" in sys.argv

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
coll = scene.collection

# ---------------------------------------------------------------- dimensions (m)
W = 0.66                # overall width
T = 0.020               # side panel thickness
WI = W - 2 * T          # inner width
YB = 0.35               # world Y of the back face; the machine faces -Y


def Y(f):
    """f = distance forward from the back face."""
    return YB - f


DECK_NOSE = [
    (0.59, 0.89), (0.63, 0.905), (0.67, 0.918), (0.705, 0.932), (0.725, 0.95), (0.732, 0.97),
    (0.728, 0.988), (0.715, 1.000), (0.585, 1.030),
]

SIDE_PROFILE = [
    (0.00, 0.00), (0.50, 0.00), (0.50, 0.74), (0.505, 0.79), (0.52, 0.83), (0.55, 0.865),
    *DECK_NOSE,
    (0.415, 1.335), (0.405, 1.355), (0.395, 1.975), (0.385, 1.993), (0.37, 2.0),
    (0.02, 2.0), (0.0, 1.98),
]

DECK_PROFILE = [(0.36, 0.89), *DECK_NOSE, (0.36, 1.030)]

# reel glass runs along the side-profile edge (0.585,1.030) -> (0.415,1.335)
REEL_A = Vector((0.585, 1.030))
REEL_B = Vector((0.415, 1.335))
REEL_DIR = (REEL_B - REEL_A).normalized()
REEL_OUT = Vector((-REEL_DIR.y, REEL_DIR.x)) * -1   # outward normal in (f, z)
if REEL_OUT.x < 0:
    REEL_OUT = -REEL_OUT
REEL_TILT = math.atan2(REEL_OUT.x, REEL_OUT.y)       # rotation about X for the panel

# deck top surface (buttons sit on it)
DECK_TOP_A = Vector((0.585, 1.030))
DECK_TOP_B = Vector((0.715, 1.000))
DECK_SLOPE = math.atan2(DECK_TOP_A.y - DECK_TOP_B.y, DECK_TOP_B.x - DECK_TOP_A.x)


# ---------------------------------------------------------------- materials
def principled(name, base=(0.02, 0.02, 0.02), rough=0.3, metal=0.0, coat=0.0,
               coat_rough=0.05, emit_img=None, emit_color=None, emit_strength=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*base, 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if coat:
        b.inputs["Coat Weight"].default_value = coat
        b.inputs["Coat Roughness"].default_value = coat_rough
    if emit_img:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = bpy.data.images.load(emit_img)
        tex.interpolation = "Cubic"
        tex.location = (-400, 0)
        nt.links.new(tex.outputs["Color"], b.inputs["Emission Color"])
        b.inputs["Emission Strength"].default_value = emit_strength
    elif emit_color:
        b.inputs["Emission Color"].default_value = (*emit_color, 1.0)
        b.inputs["Emission Strength"].default_value = emit_strength
    return m


M_BODY = principled("Cabinet_Black_Gloss", base=(0.006, 0.006, 0.007), rough=0.32, coat=0.2, coat_rough=0.1)
M_MATTE = principled("Cabinet_Black_Matte", base=(0.006, 0.006, 0.006), rough=0.75)
M_CAVITY = principled("Cavity_Dark", base=(0.01, 0.01, 0.011), rough=0.85)
M_CHROME = principled("Chrome", base=(0.9, 0.9, 0.92), rough=0.12, metal=1.0)
M_BRASS = principled("Brass", base=(0.85, 0.65, 0.28), rough=0.25, metal=1.0)
M_YELLOW = principled("Coin_Cup_Yellow", base=(0.95, 0.62, 0.03), rough=0.35)
M_GREY = principled("Coin_Mech_Grey", base=(0.06, 0.06, 0.065), rough=0.5)
M_BLUE = principled("Key_Tag_Blue", base=(0.05, 0.15, 0.7), rough=0.4)
def best_texture(name):
    final = os.path.join(TEX, f"{name}_final.png")
    return final if os.path.exists(final) else os.path.join(TEX, f"{name}_raw.png")


M_TOP_GLASS = principled("Top_Glass", base=(0.0, 0.0, 0.0), rough=0.1, coat=0.3, coat_rough=0.06,
                         emit_img=best_texture("top_glass"), emit_strength=1.0)
M_REEL_GLASS = principled("Reel_Glass", base=(0.0, 0.0, 0.0), rough=0.1, coat=0.3, coat_rough=0.06,
                          emit_img=best_texture("reel_glass"), emit_strength=1.0)
M_FLOOR = principled("Floor", base=(0.32, 0.32, 0.31), rough=0.5)
M_WALL = principled("Wall", base=(0.5, 0.5, 0.49), rough=0.9)


# ---------------------------------------------------------------- geometry helpers
def link(ob, parent=None):
    coll.objects.link(ob)
    if parent is not None:
        ob.parent = parent
    return ob


def add_bevel(ob, width):
    mod = ob.modifiers.new("Bevel", "BEVEL")
    mod.width = width
    mod.segments = 3
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(30)
    mod.harden_normals = True
    for p in ob.data.polygons:
        p.use_smooth = True


def prism(name, profile, x0, x1, mat, bevel=0.0):
    """Extrude an (f, z) profile along X between x0 and x1."""
    bm = bmesh.new()
    a = [bm.verts.new((x0, Y(f), z)) for f, z in profile]
    b = [bm.verts.new((x1, Y(f), z)) for f, z in profile]
    bm.faces.new(a)
    bm.faces.new(list(reversed(b)))
    n = len(profile)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    ob = link(bpy.data.objects.new(name, me))
    if bevel:
        add_bevel(ob, bevel)
    return ob


def fbox(name, x0, x1, f0, f1, z0, z1, mat, bevel=0.0):
    return prism(name, [(f0, z0), (f1, z0), (f1, z1), (f0, z1)], x0, x1, mat, bevel)


def cube(name, size, loc, mat, parent=None, bevel=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= size[0]
        v.co.y *= size[1]
        v.co.z *= size[2]
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    ob = link(bpy.data.objects.new(name, me), parent)
    ob.location = loc
    if bevel:
        add_bevel(ob, bevel)
    return ob


def cylinder_y(name, radius, depth, loc, mat, parent=None):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=40, radius1=radius, radius2=radius, depth=depth)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = True
    ob = link(bpy.data.objects.new(name, me), parent)
    ob.location = loc
    ob.rotation_euler = (math.radians(90), 0, 0)
    return ob


def panel(name, width, height, center, tilt_x, mat):
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    hw, hh = width / 2, height / 2
    vs = [bm.verts.new(c) for c in ((-hw, -hh, 0), (hw, -hh, 0), (hw, hh, 0), (-hw, hh, 0))]
    face = bm.faces.new(vs)
    for loop, co in zip(face.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        loop[uv].uv = co
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    ob = link(bpy.data.objects.new(name, me))
    ob.location = center
    ob.rotation_euler = (tilt_x, 0, 0)
    return ob


def text(name, body, size, loc, mat, font, parent=None):
    cu = bpy.data.curves.new(name, "FONT")
    cu.body = body
    cu.size = size
    cu.align_x = "CENTER"
    cu.align_y = "CENTER"
    cu.extrude = 0.0003
    cu.font = font
    cu.materials.append(mat)
    ob = link(bpy.data.objects.new(name, cu), parent)
    ob.location = loc
    return ob


def empty(name, loc, rot):
    ob = link(bpy.data.objects.new(name, None))
    ob.empty_display_size = 0.03
    ob.location = loc
    ob.rotation_euler = rot
    return ob


# ---------------------------------------------------------------- cabinet body
prism("Side_Left", SIDE_PROFILE, -W / 2, -W / 2 + T, M_BODY, bevel=0.004)
prism("Side_Right", SIDE_PROFILE, W / 2 - T, W / 2, M_BODY, bevel=0.004)
prism("Deck", DECK_PROFILE, -WI / 2, WI / 2, M_BODY, bevel=0.003)
fbox("Top_Plate", -WI / 2, WI / 2, 0.01, 0.375, 1.982, 1.998, M_BODY)
fbox("Back_Plate", -WI / 2, WI / 2, 0.0, 0.012, 0.0, 1.99, M_MATTE)
fbox("Head_Frame", -WI / 2, WI / 2, 0.372, 0.385, 1.33, 1.985, M_BODY)
fbox("Head_Ledge", -WI / 2, WI / 2, 0.37, 0.41, 1.332, 1.356, M_BODY, bevel=0.002)

# frame plate behind the reel glass (a thin slab following the tilted edge)
i1, i2 = 0.016, 0.030
a1, b1 = REEL_A - REEL_OUT * i1, REEL_B - REEL_OUT * i1
a2, b2 = REEL_A - REEL_OUT * i2, REEL_B - REEL_OUT * i2
prism("Reel_Frame", [tuple(a2), tuple(a1), tuple(b1), tuple(b2)], -WI / 2, WI / 2, M_BODY)

# cash cavity under the deck
fbox("Cavity_Back", -WI / 2, WI / 2, 0.35, 0.36, 0.70, 0.895, M_CAVITY)
fbox("Cavity_Floor", -WI / 2, WI / 2, 0.36, 0.505, 0.685, 0.70, M_CAVITY)
fbox("Coin_Mech", -0.20, -0.08, 0.37, 0.49, 0.70, 0.85, M_GREY, bevel=0.002)
fbox("Coin_Cup", -0.175, -0.105, 0.47, 0.515, 0.705, 0.745, M_YELLOW, bevel=0.003)

# lower front, door, plinth
fbox("Lower_Front", -WI / 2, WI / 2, 0.485, 0.497, 0.08, 0.685, M_BODY)
fbox("Door", -0.285, 0.285, 0.497, 0.504, 0.11, 0.64, M_BODY, bevel=0.002)
cylinder_y("Door_Lock", 0.011, 0.012, (0.0, Y(0.508), 0.58), M_CHROME)
cube("Door_Keyhole", (0.0025, 0.002, 0.009), (0.0, Y(0.5145), 0.58), M_MATTE)
fbox("Plinth", -WI / 2, WI / 2, 0.03, 0.47, 0.0, 0.08, M_MATTE)

# deck lock with hanging key
cylinder_y("Deck_Lock", 0.009, 0.01, (0.05, Y(0.734), 0.962), M_CHROME)
cube("Key_Blade", (0.006, 0.003, 0.03), (0.05, Y(0.741), 0.942), M_BRASS)
cube("Key_Tag", (0.014, 0.004, 0.022), (0.05, Y(0.742), 0.919), M_BLUE, bevel=0.002)

# ---------------------------------------------------------------- artwork panels
TOP_W, TOP_H = 0.60, 0.62
panel("Top_Glass", TOP_W, TOP_H, (0.0, Y(0.387), 1.355 + TOP_H / 2), math.radians(90), M_TOP_GLASS)

REEL_W, REEL_H = 0.60, 0.34
reel_mid = (REEL_A + REEL_B) / 2 + REEL_OUT * -0.012
panel("Reel_Glass", REEL_W, REEL_H, (0.0, Y(reel_mid.x), reel_mid.y), REEL_TILT, M_REEL_GLASS)

# ---------------------------------------------------------------- buttons
FONT = bpy.data.fonts.load(r"C:\Windows\Fonts\arialbd.ttf")
# labels/colours are provisional until the user confirms them (see docs/feliratok.md)
BUTTONS = [
    ("TART", (0.78, 0.74, 0.72), (0.9, 0.04, 0.03)),
    ("TART", (0.78, 0.74, 0.72), (0.9, 0.04, 0.03)),
    ("TART", (0.78, 0.74, 0.72), (0.9, 0.04, 0.03)),
    ("TART", (0.78, 0.74, 0.72), (0.9, 0.04, 0.03)),
    ("TÉT", (0.8, 0.08, 0.06), (1.0, 0.95, 0.9)),
    ("START", (0.15, 0.75, 0.25), (0.01, 0.1, 0.02)),
]
bf = 0.652
bz = DECK_TOP_A.y + (bf - DECK_TOP_A.x) / (DECK_TOP_B.x - DECK_TOP_A.x) * (DECK_TOP_B.y - DECK_TOP_A.y)
for i, (label, cap_col, txt_col) in enumerate(BUTTONS):
    x = -0.25 + i * 0.10
    root = empty(f"Button_{i + 1}", (x, Y(bf), bz), (DECK_SLOPE, 0, 0))
    cube(f"Button_{i + 1}_Bezel", (0.060, 0.060, 0.012), (0, 0, 0.006), M_CHROME, root, bevel=0.002)
    cap = principled(f"Button_{i + 1}_Cap", base=cap_col, rough=0.2, coat=0.6, coat_rough=0.05,
                     emit_color=cap_col, emit_strength=0.25)
    cube(f"Button_{i + 1}_Cap", (0.048, 0.048, 0.010), (0, 0, 0.013), cap, root, bevel=0.0015)
    txt = principled(f"Button_{i + 1}_Text", base=txt_col, rough=0.4, emit_color=txt_col, emit_strength=0.8)
    size = 0.014 if len(label) <= 4 else 0.0105
    text(f"Button_{i + 1}_Label", label, size, (0, 0, 0.0183), txt, FONT, root)

# ---------------------------------------------------------------- room, lights, cameras
floor = panel("Floor", 12, 12, (0, 0, 0), 0, M_FLOOR)
wall = panel("Wall", 12, 4, (0, YB + 0.25, 2.0), math.radians(90), M_WALL)

world = bpy.data.worlds.new("World")
scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.06, 0.06, 0.065, 1)


def look_at(ob, target):
    d = Vector(target) - ob.location
    ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def area_light(name, loc, target, size, power):
    ld = bpy.data.lights.new(name, "AREA")
    ld.size = size
    ld.energy = power
    ob = link(bpy.data.objects.new(name, ld))
    ob.location = loc
    look_at(ob, target)
    return ob


area_light("Key_Light", (-2.2, -1.2, 2.6), (0, 0, 1.2), 1.2, 260)
area_light("Fill_Light", (2.3, -1.4, 1.6), (0, 0, 1.0), 1.5, 90)
area_light("Top_Light", (0.0, -0.4, 3.2), (0, 0, 1.2), 0.8, 90)
area_light("Rim_Light", (1.2, 1.8, 2.4), (0, 0, 1.2), 1.0, 120)


def camera(name, loc, target, lens):
    cd = bpy.data.cameras.new(name)
    cd.lens = lens
    ob = link(bpy.data.objects.new(name, cd))
    ob.location = loc
    look_at(ob, target)
    return ob


cam_34 = camera("Cam_ThreeQuarter", (-1.55, -2.75, 1.45), (0.0, 0.0, 1.0), 45)
cam_front = camera("Cam_Front", (0.0, -3.1, 1.25), (0.0, 0.0, 1.03), 40)
cam_close = camera("Cam_Close", (-0.35, -1.25, 1.45), (0.0, Y(0.45), 1.35), 35)
scene.camera = cam_34

# ---------------------------------------------------------------- render settings
scene.render.engine = "CYCLES"
try:
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for dev_type in ("OPTIX", "CUDA"):
        try:
            prefs.compute_device_type = dev_type
            if hasattr(prefs, "refresh_devices"):
                prefs.refresh_devices()
            else:
                prefs.get_devices()
            if any(d.type == dev_type for d in prefs.devices):
                for d in prefs.devices:
                    d.use = d.type == dev_type
                scene.cycles.device = "GPU"
                print("Cycles device:", dev_type)
                break
        except TypeError:
            continue
except Exception as exc:  # noqa: BLE001
    print("GPU setup failed, using CPU:", exc)

scene.cycles.samples = 128
scene.cycles.use_denoising = True
scene.render.resolution_x = 1200
scene.render.resolution_y = 1600
scene.render.image_settings.file_format = "PNG"
scene.view_settings.view_transform = "Standard"

blend_path = os.path.join(ROOT, "classic_blackjack.blend")
bpy.ops.wm.save_as_mainfile(filepath=blend_path)
bpy.ops.file.make_paths_relative()
bpy.ops.wm.save_mainfile()
print("Saved", blend_path)

if not ONLY_SAVE:
    for cam, fname in ((cam_34, "render_34.png"), (cam_front, "render_front.png"), (cam_close, "render_close.png")):
        t0 = time.time()
        scene.camera = cam
        scene.render.filepath = os.path.join(RENDERS, fname)
        bpy.ops.render.render(write_still=True)
        print(f"Rendered {fname} in {time.time() - t0:.1f}s")
