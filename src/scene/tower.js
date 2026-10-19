// A high-rise that builds itself floor by floor the way a real frame goes up: slab, columns and
// core in concrete, shoring props under the fresh slabs, a climbing screen around the working
// deck, and the curtain wall following a few floors behind. A rooftop crown lands at the end.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  mat, paint, steel, canvasTexture, concreteMaterial, worldUV, mesh, rodGeometry, latticeGeometry,
  rng, clamp01, smooth, easeOut,
} from './kit.js';

// Curtain wall: albedo, roughness/metalness (G/B), per-pane normal tilt and night windows.
function facadeTextures(floors, panes, seed, palette) {
  const fw = 512, fpx = 96, H = fpx * floors;
  const rand = rng(seed);
  const pw = fw / panes;
  const glassRGB = [1, 3, 5].map((i) => parseInt(palette.glass.slice(i, i + 2), 16));
  const shade = (c, k) => `rgb(${c.map((v) => Math.round(Math.min(255, v * k))).join(',')})`;

  // decide every pane once so all four maps agree
  const panesInfo = [];
  for (let f = 0; f < floors; f++) {
    const row = [];
    for (let i = 0; i < panes; i += 2) {
      const lit = rand() < 0.55;
      const cool = rand() < 0.3;
      for (let k = 0; k < 2; k++) {
        row.push({
          lit,
          cool,
          blind: rand() < 0.32 ? 0.2 + rand() * 0.5 : 0,
          tint: 0.85 + rand() * 0.3,
          tx: (rand() - 0.5) * 8,
          ty: (rand() - 0.5) * 8,
        });
      }
    }
    panesInfo.push(row);
  }
  const visionTop = (f) => (f === 0 ? 0.12 : 0.04);
  const spandrelAt = 0.78; // spandrel band hides the slab and ceiling void

  const map = canvasTexture(fw, H, (g) => {
    for (let f = 0; f < floors; f++) {
      const y0 = H - (f + 1) * fpx;
      g.fillStyle = palette.spandrel;
      g.fillRect(0, y0, fw, fpx);
      const vy = y0 + fpx * visionTop(f), vh = fpx * ((f === 0 ? 1 : spandrelAt) - visionTop(f));
      for (let i = 0; i < panes; i++) {
        const p = panesInfo[f][i];
        const x = i * pw;
        const grd = g.createLinearGradient(0, vy, 0, vy + vh);
        grd.addColorStop(0, shade(glassRGB, p.tint * 1.15));
        grd.addColorStop(1, shade(glassRGB, p.tint * 0.8));
        g.fillStyle = f === 0 ? '#6c7a80' : grd;
        g.fillRect(x, vy, pw, vh);
        if (p.blind && f > 0) {
          // roller blinds half drawn behind the glass
          g.fillStyle = '#b9b5ad';
          g.fillRect(x, vy, pw, vh * p.blind);
          g.fillStyle = 'rgba(0,0,0,0.12)';
          for (let yy = vy + 3; yy < vy + vh * p.blind; yy += 4) g.fillRect(x, yy, pw, 1);
        }
      }
      // aluminium transoms and mullions
      g.fillStyle = palette.frame;
      g.fillRect(0, vy - 2, fw, 4);
      g.fillRect(0, vy + vh - 2, fw, 4);
      for (let i = 0; i <= panes; i++) g.fillRect(i * pw - 2, y0, 4, fpx);
      // fine dirt streaks under each transom
      g.fillStyle = 'rgba(40,36,30,0.10)';
      for (let i = 0; i < panes; i++) g.fillRect(i * pw + 3, vy + vh + 2, pw - 6, 6);
    }
  });

  const orm = canvasTexture(fw, H, (g) => {
    g.fillStyle = 'rgb(0,60,120)'; // spandrel: satin frit
    g.fillRect(0, 0, fw, H);
    for (let f = 0; f < floors; f++) {
      const y0 = H - (f + 1) * fpx;
      const vy = y0 + fpx * visionTop(f), vh = fpx * ((f === 0 ? 1 : spandrelAt) - visionTop(f));
      for (let i = 0; i < panes; i++) {
        const p = panesInfo[f][i];
        g.fillStyle = f === 0 ? 'rgb(0,10,150)' : 'rgb(0,10,225)';
        g.fillRect(i * pw, vy, pw, vh);
        if (p.blind && f > 0) {
          g.fillStyle = 'rgb(0,40,170)';
          g.fillRect(i * pw, vy, pw, vh * p.blind);
        }
      }
      g.fillStyle = 'rgb(0,95,235)';
      g.fillRect(0, vy - 2, fw, 4);
      g.fillRect(0, vy + vh - 2, fw, 4);
      for (let i = 0; i <= panes; i++) g.fillRect(i * pw - 2, y0, 4, fpx);
    }
  }, { srgb: false });

  // every pane sits a hair off-plane, which breaks the reflection like real glazing does
  const normal = canvasTexture(fw, H, (g) => {
    g.fillStyle = 'rgb(128,128,255)';
    g.fillRect(0, 0, fw, H);
    for (let f = 0; f < floors; f++) {
      const y0 = H - (f + 1) * fpx;
      for (let i = 0; i < panes; i++) {
        const p = panesInfo[f][i];
        g.fillStyle = `rgb(${Math.round(128 + p.tx)},${Math.round(128 + p.ty)},250)`;
        g.fillRect(i * pw + 2, y0 + 2, pw - 4, fpx - 4);
      }
      for (let i = 0; i <= panes; i++) {
        g.fillStyle = 'rgb(70,128,230)';
        g.fillRect(i * pw - 2, y0, 2, fpx);
        g.fillStyle = 'rgb(186,128,230)';
        g.fillRect(i * pw, y0, 2, fpx);
      }
    }
  }, { srgb: false });

  const emissive = canvasTexture(fw, H, (g) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, fw, H);
    for (let f = 0; f < floors; f++) {
      const y0 = H - (f + 1) * fpx;
      const vy = y0 + fpx * visionTop(f), vh = fpx * ((f === 0 ? 1 : spandrelAt) - visionTop(f));
      for (let i = 0; i < panes; i++) {
        const p = panesInfo[f][i];
        if (f > 0 && !p.lit) continue;
        // ceiling lights make the top of each window brightest
        const grd = g.createLinearGradient(0, vy, 0, vy + vh);
        const [hi, lo] = f === 0 ? ['#FFE0B0', '#C98F55'] : p.cool ? ['#E8EEFF', '#8E9AB8'] : ['#FFDDA6', '#B9783E'];
        grd.addColorStop(0, hi);
        grd.addColorStop(1, lo);
        g.fillStyle = grd;
        g.fillRect(i * pw + 2, vy + 2, pw - 4, vh - 4);
        if (p.blind && f > 0) {
          g.fillStyle = 'rgba(0,0,0,0.45)';
          g.fillRect(i * pw + 2, vy + 2, pw - 4, vh * p.blind);
        }
      }
    }
  });
  return { map, orm, normal, emissive };
}

// Perforated climbing screen with the contractor's banner, as builders brand them on site.
function screenTexture() {
  return canvasTexture(1024, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(28,32,38,0.86)';
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(70,76,84,1)';
    for (let x = 0; x <= w; x += w / 6) g.fillRect(x - 3, 0, 6, h);
    g.fillStyle = '#5b6168';
    g.fillRect(0, 0, w, 10);
    g.fillRect(0, h - 10, w, 10);
    g.fillRect(0, h * 0.62, w, 5);
    // banner
    g.fillStyle = '#F2F0EA';
    g.fillRect(w * 0.18, h * 0.2, w * 0.64, h * 0.34);
    g.fillStyle = '#E8A912';
    g.fillRect(w * 0.18, h * 0.5, w * 0.64, h * 0.04);
    g.fillStyle = '#1B1D45';
    g.font = '800 52px Unbounded, Arial Black, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('ANDIJON QURILISH', w / 2, h * 0.36);
  });
}

function signTexture(text) {
  return canvasTexture(512, 128, (g) => {
    g.clearRect(0, 0, 512, 128);
    g.fillStyle = '#ffffff';
    g.font = '800 104px Unbounded, Arial Black, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 256, 68);
  });
}

// A site worker in hi-vis: boots, trousers, vest, arms, head and hard hat.
const workerParts = (() => {
  const box = (w, h, d, y, x = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, 0);
  return {
    legs: mergeGeometries([box(0.16, 0.82, 0.2, 0.41, -0.11), box(0.16, 0.82, 0.2, 0.41, 0.11)]),
    torso: new THREE.CylinderGeometry(0.21, 0.18, 0.62, 8).translate(0, 1.13, 0),
    arms: mergeGeometries([box(0.11, 0.58, 0.12, 1.12, -0.3), box(0.11, 0.58, 0.12, 1.12, 0.3)]),
    head: new THREE.SphereGeometry(0.12, 10, 8).translate(0, 1.58, 0),
    hat: new THREE.SphereGeometry(0.145, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.62, 0),
  };
})();
const workerMats = {
  legs: mat('#2a2f3a'),
  vest: [mat('#F28A1C', { emissive: '#F28A1C', emissiveIntensity: 0.12, roughness: 0.7 }),
    mat('#C8E021', { emissive: '#C8E021', emissiveIntensity: 0.1, roughness: 0.7 })],
  arms: mat('#3a4150'),
  skin: mat('#B07A55', { roughness: 0.7 }),
  hat: [paint('#F4F4F0', { roughness: 0.35 }), paint('#F2C21B', { roughness: 0.35 })],
};
function makeWorker(i) {
  const w = new THREE.Group();
  w.add(mesh(workerParts.legs, workerMats.legs), mesh(workerParts.torso, workerMats.vest[i % 2]),
    mesh(workerParts.arms, workerMats.arms), mesh(workerParts.head, workerMats.skin),
    mesh(workerParts.hat, workerMats.hat[i % 3 === 0 ? 1 : 0]));
  return w;
}

export function createTower({
  floors = 24, w = 14, fh = 3.3, cols = 6, seed = 7, sign = null, crew = true,
  palette = { glass: '#7f97ab', spandrel: '#2b323b', frame: '#A9AEB3', trim: '#8E959C', concrete: '#ffffff' },
} = {}) {
  const group = new THREE.Group();
  const H = floors * fh;
  const clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0); // curtain wall reveal
  const topClip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0); // things that climb with the frame
  const concrete = concreteMaterial(palette.concrete);
  const coreConcrete = concreteMaterial('#e4ded6');
  const half = w / 2 - 0.45;
  const slabT = 0.3;

  // --- Structure: slab + columns + core walls per floor, then a roof slab --------------------
  const slabGeo = worldUV(new THREE.BoxGeometry(w + 0.3, slabT, w + 0.3), 6);
  const colParts = [];
  const colH = fh - slabT;
  const spots = [];
  for (let k = 0; k < 5; k++) {
    const t = -half + (k * 2 * half) / 4;
    spots.push([t, -half], [t, half]);
    if (k > 0 && k < 4) spots.push([-half, t], [half, t]);
  }
  for (const [x, z] of spots) colParts.push(new THREE.BoxGeometry(0.6, colH, 0.6).translate(x, colH / 2, z));
  const coreParts = [];
  const cw = 5.6, ct = 0.3;
  coreParts.push(new THREE.BoxGeometry(cw, colH, ct).translate(0, colH / 2, -cw / 2 + ct / 2));
  coreParts.push(new THREE.BoxGeometry(ct, colH, cw).translate(-cw / 2 + ct / 2, colH / 2, 0));
  coreParts.push(new THREE.BoxGeometry(ct, colH, cw).translate(cw / 2 - ct / 2, colH / 2, 0));
  coreParts.push(new THREE.BoxGeometry(1.6, colH, ct).translate(-cw / 2 + 0.8, colH / 2, cw / 2 - ct / 2));
  coreParts.push(new THREE.BoxGeometry(1.6, colH, ct).translate(cw / 2 - 0.8, colH / 2, cw / 2 - ct / 2));
  coreParts.push(new THREE.BoxGeometry(cw - 3.2, 0.7, ct).translate(0, colH - 0.35, cw / 2 - ct / 2)); // lintel
  const colGeo = worldUV(mergeGeometries(colParts), 6);
  const coreGeo = worldUV(mergeGeometries(coreParts), 6);

  const floorsArr = [];
  for (let i = 0; i <= floors; i++) {
    const slab = mesh(slabGeo, concrete, { y: i * fh + slabT / 2, receive: true });
    slab.visible = false;
    group.add(slab);
    const f = { slab, baseY: i * fh };
    if (i < floors) {
      f.cols = mesh(colGeo, concrete, { y: i * fh + slabT, receive: true });
      f.core = mesh(coreGeo, coreConcrete, { y: i * fh + slabT, receive: true });
      f.cols.visible = f.core.visible = false;
      group.add(f.cols, f.core);
    }
    floorsArr.push(f);
  }

  // --- Curtain wall: four skins revealed by a clipping plane, with aluminium fins -------------
  const panes = cols * 2;
  const tex = facadeTextures(floors, panes, seed, palette);
  const facadeMat = mat('#ffffff', {
    map: tex.map, roughnessMap: tex.orm, metalnessMap: tex.orm, normalMap: tex.normal,
    normalScale: new THREE.Vector2(0.6, 0.6), roughness: 1, metalness: 1, envMapIntensity: 1.25,
    emissiveMap: tex.emissive, emissive: 0xffffff, emissiveIntensity: 0,
    clippingPlanes: [clip], clipShadows: true,
  });
  const skin = w / 2 + 0.3;
  const front = new THREE.BoxGeometry(w + 0.2, H, 0.3);
  const side = new THREE.BoxGeometry(0.3, H, w + 0.2);
  group.add(
    mesh(front, facadeMat, { y: H / 2, z: skin }),
    mesh(front, facadeMat, { y: H / 2, z: -skin }),
    mesh(side, facadeMat, { y: H / 2, x: skin }),
    mesh(side, facadeMat, { y: H / 2, x: -skin }),
  );
  const trimMat = steel(palette.trim, { roughness: 0.35, clippingPlanes: [clip], clipShadows: true });
  const finParts = [];
  for (const [x, z] of [[skin, skin], [-skin, skin], [skin, -skin], [-skin, -skin]]) {
    finParts.push(new THREE.BoxGeometry(0.7, H + 1.4, 0.7).translate(x, (H + 1.4) / 2, z));
  }
  // vertical fins every second mullion throw real shadow lines across the glass
  const pw = (w + 0.2) / panes;
  for (let i = 2; i < panes; i += 2) {
    const t = -(w + 0.2) / 2 + i * pw;
    finParts.push(new THREE.BoxGeometry(0.12, H, 0.4).translate(t, H / 2, skin + 0.35));
    finParts.push(new THREE.BoxGeometry(0.12, H, 0.4).translate(t, H / 2, -skin - 0.35));
    finParts.push(new THREE.BoxGeometry(0.4, H, 0.12).translate(skin + 0.35, H / 2, t));
    finParts.push(new THREE.BoxGeometry(0.4, H, 0.12).translate(-skin - 0.35, H / 2, t));
  }
  group.add(mesh(mergeGeometries(finParts), trimMat));
  // entrance canopy
  group.add(mesh(new THREE.BoxGeometry(7, 0.3, 2.6), steel('#6d737a'), { y: 4.6, z: skin + 1.4 }));

  // --- Working deck: props under fresh slabs, starter bars, core formwork, crew --------------
  const deck = new THREE.Group();
  group.add(deck);
  const propMat = steel('#b7bcc1', { roughness: 0.5 });
  const propGeo = new THREE.CylinderGeometry(0.05, 0.05, fh - slabT, 5).translate(0, (fh - slabT) / 2, 0);
  const propSpots = [];
  for (let x = -half + 1.2; x < half; x += 2.1) {
    for (let z = -half + 1.2; z < half; z += 2.1) {
      if (Math.abs(x) < cw / 2 + 0.4 && Math.abs(z) < cw / 2 + 0.4) continue;
      propSpots.push([x, z]);
    }
  }
  const props = new THREE.InstancedMesh(propGeo, propMat, propSpots.length * 2);
  const m4 = new THREE.Matrix4();
  propSpots.forEach(([x, z], i) => {
    props.setMatrixAt(i, m4.makeTranslation(x, slabT, z));
    props.setMatrixAt(i + propSpots.length, m4.makeTranslation(x, fh + slabT, z));
  });
  props.castShadow = true;
  deck.add(props); // deck.y = slab two floors below the newest one

  const bars = new THREE.Group(); // starter bars poking out of the columns being cast
  const rebarMat = steel('#6b4a3a', { roughness: 0.75, metalness: 0.6 });
  const barParts = [];
  for (const [x, z] of spots) {
    for (const [dx, dz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) {
      barParts.push(new THREE.CylinderGeometry(0.025, 0.025, 1.3, 4).translate(x + dx, 0.65, z + dz));
    }
  }
  bars.add(mesh(mergeGeometries(barParts), rebarMat, { cast: false }));
  group.add(bars);

  // self-climbing core formwork: yellow panels with a working platform on top
  const climber = new THREE.Group();
  const formPanel = paint('#E2B21C', { roughness: 0.6 });
  const fw2 = cw + 1.2;
  for (const r of [0, 1, 2, 3]) {
    const p = mesh(new THREE.BoxGeometry(fw2, fh + 0.6, 0.25), formPanel, { y: (fh + 0.6) / 2 });
    p.position.x = Math.sin((r * Math.PI) / 2) * (fw2 / 2);
    p.position.z = Math.cos((r * Math.PI) / 2) * (fw2 / 2);
    p.rotation.y = (r * Math.PI) / 2;
    climber.add(p);
  }
  climber.add(mesh(new THREE.BoxGeometry(fw2 + 1.4, 0.18, fw2 + 1.4), steel('#4a5058', { roughness: 0.7 }), { y: fh + 0.7 }));
  const railParts = [];
  const rr = (fw2 + 1.4) / 2;
  for (const s of [-1, 1]) {
    railParts.push(new THREE.BoxGeometry(fw2 + 1.4, 0.06, 0.06).translate(0, fh + 1.8, s * rr));
    railParts.push(new THREE.BoxGeometry(0.06, 0.06, fw2 + 1.4).translate(s * rr, fh + 1.8, 0));
    for (let k = -2; k <= 2; k++) {
      railParts.push(new THREE.BoxGeometry(0.06, 1.1, 0.06).translate((k * rr) / 2, fh + 1.25, s * rr));
      railParts.push(new THREE.BoxGeometry(0.06, 1.1, 0.06).translate(s * rr, fh + 1.25, (k * rr) / 2));
    }
  }
  climber.add(mesh(mergeGeometries(railParts), paint('#E2B21C')));
  group.add(climber);

  // stacked material on the deck: rebar bundles and a pallet of blocks
  const stock = new THREE.Group();
  const rebarBundle = mergeGeometries(Array.from({ length: 12 }, (_, k) =>
    new THREE.CylinderGeometry(0.03, 0.03, 6, 4).rotateZ(Math.PI / 2).translate(0, 0.05 + (k % 3) * 0.07, (k / 3 | 0) * 0.07)));
  stock.add(mesh(rebarBundle, rebarMat, { x: 3.4, z: 4.2 }));
  stock.add(mesh(rebarBundle, rebarMat, { x: -2.6, z: -4.6 }));
  stock.add(mesh(new THREE.BoxGeometry(1.2, 0.9, 1.0), mat('#9c9a94'), { x: -4.6, y: 0.45, z: 3.6 }));
  group.add(stock);

  const crewList = [];
  if (crew) {
    const r = rng(seed + 5);
    for (let i = 0; i < 7; i++) {
      const wk = makeWorker(i);
      const a = r() * Math.PI * 2;
      wk.userData = { cx: Math.cos(a) * (half - 1.5), cz: Math.sin(a) * (half - 1.5), phase: r() * 6, span: 1 + r() * 2.5, speed: 0.25 + r() * 0.3 };
      if (Math.abs(wk.userData.cx) < cw / 2 + 0.6 && Math.abs(wk.userData.cz) < cw / 2 + 0.6) wk.userData.cx = half - 1.5;
      stock.add(wk);
      crewList.push(wk);
    }
  }

  // --- Climbing screen around the top floors -----------------------------------------------
  const screenH = fh * 2.4;
  const sTex = screenTexture();
  const screenMat = mat('#ffffff', { map: sTex, transparent: true, side: THREE.DoubleSide, roughness: 0.8, depthWrite: false });
  const screen = new THREE.Group();
  const sw = w + 2.6, sd = w / 2 + 1.25;
  for (const r of [0, 1, 2, 3]) {
    const p = mesh(new THREE.PlaneGeometry(sw, screenH), screenMat, { y: screenH / 2 });
    p.position.x = Math.sin((r * Math.PI) / 2) * sd;
    p.position.z = Math.cos((r * Math.PI) / 2) * sd;
    p.rotation.y = (r * Math.PI) / 2;
    screen.add(p);
  }
  group.add(screen);

  // --- Construction hoist on the front face: mast, ties and a riding cage --------------------
  const hoist = new THREE.Group();
  hoist.position.set(-w / 4, 0, skin + 1.6);
  const mastMat = steel('#9ba1a7', { roughness: 0.5, clippingPlanes: [topClip], clipShadows: true });
  hoist.add(mesh(latticeGeometry(H + 4, [[-0.45, -0.45], [0.45, -0.45], [0.45, 0.45], [-0.45, 0.45]], { step: 1.5, chord: 0.06, brace: 0.025 }), mastMat));
  const tieParts = [];
  for (let y = fh * 3; y < H; y += fh * 4) {
    tieParts.push(rodGeometry(new THREE.Vector3(-0.45, y, -0.45), new THREE.Vector3(-0.9, y, -1.3), 0.05));
    tieParts.push(rodGeometry(new THREE.Vector3(0.45, y, -0.45), new THREE.Vector3(0.9, y, -1.3), 0.05));
  }
  hoist.add(mesh(mergeGeometries(tieParts), mastMat));
  const cage = new THREE.Group();
  const cageTex = canvasTexture(128, 128, (g) => {
    g.fillStyle = '#8f969c';
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#5f666c';
    g.lineWidth = 1;
    for (let i = 0; i < 128; i += 6) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke(); }
    g.fillStyle = '#4d545a';
    g.fillRect(0, 0, 128, 8); g.fillRect(0, 120, 128, 8); g.fillRect(0, 0, 8, 128); g.fillRect(120, 0, 8, 128);
  });
  cage.add(mesh(new THREE.BoxGeometry(1.6, 2.5, 3.2), paint('#ffffff', { map: cageTex }), { x: 1.35, y: 1.25 }));
  cage.add(mesh(new THREE.BoxGeometry(1.8, 0.25, 3.4), paint('#2e3338'), { x: 1.35, y: 2.6 }));
  hoist.add(cage);
  group.add(hoist);

  // --- Rooftop crown -----------------------------------------------------------------------
  const crown = new THREE.Group();
  crown.position.y = H + slabT;
  const parapetMat = steel('#5b6168', { roughness: 0.4 });
  const pp = [];
  for (const r of [0, 1, 2, 3]) {
    const g = new THREE.BoxGeometry(w + 0.9, 1.2, 0.35).translate(0, 0.6, w / 2 + 0.45);
    g.rotateY((r * Math.PI) / 2);
    pp.push(g);
  }
  crown.add(mesh(mergeGeometries(pp), parapetMat));
  crown.add(mesh(worldUV(new THREE.BoxGeometry(4.2, 3.4, 4.2), 6), concreteMaterial('#d8d2c8'), { y: 1.7, x: -2.2, z: -1.6 }));
  const hvacTex = canvasTexture(128, 64, (g) => {
    g.fillStyle = '#b8bcbf';
    g.fillRect(0, 0, 128, 64);
    g.fillStyle = '#7d8286';
    for (let y = 6; y < 58; y += 4) g.fillRect(6, y, 116, 2);
  });
  const hvac = steel('#ffffff', { map: hvacTex, roughness: 0.5, metalness: 0.5 });
  for (const [x, z] of [[3.2, -3.4], [3.2, 0.2], [-3.8, 3.6]]) {
    crown.add(mesh(new THREE.BoxGeometry(2.6, 1.6, 2.2), hvac, { x, z, y: 0.8 }));
    crown.add(mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 16), steel('#3a3f44'), { x, z, y: 1.66 }));
  }
  crown.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 7, 6), steel('#c9cdd1'), { x: -3.4, z: -2.6, y: 3.5 }));
  const glowMat = new THREE.MeshBasicMaterial({ color: '#FFD27A' });
  const glowGeo = new THREE.BoxGeometry(w + 0.9, 0.08, 0.08);
  for (const r of [0, 1, 2, 3]) {
    const g = new THREE.Mesh(glowGeo, glowMat);
    g.position.set(Math.sin((r * Math.PI) / 2) * (w / 2 + 0.65), 1.16, Math.cos((r * Math.PI) / 2) * (w / 2 + 0.65));
    g.rotation.y = (r * Math.PI) / 2;
    crown.add(g);
  }
  let signMat = null;
  if (sign) {
    // channel letters on a steel frame above the parapet
    signMat = new THREE.MeshBasicMaterial({ map: signTexture(sign), color: '#FFC43A', transparent: true, alphaTest: 0.3 });
    const s = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), signMat);
    s.position.set(0, 2.6, w / 2 + 0.3);
    crown.add(s);
    const frame = [];
    for (const x of [-3.6, -1.2, 1.2, 3.6]) frame.push(new THREE.BoxGeometry(0.1, 2.4, 0.1).translate(x, 2.4, w / 2 + 0.15));
    frame.push(new THREE.BoxGeometry(8, 0.1, 0.1).translate(0, 1.7, w / 2 + 0.15));
    crown.add(mesh(mergeGeometries(frame), steel('#3a3f44')));
  }
  crown.scale.set(1, 0.001, 1);
  crown.visible = false;
  group.add(crown);

  let top = 0;
  const state = { progress: 0, complete: false };
  const dim = new THREE.Color('#45474f');
  const warm = new THREE.Color('#FFD27A');

  function update(P, glow = 0, time = 0) {
    state.progress = P;
    const L = clamp01(P) * (floors + 4);
    const structure = Math.min(L, floors + 1);
    const facade = Math.max(0, Math.min(L - 4, floors));

    for (let i = 0; i <= floors; i++) {
      const f = clamp01(structure - i);
      const { slab, cols: c, core, baseY } = floorsArr[i];
      const sIn = clamp01(f / 0.3);
      slab.visible = sIn > 0;
      slab.scale.y = Math.max(0.001, easeOut(sIn));
      slab.position.y = baseY + (slabT * slab.scale.y) / 2;
      if (c) {
        const cIn = clamp01((f - 0.3) / 0.7);
        c.visible = core.visible = cIn > 0;
        c.scale.y = Math.max(0.001, easeOut(cIn));
        core.scale.y = Math.max(0.001, easeOut(clamp01(cIn * 1.6)));
      }
    }
    const built = Math.min(structure, floors);
    top = built * fh + 0.5;
    const level = Math.floor(Math.min(structure, floors)); // slab the crew is working on
    const deckY = level * fh + slabT;

    // curtain wall lands floor by floor: hold, then a quick move to the next level
    const fl = Math.floor(facade);
    const facadeH = Math.min(H + 1.4, (fl + smooth(0.55, 1, facade - fl)) * fh + (facade >= floors ? 1.4 : 0));
    clip.constant = facadeH;
    topClip.constant = top + 3.5;

    const working = P < 1 && structure > 0.3;
    deck.visible = working && level >= 2;
    deck.position.y = (level - 2) * fh;
    bars.visible = climber.visible = stock.visible = working && level < floors;
    bars.position.y = deckY + (clamp01(structure - level) > 0.3 ? colH * easeOut(clamp01((structure - level - 0.3) / 0.7)) : 0);
    climber.position.y = deckY + 0.2;
    stock.position.y = deckY;
    screen.visible = working && top > screenH + 2;
    screen.position.y = deckY + 1.9 - screenH;
    hoist.visible = P < 1 && top > 8;
    cage.position.y = (0.5 - 0.5 * Math.cos(time * 0.22)) * Math.max(0, Math.min(facadeH, top) - 4);

    for (const wk of crewList) {
      const u = wk.userData;
      const s = Math.sin(time * u.speed + u.phase);
      wk.position.set(u.cx + s * u.span, Math.abs(Math.sin(time * u.speed * 6 + u.phase)) * 0.04, u.cz);
      wk.rotation.y = Math.cos(time * u.speed + u.phase) > 0 ? Math.PI / 2 : -Math.PI / 2;
    }

    const c = smooth(0.97, 1, P);
    crown.visible = c > 0;
    crown.scale.y = Math.max(0.001, easeOut(c));
    state.complete = P >= 1;

    facadeMat.emissiveIntensity = glow;
    glowMat.color.copy(dim).lerp(warm, clamp01(glow * 1.4));
    if (signMat) signMat.color.setRGB(1, 0.77, 0.23).multiplyScalar(0.45 + 0.75 * clamp01(glow * 1.5));
  }

  update(0);
  return {
    group, update, state, height: H, w,
    get top() { return top; },
  };
}
