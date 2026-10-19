// Sky, sun, trees, cars and people. Ground, roads, river and neighbours come with the model.
//
// Light: the sky is an HDRI (Poly Haven, CC0) that lights the scene through the environment map
// and is the background; its sun disc was taken out (scripts/build_web_assets.py) and replaced by
// a directional light from the same direction, so the sun casts shadows and is counted once.
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { CARS, PEOPLE, TREES, toScene } from './config.js';
import { addCars, addPeople, addTrees } from './props.js';
import { PLAYGROUND_TREES } from './playground.js';
import { keepOffRoads } from './streets.js';
import { Q } from './quality.js';
import skyInfo from '../public/env/sky.json';

const ENV = `${import.meta.env.BASE_URL}env/`;
// sky radiance -> scene: one factor for background, ambient light and reflections alike
const SKY_INTENSITY = 1.0;
const SUN_INTENSITY = 3.4;

/**
 * @param after  resolves when the model is in: sky, trees and cars wait for it, so the model (what the
 *               first view needs) gets the whole connection first
 */
export function buildWorld(scene, renderer, after = Promise.resolve()) {
  const sunDir = new THREE.Vector3(...skyInfo.sun_dir).normalize();

  // haze towards the horizon, the colour of the low sky
  scene.fog = new THREE.FogExp2(0xc9d6e2, 0.00042);
  scene.background = new THREE.Color(0xb9cde0); // until the sky is in
  scene.backgroundIntensity = SKY_INTENSITY;
  scene.environmentIntensity = SKY_INTENSITY;

  const sun = new THREE.DirectionalLight(0xfff1df, SUN_INTENSITY);
  sun.position.copy(sunDir).multiplyScalar(400);
  sun.castShadow = true;
  sun.shadow.mapSize.set(Q.shadowMap, Q.shadowMap);
  const sc = sun.shadow.camera;
  sc.left = -150;
  sc.right = 150;
  sc.top = 150;
  sc.bottom = -150;
  sc.near = 150;
  sc.far = 700;
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  // until the HDRI arrives: a plain sky-coloured ambient so the first frame is not black
  const fill = new THREE.HemisphereLight(0xd8e6f5, 0x8a8170, 1.2);
  scene.add(fill);

  // the 1k sky lights the scene (the environment map is filtered down to 256 px anyway) and is the
  // background; on the high level the 2k sky replaces the background once everything else is in
  const pmrem = new THREE.PMREMGenerator(renderer);
  const hdr = new RGBELoader();
  const sky = (res) => hdr.loadAsync(`${ENV}sky_${res}.hdr`).then((t) => ((t.mapping = THREE.EquirectangularReflectionMapping), t));
  const ready = after
    .then(() => sky('1k'))
    .then((t) => {
      scene.background = t;
      scene.environment = pmrem.fromEquirectangular(t).texture;
      fill.removeFromParent(); // the sky lights the scene now
      pmrem.dispose();
    })
    .catch((e) => console.warn('sky', e));

  // trees, cars and people (positions from the Blender build)
  addPeople(scene, keepOffRoads(PEOPLE), toScene);
  const props = after.then(() => {
    addTrees(scene, TREES.protos, TREES.list, [...TREES.placed, ...PLAYGROUND_TREES], toScene);
    addCars(scene, CARS, toScene);
  });
  if (Q.skyRes !== '1k') {
    Promise.all([ready, props])
      .then(() => new Promise((r) => setTimeout(r, 1500)))
      .then(() => sky(Q.skyRes))
      .then((t) => {
        const old = scene.background;
        scene.background = t;
        old?.dispose?.();
      })
      .catch((e) => console.warn('sky background', e));
  }

  return { sun, ready: Promise.all([ready, props]) };
}
