"""Turn the raw vector paths of the plan sheets (extract_pdf.py output) into building data:
walls, structure, windows, slab and balcony outlines, and apartments with their rooms.

    python blender/plans/build_plans.py RAW_DIR OUT.json

RAW_DIR holds one extract per tower (V.json, B.json, A.json) plus sheet.json with where
each tower sits on the sheet. The result (blender/plans/plans.json) is what the Blender
generator and the web viewer use.
"""
import colorsys
import json
import math
import os
import re
import sys
from collections import defaultdict

from shapely.geometry import MultiPolygon, Point, Polygon
from shapely.ops import unary_union

WALL = {(0.77, 0.48, 0.2), (0.34, 0.25, 0.2),   # masonry: party walls and partitions
        (0.6, 0.6, 0.6)}                       # 0.3 m walls on an axis, drawn grey (between flats on sheet 7)
STRUCT = {(0.0, 0.25, 0.5)}                       # reinforced concrete: core, shear walls, columns
FRAME = {(0.18, 0.25, 0.45)}                      # window frames and jambs (small dark pieces)
GLASS = {(0.93, 0.93, 0.95), (0.0, 0.0, 1.0)}
GLAZING = {(0.86, 0.86, 0.87), (0.3, 0.3, 0.9)}
COMMON = {(0.91, 0.91, 0.91), (0.97, 0.97, 0.94), (0.9, 0.9, 0.9)}
FIXTURE = {(0.95, 0.95, 0.95), (1.0, 1.0, 1.0), (0.96, 0.96, 0.96)}

# Solid geometry of a floor (walls, structure, windows) is rebuilt on a 1 cm grid as one partition,
# so neighbouring pieces share their edges exactly (no hairline slits between them).
GRID = 0.01
CLOSE = 0.06       # joints narrower than 2 x 6 cm between drawn pieces are closed (doorways are >= 0.6 m)
DUCT_MAX = 1.2     # m2: voids walled in on every side are ventilation ducts / shafts, part of the wall



def unblend_bands(by):
    """The sheets lay the structural grid axes over the plan as translucent grey bands, flattened
    into the fills: a wall, room or column under a band is drawn in a blend of its own colour and the
    band's. Find the band (grey g at opacity a, fitted on the wall and concrete colours) and give
    every blended fill back its own colour, so walls, columns and floors under the bands are kept."""
    import numpy as np
    known = WALL | STRUCT | FRAME | GLASS | GLAZING | COMMON | FIXTURE
    # windows only sit in the facade: the outer edge of everything drawn
    drawn = unary_union([p.buffer(0.03) for ps in by.values() for p in ps if p.area < 400])
    facade_line = max(parts(drawn), key=lambda q: q.area).exterior
    # shades a hair off a known colour (another sheet's export) are that colour; glass only in the facade
    merged = defaultdict(list)
    for c, ps in by.items():
        k = c
        if c not in known:
            b = min(known, key=lambda b: max(abs(x - y) for x, y in zip(b, c)))
            if max(abs(x - y) for x, y in zip(b, c)) <= 0.011:
                k = b
        for p in ps:
            merged[c if k in (GLASS | GLAZING) and p.distance(facade_line) > 1.2 else k].append(p)
    by = merged
    anchors = np.array(sorted(WALL - {(0.6, 0.6, 0.6)} | STRUCT | FRAME))
    count = {c: len(ps) for c, ps in by.items()}
    others = [c for c in by if c not in known]
    best = (0, None)
    for g in np.arange(0.6, 0.96, 0.01):
        for a in np.arange(0.15, 0.65, 0.01):
            pred = a * g + (1 - a) * anchors
            n = sum(count[c] for c in others if np.abs(pred - np.array(c)).max(axis=1).min() < 0.016)
            if n > best[0]:
                best = (n, (g, a))
    if best[0] < 10:  # no bands on this sheet
        return by, dict(band=None)
    g, a = best[1]
    rooms = [c for c in by if is_apartment_colour(c) and max(p.area for p in by[c]) > 6.0]
    bases = np.array(sorted(known) + rooms)
    thin_only = np.array([tuple(b) in (GLASS | GLAZING | FRAME) for b in bases.tolist()])
    out = defaultdict(list)
    moved = defaultdict(float)
    for c, ps in by.items():
        if c in known or c in rooms:
            out[c] += ps
            continue
        for p in ps:
            # glass and frames are thin strips in the facade: a broad or inner piece is never glass
            thin = (p.area < 0.6 or p.minimum_rotated_rectangle.buffer(-0.08).is_empty) and p.distance(facade_line) < 1.2
            err, k = 1.0, None
            for alpha in (a, 1 - (1 - a) ** 2):  # one band, or two crossing
                d = np.abs(alpha * g + (1 - alpha) * bases - np.array(c)).max(axis=1)
                if not thin:
                    d[thin_only] = 1.0
                if d.min() < err:
                    err, k = d.min(), int(d.argmin())
            target = tuple(float(x) for x in bases[k]) if err < 0.02 else c
            if target != c:
                moved[target] += p.area
            out[target].append(p)
    return out, dict(band=dict(grey=round(float(g), 2), opacity=round(float(a), 2)),
                     restored={'%.2f,%.2f,%.2f' % k: round(v, 2) for k, v in moved.items()})


def no_holes(p):
    """Split a polygon through its holes until none is left (the viewer extrudes outer rings)."""
    from shapely.geometry import LineString
    from shapely.ops import split
    if p.geom_type != 'Polygon' or not p.interiors:
        return [p]
    c = Polygon(p.interiors[0]).centroid
    x0, y0, x1, y1 = p.bounds
    out = []
    for q in split(p, LineString([(c.x, y0 - 1), (c.x, y1 + 1)])).geoms:
        out += no_holes(q)
    return out


def solid_partition(walls, struct, glass, glazing):
    """Walls, structure, windows and curved glazing as one solid on a 1 cm grid, split into the four
    kinds without gaps or overlaps. Ducts walled in on every side become part of the wall."""
    import shapely
    G = GRID

    def areal(g):  # keep the polygons of an overlay result (it may carry slivers as lines/points)
        if g.is_empty or g.geom_type in ('Polygon', 'MultiPolygon'):
            return g
        return unary_union([x for x in getattr(g, 'geoms', []) if x.geom_type in ('Polygon', 'MultiPolygon')])

    inter = lambda a, b: areal(shapely.intersection(a, b, grid_size=G))
    minus = lambda a, b: areal(shapely.difference(a, b, grid_size=G))
    raw = unary_union([walls, struct, glass, glazing])
    closed = raw.buffer(CLOSE, join_style='mitre').buffer(-CLOSE, join_style='mitre').union(raw)
    ducts = [Polygon(r) for q in parts(closed) for r in q.interiors if Polygon(r).area < DUCT_MAX]
    solid = areal(shapely.set_precision(unary_union([closed] + ducts), G))
    st = inter(areal(shapely.set_precision(struct, G)), solid)
    win = minus(inter(areal(shapely.set_precision(glass.buffer(0.02, join_style='mitre'), G)), solid), st)
    glz = minus(minus(inter(areal(shapely.set_precision(glazing.buffer(0.02, join_style='mitre'), G)), solid), st), win)
    wl = minus(minus(minus(solid, st), win), glz)
    return dict(walls=wl, struct=st, windows=win, glazing=glz, solid=solid), dict(
        ducts=len(ducts), duct_area=round(sum(d.area for d in ducts), 2),
        joints_closed=round(closed.difference(raw).area, 3))


def ring_out(g, min_area=1e-4):
    """Partition piece(s) -> [[x, y], ...] rings, counter-clockwise, on the 1 cm grid."""
    from shapely.geometry.polygon import orient
    out = []
    for p in parts(g):
        for q in no_holes(p):
            if q.area < min_area:
                continue
            q = orient(q, 1.0)
            pts = [[round(x, 2), round(y, 2)] for x, y in list(q.exterior.coords)[:-1]]
            if len(pts) >= 3:
                out.append(pts)
    return out

# Tajik room names on the sheets -> (English, kind)
ROOM_NAMES = [
    ('Хонаи хоб', 'Bedroom', 'bedroom'),
    ('Хонаи умумӣ', 'Family room', 'living'),
    ('Ҳуҷраи умумӣ', 'Family room', 'living'),
    ('Меҳмонхона', 'Living room', 'living'),
    ('Ошхона', 'Kitchen', 'kitchen'),
    ('Даҳлез', 'Hall', 'hall'),
    ('Ҳамом', 'Bathroom', 'bath'),
    ('Ҳаммом', 'Bathroom', 'bath'),
    ('Ҳоҷатхона', 'WC', 'bath'),
    ('Ташноб', 'WC', 'bath'),
    ('Помещение', 'Room', 'bedroom'),
    ('Айвон', 'Balcony', 'balcony'),
    ('Полкон', 'Balcony', 'balcony'),
    ('Терраса', 'Terrace', 'balcony'),
]


def geodesic_owner(area, seeds, step=0.15):
    """Multi-source flood fill over a free-space polygon: which seed point is nearest to each cell
    walking through the space (not through walls). Returns (owner(x, y) -> seed index or -1)."""
    import numpy as np
    import shapely
    from collections import deque
    x0, y0, x1, y1 = area.bounds
    nx, ny = int((x1 - x0) / step) + 2, int((y1 - y0) / step) + 2
    gx, gy = np.meshgrid(x0 + np.arange(nx) * step, y0 + np.arange(ny) * step)
    inside = shapely.contains_xy(area, gx.ravel(), gy.ravel()).reshape(ny, nx)
    own = np.full((ny, nx), -1, int)
    q = deque()
    for k, (sx, sy) in enumerate(seeds):
        i, j = int(round((sy - y0) / step)), int(round((sx - x0) / step))
        # snap the seed onto the nearest free cell
        cand = np.argwhere(inside)
        if len(cand) == 0:
            continue
        d = (cand[:, 0] - i) ** 2 + (cand[:, 1] - j) ** 2
        i, j = cand[int(d.argmin())]
        if own[i, j] < 0:
            own[i, j] = k
            q.append((i, j))
    while q:
        i, j = q.popleft()
        for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            a, b = i + di, j + dj
            if 0 <= a < ny and 0 <= b < nx and inside[a, b] and own[a, b] < 0:
                own[a, b] = own[i, j]
                q.append((a, b))

    def owner_of(poly):
        px0, py0, px1, py1 = poly.bounds
        votes = {}
        for i in range(max(0, int((py0 - y0) / step)), min(ny, int((py1 - y0) / step) + 2)):
            for j in range(max(0, int((px0 - x0) / step)), min(nx, int((px1 - x0) / step) + 2)):
                if own[i, j] >= 0 and poly.contains(Point(x0 + j * step, y0 + i * step)):
                    votes[own[i, j]] = votes.get(own[i, j], 0) + 1
        return max(votes, key=votes.get) if votes else -1
    return owner_of


def polys_of(shape):
    out = []
    for sub in shape['subs']:
        if len(sub) >= 3:
            p = Polygon(sub).buffer(0)
            if not p.is_empty and p.area > 1e-4:
                out += list(p.geoms) if isinstance(p, MultiPolygon) else [p]
    return out


def parts(g):
    if g.is_empty:
        return []
    if hasattr(g, 'geoms'):
        return [x for x in g.geoms if x.geom_type == 'Polygon' and not x.is_empty]
    return [g] if g.geom_type == 'Polygon' else []


def fill_holes(p):
    return Polygon(p.exterior)


def rnd(p, tol=0.015):
    """Polygon -> [[x, y], ...] (outer ring, counter-clockwise, simplified, cm precision)."""
    p = p.simplify(tol)
    if p.geom_type == 'MultiPolygon':
        p = max(p.geoms, key=lambda g: g.area)
    if p.is_empty or p.geom_type != 'Polygon':
        return None
    from shapely.geometry.polygon import orient
    p = orient(p, 1.0)
    return [[round(x, 2), round(y, 2)] for x, y in list(p.exterior.coords)[:-1]]


def rnd_holes(p, tol=0.015):
    """Polygon with holes -> {outer, holes}."""
    from shapely.geometry.polygon import orient
    p = orient(p.simplify(tol), 1.0)
    return dict(outer=[[round(x, 2), round(y, 2)] for x, y in list(p.exterior.coords)[:-1]],
                holes=[[[round(x, 2), round(y, 2)] for x, y in list(r.coords)[:-1]] for r in p.interiors])


def is_apartment_colour(c):
    if c is None:
        return False
    h, l, s = colorsys.rgb_to_hls(*c)
    # rooms are mid-tone; the lighter tints of the same hues mark balconies
    return s > 0.25 and 0.35 < l < 0.74 and tuple(c) not in WALL | STRUCT | GLASS | GLAZING


def text_lines(words):
    """Join words into phrases: [(x, y, text)] in tower coordinates. Words belong together when
    they share a baseline either on the sheet (room names) or in the tower frame (apartment labels)."""
    n = len(words)
    parent = list(range(n))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            a, b = words[i], words[j]
            for kx, ky in (('x', 'y'), ('sx', 'sy')):
                if abs(a[ky] - b[ky]) < 0.12 and 0 < b[kx] - a[kx] < 1.6:
                    parent[find(j)] = find(i)
    groups = {}
    for i in range(n):
        groups.setdefault(find(i), []).append(words[i])
    out = []
    for g in groups.values():
        spread = lambda k: max(w[k] for w in g) - min(w[k] for w in g)
        kx = 'x' if spread('y') <= spread('sy') else 'sx'
        g.sort(key=lambda w: w[kx])
        out.append((sum(w['x'] for w in g) / len(g), sum(w['y'] for w in g) / len(g), ' '.join(w['t'] for w in g)))
    return out


def merge_split_rooms(polys, solid, labelled):
    """Some rooms are filled as two pieces split along a drawn line (or an axis band whose strip
    of fill is lost). A piece without any label (no name, no area) joins the neighbour it shares the
    longest open seam with; a seam no longer than a doorway is a doorway, not a split."""
    polys = [p for p in polys]
    keep = [labelled(p) for p in polys]
    for i, p in enumerate(polys):
        if keep[i] or p is None:
            continue
        best, best_len = None, (0.3 if p.area < 1.0 else 1.05)  # a bit too small to be a room joins anyway
        for j, q in enumerate(polys):
            if j == i or q is None or p.distance(q) > 0.15:
                continue
            if p.intersection(q).area > 0.05:
                continue  # overlapping fills are separate layers, not a split room
            seam = p.buffer(0.1).intersection(q.buffer(0.1)).difference(solid.buffer(0.02))
            length = 0
            for g in parts(seam):
                c = list(g.minimum_rotated_rectangle.exterior.coords)
                length = max(length, max(math.dist(c[k], c[k + 1]) for k in range(4)) - 0.2)
            if length > best_len:
                best, best_len = j, length
        if best is not None:
            polys[best] = unary_union([polys[best], p]).buffer(0.08, join_style='mitre').buffer(-0.08, join_style='mitre')
            polys[i] = None
    return [p for p in polys if p is not None]


def process_tower(raw, residential=True, seeds=None):
    """seeds: points standing in for apartment labels on sheets that have none (one per flat)."""
    by = defaultdict(list)
    for s in raw['shapes']:
        if s['fill'] is not None:
            by[tuple(s['fill'])] += polys_of(s)
    by, report = unblend_bands(by)
    every = [p for ps in by.values() for p in ps]
    frames = unary_union([p for c in FRAME for p in by.get(c, [])])
    glass = unary_union([p for c in GLASS for p in by.get(c, [])])
    glazing = unary_union([p for c in GLAZING for p in by.get(c, [])])
    # window frames and jambs belong to the window (or curved glazing) they edge; the rest of that
    # colour is structure
    near_win, near_glz = glass.buffer(0.12), glazing.buffer(0.12)
    fr = parts(frames)
    walls = unary_union([p for c in WALL for p in by.get(c, [])])
    struct = unary_union([p for c in STRUCT for p in by.get(c, [])] +
                         [f for f in fr if not f.intersects(near_win) and not f.intersects(near_glz)])
    glass = unary_union([glass] + [f for f in fr if f.intersects(near_win)])
    glazing = unary_union([glazing] + [f for f in fr if not f.intersects(near_win) and f.intersects(near_glz)])

    # outer slab edge: everything drawn, merged, holes filled
    allp = unary_union([p.buffer(0.03) for p in every if p.area < 400])
    slab = fill_holes(max(parts(allp), key=lambda g: g.area)).buffer(-0.03)

    # apartment colours: saturated mid-tone fills. The main colour of each apartment fills its rooms;
    # a slightly different shade fills the window bays and beams that belong to the same rooms.
    apt_cols = [c for c in by if is_apartment_colour(c)]
    main_cols = [c for c in apt_cols if max(p.area for p in by[c]) > 6.0]
    main_of = lambda c: min(main_cols, key=lambda m: sum((x - y) ** 2 for x, y in zip(c, m)))
    rooms_raw = []
    for c in (apt_cols if main_cols else []):
        for p in by[c]:
            if p.area > 0.3:
                rooms_raw.append((main_of(c), p))
    common = unary_union([p for c in COMMON for p in by.get(c, []) if p.area > 1.5])
    # strips of corridor floor under the axis bands are small pieces: keep those touching the corridor
    common = unary_union([common] + [p for c in COMMON for p in by.get(c, []) if p.area <= 1.5 and p.distance(common) < 0.05
                                     and not p.minimum_rotated_rectangle.buffer(-0.06).is_empty])

    # inside of the facade: all rooms, walls, structure, glass and common areas
    inside = unary_union([p for _, p in rooms_raw] + [walls, struct, glass, glazing, common]).buffer(0.25).buffer(-0.25)
    enclosure = fill_holes(max(parts(inside), key=lambda g: g.area)) if residential else None

    cats, solid_report = solid_partition(walls, struct, glass, glazing)
    walls, struct, glass, glazing = cats['walls'], cats['struct'], cats['windows'], cats['glazing']
    result = dict(slab=rnd(slab, 0.03), walls=ring_out(walls), struct=ring_out(struct),
                  windows=ring_out(glass), glazing=ring_out(glazing))
    result['_report'] = dict(report, **solid_report)
    if not residential:
        hotel_inside = unary_union([walls, struct, glass, glazing]).buffer(0.6).buffer(-0.6)
        result['enclosure'] = rnd(fill_holes(max(parts(hotel_inside), key=lambda g: g.area)), 0.03)
        return result
    result['enclosure'] = rnd(enclosure, 0.02)
    result['common'] = [rnd(p) for p in parts(common) if p.area > 1.5]
    fixtures = [p for c in FIXTURE for p in by.get(c, []) if 0.15 < p.area < 3.0 and enclosure.contains(p.centroid)]

    # --- apartments: the walkable space inside the facade, minus walls and the shared corridor,
    # falls apart into one piece per apartment (each meets the corridor only at its entry door)
    solid = unary_union([walls, struct, glass, glazing]).buffer(0.03)
    thick_solid = solid.buffer(-0.07).buffer(0.07)  # without the hairlines drawn along the axes
    free = enclosure.buffer(-0.05).difference(solid).difference(common.buffer(0.12))
    pieces = [g for g in parts(free) if g.area > 12.0]
    # a fill that runs on across a wall into another apartment (the sheets sometimes join two rooms of
    # one colour into one path) is two rooms: cut it along the walls
    split = []
    for c, p in rooms_raw:
        if sum(1 for g in pieces if p.intersection(g).area > 1.0) >= 2:
            split += [(c, q) for q in parts(p.difference(solid)) if q.area > 0.3]
        else:
            split.append((c, p))
    rooms_raw = split
    # a few joints in the drawn walls leak, so split each piece further by room colour
    # (neighbouring apartments always have different colours) and by apartment label
    lines = text_lines(raw['words'])
    labels = []  # apartment labels: "2 хонагӣ" with "122,50 м2" just below
    for x, y, t in lines:
        if 'хонагӣ' not in t:
            continue
        m = re.search(r'(\d+)\s*хонагӣ', t)
        cands = [(math.hypot(x2 - x, y2 - y), m2) for x2, y2, t2 in lines
                 for m2 in [re.search(r'(\d+),(\d\d)', t2)] if m2 and math.hypot(x2 - x, y2 - y) < 1.2]
        area = float('.'.join(min(cands, key=lambda c: c[0])[1].groups())) if cands else None
        labels.append(dict(x=x, y=y, rooms=int(m.group(1)[-1]) if m else None, area=area))
    if not labels and seeds:
        labels = [dict(x=x, y=y, rooms=None, area=None) for x, y in seeds]

    groups = defaultdict(list)
    for i, (c, p) in enumerate(rooms_raw):
        # the piece of free space the fill lies in (most of it: thin strips may poke into walls)
        cover = [(p.intersection(g).area, k) for k, g in enumerate(pieces) if g.intersects(p)]
        if cover and max(cover)[0] > 0.02:
            groups[max(cover)[1]].append(i)
    # A few joints in the drawn walls leak and join two apartments into one piece. Such a piece is
    # split by room colour (neighbouring flats have different colours) and, where one colour still
    # holds two apartment labels ("2 хонагӣ ..."), each room goes to the label it is nearest to
    # walking through the flat. Unlabelled colour groups join the nearest labelled flat.
    regrouped = {}
    for k, idx in groups.items():
        labs = [L for L in labels if pieces[k].buffer(0.5).contains(Point(L['x'], L['y']))]
        if len(labs) <= 1 and pieces[k].area < 170:
            regrouped[(k, None)] = idx
            continue
        by_col = defaultdict(list)
        for i in idx:
            by_col[rooms_raw[i][0]].append(i)
        seeds = [(L['x'], L['y']) for L in labs]
        owner_all = geodesic_owner(pieces[k], seeds) if seeds else None
        for col, ii in by_col.items():
            hull = unary_union([rooms_raw[i][1] for i in ii]).buffer(0.4)
            mine = [n for n, L in enumerate(labs) if hull.contains(Point(L['x'], L['y']))]
            if len(mine) >= 2:
                own = geodesic_owner(hull.intersection(pieces[k].buffer(0.05)), [seeds[n] for n in mine])
                for i in ii:
                    o = own(rooms_raw[i][1])
                    regrouped.setdefault((k, 'L', mine[o] if o >= 0 else mine[0]), []).append(i)
            elif len(mine) == 1:
                regrouped.setdefault((k, 'L', mine[0]), []).extend(ii)
            elif owner_all is not None:
                for i in ii:
                    o = owner_all(rooms_raw[i][1])
                    regrouped.setdefault((k, 'L', o) if o >= 0 else (k, col), []).append(i)
            else:
                regrouped.setdefault((k, col), []).extend(ii)
    groups = regrouped

    names = []
    for x, y, t in lines:
        for tj, en, kind in ROOM_NAMES:
            if t.startswith(tj):
                names.append(dict(x=x, y=y, tj=tj, en=en, kind=kind))
    areas = [dict(x=x, y=y, a=float(t)) for x, y, t in lines if re.fullmatch(r'\d+\.\d\d', t)]

    # labels of small rooms often sit partly on their walls: look a little further out, nearest first
    def name_in(poly):
        c = [nm for nm in names if poly.buffer(0.1).contains(Point(nm['x'], nm['y']))] or \
            sorted([nm for nm in names if poly.area < 6 and poly.buffer(0.25).contains(Point(nm['x'], nm['y']))],
                   key=lambda nm: poly.distance(Point(nm['x'], nm['y'])))
        return c[0] if c else None

    def area_in(poly, near=None):
        c = [a for a in areas if poly.buffer(0.1).contains(Point(a['x'], a['y']))] or \
            sorted([a for a in areas if poly.area < 6 and poly.buffer(0.25).contains(Point(a['x'], a['y']))],
                   key=lambda a: poly.distance(Point(a['x'], a['y'])))
        if near:
            c.sort(key=lambda a: abs(a['x'] - near['x']) + abs(a['y'] - near['y']))
        return c[0]['a'] if c else None

    # --- units -> labels -> merge the unlabelled fragments -------------------------------------
    units = [dict(idx=list(g), label=None) for g in groups.values()]
    shape = lambda u: unary_union([rooms_raw[i][1] for i in u['idx']])
    room_area = lambda u: sum(rooms_raw[i][1].area for i in u['idx'])
    # nearest first; when two labels sit in one unit, the one whose area fits the unit wins
    pairs = sorted((round(shape(u).distance(Point(L['x'], L['y'])) / 0.5), abs((L['area'] or 0) - room_area(u)), a, b)
                   for a, u in enumerate(units) for b, L in enumerate(labels))
    used_u, used_l = set(), set()
    for limit in (1.0, 3.0):  # second pass: a label left over goes to an unlabelled unit next to it
        for dq, _, a, b in pairs:
            if dq * 0.5 < limit and a not in used_u and b not in used_l:
                units[a]['label'] = labels[b]
                used_u.add(a)
                used_l.add(b)
    changed = True
    while changed:
        changed = False
        for u in units:
            if u['label'] is not None or not u['idx']:
                continue
            su = shape(u)
            area = sum(rooms_raw[i][1].area for i in u['idx'])
            near = [v for v in units if v is not u and v['idx'] and shape(v).distance(su) < 0.6]
            if labels and labels[0]['area'] is not None:
                # an unlabelled piece belongs to the neighbour whose labelled area it completes best
                cand = [v for v in near if v['label'] and v['label']['area']]
                score = lambda v: abs(v['label']['area'] - (room_area(v) + area) * 1.08) / v['label']['area']
                cand = [v for v in cand if score(v) < 0.25]
                if not cand:
                    continue
                tgt = min(cand, key=score)
            else:
                # neighbouring flats are always filled in different colours: a piece next to a flat of
                # its own colour is part of that flat (even where the sheet draws no door between them)
                colour = lambda v: max(((rooms_raw[i][0], rooms_raw[i][1].area) for i in v['idx']), key=lambda c: c[1])[0]
                same = [v for v in near if v['label'] and colour(v) == colour(u)]
                if same:
                    tgt = max(same, key=lambda v: shape(v).buffer(0.4).intersection(su.buffer(0.4)).area)
                elif area >= 15 or not near:
                    continue
                else:
                    tgt = max(near, key=lambda v: shape(v).buffer(0.4).intersection(su.buffer(0.4)).area)
            tgt['idx'] += u['idx']
            u['idx'] = []
            changed = True
    units = [u for u in units if u['idx'] and sum(rooms_raw[i][1].area for i in u['idx']) >= 12]

    # balconies: slab outside the enclosure
    balcony_parts = [p for p in parts(slab.difference(enclosure.buffer(0.05))) if p.area > 1.0]

    apartments = []
    for unit in units:
        g = unit['idx']
        rooms = []
        for p in merge_split_rooms([rooms_raw[i][1] for i in g], thick_solid,
                                   lambda q: name_in(q) is not None or area_in(q) is not None):
            nm = name_in(p)
            ar = area_in(p, nm)
            fx = [f for f in fixtures if p.contains(f.centroid)]
            if nm:
                en, tj, kind = nm['en'], nm['tj'], nm['kind']
            elif fx:
                en, tj, kind = ('Bathroom', '', 'bath') if p.area > 3.2 else ('WC', '', 'bath')
            else:
                # unnamed: narrow bays against the facade are glazed loggias, small rooms are storage
                mrr = p.minimum_rotated_rectangle
                xs = [math.dist(a_, b_) for a_, b_ in zip(mrr.exterior.coords[:-1], mrr.exterior.coords[1:])]
                narrow = min(xs) < 2.3 if xs else False
                if narrow and enclosure.exterior.distance(p) < 0.6:
                    en, tj, kind = 'Loggia', '', 'loggia'
                elif p.area < 3.5:
                    en, tj, kind = 'Storage', '', 'storage'
                elif p.area > 15.0:  # a large room the sheet leaves unnamed
                    en, tj, kind = 'Room', '', 'living'
                else:
                    en, tj, kind = 'Hall', '', 'hall'
            rooms.append(dict(name=en, tj=tj, kind=kind, area=round(ar if ar else p.area, 2), poly=rnd(p)))
        colour = max(((rooms_raw[i][0], rooms_raw[i][1].area) for i in g), key=lambda c: c[1])[0]
        # outline: the rooms grown over the walls between them, until it is one piece
        u = unary_union([rooms_raw[i][1] for i in g])
        for r in (0.2, 0.3, 0.45, 0.6, 0.8):
            outline = u.buffer(r, join_style='mitre').buffer(0.12 - r, join_style='mitre').intersection(enclosure)
            if len(parts(outline)) == 1:
                break
        outline = fill_holes(max(parts(outline), key=lambda q: q.area))
        balcs = []  # balconies opening off this apartment
        for b in balcony_parts:
            if b.distance(outline) < 0.6:
                nm = name_in(b)
                balcs.append(dict(name=nm['en'] if nm else 'Balcony', tj=nm['tj'] if nm else 'Айвон', kind='balcony',
                                  area=round(area_in(b, nm) or b.area, 2), poly=rnd(b, 0.03)))
        fxs = [rnd(f, 0.01) for f in fixtures if outline.contains(f.centroid)]
        close_floor(rooms, outline, cats['solid'])
        lab = unit['label']
        n_rooms = sum(1 for r in rooms if r['kind'] in ('bedroom', 'living'))
        apartments.append(dict(colour='#%02x%02x%02x' % tuple(int(v * 255) for v in colour),
                               # habitable rooms, as the sheet counts them ("N хонагӣ") where it says so
                               rooms_count=lab['rooms'] if lab and lab['rooms'] else max(1, n_rooms),
                               label_rooms=lab['rooms'] if lab else None,
                               area=lab['area'] if lab and lab['area'] else round(sum(r['area'] for r in rooms), 2),
                               outline=rnd(outline, 0.03), rooms=rooms, balconies=balcs, fixtures=fxs))
    # order: by angle around the core, starting west, clockwise as seen from above
    for a in apartments:
        c = Polygon(a['outline']).centroid
        a['_ang'] = (-math.atan2(c.y, c.x) + math.pi) % (2 * math.pi)
    apartments.sort(key=lambda a: a['_ang'])
    for a in apartments:
        del a['_ang']
    result['apartments'] = apartments
    result['balconies'] = [rnd(b, 0.03) for b in balcony_parts]
    return result


def close_floor(rooms, outline, solid):
    """Room floors that tile the flat: no holes, no two floors over each other.
    - a fill lying (90 %+) inside another room of the flat is a duplicate drawn over it (the
      shower or WC corner of a bathroom): dropped, the room under it keeps the floor;
    - where two rooms still overlap, the smaller one keeps the overlap (a big fill runs under it);
    - bits of the flat that no fill covers (doorway thresholds, under bath tubs and basins, joints
      left by the drawing) go to the room they share the longest edge with;
    - every floor runs 3 cm in under its walls, never into another room."""
    polys = [Polygon(r['poly']).buffer(0) for r in rooms]
    n = len(polys)
    keep = [i for i in range(n) if not any(
        j != i and polys[j].area > polys[i].area and polys[i].intersection(polys[j]).area > 0.9 * polys[i].area
        for j in range(n))]

    def single(p):
        if p.geom_type == 'MultiPolygon':
            p = p.buffer(0.01, join_style='mitre').buffer(-0.01, join_style='mitre')
        if p.geom_type == 'MultiPolygon':
            p = max(p.geoms, key=lambda q: q.area)
        return p

    placed = Polygon()
    for i in sorted(keep, key=lambda i: polys[i].area):
        polys[i] = single(polys[i].difference(placed))
        placed = placed.union(polys[i])
    for _ in range(2):  # a second pass picks up what `single` left over
        covered = unary_union([polys[i] for i in keep])
        for g in parts(outline.difference(solid).difference(covered)):
            if g.area < 0.003:
                continue
            k = max(keep, key=lambda i: polys[i].intersection(g.buffer(0.03)).area)
            if polys[k].intersection(g.buffer(0.03)).area > 0:
                polys[k] = single(unary_union([polys[k], g.buffer(0.005, join_style='mitre')]).difference(
                    unary_union([polys[j] for j in keep if j != k])))
    for i in keep:
        p = unary_union([polys[i], polys[i].buffer(0.03, join_style='mitre').intersection(solid)])
        polys[i] = single(p.difference(unary_union([polys[j] for j in keep if j != i])))
    for i in keep:
        r = rnd(polys[i], 0.005)
        if r:
            rooms[i]['poly'] = r
    rooms[:] = [rooms[i] for i in keep]


def main():
    raw_dir, out = sys.argv[1], sys.argv[2]
    sheet = json.load(open(os.path.join(raw_dir, 'sheet.json')))
    towers = {}
    for key, info in sheet['towers'].items():
        raw = json.load(open(os.path.join(raw_dir, f'{key}.json')))
        seeds = None
        if info.get('plan_of'):
            # these sheets carry no apartment labels: the flats of the typical floor seed the split
            base = towers[info['plan_of']]
            seeds = [max((Polygon(r['poly']) for r in a['rooms']), key=lambda q: q.area).representative_point().coords[0]
                     for a in base['apartments']]
        t = process_tower(raw, residential=not info.get('hotel'), seeds=seeds)
        t.update(info)
        towers[key] = t
        n = len(t.get('apartments', []))
        print(key, 'apartments', n, [(a['rooms_count'], a['label_rooms'], a['area'], len(a['rooms'])) for a in t.get('apartments', [])])
    json.dump(dict(source=sheet['source'], levels=sheet['levels'], towers=towers), open(out, 'w'), separators=(',', ':'))
    print('wrote', out, os.path.getsize(out) // 1024, 'KB')


if __name__ == '__main__':
    main()
