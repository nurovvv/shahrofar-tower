// Block V of the Shahrofar complex, on its own in a garden. Tower placement and floor levels come
// from the Blender build in blender/ (model/complex.json); apartments, rooms and walls from the
// architect's floor plans (model/plans.json).
import complex from './model/complex.json';
import plans from './model/plans.json';

export const MODEL_URL = `${import.meta.env.BASE_URL}models/shahrofar.glb`;
export const PLANS = plans;

// Site plan coordinates (metres, x east, y north) -> scene (x, z) with the site centre at the origin.
const [CX, CY] = complex.site_centre;
export const toScene = (x, y) => ({ x: x - CX, z: -(y - CY) });

export const TOWERS = complex.towers;
export const RESIDENTIAL = TOWERS.filter((t) => !t.hotel);
export const towerByKey = Object.fromEntries(TOWERS.map((t) => [t.key, t]));
export const TREES = { protos: complex.tree_protos, list: complex.trees, placed: complex.trees_placed ?? [] };
export const CARS = complex.cars ?? [];
export const PEOPLE = complex.people ?? [];
export const BENCHES = complex.benches ?? []; // [x, y, turn]: faces (sin turn, -cos turn)

// A tower's floor plans are drawn in its own frame (x along the lettered axes). In the scene, a
// group at `position` turned by `rotY` holds plan point (x, y) at local (x, height, -y).
export function planFrame(t) {
  const a = (t.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const [px, py] = t.plan_centre;
  const o = toScene(t.centre[0] - (c * px - s * py), t.centre[1] - (s * px + c * py));
  return {
    position: { x: o.x, z: o.z },
    rotY: a,
    // plan point -> scene (x, z)
    toScene: (x, y) => ({ x: o.x + c * x - s * y, z: o.z - (s * x + c * y) }),
    // scene (x, z) -> plan point
    toPlan: (X, Z) => {
      const dx = X - o.x, dy = -(Z - o.z);
      return { x: c * dx + s * dy, y: -s * dx + c * dy };
    },
    // plan direction -> site compass bearing (0 = north, 90 = east)
    bearing: (dx, dy) => {
      const ex = c * dx - s * dy, ny = s * dx + c * dy;
      return ((Math.atan2(ex, ny) * 180) / Math.PI + 360) % 360;
    },
  };
}

export const STATUS = {
  available: { label: 'Свободна', color: 0x22b573, css: '#22b573' },
  reserved: { label: 'Забронирована', color: 0xf0a92e, css: '#f0a92e' },
  sold: { label: 'Продана', color: 0xe14d4d, css: '#e14d4d' },
};
