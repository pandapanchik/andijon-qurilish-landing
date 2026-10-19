// Everything around the main tower: ground, district blocks, trees, lamps, the site itself,
// an excavator, clouds and birds. Distant blocks are merged into one draw call.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toon, mesh, canvasTexture, rod, smooth, easeOutBack } from './kit.js';

const BLOCK_COLORS = ['#C99F9A', '#8E80AE', '#D7B08E', '#7D8BB4', '#B88C86', '#9AA6C9', '#CDB7A6'];

function windowTextures(rand) {
  const draw = (lit) => (g) => {
    g.fillStyle = lit ? '#000' : '#ffffff';
    g.fillRect(0, 0, 128, 128);
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const on = rand() < 0.5;
        if (lit && !on) continue;
        g.fillStyle = lit ? (rand() < 0.5 ? '#FFC46B' : '#FFE2A6') : '#5A6290';
        g.fillRect(c * 32 + 7, r * 32 + 9, 18, 16);
      }
    }
    // roof pixel at the very corner stays wall-coloured / unlit
    g.fillStyle = lit ? '#000' : '#ffffff';
    g.fillRect(0, 0, 4, 4);
  };
  const map = canvasTexture(128, 128, draw(false), { repeat: true });
  const emissive = canvasTexture(128, 128, draw(true), { repeat: true });
  return { map, emissive };
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

export function createCity(scene, { rand, mobile }) {
  const nightMats = [];

  // ground
  scene.add(mesh(new THREE.CircleGeometry(1400, 48).rotateX(-Math.PI / 2), toon('#5E4E6A'), { cast: false, receive: true }));
  scene.add(mesh(new THREE.PlaneGeometry(82, 62).rotateX(-Math.PI / 2), toon('#A47C5E'), { y: 0.03, x: -3, z: -3, cast: false, receive: true }));
  scene.add(mesh(new THREE.PlaneGeometry(12, 22).rotateX(-Math.PI / 2), toon('#3A3A52'), { y: 0.04, z: 45, cast: false, receive: true }));

  // district blocks (merged)
  const { map, emissive } = windowTextures(rand);
  const blockMat = toon('#ffffff', { map, emissiveMap: emissive, emissive: 0xffffff, emissiveIntensity: 0.1, vertexColors: true });
  nightMats.push({ mat: blockMat, base: 0.08, night: 1.1 });
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
      const w = 10 + rand() * 10, d = 10 + rand() * 10;
      const h = 8 + rand() * (dist < 140 ? 22 : 48);
      parts.push(blockGeometry(w, h, d, BLOCK_COLORS[Math.floor(rand() * BLOCK_COLORS.length)])
        .translate(x + (rand() - 0.5) * 8, 0, z + (rand() - 0.5) * 8));
    }
  }
  const blocks = mesh(mergeGeometries(parts), blockMat, { receive: true });
  scene.add(blocks);

  // blocks that rise as the visitor scrolls ("the city grows")
  const rising = [];
  const riseSpots = [[-130, -150], [-100, -120], [-72, -150], [-130, -110], [-80, -105]];
  riseSpots.forEach(([x, z], i) => {
    const h = 24 + rand() * 30;
    const m = mesh(blockGeometry(14, h, 14, BLOCK_COLORS[(i + 2) % BLOCK_COLORS.length]), blockMat, { x, z, receive: true });
    m.scale.y = 0.001;
    scene.add(m);
    rising.push({ m, delay: i * 0.12 });
  });

  // trees
  const treeCount = mobile ? 60 : 140;
  const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.6, 0), toon('#4E7F63', { flatShading: true }), treeCount);
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.35, 0.45, 3, 6), toon('#6B4A3A'), treeCount);
  crowns.castShadow = trunks.castShadow = true;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i < treeCount; i++) {
    let x, z;
    if (i < treeCount * 0.55) {
      x = -380 + (i / (treeCount * 0.55)) * 760 + rand() * 6;
      z = 56 + (i % 2 ? 13 : -13);
    } else {
      const a = rand() * Math.PI * 2, r = 70 + rand() * 40;
      x = Math.cos(a) * r;
      z = Math.sin(a) * r * 0.75 - 10;
      if (z > 36 && z < 76) z = 100 + rand() * 30;
    }
    const sc = 0.8 + rand() * 0.6;
    p.set(x, 3 * sc + 1.4 * sc, z); s.set(sc, sc * 1.15, sc); q.setFromEuler(new THREE.Euler(0, rand() * 3, 0));
    crowns.setMatrixAt(i, m4.compose(p, q, s));
    p.set(x, 1.5 * sc, z); s.set(sc, sc, sc);
    trunks.setMatrixAt(i, m4.compose(p, q, s));
  }
  scene.add(crowns, trunks);

  // street lamps along the avenue
  const lampCount = 28;
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.2, 7, 6).translate(0, 3.5, 0), toon('#2B2D52'), lampCount);
  const bulbMat = new THREE.MeshBasicMaterial({ color: '#4a4660' });
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.55, 8, 6), bulbMat, lampCount);
  for (let i = 0; i < lampCount; i++) {
    const x = -300 + (i >> 1) * 44, z = 56 + (i % 2 ? 9.5 : -9.5);
    poles.setMatrixAt(i, m4.makeTranslation(x, 0, z));
    bulbs.setMatrixAt(i, m4.makeTranslation(x, 7.2, z));
  }
  scene.add(poles, bulbs);

  // ---- construction site props ------------------------------------------------------
  const site = new THREE.Group();
  scene.add(site);
  const fenceTex = canvasTexture(256, 64, (g) => {
    g.fillStyle = '#F1ECE4';
    g.fillRect(0, 0, 256, 64);
    g.fillStyle = '#1F2147';
    g.fillRect(0, 48, 256, 16);
    for (let i = -2; i < 20; i++) {
      g.fillStyle = '#FFC21A';
      g.beginPath();
      g.moveTo(i * 16, 64); g.lineTo(i * 16 + 8, 64); g.lineTo(i * 16 + 16, 48); g.lineTo(i * 16 + 8, 48);
      g.fill();
    }
    g.fillStyle = '#1F2147';
    g.font = '700 22px Manrope, Arial, sans-serif';
    g.fillText('ANDIJON QURILISH', 20, 32);
  }, { repeat: true });
  const fenceMat = toon('#ffffff', { map: fenceTex });
  const fence = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const geo = new THREE.BoxGeometry(len, 2.4, 0.2);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (len / 10));
    const f = mesh(geo, fenceMat, { x: (x0 + x1) / 2, z: (z0 + z1) / 2, y: 1.2 });
    f.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
    site.add(f);
  };
  fence(-40, 27, -8, 27); fence(8, 27, 36, 27); fence(36, 27, 36, -33); fence(36, -33, -40, -33);
  fence(-40, -33, -40, 0); fence(-40, 12, -40, 27);

  // site offices (stacked containers)
  const cabinMat = toon('#4A7FC1');
  const doorMat = toon('#F1ECE4');
  for (const [x, y, z] of [[27, 0, -22], [27, 2.9, -22], [27, 0, -14]]) {
    site.add(mesh(new RoundedBoxGeometry(10, 2.8, 4, 2, 0.15), cabinMat, { x, y: y + 1.4, z, receive: true }));
    site.add(mesh(new THREE.BoxGeometry(1.4, 2, 0.1), doorMat, { x: x - 2, y: y + 1.2, z: z + 2.02 }));
    site.add(mesh(new THREE.BoxGeometry(2.4, 1, 0.1), toon('#9ED3F2'), { x: x + 2, y: y + 1.6, z: z + 2.02 }));
  }

  // material stacks at the delivery bay
  const brick = toon('#C4583A');
  const pallet = toon('#B88B5A');
  for (let i = 0; i < 4; i++) {
    site.add(mesh(new THREE.BoxGeometry(2.6, 0.3, 2.6), pallet, { x: -35 + (i % 2) * 3.2, z: 2 + (i >> 1) * 3.2, y: 0.15 }));
    site.add(mesh(new THREE.BoxGeometry(2.4, 1.6, 2.4), brick, { x: -35 + (i % 2) * 3.2, z: 2 + (i >> 1) * 3.2, y: 1.1 }));
  }
  const pipeGeo = new THREE.CylinderGeometry(0.5, 0.5, 8, 10).rotateZ(Math.PI / 2);
  const pipeMat = toon('#8A8FB8');
  for (let i = 0; i < 6; i++) {
    site.add(mesh(pipeGeo, pipeMat, { x: -29, z: 14 + (i % 3) * 1.05, y: 0.5 + Math.floor(i / 3) * 0.9 }));
  }

  // traffic cones
  const coneGeo = new THREE.ConeGeometry(0.45, 1.2, 10);
  const coneMat = toon('#FF5E1F');
  for (let i = 0; i < 7; i++) site.add(mesh(coneGeo, coneMat, { x: -6 + i * 2, z: 29.5, y: 0.6 }));

  // excavator digging a pit
  scene.add(mesh(new THREE.CircleGeometry(6, 18).rotateX(-Math.PI / 2), toon('#5C4033'), { x: 23, z: 6, y: 0.07, cast: false }));
  const mound = mesh(new THREE.SphereGeometry(4, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), toon('#B98D62', { flatShading: true }), { x: 14, z: 12 });
  mound.scale.y = 0.55;
  scene.add(mound);
  const exc = new THREE.Group();
  exc.position.set(20, 0, 14);
  scene.add(exc);
  const track = toon('#2B2D52');
  exc.add(mesh(new RoundedBoxGeometry(5, 1.2, 1.2, 2, 0.5), track, { y: 0.6, z: 1.4 }));
  exc.add(mesh(new RoundedBoxGeometry(5, 1.2, 1.2, 2, 0.5), track, { y: 0.6, z: -1.4 }));
  const body = new THREE.Group();
  body.position.y = 1.3;
  exc.add(body);
  const excYellow = toon('#FFC21A');
  body.add(mesh(new RoundedBoxGeometry(4, 1.5, 3, 2, 0.4), excYellow, { y: 0.75, x: -0.5 }));
  body.add(mesh(new RoundedBoxGeometry(1.8, 2, 1.8, 2, 0.35), excYellow, { y: 2, x: 0.3, z: 0.5 }));
  body.add(mesh(new THREE.BoxGeometry(1.5, 1.1, 0.1), toon('#8CC8F0'), { y: 2.3, x: 0.3, z: 1.42 }));
  const boom = new THREE.Group();
  boom.position.set(1.2, 1.2, -0.6);
  body.add(boom);
  boom.add(mesh(new THREE.BoxGeometry(5, 0.7, 0.7).translate(2.5, 0, 0), excYellow));
  const stick = new THREE.Group();
  stick.position.x = 5;
  boom.add(stick);
  stick.add(mesh(new THREE.BoxGeometry(0.6, 3.6, 0.6).translate(0, -1.8, 0), excYellow));
  const bucket = mesh(new THREE.BoxGeometry(1.4, 1.1, 1.4), toon('#3B3D63'), { y: -3.9, x: 0.3 });
  stick.add(bucket);
  body.rotation.y = -0.6;

  // floodlight beams (visible at night)
  const beamTex = canvasTexture(4, 64, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 64);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 4, 64);
  }, { srgb: false });
  const beamMat = new THREE.MeshBasicMaterial({
    color: '#FFD58A', alphaMap: beamTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
  const beams = [];
  for (const [x, z] of [[-30, 22], [30, 22], [-30, -28]]) {
    site.add(mesh(new THREE.CylinderGeometry(0.2, 0.25, 6, 6), toon('#2B2D52'), { x, z, y: 3 }));
    site.add(mesh(new THREE.BoxGeometry(1.6, 1, 0.6), toon('#F1ECE4', { emissive: '#FFD58A', emissiveIntensity: 0 }), { x, z, y: 6.3 }));
    const from = new THREE.Vector3(x, 6.3, z);
    const to = new THREE.Vector3(0, 46, 0);
    const len = from.distanceTo(to);
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 0.5, len, 20, 1, true), beamMat);
    cone.position.copy(from).lerp(to, 0.5);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    scene.add(cone);
    beams.push(cone);
  }
  site.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  // clouds
  const cloudMat = toon('#F6D3CF', { fog: false, flatShading: true });
  const clouds = [];
  for (let i = 0; i < (mobile ? 5 : 9); i++) {
    const c = new THREE.Group();
    const n = 4 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const r = 8 + rand() * 9;
      c.add(mesh(new THREE.IcosahedronGeometry(r, 1), cloudMat, { x: k * 11 - n * 5, y: rand() * 5, z: rand() * 6, cast: false }));
    }
    c.scale.y = 0.6;
    c.position.set(-700 + rand() * 1400, 210 + rand() * 120, -520 - rand() * 300);
    c.userData.v = 2 + rand() * 3;
    scene.add(c);
    clouds.push(c);
  }

  // birds circling the tower
  const birdMat = toon('#2B2D52', { side: THREE.DoubleSide });
  const wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -0.6, 0, 1.6, 0.8, 0, 0.4], 3));
  wingGeo.computeVertexNormals();
  const birds = [];
  for (let i = 0; i < 7; i++) {
    const b = new THREE.Group();
    const l = new THREE.Mesh(wingGeo, birdMat);
    const r = new THREE.Mesh(wingGeo, birdMat);
    r.scale.z = -1;
    b.add(l, r);
    b.scale.setScalar(1.6);
    b.userData = { l, r, phase: rand() * 6, radius: 70 + i * 6, h: 96 + rand() * 18, off: i * 0.18 };
    scene.add(b);
    birds.push(b);
  }

  const dayCloud = new THREE.Color('#F6D3CF'), nightCloud = new THREE.Color('#4B4F82');
  const lampOff = new THREE.Color('#4a4660'), lampOn = new THREE.Color('#FFD27A');

  function update(dt, time, { night, grow, reduced }) {
    for (const { mat, base, night: n } of nightMats) mat.emissiveIntensity = base + (n - base) * night;
    bulbMat.color.copy(lampOff).lerp(lampOn, smooth(0.15, 0.6, night));
    beamMat.opacity = smooth(0.35, 0.9, night) * 0.16;
    cloudMat.color.copy(dayCloud).lerp(nightCloud, night);

    rising.forEach(({ m, delay }) => {
      const g = smooth(delay, delay + 0.5, grow);
      m.scale.y = Math.max(0.001, easeOutBack(g));
    });

    if (reduced) return;
    for (const c of clouds) {
      c.position.x += c.userData.v * dt;
      if (c.position.x > 560) c.position.x = -560;
    }
    for (const b of birds) {
      const u = b.userData;
      const a = time * 0.16 + u.off;
      b.position.set(Math.cos(a) * u.radius, u.h + Math.sin(time * 0.7 + u.phase) * 3, Math.sin(a) * u.radius * 0.8);
      b.rotation.y = -a - Math.PI;
      const flap = Math.sin(time * 9 + u.phase) * 0.6;
      u.l.rotation.x = flap;
      u.r.rotation.x = -flap;
    }
    body.rotation.y = -0.6 + Math.sin(time * 0.6) * 0.7;
    boom.rotation.z = 0.15 + Math.sin(time * 1.2) * 0.25;
    stick.rotation.z = -0.4 + Math.sin(time * 1.2 + 1) * 0.35;
    bucket.rotation.z = Math.sin(time * 1.2 + 2) * 0.5;
  }

  return { update };
}
