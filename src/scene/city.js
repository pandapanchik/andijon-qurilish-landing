// Everything around the main tower: ground, district blocks, trees, lamps, the site itself,
// an excavator, clouds and birds. Distant blocks are merged into one draw call.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  mat, paint, steel, glass, canvasTexture, concreteMaterial, groundTexture, worldUV, fbm, mesh,
  rodGeometry, latticeGeometry, smooth, easeOut,
} from './kit.js';

// Muted render, brick and panel tones of Andijan housing blocks.
const BLOCK_COLORS = ['#DCD6CB', '#CEC6B7', '#C2B9AB', '#E4DFD6', '#B9B1A6', '#D3C6AF', '#AFA9A0', '#C9B39A'];

// One 12 m × 13.2 m tile of a panel block: 4 × 4 windows, glazed loggias, panel joints.
function windowTextures(rand) {
  const S = 256, cell = S / 4;
  const cells = Array.from({ length: 16 }, () => ({
    loggia: rand() < 0.35, curtain: rand() < 0.4, lit: rand() < 0.45, tv: rand() < 0.12, frame: rand() < 0.5,
  }));
  const each = (fn) => cells.forEach((c, i) => fn(c, (i % 4) * cell, ((i / 4) | 0) * cell));
  const map = canvasTexture(S, S, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, S, S);
    g.fillStyle = 'rgba(0,0,0,0.07)';
    for (let k = 0; k <= 4; k++) { g.fillRect(k * cell - 1, 0, 2, S); g.fillRect(0, k * cell - 1, S, 2); }
    each((c, x, y) => {
      if (c.loggia) {
        g.fillStyle = '#d9d4cb';
        g.fillRect(x + 4, y + 30, cell - 8, 30);
        g.fillStyle = c.frame ? '#e9e7e2' : '#8c6f52';
        g.fillRect(x + 4, y + 10, cell - 8, 22);
        g.fillStyle = '#3a434d';
        for (let k = 0; k < 4; k++) g.fillRect(x + 7 + k * 13.5, y + 12, 11, 18);
      } else {
        g.fillStyle = c.frame ? '#f1efe9' : '#8c6f52';
        g.fillRect(x + 14, y + 12, 36, 34);
        g.fillStyle = c.curtain ? '#b9a88f' : '#34404b';
        g.fillRect(x + 17, y + 15, 14, 28);
        g.fillRect(x + 33, y + 15, 14, 28);
        g.fillStyle = 'rgba(0,0,0,0.12)';
        g.fillRect(x + 12, y + 46, 40, 3); // sill shadow
      }
    });
    g.fillStyle = '#7d7a75'; // roof bitumen, sampled by the top faces
    g.fillRect(0, 0, 4, 4);
  }, { repeat: true });
  const emissive = canvasTexture(S, S, (g) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, S, S);
    each((c, x, y) => {
      if (!c.lit) return;
      g.fillStyle = c.tv ? '#8FA8E0' : c.curtain ? '#E8B070' : '#FFD49A';
      if (c.loggia) g.fillRect(x + 6, y + 12, cell - 12, 18);
      else g.fillRect(x + 17, y + 15, 30, 28);
    });
    g.fillStyle = '#000';
    g.fillRect(0, 0, 6, 6);
  }, { repeat: true });
  // glass is glossy, render is matte
  const orm = canvasTexture(S, S, (g) => {
    g.fillStyle = 'rgb(0,235,0)';
    g.fillRect(0, 0, S, S);
    each((c, x, y) => {
      g.fillStyle = 'rgb(0,40,60)';
      if (c.loggia) g.fillRect(x + 6, y + 12, cell - 12, 18);
      else g.fillRect(x + 17, y + 15, 30, 28);
    });
  }, { repeat: true, srgb: false });
  return { map, emissive, orm };
}

// Box with UVs scaled to metres so the window grid keeps a constant size on every block.
function blockGeometry(w, h, d, color) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const sizes = [[d, h], [d, h], [0, 0], [0, 0], [w, h], [w, h]];
  for (let face = 0; face < 6; face++) {
    const [su, sv] = sizes[face];
    for (let v = 0; v < 4; v++) {
      const i = face * 4 + v;
      if (su === 0) uv.setXY(i, 0.005, 0.995);
      else uv.setXY(i, (uv.getX(i) * su) / 12, (uv.getY(i) * sv) / 13.2);
    }
  }
  g.translate(0, h / 2, 0);
  const col = new THREE.Color(color);
  const colors = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < g.attributes.position.count; i++) col.toArray(colors, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

// Lumpy foliage: an icosphere pushed in and out by a few sine waves.
function crownGeometry(seed, lobes) {
  const parts = lobes.map(([x, y, z, r], k) => {
    const ico = new THREE.IcosahedronGeometry(r, 3);
    ico.deleteAttribute('uv');
    ico.deleteAttribute('normal'); // flat face normals would stop the vertices from welding
    const g = mergeVertices(ico);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
      const n = 1 + 0.16 * Math.sin(vx * 3.1 + seed + k) * Math.sin(vy * 2.7 + seed) + 0.1 * Math.sin(vz * 4.3 + vx * 2.1 + k);
      p.setXYZ(i, vx * n + x, vy * n + y, vz * n + z);
    }
    return g;
  });
  const g = mergeGeometries(parts);
  g.computeVertexNormals(); // vertices are shared, so the crowns shade smooth
  return g;
}

function cloudTexture() {
  const S = 128;
  const n = fbm(S, { octaves: 5, base: 3, seed: 77 });
  return canvasTexture(S, S, (g) => {
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const dx = (x - S / 2) / (S / 2), dy = (y - S / 2) / (S / 2);
        const fall = Math.max(0, 1 - Math.hypot(dx, dy * 1.3));
        const a = Math.max(0, Math.min(1, (n[y * S + x] - 0.42) * 3.2)) * fall * fall;
        const i = (y * S + x) * 4;
        const shade = 200 + 55 * (1 - Math.max(0, dy)); // undersides a touch darker
        img.data[i] = img.data[i + 1] = img.data[i + 2] = shade;
        img.data[i + 3] = a * 255;
      }
    }
    g.putImageData(img, 0, 0);
  });
}

export function createCity(scene, { rand, mobile }) {
  const nightMats = [];

  // ground: dusty urban ground, the site's compacted soil and the access road
  const urban = groundTexture('urban').clone();
  urban.needsUpdate = true;
  urban.repeat.set(110, 110);
  scene.add(mesh(new THREE.CircleGeometry(1400, 64).rotateX(-Math.PI / 2), mat('#ffffff', { map: urban, roughness: 1 }), { cast: false, receive: true }));
  const soil = groundTexture('soil').clone();
  soil.needsUpdate = true;
  soil.repeat.set(4, 3);
  scene.add(mesh(new THREE.PlaneGeometry(82, 62).rotateX(-Math.PI / 2), mat('#ffffff', { map: soil, roughness: 1 }), { y: 0.03, x: -3, z: -3, cast: false, receive: true }));
  const access = groundTexture('siteRoad').clone();
  access.needsUpdate = true;
  access.repeat.set(1, 2);
  scene.add(mesh(new THREE.PlaneGeometry(12, 22).rotateX(-Math.PI / 2), mat('#ffffff', { map: access, roughness: 0.95 }), { y: 0.04, z: 45, cast: false, receive: true }));

  // district blocks (merged)
  const { map, emissive, orm } = windowTextures(rand);
  const blockMat = mat('#ffffff', {
    map, emissiveMap: emissive, emissive: 0xffffff, emissiveIntensity: 0.1, vertexColors: true,
    roughnessMap: orm, metalnessMap: orm, roughness: 1, metalness: 1,
  });
  nightMats.push({ mat: blockMat, base: 0.04, night: 1.1 });
  const parts = [];
  const step = mobile ? 34 : 28;
  for (let x = -300; x <= 300; x += step) {
    for (let z = -320; z <= 220; z += step) {
      if (Math.abs(x) < 70 && z > -62 && z < 50) continue;
      if (z > 36 && z < 82) continue;
      if (z > 30 && Math.abs(x) < 170) continue;
      if (x > 80 && x < 140 && z > -120 && z < -50) continue;
      if (x > -150 && x < -50 && z > -170 && z < -90) continue;
      if (rand() < 0.18) continue;
      const dist = Math.hypot(x, z);
      // Soviet slabs are long and low; a few newer towers stand taller further out
      const long = rand() < 0.5;
      const w = long ? 22 + rand() * 6 : 11 + rand() * 6, d = long ? 11 + rand() * 2 : 11 + rand() * 6;
      const h = Math.round((rand() < 0.75 ? 13.2 + rand() * 16 : 20 + rand() * (dist < 140 ? 16 : 40)) / 3.3) * 3.3;
      const geo = blockGeometry(w, h, d, BLOCK_COLORS[Math.floor(rand() * BLOCK_COLORS.length)]);
      if (rand() < 0.5) geo.rotateY(Math.PI / 2);
      parts.push(geo.translate(x + (rand() - 0.5) * 8, 0, z + (rand() - 0.5) * 8));
    }
  }
  const blocks = mesh(mergeGeometries(parts), blockMat, { receive: true });
  scene.add(blocks);

  // blocks that rise as the visitor scrolls ("the city grows")
  const rising = [];
  const riseSpots = [[-130, -150], [-100, -120], [-72, -150], [-130, -110], [-80, -105]];
  riseSpots.forEach(([x, z], i) => {
    const h = Math.round((24 + rand() * 30) / 3.3) * 3.3;
    const m = mesh(blockGeometry(14, h, 14, BLOCK_COLORS[(i + 2) % BLOCK_COLORS.length]), blockMat, { x, z, receive: true });
    m.scale.y = 0.001;
    m.visible = false;
    scene.add(m);
    rising.push({ m, delay: i * 0.12 });
  });

  // trees: columnar poplars (terak) and broad plane trees (chinor), autumn-tinged
  const treeCount = mobile ? 70 : 170;
  const leaf = mat('#ffffff', { roughness: 0.95 });
  const broad = new THREE.InstancedMesh(crownGeometry(1, [[0, 0, 0, 1.6], [0.9, 0.5, 0.3, 1.2], [-0.8, 0.4, -0.4, 1.25], [0, 1.1, 0, 1.1]]), leaf, treeCount);
  const poplar = new THREE.InstancedMesh(crownGeometry(2, [[0, 0, 0, 1]]), leaf, treeCount);
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.26, 1, 6).translate(0, 0.5, 0), mat('#5b4e44', { roughness: 1 }), treeCount);
  broad.castShadow = poplar.castShadow = trunks.castShadow = true;
  const greens = ['#4b6236', '#566c3a', '#43592f', '#66733d', '#7d7a37', '#8f7f33'].map((c) => new THREE.Color(c));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  let nb = 0, np = 0;
  for (let i = 0; i < treeCount; i++) {
    let x, z;
    const alongAvenue = i < treeCount * 0.55;
    if (alongAvenue) {
      x = -380 + (i / (treeCount * 0.55)) * 760 + rand() * 4;
      z = 56 + (i % 2 ? 14.5 : -14.5);
    } else {
      const a = rand() * Math.PI * 2, r = 70 + rand() * 40;
      x = Math.cos(a) * r;
      z = Math.sin(a) * r * 0.75 - 10;
      if (z > 36 && z < 76) z = 100 + rand() * 30;
    }
    const isPoplar = alongAvenue ? (i % 4 < 2) : rand() < 0.35;
    const sc = 0.85 + rand() * 0.4;
    q.setFromEuler(new THREE.Euler(0, rand() * 6, 0));
    const color = greens[Math.floor(rand() * greens.length)];
    if (isPoplar) {
      const h = 15 * sc;
      p.set(x, h * 0.55, z); s.set(1.3 * sc, h * 0.42, 1.3 * sc);
      poplar.setMatrixAt(np, m4.compose(p, q, s));
      poplar.setColorAt(np++, color);
      p.set(x, 0, z); s.set(sc, h * 0.3, sc);
    } else {
      p.set(x, 5.2 * sc, z); s.set(1.5 * sc, 1.25 * sc, 1.5 * sc);
      broad.setMatrixAt(nb, m4.compose(p, q, s));
      broad.setColorAt(nb++, color);
      p.set(x, 0, z); s.set(sc * 1.2, 4.2 * sc, sc * 1.2);
    }
    trunks.setMatrixAt(i, m4.compose(p, q, s));
  }
  for (let i = nb; i < treeCount; i++) broad.setMatrixAt(i, hidden);
  for (let i = np; i < treeCount; i++) poplar.setMatrixAt(i, hidden);
  broad.count = nb;
  poplar.count = np;
  scene.add(broad, poplar, trunks);

  // street lamps along the avenue: tapered pole, outreach arm, flat LED head
  const lampCount = 28;
  const poleGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.08, 0.14, 8.5, 8).translate(0, 4.25, 0),
    rodGeometry(new THREE.Vector3(0, 8.3, 0), new THREE.Vector3(0, 8.6, 1.8), 0.05, 6),
  ]);
  const poles = new THREE.InstancedMesh(poleGeo, steel('#7b8086', { roughness: 0.55 }), lampCount);
  const bulbMat = new THREE.MeshBasicMaterial({ color: '#4a4a4c' });
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.4, 0.12, 0.8).translate(0, 8.55, 2.1), steel('#55595e'), lampCount);
  const bulbs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.04, 0.6).translate(0, 8.48, 2.1), bulbMat, lampCount);
  for (let i = 0; i < lampCount; i++) {
    const x = -300 + (i >> 1) * 44, side = i % 2 ? 1 : -1, z = 56 + side * 9.5;
    m4.makeRotationY(side > 0 ? Math.PI : 0).setPosition(x, 0, z);
    poles.setMatrixAt(i, m4);
    heads.setMatrixAt(i, m4);
    bulbs.setMatrixAt(i, m4);
  }
  poles.castShadow = true;
  scene.add(poles, heads, bulbs);

  // ---- construction site props ------------------------------------------------------
  const site = new THREE.Group();
  scene.add(site);

  // profiled-sheet hoarding (profnastil) with printed banners, as Uzbek sites have
  const fenceTex = canvasTexture(512, 128, (g, w, h) => {
    for (let x = 0; x < w; x += 8) {
      const grd = g.createLinearGradient(x, 0, x + 8, 0);
      grd.addColorStop(0, '#2c5a86'); grd.addColorStop(0.5, '#3a6d9c'); grd.addColorStop(1, '#264f77');
      g.fillStyle = grd;
      g.fillRect(x, 0, 8, h);
    }
    g.fillStyle = '#F2F0EA';
    g.fillRect(w * 0.06, h * 0.2, w * 0.62, h * 0.5);
    g.fillStyle = '#E8A912';
    g.fillRect(w * 0.06, h * 0.64, w * 0.62, h * 0.06);
    g.fillStyle = '#1B1D45';
    g.font = '800 26px Unbounded, Arial Black, sans-serif';
    g.textBaseline = 'middle';
    g.fillText('ANDIJON QURILISH', w * 0.09, h * 0.42);
    g.fillStyle = 'rgba(60,50,40,0.35)'; // road dust along the bottom
    g.fillRect(0, h * 0.9, w, h * 0.1);
  }, { repeat: true });
  const fenceNormal = canvasTexture(64, 8, (g) => {
    for (let x = 0; x < 64; x++) {
      const t = Math.sin((x / 8) * Math.PI * 2);
      g.fillStyle = `rgb(${Math.round(128 + t * 90)},128,230)`;
      g.fillRect(x, 0, 1, 8);
    }
  }, { repeat: true, srgb: false });
  fenceNormal.repeat.set(8, 1);
  const fenceMat = paint('#ffffff', { map: fenceTex, normalMap: fenceNormal, roughness: 0.55, metalness: 0.3 });
  const postMat = steel('#4a4f55');
  const fence = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const geo = new THREE.BoxGeometry(len, 2.4, 0.06);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (len / 10));
    const f = mesh(geo, fenceMat, { x: (x0 + x1) / 2, z: (z0 + z1) / 2, y: 1.2 });
    f.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
    site.add(f);
    const posts = [];
    for (let t = 0; t <= len; t += 2.5) {
      posts.push(new THREE.BoxGeometry(0.08, 2.5, 0.08).translate(x0 + ((x1 - x0) * t) / len, 1.25, z0 + ((z1 - z0) * t) / len));
    }
    site.add(mesh(mergeGeometries(posts), postMat));
  };
  fence(-40, 27, -8, 27); fence(8, 27, 36, 27); fence(36, 27, 36, -33); fence(36, -33, -40, -33);
  fence(-40, -33, -40, 0); fence(-40, 12, -40, 27);

  // site offices: stacked container modules with frames, windows, doors and a stair
  const ribs = canvasTexture(128, 64, (g, w, h) => {
    for (let x = 0; x < w; x += 6) {
      g.fillStyle = (x / 6) % 2 ? '#e9e9e4' : '#d6d6d0';
      g.fillRect(x, 0, 6, h);
    }
  }, { repeat: true });
  ribs.repeat.set(3, 1);
  const cabinMat = paint('#ffffff', { map: ribs, roughness: 0.5 });
  const frameMat = paint('#1F4E8C', { roughness: 0.5 });
  const winMat = glass('#2b3640');
  const doorMat = paint('#b6bcc2');
  for (const [x, y, z] of [[27, 0, -22], [27, 2.75, -22], [27, 0, -14]]) {
    site.add(mesh(new THREE.BoxGeometry(6.0, 2.6, 2.45), cabinMat, { x, y: y + 1.3, z, receive: true }));
    const fr = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) fr.push(new THREE.BoxGeometry(0.16, 2.7, 0.16).translate(x + sx * 3, y + 1.35, z + sz * 1.22));
    for (const yy of [0.08, 2.62]) for (const sz of [-1, 1]) fr.push(new THREE.BoxGeometry(6.1, 0.16, 0.16).translate(x, y + yy, z + sz * 1.22));
    site.add(mesh(mergeGeometries(fr), frameMat));
    site.add(mesh(new THREE.BoxGeometry(0.9, 2.0, 0.06), doorMat, { x: x - 2, y: y + 1.1, z: z + 1.25 }));
    for (const wx of [0.2, 1.9]) site.add(mesh(new THREE.BoxGeometry(1.2, 0.9, 0.06), winMat, { x: x + wx, y: y + 1.55, z: z + 1.25 }));
  }
  const stair = mesh(new THREE.BoxGeometry(3.6, 0.1, 0.9), steel('#5a5f66', { roughness: 0.7 }), { x: 22.6, y: 1.45, z: -20.35 });
  stair.rotation.z = 0.68;
  site.add(stair);

  // material stacks at the delivery bay: brick pallets, steel pipes, formwork panels
  const brickTex = canvasTexture(128, 128, (g) => {
    g.fillStyle = '#8f8a82';
    g.fillRect(0, 0, 128, 128);
    for (let r = 0; r < 8; r++) {
      for (let c = -1; c < 4; c++) {
        g.fillStyle = `rgb(${150 + ((r * 7 + c * 13) % 5) * 8},${72 + ((r + c) % 3) * 6},54)`;
        g.fillRect(c * 40 + (r % 2) * 20 + 2, r * 16 + 2, 36, 12);
      }
    }
  });
  const brick = mat('#ffffff', { map: brickTex, roughness: 0.4 }); // shrink-wrapped
  const pallet = mat('#9b7a54');
  for (let i = 0; i < 6; i++) {
    const x = -36 + (i % 3) * 1.6, z = 2 + (i / 3 | 0) * 1.4;
    site.add(mesh(new THREE.BoxGeometry(1.25, 0.14, 1.05), pallet, { x, z, y: 0.07 }));
    site.add(mesh(new THREE.BoxGeometry(1.15, 1.0, 0.95), brick, { x, z, y: 0.64 }));
  }
  const pipeGeo = new THREE.CylinderGeometry(0.35, 0.35, 8, 16, 1, true).rotateZ(Math.PI / 2);
  const pipeMat = steel('#6c645b', { roughness: 0.75, metalness: 0.7, side: THREE.DoubleSide });
  for (let i = 0; i < 5; i++) {
    const row = i < 3 ? 0 : 1;
    site.add(mesh(pipeGeo, pipeMat, { x: -29, z: 14 + (row ? 0.36 : 0) + (i - row * 3) * 0.72, y: 0.35 + row * 0.62 }));
  }
  for (const x of [-32, -26]) site.add(mesh(new THREE.BoxGeometry(0.2, 0.15, 3), pallet, { x, z: 14.7, y: 0.02 }));
  const formStack = paint('#E2B21C', { roughness: 0.6 });
  for (let k = 0; k < 8; k++) site.add(mesh(new THREE.BoxGeometry(2.7, 0.12, 1.35), formStack, { x: -34, z: 9, y: 0.06 + k * 0.13 }));

  // traffic cones with reflective collars
  const coneTex = canvasTexture(16, 64, (g) => {
    g.fillStyle = '#F0561C';
    g.fillRect(0, 0, 16, 64);
    g.fillStyle = '#F4F4F0';
    g.fillRect(0, 18, 16, 10);
    g.fillRect(0, 36, 16, 8);
  });
  const coneMat = mat('#ffffff', { map: coneTex, roughness: 0.5 });
  const coneBase = mat('#1f2022');
  for (let i = 0; i < 7; i++) {
    site.add(mesh(new THREE.ConeGeometry(0.2, 0.75, 14, 1, true), coneMat, { x: -6 + i * 2, z: 29.5, y: 0.42 }));
    site.add(mesh(new THREE.BoxGeometry(0.42, 0.05, 0.42), coneBase, { x: -6 + i * 2, z: 29.5, y: 0.03 }));
  }

  // excavation pit and spoil heap
  const pitSoil = groundTexture('soil').clone();
  pitSoil.needsUpdate = true;
  scene.add(mesh(new THREE.CircleGeometry(6, 32).rotateX(-Math.PI / 2), mat('#6e5a49', { map: pitSoil, roughness: 1 }), { x: 23, z: 6, y: 0.07, cast: false, receive: true }));
  const heap = new THREE.SphereGeometry(4, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const hp = heap.attributes.position;
  for (let i = 0; i < hp.count; i++) {
    const x = hp.getX(i), y = hp.getY(i), z = hp.getZ(i);
    const n = 1 + 0.12 * Math.sin(x * 2.3 + z * 1.7) + 0.07 * Math.sin(z * 4.1 - x * 3.3);
    hp.setXYZ(i, x * n, y * n, z * n);
  }
  heap.computeVertexNormals();
  const mound = mesh(heap, mat('#ffffff', { map: soil, roughness: 1 }), { x: 14, z: 12, receive: true });
  mound.scale.y = 0.5;
  scene.add(mound);

  // excavator: tracked undercarriage, slewing house, cab, boom, stick and toothed bucket
  const exc = new THREE.Group();
  exc.position.set(20, 0, 14);
  scene.add(exc);
  const cat = paint('#E3A512', { roughness: 0.5 });
  const trackMat = steel('#2a2b2d', { roughness: 0.85, metalness: 0.5 });
  const trackShape = new THREE.Shape();
  trackShape.moveTo(-1.9, 0); trackShape.lineTo(1.9, 0);
  trackShape.absarc(1.9, 0.48, 0.48, -Math.PI / 2, Math.PI / 2, false);
  trackShape.lineTo(-1.9, 0.96);
  trackShape.absarc(-1.9, 0.48, 0.48, Math.PI / 2, Math.PI * 1.5, false);
  const trackGeo = new THREE.ExtrudeGeometry(trackShape, { depth: 0.65, bevelEnabled: false, curveSegments: 8 }).translate(0, 0, -0.325);
  exc.add(mesh(trackGeo, trackMat, { z: 1.25 }), mesh(trackGeo, trackMat, { z: -1.25 }));
  exc.add(mesh(new THREE.BoxGeometry(3, 0.5, 1.9), trackMat, { y: 0.6 }));
  const body = new THREE.Group();
  body.position.y = 1.15;
  exc.add(body);
  body.add(mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.3, 18), trackMat, { y: 0.1 }));
  body.add(mesh(new THREE.BoxGeometry(3.2, 1.2, 2.5), cat, { y: 0.85, x: -0.6 }));
  body.add(mesh(new THREE.BoxGeometry(0.7, 1.0, 2.5), paint('#2b2c2e'), { y: 0.8, x: -2.45 })); // counterweight
  body.add(mesh(new THREE.BoxGeometry(1.2, 0.05, 1.0), steel('#3a3c3f'), { y: 1.47, x: -1.4, z: -0.5 })); // engine grille
  const excCab = new THREE.Group();
  excCab.position.set(0.55, 1.45, 0.65);
  excCab.add(mesh(new THREE.BoxGeometry(1.25, 1.55, 1.0), cat, { y: 0.77 }));
  excCab.add(mesh(new THREE.BoxGeometry(1.0, 1.2, 1.02), glass('#26313b'), { y: 0.85, x: 0.13 }));
  excCab.add(mesh(new THREE.BoxGeometry(0.04, 1.2, 0.85), glass('#26313b'), { x: 0.64, y: 0.85 }));
  body.add(excCab);
  const boom = new THREE.Group();
  boom.position.set(0.8, 1.1, -0.45);
  body.add(boom);
  const boomShape = new THREE.Shape();
  boomShape.moveTo(0, -0.3); boomShape.lineTo(2.6, 0.2); boomShape.lineTo(5.3, -0.25);
  boomShape.lineTo(5.3, 0.25); boomShape.lineTo(2.6, 0.75); boomShape.lineTo(0, 0.3);
  boom.add(mesh(new THREE.ExtrudeGeometry(boomShape, { depth: 0.5, bevelEnabled: false }).translate(0, 0, -0.25), cat));
  boom.add(mesh(rodGeometry(new THREE.Vector3(0.3, -0.5, 0), new THREE.Vector3(2.4, 0.0, 0), 0.11, 10), cat));
  boom.add(mesh(rodGeometry(new THREE.Vector3(2.4, 0.0, 0), new THREE.Vector3(3.2, 0.15, 0), 0.06, 8), steel('#d6d9dc', { roughness: 0.15 })));
  const stick = new THREE.Group();
  stick.position.x = 5.2;
  boom.add(stick);
  const stickShape = new THREE.Shape();
  stickShape.moveTo(-0.25, 0.3); stickShape.lineTo(0.25, 0.3); stickShape.lineTo(0.15, -3.0); stickShape.lineTo(-0.15, -3.0);
  stick.add(mesh(new THREE.ExtrudeGeometry(stickShape, { depth: 0.42, bevelEnabled: false }).translate(0, 0, -0.21), cat));
  const bucket = new THREE.Group();
  bucket.position.y = -3.0;
  stick.add(bucket);
  const bucketShape = new THREE.Shape();
  bucketShape.moveTo(0, 0); bucketShape.quadraticCurveTo(-0.9, -0.2, -0.7, -1.0); bucketShape.lineTo(0.5, -0.9);
  bucketShape.quadraticCurveTo(0.3, -0.4, 0.3, 0);
  bucket.add(mesh(new THREE.ExtrudeGeometry(bucketShape, { depth: 1.0, bevelEnabled: false, curveSegments: 6 }).translate(0, 0, -0.5), paint('#3a3b3d', { roughness: 0.7 })));
  const teeth = [];
  for (let k = 0; k < 5; k++) teeth.push(new THREE.ConeGeometry(0.06, 0.25, 4).rotateZ(Math.PI / 2 + 0.3).translate(0.6, -0.92, -0.4 + k * 0.2));
  bucket.add(mesh(mergeGeometries(teeth), steel('#8a8d90')));
  body.rotation.y = -0.6;

  // lighting towers with LED heads; floods light the tower at night
  const headOn = new THREE.MeshBasicMaterial({ color: '#4a4a4c' });
  const floodLights = [];
  const beams = [];
  const beamTex = canvasTexture(4, 64, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 64);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 4, 64);
  }, { srgb: false });
  const beamMat = new THREE.MeshBasicMaterial({
    color: '#FFE2B0', alphaMap: beamTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
  const mastSq = [[-0.25, -0.25], [0.25, -0.25], [0.25, 0.25], [-0.25, 0.25]];
  for (const [x, z] of [[-30, 22], [30, 22], [-30, -28]]) {
    site.add(mesh(latticeGeometry(9, mastSq, { step: 1, chord: 0.04, brace: 0.018 }), steel('#9ba1a7'), { x, z }));
    const target = new THREE.Vector3(0, 30, 0);
    const headGroup = new THREE.Group();
    headGroup.position.set(x, 9.3, z);
    headGroup.lookAt(target);
    for (const [hx, hy] of [[-0.5, 0.3], [0.5, 0.3], [-0.5, -0.3], [0.5, -0.3]]) {
      headGroup.add(mesh(new THREE.BoxGeometry(0.85, 0.5, 0.2), steel('#3a3d41'), { x: hx, y: hy }));
      headGroup.add(mesh(new THREE.PlaneGeometry(0.7, 0.38), headOn, { x: hx, y: hy, z: 0.11, cast: false }));
    }
    site.add(headGroup);
    const spot = new THREE.SpotLight('#FFE2B0', 0, 140, 0.32, 0.6, 1.2);
    spot.position.set(x, 9.3, z);
    spot.target.position.copy(target);
    scene.add(spot, spot.target);
    floodLights.push(spot);
    const from = new THREE.Vector3(x, 9.3, z);
    const to = new THREE.Vector3(0, 46, 0);
    const len = from.distanceTo(to);
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 0.5, len, 24, 1, true), beamMat);
    cone.position.copy(from).lerp(to, 0.5);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    scene.add(cone);
    beams.push(cone);
  }
  site.traverse((o) => { if (o.isMesh && o.castShadow !== false) o.castShadow = true; });

  // clouds: soft billboards lit warm from below by the low sun
  const cloudTex = cloudTexture();
  const cloudMats = [];
  const clouds = [];
  for (let i = 0; i < (mobile ? 6 : 11); i++) {
    const c = new THREE.Group();
    const n = 5 + Math.floor(rand() * 4);
    const cm = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false, opacity: 0.75 });
    cloudMats.push(cm);
    for (let k = 0; k < n; k++) {
      const sp = new THREE.Sprite(cm);
      const r = 40 + rand() * 50;
      sp.scale.set(r * 1.8, r * 0.7, 1);
      sp.position.set(k * 26 - n * 13 + rand() * 10, rand() * 10, rand() * 20);
      c.add(sp);
    }
    c.position.set(-700 + rand() * 1400, 230 + rand() * 140, -560 - rand() * 300);
    c.userData.v = 1.5 + rand() * 2;
    scene.add(c);
    clouds.push(c);
  }

  // a flock of small birds circling the tower
  const birdMat = mat('#24252a', { side: THREE.DoubleSide });
  const wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -0.3, 0, 0.9, 0.35, 0, 0.25], 3));
  wingGeo.computeVertexNormals();
  const birds = [];
  for (let i = 0; i < 9; i++) {
    const b = new THREE.Group();
    const l = new THREE.Mesh(wingGeo, birdMat);
    const r = new THREE.Mesh(wingGeo, birdMat);
    r.scale.z = -1;
    b.add(l, r);
    b.userData = { l, r, phase: rand() * 6, radius: 70 + i * 4, h: 96 + rand() * 14, off: i * 0.07 };
    scene.add(b);
    birds.push(b);
  }

  const dayCloud = new THREE.Color('#FFD9C4'), nightCloud = new THREE.Color('#2E3554');
  const lampOff = new THREE.Color('#4a4a4c'), lampOn = new THREE.Color('#FFE3B0');
  const floodOn = new THREE.Color('#FFF3DA');

  function update(dt, time, { night, grow, reduced }) {
    for (const { mat: m, base, night: n } of nightMats) m.emissiveIntensity = base + (n - base) * night;
    const lampsOn = smooth(0.15, 0.6, night);
    bulbMat.color.copy(lampOff).lerp(lampOn, lampsOn);
    headOn.color.copy(lampOff).lerp(floodOn, smooth(0.3, 0.8, night));
    for (const l of floodLights) l.intensity = smooth(0.3, 0.8, night) * 1700;
    beamMat.opacity = smooth(0.35, 0.9, night) * 0.045;
    for (const cm of cloudMats) {
      cm.color.copy(dayCloud).lerp(nightCloud, night);
      cm.opacity = 0.75 - night * 0.35;
    }

    rising.forEach(({ m, delay }) => {
      const g = smooth(delay, delay + 0.5, grow);
      m.visible = g > 0;
      m.scale.y = Math.max(0.001, easeOut(g));
    });

    if (reduced) return;
    for (const c of clouds) {
      c.position.x += c.userData.v * dt;
      if (c.position.x > 620) c.position.x = -620;
    }
    for (const b of birds) {
      const u = b.userData;
      const a = time * 0.12 + u.off;
      b.position.set(Math.cos(a) * u.radius, u.h + Math.sin(time * 0.7 + u.phase) * 2, Math.sin(a) * u.radius * 0.8);
      b.rotation.y = -a - Math.PI;
      const flap = Math.sin(time * 11 + u.phase) * 0.7;
      u.l.rotation.x = flap;
      u.r.rotation.x = -flap;
    }
    body.rotation.y = -0.6 + Math.sin(time * 0.4) * 0.7;
    boom.rotation.z = 0.05 + Math.sin(time * 0.8) * 0.22;
    stick.rotation.z = -0.5 + Math.sin(time * 0.8 + 1) * 0.35;
    bucket.rotation.z = Math.sin(time * 0.8 + 2) * 0.5;
  }

  return { update };
}
