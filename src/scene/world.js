// Builds the whole scene on one fixed, transparent canvas and drives it from page scroll.
import * as THREE from 'three';
import { createTower } from './tower.js';
import { createCrane, CraneOperator } from './crane.js';
import { createSiteTraffic, createAvenue } from './vehicles.js';
import { createCity } from './city.js';
import { rng, smooth, lerp } from './kit.js';

// One camera frame per page section. shift > 0 slides the picture right (content on the left).
const FRAMES = [
  { pos: [66, 22, 170], target: [0, 42, 0], shift: 0 },
  { pos: [-110, 34, 92], target: [0, 44, -4], shift: 0.2 },
  { pos: [44, 104, 52], target: [-4, 70, 0], shift: -0.2 },
  { pos: [190, 170, 190], target: [-10, 6, -40], shift: 0 },
  { pos: [34, 8, 96], target: [0, 50, 0], shift: 0.22 },
];

const SKY = {
  fogDusk: new THREE.Color('#F2A585'),
  fogNight: new THREE.Color('#2D3366'),
  hemiSkyDusk: new THREE.Color('#C7B0E6'),
  hemiSkyNight: new THREE.Color('#4A5799'),
  hemiGround: new THREE.Color('#6A4458'),
  sunDusk: new THREE.Color('#FFB47E'),
  sunNight: new THREE.Color('#9DB0FF'),
};

export function createWorld(canvas, { reduced = false } = {}) {
  const mobile = Math.min(window.innerWidth, window.innerHeight) < 700 || matchMedia('(pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.5 : 1.75));
  renderer.setClearColor(0x000000, 0);
  renderer.localClippingEnabled = true;
  renderer.shadowMap.enabled = !mobile;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(SKY.fogDusk.clone(), 150, 640);
  const camera = new THREE.PerspectiveCamera(38, 1, 1, 2400);

  const hemi = new THREE.HemisphereLight(SKY.hemiSkyDusk.clone(), SKY.hemiGround, 1.7);
  const sun = new THREE.DirectionalLight(SKY.sunDusk.clone(), 2.6);
  sun.position.set(150, 120, 110);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -120, right: 120, top: 140, bottom: -60, near: 10, far: 500 });
  sun.shadow.bias = -0.0006;
  scene.add(hemi, sun, new THREE.AmbientLight('#ffffff', 0.25));

  const rand = rng(42);
  const city = createCity(scene, { rand, mobile });

  const tower = createTower({ floors: 24, sign: 'AQH' });
  scene.add(tower.group);

  const crane = createCrane({ height: 96, jib: 46 });
  crane.root.position.set(-14, 0, -9);
  scene.add(crane.root);
  const bay = new THREE.Vector3(-46, 0, 6);
  const operator = new CraneOperator(crane, {
    pick: new THREE.Vector3(-33.4, 0.5, 3.6),
    drop: () => new THREE.Vector3(0, tower.state.complete ? tower.height + 1.5 : tower.top, 1),
  });

  // second site in the back: grows with scroll
  const tower2 = createTower({
    floors: 14, w: 16, cols: 7, seed: 3,
    palette: { spandrel: '#D5DCEB', glassTop: '#2F3A6E', glassBottom: '#8FB6E2', fin: '#FFC21A', concrete: '#C9C2B8' },
  });
  tower2.group.position.set(110, 0, -86);
  scene.add(tower2.group);
  const crane2 = createCrane({ height: 70, jib: 34, counter: 11 });
  crane2.root.position.set(96, 0, -74);
  scene.add(crane2.root);
  const operator2 = new CraneOperator(crane2, {
    pick: new THREE.Vector3(84, 0.5, -60),
    drop: () => new THREE.Vector3(110, Math.max(4, tower2.top), -86),
    offset: 4,
  });

  const crane3 = createCrane({ height: 62, jib: 30, counter: 10 });
  crane3.root.position.set(-104, 0, -132);
  scene.add(crane3.root);
  const operator3 = new CraneOperator(crane3, {
    pick: new THREE.Vector3(-122, 0.5, -112),
    drop: () => new THREE.Vector3(-100, 30, -120),
    offset: 9,
  });

  const traffic = createSiteTraffic(scene, { rect: [-46, 46, -40, 34], bay });
  const avenue = createAvenue(scene, { z: 56, rand });

  // ---- state --------------------------------------------------------------------------
  const state = {
    build: reduced ? 1 : 0, // 0..1 main tower progress
    buildSpeed: 1 / 10, // seconds to finish = 10
    scroll: 0, // 0..FRAMES.length-1 continuous section index
    night: 0,
    completedAt: reduced ? 0 : -1,
    pointer: new THREE.Vector2(),
  };
  const camPos = new THREE.Vector3(...FRAMES[0].pos);
  const camTarget = new THREE.Vector3(...FRAMES[0].target);
  let camShift = 0;
  const desiredPos = new THREE.Vector3(), desiredTarget = new THREE.Vector3();
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  let width = 1, height = 1;

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', (e) => {
    state.pointer.set((e.clientX / width) * 2 - 1, (e.clientY / height) * 2 - 1);
  }, { passive: true });

  function frameAt(t) {
    const narrow = width / height < 0.85;
    const i = Math.min(FRAMES.length - 2, Math.floor(t));
    const f = smooth(0, 1, t - i);
    const A = FRAMES[i], B = FRAMES[i + 1];
    desiredTarget.set(...A.target).lerp(b.set(...B.target), f);
    desiredPos.set(...A.pos).lerp(a.set(...B.pos), f);
    if (narrow) {
      // pull back on portrait screens so the tower fits, and keep it centred
      desiredPos.sub(desiredTarget).multiplyScalar(1.55).add(desiredTarget);
      desiredTarget.y += 6;
      return 0;
    }
    return lerp(A.shift, B.shift, f);
  }

  let time = 0;
  function update(dt) {
    time += dt;
    const motion = reduced ? 0 : 1;

    // tower build: time based, kicks off on load
    if (state.build < 1) {
      // if the visitor scrolls on before the tower is done, finish it faster
      const speed = state.scroll > 0.5 ? 0.4 : state.buildSpeed;
      state.build = Math.min(1, state.build + dt * speed);
      if (state.build >= 1) state.completedAt = time;
    }
    const glowIn = state.completedAt >= 0 ? smooth(0, 1.6, time - state.completedAt) : 0;
    state.night = smooth(1.9, 3.8, state.scroll);
    const glow = Math.max(0.12 + state.night * 1.05, glowIn * 0.55) * (state.build >= 0.98 ? 1 : 0.35 + state.night);
    tower.update(state.build, glow);
    const grow = smooth(1.6, 3.1, state.scroll);
    tower2.update(Math.max(0.04, grow), 0.1 + state.night);

    // camera
    const shift = frameAt(state.scroll);
    if (!reduced) {
      // a slow drift and pointer parallax keep the picture alive
      const yaw = Math.sin(time * 0.08) * 0.05 + state.pointer.x * 0.035;
      a.copy(desiredPos).sub(desiredTarget).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      desiredPos.copy(desiredTarget).add(a);
      desiredPos.y -= state.pointer.y * 3;
    }
    const k = reduced ? 1 : 1 - Math.exp(-dt * 3.2);
    camPos.lerp(desiredPos, k);
    camTarget.lerp(desiredTarget, k);
    camShift = lerp(camShift, shift, k);
    camera.position.copy(camPos);
    camera.lookAt(camTarget);
    camera.setViewOffset(width, height, -camShift * width, 0, width, height);

    // lighting by time of day
    const n = state.night;
    scene.fog.color.copy(SKY.fogDusk).lerp(SKY.fogNight, n);
    hemi.color.copy(SKY.hemiSkyDusk).lerp(SKY.hemiSkyNight, n);
    hemi.intensity = lerp(1.7, 0.75, n);
    sun.color.copy(SKY.sunDusk).lerp(SKY.sunNight, n);
    sun.intensity = lerp(2.6, 0.55, n);

    const blink = (Math.sin(time * 3) > 0.2 ? 1 : 0.25) * lerp(0.7, 1, n);
    for (const c of [crane, crane2, crane3]) c.lightMat.color.setRGB(blink, 0.1 * blink, 0.1 * blink);

    if (motion) {
      operator.update(dt);
      operator2.update(dt);
      operator3.update(dt);
      traffic.update(dt, time);
      avenue.update(dt);
    }
    city.update(dt, time, { night: n, grow, reduced });
    renderer.render(scene, camera);
  }

  function rebuild() {
    state.build = 0;
    state.completedAt = -1;
  }

  return { update, state, rebuild, renderer };
}

export const SECTION_COUNT = FRAMES.length;
