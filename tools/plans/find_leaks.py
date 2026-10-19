"""Where can one see or walk from one apartment into another? Lists openings in the solid
(walls, structure, windows) whose two sides belong to rooms of different apartments.

    python tools/plans/find_leaks.py [plans.json] [KEY...]
"""
import json
import sys

from shapely.geometry import Polygon
from shapely.ops import unary_union

args = sys.argv[1:]
path = args[0] if args and args[0].endswith('.json') else 'src/model/plans.json'
keys = [a for a in args if not a.endswith('.json')]
plans = json.load(open(path))
P = lambda pts: Polygon(pts).buffer(0)
parts = lambda g: [] if g.is_empty else (list(g.geoms) if hasattr(g, 'geoms') else [g])
total = 0
for key, plan in plans.items():
    if keys and key not in keys:
        continue
    solid = unary_union([P(p) for k in ('walls', 'struct', 'windows', 'glazing') for p in plan[k] if len(p) >= 3])
    enc = P(plan['enclosure'])
    rooms = [(i, P(r['poly'])) for i, a in enumerate(plan['apartments']) for r in a['rooms']]
    # space not covered by walls, inside the facade
    free = enc.buffer(-0.01).difference(solid)
    found = []
    # an opening = free space that the 'thick' solid (closed by 0.6 m) would cover: doorways, slits, holes
    for r in (0.3,):
        closed = solid.buffer(r, join_style='mitre').buffer(-r, join_style='mitre')
        for g in parts(closed.difference(solid).intersection(enc)):
            if g.area < 1e-4:
                continue
            near = sorted({i for i, rp in rooms if rp.distance(g) < 0.12 and rp.intersection(g.buffer(0.12)).area > 0.002})
            if len(near) >= 2:
                mrr = g.minimum_rotated_rectangle
                c = list(mrr.exterior.coords)
                sides = sorted([((c[k][0] - c[k + 1][0]) ** 2 + (c[k][1] - c[k + 1][1]) ** 2) ** 0.5 for k in range(4)])
                p = g.representative_point()
                found.append((round(p.x, 2), round(p.y, 2), near, round(sides[0], 3), round(sides[-1], 3)))
    total += len(found)
    print(f'{key}: {len(found)} openings between different apartments')
    for f in found:
        print('   at', f[:2], 'flats', f[2], f'thin side {f[3]} m, long side {f[4]} m')
print('total', total)
