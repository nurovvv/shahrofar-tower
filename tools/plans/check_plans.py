"""Geometry checks for the floor plans the viewer builds apartments from (src/model/plans.json).

    python tools/plans/check_plans.py [plans.json] [--quiet]

Per plan:
  slits        gaps narrower than 12 cm between wall / structure / window pieces (over 5 cm2)
  leaks        openings that connect rooms of two different apartments, or free space joining
               two apartments other than through the common corridor
  overlaps     solid pieces drawn twice (walls over structure etc.: flicker, double faces)
  floor gaps   bits of an apartment not covered by walls, room floors or fittings
  floor clash  room floors lying over each other (flicker)
  reach        rooms a visitor (0.25 m radius, as in walk.js) cannot walk into from the entrance hall
  areas        room polygons vs the areas written on the sheet
Exit code 1 when slits, leaks, overlaps, floor clashes or unreachable rooms are found.
"""
import json
import sys
from collections import deque

import numpy as np
import shapely
from shapely.geometry import Polygon
from shapely.ops import unary_union

args = sys.argv[1:]
path = next((a for a in args if a.endswith('.json')), 'src/model/plans.json')
quiet = '--quiet' in args
plans = json.load(open(path))
P = lambda pts: Polygon(pts).buffer(0)
parts = lambda g: [] if g.is_empty else [x for x in (g.geoms if hasattr(g, 'geoms') else [g]) if x.geom_type == 'Polygon']
RADIUS = 0.25  # walk.js
bad = 0


def reach(apt, solid, step=0.05):
    """Rooms reachable from the entrance hall for a disc of RADIUS moving through the flat."""
    outline = P(apt['outline'])
    free = outline.difference(solid)
    x0, y0, x1, y1 = outline.bounds
    nx, ny = int((x1 - x0) / step) + 1, int((y1 - y0) / step) + 1
    gx, gy = np.meshgrid(x0 + np.arange(nx) * step, y0 + np.arange(ny) * step)
    ok = shapely.contains_xy(free.buffer(-RADIUS + 0.01), gx.ravel(), gy.ravel()).reshape(ny, nx)
    rooms = [P(r['poly']) for r in apt['rooms']]
    halls = [i for i, r in enumerate(apt['rooms']) if r.get('tj') == 'Даҳлез'] or \
            [i for i, r in enumerate(apt['rooms']) if r['kind'] == 'hall'] or [max(range(len(rooms)), key=lambda i: rooms[i].area)]
    start = rooms[halls[0]]
    seen = np.zeros_like(ok)
    q = deque()
    for i, j in zip(*np.nonzero(ok & shapely.contains_xy(start, gx, gy))):
        seen[i, j] = True
        q.append((i, j))
    while q:
        i, j = q.popleft()
        for a, b in ((i + 1, j), (i - 1, j), (i, j + 1), (i, j - 1)):
            if 0 <= a < ny and 0 <= b < nx and ok[a, b] and not seen[a, b]:
                seen[a, b] = True
                q.append((a, b))
    out = []
    for i, r in enumerate(rooms):
        inside = shapely.contains_xy(r, gx, gy) & ok
        if inside.sum() == 0:
            continue  # too small to stand in (WC niches, shafts)
        if not (seen & inside).any():
            out.append(apt['rooms'][i]['name'] + f" {apt['rooms'][i]['area']}")
    return out


for key, plan in plans.items():
    cats = {k: [P(p) for p in plan[k] if len(p) >= 3] for k in ('walls', 'struct', 'windows', 'glazing')}
    solid = unary_union([p for v in cats.values() for p in v])
    enc = P(plan['enclosure'])
    # slits
    closed = solid.buffer(0.06, join_style='mitre').buffer(-0.06, join_style='mitre')
    slits = [g for g in parts(closed.difference(solid).intersection(enc)) if g.area > 5e-4]
    # overlaps between solid pieces
    allp = [p for v in cats.values() for p in v]
    tree = shapely.STRtree(allp)
    ov = 0.0
    for i, p in enumerate(allp):
        for j in tree.query(p):
            if j > i:
                ov += p.intersection(allp[j]).area
    # leaks between apartments
    rooms = [(i, P(r['poly'])) for i, a in enumerate(plan['apartments']) for r in a['rooms']]
    leaks = []
    # free space that joins rooms of two apartments without passing through the corridor
    common = unary_union([P(c) for c in plan.get('common', [])])
    free = enc.buffer(-0.02).difference(solid).difference(common.buffer(0.15))
    for comp in parts(free):
        owners = sorted({i for i, rp in rooms if comp.intersection(rp).area > 0.5})
        if len(owners) > 1:
            c = comp.representative_point()
            leaks.append(('joined', owners, round(comp.area, 1)))
    closed3 = solid.buffer(0.3, join_style='mitre').buffer(-0.3, join_style='mitre')
    for g in parts(closed3.difference(solid).intersection(enc)):
        near = sorted({i for i, rp in rooms if rp.intersection(g.buffer(0.12)).area > 0.002})
        if len(near) >= 2:
            c = g.representative_point()
            leaks.append((round(c.x, 2), round(c.y, 2), near))
    # floors
    gaps, clash, unreach, area_off = [], 0.0, [], []
    for i, a in enumerate(plan['apartments']):
        rp = [P(r['poly']) for r in a['rooms']]
        fx = unary_union([P(f) for f in a['fixtures']]) if a['fixtures'] else Polygon()
        hole = P(a['outline']).difference(solid).difference(unary_union(rp)).difference(fx)
        gaps += [g for g in parts(hole) if g.area > 0.02 and not g.minimum_rotated_rectangle.buffer(-0.03).is_empty]
        for m in range(len(rp)):
            for n in range(m + 1, len(rp)):
                clash += rp[m].intersection(rp[n]).area
        unreach += [(i, r) for r in reach(a, solid)]
        for r, p in zip(a['rooms'], rp):
            if r['area'] and abs(p.area / r['area'] - 1) > 0.15 and r['kind'] != 'loggia':
                area_off.append((i, r['name'], r['area'], round(p.area, 2)))
    fails = len(slits) + len(leaks) + (ov > 0.01) + (clash > 0.01) + len(unreach)
    bad += fails
    print(f"{key}: slits {len(slits)} · leaks {len(leaks)} · solid overlaps {ov:.3f} m2 · floor gaps {len(gaps)} "
          f"({sum(g.area for g in gaps):.2f} m2) · floor clash {clash:.3f} m2 · unreachable rooms {len(unreach)} · "
          f"room areas off by >15%: {len(area_off)}")
    if not quiet:
        for s_ in slits[:8]:
            c = s_.representative_point()
            print(f'    slit at ({c.x:.2f}, {c.y:.2f}) {s_.area * 1e4:.1f} cm2')
        for l in leaks:
            print('    leak at', l)
        for u in unreach:
            print('    unreachable: flat', u[0], u[1])
        for a in area_off:
            print('    area: flat %d %s drawn %.2f, polygon %.2f' % a)
sys.exit(1 if bad else 0)
