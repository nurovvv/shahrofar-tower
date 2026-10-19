import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RESIDENTIAL, STATUS, toScene, towerByKey } from './config.js';
import { apartments, aptsOnFloor } from './data.js';
import { buildWorld } from './world.js';
import { loadComplex } from './building.js';
import { addPlayground } from './playground.js';
import { addStreets } from './streets.js';
import { buildFloor } from './floor.js';
import { WalkControls } from './walk.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { drawPlan, planTransform } from './plan.js';
import { Q, setQuality } from './quality.js';
import { createRenderer, createPipeline } from './render.js';
import { water } from './materials.js';
import { updateCars } from './props.js';
import { money, num, plural, roomsText } from './text.js';

const $ = (s) => document.querySelector(s);

// ---------- renderer / scene ----------
// No WebGL (old browser, GPU blocked, context refused): say so and show a still instead of an
// endless loading indicator. createRenderer throws in that case.
let renderer;
try {
  renderer = createRenderer();
} catch (err) {
  console.error(err);
  document.body.classList.add('no-webgl');
  $('#loading').hidden = true;
  $('#nogl').hidden = false;
  throw err;
}
$('#stage').appendChild(renderer.domElement);
const canvas = renderer.domElement;
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  $('#nogl').hidden = false;
  $('#nogl .why').textContent = 'Видеокарта остановила 3D-просмотр (не хватило памяти или вкладка долго была в фоне).';
});

const scene = new THREE.Scene();

// The scene stands still (only the water moves, and it casts no shadow): the sun's shadow map is
// drawn when something changes (a file arrives, a floor opens or closes, the walk starts or ends)
// instead of every frame, which halves the GPU work per frame.
renderer.shadowMap.autoUpdate = false;
let shadowFrames = 2;
const shadowsDirty = () => (shadowFrames = 2);
THREE.DefaultLoadingManager.onProgress = shadowsDirty;

const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 1, 6000);
// The one building (block V) and its garden. Start view: from the south-east over the garden, the
// river and the bridge behind; on a portrait phone screen (the panel covers the lower half) further
// back, with the tower in the middle of the upper half.
const TOWER = RESIDENTIAL[0];
const HOME_WIDE = { pos: new THREE.Vector3(95, 118, 175), target: new THREE.Vector3(-10, 36, -16) };
const HOME_TALL = { pos: new THREE.Vector3(68, 150, 230), target: new THREE.Vector3(-38, 16, -17) };
const home = () => (innerWidth < innerHeight ? HOME_TALL : HOME_WIDE);
camera.position.copy(home().pos);

const controls = new OrbitControls(camera, canvas);
controls.target.copy(home().target);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 12;
controls.maxDistance = 480;
controls.maxPolarAngle = Math.PI * 0.48;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.35;

let building = null; // set once the model has loaded
const loadingEl = $('#loading');
const modelLoad = loadComplex(apartments, renderer, (k) => (loadingEl.querySelector('b').textContent = `${Math.round(k * 100)}%`));
const world = buildWorld(scene, renderer, modelLoad.then(() => {}, () => {}));
const pipeline = createPipeline(renderer, scene, camera);
const walk = new WalkControls(camera, canvas);

modelLoad
  .then((b) => {
    building = b;
    scene.add(b.group);
    addPlayground(scene, b.group);
    addStreets(scene, b.group);
    shadowsDirty();
    loadingEl.hidden = true;
    refresh();
  })
  .catch((err) => {
    console.error(err);
    loadingEl.textContent = 'Не удалось загрузить 3D-модель. Проверьте подключение и обновите страницу.';
  });

// graphics level switch (bottom right)
{
  const b = $('#quality');
  b.textContent = Q.level === 'high' ? 'Графика: высокая' : 'Графика: лёгкая';
  b.title = Q.level === 'high' ? 'Переключить на лёгкий режим (быстрее на телефонах и старых компьютерах)' : 'Включить полное качество';
  b.onclick = () => setQuality(Q.level === 'high' ? 'low' : 'high');
}

// ---------- state ----------
const state = {
  mode: 'overview', // overview | floor | walk
  tower: null, // open tower + floor in the floor view
  floor: null,
  apt: null,
  hoverApt: null,
  filter: { rooms: 0, availableOnly: false },
};
let dollhouse = []; // interiors shown in the cut-away floor view
let walkInterior = null;
let lastInteraction = performance.now();

const sameFloor = (a, b) => a && b && a.tower === b.tower && a.floor === b.floor;
const isOpen = (a) => a.tower === state.tower && a.floor === state.floor;
const filterActive = () => state.filter.rooms > 0 || state.filter.availableOnly;
const matches = (a) =>
  (!state.filter.rooms || a.rooms === state.filter.rooms) && (!state.filter.availableOnly || a.status === 'available');

// ---------- camera flights ----------
let tween = null;
function flyTo(pos, target, dur = 1.1) {
  tween = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos.clone(), t1: target.clone(), t: 0, dur };
  controls.enabled = false;
}
function azimuth() {
  return Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
}
function floorCentre(tower, floor) {
  const list = aptsOnFloor(tower, floor);
  const c = new THREE.Vector3();
  for (const a of list) c.add(building.units.get(a.id).center);
  return c.divideScalar(list.length);
}
function floorView(tower, floor) {
  const target = floorCentre(tower, floor);
  const az = azimuth();
  return { pos: target.clone().add(new THREE.Vector3(Math.sin(az) * 30, 44, Math.cos(az) * 30)), target };
}
function aptView(apt) {
  const c = building.units.get(apt.id).center;
  const target = new THREE.Vector3(c.x, c.y + 0.5, c.z);
  // from outside the facade, in line with the tower's centre and the apartment
  const t = towerByKey[apt.tower], tc = toScene(t.centre[0], t.centre[1]);
  const dir = new THREE.Vector3(c.x - tc.x, 0, c.z - tc.z).normalize();
  return { pos: target.clone().add(dir.multiplyScalar(22)).add(new THREE.Vector3(0, 26, 0)), target };
}

// ---------- overlays ----------
function updateOverlays() {
  if (!building) return;
  for (const a of apartments) {
    const u = building.units.get(a.id);
    let show = false, color = 0xffffff, op = 0, edges = false;
    if (state.mode === 'overview') {
      if (sameFloor(state.hoverApt, a)) {
        show = true; op = 0.4; edges = true;
        color = a === state.hoverApt ? 0xffffff : 0xdfeaf3;
      } else if (filterActive() && matches(a)) {
        show = true; color = STATUS[a.status].color; op = 0.5;
      }
    } else if (state.mode === 'floor') {
      if (isOpen(a)) {
        show = true; edges = true; color = STATUS[a.status].color;
        op = a === state.apt ? 0.3 : a === state.hoverApt ? 0.22 : 0.08;
        if (filterActive() && !matches(a)) op = 0.02;
      } else if (sameFloor(state.hoverApt, a)) {
        show = true; op = 0.35;
      }
    }
    u.overlay.visible = show;
    u.overlay.material.color.setHex(color);
    u.overlay.material.opacity = op;
    u.edges.visible = show && edges;
    u.edges.material.color.setHex(state.mode === 'floor' ? color : 0xffffff);
  }
}

// ---------- labels over apartments in floor view ----------
const labelsEl = $('#labels');
let labels = [];
function buildLabels() {
  labelsEl.innerHTML = '';
  labels = [];
  if (state.mode !== 'floor') return;
  for (const a of aptsOnFloor(state.tower, state.floor)) {
    const el = document.createElement('div');
    el.className = 'tag';
    el.style.borderColor = STATUS[a.status].css;
    el.innerHTML = `<b>№ ${a.number}</b> <span>· ${roomsText(a.rooms)} · ${num(a.area)} м²</span><br>${money.format(a.price)}`;
    el.onclick = () => selectApt(a);
    el.onpointerenter = () => setHover(a);
    el.onpointerleave = () => setHover(null);
    labelsEl.appendChild(el);
    labels.push({ el, apt: a });
  }
}
const tmp = new THREE.Vector3();
function updateLabels() {
  for (const { el, apt } of labels) {
    // tag above the apartment, pushed out from the tower's centre so neighbours don't overlap
    const u = building.units.get(apt.id);
    const t = towerByKey[apt.tower], tc = toScene(t.centre[0], t.centre[1]);
    const dx = u.center.x - tc.x, dz = u.center.z - tc.z, d = Math.hypot(dx, dz) || 1;
    tmp.set(u.center.x + (dx / d) * 9, u.top + 0.6, u.center.z + (dz / d) * 9).project(camera);
    const hidden = tmp.z > 1 || (filterActive() && !matches(apt));
    el.style.display = hidden ? 'none' : '';
    el.style.left = `${((tmp.x + 1) / 2) * innerWidth}px`;
    el.style.top = `${((1 - tmp.y) / 2) * innerHeight}px`;
    el.classList.toggle('hover', apt === state.hoverApt);
  }
}

// ---------- UI panels ----------
function statusChip(a) {
  const s = STATUS[a.status];
  return `<span class="status" style="color:${s.css}"><i style="background:${s.css}"></i>${s.label}</span>`;
}

function renderFloors() {
  const t = TOWER;
  let html = `<button class="overview-btn" data-act="overview">⌂ Всё здание</button><h3>Этажи</h3>`;
  for (const { floor: f } of [...t.floors].reverse()) {
    const list = aptsOnFloor(t.key, f);
    const avail = list.filter((a) => a.status === 'available' && matches(a)).length;
    const dots = list.map((a) => `<i class="${matches(a) ? '' : 'dim'}" style="background:${STATUS[a.status].css}"></i>`).join('');
    const active = state.mode !== 'overview' && state.tower === t.key && state.floor === f;
    html += `<button class="floor-btn ${active ? 'active' : ''}" data-floor="${f}">
      <span class="num">${f}</span>
      <span class="meta">свободно ${avail}<span class="dots">${dots}</span></span>
    </button>`;
  }
  html += `<button class="floor-btn lobby" disabled><span class="num">1–${t.floors[0].floor - 1}</span><span class="meta">Лобби и коммерция</span></button>`;
  $('#floors').innerHTML = html;
}
$('#floors').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.act === 'overview') goOverview();
  else if (b.dataset.floor) selectFloor(TOWER.key, +b.dataset.floor);
});

function renderSide() {
  const side = $('#side');
  if (state.mode === 'overview') {
    const avail = apartments.filter((a) => a.status === 'available');
    const from = Math.min(...avail.map((a) => a.price));
    const areas = apartments.map((a) => a.area);
    const minRooms = Math.min(...apartments.map((a) => a.rooms)), maxRooms = Math.max(...apartments.map((a) => a.rooms));
    side.innerHTML = `
      <h2>Выберите квартиру</h2>
      <div class="sub">${TOWER.levels} ${plural(TOWER.levels, 'этаж', 'этажа', 'этажей')} · ${apartments.length} ${plural(apartments.length, 'квартира', 'квартиры', 'квартир')} · ${minRooms}–${maxRooms} ${plural(maxRooms, 'комната', 'комнаты', 'комнат')}</div>
      <div class="stats">
        <div class="stat"><b>${avail.length}</b><span>свободно</span></div>
        <div class="stat"><b>${num(Math.round(from / 1000))} тыс. $</b><span>цена от</span></div>
        <div class="stat"><b>${num(Math.min(...areas))}–${num(Math.max(...areas))}</b><span>м²</span></div>
      </div>
      <div class="label">Комнаты</div>
      <div class="seg" data-filter="rooms">
        ${[0, ...new Set(apartments.map((a) => a.rooms))].sort().map((r) => `<button data-v="${r}" class="${state.filter.rooms === r ? 'on' : ''}">${r ? roomsText(r) : 'Все'}</button>`).join('')}
      </div>
      <label class="toggle"><input type="checkbox" id="only-avail" ${state.filter.availableOnly ? 'checked' : ''}/> Только свободные</label>
      <div class="note">Выберите этаж на здании или в списке, чтобы заглянуть внутрь. ${filterActive() ? 'Подходящие квартиры подсвечены на здании.' : ''}</div>`;
  } else if (state.mode === 'floor' && !state.apt) {
    const list = aptsOnFloor(state.tower, state.floor);
    side.innerHTML = `
      <button class="back" data-act="overview">← Всё здание</button>
      <h2>Этаж ${state.floor}</h2>
      <div class="sub">Свободно ${list.filter((a) => a.status === 'available').length} из ${list.length} ${plural(list.length, 'квартиры', 'квартир', 'квартир')}</div>
      <div class="apt-list">
        ${list.map((a) => `
          <button class="apt-row ${filterActive() && !matches(a) ? 'muted' : ''}" data-apt="${a.id}">
            <span class="t">№ ${a.number}</span><span class="p">${money.format(a.price)}</span>
            <span class="d">${roomsText(a.rooms)} · ${num(a.area)} м² · ${a.view}</span><span>${statusChip(a)}</span>
          </button>`).join('')}
      </div>
      <div class="note">Нажмите на квартиру на модели или в этом списке.</div>`;
  } else if (state.mode === 'floor' && state.apt) {
    const a = state.apt;
    side.innerHTML = `
      <button class="back" data-act="floor">← Этаж ${a.floor}</button>
      <h2>Квартира № ${a.number}</h2>
      <div class="sub">${roomsText(a.rooms)} · ${num(a.area)} м² · ${a.floor} этаж</div>
      <div>${statusChip(a)}</div>
      <canvas class="plan"></canvas>
      <div class="specs">
        <div><span>Комнат</span><b>${a.rooms}</b></div>
        <div><span>Общая площадь</span><b>${num(a.area)} м²</b></div>
        <div><span>Этаж</span><b>${a.floor} из ${a.floors}</b></div>
        <div><span>Высота потолков</span><b>${num(a.ceiling)} м</b></div>
        <div style="grid-column: span 2"><span>Планировка</span><b>${a.summary}${a.balcony ? `, балкон ${num(a.balcony)} м²` : ''}</b></div>
        <div style="grid-column: span 2"><span>Вид из окон</span><b>${a.view}</b></div>
      </div>
      <div class="price">${money.format(a.price)}</div>
      <div class="ppm">${money.format(Math.round(a.price / a.area))} за м²</div>
      <div class="actions">
        <button class="btn primary" data-act="walk">🚶 Прогулка по квартире в 3D</button>
        <button class="btn" data-act="request">Записаться на просмотр</button>
      </div>`;
    drawPlan(side.querySelector('.plan'), a);
  }
}
$('#side').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.act === 'overview') goOverview();
  else if (b.dataset.act === 'floor') selectFloor(state.tower, state.floor);
  else if (b.dataset.act === 'walk') enterWalk(state.apt);
  else if (b.dataset.act === 'request') toast('Демо: здесь заявка ушла бы в отдел продаж.');
  else if (b.dataset.apt) selectApt(apartments.find((a) => a.id === b.dataset.apt));
  else if (b.dataset.v !== undefined) {
    state.filter.rooms = +b.dataset.v;
    refresh();
  }
});
$('#side').addEventListener('change', (e) => {
  if (e.target.id === 'only-avail') {
    state.filter.availableOnly = e.target.checked;
    refresh();
  }
});
$('#side').addEventListener('pointerover', (e) => {
  const row = e.target.closest('[data-apt]');
  setHover(row ? apartments.find((a) => a.id === row.dataset.apt) : null);
});
$('#side').addEventListener('pointerleave', () => setHover(null));

function refresh() {
  renderFloors();
  renderSide();
  updateOverlays();
  $('#hint').textContent =
    state.mode === 'overview' ? 'Перетащите — поворот · Колесо — масштаб · Нажмите на этаж' : 'Нажмите на квартиру · Перетащите — поворот · Колесо — масштаб';
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

function setHover(a) {
  if (state.hoverApt === a) return;
  state.hoverApt = a;
  updateOverlays();
  document.querySelectorAll('.apt-row').forEach((r) => r.classList.toggle('hover', a && r.dataset.apt === a.id));
}

// ---------- navigation ----------
function clearDollhouse() {
  dollhouse.forEach((d) => d.dispose());
  dollhouse = [];
}

function goOverview() {
  shadowsDirty();
  clearDollhouse();
  building?.showAll();
  Object.assign(state, { mode: 'overview', tower: null, floor: null, apt: null, hoverApt: null });
  buildLabels();
  flyTo(home().pos, home().target, 1.3);
  refresh();
}

function selectFloor(tower, floor) {
  shadowsDirty();
  if (!building) return;
  if (state.tower !== tower || state.floor !== floor || state.mode !== 'floor') {
    clearDollhouse();
    building.showUpTo(tower, floor);
    const d = buildFloor(tower, floor, aptsOnFloor(tower, floor));
    scene.add(d.group);
    dollhouse.push(d);
  }
  Object.assign(state, { mode: 'floor', tower, floor, apt: null });
  controls.autoRotate = false;
  const v = floorView(tower, floor);
  flyTo(v.pos, v.target);
  buildLabels();
  refresh();
}

function selectApt(a) {
  if (state.mode !== 'floor' || !isOpen(a)) selectFloor(a.tower, a.floor);
  state.apt = a;
  const v = aptView(a);
  flyTo(v.pos, v.target);
  refresh();
}

function fade(fn) {
  const f = $('#fade');
  f.classList.add('on');
  setTimeout(() => {
    fn();
    requestAnimationFrame(() => requestAnimationFrame(() => f.classList.remove('on')));
  }, 380);
}

function enterWalk(a) {
  shadowsDirty();
  fade(() => {
    clearDollhouse();
    labelsEl.innerHTML = '';
    labels = [];
    building.showAll(a.tower, a.floor);
    walkInterior = buildFloor(a.tower, a.floor, aptsOnFloor(a.tower, a.floor), a);
    scene.add(walkInterior.group);
    shadowsDirty();
    state.mode = 'walk';
    state.hoverApt = null;
    updateOverlays();
    tween = null;
    controls.enabled = false;
    camera.fov = 72;
    camera.near = 0.05;
    pipeline.walk(true);
    lightInterior(walkInterior);
    camera.updateProjectionMatrix();
    walk.start(walkInterior, scene);
    $('#ext-ui').hidden = true;
    $('#walk-ui').hidden = false;
    document.body.classList.add('walking');
    $('#walk-title').innerHTML = `<b>№ ${a.number}</b> · ${roomsText(a.rooms)} · ${num(a.area)} м² · ${a.floor} этаж · ${money.format(a.price)}`;
    prepareMinimap(a);
  });
}

// Indoors, the sky's even light (blue above, green ground below) would reach every corner. A small
// studio-like room lights the interior's ambient and reflections instead, the sun's shadow map is
// pulled in round the flat (sharp window shadows on the floor), and the room lights cast shadows.
let roomEnv = null, outdoor = null, bounce = null;
function lightInterior(interior) {
  const sun = world.sun, sc = sun.shadow.camera;
  if (interior) {
    roomEnv ??= new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
    outdoor = {
      env: scene.environment, envI: scene.environmentIntensity,
      cam: [sc.left, sc.right, sc.top, sc.bottom, sc.near, sc.far], pos: sun.position.clone(), target: sun.target.position.clone(),
    };
    scene.environment = roomEnv;
    scene.environmentIntensity = 0.32;
    // light bounced off the floor and walls: warm from below (it is what lights a ceiling)
    bounce ??= new THREE.HemisphereLight(0xfff3e4, 0xd9c3a5, 0.9);
    scene.add(bounce);
    const c = new THREE.Box3().setFromObject(interior.group).getCenter(new THREE.Vector3());
    const dir = sun.position.clone().sub(sun.target.position).normalize();
    sun.target.position.copy(c);
    sun.position.copy(c).addScaledVector(dir, 120);
    [sc.left, sc.right, sc.top, sc.bottom, sc.near, sc.far] = [-24, 24, 24, -24, 60, 200];
  } else if (outdoor) {
    bounce?.removeFromParent();
    scene.environment = outdoor.env;
    scene.environmentIntensity = outdoor.envI;
    [sc.left, sc.right, sc.top, sc.bottom, sc.near, sc.far] = outdoor.cam;
    sun.position.copy(outdoor.pos);
    sun.target.position.copy(outdoor.target);
    outdoor = null;
  }
  sun.target.updateMatrixWorld();
  sc.updateProjectionMatrix();
  shadowsDirty();
}

function exitWalk() {
  shadowsDirty();
  const a = walkInterior.apt;
  fade(() => {
    walk.stop();
    walkInterior.dispose();
    walkInterior = null;
    camera.fov = 38;
    camera.near = 1;
    pipeline.walk(false);
    lightInterior(null);
    camera.updateProjectionMatrix();
    controls.enabled = true;
    $('#ext-ui').hidden = false;
    $('#walk-ui').hidden = true;
    document.body.classList.remove('walking');
    state.mode = 'overview';
    selectFloor(a.tower, a.floor);
    selectApt(a);
    const v = aptView(a);
    camera.position.copy(v.pos);
    controls.target.copy(v.target);
    tween = null;
    controls.enabled = true;
  });
}
$('#exit-walk').onclick = exitWalk;
addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    if (state.mode === 'walk') exitWalk();
    else if (state.mode === 'floor' && state.apt) selectFloor(state.tower, state.floor);
    else if (state.mode === 'floor') goOverview();
  }
});

// ---------- mini-map ----------
const mini = $('#minimap canvas');
let miniBg = null, miniT = null;
function prepareMinimap(a) {
  const off = document.createElement('canvas');
  off.width = mini.clientWidth; // drawPlan sizes by CSS px when the canvas isn't in the page
  off.height = mini.clientHeight;
  drawPlan(off, a, { pad: 6, labels: false });
  miniBg = off;
  miniT = planTransform(a, mini.clientWidth, mini.clientHeight, 6);
}
function drawMinimap() {
  if (!miniBg || !walk.enabled) return;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = mini.clientWidth, h = mini.clientHeight;
  if (mini.width !== Math.round(w * dpr)) {
    mini.width = Math.round(w * dpr);
    mini.height = Math.round(h * dpr);
  }
  const g = mini.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, mini.width, mini.height);
  g.drawImage(miniBg, 0, 0);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const s = walk.localState();
  const x = miniT.px(s.x), y = miniT.py(s.y);
  const ang = Math.atan2(-s.dy, s.dx);
  g.fillStyle = 'rgba(31, 95, 139, 0.25)';
  g.beginPath();
  g.moveTo(x, y);
  g.arc(x, y, 30, ang - 0.6, ang + 0.6);
  g.closePath();
  g.fill();
  g.fillStyle = '#1f5f8b';
  g.strokeStyle = '#fff';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(x, y, 5, 0, Math.PI * 2);
  g.fill();
  g.stroke();
}

// ---------- joystick (touch screens) ----------
const joy = $('#joystick'), knob = joy.querySelector('.knob');
let joyId = null;
const joyMove = (e) => {
  const r = joy.getBoundingClientRect();
  let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
  const max = r.width / 2 - 10, d = Math.hypot(dx, dy);
  if (d > max) { dx *= max / d; dy *= max / d; }
  knob.style.transform = `translate(${dx}px, ${dy}px)`;
  walk.setJoystick(dx / max, dy / max);
};
joy.addEventListener('pointerdown', (e) => { joyId = e.pointerId; joy.setPointerCapture(joyId); joyMove(e); });
joy.addEventListener('pointermove', (e) => e.pointerId === joyId && joyMove(e));
const joyEnd = () => { joyId = null; knob.style.transform = ''; walk.setJoystick(0, 0); };
joy.addEventListener('pointerup', joyEnd);
joy.addEventListener('pointercancel', joyEnd);
addEventListener('pointerdown', (e) => {
  lastInteraction = performance.now();
  if (e.pointerType === 'touch') document.body.classList.add('touch');
});
addEventListener('wheel', () => (lastInteraction = performance.now()), { passive: true });

// ---------- picking on the building ----------
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const tooltip = $('#tooltip');
// What is under the pointer: { apt } for an apartment, or null.
function pick(e) {
  if (!building) return null;
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hidden = (o) => {
    const a = o.userData.apt;
    return state.mode === 'floor' && a && a.tower === state.tower && a.floor > state.floor;
  };
  const hit = ray.intersectObjects(building.pickables.filter((o) => !hidden(o)), false)[0];
  return hit ? hit.object.userData : null;
}
let down = null;
canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
canvas.addEventListener('pointermove', (e) => {
  if (state.mode === 'walk' || e.pointerType === 'touch') return;
  if (e.buttons) {
    tooltip.style.opacity = 0;
    return;
  }
  const hit = pick(e);
  const a = hit?.apt ?? null;
  setHover(a);
  canvas.style.cursor = a ? 'pointer' : '';
  const place = () => {
    tooltip.style.left = `${e.clientX + 16}px`;
    tooltip.style.top = `${e.clientY + 12}px`;
    tooltip.style.opacity = 1;
  };
  if (a && (state.mode === 'overview' || !isOpen(a))) {
    const list = aptsOnFloor(a.tower, a.floor);
    const avail = list.filter((x) => x.status === 'available');
    const from = avail.length ? `от ${money.format(Math.min(...avail.map((x) => x.price)))}` : 'всё продано';
    tooltip.innerHTML = `<b>Этаж ${a.floor}</b><br>свободно ${avail.length} из ${list.length} · ${from}`;
    place();
  } else tooltip.style.opacity = 0;
});
canvas.addEventListener('pointerleave', () => {
  tooltip.style.opacity = 0;
  if (state.mode !== 'walk') setHover(null);
});
canvas.addEventListener('pointerup', (e) => {
  if (state.mode === 'walk' || !down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6;
  down = null;
  if (moved) return;
  const a = pick(e)?.apt;
  if (!a) return;
  tooltip.style.opacity = 0;
  if (state.mode === 'overview' || !isOpen(a)) selectFloor(a.tower, a.floor);
  else selectApt(a);
});

// ---------- loop ----------
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  pipeline.setSize(innerWidth, innerHeight);
});

const clock = new THREE.Clock();
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
renderer.info.autoReset = false; // count draw calls over all passes of a frame
renderer.setAnimationLoop(() => {
  renderer.info.reset();
  const dt = Math.min(clock.getDelta(), 0.05);
  if (tween) {
    tween.t += dt;
    const k = ease(Math.min(1, tween.t / tween.dur));
    camera.position.lerpVectors(tween.p0, tween.p1, k);
    controls.target.lerpVectors(tween.t0, tween.t1, k);
    if (k >= 1) {
      tween = null;
      controls.enabled = true;
    }
  }
  if (state.mode === 'walk') {
    walk.update(dt);
    drawMinimap();
  } else {
    // idle "attract mode" for showroom screens
    controls.autoRotate = state.mode === 'overview' && performance.now() - lastInteraction > 20000;
    if (!tween) controls.update();
    else camera.lookAt(controls.target);
    if (building) updateLabels();
  }
  for (const n of water) n.offset.x += dt * 0.006, n.offset.y += dt * 0.004;
  updateCars(camera); // near / far bodies: the shadows of the two are alike, no redraw needed
  if (shadowFrames > 0) {
    renderer.shadowMap.needsUpdate = true;
    shadowFrames--;
  }
  pipeline.render(dt);
});

refresh();
// start slowly spinning right away (not for the screenshot / test scripts: ?still)
const STILL = new URLSearchParams(location.search).has('still');
lastInteraction = STILL ? Infinity : -1e9;

// handles for the automated checks in tools/ (screenshots, picking and walk tests)
window.__app = {
  THREE, scene, camera, controls, renderer, state, walk, apartments, pipeline, world, quality: Q,
  get building() { return building; },
  get interior() { return walkInterior; },
  selectFloor, selectApt, enterWalk, exitWalk, goOverview,
  setView(pos, target) {
    tween = null;
    camera.position.set(...pos);
    controls.target.set(...target);
    controls.update();
  },
};
