// Fixed cameras for screenshots (scene metres: x east, y up, z south).
// The start view of the site (src/main.js HOME).
export const HOME = { pos: [95, 118, 175], target: [-10, 36, -16] };

export const VIEWS = {
  // the start view, with the sales UI
  aerial: { ...HOME, ui: true },
  // same view without UI
  aerial_clean: { ...HOME },
  // from over the river, north-east
  aerial_river: { pos: [120, 110, -170], target: [-15, 30, -10] },
  // block V: balconies, windows, slab bands
  facade_v: { pos: [-5, 28, 30], target: [-36, 30, -14] },
  // the garden: the fountain plaza, the sports court, the pergola, the entrance canopy
  garden: { pos: [75, 42, 45], target: [12, 0, -22] },
  pool: { pos: [30, 22, 0], target: [5, 2, -24] },
  court: { pos: [90, 20, -5], target: [63, 0, -31] },
  pergola: { pos: [62, 14, 58], target: [45.6, 1, 44] },
  entrance: { pos: [2, 9, -4], target: [-24, 3, -16] },
  // the ground-level playground by the car park: from above the street, and at a parent's eye height
  playground: { pos: [30, 16, 68], target: [-6, 0, 30] },
  playground_top: { pos: [-4, 46, 48], target: [-4, 0, 30.5] },
  playground_eye: { pos: [0.5, 1.6, 50], target: [-1, 0.9, 30] },
  // the avenue at street level, parked cars
  street_avenue: { pos: [127, 1.7, 20], target: [137, 3, -40] },
  cars: { pos: [-26, 2.5, 46], target: [-24, 0.6, 30] },
  // walls between apartments, close: the same cut-away floor, camera low over the party walls
  walls_v12: { floor: ['V', 12], from: HOME, pos: [-30, 60, 4], target: [-38, 43, -14] },
  // walking inside a flat: the entrance hall of flat V12-7, looking west into the flat
  walk_v12: { walk: 'V12-7', at: [-34.38, -7.76], yaw: 3.035, pitch: -0.08 },
  // cut-away floor views (camera from the app's own flight), and an apartment's card
  floor_v12: { floor: ['V', 12], ui: true, from: HOME },
  floor_v23: { floor: ['V', 23], ui: true, from: HOME },
  apt_v15: { floor: ['V', 15], apt: 'V15-2', ui: true, from: HOME },
};
