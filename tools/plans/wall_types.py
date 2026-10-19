"""Wall thickness by type, measured on the floor plans (drawn at 1:200, scale from the 6300 mm axes).

Every 10 cm along each wall face a ray goes straight through the wall; its length is the
thickness there, and the rooms found on the two sides give the wall's type:
  structural  reinforced concrete (core, shear walls, columns: the dark blue fill on the sheets)
  party       masonry between two apartments, or between an apartment and the common corridor
  partition   masonry between rooms of the same apartment
  exterior    masonry in the facade line

    python tools/plans/wall_types.py [plans.json] [--json out.json]
"""
import json
import sys
from collections import defaultdict

import numpy as np
from shapely.geometry import LineString, Point, Polygon
from shapely.geometry.polygon import orient
from shapely.ops import unary_union
from shapely.strtree import STRtree

args = sys.argv[1:]
path = next((a for a in args if a.endswith('.json') and (args.index(a) == 0 or args[args.index(a) - 1] != '--json')), 'src/model/plans.json')
out = args[args.index('--json') + 1] if '--json' in args else None
plans = json.load(open(path))
P = lambda pts: Polygon(pts).buffer(0)
result = {}
for key, plan in plans.items():
    enc = P(plan['enclosure'])
    walls = unary_union([P(p) for p in plan['walls']])
    struct = unary_union([P(p) for p in plan['struct']])
    solid = unary_union([walls, struct] + [P(p) for k in ('windows', 'glazing') for p in plan[k]])
    regions, owner = [], []
    for i, a in enumerate(plan['apartments']):
        for r in a['rooms']:
            regions.append(P(r['poly']))
            owner.append(('apt', i))
    for c in plan.get('common', []):
        regions.append(P(c))
        owner.append(('common', None))
    tree = STRtree(regions)

    def side(x, y):
        pt = Point(x, y)
        if not enc.buffer(0.02).contains(pt):
            return ('outside', None)
        for k in tree.query(pt):
            if regions[k].buffer(0.06).contains(pt):
                return owner[k]
        return ('unknown', None)

    samples = defaultdict(list)
    skipped = defaultdict(int)
    for cat, geom in (('wall', walls), ('struct', struct)):
        for poly in (geom.geoms if hasattr(geom, 'geoms') else [geom]):
            ring = np.array(orient(poly, 1.0).exterior.coords)
            for a, b in zip(ring[:-1], ring[1:]):
                d = b - a
                L = np.linalg.norm(d)
                if L < 0.3:
                    continue
                t, n = d / L, np.array([-d[1], d[0]]) / L  # rings are CCW: inward normal is to the left
                for s in np.arange(0.1, L - 0.05, 0.1):
                    p0 = a + t * s
                    ray = LineString([p0 - n * 0.005, p0 + n * 1.2])
                    hit = ray.intersection(solid)
                    seg = hit if hit.geom_type == 'LineString' else (min(hit.geoms, key=lambda g: g.distance(Point(p0))) if hasattr(hit, 'geoms') and len(hit.geoms) else None)
                    if seg is None or seg.is_empty:
                        continue
                    th = seg.length - 0.005
                    if th < 0.04 or th > 1.15:
                        continue
                    far = p0 + n * (th + 0.08)
                    s1, s2 = side(*(p0 - n * 0.08)), side(*far)
                    if cat == 'struct':
                        kind = 'structural'
                    elif 'outside' in (s1[0], s2[0]):
                        kind = 'exterior'
                    elif s1[0] == 'apt' and s2[0] == 'apt':
                        kind = 'partition' if s1[1] == s2[1] else 'party'
                    elif {'apt', 'common'} == {s1[0], s2[0]}:
                        kind = 'party'
                    else:
                        skipped[(s1[0], s2[0])] += 1
                        continue
                    samples[kind].append(round(th, 2))
    res = {}
    for kind, v in sorted(samples.items()):
        v = np.array(v)
        vals, cnt = np.unique(v, return_counts=True)
        mode = float(vals[cnt.argmax()])
        res[kind] = dict(samples=len(v), mode=mode, p25=float(np.percentile(v, 25)), median=float(np.median(v)),
                         p75=float(np.percentile(v, 75)), common=[[float(x), int(c)] for x, c in sorted(zip(vals, cnt), key=lambda z: -z[1])[:5]])
    result[key] = res
    print('  not typed:', dict(skipped)) if '-v' in args else None
    print(key)
    for kind, r in res.items():
        print(f"  {kind:10s} n={r['samples']:5d}  mode {r['mode']:.2f} m  median {r['median']:.2f}  (p25 {r['p25']:.2f}, p75 {r['p75']:.2f})  most common {r['common']}")
if out:
    json.dump(result, open(out, 'w'), indent=1)
