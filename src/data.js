// Apartments of the building, as drawn on the floor plans (model/plans.json).
// Prices and statuses are demo values; in a real project they would come from the sales
// team's export or an admin panel.
import { PLANS, RESIDENTIAL, planFrame } from './config.js';
import { centroid, polygonArea } from './geometry.js';

function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20261011);
// The plan of floor 24 of block V was re-read from the sheet (6 flats before, the drawing has 8).
// It draws its demo values from a stream of its own and still uses up its old share of the main
// stream, so every other floor keeps the statuses and prices it had.
const OWN_STREAM = { V24: { rand: mulberry32(20261013), used: 6 } };

const VIEWS = [
  [45, 'North · river', 1.08],
  [135, 'East · garden & bridge', 1.05],
  [225, 'South · city', 1.0],
  [315, 'West · park', 1.0],
];
function viewOf(bearing) {
  for (const [lim, name, k] of VIEWS) if (bearing < lim) return { name, k };
  return { name: VIEWS[0][1], k: VIEWS[0][2] };
}

function summary(rooms) {
  const count = (f) => rooms.filter(f).length;
  const plural = (n, one, many) => (n > 1 ? `${n} ${many}` : one);
  const parts = [];
  const living = count((r) => r.name === 'Living room'), family = count((r) => r.name === 'Family room');
  if (living) parts.push(plural(living, 'living room', 'living rooms'));
  if (family) parts.push(plural(family, 'family room', 'family rooms'));
  if (count((r) => r.kind === 'kitchen')) parts.push('kitchen');
  const beds = count((r) => r.kind === 'bedroom');
  if (beds) parts.push(plural(beds, '1 bedroom', 'bedrooms'));
  const baths = count((r) => r.kind === 'bath' && r.area >= 3); // WCs are not counted
  if (baths) parts.push(plural(baths, 'bathroom', 'bathrooms'));
  const s = parts.join(', ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const apartments = [];
for (const tower of RESIDENTIAL) {
  const frame = planFrame(tower);
  const centre = centroid(PLANS[tower.floors[0].plan].enclosure);
  let number = 0;
  const first = tower.floors[0].floor;
  for (const fl of tower.floors) {
    const own = OWN_STREAM[fl.plan];
    if (own) for (let k = 0; k < own.used; k++) rand();
    PLANS[fl.plan].apartments.forEach((a, i) => {
      const c = centroid(a.outline);
      const view = viewOf(frame.bearing(c[0] - centre[0], c[1] - centre[1]));
      const r = own ? own.rand() : rand();
      const status = r < 0.55 ? 'available' : r < 0.75 ? 'reserved' : 'sold';
      const perM2 = 1350 * (1 + (fl.floor - first) * 0.02) * view.k * (a.rooms_count >= 3 ? 1.04 : 1);
      const balcony = a.balconies.reduce((s, b) => s + b.area, 0) + a.rooms.filter((r) => r.kind === 'loggia').reduce((s, r) => s + r.area, 0);
      apartments.push({
        id: `${tower.key}${fl.floor}-${i}`,
        tower: tower.key,
        towerLabel: tower.label,
        number: ++number,
        floor: fl.floor,
        floors: tower.levels,
        unit: i,
        plan: fl.plan,
        data: a, // outline, rooms, balconies, fixtures (plan coordinates)
        baseY: fl.z + tower.slab,
        ceiling: Math.round((fl.h - 0.5) * 10) / 10,
        view: view.name,
        rooms: a.rooms_count,
        area: a.area,
        balcony: Math.round(balcony * 10) / 10,
        summary: summary(a.rooms),
        price: Math.round((a.area * perM2) / 500) * 500,
        status,
        outlineArea: polygonArea(a.outline),
      });
    });
  }
}

export const aptsOnFloor = (tower, floor) => apartments.filter((a) => a.tower === tower && a.floor === floor);
