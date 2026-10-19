"""Side by side: the PDF sheet and the extracted plan around one spot (for checking walls).

    python tools/plans/compare_crop.py V x y half out.png [--pdf path] [--json plans.json]
"""
import json
import subprocess
import sys

import pymupdf
from PIL import Image

SHEETS = {'V': (7, 1269.3, 721.1, 0.0), 'B': (7, 1222.0, 1432.6, None), 'V23': (8, 1044.45, 598.8, 0.0),
          'V24': (8, 1044.45, 1602.9, 0.0)}
AXES = {'B': (406.3, 181.2)}
M = 6.3 / 85.0
args = sys.argv[1:]
opt = lambda k, d: args[args.index(k) + 1] if k in args else d
pdf = opt('--pdf', '/Users/nurovvv/Dom/reference/ar-drawings.pdf')
src = opt('--json', 'src/model/plans.json')
key, x, y, h, out = args[0], float(args[1]), float(args[2]), float(args[3]), args[4]
page, cx, cy, _ = SHEETS[key]
import math
ux, uy = AXES.get(key, (1, 0))
a = math.atan2(-uy, ux)
ca, sa = math.cos(a), math.sin(a)


def to_pdf(px, py):  # tower frame -> PDF points (inverse of extract_pdf.local)
    dx, dy = ca * px - sa * py, sa * px + ca * py
    return cx + dx / M, cy - dy / M


pts = [to_pdf(x + sx * h, y + sy * h) for sx in (-1, 1) for sy in (-1, 1)]
rect = pymupdf.Rect(min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts))
pg = pymupdf.open(pdf)[page - 1]
pix = pg.get_pixmap(clip=rect, dpi=900 if h < 2 else 500)
pix.save('/tmp/_crop_pdf.png') if False else pix.save(out + '.pdf.png')
px = 600 / (2 * h)
subprocess.run([sys.executable, 'tools/plans/draw_plan.py', key, out + '.plan.png', str(x - h), str(y - h), str(x + h), str(y + h),
                '--px', str(px), '--json', src], check=True, capture_output=True)
A = Image.open(out + '.pdf.png')
if key == 'B':  # the B sheet is drawn turned; show it turned into the tower frame
    A = A.rotate(-math.degrees(a), expand=True, fillcolor='white')
    w, hh = A.size
    s = min(w, hh) / math.sqrt(2)
    A = A.crop(((w - s) / 2, (hh - s) / 2, (w + s) / 2, (hh + s) / 2))
A = A.resize((600, 600))
B = Image.open(out + '.plan.png').resize((600, 600))
C = Image.new('RGB', (1210, 600), 'white')
C.paste(A, (0, 0))
C.paste(B, (610, 0))
C.save(out)
print(out)
