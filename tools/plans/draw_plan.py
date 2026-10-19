"""Draw a floor plan of src/model/plans.json to PNG for checking (walls black, structure blue,
windows cyan, glazing teal, apartments in their colours, gaps between wall pieces red).

    python tools/plans/draw_plan.py V out.png [x0 y0 x1 y1] [--px 40] [--json src/model/plans.json]
"""
import json
import sys

from PIL import Image, ImageDraw, ImageFont
from shapely.geometry import Polygon
from shapely.ops import unary_union

args = sys.argv[1:]
opt = lambda k, d: args[args.index(k) + 1] if k in args else d
src = opt('--json', 'src/model/plans.json')
pxm = float(opt('--px', 40))
pos = [a for i, a in enumerate(args) if not a.startswith('--') and not (i and args[i - 1].startswith('--'))]
key, out = pos[0], pos[1]
plan = json.load(open(src))[key]
P = lambda pts: Polygon(pts).buffer(0)
every = [p for k in ('walls', 'struct', 'windows', 'glazing') for p in plan[k]] + [plan['enclosure']]
xs = [x for p in every for x, _ in p]
ys = [y for p in every for _, y in p]
x0, y0, x1, y1 = (map(float, pos[2:6]) if len(pos) >= 6 else (min(xs) - 1, min(ys) - 1, max(xs) + 1, max(ys) + 1))
W, H = int((x1 - x0) * pxm), int((y1 - y0) * pxm)
img = Image.new('RGB', (W, H), 'white')
g = ImageDraw.Draw(img, 'RGBA')
T = lambda pts: [((x - x0) * pxm, (y1 - y) * pxm) for x, y in pts]


def poly(pts, fill=None, outline=None, width=1):
    if len(pts) >= 3:
        g.polygon(T(pts), fill=fill, outline=outline, width=width)


for c in plan.get('common', []):
    poly(c, fill=(225, 225, 225))
for a in plan['apartments']:
    col = tuple(int(a['colour'][i:i + 2], 16) for i in (1, 3, 5))
    for r in a['rooms']:
        poly(r['poly'], fill=col + (90,), outline=col + (255,))
for w in plan['walls']:
    poly(w, fill=(20, 20, 20))
for w in plan['struct']:
    poly(w, fill=(30, 70, 160))
for w in plan['windows']:
    poly(w, fill=(80, 200, 230))
for w in plan['glazing']:
    poly(w, fill=(40, 150, 140))
for a in plan['apartments']:
    poly(a['outline'], outline=(200, 0, 120), width=2)
solid = unary_union([P(p) for k in ('walls', 'struct', 'windows', 'glazing') for p in plan[k]])
closed = solid.buffer(0.1, join_style='mitre').buffer(-0.1, join_style='mitre')
gaps = closed.difference(solid)
for gp in (gaps.geoms if hasattr(gaps, 'geoms') else [gaps]):
    if gp.area > 2e-4 and gp.geom_type == 'Polygon':
        poly(list(gp.exterior.coords), fill=(255, 0, 0, 255))
f = ImageFont.load_default()
if '--labels' in args:
    for i, a in enumerate(plan['apartments']):
        for r in a['rooms']:
            c = Polygon(r['poly']).representative_point()
            g.text(T([(c.x, c.y)])[0], f"{r['name'][:7]} {r['area']}", fill=(0, 0, 0), font=f, anchor='mm')
        c = Polygon(a['outline']).representative_point()
        g.text((T([(c.x, c.y)])[0][0], T([(c.x, c.y)])[0][1] + 12), f"#{i} {a['area']}", fill=(200, 0, 120), font=f, anchor='mm')
# metre grid labels
for x in range(int(x0), int(x1) + 1):
    if x % 5 == 0:
        g.line([((x - x0) * pxm, 0), ((x - x0) * pxm, H)], fill=(0, 0, 0, 30))
        g.text(((x - x0) * pxm + 2, 2), str(x), fill='black', font=f)
for y in range(int(y0), int(y1) + 1):
    if y % 5 == 0:
        g.line([(0, (y1 - y) * pxm), (W, (y1 - y) * pxm)], fill=(0, 0, 0, 30))
        g.text((2, (y1 - y) * pxm + 2), str(y), fill='black', font=f)
img.save(out)
print(out, W, H)
