// Cartoon tower crane plus an "operator" that runs an endless pick -> slew -> drop cycle.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  toon, latticeMaterial, mesh, rod, lerp, lerpAngle, easeInOut,
} from './kit.js';

const YELLOW = '#FFC21A';

export function createCrane({ height = 96, jib = 46, counter = 15 } = {}) {
  const root = new THREE.Group();
  const yellow = toon(YELLOW);
  const dark = toon('#2B2D52');
  const concrete = toon('#9C958C');

  root.add(mesh(new THREE.BoxGeometry(7, 1.6, 7), concrete, { y: 0.8, receive: true }));
  root.add(mesh(new THREE.BoxGeometry(2.4, height, 2.4), latticeMaterial(YELLOW, 1, height / 2.4), { y: height / 2 }));

  const slew = new THREE.Group();
  slew.position.y = height;
  root.add(slew);

  slew.add(mesh(new THREE.BoxGeometry(3.4, 1.2, 3.4), yellow, { y: 0.6 }));
  const cab = mesh(new RoundedBoxGeometry(2.8, 2.6, 2.6, 3, 0.45), yellow, { y: 1.4, z: 2.6, x: 1.2 });
  slew.add(cab);
  slew.add(mesh(new THREE.BoxGeometry(0.15, 1.3, 2.2), toon('#7FB7E8', { emissive: '#223', }), { y: 1.7, z: 2.6, x: 2.65 }));

  const apex = mesh(new THREE.CylinderGeometry(0.35, 1.7, 10, 4, 1, true), latticeMaterial(YELLOW, 2, 5), { y: 6.2 });
  apex.rotation.y = Math.PI / 4;
  slew.add(apex);

  slew.add(mesh(new THREE.BoxGeometry(jib, 1.8, 1.8), latticeMaterial(YELLOW, jib / 1.8, 1), { x: jib / 2 + 1.2, y: 2.1 }));
  slew.add(mesh(new THREE.BoxGeometry(counter, 1.2, 2.4), latticeMaterial(YELLOW, counter / 1.2, 1), { x: -counter / 2 - 1.2, y: 1.9 }));
  for (let k = 0; k < 3; k++) {
    slew.add(mesh(new THREE.BoxGeometry(1.2, 3.2, 2.6), concrete, { x: -counter + 0.2 + k * 1.3, y: 0.2 }));
  }
  const tieMat = toon('#E0A800');
  const apexTop = new THREE.Vector3(0, 11.2, 0);
  slew.add(rod(apexTop, new THREE.Vector3(jib * 0.7, 3, 0), 0.13, tieMat));
  slew.add(rod(apexTop, new THREE.Vector3(jib * 0.3, 3, 0), 0.13, tieMat));
  slew.add(rod(apexTop, new THREE.Vector3(-counter, 2.5, 0), 0.13, tieMat));

  // trolley + cable + hook + payload
  const trolley = mesh(new THREE.BoxGeometry(2.2, 0.7, 2.4), dark, { y: 0.9 });
  slew.add(trolley);
  const cable = mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 5), dark, { cast: false });
  slew.add(cable);
  const hook = new THREE.Group();
  hook.add(mesh(new THREE.BoxGeometry(1.1, 1.3, 0.7), toon('#FF5E1F')));
  const hookCurve = mesh(new THREE.TorusGeometry(0.4, 0.12, 6, 12, Math.PI * 1.4), dark, { y: -1.05 });
  hookCurve.rotation.z = Math.PI * 0.8;
  hook.add(hookCurve);
  const payload = new THREE.Group();
  payload.position.y = -1.6;
  hook.add(payload);
  slew.add(hook);

  // aviation obstacle lights
  const lightMat = new THREE.MeshBasicMaterial({ color: '#FF2B2B' });
  const lights = [];
  for (const p of [[0, 11.5, 0], [jib + 1.2, 3.2, 0], [-counter - 1, 2.8, 0]]) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), lightMat);
    l.position.set(...p);
    slew.add(l);
    lights.push(l);
  }

  return { root, slew, trolley, cable, hook, payload, lightMat, height, jib };
}

// --- Payloads the crane carries ---------------------------------------------------------
function makePayloads() {
  const beams = new THREE.Group();
  const red = toon('#D8472B');
  for (let i = 0; i < 3; i++) beams.add(mesh(new THREE.BoxGeometry(9, 0.5, 0.6), red, { y: -0.4 - (i % 2) * 0.5, z: (i - 1) * 0.7 }));

  const bricks = new THREE.Group();
  bricks.add(mesh(new THREE.BoxGeometry(2.6, 0.3, 2.6), toon('#B88B5A'), { y: -2.1 }));
  bricks.add(mesh(new THREE.BoxGeometry(2.4, 1.6, 2.4), toon('#C4583A'), { y: -1.15 }));
  for (const [x, z] of [[1.2, 1.2], [-1.2, 1.2], [1.2, -1.2], [-1.2, -1.2]]) {
    bricks.add(rod(new THREE.Vector3(0, 0, 0), new THREE.Vector3(x, -0.4, z), 0.05, toon('#333')));
  }

  const glass = new THREE.Group();
  glass.add(mesh(new THREE.BoxGeometry(6, 3, 0.25), toon('#7FC3E8', { transparent: true, opacity: 0.85 }), { y: -1.8 }));
  glass.add(mesh(new THREE.BoxGeometry(6.2, 0.25, 0.4), toon('#2B2D52'), { y: -0.3 }));

  const bucket = new THREE.Group();
  bucket.add(mesh(new THREE.CylinderGeometry(1.4, 0.7, 2.2, 10), toon('#8B93B8'), { y: -1.4 }));
  bucket.add(mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.2, 10), toon('#B9B1A6'), { y: -0.35 }));

  return [beams, bricks, glass, bucket];
}

// Phases: [name, seconds]. The cycle never stops; targets are re-read every phase.
const PHASES = [
  ['toPick', 3.4], ['lower', 2.2], ['attach', 0.6], ['raise', 2.4],
  ['toDrop', 3.4], ['lowerDrop', 1.8], ['release', 0.6], ['raiseDrop', 1.4],
];

export class CraneOperator {
  constructor(crane, { pick, drop, offset = 0 }) {
    this.c = crane;
    this.pick = pick;
    this.drop = drop;
    this.payloads = makePayloads();
    this.payloads.forEach((p) => { p.visible = false; crane.payload.add(p); });
    this.kind = 0;
    this.phase = 0;
    this.t = offset;
    this.sway = 0;
    this.swayV = 0;
    const p = this.polar(this.drop());
    this.angle = p.angle;
    this.radius = p.radius;
    this.hookY = crane.height - 10;
    this.from = { angle: this.angle, radius: this.radius, hookY: this.hookY };
  }

  polar(world) {
    const o = this.c.root.position;
    const dx = world.x - o.x, dz = world.z - o.z;
    return {
      angle: Math.atan2(-dz, dx),
      radius: Math.min(this.c.jib - 2, Math.max(5, Math.hypot(dx, dz))),
      y: world.y,
    };
  }

  update(dt) {
    const c = this.c;
    this.t += dt;
    let [name, dur] = PHASES[this.phase];
    if (this.t >= dur) {
      this.t -= dur;
      this.phase = (this.phase + 1) % PHASES.length;
      [name, dur] = PHASES[this.phase];
      this.from = { angle: this.angle, radius: this.radius, hookY: this.hookY };
      if (name === 'attach') {
        this.kind = (this.kind + 1) % this.payloads.length;
        this.payloads.forEach((p, i) => { p.visible = i === this.kind; });
      }
      if (name === 'release') this.payloads.forEach((p) => { p.visible = false; });
    }
    const k = easeInOut(Math.min(1, this.t / dur));
    const high = c.height - 9;
    const prevAngle = this.angle;

    if (name === 'toPick' || name === 'toDrop') {
      const target = this.polar(name === 'toPick' ? this.pick : this.drop());
      this.angle = lerpAngle(this.from.angle, target.angle, k);
      this.radius = lerp(this.from.radius, target.radius, k);
      this.hookY = lerp(this.from.hookY, high, Math.min(1, k * 2));
    } else if (name === 'lower') {
      this.hookY = lerp(this.from.hookY, this.pick.y + 4.2, k);
    } else if (name === 'lowerDrop') {
      this.hookY = lerp(this.from.hookY, this.drop().y + 4.6, k);
    } else if (name === 'raise' || name === 'raiseDrop') {
      this.hookY = lerp(this.from.hookY, high, k);
    }

    // payload sways like a pendulum when the jib swings
    const angVel = (this.angle - prevAngle) / Math.max(dt, 1e-4);
    this.swayV += (-this.sway * 6 - this.swayV * 1.6 - angVel * 0.9) * dt;
    this.sway += this.swayV * dt;

    c.slew.rotation.y = this.angle;
    c.trolley.position.x = this.radius;
    const hookLocal = this.hookY - c.height;
    const top = 0.55, bottom = hookLocal + 0.65;
    c.cable.position.set(this.radius, (top + bottom) / 2, 0);
    c.cable.scale.y = Math.max(0.1, top - bottom);
    c.hook.position.set(this.radius, hookLocal, 0);
    c.hook.rotation.z = this.sway * 0.6;
  }
}
