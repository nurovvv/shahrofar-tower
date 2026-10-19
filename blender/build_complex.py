"""Build block V of the Shahrofar riverside complex on its own, in a landscaped garden, in Blender.

Run with Blender:
    blender -b -P blender/build_complex.py -- --out build/model
or with the `bpy` wheel (pip install bpy shapely):
    python blender/build_complex.py --out build/model

Outputs <out>.blend and <out>.glb, and with --render a still from the camera
of the aerial marketing render (site plan and camera were recovered from that
image; the full complex is in the shahrofar-3d repository).
"""
import argparse
import json
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from complex.geom import get_collection  # noqa: E402
from complex.materials import build_materials  # noqa: E402
from complex.drawn import build_drawn_tower  # noqa: E402

# Camera recovered from the reference aerial image (2000 x 1413 px):
# focal length 2124 px, 37.2 deg down, heading 8.7 deg east of north, 200 m up.
REF_CAMERA = dict(
    location=(0.0, 0.0, 200.0),
    axes=[[0.98623137, 0.11299400, -0.12074782],
          [-0.16448540, 0.59477771, -0.78688248],
          [-0.01709489, 0.79590944, 0.60517430]],
    lens=38.233, sensor=36.0, res=(2000, 1413),
)


# Site point that becomes the origin of the web viewer.
SITE_CENTRE = (5.0, 240.0)


def merge_collection(name):
    """Join all objects of a collection into one mesh (fewer draw calls in the browser)."""
    col = bpy.data.collections.get(name)
    if col is None or not col.objects:
        return
    import bmesh
    bm = bmesh.new()
    mats = []
    for ob in list(col.objects):
        me = ob.data
        tmp = me.copy()
        tmp.transform(ob.matrix_world)
        remap = []
        for m in me.materials:
            if m not in mats:
                mats.append(m)
            remap.append(mats.index(m))
        n0 = len(bm.faces)
        bm.from_mesh(tmp)
        bm.faces.ensure_lookup_table()
        for f in bm.faces[n0:]:
            f.material_index = remap[f.material_index] if remap else 0
        bpy.data.meshes.remove(tmp)
        bpy.data.objects.remove(ob)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    col.objects.link(bpy.data.objects.new(name, me))


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    p = argparse.ArgumentParser()
    p.add_argument('--out', default='build/shahrofar')
    p.add_argument('--render', help='write a still from the reference camera to this PNG')
    p.add_argument('--scale', type=float, default=0.5, help='render resolution scale')
    p.add_argument('--samples', type=int, default=48)
    p.add_argument('--no-glb', action='store_true')
    p.add_argument('--no-site', action='store_true')
    p.add_argument('--view', default='reference', help='reference | ' + ' | '.join(EXTRA_VIEWS))
    p.add_argument('--cam', help='custom camera location x,y,z (site metres); with --target and --lens')
    p.add_argument('--target', help='custom camera target x,y,z')
    p.add_argument('--lens', type=float, default=30.0)
    p.add_argument('--res', help='render size WxH before --scale, e.g. 2000x1413')
    return p.parse_args(argv)


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.objects):
        for item in list(block):
            block.remove(item)


def setup_camera(scene):
    cam_data = bpy.data.cameras.new('Reference camera')
    cam_data.lens = REF_CAMERA['lens']
    cam_data.sensor_fit = 'HORIZONTAL'
    cam_data.sensor_width = REF_CAMERA['sensor']
    cam_data.clip_start = 1.0
    cam_data.clip_end = 5000.0
    cam = bpy.data.objects.new('Reference camera', cam_data)
    scene.collection.objects.link(cam)
    m = Matrix(REF_CAMERA['axes'])
    cam.matrix_world = Matrix.Translation(Vector(REF_CAMERA['location'])) @ m.to_4x4()
    scene.camera = cam
    scene.render.resolution_x, scene.render.resolution_y = REF_CAMERA['res']
    return cam


EXTRA_VIEWS = {
    # roughly the other marketing renders: from the far bank at street level, and from the air over the river
    'river street': dict(location=(-8.0, 470.0, 6.0), target=(-5.0, 250.0, 34.0), lens=30.0),
    'river aerial': dict(location=(150.0, 420.0, 190.0), target=(5.0, 240.0, 20.0), lens=34.0),
    'avenue street': dict(location=(150.0, 330.0, 8.0), target=(10.0, 255.0, 34.0), lens=28.0),
    # the garden from the north-east, over the sports court
    'garden': dict(location=(110.0, 330.0, 70.0), target=(0.0, 255.0, 20.0), lens=30.0),
}


def add_view(scene, name, location, target, lens):
    cd = bpy.data.cameras.new(name)
    cd.lens = lens
    cd.sensor_width = 36.0
    cd.clip_start = 0.5
    cd.clip_end = 5000.0
    ob = bpy.data.objects.new(name, cd)
    scene.collection.objects.link(ob)
    ob.location = location
    ob.rotation_euler = (Vector(target) - Vector(location)).to_track_quat('-Z', 'Y').to_euler()
    return ob


def setup_light(scene):
    sun_data = bpy.data.lights.new('Sun', 'SUN')
    sun_data.energy = 3.2
    sun_data.angle = math.radians(1.5)
    sun_data.color = (1.0, 0.96, 0.9)
    sun = bpy.data.objects.new('Sun', sun_data)
    scene.collection.objects.link(sun)
    # morning sun from the east-south-east, shadows fall to the west-north-west
    az, el = math.radians(112), math.radians(38)
    d = Vector((-math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), -math.sin(el)))
    sun.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()

    world = bpy.data.worlds.new('Sky')
    scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    bg = nt.nodes['Background']
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    nt.links.new(tc.outputs['Generated'], sep.inputs[0])
    nt.links.new(sep.outputs['Z'], ramp.inputs['Fac'])
    ramp.color_ramp.elements[0].position = 0.5
    ramp.color_ramp.elements[0].color = (0.80, 0.86, 0.92, 1)
    ramp.color_ramp.elements[1].position = 0.85
    ramp.color_ramp.elements[1].color = (0.30, 0.50, 0.80, 1)
    nt.links.new(ramp.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 1.1


def setup_render(scene, scale, samples):
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 6
    scene.render.resolution_percentage = int(scale * 100)
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = 0.0
    scene.render.film_transparent = False


def main():
    args = parse_args()
    reset_scene()
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    mats = build_materials()
    from complex import geom
    # the web build draws trees from photographs: collect them instead of modelling (not for stills)
    geom.TREE_LOG = None if args.render else []
    root = get_collection('Shahrofar block V')
    # block V from the architect's floor plans; its plot is a garden (complex/garden.py)
    towers = [build_drawn_tower('V', mats, root)]
    if not args.no_site:
        from complex.site import build_site
        build_site(mats, get_collection('Site'))
    ref_cam = setup_camera(scene)
    views = {n: add_view(scene, n, **v) for n, v in EXTRA_VIEWS.items()}
    setup_light(scene)
    setup_render(scene, args.scale, args.samples)

    out = os.path.abspath(args.out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=out + '.blend', compress=True)
    from complex import drawn, garden, site
    # floor plans for the viewer: only what it draws (rooms, walls, windows, balconies)
    plans = drawn.load_plans()
    used = sorted({fl['plan'] for t in towers for fl in t.get('floors', []) if 'plan' in fl})
    keep = ('slab', 'enclosure', 'walls', 'struct', 'windows', 'glazing', 'common', 'apartments')
    with open(out + '.plans.json', 'w') as f:
        json.dump({k: {kk: plans[k][kk] for kk in keep if kk in plans[k]} for k in used}, f, separators=(',', ':'))
    with open(out + '.json', 'w') as f:
        json.dump(dict(site_centre=SITE_CENTRE, towers=towers,
                       tree_protos=[dict(h=h, r=r, light=l) for h, r, l in site.TREE_PROTOS], trees=site.TREES,
                       trees_placed=geom.TREE_LOG or [],
                       cars=site.CARS, people=site.PEOPLE, benches=garden.BENCHES), f)
    if not args.no_glb:
        # the viewer draws trees, cars and people itself (instanced), so leave them out of the GLB
        for name in ('Trees', 'Cars', 'People'):
            col = bpy.data.collections.get(name)
            if col:
                for ob in list(col.objects):
                    bpy.data.objects.remove(ob)
        bpy.ops.export_scene.gltf(filepath=out + '.glb', export_format='GLB', export_apply=True,
                                  export_cameras=False, export_lights=False, export_extras=True)
    if args.render:
        scene.camera = views.get(args.view, ref_cam)
        if args.cam:
            loc = tuple(map(float, args.cam.split(',')))
            tgt = tuple(map(float, (args.target or '0,240,15').split(',')))
            scene.camera = add_view(scene, 'Custom', loc, tgt, args.lens)
        if args.res:
            scene.render.resolution_x, scene.render.resolution_y = map(int, args.res.lower().split('x'))
        scene.render.filepath = os.path.abspath(args.render)
        bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    main()
