// A high-rise that builds itself floor by floor: slab -> columns -> facade, with a safety net
// climbing just above the finished facade and a rooftop crown once it is done.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  toon, canvasTexture, latticeMaterial, mesh, rng, clamp01, smooth, easeOut, easeOutBack,
} from './kit.js';

function facadeTextures(floors, cols, seed, palette) {
  const fw = 512, fh = 64, H = fh * floors;
  const rand = rng(seed);
  const lit = Array.from({ length: floors }, () => Array.from({ length: cols }, () => rand() < 0.58));
  const winX = (i) => 10 + (i * (fw - 20)) / cols;
  const winW = (fw - 20) / cols;

  const map = canvasTexture(fw, H, (g) => {
    for (let f = 0; f < floors; f++) {
      const y = H - (f + 1) * fh;
      g.fillStyle = palette.spandrel;
      g.fillRect(0, y, fw, fh);
      const grd = g.createLinearGradient(0, y + 12, 0, y + fh - 4);
      grd.addColorStop(0, palette.glassTop);
      grd.addColorStop(1, palette.glassBottom);
      g.fillStyle = grd;
      if (f === 0) {
        g.fillRect(8, y + 8, fw - 16, fh - 10);
      } else {
        for (let i = 0; i < cols; i++) g.fillRect(winX(i) + 5, y + 16, winW - 10, fh - 24);
      }
      // cartoon glint on every glass pane
      g.fillStyle = 'rgba(255,255,255,0.22)';
      for (let i = 0; i < cols; i++) {
        const x = winX(i) + 10;
        g.beginPath();
        g.moveTo(x, y + fh - 10);
        g.lineTo(x + 8, y + 18);
        g.lineTo(x + 14, y + 18);
        g.lineTo(x + 6, y + fh - 10);
        g.fill();
      }
    }
  });

  const emissive = canvasTexture(fw, H, (g) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, fw, H);
    for (let f = 0; f < floors; f++) {
      const y = H - (f + 1) * fh;
      if (f === 0) {
        g.fillStyle = '#FFD89A';
        g.fillRect(8, y + 8, fw - 16, fh - 10);
        continue;
      }
      for (let i = 0; i < cols; i++) {
        if (!lit[f][i]) continue;
        g.fillStyle = (f + i) % 3 ? '#FFC46B' : '#FFE6B0';
        g.fillRect(winX(i) + 5, y + 16, winW - 10, fh - 24);
      }
    }
  });
  return { map, emissive };
}

function signTexture(text) {
  return canvasTexture(512, 128, (g) => {
    g.fillStyle = '#1C1E44';
    g.fillRect(0, 0, 512, 128);
    g.fillStyle = '#FFC21A';
    g.font = '800 92px Unbounded, Arial Black, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 256, 70);
  });
}

export function createTower({
  floors = 24, w = 14, fh = 3.3, cols = 6, seed = 7, sign = null,
  palette = {
    spandrel: '#EADCC6', glassTop: '#3B4579', glassBottom: '#EC9C78', fin: '#FF5E1F', concrete: '#CFC6BA',
  },
} = {}) {
  const group = new THREE.Group();
  const H = floors * fh;
  const clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  const concrete = toon(palette.concrete);
  const core = toon('#A79F95');

  // --- Structure: one slab + columns group per floor -----------------------------------
  const slabGeo = new THREE.BoxGeometry(w + 0.4, 0.5, w + 0.4);
  const half = w / 2 - 0.3;
  const colParts = [];
  for (const x of [-half, 0, half]) {
    for (const z of [-half, 0, half]) {
      if (x === 0 && z === 0) continue;
      colParts.push(new THREE.BoxGeometry(0.8, fh - 0.5, 0.8).translate(x, (fh - 0.5) / 2, z));
    }
  }
  colParts.push(new THREE.BoxGeometry(3.6, fh - 0.5, 3.6).translate(0, (fh - 0.5) / 2, 0));
  const colGeo = mergeGeometries(colParts);

  const floorsArr = [];
  for (let i = 0; i < floors; i++) {
    const slab = mesh(slabGeo, concrete, { y: i * fh + 0.25, receive: true });
    const cols3 = mesh(colGeo, i % 2 ? concrete : core, { y: i * fh + 0.5 });
    slab.visible = cols3.visible = false;
    group.add(slab, cols3);
    floorsArr.push({ slab, cols: cols3, baseY: i * fh + 0.25 });
  }

  // --- Facade: four textured skins revealed by a clipping plane --------------------------
  const { map, emissive } = facadeTextures(floors, cols, seed, palette);
  const facadeMat = toon('#ffffff', {
    map, emissiveMap: emissive, emissive: 0xffffff, emissiveIntensity: 0,
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
  const finMat = toon(palette.fin, { clippingPlanes: [clip], clipShadows: true });
  const finGeo = new THREE.BoxGeometry(1, H + 1.2, 1);
  for (const [x, z] of [[skin, skin], [-skin, skin], [skin, -skin], [-skin, -skin]]) {
    group.add(mesh(finGeo, finMat, { x, z, y: (H + 1.2) / 2 }));
  }

  // --- Safety net that rides on top of the facade while building ----------------------
  const netMat = latticeMaterial('#FF6A2B', 12, 1, 6);
  const netR = ((w + 2.6) / 2) * Math.SQRT2;
  const net = mesh(new THREE.CylinderGeometry(netR, netR, 1, 4, 1, true).translate(0, 0.5, 0), netMat, { cast: false });
  net.rotation.y = Math.PI / 4;
  group.add(net);

  // --- Rooftop crown -------------------------------------------------------------------
  const crown = new THREE.Group();
  crown.position.y = H;
  crown.add(mesh(new THREE.BoxGeometry(w + 0.8, 1.2, w + 0.8), toon('#2D2F57'), { y: 0.6 }));
  crown.add(mesh(new THREE.BoxGeometry(5, 3.2, 5), toon('#D9CFC2'), { y: 2.6, x: -2 }));
  crown.add(mesh(new THREE.CylinderGeometry(1.4, 1.4, 2.6, 12), toon('#8A8FB8'), { y: 2.5, x: 3.5, z: 3 }));
  const glowMat = new THREE.MeshBasicMaterial({ color: '#FFC21A' });
  const glowGeo = new THREE.BoxGeometry(w + 1, 0.25, 0.25);
  for (const r of [0, 1, 2, 3]) {
    const g = new THREE.Mesh(glowGeo, glowMat);
    g.position.set(Math.sin((r * Math.PI) / 2) * (w / 2 + 0.5), 1.25, Math.cos((r * Math.PI) / 2) * (w / 2 + 0.5));
    g.rotation.y = (r * Math.PI) / 2;
    crown.add(g);
  }
  let signMat = null;
  if (sign) {
    signMat = new THREE.MeshBasicMaterial({ map: signTexture(sign), color: '#ffffff' });
    const s = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.25), signMat);
    s.position.set(0, 3.2, w / 2 + 0.45);
    crown.add(s);
    crown.add(mesh(new THREE.BoxGeometry(9.4, 2.6, 0.4), toon('#1C1E44'), { y: 3.2, z: w / 2 + 0.2 }));
  }
  crown.scale.setScalar(0.001);
  group.add(crown);

  let top = 0;
  const state = { progress: 0, complete: false };
  const dim = new THREE.Color('#5a5a66');
  const warm = new THREE.Color('#FFC21A');

  function update(P, glow = 0) {
    state.progress = P;
    const L = clamp01(P) * (floors + 3);
    const structure = Math.min(L, floors);
    const facade = Math.max(0, Math.min(L - 3, floors));

    for (let i = 0; i < floors; i++) {
      const f = clamp01(structure - i);
      const { slab, cols: c, baseY } = floorsArr[i];
      const sIn = clamp01(f / 0.45);
      const cIn = clamp01((f - 0.4) / 0.6);
      slab.visible = sIn > 0;
      c.visible = cIn > 0;
      slab.position.y = baseY + (1 - easeOut(sIn)) * 5;
      slab.scale.set(0.6 + 0.4 * easeOutBack(sIn), 1, 0.6 + 0.4 * easeOutBack(sIn));
      c.scale.y = Math.max(0.001, easeOut(cIn));
    }
    top = structure * fh + 0.5;

    // facade lands floor by floor: hold, then a quick snap to the next level
    const fl = Math.floor(facade);
    const facadeH = Math.min(H + 1.2, (fl + smooth(0.55, 1, facade - fl)) * fh + (facade >= floors ? 1.2 : 0));
    clip.constant = facadeH;

    const netH = Math.max(0, top - facadeH + 1.5);
    net.visible = P < 1 && netH > 0.2;
    net.position.y = facadeH - 0.5;
    net.scale.y = netH;
    netMat.map.repeat.y = Math.max(1, netH / 1.6);

    const c = smooth(0.965, 1, P);
    crown.scale.setScalar(Math.max(0.001, easeOutBack(c)));
    state.complete = P >= 1;

    facadeMat.emissiveIntensity = glow;
    glowMat.color.copy(dim).lerp(warm, clamp01(glow * 1.4));
    if (signMat) signMat.color.setScalar(0.55 + 0.45 * clamp01(glow * 1.5));
  }

  update(0);
  return {
    group, update, state, height: H, w,
    get top() { return top; },
  };
}
