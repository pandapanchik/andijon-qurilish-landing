// Cartoon trucks that loop around the site and stop at the delivery bay, plus avenue traffic.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toon, mesh, canvasTexture } from './kit.js';

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

// Flat road ribbon following a curve, with a dashed centre line baked into the texture.
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

export function roadMaterial() {
  const tex = canvasTexture(128, 128, (g) => {
    g.fillStyle = '#3A3A52';
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#2F2F45';
    g.fillRect(0, 0, 128, 8);
    g.fillRect(0, 120, 128, 8);
    g.fillStyle = '#F4C542';
    g.fillRect(10, 60, 70, 8);
  }, { repeat: true });
  return toon('#ffffff', { map: tex });
}

// --- Vehicle builders --------------------------------------------------------------------
const wheelGeo = new THREE.CylinderGeometry(0.75, 0.75, 0.6, 14).rotateX(Math.PI / 2);
const hubGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.64, 8).rotateX(Math.PI / 2);
const tyre = toon('#24253A');
const hub = toon('#D9D3C8');

function addWheels(g, xs, wheels, halfW = 1.2) {
  for (const x of xs) {
    for (const z of [-halfW, halfW]) {
      const w = new THREE.Group();
      w.add(mesh(wheelGeo, tyre), mesh(hubGeo, hub));
      w.position.set(x, 0.75, z);
      g.add(w);
      wheels.push(w);
    }
  }
}

function cab(g, color, x) {
  g.add(mesh(new RoundedBoxGeometry(2.4, 2.5, 2.6, 3, 0.5), toon(color), { x, y: 2.15 }));
  g.add(mesh(new RoundedBoxGeometry(0.2, 1, 2.2, 2, 0.08), toon('#8CC8F0'), { x: x + 1.15, y: 2.6 }));
  g.add(mesh(new THREE.BoxGeometry(0.3, 0.4, 0.5), toon('#FFE9A8', { emissive: '#FFB84D', emissiveIntensity: 0.4 }), { x: x + 1.2, y: 1.3, z: 0.9 }));
  g.add(mesh(new THREE.BoxGeometry(0.3, 0.4, 0.5), toon('#FFE9A8', { emissive: '#FFB84D', emissiveIntensity: 0.4 }), { x: x + 1.2, y: 1.3, z: -0.9 }));
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.25, 0.9), toon('#FF8A1F', { emissive: '#FF8A1F', emissiveIntensity: 0.6 }), { x: x - 0.2, y: 3.5 }));
}

export function makeTruck(kind) {
  const g = new THREE.Group();
  const wheels = [];
  const spin = [];
  g.add(mesh(new THREE.BoxGeometry(7.2, 0.5, 2.2), toon('#2B2D52'), { y: 1.05 }));

  if (kind === 'mixer') {
    cab(g, '#FF5E1F', 2.4);
    const prof = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      prof.push(new THREE.Vector2(0.4 + Math.sin(t * Math.PI) * 1.2 + t * 0.2, t * 4.4 - 2.2));
    }
    const drumGeo = new THREE.LatheGeometry(prof, 14).rotateZ(Math.PI / 2 + 0.18);
    const drum = mesh(drumGeo, toon('#F1ECE4', { side: THREE.DoubleSide }), { x: -1.2, y: 2.6 });
    const stripe = mesh(new THREE.TorusGeometry(1.45, 0.14, 6, 18).rotateY(Math.PI / 2), toon('#FF5E1F'), { x: -1.2, y: 2.6 });
    const drumGroup = new THREE.Group();
    drumGroup.add(drum, stripe);
    g.add(drumGroup);
    spin.push(drum);
    addWheels(g, [2.4, -0.8, -2.6], wheels);
  } else if (kind === 'flatbed') {
    cab(g, '#FFC21A', 2.4);
    g.add(mesh(new THREE.BoxGeometry(4.8, 0.3, 2.4), toon('#5B5E85'), { x: -1.2, y: 1.45 }));
    const red = toon('#D8472B');
    for (let i = 0; i < 3; i++) g.add(mesh(new THREE.BoxGeometry(5.2, 0.45, 0.5), red, { x: -1.2, y: 1.85 + (i === 2 ? 0.45 : 0), z: i === 2 ? 0 : (i - 0.5) * 0.9 }));
    addWheels(g, [2.4, -2.4], wheels);
  } else {
    cab(g, '#4FB0A5', 2.4);
    g.add(mesh(new THREE.BoxGeometry(4.6, 1.8, 2.5), toon('#FFC21A'), { x: -1.3, y: 2.2 }));
    const sand = mesh(new THREE.SphereGeometry(1.6, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), toon('#E2B66E'), { x: -1.3, y: 3.05 });
    sand.scale.set(1.35, 0.55, 0.7);
    g.add(sand);
    addWheels(g, [2.4, -1.6, -3], wheels);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group: g, wheels, spin };
}

export function makeCar(color, rand) {
  const g = new THREE.Group();
  const wheels = [];
  g.add(mesh(new RoundedBoxGeometry(4.2, 1.1, 2, 3, 0.4), toon(color), { y: 1.1 }));
  g.add(mesh(new RoundedBoxGeometry(2.3, 0.9, 1.8, 3, 0.35), toon(color), { y: 1.9, x: -0.3 }));
  g.add(mesh(new THREE.BoxGeometry(2.2, 0.6, 1.84), toon('#8CC8F0'), { y: 1.95, x: -0.3 }));
  const lights = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.3, 1.5), new THREE.MeshBasicMaterial({ color: '#FFF1C2' }));
  lights.position.set(2.1, 1.2, 0);
  g.add(lights);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.3, 1.5), new THREE.MeshBasicMaterial({ color: '#FF4040' }));
  back.position.set(-2.1, 1.2, 0);
  g.add(back);
  for (const x of [1.3, -1.3]) {
    for (const z of [-0.9, 0.9]) {
      const w = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.4, 10).rotateX(Math.PI / 2), tyre, { x, z, y: 0.5 });
      g.add(w);
      wheels.push(w);
    }
  }
  g.scale.setScalar(0.9 + rand() * 0.2);
  return { group: g, wheels };
}

// --- Site loop traffic ------------------------------------------------------------------
export function createSiteTraffic(scene, { rect, bay }) {
  const curve = new THREE.CatmullRomCurve3(roundedRect(...rect, 12), true, 'centripetal');
  const length = curve.getLength();
  const road = mesh(roadRibbon(curve, 8, 260, true), roadMaterial(), { cast: false, receive: true });
  scene.add(road);

  // find the curve parameter nearest to the delivery bay
  let bayU = 0, best = Infinity;
  for (let i = 0; i < 400; i++) {
    const d = curve.getPointAt(i / 400).distanceTo(bay);
    if (d < best) { best = d; bayU = i / 400; }
  }

  const kinds = ['mixer', 'flatbed', 'dump', 'flatbed', 'mixer'];
  const trucks = kinds.map((k, i) => {
    const t = makeTruck(k);
    scene.add(t.group);
    return { ...t, u: (bayU + 0.12 + i * 0.19) % 1, stop: 0, served: false, speed: 9 + (i % 2) * 1.5 };
  });

  const p = new THREE.Vector3(), tan = new THREE.Vector3(), right = new THREE.Vector3();
  function place(tr) {
    curve.getPointAt(tr.u, p);
    curve.getTangentAt(tr.u, tan);
    right.crossVectors(tan, UP).normalize();
    tr.group.position.set(p.x + right.x * 1.9, 0, p.z + right.z * 1.9);
    tr.group.rotation.y = Math.atan2(-tan.z, tan.x);
  }

  function update(dt, time) {
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
        if (!tr.served && toBay < 0.6) { tr.stop = 2.8; tr.served = true; }
        if (toBay > 20) tr.served = false;
        v *= Math.min(1, 0.35 + toBay / 18);
        if (gap < 12) v *= Math.max(0, (gap - 9) / 3);
      }
      tr.u = (tr.u + (v * dt) / length) % 1;
      place(tr);
      for (const w of tr.wheels) w.rotation.z -= (v * dt) / 0.75;
      for (const s of tr.spin) s.rotation.x += dt * 2.4;
      tr.group.position.y = v > 0.5 ? Math.abs(Math.sin(time * 14 + tr.u * 40)) * 0.06 : 0;
    }
  }
  trucks.forEach(place);
  return { update, curve, bayU };
}

// --- Avenue traffic -----------------------------------------------------------------------
export function createAvenue(scene, { z, rand }) {
  const len = 1400;
  const avenue = mesh(new THREE.PlaneGeometry(len, 16).rotateX(-Math.PI / 2), roadMaterial(), { z, y: 0.05, cast: false, receive: true });
  avenue.material.map = avenue.material.map.clone();
  avenue.material.map.repeat.set(len / 8, 1);
  avenue.material.map.needsUpdate = true;
  scene.add(avenue);

  const colors = ['#E9573F', '#4FB0A5', '#F6BB42', '#5D9CEC', '#F1ECE4', '#AC92EC', '#ED5565'];
  const cars = [];
  for (let i = 0; i < 16; i++) {
    const c = makeCar(colors[i % colors.length], rand);
    const dir = i % 2 ? 1 : -1;
    c.group.rotation.y = dir > 0 ? 0 : Math.PI;
    c.group.position.set(-len / 2 + rand() * len, 0, z + dir * 3.6);
    c.dir = dir;
    c.speed = 14 + rand() * 10;
    scene.add(c.group);
    cars.push(c);
  }
  function update(dt) {
    for (const c of cars) {
      c.group.position.x += c.dir * c.speed * dt;
      if (c.group.position.x > 420) c.group.position.x = -420;
      if (c.group.position.x < -420) c.group.position.x = 420;
      for (const w of c.wheels) w.rotation.z -= (c.speed * dt) / 0.5;
    }
  }
  return { update };
}
