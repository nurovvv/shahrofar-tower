// The local streets round the plot, finished in the viewer: road markings (dashed centre lines,
// zebra crossings with stop lines), street lights, traffic signs, a bus stop, benches, bins,
// manhole covers and drain grates. The model has the roads themselves (asphalt, raised sidewalks
// with kerbs) and plain box lamps and benches (Street_furniture), which are replaced here.
//
// The roads are the centre lines and widths the Blender build uses (blender/complex/site.py,
// ROADS), in site metres (x east, y north). Site (x, y) is the kit's plan (x - 5, y - 240) and
// scene (x - 5, 240 - y).
import * as THREE from 'three';
import { Kit } from './interior/kit.js';
import { BENCHES } from './config.js';

// [centre line, width]; index 0 is the embankment road (the model draws its centre line)
const ROADS = [
  [[[-420, 314], [420, 314]], 14],
  [[[-65, 314], [-64, 280], [-62, 245], [-60, 215], [-58, 160], [-56, 60]], 9],
  [[[-60, 236], [-52.7, 231.1], [-41.5, 224.8], [-22.6, 211.4], [-3.6, 195.8], [13.8, 178.8], [24.4, 167.2], [40.5, 156.7], [57, 145], [70, 136]], 8],
  [[[-46, 233], [-27.8, 231.7], [-8.4, 227], [5.6, 226], [18.8, 218.8], [24.6, 209.6], [21.6, 198.5], [13.8, 181]], 7],
  [[[57, 143], [64.7, 164.6], [73.3, 189], [77.5, 207.9], [80.8, 229.2], [85.3, 253.1], [90, 272], [97, 290], [108, 302], [118, 312]], 8],
  [[[85, 60], [83.3, 125.6], [78.2, 142.6], [76.6, 162.5], [82.3, 187.3], [88.3, 210.1], [95.2, 236.1], [103.8, 263.1], [110.2, 288.6], [117, 300], [126, 310]], 8],
  [[[52, 300], [59.2, 311.5], [76.1, 315], [93.5, 311.6], [108, 298.7]], 7],
];
const NEAR = [1, 2, 3, 4, 5, 6]; // the roads round the plot

const ROAD_Y = 0.03; // the asphalt's top
const plan = ([x, y]) => [x - 5, y - 240];
const scene = (x, y, h) => [x - 5, h, 240 - y];

// ---------- polyline helpers (site metres) ----------

function measure(pts) {
  const segs = [];
  let L = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1], l = Math.hypot(bx - ax, by - ay);
    segs.push({ ax, ay, ux: (bx - ax) / l, uy: (by - ay) / l, l, s0: L });
    L += l;
  }
  return { segs, L };
}

/** point, direction and left normal at arc length s */
function along(line, s) {
  s = Math.max(0, Math.min(line.L, s));
  const g = line.segs.find((q) => s <= q.s0 + q.l) ?? line.segs[line.segs.length - 1];
  const t = s - g.s0;
  return { x: g.ax + g.ux * t, y: g.ay + g.uy * t, ux: g.ux, uy: g.uy, nx: -g.uy, ny: g.ux };
}

function distToLine(line, x, y) {
  let d = Infinity;
  for (const g of line.segs) {
    const t = Math.max(0, Math.min(g.l, (x - g.ax) * g.ux + (y - g.ay) * g.uy));
    d = Math.min(d, Math.hypot(x - g.ax - g.ux * t, y - g.ay - g.uy * t));
  }
  return d;
}

/**
 * People standing on a local road (the site model scatters a few anywhere) are moved onto the
 * nearest sidewalk. list: [[x, y, z, ...], ...] in site metres.
 */
export function keepOffRoads(list) {
  const lines = ROADS.map(([pts, w]) => ({ w, line: measure(pts) }));
  return list.map((p) => {
    const [x, y] = p;
    for (const { w, line } of lines) {
      if (distToLine(line, x, y) >= w / 2 + 0.1) continue;
      // nearest point on the centre line, then out to the sidewalk on the person's side
      let best = null;
      for (const g of line.segs) {
        const t = Math.max(0, Math.min(g.l, (x - g.ax) * g.ux + (y - g.ay) * g.uy));
        const qx = g.ax + g.ux * t, qy = g.ay + g.uy * t, d = Math.hypot(x - qx, y - qy);
        if (!best || d < best.d) best = { d, qx, qy, nx: -g.uy, ny: g.ux, ux: g.ux, uy: g.uy };
      }
      const side = (x - best.qx) * best.nx + (y - best.qy) * best.ny >= 0 ? 1 : -1;
      // spread along the sidewalk (people moved from one stretch would otherwise stand together)
      const slide = (((Math.abs(x) * 7.31 + Math.abs(y) * 3.17) % 1) - 0.5) * 6;
      const out = w / 2 + 0.5 + (((Math.abs(x) * 1.7) % 1) * 0.8);
      return [best.qx + best.ux * slide + best.nx * side * out, best.qy + best.uy * slide + best.ny * side * out, 0.12, ...p.slice(3)];
    }
    return p;
  });
}

// ---------- textures ----------

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function walker(g, x, y, s, color) {
  // a pedestrian pictogram, about s tall, feet at (x, y)
  g.fillStyle = color;
  g.strokeStyle = color;
  g.lineCap = 'round';
  g.beginPath();
  g.arc(x + s * 0.06, y - s * 0.9, s * 0.09, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = s * 0.11;
  g.beginPath();
  g.moveTo(x + s * 0.02, y - s * 0.75);
  g.lineTo(x - s * 0.04, y - s * 0.4);
  g.lineTo(x - s * 0.2, y);
  g.moveTo(x - s * 0.04, y - s * 0.4);
  g.lineTo(x + s * 0.16, y - s * 0.2);
  g.lineTo(x + s * 0.18, y);
  g.moveTo(x + s * 0.0, y - s * 0.68);
  g.lineTo(x - s * 0.2, y - s * 0.45);
  g.moveTo(x + s * 0.0, y - s * 0.68);
  g.lineTo(x + s * 0.2, y - s * 0.5);
  g.stroke();
}

const SIGNS = {
  // blue square, white triangle, black pedestrian on stripes
  crossing: () => canvasTex(128, 128, (g, w) => {
    g.fillStyle = '#f4f4f4';
    g.fillRect(0, 0, w, w);
    g.fillStyle = '#1f5fa8';
    g.fillRect(5, 5, w - 10, w - 10);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(w / 2, 16);
    g.lineTo(w - 14, w - 20);
    g.lineTo(14, w - 20);
    g.closePath();
    g.fill();
    g.fillStyle = '#111';
    for (let i = 0; i < 4; i++) g.fillRect(34 + i * 16, w - 34, 9, 8);
    walker(g, w / 2 - 2, w - 36, 54, '#111');
  }),
  // give way: red-bordered triangle, point down
  giveway: () => canvasTex(128, 128, (g, w) => {
    g.clearRect(0, 0, w, w);
    g.fillStyle = '#c4161c';
    g.beginPath();
    g.moveTo(6, 10);
    g.lineTo(w - 6, 10);
    g.lineTo(w / 2, w - 8);
    g.closePath();
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(24, 21);
    g.lineTo(w - 24, 21);
    g.lineTo(w / 2, w - 34);
    g.closePath();
    g.fill();
  }),
  // speed limit 40: red ring
  speed: () => canvasTex(128, 128, (g, w) => {
    g.clearRect(0, 0, w, w);
    g.fillStyle = '#c4161c';
    g.beginPath();
    g.arc(w / 2, w / 2, w / 2 - 3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(w / 2, w / 2, w / 2 - 17, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#111';
    g.font = 'bold 50px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('40', w / 2, w / 2 + 3);
  }),
  // bus stop: blue panel with a bus
  bus: () => canvasTex(128, 160, (g, w, h) => {
    g.fillStyle = '#1f5fa8';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff';
    g.fillRect(6, 6, w - 12, 92);
    g.fillStyle = '#1f5fa8';
    g.fillRect(22, 26, 84, 46);
    g.fillStyle = '#ffffff';
    g.fillRect(28, 32, 32, 18);
    g.fillRect(66, 32, 32, 18);
    g.fillStyle = '#1f5fa8';
    g.beginPath();
    g.arc(38, 78, 8, 0, Math.PI * 2);
    g.arc(90, 78, 8, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.font = 'bold 20px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText('Shahrofar', w / 2, 124);
    g.font = '15px system-ui, sans-serif';
    g.fillText('8 · 14 · 27', w / 2, 146);
  }),
  // an advertising poster for the shelter
  poster: () => canvasTex(128, 192, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#d9c4a5');
    grd.addColorStop(1, '#8a5a3c');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.92)';
    g.font = 'bold 20px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText('SKYLINE', w / 2, 40);
    g.fillText('RESIDENCE', w / 2, 64);
    g.font = '13px system-ui, sans-serif';
    g.fillText('Apartments by the river', w / 2, 90);
    g.fillStyle = 'rgba(40,30,25,0.6)';
    for (const [x, ww, hh] of [[18, 22, 70], [46, 26, 92], [78, 22, 60]]) g.fillRect(x, h - 20 - hh, ww, hh);
  }),
};

function grateTex() {
  return canvasTex(64, 40, (g, w, h) => {
    g.fillStyle = '#3a3b3d';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#121314';
    for (let x = 6; x < w - 4; x += 6) g.fillRect(x, 5, 3, h - 10);
  });
}

function manholeTex() {
  return canvasTex(128, 128, (g, w) => {
    g.clearRect(0, 0, w, w);
    g.fillStyle = '#4a4b4d';
    g.beginPath();
    g.arc(w / 2, w / 2, w / 2 - 1, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#2c2d2f';
    g.lineWidth = 3;
    for (const r of [56, 44, 30]) {
      g.beginPath();
      g.arc(w / 2, w / 2, r, 0, Math.PI * 2);
      g.stroke();
    }
    for (let a = 0; a < Math.PI; a += Math.PI / 6) {
      g.beginPath();
      g.moveTo(w / 2 + Math.cos(a) * 56, w / 2 + Math.sin(a) * 56);
      g.lineTo(w / 2 - Math.cos(a) * 56, w / 2 - Math.sin(a) * 56);
      g.stroke();
    }
  });
}

// ---------- markings: flat quads just above the asphalt ----------

class Paint {
  constructor() {
    this.pos = [];
    this.uv = [];
  }
  /** a quad on the road: centre (site x, y), length l along (ux, uy), width w across; UVs 0..1 */
  quad(x, y, ux, uy, l, w, h = ROAD_Y + 0.004) {
    const nx = -uy, ny = ux, a = l / 2, b = w / 2;
    const P = (s, t) => scene(x + ux * s + nx * t, y + uy * s + ny * t, h);
    const c = [[P(-a, -b), [0, 0]], [P(a, -b), [1, 0]], [P(a, b), [1, 1]], [P(-a, b), [0, 1]]];
    // wind the triangles so they face up (scene y)
    const [p0, p1, p2] = [c[0][0], c[1][0], c[2][0]];
    const up = (p2[0] - p0[0]) * (p1[2] - p0[2]) - (p2[2] - p0[2]) * (p1[0] - p0[0]) > 0;
    const order = up ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    for (const i of order) {
      this.pos.push(...c[i][0]);
      this.uv.push(...c[i][1]);
    }
  }
  mesh(mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    return m;
  }
}

// ---------- street furniture models (kit frame: x right, y up, z front, origin on the ground) ----------

function streetLight(k, M) {
  k.cyl(M.dark, 0, 0, 0, 0.16, 0.5, 16, 0.13); // base cover
  k.cyl(M.pole, 0, 0.5, 0, 0.085, 8.0, 16, 0.055);
  // the arm: a gentle curve out over the road (+z), the luminaire at its end
  k.tube(M.pole, [[0, 7.7, 0], [0, 8.05, 0.35], [0, 8.2, 1.0], [0, 8.18, 1.55]], 0.045, 16);
  k.rbox(M.pole, 0, 8.14, 1.85, 0.32, 0.09, 0.75, 0.03);
  k.box(M.lens, -0.12, 8.09, 1.55, 0.12, 8.096, 2.15);
}

function bench(k, M) {
  for (const x of [-0.75, 0.75]) {
    k.box(M.dark, x - 0.04, 0, 0.05, x + 0.04, 0.42, 0.5);
    k.box(M.dark, x - 0.04, 0.42, 0.02, x + 0.04, 0.85, 0.08);
  }
  for (let i = 0; i < 4; i++) k.box(M.slat, -0.95, 0.42, 0.08 + i * 0.11, 0.95, 0.46, 0.17 + i * 0.11);
  for (let i = 0; i < 3; i++) k.box(M.slat, -0.95, 0.52 + i * 0.12, 0.06, 0.95, 0.61 + i * 0.12, 0.1);
}

function bin(k, M) {
  k.cyl(M.dark, 0, 0, 0, 0.04, 0.5, 8);
  k.cyl(M.binBody, 0, 0.45, 0, 0.2, 1.0, 20);
  k.cyl(M.dark, 0, 1.0, 0, 0.21, 1.03, 20);
}

/** a sign on a post: the face towards +z */
function signPost(k, M, faces, h = 2.6) {
  k.cyl(M.pole, 0, 0, 0, 0.035, h + 0.1, 10);
  faces.forEach(([mat, w, hh, kind], i) => {
    const y = h - i * (hh + 0.08);
    if (kind === 'round') {
      const g = new THREE.CircleGeometry(w / 2, 32);
      g.translate(0, y - hh / 2, 0.045);
      k.add(mat, g);
      const back = new THREE.CylinderGeometry(w / 2, w / 2, 0.02, 32);
      back.rotateX(Math.PI / 2);
      back.translate(0, y - hh / 2, 0.03);
      k.add(M.signBack, back);
    } else {
      k.plane(mat, 0, y - hh / 2, 0.045, w, hh);
      k.box(M.signBack, -w / 2, y - hh, 0.02, w / 2, y, 0.04);
    }
  });
}

function busShelter(k, M) {
  const w = 4.0, d = 1.5, h = 2.5;
  for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2 - 0.1]) k.box(M.pole, x - 0.04, 0, z - 0.04, x + 0.04, h, z + 0.04);
  // roof sloping to the back, glass back and sides, a lit poster at one end
  const roof = new THREE.BoxGeometry(w + 0.3, 0.08, d + 0.4);
  roof.rotateX(-0.06);
  roof.translate(0, h + 0.05, 0);
  k.add(M.pole, roof);
  k.box(M.shelterGlass, -w / 2, 0.15, -d / 2 - 0.01, w / 2, h - 0.1, -d / 2 + 0.01);
  k.box(M.shelterGlass, -w / 2 - 0.01, 0.15, -d / 2, -w / 2 + 0.01, h - 0.1, d / 2 - 0.3);
  k.box(M.pole, w / 2 - 0.02, 0.1, -d / 2, w / 2 + 0.06, h - 0.05, d / 2 - 0.3);
  k.plane(M.poster, w / 2 + 0.065, 1.35, 0, 1.0, 1.5, Math.PI / 2);
  // bench along the back
  k.box(M.dark, -1.4, 0.44, -d / 2 + 0.05, 1.4, 0.48, -d / 2 + 0.45);
  for (const x of [-1.2, 0, 1.2]) k.box(M.dark, x - 0.03, 0, -d / 2 + 0.2, x + 0.03, 0.44, -d / 2 + 0.3);
  // timetable panel on the side glass
  k.box(M.signBack, -w / 2 + 0.03, 1.1, -0.2, -w / 2 + 0.05, 1.7, 0.3);
}

// ---------- layout ----------

export function addStreets(scene3, root) {
  // the model's box lamps and plain benches give way to the ones below
  const old = root.getObjectByName('Street_furniture');
  if (old) old.visible = false;

  const std = (o) => new THREE.MeshStandardMaterial(o);
  const M = {
    paint: std({ color: 0xe9e7e0, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    pole: std({ color: 0x5d6166, roughness: 0.45, metalness: 0.7 }),
    dark: std({ color: 0x2b2d30, roughness: 0.55, metalness: 0.5 }),
    lens: std({ color: 0xf2f2ee, emissive: 0xfff3dc, emissiveIntensity: 0.3, roughness: 0.2 }),
    slat: std({ color: 0x9b6a45, roughness: 0.7 }),
    binBody: std({ color: 0x3c4a40, roughness: 0.6, metalness: 0.3 }),
    signBack: std({ color: 0x9ea2a6, roughness: 0.5, metalness: 0.6 }),
    shelterGlass: new THREE.MeshPhysicalMaterial({ color: 0xd9e6ea, roughness: 0.05, transparent: true, opacity: 0.25, depthWrite: false }),
    poster: std({ map: SIGNS.poster(), emissive: 0xffffff, emissiveMap: null, emissiveIntensity: 0, roughness: 0.3 }),
    grate: std({ map: grateTex(), roughness: 0.6, metalness: 0.6, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
    manhole: std({ map: manholeTex(), transparent: true, alphaTest: 0.5, roughness: 0.55, metalness: 0.5, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
  };
  const signMat = {};
  for (const name of ['crossing', 'giveway', 'speed', 'bus']) signMat[name] = std({ map: SIGNS[name](), roughness: 0.4, transparent: name !== 'crossing' && name !== 'bus', alphaTest: 0.5 });

  const lines = ROADS.map(([pts, w]) => ({ pts, w, line: measure(pts) }));
  const onOtherRoad = (i, x, y, margin) => lines.some((r, j) => j !== i && distToLine(r.line, x, y) < r.w / 2 + margin);
  const paint = new Paint(), grates = new Paint(), holes = new Paint();
  const k = new Kit();
  const lamps = [];
  const crossings = [];

  for (const i of NEAR) {
    const { w, line } = lines[i];
    // dashed centre line, 3 m dashes every 9 m, kept out of junctions
    for (let s = 4; s < line.L - 4; s += 9) {
      const p = along(line, s + 1.5);
      if (onOtherRoad(i, p.x, p.y, 4)) continue;
      paint.quad(p.x, p.y, p.ux, p.uy, 3, 0.12);
    }
    // crossings where the road meets another (a few metres back from the junction)
    for (const [end, dir] of [[0, 1], [line.L, -1]]) {
      const e = along(line, end);
      const other = lines.findIndex((r, j) => j !== i && distToLine(r.line, e.x, e.y) < r.w / 2 + 2);
      if (other < 0) continue;
      const back = lines[other].w / 2 + 4.5;
      if (line.L < back + 10) continue;
      crossings.push({ i, s: end + dir * back, dir });
    }
    // drain grates along both kerbs, manholes in the lanes
    for (let s = 10; s < line.L - 5; s += 28) {
      for (const side of [-1, 1]) {
        const p = along(line, s + side * 7);
        if (onOtherRoad(i, p.x, p.y, 2)) continue;
        grates.quad(p.x + p.nx * side * (w / 2 - 0.25), p.y + p.ny * side * (w / 2 - 0.25), p.ux, p.uy, 0.6, 0.35, ROAD_Y + 0.006);
      }
      const q = along(line, s + 14);
      if (!onOtherRoad(i, q.x, q.y, 2)) holes.quad(q.x + q.nx * (s % 56 < 28 ? 1.6 : -1.6), q.y + q.ny * (s % 56 < 28 ? 1.6 : -1.6), q.ux, q.uy, 0.7, 0.7, ROAD_Y + 0.006);
    }
    // street lights both sides, every 26 m, as the model had them (not under the hotel's wing)
    for (const side of [-1, 1]) {
      for (let s = 12; s < line.L; s += 26) {
        const p = along(line, s);
        const x = p.x + p.nx * side * (w / 2 + 0.9), y = p.y + p.ny * side * (w / 2 + 0.9);
        if (onOtherRoad(i, x, y, 0.3)) continue;
        if (lamps.some((l) => Math.hypot(l.x - x, l.y - y) < 8)) continue;
        lamps.push({ x, y, face: Math.atan2(-p.ny * side, -p.nx * side) });
      }
    }
  }
  // two crossings mid-way along the front road (to the playground and the garden) and one on the
  // inner east road
  for (const [i, f] of [[2, 0.42], [2, 0.7], [4, 0.33]]) crossings.push({ i, s: lines[i].line.L * f, dir: 1 });

  // zebras: 0.5 m stripes along the traffic, 3 m long; a stop line on the way in; signs both sides
  for (const c of crossings) {
    const { w, line } = lines[c.i];
    const p = along(line, c.s);
    for (let t = -w / 2 + 0.6; t <= w / 2 - 0.5; t += 1.0) paint.quad(p.x + p.nx * t, p.y + p.ny * t, p.ux, p.uy, 3, 0.5);
    // traffic keeps right: the stop line 3 m before the crossing in the lane coming towards it
    // (travelling against `dir`, whose right-hand side is the line's left normal times `dir`)
    const q = along(line, c.s + c.dir * 3.0);
    const side = c.dir;
    paint.quad(q.x + p.nx * side * (w / 4), q.y + p.ny * side * (w / 4), p.ux, p.uy, 0.3, w / 2 - 0.2);
    for (const sd of [-1, 1]) {
      const sx = p.x + p.nx * sd * (w / 2 + 0.5), sy = p.y + p.ny * sd * (w / 2 + 0.5);
      if (onOtherRoad(c.i, sx, sy, 0.3)) continue;
      // facing the traffic that comes towards it (right-hand traffic: the sign on the right)
      const face = Math.atan2(p.uy * sd, p.ux * sd);
      k.at(...plan([sx, sy]), face);
      signPost(k, M, [[signMat.crossing, 0.6, 0.6]]);
    }
  }
  // give-way and speed-limit signs where the local roads join the embankment road and the front road
  for (const i of NEAR) {
    const { w, line } = lines[i];
    for (const [end, dir] of [[0, 1], [line.L, -1]]) {
      const e = along(line, end);
      const other = lines.findIndex((r, j) => j !== i && distToLine(r.line, e.x, e.y) < r.w / 2 + 2);
      if (other < 0) continue;
      const p = along(line, end + dir * (lines[other].w / 2 + 2.5));
      const side = dir; // right of a driver heading for the junction (travelling against `dir`)
      const sx = p.x + p.nx * side * (w / 2 + 0.6), sy = p.y + p.ny * side * (w / 2 + 0.6);
      if (onOtherRoad(i, sx, sy, 0.3)) continue;
      k.at(...plan([sx, sy]), Math.atan2(p.uy * dir, p.ux * dir)); // facing that driver
      signPost(k, M, [[signMat.giveway, 0.7, 0.62]]);
      // a speed limit a little further back, for traffic leaving the junction
      const q = along(line, end + dir * (lines[other].w / 2 + 14));
      const qx = q.x - q.nx * side * (w / 2 + 0.6), qy = q.y - q.ny * side * (w / 2 + 0.6);
      if (line.L > lines[other].w / 2 + 20 && !onOtherRoad(i, qx, qy, 0.3)) {
        k.at(...plan([qx, qy]), Math.atan2(-q.uy * dir, -q.ux * dir)); // facing drivers leaving the junction
        signPost(k, M, [[signMat.speed, 0.6, 0.6, 'round']]);
      }
    }
  }

  // a bus stop on the outer east road, facing the road
  {
    const { w, line } = lines[5];
    const p = along(line, line.L * 0.55);
    const side = 1;
    const x = p.x + p.nx * side * (w / 2 + 1.3), y = p.y + p.ny * side * (w / 2 + 1.3);
    k.at(...plan([x, y]), Math.atan2(-p.ny * side, -p.nx * side));
    busShelter(k, M);
    const b = along(line, line.L * 0.55 + 3.2);
    k.at(...plan([b.x + b.nx * (w / 2 + 0.5), b.y + b.ny * (w / 2 + 0.5)]), Math.atan2(-b.uy, -b.ux));
    signPost(k, M, [[signMat.bus, 0.5, 0.62]], 2.7);
    // the bus bay's markings: a dashed edge and BUS
    for (let s = -8; s < 8; s += 2) {
      const q = along(line, line.L * 0.55 + s);
      paint.quad(q.x + q.nx * (w / 2 - 2.6), q.y + q.ny * (w / 2 - 2.6), q.ux, q.uy, 1, 0.15);
    }
  }

  // benches with a bin beside each, where the model has its benches (the garden's, complex.json)
  for (const [x, y, r] of BENCHES) {
    // the model's bench has its back on the local +y side: it faces (sin r, -cos r)
    const fx = Math.sin(r), fy = -Math.cos(r);
    k.at(...plan([x - fx * 0.25, y - fy * 0.25]), Math.atan2(fy, fx));
    bench(k, M);
    k.at(...plan([x + Math.cos(r) * 1.4, y + Math.sin(r) * 1.4]), Math.atan2(fy, fx));
    bin(k, M);
  }

  const group = new THREE.Group();
  group.name = 'Streets';
  const own = [];
  k.build(group, own);
  for (const [p, mat] of [[paint, M.paint], [grates, M.grate], [holes, M.manhole]]) {
    if (!p.pos.length) continue;
    const mesh = p.mesh(mat);
    own.push(mesh.geometry);
    group.add(mesh);
  }

  // the street lights: one instanced mesh per material
  const proto = new Kit();
  proto.world();
  streetLight(proto, M);
  const tmp = new THREE.Group();
  proto.build(tmp, own);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  for (const part of tmp.children) {
    const im = new THREE.InstancedMesh(part.geometry, part.material, lamps.length);
    lamps.forEach((l, i) => {
      const [sx, sh, sz] = scene(l.x, l.y, 0.12);
      // the arm reaches out along the kit frame's +z: turn it to face the road
      const phi = Math.atan2(Math.cos(l.face), -Math.sin(l.face));
      im.setMatrixAt(i, m4.compose(new THREE.Vector3(sx, sh, sz), q.setFromAxisAngle(up, phi), one));
    });
    im.castShadow = part.castShadow;
    im.receiveShadow = true;
    group.add(im);
  }
  scene3.add(group);
  return { group, lamps: lamps.length, crossings: crossings.length };
}
