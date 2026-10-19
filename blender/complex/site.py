"""Surroundings: river with rocky banks, the bridge avenue, local roads, lawns, playground,
parking, trees, cars and neighbouring blocks. Positions were back-projected from the
aerial reference render (site metres, +y = north towards the river).
"""
import math
import random

import bpy
import numpy as np
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union

from .geom import MeshBuilder, get_collection, make_object

RIVER = (343.0, 426.0)          # water between these y
AVENUE = (136.0, 164.0)         # bridge avenue between these x
BRIDGE_Z = 6.5

# local roads as centre lines + width
ROADS = [
    # embankment road on the near bank, passes under the bridge
    ([(-420.0, 314.0), (420.0, 314.0)], 14.0),
    # west road from the embankment down past block V
    ([(-65.0, 314.0), (-64.0, 280.0), (-62.0, 245.0), (-60.0, 215.0), (-58.0, 160.0), (-56.0, 60.0)], 9.0),
    # diagonal front road along the parking, towards the hotel
    ([(-60.0, 236.0), (-52.7, 231.1), (-41.5, 224.8), (-22.6, 211.4), (-3.6, 195.8), (13.8, 178.8), (24.4, 167.2),
      (40.5, 156.7), (57.0, 145.0), (70.0, 136.0)], 8.0),
    # drop-off loop in front of blocks V and B, round the playground
    ([(-46.0, 233.0), (-27.8, 231.7), (-8.4, 227.0), (5.6, 226.0), (18.8, 218.8), (24.6, 209.6), (21.6, 198.5), (13.8, 181.0)], 7.0),
    # inner east road along the hotel
    ([(57.0, 143.0), (64.7, 164.6), (73.3, 189.0), (77.5, 207.9), (80.8, 229.2), (85.3, 253.1), (90.0, 272.0),
      (97.0, 290.0), (108.0, 302.0), (118.0, 312.0)], 8.0),
    # outer east road
    ([(85.0, 60.0), (83.3, 125.6), (78.2, 142.6), (76.6, 162.5), (82.3, 187.3), (88.3, 210.1), (95.2, 236.1),
      (103.8, 263.1), (110.2, 288.6), (117.0, 300.0), (126.0, 310.0)], 8.0),
    # loop north-east of the hotel
    ([(52.0, 300.0), (59.2, 311.5), (76.1, 315.0), (93.5, 311.6), (108.0, 298.7)], 7.0),
    # far bank roads (they fan in towards the bridge head)
    ([(-420.0, 552.0), (-138.5, 526.5), (-42.0, 513.9), (56.0, 507.0), (110.0, 498.0), (136.0, 494.0)], 9.0),
    ([(-420.0, 590.0), (-144.1, 561.0), (-42.6, 546.4), (59.9, 537.4), (110.0, 528.0), (136.0, 524.0)], 8.0),
    ([(-420.0, 630.0), (-150.3, 599.2), (-43.4, 583.9), (60.0, 575.0), (136.0, 568.0)], 8.0),
    ([(164.0, 482.0), (176.7, 482.7), (280.4, 481.0), (420.0, 480.0)], 9.0),
    ([(164.0, 459.0), (181.5, 459.3), (243.9, 458.7), (420.0, 458.0)], 7.0),
]


def build_site(mats, col):
    rnd = random.Random(7)
    mb = MeshBuilder()
    # ground
    mb.polygon_face(box(-1500, -1200, 1500, 1800).difference(box(-1500, RIVER[0] - 10, 1500, RIVER[1] + 12)), -0.05, 'Grass')
    river(mb, rnd)
    road_polys = []
    for pts, w in ROADS:
        road_polys.append(LineString(pts).buffer(w / 2, cap_style='flat' if len(pts) == 2 else 'round', quad_segs=8))
    roads = unary_union(road_polys).difference(box(AVENUE[0] - 1, RIVER[0] - 30, AVENUE[1] + 1, RIVER[1] + 30))
    walks = unary_union([r.buffer(1.6) for r in road_polys]).difference(roads)
    for g in getattr(walks, 'geoms', [walks]):
        mb.prism(g, -0.05, 0.12, 'Kerb', 'Sidewalk')
    for g in getattr(roads, 'geoms', [roads]):
        mb.prism(g, -0.05, 0.03, 'Asphalt', 'Asphalt')
    # paved apron round the tower (the rest of the plot is the garden, complex/garden.py)
    from . import garden
    park = garden.layout(unary_union([roads, walks]))
    for g in getattr(park['apron'], 'geoms', [park['apron']]):
        if g.area > 20:
            mb.prism(g, -0.05, 0.1, 'Kerb', 'Paving')
    lane_marks(mb)
    playground(mb, rnd)
    parking(mb)
    lawns_and_beds(mb)
    make_object('Site ground', mb.to_mesh('Site ground', mats), col)
    garden.build(mats, col, park)

    avenue_and_bridge(mats, col)
    neighbours(mats, col)
    trees(mats, col, rnd, roads, park)
    cars(mats, col, rnd)
    street_furniture(mats, col, rnd, road_polys)
    try:  # ground playground details
        from . import street
        street.build(mats, col, rnd, roads)
    except Exception:
        import traceback
        print('[site] street: skipped')
        traceback.print_exc()


def river(mb, rnd):
    y0, y1 = RIVER
    mb.polygon_face(box(-1500, y0 - 2, 1500, y1 + 2), -2.4, 'River')
    # sloped stone banks
    for ya, yb, za, zb in [(y0 - 10, y0 + 1, 0.0, -2.4), (y1 - 1, y1 + 12, -2.4, 0.0)]:
        xs = np.arange(-1500, 1501, 50.0)
        for xa, xb in zip(xs[:-1], xs[1:]):
            mb.face([(xa, ya, za), (xb, ya, za), (xb, yb, zb), (xa, yb, zb)] if za > zb else
                    [(xa, yb, zb), (xa, ya, za), (xb, ya, za), (xb, yb, zb)], 'Embankment')
    # wide rocky beach on the far bank and boulder mounds / gravel bars along both banks
    beach = []
    for x in np.arange(-600, 600, 18.0):
        w = 6 + 16 * rnd.random() ** 2
        beach.append(Point(x + rnd.uniform(-6, 6), y1 + 10 + w * 0.2).buffer(w * 0.8).buffer(0))
    beach = unary_union(beach).intersection(box(-1500, y1 + 8, 1500, y1 + 30))
    mb.prism(beach, -0.05, 0.02, 'Embankment', 'Embankment')
    def blob(cx, cy, r, sx=1.6, sy=0.6):
        pts = []
        for k in range(16):
            a = 2 * math.pi * k / 16
            rr = r * (0.6 + 0.5 * rnd.random())
            pts.append((cx + rr * math.cos(a) * sx, cy + rr * math.sin(a) * sy))
        return Polygon(pts).buffer(0)
    for x in np.arange(-600, 600, 23.0):
        if rnd.random() < 0.55:
            mb.prism(blob(x + rnd.uniform(-8, 8), y0 + rnd.uniform(-2, 6), rnd.uniform(4, 9)), -2.6, -1.0 + rnd.uniform(0, 1.2), 'Embankment', 'Embankment')
        if rnd.random() < 0.6:
            mb.prism(blob(x + rnd.uniform(-8, 8), y1 + rnd.uniform(-6, 2), rnd.uniform(5, 11)), -2.6, -0.8 + rnd.uniform(0, 1.0), 'Embankment', 'Embankment')
    # gravel bars in the stream (as on the render)
    for (cx, cy, r) in [(-15, 362, 7), (25, 365, 6), (-100, 418, 6), (230, 418, 8), (300, 360, 5)]:
        mb.prism(blob(cx, cy, r, 2.2, 0.7), -2.6, -2.1, 'Embankment', 'Embankment')
    # white water flecks
    for _ in range(900):
        x = rnd.uniform(-450, 450)
        y = rnd.uniform(y0 + 1, y1 - 1)
        r = rnd.uniform(0.3, 1.4)
        mb.polygon_face(blob(x, y, r, 1.8, 0.7), -2.33, 'Foam')


def lane_marks(mb):
    # embankment road centre line
    for x in np.arange(-400, 400, 9.0):
        if AVENUE[0] - 2 < x < AVENUE[1] + 2:
            continue
        mb.prism(box(x, 313.9, x + 4.5, 314.1), 0.03, 0.05, 'Road line', 'Road line')



def playground(mb, rnd):
    orange = Polygon([(-19.6, 222.8), (-10.0, 223.6), (2.0, 222.6), (1.5, 199.0), (-0.8, 198.5), (10.2, 191.5)]).buffer(0)
    blue = Polygon([(2.0, 222.6), (16.2, 219.3), (16.5, 205.0), (14.7, 196.1), (10.4, 193.2), (1.0, 199.0)]).buffer(1.5).buffer(-1.5)
    orange = Polygon([(-19.6, 222.8), (2.0, 222.6), (1.0, 199.0), (10.2, 191.5)]).buffer(0)
    mb.prism(orange.difference(blue), 0.05, 0.16, 'Kerb', 'Play orange')
    mb.prism(blue, 0.05, 0.16, 'Kerb', 'Play blue')
    # wooden play towers, climbing frames
    for (x, y, h) in [(-12.0, 219.0, 4.5), (-6.0, 214.0, 3.5), (-2.0, 219.0, 3.0), (8.0, 214.0, 3.8), (11.0, 205.0, 3.0), (5.0, 208.0, 4.2)]:
        for dx, dy in [(-1, -1), (1, -1), (1, 1), (-1, 1)]:
            mb.box(x + dx * 1.1, y + dy * 1.1, 0.16, 0.15, 0.15, h, 'Wood')
        mb.box(x, y, 0.16 + h * 0.5, 2.4, 2.4, 0.15, 'Wood')
        mb.prism(Polygon([(x - 1.4, y - 1.4), (x + 1.4, y - 1.4), (x + 1.4, y + 1.4), (x - 1.4, y + 1.4)]), 0.16 + h, 0.16 + h + 0.2, 'Wood', 'Wood')
        mb.face([(x - 1.4, y - 1.4, h + 0.36), (x + 1.4, y - 1.4, h + 0.36), (x, y, h + 1.6)], 'Play orange')
        mb.face([(x + 1.4, y - 1.4, h + 0.36), (x + 1.4, y + 1.4, h + 0.36), (x, y, h + 1.6)], 'Play orange')
        mb.face([(x + 1.4, y + 1.4, h + 0.36), (x - 1.4, y + 1.4, h + 0.36), (x, y, h + 1.6)], 'Wood')
        mb.face([(x - 1.4, y + 1.4, h + 0.36), (x - 1.4, y - 1.4, h + 0.36), (x, y, h + 1.6)], 'Wood')


def parking(mb):
    a = np.array([-22.5, 218.3])
    b = np.array([5.9, 187.0])
    t = (b - a) / np.linalg.norm(b - a)
    n = np.array([t[1], -t[0]])
    L = np.linalg.norm(b - a)
    mb.prism(Polygon([tuple(a), tuple(b), tuple(b - n * 5.5), tuple(a - n * 5.5)]), 0.0, 0.04, 'Asphalt', 'Asphalt')
    k = int(L / 2.6)
    for i in range(k + 1):
        p = a + t * i * 2.6
        q = p - n * 5.2
        mb.prism(LineString([tuple(p), tuple(q)]).buffer(0.08), 0.04, 0.06, 'Road line', 'Road line')


def lawns_and_beds(mb):
    beds = [Point(-48, 230).buffer(3.5)]
    for g in beds:
        mb.prism(g, 0.1, 0.35, 'Kerb', 'Lawn')


# ----------------------------------------------------------------------------

def avenue_and_bridge(mats, col):
    mb = MeshBuilder()
    x0, x1 = AVENUE
    # deck height profile along y
    def z_at(y):
        if 290 <= y <= 455:
            return BRIDGE_Z
        if y < 290:
            return max(0.0, BRIDGE_Z * (1 - (290 - y) / 80))
        return max(0.0, BRIDGE_Z * (1 - (y - 455) / 70))
    ys = list(np.arange(-600, 1400, 10.0))
    for ya, yb in zip(ys[:-1], ys[1:]):
        za, zb = z_at(ya), z_at(yb)
        mb.face([(x0, ya, za + 0.05), (x1, ya, za + 0.05), (x1, yb, zb + 0.05), (x0, yb, zb + 0.05)], 'Asphalt')
        for xs, xe in [(x0 - 3.0, x0), (x1, x1 + 3.0)]:
            mb.face([(xs, ya, za + 0.2), (xe, ya, za + 0.2), (xe, yb, zb + 0.2), (xs, yb, zb + 0.2)], 'Sidewalk')
        if za > 0.3 or zb > 0.3:
            # deck edge and underside
            for xe in (x0 - 3.0, x1 + 3.0):
                mb.face([(xe, ya, za - 1.4), (xe, yb, zb - 1.4), (xe, yb, zb + 0.2), (xe, ya, za + 0.2)] if xe < x0 else
                        [(xe, yb, zb - 1.4), (xe, ya, za - 1.4), (xe, ya, za + 0.2), (xe, yb, zb + 0.2)], 'Bridge')
            mb.face([(x1 + 3, ya, za - 1.4), (x0 - 3, ya, za - 1.4), (x0 - 3, yb, zb - 1.4), (x1 + 3, yb, zb - 1.4)], 'Bridge')
            # railings
            for xr in (x0 - 2.9, x1 + 2.9):
                mb.face([(xr, ya, za + 0.2), (xr, yb, zb + 0.2), (xr, yb, zb + 1.3), (xr, ya, za + 1.3)], 'Metal')
                mb.face([(xr, yb, zb + 0.2), (xr, ya, za + 0.2), (xr, ya, za + 1.3), (xr, yb, zb + 1.3)], 'Metal')
        # lane marks: 3 dividers per carriageway + double centre line
        for k in range(1, 8):
            x = x0 + (x1 - x0) * k / 8
            if k == 4:
                for dx in (-0.25, 0.25):
                    mb.face([(x + dx - 0.08, ya, za + 0.07), (x + dx + 0.08, ya, za + 0.07), (x + dx + 0.08, yb, zb + 0.07), (x + dx - 0.08, yb, zb + 0.07)], 'Road line')
            else:
                ym = ya + 1
                zm = z_at(ym)
                mb.face([(x - 0.08, ym, zm + 0.07), (x + 0.08, ym, zm + 0.07), (x + 0.08, ym + 4, z_at(ym + 4) + 0.07), (x - 0.08, ym + 4, z_at(ym + 4) + 0.07)], 'Road line')
    # piers in the river
    for y in (360.0, 395.0, 425.0):
        mb.box((x0 + x1) / 2, y, -2.6, x1 - x0 - 4, 2.0, BRIDGE_Z - 1.4 + 2.6, 'Bridge')
    # abutments where the embankment road passes underneath
    for y in (303.5, 324.5):
        mb.box((x0 + x1) / 2, y, -0.05, x1 - x0 + 6, 1.2, BRIDGE_Z - 1.35, 'Bridge')
    # lamp posts both sides
    for y in np.arange(-300, 900, 32.0):
        for xs, arm in [(x0 - 2.4, 1), (x1 + 2.4, -1)]:
            z = z_at(y) + 0.2
            mb.box(xs, y, z, 0.18, 0.18, 10.0, 'Metal')
            mb.box(xs + arm * 1.2, y, z + 9.8, 2.4, 0.15, 0.15, 'Metal')
    make_object('Avenue and bridge', mb.to_mesh('Avenue and bridge', mats), col)


def neighbours(mats, col):
    mb = MeshBuilder()
    # context massing west of the site (drawn as translucent volumes on the renders): plain, opaque,
    # light grey blocks with softened edges, so they read as context and never sort wrongly
    for (poly, h) in [
        (Polygon([(-135, 210), (-74, 210), (-74, 300), (-135, 300)]), 21.0),   # kept low: block V is the subject
        (Polygon([(-170, 330), (-120, 330), (-120, 345), (-170, 345)]), 30.0),
    ]:
        mb.prism_chamfer(poly, 0.0, h, 'Neighbour', 'Neighbour', None, c=0.25)
    make_object('Neighbours (massing)', mb.to_mesh('Neighbours (massing)', mats), col)
    mb = MeshBuilder()
    # low white block south-west of the playground
    a = np.array([-54.4, 190.4])
    b = np.array([-18.7, 164.4])
    t = (b - a) / np.linalg.norm(b - a)
    n = np.array([-t[1], t[0]])
    mb.prism_chamfer(Polygon([tuple(a), tuple(b), tuple(b + n * 14), tuple(a + n * 14)]), 0.0, 8.5, 'Neighbour solid', 'Neighbour solid', None, c=0.08)
    c = b + n * 2
    mb.prism(Polygon([tuple(c), tuple(c + t * 6), tuple(c + t * 6 + n * 9), tuple(c + n * 9)]), 0.0, 7.0, 'Neighbour solid', 'Neighbour solid')
    # small kiosk south of the hotel
    mb.prism(box(26, 136, 33, 142), 0, 3.0, 'Neighbour solid', 'Neighbour solid')
    make_object('Neighbour buildings', mb.to_mesh('Neighbour buildings', mats), col)


# (x, y, scale, scale_z, rotation, prototype) of every street/park tree, for the web viewer
TREES = []
TREE_PROTOS = [(7, 2.6, False), (9, 3.2, False), (6, 2.2, True), (11, 3.6, False), (5, 1.8, True), (8, 2.8, True)]


def tree_mesh(name, mats, h, r, light, seed=0):
    rnd = random.Random(seed)
    mb = MeshBuilder()
    mb.prism(Point(0, 0).buffer(0.2, quad_segs=2), 0, h * 0.55, 'Trunk')
    leaf = 'Leaves light' if light else 'Leaves'
    # a few branches and a crown of overlapping lumpy clumps
    for k in range(4):
        ang = k * math.pi / 2 + rnd.uniform(-0.4, 0.4)
        mb.tube([(0, 0), (math.cos(ang) * r * 0.45, math.sin(ang) * r * 0.45)], [h * 0.5, h * 0.62], [h * 0.53, h * 0.66], 0.12, 'Trunk')
    for (dx, dy, dz, rr) in [(0, 0, 0.68, 1.0), (0.45, 0.25, 0.74, 0.7), (-0.4, -0.3, 0.72, 0.72), (0.1, -0.1, 0.9, 0.65),
                             (-0.3, 0.4, 0.8, 0.6), (0.35, -0.4, 0.66, 0.6)]:
        mb.blob(dx * r, dy * r, h * dz, r * rr, r * rr, r * rr * 0.85, leaf, subdiv=2, jitter=0.15, rnd=rnd)
    return mb.to_mesh(name, mats)


def trees(mats, col, rnd, roads, park):
    TREES.clear()
    protos = [tree_mesh(f'Tree {i}', mats, h, r, l, i) for i, (h, r, l) in enumerate(TREE_PROTOS)]
    spots = []
    # rows along the embankment road and the far bank
    for x in np.arange(-400, 400, 11.0):
        spots.append((x + rnd.uniform(-2, 2), 329.0 + rnd.uniform(-1, 1)))
        spots.append((x + rnd.uniform(-2, 2), 470.0 + rnd.uniform(-6, 6)))
        if rnd.random() < 0.7:
            spots.append((x + rnd.uniform(-3, 3), 492.0 + rnd.uniform(-6, 6) - 0.08 * x))
    # avenue verges
    for y in np.arange(-200, 300, 16.0):
        spots.append((AVENUE[0] - 9 + rnd.uniform(-1, 1), y))
        spots.append((AVENUE[1] + 9 + rnd.uniform(-1, 1), y))
    for y in np.arange(470, 800, 16.0):
        spots.append((AVENUE[0] - 9, y))
        spots.append((AVENUE[1] + 9, y))
    # scattered in lawns (big lawn between the east roads and the avenue, south-west park)
    for _ in range(140):
        x, y = rnd.uniform(90, 132), rnd.uniform(-100, 280)
        spots.append((x, y))
    for _ in range(420):
        x, y = rnd.uniform(-170, 20), rnd.uniform(40, 205)
        spots.append((x, y))
    for _ in range(60):
        x, y = rnd.uniform(-60, 80), rnd.uniform(60, 140)
        spots.append((x, y))
    for _ in range(200):
        x, y = rnd.uniform(-400, 400), rnd.uniform(560, 900)
        spots.append((x, y))
    for _ in range(120):
        x, y = rnd.uniform(170, 420), rnd.uniform(-200, 300)
        spots.append((x, y))
    # fixed trees by the complex (from the render)
    spots += [(-47, 226), (-66, 230), (-68, 205), (-50, 205), (-35, 200)]
    # the garden has its own (complex/garden.py); nothing else goes on the plot
    blocked = unary_union([roads.buffer(1.5), box(AVENUE[0] - 4, -2000, AVENUE[1] + 4, 3000),
                           box(-2000, RIVER[0] - 14, 2000, RIVER[1] + 14), park['region'].buffer(1.0),
                           box(-136, 208, -72, 302), Polygon([(-54.4, 190.4), (-18.7, 164.4), (-10.5, 175.7), (-46.2, 201.7)]).buffer(2),
                           box(-25, 185, 18, 225)])
    spots = [p for p in spots if not blocked.contains(Point(*p))]
    from .garden import TREE_SPOTS
    spots += [tuple(p) for p in TREE_SPOTS]
    tcol = get_collection('Trees', col)
    for i, (x, y) in enumerate(spots):
        k = rnd.randrange(len(protos))
        ob = bpy.data.objects.new(f'Tree.{i:03d}', protos[k])
        ob.location = (x, y, 0.0)
        s = rnd.uniform(0.8, 1.2)
        ob.scale = (s, s, s * rnd.uniform(0.9, 1.15))
        ob.rotation_euler = (0, 0, rnd.uniform(0, 6.28))
        tcol.objects.link(ob)
        TREES.append([round(x, 2), round(y, 2), round(s, 3), round(ob.scale[2], 3), round(ob.rotation_euler[2], 3), k])


# (x, y, z, rotation, colour) of every car and (x, y, z, colour) of every person, for the web viewer
CARS = []
PEOPLE = []
CAR_COLOURS = ['Car', 'Car', 'Car dark', 'Car red', 'Neighbour solid', 'Car', 'Car dark']

# Side profile of a saloon car (x along the car, z up), 4.5 m long.
CAR_BODY = [(-2.25, 0.32), (2.25, 0.32), (2.3, 0.62), (2.2, 0.82), (1.1, 0.92), (0.55, 1.38), (-0.85, 1.42),
            (-1.55, 0.98), (-2.2, 0.92), (-2.3, 0.62)]
CAR_GLASS = [(1.0, 0.94), (0.52, 1.33), (-0.82, 1.37), (-1.45, 0.98)]


def side_extrude(mb, profile, y0, y1, mat):
    """Extrude a side profile (x, z) across the car (y)."""
    n = len(profile)
    for i in range(n):
        (xa, za), (xb, zb) = profile[i], profile[(i + 1) % n]
        mb.face([(xa, y0, za), (xb, y0, zb), (xb, y1, zb), (xa, y1, za)], mat)
    mb.face([(x, y0, z) for x, z in profile][::-1], mat)
    mb.face([(x, y1, z) for x, z in profile], mat)


def car_mesh(name, mats, body):
    mb = MeshBuilder()
    side_extrude(mb, CAR_BODY, -0.88, 0.88, body)
    side_extrude(mb, CAR_GLASS, -0.9, 0.9, 'Car dark')
    return mb.to_mesh(name, mats)


def wheels_mesh(name, mats):
    mb = MeshBuilder()
    for x in (-1.45, 1.45):
        for y in (-0.92, 0.72):
            # wheel = short cylinder across the car (axis along y)
            ring = [(x + 0.33 * math.cos(a), 0.33 + 0.33 * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 14)[:-1]]
            side_extrude(mb, ring, y, y + 0.2, 'Car dark')
    return mb.to_mesh(name, mats)


def cars(mats, col, rnd):
    CARS.clear()
    PEOPLE.clear()
    protos = {}
    wheels = wheels_mesh('Car wheels', mats)
    ccol = get_collection('Cars', col)
    placed = []
    x0, x1 = AVENUE
    for y in np.arange(-150, 700, 9.0):
        for k in range(8):
            if rnd.random() < 0.18:
                x = x0 + (x1 - x0) * (k + 0.5) / 8
                z = BRIDGE_Z if 290 <= y <= 455 else (max(0, BRIDGE_Z * (1 - (290 - y) / 80)) if y < 290 else max(0, BRIDGE_Z * (1 - (y - 455) / 70)))
                placed.append((x, y + rnd.uniform(-3, 3), z + 0.05, math.pi / 2 if k < 4 else -math.pi / 2))
    for x in np.arange(-300, 300, 12.0):
        if rnd.random() < 0.25 and not (x0 - 3 < x < x1 + 3):
            placed.append((x, 311.0 if rnd.random() < 0.5 else 317.0, 0.03, 0.0 if rnd.random() < 0.5 else math.pi))
    # parked cars and a few on the local roads (as on the render)
    a, b = np.array([-22.5, 218.3]), np.array([5.9, 187.0])
    t = (b - a) / np.linalg.norm(b - a)
    n = np.array([t[1], -t[0]])
    for i in [1, 2, 4, 6, 7, 9]:
        p = a + t * (i * 2.6 + 1.3) - n * 2.6
        placed.append((p[0], p[1], 0.04, math.atan2(n[1], n[0])))
    for (x, y, r) in [(-40, 225, -0.6), (-4, 196, -0.75), (35, 158, -0.6), (75, 200, 1.3), (82, 240, 1.35), (64, 165, 1.2),
                      (86, 190, 1.4), (96, 236, 1.3), (100, 255, 1.3), (-62, 260, 1.57), (-20, 316, 0), (70, 311, 0.1), (16, 222, -0.4)]:
        placed.append((x, y, 0.03, r))
    for i, (x, y, z, r) in enumerate(placed):
        k = rnd.randrange(len(CAR_COLOURS))
        if k not in protos:
            protos[k] = car_mesh(f'Car {k}', mats, CAR_COLOURS[k])
        for me, nm in ((protos[k], 'Car'), (wheels, 'Wheels')):
            ob = bpy.data.objects.new(f'{nm}.{i:03d}', me)
            ob.location = (x, y, z)
            ob.rotation_euler = (0, 0, r)
            ccol.objects.link(ob)
        CARS.append([round(x, 2), round(y, 2), round(z, 2), round(r, 3), k])


def street_furniture(mats, col, rnd, road_polys):
    """Lamp posts along the local roads, benches in the garden, and where people stand."""
    from . import garden
    mb = MeshBuilder()
    for pts, w in ROADS[1:7]:
        line = LineString(pts)
        for side in (-1, 1):
            off = line.offset_curve(side * (w / 2 + 0.9))
            if off.is_empty or off.geom_type != 'LineString':
                continue
            d = 12.0
            while d < off.length:
                p = off.interpolate(d)
                q = line.interpolate(line.project(p))
                ang = math.atan2(q.y - p.y, q.x - p.x)
                mb.box(p.x, p.y, 0.1, 0.14, 0.14, 7.5, 'Metal')
                mb.box(p.x + math.cos(ang) * 0.6, p.y + math.sin(ang) * 0.6, 7.5, 1.3, 0.12, 0.1, 'Metal', rot=ang)
                mb.box(p.x + math.cos(ang) * 1.15, p.y + math.sin(ang) * 1.15, 7.32, 0.5, 0.22, 0.18, 'Sign', rot=ang)
                d += 26.0
    # benches in the garden (each faces (sin r, -cos r), its back on the local +y side)
    for (x, y, r) in garden.BENCHES:
        mb.box(x, y, 0.1, 1.8, 0.5, 0.45, 'Wood', rot=r)
        mb.box(x - math.sin(r) * 0.22, y + math.cos(r) * 0.22, 0.55, 1.8, 0.08, 0.45, 'Wood', rot=r)
    make_object('Street furniture', mb.to_mesh('Street furniture', mats), col)

    # people: on the sidewalks round the plot and along the embankment, and on the garden's paths
    walk = unary_union([r.buffer(2.4).difference(r.buffer(0.2)) for r in road_polys])
    tower = garden.footprint('V').buffer(1.0)
    spots = []
    while len(spots) < 110:
        x, y = rnd.uniform(-80, 110), rnd.uniform(140, 335)
        if walk.contains(Point(x, y)) and not tower.contains(Point(x, y)):
            spots.append((x, y, 0.12))
    spots += rnd.sample(garden.PEOPLE_SPOTS, min(38, len(garden.PEOPLE_SPOTS)))
    for x, y, z in spots:
        PEOPLE.append([round(x, 2), round(y, 2), z, rnd.randrange(6)])
    pcol = get_collection('People', col)
    mb = MeshBuilder()
    clothes = ['Car red', 'Car dark', 'Play blue', 'Wood', 'Lounger', 'Play orange']
    for x, y, z, k in PEOPLE:
        a = rnd.uniform(0, math.pi)
        c, s_ = math.cos(a), math.sin(a)
        for side in (-1, 1):  # legs
            mb.box(x + c * side * 0.09, y + s_ * side * 0.09, z, 0.13, 0.15, 0.82, 'Car dark', rot=a)
        mb.box(x, y, z + 0.8, 0.42, 0.24, 0.62, clothes[k], rot=a)        # torso
        mb.box(x, y, z + 0.88, 0.5, 0.12, 0.5, clothes[k], rot=a)         # arms
        mb.blob(x, y, z + 1.6, 0.12, 0.12, 0.14, 'Wood', subdiv=1)        # head
    make_object('People', mb.to_mesh('People', mats), pcol)
