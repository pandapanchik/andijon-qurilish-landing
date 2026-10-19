// Hammerhead tower crane built from real lattice geometry, plus an "operator" that runs an
// endless pick -> slew -> drop cycle.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  mat, paint, steel, glass, canvasTexture, concreteMaterial, worldUV, mesh, rodGeometry,
  latticeGeometry, lerp, lerpAngle, easeInOut,
} from './kit.js';

const YELLOW = '#E9AE12';
let shared;
function materials() {
  if (shared) return shared;
  const stripes = canvasTexture(64, 64, (g) => {
    g.fillStyle = '#E9AE12';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#1d1d1f';
    for (let i = -64; i < 128; i += 22) {
      g.beginPath();
      g.moveTo(i, 0); g.lineTo(i + 11, 0); g.lineTo(i + 11 - 64, 64); g.lineTo(i - 64, 64);
      g.fill();
    }
  });
  const board = canvasTexture(512, 96, (g, w, h) => {
    g.fillStyle = '#F3F1EC';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#1B1D45';
    g.font = '800 46px Unbounded, Arial Black, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('ANDIJON QURILISH', w / 2, h / 2 + 2);
  });
  shared = {
    yellow: paint(YELLOW, { roughness: 0.55 }),
    dark: paint('#2a2c30', { roughness: 0.6 }),
    rope: steel('#3b3d40', { roughness: 0.55 }),
    grating: steel('#5a5f66', { roughness: 0.8, metalness: 0.6 }),
    cabWhite: paint('#e8e8e3', { roughness: 0.45 }),
    glass: glass('#2c3a48'),
    concrete: concreteMaterial('#d9d4cc'),
    hookBlock: paint('#ffffff', { map: stripes, roughness: 0.5 }),
    board: mat('#ffffff', { map: board, roughness: 0.6 }),
  };
  return shared;
}

export function createCrane({ height = 96, jib = 46, counter = 15 } = {}) {
  const M = materials();
  const root = new THREE.Group();

  // foundation and mast
  root.add(mesh(worldUV(new THREE.BoxGeometry(7, 1.2, 7), 4), M.concrete, { y: 0.4, receive: true }));
  const sq = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  root.add(mesh(latticeGeometry(height, sq, { step: 2, chord: 0.12, brace: 0.045 }), M.yellow, { y: 1 }));

  const slew = new THREE.Group();
  slew.position.y = height + 1;
  root.add(slew);

  slew.add(mesh(new THREE.CylinderGeometry(1.35, 1.35, 0.5, 20), M.dark, { y: 0.25 }));
  slew.add(mesh(new THREE.BoxGeometry(2.6, 0.9, 2.6), M.yellow, { y: 0.95 }));

  // operator cab on the jib side
  const cab = new THREE.Group();
  cab.position.set(1.2, 0.2, 1.9);
  cab.add(mesh(new THREE.BoxGeometry(1.7, 2.2, 1.7), M.cabWhite, { y: 1.1 }));
  cab.add(mesh(new THREE.BoxGeometry(0.06, 1.3, 1.5), M.glass, { x: 0.86, y: 1.35 }));
  cab.add(mesh(new THREE.BoxGeometry(1.3, 1.1, 0.06), M.glass, { y: 1.4, z: 0.86 }));
  cab.add(mesh(new THREE.BoxGeometry(1.9, 0.12, 1.9), M.dark, { y: 2.26 }));
  slew.add(cab);

  // cat-head: tapered lattice tower that carries the pendants
  slew.add(mesh(latticeGeometry(10, sq, { step: 2, chord: 0.11, brace: 0.045, taper: 0.22 }), M.yellow, { y: 1.4 }));
  const apexTop = new THREE.Vector3(0, 11.4, 0);

  // jib: triangular truss along +x, slightly tapering toward the tip
  const jibGeo = latticeGeometry(jib, [[0, -0.8], [0, 0.8], [-1.9, 0]], { step: 2.3, chord: 0.1, brace: 0.04, taper: 0.7 });
  jibGeo.rotateZ(-Math.PI / 2).translate(1.2, 1.4, 0);
  slew.add(mesh(jibGeo, M.yellow));
  slew.add(mesh(new THREE.BoxGeometry(jib - 2, 0.04, 0.5), M.grating, { x: jib / 2 + 1.2, y: 1.42 }));

  // counter-jib: flat truss, walkway, winch and hanging concrete counterweights
  const cjGeo = latticeGeometry(counter, [[0, -1.1], [0, 1.1], [0.9, 1.1], [0.9, -1.1]], { step: 2.2, chord: 0.1, brace: 0.04 });
  cjGeo.rotateZ(Math.PI / 2).translate(-1.2, 1.4, 0);
  slew.add(mesh(cjGeo, M.yellow));
  slew.add(mesh(new THREE.BoxGeometry(counter - 1, 0.05, 2.1), M.grating, { x: -counter / 2 - 1.2, y: 1.45 }));
  slew.add(mesh(new THREE.BoxGeometry(1.8, 1.1, 1.5), M.yellow, { x: -counter * 0.42, y: 2.05, z: 0.1 }));
  slew.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.3, 14).rotateX(Math.PI / 2), M.dark, { x: -counter * 0.42 + 1.2, y: 2.0, z: 0.1 }));
  const blocks = [];
  for (let k = 0; k < 4; k++) blocks.push(worldUV(new THREE.BoxGeometry(0.55, 3.0, 2.3).translate(-counter + 0.3 + k * 0.6, 0.6, 0), 4));
  slew.add(mesh(mergeGeometries(blocks), M.concrete));
  // contractor's board along the counter-jib rail, both sides
  for (const s of [-1, 1]) {
    const b = mesh(new THREE.PlaneGeometry(counter * 0.55, counter * 0.1), M.board, { x: -counter * 0.55, y: 2.25, z: s * 1.16 });
    if (s < 0) b.rotation.y = Math.PI;
    slew.add(b);
  }

  // pendant bars from the cat-head
  const pend = [];
  const jibTop = (x) => new THREE.Vector3(x, 1.4 + 1.9 * (1 - 0.3 * ((x - 1.2) / jib)), 0);
  pend.push(rodGeometry(apexTop, jibTop(jib * 0.38), 0.05));
  pend.push(rodGeometry(apexTop, jibTop(jib * 0.78), 0.05));
  for (const z of [-1, 1]) pend.push(rodGeometry(apexTop, new THREE.Vector3(-counter + 1, 2.3, z), 0.05));
  slew.add(mesh(mergeGeometries(pend), M.rope));

  // trolley, two-fall hoist rope, hook block + payload
  const trolley = new THREE.Group();
  trolley.add(mesh(new THREE.BoxGeometry(1.4, 0.45, 1.9), M.yellow, { y: 1.1 }));
  for (const x of [-0.45, 0.45]) trolley.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 2.0, 12).rotateX(Math.PI / 2), M.dark, { x, y: 0.8 }));
  slew.add(trolley);
  const cable = new THREE.Group();
  const ropeGeo = new THREE.CylinderGeometry(0.025, 0.025, 1, 4).translate(0, 0, 0);
  for (const z of [-0.22, 0.22]) cable.add(mesh(ropeGeo, M.rope, { z, cast: false }));
  slew.add(cable);
  const hook = new THREE.Group();
  hook.add(mesh(new THREE.BoxGeometry(0.75, 1.0, 0.6), M.hookBlock));
  hook.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.5, 16).rotateX(Math.PI / 2), M.dark, { y: 0.25 }));
  hook.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 8), M.rope, { y: -0.7 }));
  const hookCurve = mesh(new THREE.TorusGeometry(0.28, 0.08, 8, 16, Math.PI * 1.45), steel('#4a4d52'), { y: -1.15 });
  hookCurve.rotation.z = Math.PI * 0.78;
  hook.add(hookCurve);
  const payload = new THREE.Group();
  payload.position.y = -1.6;
  hook.add(payload);
  slew.add(hook);

  // aviation obstacle lights
  const lightMat = new THREE.MeshBasicMaterial({ color: '#FF2B2B' });
  for (const p of [[0, 11.6, 0], [jib + 1.2, 2.4, 0], [-counter - 0.6, 2.4, 0]]) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), lightMat);
    l.position.set(...p);
    slew.add(l);
  }

  root.traverse((o) => { if (o.isMesh && o.material !== M.rope) o.castShadow = true; });
  return { root, slew, trolley, cable, hook, payload, lightMat, height: height + 1, jib };
}

// --- Payloads the crane carries, each hung on slings ------------------------------------------
function slings(points) {
  const geo = mergeGeometries(points.map((p) => rodGeometry(new THREE.Vector3(0, 0, 0), new THREE.Vector3(...p), 0.03, 4)));
  return mesh(geo, materials().rope, { cast: false });
}

function iBeam(len) {
  const s = new THREE.Shape();
  const h = 0.45, b = 0.22, tf = 0.04, tw = 0.025;
  s.moveTo(-b / 2, -h / 2); s.lineTo(b / 2, -h / 2); s.lineTo(b / 2, -h / 2 + tf); s.lineTo(tw / 2, -h / 2 + tf);
  s.lineTo(tw / 2, h / 2 - tf); s.lineTo(b / 2, h / 2 - tf); s.lineTo(b / 2, h / 2); s.lineTo(-b / 2, h / 2);
  s.lineTo(-b / 2, h / 2 - tf); s.lineTo(-tw / 2, h / 2 - tf); s.lineTo(-tw / 2, -h / 2 + tf); s.lineTo(-b / 2, -h / 2 + tf);
  const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false });
  return g.translate(0, 0, -len / 2).rotateY(Math.PI / 2);
}

function makePayloads() {
  const primer = paint('#7a3b2a', { roughness: 0.7 });
  const beams = new THREE.Group();
  const beamGeo = iBeam(9);
  for (let i = 0; i < 3; i++) beams.add(mesh(beamGeo, primer, { y: -2.2 + (i === 2 ? 0.45 : 0), z: i === 2 ? 0 : (i - 0.5) * 0.3 }));
  beams.add(slings([[-3, -1.95, 0], [3, -1.95, 0]]));

  const bricks = new THREE.Group();
  const brickTex = canvasTexture(128, 128, (g) => {
    g.fillStyle = '#8f8a82';
    g.fillRect(0, 0, 128, 128);
    for (let r = 0; r < 8; r++) {
      for (let c = -1; c < 4; c++) {
        g.fillStyle = `rgb(${150 + ((r * 7 + c * 13) % 5) * 8},${70 + ((r + c) % 3) * 6},${52})`;
        g.fillRect(c * 40 + (r % 2) * 20 + 2, r * 16 + 2, 36, 12);
      }
    }
  }, { repeat: true });
  bricks.add(mesh(new THREE.BoxGeometry(1.3, 0.15, 1.1), mat('#9b7a54'), { y: -2.25 }));
  bricks.add(mesh(new THREE.BoxGeometry(1.2, 1.0, 1.0), mat('#ffffff', { map: brickTex, roughness: 0.35 }), { y: -1.65 }));
  bricks.add(slings([[0.6, -1.15, 0.5], [-0.6, -1.15, 0.5], [0.6, -1.15, -0.5], [-0.6, -1.15, -0.5]]));

  const crate = new THREE.Group();
  const rack = paint('#30343a');
  crate.add(mesh(new THREE.BoxGeometry(3.4, 0.15, 1.2), rack, { y: -2.25 }));
  for (const x of [-1.6, 1.6]) {
    crate.add(mesh(new THREE.BoxGeometry(0.1, 2.0, 0.1), rack, { x, y: -1.25, z: 0.45 }));
    crate.add(mesh(new THREE.BoxGeometry(0.1, 2.0, 0.1), rack, { x, y: -1.25, z: -0.45 }));
  }
  const pane = glass('#5b7387', { metalness: 0.7, roughness: 0.04 });
  for (let k = 0; k < 3; k++) crate.add(mesh(new THREE.BoxGeometry(3.0, 1.8, 0.03), pane, { y: -1.3, z: -0.12 + k * 0.12 }));
  crate.add(slings([[-1.6, -0.25, 0.45], [1.6, -0.25, 0.45], [-1.6, -0.25, -0.45], [1.6, -0.25, -0.45]]));

  const bucket = new THREE.Group();
  const prof = [[0.25, -2.4], [0.35, -2.3], [0.85, -1.4], [0.9, -0.55], [0.85, -0.5]].map(([r, y]) => new THREE.Vector2(r, y));
  bucket.add(mesh(new THREE.LatheGeometry(prof, 18), steel('#7a7f84', { roughness: 0.6, metalness: 0.7, side: THREE.DoubleSide })));
  bucket.add(mesh(new THREE.CylinderGeometry(0.86, 0.86, 0.05, 18), concreteMaterial('#c9c4bb'), { y: -0.62 }));
  bucket.add(mesh(new THREE.TorusGeometry(0.88, 0.04, 6, 20, Math.PI), materials().dark, { y: -0.5 }));

  const panels = new THREE.Group();
  const form = paint('#E2B21C', { roughness: 0.6 });
  for (let k = 0; k < 6; k++) panels.add(mesh(new THREE.BoxGeometry(2.7, 0.12, 1.35), form, { y: -2.2 + k * 0.13 }));
  panels.add(slings([[1.2, -1.42, 0.6], [-1.2, -1.42, 0.6], [1.2, -1.42, -0.6], [-1.2, -1.42, -0.6]]));

  return [beams, bricks, crate, bucket, panels];
}

// Phases: [name, seconds]. The cycle never stops; targets are re-read every phase.
const PHASES = [
  ['toPick', 4.2], ['lower', 2.8], ['attach', 0.9], ['raise', 3.0],
  ['toDrop', 4.2], ['lowerDrop', 2.4], ['release', 0.9], ['raiseDrop', 1.8],
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

    // a heavy load swings slowly and settles: low stiffness, light damping
    const angVel = (this.angle - prevAngle) / Math.max(dt, 1e-4);
    this.swayV += (-this.sway * 2.2 - this.swayV * 0.9 - angVel * 0.5) * dt;
    this.sway += this.swayV * dt;

    c.slew.rotation.y = this.angle;
    c.trolley.position.x = this.radius;
    const hookLocal = this.hookY - c.height;
    const top = 0.75, bottom = hookLocal + 0.5;
    c.cable.position.set(this.radius, (top + bottom) / 2, 0);
    c.cable.scale.y = Math.max(0.1, top - bottom);
    c.hook.position.set(this.radius, hookLocal, 0);
    c.hook.rotation.z = this.sway * 0.25;
  }
}
