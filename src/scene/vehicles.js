// Site trucks that loop around the site and stop at the delivery bay, plus avenue traffic.
// Bodies are extruded side profiles, so silhouettes read like real vehicles.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat, paint, steel, glass, canvasTexture, groundTexture, mesh } from './kit.js';

const UP = new THREE.Vector3(0, 1, 0);

function roundedRect(x0, x1, z0, z1, r, seg = 6) {
  const pts = [];
  const corner = (cx, cz, a0) => {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      pts.push(new THREE.Vector3(cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r));
    }
  };
  corner(x1 - r, z1 - r, 0);
  corner(x0 + r, z1 - r, Math.PI / 2);
  corner(x0 + r, z0 + r, Math.PI);
  corner(x1 - r, z0 + r, Math.PI * 1.5);
  return pts;
}

// Flat road ribbon following a curve; u runs along the road in metres / 8.
export function roadRibbon(curve, width, samples, closed) {
  const pos = [], uv = [], idx = [];
  const len = curve.getLength();
  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    const p = curve.getPointAt(closed ? u % 1 : u);
    const t = curve.getTangentAt(closed ? u % 1 : u);
    const n = new THREE.Vector3().crossVectors(t, UP).normalize();
    pos.push(p.x + n.x * width / 2, 0.06, p.z + n.z * width / 2, p.x - n.x * width / 2, 0.06, p.z - n.z * width / 2);
    uv.push(u * len / 8, 0, u * len / 8, 1);
    if (i < samples) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Asphalt with tyre polish in the wheel paths and painted lane markings (u = along, v = across).
function roadTexture(kind) {
  const noise = groundTexture(kind === 'site' ? 'siteRoad' : 'asphalt').image;
  return canvasTexture(256, 256, (g, w, h) => {
    g.drawImage(noise, 0, 0, w, h);
    g.fillStyle = 'rgba(20,20,22,0.18)';
    if (kind === 'site') {
      g.fillRect(0, h * 0.18, w, h * 0.16);
      g.fillRect(0, h * 0.66, w, h * 0.16);
      return;
    }
    for (const v of [0.12, 0.33, 0.62, 0.83]) g.fillRect(0, h * (v - 0.03), w, h * 0.06);
    g.fillStyle = 'rgba(236,234,226,0.85)';
    g.fillRect(0, h * 0.02, w, 3); // edge lines
    g.fillRect(0, h * 0.98 - 3, w, 3);
    g.fillRect(0, h * 0.5 - 4, w, 3); // double centre line
    g.fillRect(0, h * 0.5 + 1, w, 3);
    for (const v of [0.25, 0.75]) g.fillRect(0, h * v - 1, w * 0.45, 3); // lane dashes
  }, { repeat: true });
}

// --- Vehicle builders --------------------------------------------------------------------
function extrude(points, depth, bevel = 0.06) {
  const s = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: depth - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4 });
  return g.translate(0, 0, -(depth - bevel * 2) / 2);
}

const tyreMat = mat('#1d1e20', { roughness: 0.9 });
const rimMat = steel('#b9bdc1', { roughness: 0.3 });
const chassisMat = paint('#1f2124', { roughness: 0.7 });
const chrome = steel('#d6d9dc', { roughness: 0.15 });
const darkGlass = glass('#1c242c', { roughness: 0.04 });
const headMat = new THREE.MeshBasicMaterial({ color: '#FFF4D6' });
const tailMat = new THREE.MeshBasicMaterial({ color: '#C3141B' });
const paints = new Map();
const carPaint = (c) => {
  if (!paints.has(c)) paints.set(c, new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.35, metalness: 0.4, clearcoat: 1, clearcoatRoughness: 0.08 }));
  return paints.get(c);
};

function wheel(r, width) {
  const w = new THREE.Group();
  w.add(mesh(new THREE.CylinderGeometry(r, r, width, 18).rotateX(Math.PI / 2), tyreMat));
  w.add(mesh(new THREE.CylinderGeometry(r * 0.58, r * 0.58, width + 0.02, 12).rotateX(Math.PI / 2), rimMat));
  return w;
}

function addWheels(g, xs, wheels, halfW = 1.05, r = 0.52, width = 0.4) {
  for (const x of xs) {
    for (const z of [-halfW, halfW]) {
      const w = wheel(r, width);
      w.position.set(x, r, z);
      g.add(w);
      wheels.push(w);
    }
  }
}

// Cab-over truck cab (KAMAZ / MAN style) with its front at x = xf.
function cab(g, color, xf) {
  const body = paint(color, { roughness: 0.4, metalness: 0.2 });
  g.add(mesh(extrude([[xf - 2.1, 1.15], [xf, 1.15], [xf + 0.06, 2.1], [xf - 0.12, 3.25], [xf - 2.1, 3.3]], 2.45, 0.08), body));
  g.add(mesh(extrude([[xf + 0.08, 2.15], [xf - 0.08, 3.12], [xf - 1.0, 3.12], [xf - 1.0, 2.15]], 2.5, 0.02), darkGlass));
  g.add(mesh(new THREE.BoxGeometry(0.2, 0.5, 2.5), chassisMat, { x: xf + 0.05, y: 1.05 })); // bumper
  g.add(mesh(new THREE.BoxGeometry(0.05, 0.55, 1.4), chassisMat, { x: xf + 0.07, y: 1.7 })); // grille
  for (const z of [-0.95, 0.95]) {
    g.add(mesh(new THREE.BoxGeometry(0.06, 0.18, 0.32), headMat, { x: xf + 0.16, y: 1.12, z }));
    g.add(mesh(new THREE.BoxGeometry(0.08, 0.45, 0.12), chassisMat, { x: xf - 0.2, y: 2.6, z: z * 1.42 })); // mirrors
  }
  g.add(mesh(new THREE.BoxGeometry(0.3, 0.14, 0.5), new THREE.MeshBasicMaterial({ color: '#FF9A1F' }), { x: xf - 1.2, y: 3.4 })); // beacon
}

function mixerDrumTexture() {
  return canvasTexture(256, 128, (g, w, h) => {
    g.fillStyle = '#e9e7e1';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#E2541C';
    for (let i = -2; i < 6; i++) {
      g.beginPath();
      g.moveTo(i * 64, 0); g.lineTo(i * 64 + 20, 0); g.lineTo(i * 64 + 84, h); g.lineTo(i * 64 + 64, h);
      g.fill();
    }
    g.fillStyle = 'rgba(120,112,100,0.35)'; // dried concrete splashes
    for (let i = 0; i < 40; i++) g.fillRect(Math.random() * w, h * 0.6 + Math.random() * h * 0.4, 3 + Math.random() * 8, 2 + Math.random() * 5);
  }, { repeat: true });
}

export function makeTruck(kind) {
  const g = new THREE.Group();
  const wheels = [];
  const spin = [];
  g.add(mesh(new THREE.BoxGeometry(7.4, 0.32, 0.9), chassisMat, { y: 1.0 })); // frame rails
  g.add(mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.1, 14).rotateZ(Math.PI / 2), steel('#a9adb2', { roughness: 0.3 }), { x: 0.6, y: 0.85, z: 0.95 })); // fuel tank

  if (kind === 'mixer') {
    cab(g, '#ECECE8', 3.6);
    const prof = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      prof.push(new THREE.Vector2(0.35 + Math.sin(Math.pow(t, 0.8) * Math.PI) * 1.05 + t * 0.2, t * 4.6 - 2.3));
    }
    const drumGeo = new THREE.LatheGeometry(prof, 24).rotateZ(Math.PI / 2 + 0.2);
    const drum = mesh(drumGeo, paint('#ffffff', { map: mixerDrumTexture(), roughness: 0.45, side: THREE.DoubleSide }), { x: -1.0, y: 2.55 });
    g.add(drum);
    spin.push(drum);
    g.add(mesh(new THREE.BoxGeometry(0.9, 1.2, 1.6), paint('#ECECE8'), { x: -3.4, y: 1.9 })); // hopper frame
    g.add(mesh(new THREE.BoxGeometry(1.6, 0.2, 0.5).rotateZ(-0.5), steel('#8a8f94'), { x: -3.9, y: 1.4 })); // chute
    addWheels(g, [2.7, -1.2, -2.6], wheels);
  } else if (kind === 'flatbed') {
    cab(g, '#2D5D9A', 3.6);
    g.add(mesh(new THREE.BoxGeometry(5.2, 0.2, 2.45), paint('#3b3e44', { roughness: 0.75 }), { x: -1.1, y: 1.35 }));
    const primer = paint('#7a3b2a', { roughness: 0.7 });
    const s = new THREE.Shape();
    const h = 0.4, b = 0.2, tf = 0.04, tw = 0.025;
    s.moveTo(-b / 2, -h / 2); s.lineTo(b / 2, -h / 2); s.lineTo(b / 2, -h / 2 + tf); s.lineTo(tw / 2, -h / 2 + tf);
    s.lineTo(tw / 2, h / 2 - tf); s.lineTo(b / 2, h / 2 - tf); s.lineTo(b / 2, h / 2); s.lineTo(-b / 2, h / 2);
    s.lineTo(-b / 2, h / 2 - tf); s.lineTo(-tw / 2, h / 2 - tf); s.lineTo(-tw / 2, -h / 2 + tf); s.lineTo(-b / 2, -h / 2 + tf);
    const beam = new THREE.ExtrudeGeometry(s, { depth: 5.6, bevelEnabled: false }).translate(0, 0, -2.8).rotateY(Math.PI / 2);
    for (let i = 0; i < 4; i++) g.add(mesh(beam, primer, { x: -1.2, y: 1.65 + (i > 2 ? 0.4 : 0), z: i > 2 ? 0 : (i - 1) * 0.5 }));
    addWheels(g, [2.7, -2.2, -3.2], wheels);
  } else {
    cab(g, '#E37A1E', 3.6); // KAMAZ orange
    const tipper = paint('#E37A1E', { roughness: 0.5 });
    g.add(mesh(extrude([[-4.0, 1.4], [1.0, 1.4], [1.3, 3.0], [-4.0, 2.7]], 2.45, 0.04), tipper));
    const sand = mesh(new THREE.SphereGeometry(1.6, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#B8996B', { roughness: 1 }), { x: -1.4, y: 2.6 });
    sand.scale.set(1.5, 0.42, 0.72);
    g.add(sand);
    addWheels(g, [2.7, -1.6, -2.9], wheels);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group: g, wheels, spin };
}

// Saloon in the shape of the Cobalt / Nexia that fill Uzbek streets.
const carBody = extrude([[-2.2, 0.32], [2.15, 0.32], [2.25, 0.62], [2.18, 0.82], [0.95, 0.98], [0.2, 1.42], [-1.0, 1.44], [-1.75, 1.02], [-2.2, 0.96], [-2.26, 0.6]], 1.74, 0.08);
const carGlass = extrude([[0.9, 0.99], [0.24, 1.37], [-0.96, 1.39], [-1.68, 1.03]], 1.78, 0.02);
export function makeCar(color, rand) {
  const g = new THREE.Group();
  const wheels = [];
  g.add(mesh(carBody, carPaint(color)));
  g.add(mesh(carGlass, darkGlass));
  g.add(mesh(new THREE.BoxGeometry(0.12, 0.2, 1.7), chassisMat, { x: 2.22, y: 0.42 }));
  g.add(mesh(new THREE.BoxGeometry(0.12, 0.2, 1.7), chassisMat, { x: -2.26, y: 0.42 }));
  for (const z of [-0.62, 0.62]) {
    g.add(mesh(new THREE.BoxGeometry(0.06, 0.12, 0.34), headMat, { x: 2.23, y: 0.72, z }));
    g.add(mesh(new THREE.BoxGeometry(0.06, 0.14, 0.36), tailMat, { x: -2.27, y: 0.8, z }));
  }
  addWheels(g, [1.35, -1.35], wheels, 0.76, 0.32, 0.22);
  g.scale.setScalar(0.95 + rand() * 0.1);
  return { group: g, wheels };
}

// --- Site loop traffic ------------------------------------------------------------------
export function createSiteTraffic(scene, { rect, bay }) {
  const curve = new THREE.CatmullRomCurve3(roundedRect(...rect, 12), true, 'centripetal');
  const length = curve.getLength();
  const road = mesh(roadRibbon(curve, 8, 260, true), mat('#ffffff', { map: roadTexture('site'), roughness: 0.95 }), { cast: false, receive: true });
  scene.add(road);

  // find the curve parameter nearest to the delivery bay
  let bayU = 0, best = Infinity;
  for (let i = 0; i < 400; i++) {
    const d = curve.getPointAt(i / 400).distanceTo(bay);
    if (d < best) { best = d; bayU = i / 400; }
  }

  const kinds = ['mixer', 'flatbed', 'dump', 'mixer'];
  const trucks = kinds.map((k, i) => {
    const t = makeTruck(k);
    scene.add(t.group);
    return { ...t, u: (bayU + 0.12 + i * 0.24) % 1, stop: 0, served: false, speed: 6 + (i % 2) * 1.2 };
  });

  const p = new THREE.Vector3(), tan = new THREE.Vector3(), right = new THREE.Vector3();
  function place(tr) {
    curve.getPointAt(tr.u, p);
    curve.getTangentAt(tr.u, tan);
    right.crossVectors(tan, UP).normalize();
    tr.group.position.set(p.x + right.x * 1.9, 0, p.z + right.z * 1.9);
    tr.group.rotation.y = Math.atan2(-tan.z, tan.x);
  }

  function update(dt) {
    const sorted = [...trucks].sort((a, b) => a.u - b.u);
    for (let i = 0; i < sorted.length; i++) {
      const tr = sorted[i];
      const ahead = sorted[(i + 1) % sorted.length];
      const gap = ((ahead.u - tr.u + 1) % 1) * length;
      let v = tr.speed;
      if (tr.stop > 0) {
        tr.stop -= dt;
        v = 0;
      } else {
        const toBay = ((bayU - tr.u + 1) % 1) * length;
        if (!tr.served && toBay < 0.6) { tr.stop = 3.5; tr.served = true; }
        if (toBay > 20) tr.served = false;
        v *= Math.min(1, 0.3 + toBay / 18);
        if (gap < 13) v *= Math.max(0, (gap - 10) / 3);
      }
      tr.u = (tr.u + (v * dt) / length) % 1;
      place(tr);
      for (const w of tr.wheels) w.rotation.z -= (v * dt) / 0.52;
      for (const s of tr.spin) s.rotation.x += dt * 1.6;
    }
  }
  trucks.forEach(place);
  return { update, curve, bayU };
}

// --- Avenue traffic -----------------------------------------------------------------------
export function createAvenue(scene, { z, rand }) {
  const len = 1400;
  const tex = roadTexture('avenue');
  tex.repeat.set(len / 12, 1);
  const avenue = mesh(new THREE.PlaneGeometry(len, 16).rotateX(-Math.PI / 2), mat('#ffffff', { map: tex, roughness: 0.9 }), { z, y: 0.05, cast: false, receive: true });
  scene.add(avenue);

  // kerbs and paved sidewalks either side
  const paver = groundTexture('siteRoad').clone();
  paver.needsUpdate = true;
  paver.repeat.set(len / 10, 1);
  const kerbs = mergeGeometries([-1, 1].map((s) => new THREE.BoxGeometry(len, 0.18, 0.3).translate(0, 0.09, z + s * 8.1)));
  scene.add(mesh(kerbs, mat('#b9b6ae'), { cast: false, receive: true }));
  for (const s of [-1, 1]) {
    scene.add(mesh(new THREE.PlaneGeometry(len, 4.5).rotateX(-Math.PI / 2), mat('#d2cdc3', { map: paver, roughness: 0.95 }), { z: z + s * 10.5, y: 0.15, cast: false, receive: true }));
  }

  // mostly white and silver, like the real traffic
  const colors = ['#F2F2EF', '#F2F2EF', '#F2F2EF', '#C9CCCF', '#C9CCCF', '#2A2C30', '#7C1F22', '#3A4C63', '#8E9296'];
  const cars = [];
  for (let i = 0; i < 18; i++) {
    const c = makeCar(colors[i % colors.length], rand);
    const dir = i % 2 ? 1 : -1;
    const lane = rand() < 0.5 ? 2.0 : 5.4;
    c.group.rotation.y = dir > 0 ? 0 : Math.PI;
    c.group.position.set(-len / 2 + rand() * len, 0.05, z + dir * lane);
    c.dir = dir;
    c.speed = 11 + rand() * 7;
    scene.add(c.group);
    cars.push(c);
  }
  function update(dt) {
    for (const c of cars) {
      c.group.position.x += c.dir * c.speed * dt;
      if (c.group.position.x > 420) c.group.position.x = -420;
      if (c.group.position.x < -420) c.group.position.x = 420;
      for (const w of c.wheels) w.rotation.z -= (c.speed * dt) / 0.32;
    }
  }
  return { update };
}
