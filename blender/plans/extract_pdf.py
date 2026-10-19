"""Pull the vector geometry of one tower out of an architectural plan sheet (PDF, 1:200).

    python blender/plans/extract_pdf.py SHEET.pdf PAGE x0 y0 x1 y1 cx cy ux uy OUT.json

PAGE is 1-based; (x0, y0, x1, y1) is the region around the tower in PDF points; (cx, cy) the
tower centre and (ux, uy) the direction of its lettered axes, both in PDF points (y down).
Writes every filled path in the region in metres, in the tower's own frame: x along the
lettered axes, y perpendicular to it (up on the sheet when the axes run left to right).
"""
import json
import math
import sys

import pymupdf

M_PER_PT = 6.3 / 85.0  # 1:200 sheet: 6300 mm between axes measures 85.0 pt


def main():
    f, page = sys.argv[1], int(sys.argv[2])
    x0, y0, x1, y1, cx, cy, ux, uy = map(float, sys.argv[3:11])
    out = sys.argv[11]
    pg = pymupdf.open(f)[page - 1]
    region = pymupdf.Rect(x0, y0, x1, y1)
    a = math.atan2(-uy, ux)  # axis direction with y up
    ca, sa = math.cos(-a), math.sin(-a)

    def local(p):
        dx, dy = (p.x - cx) * M_PER_PT, (cy - p.y) * M_PER_PT
        return [round(ca * dx - sa * dy, 4), round(sa * dx + ca * dy, 4)]

    def bezier(p0, c1, c2, p3, n=10):
        pts = []
        for i in range(1, n + 1):
            t = i / n
            k = ((1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t * t, t ** 3)
            pts.append(pymupdf.Point(sum(w * q.x for w, q in zip(k, (p0, c1, c2, p3))),
                                     sum(w * q.y for w, q in zip(k, (p0, c1, c2, p3)))))
        return pts

    shapes = []
    for d in pg.get_drawings():
        if not region.contains(pymupdf.Rect(d['rect'])):
            continue
        subs, cur = [], []
        for it in d['items']:
            kind = it[0]
            if kind in ('re', 'qu'):
                if cur:
                    subs.append(cur)
                    cur = []
                q = it[1].quad if kind == 're' else it[1]
                subs.append([q.ul, q.ur, q.lr, q.ll])
                continue
            p0 = it[1]
            if cur and (abs(cur[-1].x - p0.x) > 1e-3 or abs(cur[-1].y - p0.y) > 1e-3):
                subs.append(cur)
                cur = []
            if not cur:
                cur = [p0]
            cur += [it[2]] if kind == 'l' else bezier(*it[1:5])
        if cur:
            subs.append(cur)
        rgb = lambda c: [round(v, 2) for v in c] if c is not None else None
        shapes.append(dict(fill=rgb(d.get('fill')), stroke=rgb(d.get('color')), width=d.get('width'),
                           subs=[[local(p) for p in s] for s in subs]))
    words = []
    for w in pg.get_text('words'):
        r = pymupdf.Rect(w[:4])
        if region.contains(r):
            c = pymupdf.Point((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2)
            x, y = local(c)
            # sx/sy: position on the sheet itself; room names are lettered along the sheet, apartment
            # labels along the tower, so both are kept to rejoin words into phrases
            words.append(dict(x=x, y=y, sx=round(c.x * M_PER_PT, 3), sy=round(-c.y * M_PER_PT, 3),
                              h=round(r.height * M_PER_PT, 3), t=w[4]))
    json.dump(dict(shapes=shapes, words=words), open(out, 'w'))
    print(out, len(shapes), 'shapes', len(words), 'words')


if __name__ == '__main__':
    main()
