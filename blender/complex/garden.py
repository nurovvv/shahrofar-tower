"""Residents' garden round block V: this demo builds the one tower, so the plot between the
roads, where the podium, block B and the hotel stood in the full complex, is a landscaped park.

- a paved apron round the tower and an arrival forecourt on its east side, with planted beds
- a promenade from the forecourt east through the park to the inner east road, a riverside walk
  along the embankment, and paths that tie them to the drop-off loop and the front road
- a round pool with a tiered fountain on a paved circle, a multi-sport court, a timber pergola
  in the south-east grove, park lamps along the paths
- lawn everywhere else; trees (drawn by the viewer from photographs), benches and people are
  recorded for complex.json

Site metres (x east, y north), as complex/site.py.
"""
import math
import random

import numpy as np
from shapely import affinity
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union

from .drawn import footprint
from .geom import MeshBuilder, biggest, get_collection, make_object

# the plot: everything inside this line that is not road or sidewalk
REGION = Polygon([(-60, 234), (-46, 236), (-28, 236), (-8, 231), (6, 230), (20, 224), (28, 210), (26, 196), (18, 180),
                  (30, 166), (44, 158), (58, 150), (68, 168), (78, 200), (84, 232), (90, 262), (96, 286), (70, 306),
                  (-60, 306)])

# path centre lines and widths
PATHS = [
    ([(-16, 256), (0, 259), (16, 268), (32, 265), (46, 258), (60, 247), (72, 238), (86, 232)], 4.0),   # promenade
    ([(-62, 301), (-30, 302), (0, 302), (30, 301), (50, 299), (64, 306)], 3.2),                        # riverside walk
    ([(-34, 278), (-32, 291), (-30, 302)], 3.0),                                                        # tower -> river
    ([(16, 280), (17, 291), (18, 302)], 3.0),                                                           # pool -> river
    ([(3, 228), (7, 244), (14, 258)], 3.0),                                                             # drop-off loop -> pool
    ([(44, 259), (47, 240), (49, 220), (50, 200), (52, 180), (52, 163), (50, 150)], 3.0),               # south-east spine
    ([(26, 212), (38, 212), (49, 210)], 3.0),                                                           # loop -> spine
    ([(51, 190), (63, 194), (78, 196)], 3.0),                                                           # spine -> east road
]
POOL = (16.0, 268.0)
POOL_R = 7.0
CIRCLE_R = 12.5
COURT = dict(c=(68.0, 271.0), size=(28.0, 15.0), rot=-18.0)
PERGOLA = dict(c=(50.6, 196.0), size=(9.0, 9.0), rot=4.0)

Z_PAVE = 0.1
Z_LAWN = 0.08

# filled by build(): [x, y] of the park's trees, [x, y, turn] of its benches (the viewer's format),
# [x, y, z] of free spots on the paths for people
TREE_SPOTS = []
BENCHES = []
PEOPLE_SPOTS = []


def _chaikin(pts, rounds=2):
    for _ in range(rounds):
        out = [pts[0]]
        for (ax, ay), (bx, by) in zip(pts[:-1], pts[1:]):
            out += [(0.75 * ax + 0.25 * bx, 0.75 * ay + 0.25 * by), (0.25 * ax + 0.75 * bx, 0.25 * ay + 0.75 * by)]
        out.append(pts[-1])
        pts = out
    return pts


def _rect(c, size, rot):
    w, h = size
    return affinity.rotate(affinity.translate(box(-w / 2, -h / 2, w / 2, h / 2), *c), rot, origin=c)


def layout(roads_and_walks):
    """All the park's outlines (shapely, site metres)."""
    region = biggest(REGION.difference(roads_and_walks.buffer(0.05)))
    tower = footprint('V')
    apron = tower.buffer(4.5).intersection(region)
    # arrival forecourt east of the tower, where the promenade starts
    forecourt = Polygon([(-22, 243), (-9, 246), (-6, 262), (-21, 268)]).union(apron).intersection(region)
    lines = [(LineString(_chaikin(p)), w) for p, w in PATHS]
    paths = unary_union([l.buffer(w / 2, quad_segs=6) for l, w in lines])
    circle = Point(POOL).buffer(CIRCLE_R, quad_segs=24)
    court = _rect(COURT['c'], COURT['size'], COURT['rot'])
    court_pad = _rect(COURT['c'], (COURT['size'][0] + 4, COURT['size'][1] + 4), COURT['rot'])
    pergola = _rect(PERGOLA['c'], PERGOLA['size'], PERGOLA['rot'])
    hard = unary_union([forecourt, paths.intersection(region), circle, court_pad, pergola]).intersection(region)
    # raised planted beds either side of the promenade's first stretch
    beds = []
    l0 = lines[0][0]
    for s in np.arange(9.0, 34.0, 8.5):
        for side in (-1, 1):
            p = l0.interpolate(s)
            q = l0.interpolate(s + 0.5)
            t = np.array([q.x - p.x, q.y - p.y])
            t /= np.linalg.norm(t)
            n = np.array([-t[1], t[0]]) * side
            c = np.array([p.x, p.y]) + n * 4.6
            beds.append(_rect(tuple(c), (5.5, 2.2), math.degrees(math.atan2(t[1], t[0]))))
    beds = unary_union(beds).difference(hard.buffer(0.3)).intersection(region)
    lawn = region.difference(hard).difference(beds.buffer(0.01)).difference(tower)
    # the apron is paved with the site ground (complex/site.py), the rest of the forecourt here
    return dict(region=region, tower=tower, apron=apron.difference(tower), forecourt=forecourt.difference(apron), lines=lines,
                paths=paths.intersection(region).difference(forecourt).difference(circle).difference(court_pad).difference(pergola),
                circle=circle, court=court, court_pad=court_pad, pergola=pergola, beds=beds, lawn=lawn, hard=hard)


def build(mats, col, L):
    """L: layout(...)"""
    rnd = random.Random(20261018)
    mb = MeshBuilder()
    for g in _parts(L['lawn']):
        mb.prism(g, -0.05, Z_LAWN, 'Kerb', 'Lawn')
    for g in _parts(L['paths']):
        mb.prism(g, -0.05, Z_PAVE, 'Kerb', 'Paving')
    for g in _parts(L['forecourt']):
        mb.prism(g, -0.05, Z_PAVE, 'Kerb', 'Paving')
    beds(mb, L['beds'], rnd)
    entrance(mb, L['tower'])
    pool(mb, L['circle'])
    court(mb)
    pergola(mb)
    lamps(mb, L)
    make_object('Garden', mb.to_mesh('Garden', mats), get_collection('Garden', col))
    benches(L)
    trees(L, rnd)
    people(L, rnd)
    print(f"[garden] lawn {L['lawn'].area:.0f} m2, paths {L['paths'].area:.0f} m2, {len(TREE_SPOTS)} trees, "
          f"{len(BENCHES)} benches, {len(PEOPLE_SPOTS)} people spots")
    return L


def _parts(g):
    return [p for p in getattr(g, 'geoms', [g]) if p.geom_type == 'Polygon' and p.area > 0.5]


def beds(mb, beds_, rnd):
    for g in _parts(beds_):
        mb.prism(g, -0.05, 0.45, 'Planter', 'Lawn')
        inner = g.buffer(-0.5)
        if inner.is_empty:
            continue
        x0, y0, x1, y1 = inner.bounds
        for _ in range(int(inner.area / 1.6) + 2):
            for _try in range(12):
                x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
                if inner.contains(Point(x, y)):
                    r = rnd.uniform(0.45, 0.7)
                    mb.blob(x, y, 0.45 + r * 0.55, r, r, r * 0.8, 'Shrub', subdiv=1, jitter=0.12, rnd=rnd)
                    break


def entrance(mb, tower):
    """The main entrance on the tower's east face, onto the forecourt: a cantilevered canopy over
    a pair of framed glass doors."""
    # the east face at the door (the glazed base stands 0.3 m inside the facade line)
    face = LineString([(-40, 256), (0, 256)]).intersection(tower).bounds[2] - 0.3
    for y in (254.3, 257.7):                  # door posts and head
        mb.box(face - 0.1, y, Z_PAVE, 0.22, 0.18, 2.9, 'Frame')
    mb.box(face - 0.1, 256.0, 2.9, 0.22, 3.6, 0.22, 'Frame')
    mb.box(face - 0.1, 256.0, Z_PAVE, 0.12, 0.08, 2.8, 'Frame')   # the meeting stiles
    mb.box(face + 2.0, 256.0, 4.0, 4.4, 9.0, 0.32, 'White band')   # canopy
    mb.box(face + 4.15, 256.0, 4.32, 0.1, 9.0, 0.12, 'White band')


def _cyl(mb, x, y, r, z0, z1, mat, top=None, n=28):
    mb.prism(Point(x, y).buffer(r, quad_segs=max(4, n // 4)), z0, z1, mat, top or mat)


def pool(mb, circle):
    x, y = POOL
    pave = circle.difference(Point(x, y).buffer(POOL_R + 0.45, quad_segs=24))
    mb.prism(pave, -0.05, Z_PAVE, 'Kerb', 'Paving')
    rim = Point(x, y).buffer(POOL_R + 0.45, quad_segs=24).difference(Point(x, y).buffer(POOL_R, quad_segs=24))
    mb.prism(rim, -0.05, 0.5, 'Planter', 'Planter')
    mb.polygon_face(Point(x, y).buffer(POOL_R, quad_segs=24), -0.1, 'Pool tile')
    mb.polygon_face(Point(x, y).buffer(POOL_R, quad_segs=24), 0.34, 'Pool water')
    # tiered fountain in the middle
    _cyl(mb, x, y, 1.7, -0.1, 0.62, 'Planter')
    _cyl(mb, x, y, 0.32, 0.62, 1.55, 'Planter')
    _cyl(mb, x, y, 1.05, 1.55, 1.7, 'Planter')
    mb.polygon_face(Point(x, y).buffer(0.9, quad_segs=6), 1.66, 'Pool water')
    _cyl(mb, x, y, 0.16, 1.7, 2.35, 'Planter')
    _cyl(mb, x, y, 0.5, 2.35, 2.43, 'Planter')
    # low clipped hedges in four quarters of the circle, cut by the paths
    ring = Point(x, y).buffer(CIRCLE_R - 0.6).difference(Point(x, y).buffer(CIRCLE_R - 1.6))
    gaps = unary_union([LineString([(x, y), (x + 20 * math.cos(a), y + 20 * math.sin(a))]).buffer(2.4)
                        for a in (math.radians(10), math.radians(95), math.radians(190), math.radians(225))])
    for g in _parts(ring.difference(gaps)):
        mb.prism(g, Z_PAVE, 0.75, 'Shrub', 'Shrub')


def court(mb):
    c, (w, h), rot = COURT['c'], COURT['size'], COURT['rot']
    a = math.radians(rot)
    ca, sa = math.cos(a), math.sin(a)
    P = lambda u, v: (c[0] + ca * u - sa * v, c[1] + sa * u + ca * v)
    outer = _rect(c, (w + 4, h + 4), rot)
    inner = _rect(c, (w, h), rot)
    mb.prism(outer.difference(inner), -0.05, Z_PAVE, 'Kerb', 'Play orange')
    mb.prism(inner, -0.05, Z_PAVE, 'Kerb', 'Rubber blue')
    lw = 0.08
    lines = [LineString([P(-w / 2, -h / 2), P(w / 2, -h / 2), P(w / 2, h / 2), P(-w / 2, h / 2), P(-w / 2, -h / 2)]),
             LineString([P(0, -h / 2), P(0, h / 2)]),
             Point(P(0, 0)).buffer(1.8).exterior]
    for sgn in (-1, 1):
        bx = sgn * (w / 2)
        # the key and its free-throw circle
        lines.append(LineString([P(bx, -2.45), P(bx - sgn * 5.8, -2.45), P(bx - sgn * 5.8, 2.45), P(bx, 2.45)]))
        lines.append(Point(P(bx - sgn * 5.8, 0)).buffer(1.8).exterior)
        # three-point line: straight near the side lines, then an arc round the basket
        hx = bx - sgn * 1.575
        arc = [P(hx + sgn * 0 - sgn * 6.75 * math.cos(t), 6.75 * math.sin(t))
               for t in np.linspace(-math.asin(6.6 / 6.75), math.asin(6.6 / 6.75), 25)]
        lines.append(LineString([P(bx, -6.6)] + [arc[0]] + arc + [arc[-1], P(bx, 6.6)]))
    for l in lines:
        mb.prism(l.buffer(lw / 2, cap_style='flat'), Z_PAVE, Z_PAVE + 0.012, 'Road line', 'Road line')
    # baskets: post outside the end line, arm, backboard, ring
    for sgn in (-1, 1):
        px, py = P(sgn * (w / 2 + 1.2), 0)
        mb.box(px, py, Z_PAVE, 0.18, 0.18, 3.35, 'Metal', rot=a)
        bx, by = P(sgn * (w / 2 - 1.2), 0)
        mb.tube([(px, py), (bx, by)], [3.15, 3.15], [3.3, 3.3], 0.12, 'Metal')
        mb.box(bx, by, 2.9, 0.05, 1.8, 1.05, 'Lamp white', rot=a)
        rx, ry = P(sgn * (w / 2 - 1.575), 0)
        ring = [(rx + 0.23 * math.cos(t), ry + 0.23 * math.sin(t)) for t in np.linspace(0, 2 * math.pi, 17)[:-1]]
        mb.tube(ring, [3.04] * 16, [3.07] * 16, 0.03, 'Play orange', closed=True)
    # low fence posts and rails along the long sides (open ends)
    for v in (-(h / 2 + 1.9), h / 2 + 1.9):
        for u in np.arange(-(w / 2 + 1.9), w / 2 + 1.95, 2.5):
            x, y = P(u, v)
            mb.box(x, y, Z_PAVE, 0.07, 0.07, 1.1, 'Metal', rot=a)
        mb.tube([P(-(w / 2 + 1.9), v), P(w / 2 + 1.9, v)], [1.12, 1.12], [1.2, 1.2], 0.06, 'Metal')
        mb.tube([P(-(w / 2 + 1.9), v), P(w / 2 + 1.9, v)], [0.55, 0.55], [0.6, 0.6], 0.05, 'Metal')


def pergola(mb):
    c, (w, h), rot = PERGOLA['c'], PERGOLA['size'], PERGOLA['rot']
    a = math.radians(rot)
    ca, sa = math.cos(a), math.sin(a)
    P = lambda u, v: (c[0] + ca * u - sa * v, c[1] + sa * u + ca * v)
    mb.prism(_rect(c, (w, h), rot), -0.05, Z_PAVE, 'Kerb', 'Paving')
    zt = 2.9
    for u in (-w / 2 + 0.6, 0, w / 2 - 0.6):
        for v in (-h / 2 + 0.6, h / 2 - 0.6):
            x, y = P(u, v)
            mb.box(x, y, Z_PAVE, 0.22, 0.22, zt - Z_PAVE, 'Lattice wood', rot=a)
    for v in (-h / 2 + 0.6, h / 2 - 0.6):           # beams
        x, y = P(0, v)
        mb.box(x, y, zt, w, 0.16, 0.3, 'Lattice wood', rot=a)
    for u in np.arange(-w / 2 + 0.3, w / 2 - 0.2, 0.55):   # slats
        x, y = P(u, 0)
        mb.box(x, y, zt + 0.3, 0.07, h + 0.4, 0.16, 'Lattice wood', rot=a)


def lamps(mb, L):
    """Park lamps along the paths: a slim post with a white globe, about every 17 m."""
    placed = []
    for line, w in L['lines']:
        d = 6.0
        while d < line.length:
            p = line.interpolate(d)
            q = line.interpolate(min(line.length, d + 0.5))
            t = np.array([q.x - p.x, q.y - p.y])
            t /= max(np.linalg.norm(t), 1e-9)
            n = np.array([-t[1], t[0]]) * (1 if int(d // 17) % 2 else -1)
            x, y = p.x + n[0] * (w / 2 + 0.5), p.y + n[1] * (w / 2 + 0.5)
            d += 17.0
            pt = Point(x, y)
            if not L['region'].buffer(-0.3).contains(pt) or L['tower'].buffer(2).contains(pt) or \
                    L['court_pad'].buffer(0.5).contains(pt) or L['circle'].contains(pt) or \
                    any(math.hypot(x - a, y - b) < 9 for a, b in placed):
                continue
            placed.append((x, y))
            mb.box(x, y, Z_LAWN, 0.2, 0.2, 0.35, 'Metal')
            mb.box(x, y, Z_LAWN, 0.09, 0.09, 3.6, 'Metal')
            mb.blob(x, y, 3.85, 0.24, 0.24, 0.26, 'Lamp glow', subdiv=2)


def benches(L):
    """Along the paths (facing them) and round the pool (facing the water)."""
    BENCHES.clear()
    for line, w in L['lines']:
        d = 12.0
        while d < line.length - 4:
            p = line.interpolate(d)
            q = line.interpolate(d + 0.5)
            t = np.array([q.x - p.x, q.y - p.y])
            t /= max(np.linalg.norm(t), 1e-9)
            side = 1 if int(d // 23) % 2 else -1
            n = np.array([-t[1], t[0]]) * side
            x, y = p.x + n[0] * (w / 2 + 0.7), p.y + n[1] * (w / 2 + 0.7)
            d += 23.0
            pt = Point(x, y)
            if not L['region'].buffer(-0.5).contains(pt) or L['hard'].difference(L['paths']).buffer(0.8).contains(pt) or \
                    L['tower'].buffer(5).contains(pt) or any(math.hypot(x - a, y - b) < 8 for a, b, _ in BENCHES):
                continue
            fx, fy = -n
            BENCHES.append([round(x, 2), round(y, 2), round(math.atan2(fx, -fy), 3)])
    x0, y0 = POOL
    for k in range(6):
        ang = math.radians(40 + k * 60)
        x, y = x0 + (POOL_R + 2.6) * math.cos(ang), y0 + (POOL_R + 2.6) * math.sin(ang)
        fx, fy = -math.cos(ang), -math.sin(ang)
        BENCHES.append([round(x, 2), round(y, 2), round(math.atan2(fx, -fy), 3)])
    # two under the pergola, facing each other
    c, a = PERGOLA['c'], math.radians(PERGOLA['rot'])
    for side in (-1, 1):
        x, y = c[0] - math.sin(a) * side * 2.6, c[1] + math.cos(a) * side * 2.6
        fx, fy = math.sin(a) * side, -math.cos(a) * side
        BENCHES.append([round(x, 2), round(y, 2), round(math.atan2(fx, -fy), 3)])


def _poisson(area, n_try, min_d, rnd, existing):
    x0, y0, x1, y1 = area.bounds
    out = []
    for _ in range(n_try):
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        if not area.contains(Point(x, y)):
            continue
        if any(math.hypot(x - a, y - b) < min_d for a, b in existing + out):
            continue
        out.append((x, y))
    return out


def trees(L, rnd):
    TREE_SPOTS.clear()
    free = L['lawn'].buffer(-2.2)
    keep_clear = unary_union([L['tower'].buffer(9), L['court_pad'].buffer(2.5), L['circle'].buffer(1.5)])
    free = free.difference(keep_clear)
    spots = []
    # an avenue along the promenade and the riverside walk
    for idx, step in ((0, 9.5), (1, 11.0), (5, 10.0)):
        line, w = L['lines'][idx]
        d = 5.0
        while d < line.length:
            p = line.interpolate(d)
            q = line.interpolate(min(line.length, d + 0.5))
            t = np.array([q.x - p.x, q.y - p.y])
            t /= max(np.linalg.norm(t), 1e-9)
            for side in ((-1, 1) if idx != 1 else (-1,)):
                n = np.array([-t[1], t[0]]) * side
                x, y = p.x + n[0] * (w / 2 + 3.2), p.y + n[1] * (w / 2 + 3.2)
                if free.contains(Point(x, y)) and all(math.hypot(x - a, y - b) > 6 for a, b in spots):
                    spots.append((x, y))
            d += step
    # a grove in the south-east, scattered trees on the lawns
    grove = free.intersection(Polygon([(24, 140), (90, 140), (90, 228), (24, 228)]))
    spots += _poisson(grove, 900, 7.5, rnd, spots)
    spots += _poisson(free, 600, 13.0, rnd, spots)
    TREE_SPOTS.extend([round(x, 2), round(y, 2)] for x, y in spots)


def people(L, rnd):
    PEOPLE_SPOTS.clear()
    walk = unary_union([L['paths'], L['forecourt'], L['apron'], L['circle'].difference(Point(POOL).buffer(POOL_R + 0.6))]).buffer(-0.4)
    x0, y0, x1, y1 = walk.bounds
    while len(PEOPLE_SPOTS) < 46:
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        if walk.contains(Point(x, y)) and not L['tower'].buffer(1.5).contains(Point(x, y)):
            PEOPLE_SPOTS.append((round(x, 2), round(y, 2), 0.12))
