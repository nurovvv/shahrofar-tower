// Functional checks of the running site in Chrome: every apartment has its pick volume and overlay,
// floors and apartments can be selected (by API and by clicking the model), the walk-through
// starts and ends, walls between apartments stop the visitor and doorways let them through.
//
//   node tools/check_app.mjs [--url http://localhost:5173/] [--quality low]
import { chromium } from 'playwright-core';
import { HOME } from './views.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : d);
const url = opt('url', 'http://localhost:5173/');
const quality = opt('quality', '');
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
await page.goto(`${url}?still${quality ? `&quality=${quality}` : ''}`);
await page.waitForFunction(() => window.__app?.building, null, { timeout: 120000 });

let failed = 0;
const check = (ok, msg) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!ok) failed++;
};

// 1. data <-> model
const r1 = await page.evaluate(() => {
  const { apartments, building } = window.__app;
  const missing = apartments.filter((a) => !building.units.has(a.id)).map((a) => a.id);
  const ids = new Set(apartments.map((a) => a.id));
  return { n: apartments.length, units: building.units.size, missing, unique: ids.size === apartments.length };
});
check(r1.missing.length === 0 && r1.units === r1.n, `${r1.n} apartments, ${r1.units} pick volumes, missing: ${r1.missing.join(', ') || 'none'}`);
check(r1.unique, 'apartment ids are unique');

// 2. floors and apartments through the UI functions, overlays follow
for (const [tower, floor] of [['V', 5], ['V', 12], ['V', 23], ['V', 24]]) {
  const r = await page.evaluate(async ([tower, floor]) => {
    const app = window.__app;
    app.selectFloor(tower, floor);
    await new Promise((r) => setTimeout(r, 1300));
    const apts = app.apartments.filter((a) => a.tower === tower && a.floor === floor);
    const shown = apts.filter((a) => app.building.units.get(a.id).overlay.visible).length;
    const a = apts[1];
    app.selectApt(a);
    await new Promise((r) => setTimeout(r, 1300));
    const card = document.querySelector('#side h2')?.textContent;
    const plan = document.querySelector('#side canvas.plan');
    return { n: apts.length, shown, card, want: `Квартира № ${a.number}`, plan: !!plan && plan.width > 0, mode: app.state.mode };
  }, [tower, floor]);
  check(r.shown === r.n && r.card === r.want && r.plan, `floor ${tower}${floor}: ${r.n} flats highlighted (${r.shown}), card "${r.card}", plan drawn ${r.plan}`);
}

// 3. clicking the model picks a floor
await page.evaluate(async (home) => {
  window.__app.goOverview();
  await new Promise((r) => setTimeout(r, 1600));
  window.__app.setView(home.pos, home.target);
}, HOME);
await page.waitForTimeout(400);
const target = await page.evaluate(() => {
  const app = window.__app;
  const u = app.building.units.get('V12-3');
  const p = u.center.clone().project(app.camera);
  return { x: ((p.x + 1) / 2) * innerWidth, y: ((1 - p.y) / 2) * innerHeight };
});
await page.mouse.move(target.x, target.y);
await page.mouse.down();
await page.mouse.up();
await page.waitForTimeout(1500);
const picked = await page.evaluate(() => ({ mode: window.__app.state.mode, tower: window.__app.state.tower, floor: window.__app.state.floor }));
check(picked.mode === 'floor' && picked.tower === 'V', `click on the model opens a floor (${JSON.stringify(picked)})`);

// 4. walk-through: start, walls between apartments block, doorways pass, exit
const walks = await page.evaluate(async () => {
  const app = window.__app;
  const out = [];
  for (const id of ['V12-0', 'V12-7', 'V24-4', 'V15-2', 'V8-5']) {
    const a = app.apartments.find((x) => x.id === id);
    app.selectApt(a);
    app.enterWalk(a);
    await new Promise((r) => setTimeout(r, 700));
    const it = app.interior;
    const f = it.frame;
    // walk as the controls do (wall sliding, 0.25 m radius) from the entrance: breadth-first over
    // 15 cm steps in 8 directions; a room counts as reached when the visitor stands inside it
    const pos = { x: it.spawn.x, z: it.spawn.z };
    const rooms = a.data.rooms.filter((r) => r.area > 3);
    const inPoly = (poly, x, y) => {
      let c = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i], [xj, yj] = poly[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
      }
      return c;
    };
    const seen = new Set(), queue = [pos], hit = new Set();
    const key = (p) => `${Math.round(p.x / 0.15)},${Math.round(p.z / 0.15)}`;
    seen.add(key(pos));
    while (queue.length && seen.size < 30000) {
      const p = queue.shift();
      const lp = f.toPlan(p.x, p.z);
      rooms.forEach((r, i) => inPoly(r.poly, lp.x, lp.y) && hit.add(i));
      for (let k = 0; k < 8; k++) {
        const ang = (k / 8) * Math.PI * 2;
        const q = it.move(p.x, p.z, p.x + Math.cos(ang) * 0.15, p.z + Math.sin(ang) * 0.15);
        if (Math.hypot(q.x - p.x, q.z - p.z) < 0.08 || seen.has(key(q))) continue;
        seen.add(key(q));
        queue.push(q);
      }
    }
    const reached = hit.size;
    // try to walk out through each wall of the flat's outline: the visitor must stay inside
    let escaped = 0;
    for (let k = 0; k < 24; k++) {
      const ang = (k / 24) * Math.PI * 2;
      let p = { ...pos };
      for (let s = 0; s < 800; s++) p = it.move(p.x, p.z, p.x + Math.cos(ang) * 0.05, p.z + Math.sin(ang) * 0.05);
      const lp = f.toPlan(p.x, p.z);
      // inside the outline?
      const poly = a.data.outline;
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i], [xj, yj] = poly[j];
        if (yi > lp.y !== yj > lp.y && lp.x < ((xj - xi) * (lp.y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (!inside) escaped++;
    }
    out.push({ id, rooms: rooms.length, reached, escaped, mode: app.state.mode });
    app.exitWalk();
    await new Promise((r) => setTimeout(r, 900));
  }
  return out;
});
for (const w of walks) {
  check(w.mode === 'walk' && w.escaped === 0, `walk ${w.id}: started, 24 pushes against the walls, ${w.escaped} left the flat`);
  check(w.reached === w.rooms, `walk ${w.id}: ${w.reached} of ${w.rooms} rooms reached on foot from the entrance (doorways passable)`);
}
const back = await page.evaluate(() => window.__app.state.mode);
check(back === 'floor', `exit from the walk returns to the floor view (${back})`);

check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
await browser.close();
console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
process.exit(failed ? 1 : 0);
