// The ground-level playground in front of the podium (between the car park and block B), fitted out
// in the viewer: the model has only its rubber surfaces, three bare gazebos and a lattice frame
// (Ground_playground, Site_ground_13 and the gazebo roofs in Site_ground_9), which are taken out.
//
// Two zones, laid out like a real municipal playground (equipment with its fall zone kept clear,
// swings away from the paths, seats for the parents along the fence, shade trees):
//   blue (older children): a play structure of two towers joined by a rope bridge, with stairs, a
//     climbing wall, a straight slide, a tube slide, a climbing net and a fireman's pole; swings
//     with a nest swing; a rope pyramid; a roundabout; an in-ground trampoline and stepping posts;
//     painted games
//   orange (small children): a sandpit under a shade sail, a toddler tower with a low slide, a
//     play house, spring riders, a see-saw and a spinning bowl
// The rubber is poured EPDM in muted colours with lighter impact zones under the equipment; a
// fence with two gates runs round both zones.
//
// Positions are scene metres (x east, z south) taken from the model's surfaces. Each piece is
// registered with its footprint: anything that overlaps another piece or stands too near the
// fence is reported in the console (dev builds), so a change to the layout can be checked.
// Built with the interiors' kit (src/interior/kit.js): a few dozen merged meshes.
import * as THREE from 'three';
import { Kit } from './interior/kit.js';
import { veneer } from './interior/textures.js';
import { Q } from './quality.js';

const Y0 = 0.1; // the rubber's level
// outlines of the two rubber zones (scene x, z), from Site_ground_8 and _9
const BLUE = [[-2.99, 17.46], [11.11, 20.75], [11.48, 35.03], [9.65, 43.82], [5.44, 46.75], [-3.9, 41.08]];
const ORANGE = [[-24.59, 17.27], [-2.99, 17.46], [-3.9, 38.88]];
// the fence runs round both
const OUTER = [[-24.59, 17.27], [-2.99, 17.46], [11.11, 20.75], [11.48, 35.03], [9.65, 43.82], [5.44, 46.75], [-3.9, 41.08], [-3.9, 38.88]];
const FENCE_INSET = 0.3;
// gates: [edge of OUTER, position along it 0..1]
const GATES = [[7, 0.45], [5, 0.5]];

// shade trees, in site coordinates for the tree system ([x, y, ground, height, crown radius, kind])
const TREE_SPOTS = [[-1.9, 20.2], [10.0, 22.2], [9.1, 41.6], [-20.7, 18.9]];
const site = ([x, z]) => [x + 5, 240 - z];
export const PLAYGROUND_TREES = TREE_SPOTS.map(([x, z], i) => [...site([x, z]), Y0, 6.5 + (i % 2) * 1.2, 2.4, 'broad']);

// scene (x, z) -> the kit's plan coordinates (x, -z)
const P = (x, z) => [x, -z];

function seeded(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

function canvasTex(w, h, draw, repeat = false) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ---------- geometry helpers on the scene plane ----------

function inside(poly, x, z) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

function edgeDist(poly, x, z) {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length];
    const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L));
    d = Math.min(d, Math.hypot(x - ax - t * dx, z - az - t * dz));
  }
  return d;
}

/** a point on edge i of a polygon, `t` along it and `inset` in from it, and the inward direction */
function onEdge(poly, i, t, inset) {
  const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length];
  const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L;
  let nx = -uz, nz = ux;
  const mx = ax + (bx - ax) * t, mz = az + (bz - az) * t;
  if (!inside(poly, mx + nx * 0.5, mz + nz * 0.5)) (nx = -nx), (nz = -nz);
  return { x: mx + nx * inset, z: mz + nz * inset, dx: nx, dz: nz, ux, uz, len: L };
}

// ---------- materials ----------

function materials() {
  const std = (o, boxUV) => {
    const m = new THREE.MeshStandardMaterial(o);
    if (boxUV) m.userData.boxUV = boxUV;
    return m;
  };
  const larch = veneer('oak');
  const sand = canvasTex(256, 256, (g, w, h) => {
    const r = seeded(9);
    g.fillStyle = '#d8c39a';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      g.globalAlpha = 0.35;
      g.fillStyle = ['#e6d4ad', '#c4ad82', '#b89e74', '#efe2c4'][Math.floor(r() * 4)];
      g.fillRect(r() * w, r() * h, 1 + r() * 1.5, 1 + r() * 1.5);
    }
    g.globalAlpha = 0.12;
    g.strokeStyle = '#8f7a55';
    g.lineWidth = 6;
    for (let i = 0; i < 7; i++) {
      g.beginPath();
      g.arc(r() * w, r() * h, 20 + r() * 50, r() * 6, r() * 6 + 2);
      g.stroke();
    }
  }, true);
  sand.repeat.set(1 / 1.5, 1 / 1.5);
  const sail = canvasTex(64, 64, (g, w) => {
    g.fillStyle = '#f0ece2';
    g.fillRect(0, 0, w, w);
    g.globalAlpha = 0.15;
    for (let y = 0; y < w; y += 2) {
      g.fillStyle = y % 4 ? '#ffffff' : '#c9c2b2';
      g.fillRect(0, y, w, 1);
    }
  }, true);
  sail.repeat.set(1 / 0.4, 1 / 0.4);
  const sign = canvasTex(256, 160, (g, w, h) => {
    g.fillStyle = '#f4f1ea';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#2f5f8f';
    g.fillRect(0, 0, w, 34);
    g.fillStyle = '#ffffff';
    g.font = 'bold 19px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText('ДЕТСКАЯ ПЛОЩАДКА', w / 2, 24);
    g.fillStyle = '#2b2b2b';
    g.font = '15px system-ui, sans-serif';
    ['Возраст 1–12 лет', 'До 6 лет — со взрослыми', 'Без собак · Не курить', 'Открыто 8:00–21:00 · SOS 112'].forEach((t, i) => g.fillText(t, w / 2, 60 + i * 24));
  });
  return {
    post: std({ color: 0x3f7f3a, roughness: 0.45, metalness: 0.35 }), // powder-coated green
    steel: std({ color: 0xbfc4c7, roughness: 0.3, metalness: 0.9 }),
    stainless: std({ color: 0xe1e4e6, roughness: 0.12, metalness: 1, envMapIntensity: 1.2 }),
    yellow: std({ color: 0xe8b42e, roughness: 0.4 }),
    orange: std({ color: 0xdc6a2c, roughness: 0.4 }),
    red: std({ color: 0xb93a30, roughness: 0.45 }),
    blue: std({ color: 0x2f67a8, roughness: 0.4 }),
    teal: std({ color: 0x2c8f88, roughness: 0.4 }),
    tube: std({ color: 0xdc6a2c, roughness: 0.35, side: THREE.DoubleSide }),
    larch: std({ map: larch.map, roughness: 0.8, color: 0xe6d2b8 }, larch.metres),
    rope: std({ color: 0x3a3f3a, roughness: 0.9 }),
    ropeRed: std({ color: 0x9e2f2a, roughness: 0.85 }),
    rubberSeat: std({ color: 0x232527, roughness: 0.8 }),
    mat: std({ color: 0x1c1d1f, roughness: 0.7 }),
    sand: std({ map: sand, roughness: 1 }),
    sail: std({ map: sail, roughness: 0.95, side: THREE.DoubleSide }, 0.4),
    concrete: std({ color: 0xc9c5bc, roughness: 0.9 }),
    fence: std({ color: 0x2f5f35, roughness: 0.5, metalness: 0.3 }),
    // the fence's thin bars: no shadows (a 12 mm bar is below a texel of the sun's shadow map and
    // only makes flickering streaks)
    bar: std({ color: 0x2f5f35, roughness: 0.5, metalness: 0.3 }),
    bench: std({ map: larch.map, roughness: 0.7, color: 0xb9895f }, larch.metres),
    bin: std({ color: 0x3b4a3f, roughness: 0.6, metalness: 0.2 }),
    sign: std({ map: sign, roughness: 0.6 }),
  };
}

// ---------- the rubber: poured EPDM with impact zones and painted games ----------

// granules of the rubber: speckle in the base colour's neighbours, plus black and white flecks
function speckle(g, w, h, s, colors, rnd) {
  const n = Math.round((w * h) / 9);
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[Math.floor(rnd() * colors.length)];
    g.globalAlpha = 0.25 + rnd() * 0.35;
    const d = Math.max(1, s * (0.004 + rnd() * 0.004));
    g.fillRect(rnd() * w, rnd() * h, d, d);
  }
  g.globalAlpha = 1;
}

/** paint a surface canvas for a zone: bbox in scene metres, draw(ctx, toPx, scale) for the shapes */
function surface(bbox, pxPerM, base, flecks, draw) {
  const [x0, z0, x1, z1] = bbox;
  const W = Math.round((x1 - x0) * pxPerM), H = Math.round((z1 - z0) * pxPerM);
  const tex = canvasTex(W, H, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, W, H);
    const toPx = (x, z) => [(x - x0) * pxPerM, (z - z0) * pxPerM];
    draw(g, toPx, pxPerM);
    speckle(g, W, H, pxPerM, flecks, seeded(W + H));
  });
  tex.flipY = false;
  return tex;
}

// helpers to draw in scene metres
const shape = {
  circle(g, toPx, s, x, z, r, fill) {
    const [px, pz] = toPx(x, z);
    g.fillStyle = fill;
    g.beginPath();
    g.arc(px, pz, r * s, 0, Math.PI * 2);
    g.fill();
  },
  ring(g, toPx, s, x, z, r, w, stroke) {
    const [px, pz] = toPx(x, z);
    g.strokeStyle = stroke;
    g.lineWidth = w * s;
    g.beginPath();
    g.arc(px, pz, r * s, 0, Math.PI * 2);
    g.stroke();
  },
  rrect(g, toPx, s, x0, z0, x1, z1, r, fill) {
    const [a, b] = toPx(x0, z0), [c, d] = toPx(x1, z1);
    g.fillStyle = fill;
    g.beginPath();
    g.roundRect(a, b, c - a, d - b, r * s);
    g.fill();
  },
  blob(g, toPx, s, pts, fill) {
    // a smooth closed shape through points (scene metres)
    g.fillStyle = fill;
    g.beginPath();
    const P = pts.map(([x, z]) => toPx(x, z));
    const n = P.length;
    for (let i = 0; i < n; i++) {
      const a = P[i], b = P[(i + 1) % n];
      const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (i === 0) g.moveTo(m[0], m[1]);
      const c = P[(i + 1) % n], d = P[(i + 2) % n];
      g.quadraticCurveTo(c[0], c[1], (c[0] + d[0]) / 2, (c[1] + d[1]) / 2);
    }
    g.closePath();
    g.fill();
  },
};

function games(g, toPx, s, cx, cz) {
  // hopscotch, a target and a snail spiral in white road paint, on a 4.4 m square at (cx, cz)
  const line = (w = 0.06) => {
    g.strokeStyle = 'rgba(246, 244, 236, 0.95)';
    g.fillStyle = 'rgba(246, 244, 236, 0.95)';
    g.lineWidth = w * s;
  };
  line();
  const c = 0.45;
  const cells = [[0, 0], [0, 1], [-0.5, 2], [0.5, 2], [0, 3], [-0.5, 4], [0.5, 4], [0, 5]];
  g.font = `bold ${Math.round(0.3 * s)}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  cells.forEach(([u, v], i) => {
    const [px, pz] = toPx(cx - 1.6 + u * c, cz + 1.9 - v * c);
    g.strokeRect(px, pz, c * s, c * s);
    g.fillText(String(i + 1), px + (c * s) / 2, pz + (c * s) / 2);
  });
  for (const r of [0.35, 0.7, 1.05]) shape.ring(g, toPx, s, cx + 0.9, cz - 1.0, r, 0.06, 'rgba(246, 244, 236, 0.95)');
  g.beginPath();
  for (let a = 0; a < Math.PI * 6; a += 0.08) {
    const r = 0.08 + a * 0.055;
    const [px, pz] = toPx(cx + 0.9 + Math.cos(a) * r, cz + 1.2 + Math.sin(a) * r);
    a ? g.lineTo(px, pz) : g.moveTo(px, pz);
  }
  g.stroke();
}

function surfacing(root, layout) {
  root.updateMatrixWorld(true);
  const s = Q.level === 'high' ? 64 : 32;
  const blueBox = [-4.2, 17.2, 11.7, 47.0], orangeBox = [-24.8, 17.0, -2.8, 39.2];
  const blueTex = surface(blueBox, s, '#3c6893', ['#2e5679', '#5c86b0', '#4a77a3', '#1b1d20', '#e9ecee'], (g, toPx, sc) => {
    // impact zones in a lighter blue under the play structure and the swings, green under the
    // rope pyramid, yellow round the roundabout; bark-coloured circles under the trees
    shape.rrect(g, toPx, sc, ...layout.structureZone, 1.4, '#5582ad');
    shape.rrect(g, toPx, sc, ...layout.swingZone, 1.2, '#5582ad');
    shape.circle(g, toPx, sc, ...layout.pyramid, 3.1, '#4f8565');
    shape.circle(g, toPx, sc, ...layout.roundabout, 1.75, '#c9a33c');
    shape.circle(g, toPx, sc, ...layout.roundabout, 1.2, '#3c6893');
    shape.rrect(g, toPx, sc, ...layout.trampolineZone, 0.5, '#4f8565');
    // a light winding path from the south gate to the play structure
    g.strokeStyle = '#8eb0cc';
    g.lineCap = 'round';
    g.lineWidth = 1.1 * sc;
    g.beginPath();
    const path = layout.path.map(([x, z]) => toPx(x, z));
    g.moveTo(...path[0]);
    for (let i = 1; i < path.length - 1; i++) g.quadraticCurveTo(...path[i], (path[i][0] + path[i + 1][0]) / 2, (path[i][1] + path[i + 1][1]) / 2);
    g.lineTo(...path[path.length - 1]);
    g.stroke();
    for (const [x, z] of TREE_SPOTS) if (x > -4) shape.circle(g, toPx, sc, x, z, 0.9, '#5a4434');
    games(g, toPx, sc, ...layout.games);
  });
  const orangeTex = surface(orangeBox, s, '#ad6340', ['#8f4e31', '#c47a55', '#b86c47', '#1b1d20', '#efe6dc'], (g, toPx, sc) => {
    // a sand-coloured wave from the gate through the play area, green under the spring riders
    shape.blob(g, toPx, sc, layout.wave, '#cdb48d');
    for (const [x, z] of layout.riders) shape.circle(g, toPx, sc, x, z, 0.85, '#6f9358');
    shape.circle(g, toPx, sc, ...layout.spinner, 1.1, '#6f9358');
    shape.rrect(g, toPx, sc, ...layout.toddlerZone, 0.8, '#c47a55');
    for (const [x, z] of TREE_SPOTS) if (x < -4) shape.circle(g, toPx, sc, x, z, 0.9, '#5a4434');
  });

  const v = new THREE.Vector3();
  for (const [name, tex, box] of [['Site_ground_8', blueTex, blueBox], ['Site_ground_9', orangeTex, orangeBox]]) {
    const mesh = root.getObjectByName(name);
    if (!mesh) continue;
    const g = mesh.geometry.clone(), p = g.attributes.position;
    const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
      uv[2 * i] = (v.x - box[0]) / (box[2] - box[0]);
      uv[2 * i + 1] = (v.z - box[1]) / (box[3] - box[1]);
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    mesh.geometry = g;
    mesh.material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, envMapIntensity: 0.5 });
    mesh.receiveShadow = true;
  }
}

// ---------- pieces (each in its own frame: x right, y up, z front; origin on the ground) ----------

/** a square play tower: four posts, a deck at height h, a pyramid roof; panels on chosen sides
 *  ('back' -z, 'front' +z, 'left' -x, 'right' +x) */
function tower(k, M, h, roofMat, panels = [], s = 1.3) {
  const H = h + 1.3;
  for (const x of [-s / 2, s / 2]) for (const z of [-s / 2, s / 2]) {
    k.cyl(M.post, x, 0, z, 0.055, H, 12);
    k.sphere(M.yellow, x, H + 0.03, z, 0.07, 1, 1, 1, 1);
  }
  k.box(M.larch, -s / 2, h - 0.05, -s / 2, s / 2, h, s / 2);
  k.box(M.post, -s / 2, h - 0.12, -s / 2, s / 2, h - 0.05, s / 2);
  const cone = new THREE.ConeGeometry(s * 0.95, 0.85, 4, 1);
  cone.rotateY(Math.PI / 4);
  cone.translate(0, H + 0.42, 0);
  k.add(roofMat, cone);
  k.sphere(M.yellow, 0, H + 0.9, 0, 0.09);
  const sides = { back: [-s / 2, -s / 2, s / 2, -s / 2 + 0.03], front: [-s / 2, s / 2 - 0.03, s / 2, s / 2], left: [-s / 2, -s / 2, -s / 2 + 0.03, s / 2], right: [s / 2 - 0.03, -s / 2, s / 2, s / 2] };
  for (const side of panels) {
    const [x0, z0, x1, z1] = sides[side];
    k.box(side === 'back' || side === 'front' ? M.blue : M.orange, x0, h + 0.12, z0, x1, h + 0.85, z1);
    // a porthole
    if (side === 'left' || side === 'right') k.box(M.yellow, x0 - 0.01, h + 0.35, -0.18, x1 + 0.01, h + 0.62, 0.18);
  }
}

/** stairs from a deck edge at height h (frame z = 0) down to the ground along +z */
function stairs(k, M, h, w = 0.75) {
  const n = Math.ceil(h / 0.24), rise = h / n, going = 0.27, run = (n - 1) * going + 0.3;
  for (let i = 1; i < n; i++) {
    const y = h - i * rise;
    k.box(M.larch, -w / 2 + 0.04, y - 0.04, (i - 1) * going, w / 2 - 0.04, y, i * going);
  }
  // stringers and handrails
  const ang = Math.atan2(h, run);
  for (const sx of [-1, 1]) {
    const g = new THREE.BoxGeometry(0.05, 0.2, Math.hypot(h, run));
    g.rotateX(ang);
    g.translate(sx * (w / 2 - 0.02), h / 2 - 0.05, run / 2);
    k.add(M.post, g);
    k.tube(M.post, [[sx * (w / 2), h + 0.85, -0.05], [sx * (w / 2), h * 0.5 + 0.85, run * 0.5], [sx * (w / 2), 0.85, run]], 0.025, 12);
    k.cyl(M.post, sx * (w / 2), 0, run, 0.03, 0.9, 10);
  }
}

/** a slide from the deck edge at height h, going out along +z, w wide */
function slide(k, M, h, len, mat, w = 0.55, wavy = true) {
  const N = 28, pos = [], idx = [];
  const pt = (t) => {
    const z = t * len;
    const ease = t < 0.85 ? 1 - Math.pow(t / 0.85, 1.15) : 0;
    const y = 0.3 + (h - 0.3) * ease + (wavy && t < 0.8 ? Math.sin(t * Math.PI * 3) * 0.08 * (1 - t) : 0);
    return [z, y];
  };
  const prof = [[-w / 2 - 0.04, 0.22], [-w / 2, 0.02], [-w / 2 + 0.08, 0], [w / 2 - 0.08, 0], [w / 2, 0.02], [w / 2 + 0.04, 0.22]];
  for (let i = 0; i <= N; i++) {
    const [z, y] = pt(i / N);
    for (const [px, py] of prof) pos.push(px, y + py, z);
  }
  const P = prof.length;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < P - 1; j++) {
      const a = i * P + j, b = a + 1, c = a + P, d = c + 1;
      idx.push(a, c, b, b, c, d, a, b, c, b, d, c); // both faces
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  k.add(mat, g);
  const [zm, ym] = pt(0.5);
  for (const s of [-1, 1]) {
    k.cyl(M.post, s * (w / 2 - 0.05), 0, zm, 0.035, ym, 10);
    k.cyl(M.post, s * (w / 2 - 0.05), 0, len - 0.25, 0.035, 0.3, 10);
    k.tube(M.post, [[s * (w / 2 + 0.03), h + 0.05, -0.05], [s * (w / 2 + 0.03), h + 0.7, 0.0], [s * (w / 2 + 0.03), h + 0.6, 0.25], [s * (w / 2 + 0.03), h + 0.25, 0.35]], 0.025, 16);
  }
}

/** a rope-and-plank bridge between two decks at height h, from z = 0 to z = len */
function bridge(k, M, h, len, w = 0.75) {
  const n = Math.round(len / 0.16), sag = 0.12;
  const y = (t) => h - 0.04 - Math.sin(t * Math.PI) * sag;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    k.box(M.larch, -w / 2, y(t) - 0.03, t * len - 0.06, w / 2, y(t), t * len + 0.06);
  }
  for (const s of [-1, 1]) {
    const top = [], low = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      top.push([s * w / 2, y(t) + 0.8 + Math.sin(t * Math.PI) * 0.06, t * len]);
      low.push([s * w / 2, y(t) + 0.02, t * len]);
    }
    k.tube(M.rope, top, 0.02, 24);
    k.tube(M.rope, low, 0.014, 24);
    for (let i = 1; i < 10; i++) {
      const t = i / 10;
      k.rod(M.rope, [s * w / 2, y(t), t * len], [s * w / 2, y(t) + 0.8, t * len], 0.008, 4);
    }
  }
}

/** a sloping climbing wall: foot at the origin, leaning forward (+z) up to a deck at height h */
function climbingWall(k, M, h, w = 1.1, lean = 0.55) {
  const L = Math.hypot(h, lean), a = Math.atan2(lean, h);
  const g = new THREE.BoxGeometry(w, L, 0.05);
  g.translate(0, L / 2, 0);
  g.rotateX(a);
  k.add(M.teal, g);
  const R = seeded(31), cols = [M.yellow, M.red, M.orange, M.blue];
  for (let i = 0; i < 14; i++) {
    const t = 0.08 + R() * 0.84, x = (R() - 0.5) * (w - 0.2);
    k.sphere(cols[i % 4], x, Math.cos(a) * t * L - 0.03, Math.sin(a) * t * L - 0.04, 0.05, 1.2, 0.8, 0.7, 1);
  }
}

/** a rope climbing net from a deck edge at height h (z = 0) down to the ground at z = len */
function climbNet(k, M, h, len, w = 1.1) {
  k.cyl(M.steel, -w / 2, 0, len, 0.04, 0.2, 10);
  k.cyl(M.steel, w / 2, 0, len, 0.04, 0.2, 10);
  const bar = new THREE.CylinderGeometry(0.03, 0.03, w + 0.1, 10);
  bar.rotateZ(Math.PI / 2);
  bar.translate(0, 0.15, len);
  k.add(M.steel, bar);
  for (let i = 0; i <= 5; i++) {
    const x = -w / 2 + (w * i) / 5;
    k.rod(M.ropeRed, [x, h - 0.05, 0.02], [x, 0.15, len], 0.014);
  }
  for (let j = 1; j < 6; j++) {
    const t = j / 6;
    k.rod(M.ropeRed, [-w / 2, h - 0.05 - (h - 0.2) * t, len * t], [w / 2, h - 0.05 - (h - 0.2) * t, len * t], 0.014);
  }
}

/** an enclosed tube slide along points [x, y, z] (scene metres, the tube's centre line) */
function tubeSlide(k, M, pts, r = 0.4) {
  k.world();
  k.tube(M.tube, pts, r, 48, 16);
  // rings where it is bolted together and posts under it
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  for (let i = 1; i < 6; i++) {
    const t = i / 6, p = curve.getPoint(t), d = curve.getTangent(t);
    const ring = new THREE.TorusGeometry(r + 0.02, 0.025, 6, 24);
    ring.lookAt(d);
    ring.translate(p.x, p.y, p.z);
    k.add(M.yellow, ring);
    if (i % 2 === 0) k.rod(M.post, [p.x, Y0, p.z], [p.x, p.y - r, p.z], 0.04, 10);
  }
}

function swings(k, M, w = 5.4, h = 2.4) {
  for (const x of [-w / 2, w / 2]) {
    for (const s of [-1, 1]) k.tube(M.post, [[x, 0, s * 1.1], [x, h / 2, s * 0.55], [x, h, 0]], 0.06, 8);
    k.cyl(M.post, x, h - 0.05, 0, 0.09, h + 0.1, 12);
  }
  const beam = new THREE.CylinderGeometry(0.065, 0.065, w, 16);
  beam.rotateZ(Math.PI / 2);
  beam.translate(0, h + 0.02, 0);
  k.add(M.post, beam);
  const seatY = 0.45;
  for (const x of [-w / 2 + 0.85, -w / 2 + 1.75]) {
    for (const s of [-1, 1]) k.cyl(M.steel, x + s * 0.2, seatY + 0.02, 0, 0.008, h, 4);
    k.rbox(M.rubberSeat, x, seatY, 0, 0.45, 0.04, 0.17, 0.015, 1);
  }
  const nx = w / 2 - 1.35, ny = 0.55;
  const ring = new THREE.TorusGeometry(0.5, 0.045, 10, 40);
  ring.rotateX(Math.PI / 2);
  ring.translate(nx, ny, 0);
  k.add(M.orange, ring);
  const net = new THREE.CircleGeometry(0.48, 32);
  net.rotateX(-Math.PI / 2);
  net.translate(nx, ny - 0.03, 0);
  k.add(M.rope, net);
  for (const [dx, dz] of [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]]) k.tube(M.steel, [[nx + dx, ny, dz], [nx + dx * 0.4, h, dz * 0.4]], 0.008, 4);
}

/** a rope pyramid ("space net"): a mast, 12 ropes from its top to anchors on a circle, rope rings */
function ropePyramid(k, M, R = 2.3, H = 3.8) {
  k.cyl(M.steel, 0, 0, 0, 0.07, H + 0.25, 16);
  k.sphere(M.yellow, 0, H + 0.3, 0, 0.12);
  const n = 12, anchors = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, p = [Math.cos(a) * R, 0.12, Math.sin(a) * R];
    anchors.push(p);
    k.cyl(M.steel, p[0], 0, p[2], 0.05, 0.16, 10);
    k.rod(M.ropeRed, [0, H, 0], p, 0.02);
  }
  const at = (i, t) => anchors[i % n].map((v, c) => v + ([0, H, 0][c] - v) * t);
  for (const t of [0.14, 0.3, 0.46, 0.62, 0.78]) {
    for (let i = 0; i < n; i++) k.rod(M.ropeRed, at(i, t), at(i + 1, t), 0.014);
  }
  // the bottom ring of steel cable just above the ground
  for (let i = 0; i < n; i++) k.rod(M.steel, anchors[i], anchors[(i + 1) % n], 0.018);
}

function roundabout(k, M) {
  k.cyl(M.steel, 0, 0, 0, 0.12, 0.25, 16);
  k.cyl(M.yellow, 0, 0.18, 0, 1.0, 0.24, 40);
  k.cyl(M.blue, 0, 0.24, 0, 0.98, 0.26, 40);
  k.cyl(M.steel, 0, 0.24, 0, 0.05, 1.0, 12);
  const ring = new THREE.TorusGeometry(0.55, 0.025, 8, 40);
  ring.rotateX(Math.PI / 2);
  ring.translate(0, 0.95, 0);
  k.add(M.red, ring);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2, x = Math.cos(a), z = Math.sin(a);
    k.tube(M.red, [[x * 0.05, 0.95, z * 0.05], [x * 0.55, 0.95, z * 0.55], [x * 0.85, 0.7, z * 0.85], [x * 0.85, 0.26, z * 0.85]], 0.022, 12);
  }
}

/** an in-ground trampoline: a black mat in a rubber surround, flush with the surfacing */
function trampoline(k, M, w = 1.9, d = 1.3) {
  k.rbox(M.teal, 0, 0.012, 0, w + 0.4, 0.024, d + 0.4, 0.1, 1);
  k.box(M.mat, -w / 2, 0.02, -d / 2, w / 2, 0.028, d / 2);
  for (const s of [-1, 1]) k.box(M.yellow, -w / 2, 0.025, s * (d / 2 + 0.02) - 0.02, w / 2, 0.03, s * (d / 2 + 0.02) + 0.02);
}

function steppingPosts(k, M, pts) {
  pts.forEach(([x, z], i) => k.cyl(M.larch, x, 0, z, 0.16, 0.18 + (i % 3) * 0.12, 16));
}

function springRider(k, M, body) {
  const pts = [];
  for (let t = 0; t <= 1; t += 0.02) pts.push([Math.cos(t * Math.PI * 12) * 0.11, 0.05 + t * 0.4, Math.sin(t * Math.PI * 12) * 0.11]);
  k.tube(M.stainless, pts, 0.018, 120);
  k.cyl(M.steel, 0, 0, 0, 0.18, 0.05, 20);
  k.rbox(body, 0, 0.62, 0, 0.26, 0.26, 0.7, 0.1);
  k.sphere(body, 0, 0.88, 0.32, 0.17, 1, 1, 1.1);
  k.sphere(M.rubberSeat, 0.07, 0.93, 0.47, 0.025, 1, 1, 1, 1);
  k.sphere(M.rubberSeat, -0.07, 0.93, 0.47, 0.025, 1, 1, 1, 1);
  const bar = new THREE.CylinderGeometry(0.018, 0.018, 0.4, 8);
  bar.rotateZ(Math.PI / 2);
  bar.translate(0, 0.86, 0.18);
  k.add(M.yellow, bar);
  k.rbox(M.yellow, 0, 0.77, -0.05, 0.3, 0.05, 0.28, 0.02, 1);
}

/** see-saw with its beam along the frame's x */
function seesaw(k, M) {
  k.box(M.post, -0.12, 0, -0.15, 0.12, 0.45, 0.15);
  const beam = new THREE.BoxGeometry(3.0, 0.08, 0.22);
  beam.rotateZ(0.12);
  beam.translate(0, 0.5, 0);
  k.add(M.orange, beam);
  for (const s of [-1, 1]) {
    const x = s * 1.3, y = 0.5 + s * 0.16;
    k.rbox(M.rubberSeat, x, y + 0.06, 0, 0.32, 0.05, 0.3, 0.015, 1);
    k.tube(M.yellow, [[x - s * 0.22, y + 0.04, -0.12], [x - s * 0.25, y + 0.4, -0.1], [x - s * 0.25, y + 0.4, 0.1], [x - s * 0.22, y + 0.04, 0.12]], 0.02, 12);
    k.cyl(M.rubberSeat, s * 1.35, 0, 0, 0.12, 0.12, 16);
  }
}

function sandpit(k, M, w) {
  const t = 0.25, h = 0.35;
  k.box(M.larch, -w / 2, 0, -w / 2, w / 2, h, -w / 2 + t);
  k.box(M.larch, -w / 2, 0, w / 2 - t, w / 2, h, w / 2);
  k.box(M.larch, -w / 2, 0, -w / 2 + t, -w / 2 + t, h, w / 2 - t);
  k.box(M.larch, w / 2 - t, 0, -w / 2 + t, w / 2, h, w / 2 - t);
  k.box(M.sand, -w / 2 + t, 0, -w / 2 + t, w / 2 - t, 0.22, w / 2 - t);
  k.sphere(M.sand, 0.5, 0.18, 0.3, 0.55, 1, 0.25, 1, 2);
  k.lathe(M.red, [[0, 0], [0.07, 0], [0.09, 0.14], [0.085, 0.14], [0.065, 0.01], [0, 0.01]], -0.6, 0.22, -0.4, 16);
  k.box(M.blue, -0.3, 0.22, 0.6, -0.12, 0.24, 0.66);
  k.box(M.sand, 0.9, 0.22, -0.7, 1.1, 0.34, -0.5);
  k.cyl(M.sand, 1.0, 0.34, -0.6, 0.06, 0.42, 8, 0.03);
}

function playHouse(k, M) {
  const w = 1.6, d = 1.4, h = 1.3;
  for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) k.box(M.larch, x - 0.05, 0, z - 0.05, x + 0.05, h, z + 0.05);
  k.box(M.larch, -w / 2, 0, -d / 2, w / 2, 0.06, d / 2);
  k.box(M.larch, -w / 2, 0, -d / 2, w / 2, h, -d / 2 + 0.03);
  for (const s of [-1, 1]) {
    k.box(M.larch, s * w / 2 - 0.015, 0, -d / 2, s * w / 2 + 0.015, 0.6, d / 2);
    k.box(M.larch, s * w / 2 - 0.015, 1.05, -d / 2, s * w / 2 + 0.015, h, d / 2);
  }
  k.box(M.larch, -w / 2, 0, d / 2 - 0.03, w / 2, 0.7, d / 2);
  k.box(M.yellow, -w / 2 - 0.02, 0.7, d / 2 - 0.05, w / 2 + 0.02, 0.74, d / 2 + 0.15);
  for (const s of [-1, 1]) {
    const r = new THREE.BoxGeometry(w + 0.3, 0.04, d * 0.62);
    r.rotateX(s * 0.62);
    r.translate(0, h + 0.27, s * d * 0.25);
    k.add(M.red, r);
  }
}

/** a toddler tower: a low deck with a roof, a short slide out of the front, steps at the back */
function toddlerTower(k, M) {
  const s = 1.1, h = 0.6, H = 1.75;
  for (const x of [-s / 2, s / 2]) for (const z of [-s / 2, s / 2]) k.cyl(M.post, x, 0, z, 0.05, H, 12);
  k.box(M.larch, -s / 2, h - 0.05, -s / 2, s / 2, h, s / 2);
  // a sloping roof and low panels with portholes on the sides
  const roof = new THREE.BoxGeometry(s + 0.3, 0.05, s + 0.3);
  roof.rotateX(-0.25);
  roof.translate(0, H + 0.1, 0);
  k.add(M.teal, roof);
  for (const sx of [-1, 1]) {
    k.box(M.yellow, sx * s / 2 - 0.015, h + 0.1, -s / 2, sx * s / 2 + 0.015, h + 0.7, s / 2);
    k.disc(M.teal, sx * (s / 2 + 0.02), h + 0.4, 0, 0.16, 0.02);
  }
  k.save().offset(0, s / 2);
  slide(k, M, h, 1.3, M.orange, 0.5, false);
  k.restore();
  k.save().offset(0, -s / 2, Math.PI);
  stairs(k, M, h, 0.65);
  k.restore();
}

function spinnerBowl(k, M) {
  k.cyl(M.steel, 0, 0, 0, 0.08, 0.25, 12);
  k.lathe(M.teal, [[0.05, 0.22], [0.35, 0.28], [0.5, 0.45], [0.52, 0.55], [0.48, 0.55], [0.32, 0.32], [0.05, 0.3]], 0, 0, 0, 32);
}

function shadeSail(k, M, corners) {
  const pts = corners.map(([x, z, hh]) => new THREE.Vector3(x, hh, z));
  for (const [x, z, hh] of corners) {
    k.cyl(M.steel, x, 0, z, 0.06, hh + 0.15, 12);
    k.sphere(M.steel, x, hh + 0.17, z, 0.07, 1, 1, 1, 1);
  }
  const n = 8, pos = [], idx = [];
  const c = pts[0].clone().add(pts[1]).add(pts[2]).multiplyScalar(1 / 3);
  const rows = [];
  for (let i = 0; i <= n; i++) {
    const row = [];
    for (let j = 0; j <= n - i; j++) {
      const a = i / n, b = j / n, cc = 1 - a - b;
      const p = pts[0].clone().multiplyScalar(cc).add(pts[1].clone().multiplyScalar(a)).add(pts[2].clone().multiplyScalar(b));
      p.y -= 0.35 * 27 * a * b * cc * 0.6;
      p.lerp(c, 0.06);
      row.push(pos.length / 3);
      pos.push(p.x, p.y, p.z);
    }
    rows.push(row);
  }
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n - i; j++) {
      idx.push(rows[i][j], rows[i + 1][j], rows[i][j + 1]);
      if (j < n - i - 1) idx.push(rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  k.add(M.sail, g);
}

function bench(k, M) {
  for (const x of [-0.7, 0.7]) {
    k.box(M.concrete, x - 0.05, 0, 0.05, x + 0.05, 0.42, 0.5);
    k.box(M.concrete, x - 0.05, 0.42, 0.02, x + 0.05, 0.85, 0.1);
  }
  for (let i = 0; i < 4; i++) k.box(M.bench, -0.95, 0.42, 0.08 + i * 0.11, 0.95, 0.46, 0.17 + i * 0.11);
  for (let i = 0; i < 3; i++) k.box(M.bench, -0.95, 0.52 + i * 0.12, 0.06, 0.95, 0.61 + i * 0.12, 0.1);
}

function bin(k, M) {
  k.cyl(M.bin, 0, 0, 0, 0.22, 0.85, 20);
  k.cyl(M.steel, 0, 0.85, 0, 0.23, 0.9, 20, 0.18);
}

// ---------- fence and kerb ----------

function fence(k, M, outline, gates) {
  const h = 1.0;
  const plan = outline.map(([x, z]) => P(x, z));
  let area = 0;
  for (let i = 0, j = plan.length - 1; i < plan.length; j = i++) area += (plan[j][0] - plan[i][0]) * (plan[j][1] + plan[i][1]);
  const ccw = area > 0;
  for (let i = 0; i < plan.length; i++) {
    const a = plan[i], b = plan[(i + 1) % plan.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], n = ccw ? [-u[1], u[0]] : [u[1], -u[0]];
    const p = (t) => [a[0] + u[0] * t + n[0] * FENCE_INSET, a[1] + u[1] * t + n[1] * FENCE_INSET];
    const gate = gates.find((g) => g[0] === i);
    const gaps = gate ? [[gate[1] * L - 0.7, gate[1] * L + 0.7]] : [];
    const runs = [];
    let t0 = FENCE_INSET;
    for (const [g0, g1] of gaps) {
      runs.push([t0, g0]);
      t0 = g1;
    }
    runs.push([t0, L - FENCE_INSET]);
    for (const [r0, r1] of runs) {
      if (r1 - r0 < 0.2) continue;
      const q0 = p(r0), q1 = p(r1);
      for (const y of [0.12, h - 0.05]) k.world().along(M.fence, q0[0], q0[1], q1[0], q1[1], -0.02, 0.04, Y0 + y, Y0 + y + 0.04);
      const len = r1 - r0;
      const posts = Math.max(1, Math.round(len / 2));
      for (let s = 0; s <= posts; s++) {
        const q = p(r0 + (len * s) / posts);
        k.world().at(q[0], q[1], 0, Y0);
        k.cyl(M.fence, 0, 0, 0, 0.035, h + 0.05, 8);
      }
      const bars = Math.floor(len / 0.12);
      for (let s = 1; s < bars; s++) {
        const q = p(r0 + (len * s) / bars), qq = [q[0] + u[0] * 0.022, q[1] + u[1] * 0.022]; // 22 x 12 mm flat bar
        k.world().along(M.bar, q[0], q[1], qq[0], qq[1], -0.006, 0.012, Y0 + 0.12, Y0 + h - 0.01);
      }
    }
    for (const [g0, g1] of gaps) {
      for (const t of [g0, g1]) {
        const q = p(t);
        k.world().at(q[0], q[1], 0, Y0);
        k.box(M.fence, -0.05, 0, -0.05, 0.05, h + 0.25, 0.05);
        k.sphere(M.yellow, 0, h + 0.3, 0, 0.06, 1, 1, 1, 1);
      }
    }
  }
}

function kerb(k, M, outline) {
  const plan = outline.map(([x, z]) => P(x, z));
  let area = 0;
  for (let i = 0, j = plan.length - 1; i < plan.length; j = i++) area += (plan[j][0] - plan[i][0]) * (plan[j][1] + plan[i][1]);
  for (let i = 0; i < plan.length; i++) {
    let a = plan[i], b = plan[(i + 1) % plan.length];
    if (area > 0) [a, b] = [b, a];
    k.world().along(M.concrete, a[0], a[1], b[0], b[1], -0.005, 0.12, 0.02, Y0 + 0.06);
  }
}

// ---------- layout ----------

/** place a piece at scene (x, z), its front towards scene direction (dx, dz) */
function at(k, x, z, dx, dz) {
  const [px, py] = P(x, z);
  return k.at(px, py, Math.atan2(-dz, dx), Y0);
}

export function addPlayground(scene, root) {
  // take out the old equipment and the gazebo roofs drawn on the orange rubber
  for (const name of ['Ground_playground', 'Site_ground_13']) {
    const o = root.getObjectByName(name);
    if (o) o.visible = false;
  }
  const orange = root.getObjectByName('Site_ground_9');
  if (orange?.geometry) {
    // keep the triangles on the ground (the roofs stand 3-6 m up); heights in metres through the
    // node's transform (the positions are quantized, in the node's own units)
    root.updateMatrixWorld(true);
    const g = orange.geometry, p = g.attributes.position, v = new THREE.Vector3();
    const y = (i) => v.fromBufferAttribute(p, i).applyMatrix4(orange.matrixWorld).y;
    const tri = g.index ? (i) => g.index.getX(i) : (i) => i;
    const n = g.index ? g.index.count : p.count, keep = [];
    for (let i = 0; i < n; i += 3) {
      const a = tri(i), b = tri(i + 1), c = tri(i + 2);
      if (Math.max(y(a), y(b), y(c)) < 0.5) keep.push(a, b, c);
    }
    const ng = g.clone();
    ng.setIndex(keep);
    ng.computeBoundingBox();
    ng.computeBoundingSphere();
    orange.geometry = ng;
  }

  const M = materials();
  const k = new Kit();
  const group = new THREE.Group();
  group.name = 'Playground';
  const placed = []; // [name, x, z, radius, group] footprints for the layout check
  // parts of one piece of equipment share a group and may touch each other
  const put = (name, x, z, r, grp = name) => placed.push([name, x, z, r, grp]);

  // ===== older children (blue) =====
  // the play structure: tower 1 (north) and tower 2 joined by a rope bridge, long axis north-south
  const T1 = [3.5, 23.0], T2 = [3.5, 27.6], DECK = 1.6, HALF = 0.65;
  at(k, ...T1, 1, 0); // front east
  tower(k, M, DECK, M.red); // open on all sides: slide, stairs, bridge, climbing wall
  k.save().offset(0, HALF);
  slide(k, M, DECK, 3.0, M.stainless);
  k.restore();
  at(k, T1[0] - HALF, T1[1], -1, 0); // stairs down to the west
  stairs(k, M, DECK);
  at(k, T1[0], T1[1] + HALF, 0, 1);
  bridge(k, M, DECK, T2[1] - T1[1] - 2 * HALF);
  at(k, ...T2, 1, 0);
  tower(k, M, DECK, M.blue);
  at(k, T2[0], T2[1] + HALF, 0, 1); // climbing net down to the south
  climbNet(k, M, DECK, 1.7);
  at(k, T2[0] - HALF - 0.3, T2[1], -1, 0); // fireman's pole off the west side
  k.cyl(M.stainless, 0, 0, 0, 0.03, DECK + 1.3, 12);
  k.tube(M.post, [[0, DECK + 1.3, 0], [0, DECK + 1.25, -0.15], [0, DECK + 0.05, -0.3]], 0.03, 12);
  // tube slide from tower 2's east side, curving south
  tubeSlide(k, M, [[T2[0] + HALF, Y0 + DECK + 0.4, T2[1]], [5.5, Y0 + 1.55, 27.7], [6.6, Y0 + 1.1, 28.5], [7.0, Y0 + 0.75, 29.8], [6.7, Y0 + 0.5, 31.0], [6.3, Y0 + 0.42, 31.5]]);
  // climbing wall up to tower 1's north side
  at(k, T1[0], T1[1] - HALF - 0.55, 0, 1);
  climbingWall(k, M, DECK);
  put('play structure', 3.5, 25.3, 2.6, 'structure');
  put('slide', 6.3, 23.0, 1.2, 'structure');
  put('stairs', 2.0, 23.0, 0.8, 'structure');
  put('tube slide', 6.5, 29.8, 1.3, 'structure');
  put('climbing net', 3.5, 29.4, 0.8, 'structure');
  put('climbing wall', 3.5, 21.6, 0.7, 'structure');

  // swings, beam east-west; seats swing north-south
  const SW = [1.6, 38.3];
  at(k, ...SW, 0, 1);
  swings(k, M, 5.4, 2.4);
  put('swings', SW[0] - 1.5, SW[1], 1.3, 'swings');
  put('swings', SW[0] + 1.5, SW[1], 1.3, 'swings');

  const PY = [8.0, 37.1];
  at(k, ...PY, 0, 1);
  ropePyramid(k, M, 2.3, 3.8);
  put('rope pyramid', ...PY, 2.35);

  const RB = [9.4, 31.4];
  at(k, ...RB, 0, 1);
  roundabout(k, M);
  put('roundabout', ...RB, 1.05);

  const TR = [9.2, 25.6];
  at(k, ...TR, 1, 0);
  trampoline(k, M);
  put('trampoline', ...TR, 1.1);
  at(k, 0, 0, 0, 1);
  steppingPosts(k, M, [[8.0, 28.2], [8.55, 28.7], [9.15, 29.0], [9.8, 28.85], [10.35, 28.45]]);
  put('stepping posts', 9.2, 28.7, 0.9);

  const GAMES = [-0.9, 32.4];
  put('games', ...GAMES, 1.6);

  // ===== small children (orange) =====
  const SP = [-8.4, 21.7];
  at(k, ...SP, 0, 1);
  sandpit(k, M, 3.6);
  at(k, ...SP, 0, 1);
  shadeSail(k, M, [[-2.4, -2.1, 2.9], [2.6, -1.9, 2.5], [0.3, 2.7, 2.2]]);
  put('sandpit', ...SP, 2.0);

  const PH = [-14.6, 20.4];
  at(k, ...PH, 0, 1);
  playHouse(k, M);
  put('play house', ...PH, 1.0);

  const SS = [-17.6, 21.3];
  at(k, ...SS, 0, 1);
  seesaw(k, M);
  put('see-saw', SS[0] - 0.9, SS[1], 0.7, 'see-saw');
  put('see-saw', SS[0] + 0.9, SS[1], 0.7, 'see-saw');

  const riders = [[-13.0, 24.9], [-11.4, 26.3], [-9.8, 27.7]];
  riders.forEach(([x, z], i) => {
    at(k, x, z, 0.7, -0.7);
    springRider(k, M, [M.orange, M.teal, M.yellow][i]);
    put('spring rider', x, z, 0.5);
  });

  const TT = [-6.7, 30.0];
  at(k, ...TT, -1, 0); // slide to the west, steps to the east
  toddlerTower(k, M);
  put('toddler tower', TT[0] - 0.6, TT[1], 1.2, 'toddler');
  put('toddler steps', TT[0] + 1.1, TT[1], 0.5, 'toddler');

  const SB = [-5.6, 34.6];
  at(k, ...SB, 0, 1);
  spinnerBowl(k, M);
  put('spinning bowl', ...SB, 0.6);

  // ===== benches, bins, a sign; the fence and kerb =====
  // [edge of OUTER, position along it]; each bench 0.9 m in from the edge, facing in
  const benches = [[1, 0.18], [1, 0.62], [4, 0.7], [5, 0.25], [7, 0.62], [7, 0.3], [0, 0.48]];
  for (const [e, t] of benches) {
    const b = onEdge(OUTER, e, t, FENCE_INSET + 0.15);
    at(k, b.x, b.z, b.dx, b.dz);
    bench(k, M);
    put('bench', b.x + b.dx * 0.3, b.z + b.dz * 0.3, 0.9);
  }
  for (const [e, t] of [[1, 0.3], [5, 0.38], [0, 0.3]]) {
    const b = onEdge(OUTER, e, t, FENCE_INSET + 0.35);
    at(k, b.x, b.z, b.dx, b.dz);
    bin(k, M);
    put('bin', b.x, b.z, 0.3);
  }
  {
    const g = onEdge(OUTER, 5, 0.5 - 1.2 / onEdge(OUTER, 5, 0, 0).len, FENCE_INSET + 0.1);
    at(k, g.x, g.z, -g.dx, -g.dz); // facing out, for people coming in
    k.cyl(M.steel, -0.33, 0, 0, 0.03, 1.65, 8);
    k.cyl(M.steel, 0.33, 0, 0, 0.03, 1.65, 8);
    k.box(M.sign, -0.45, 1.05, 0.03, 0.45, 1.6, 0.05);
  }
  fence(k, M, OUTER, GATES);
  kerb(k, M, OUTER);
  for (const [x, z] of TREE_SPOTS) put('tree', x, z, 0.6);

  const own = [];
  k.build(group, own);
  group.traverse((o) => {
    if (o.isMesh && o.material === M.bar) o.castShadow = false;
  });
  scene.add(group);

  surfacing(root, {
    structureZone: [0.4, 20.9, 8.3, 31.9],
    swingZone: [-1.6, 35.3, 4.8, 41.3],
    pyramid: PY,
    roundabout: RB,
    trampolineZone: [TR[0] - 1.45, TR[1] - 1.1, TR[0] + 1.45, TR[1] + 1.1],
    // from the south gate north between the swings and the rope pyramid to the play structure
    path: [onEdge(OUTER, 5, 0.5, 0.2), { x: 5.3, z: 41.0 }, { x: 5.2, z: 35.0 }, { x: 4.6, z: 32.6 }].map((p) => [p.x, p.z]),
    games: GAMES,
    riders,
    spinner: SB,
    toddlerZone: [TT[0] - 2.4, TT[1] - 1.1, TT[0] + 2.0, TT[1] + 1.1],
    // the sand-coloured wave: from the west gate across to the toddler tower
    wave: [[-16.5, 27.5], [-14.0, 27.2], [-11.0, 29.2], [-8.5, 31.6], [-5.6, 31.9], [-4.4, 29.3], [-6.4, 28.3], [-9.2, 28.2], [-12.0, 26.0], [-15.0, 25.6]],
  });

  // the layout check: pieces overlapping, or too near the fence
  if (import.meta.env.DEV) {
    const problems = [];
    placed.forEach(([n, x, z, r, grp], i) => {
      if (!inside(OUTER, x, z)) problems.push(`${n} outside the fence`);
      else if (edgeDist(OUTER, x, z) < r + FENCE_INSET + 0.05 && n !== 'bench' && n !== 'bin') problems.push(`${n} too near the fence (${edgeDist(OUTER, x, z).toFixed(2)} m from the edge)`);
      for (const [m, x2, z2, r2, grp2] of placed.slice(i + 1)) {
        if (grp === grp2) continue;
        const d = Math.hypot(x - x2, z - z2);
        if (d < r + r2) problems.push(`${n} overlaps ${m} (${d.toFixed(2)} m apart, needs ${(r + r2).toFixed(2)})`);
      }
    });
    if (problems.length) console.warn(`playground layout:\n  ${problems.join('\n  ')}`);
    else console.info('playground layout: ok');
  }
  return group;
}
