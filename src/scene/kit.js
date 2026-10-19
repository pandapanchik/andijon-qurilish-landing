// Shared helpers for the construction scene: PBR materials, procedural textures, geometry, math.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---- materials ---------------------------------------------------------------------------
export const mat = (color, opts = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...opts });
// painted steel: a dielectric paint coat with a soft sheen
export const paint = (color, opts = {}) => mat(color, { roughness: 0.5, metalness: 0.15, ...opts });
// bare or galvanised steel
export const steel = (color = '#9aa0a6', opts = {}) => mat(color, { roughness: 0.42, metalness: 0.85, ...opts });
// tinted reflective glass
export const glass = (color = '#33404f', opts = {}) => mat(color, { roughness: 0.05, metalness: 0.9, ...opts });

export function canvasTexture(w, h, draw, { repeat = false, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// ---- tileable value noise ------------------------------------------------------------------
function hash(x, y, s) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Fractal noise in 0..1 that tiles seamlessly at `size` (period of every octave divides it).
export function fbm(size, { octaves = 5, base = 4, seed = 1, gain = 0.5 } = {}) {
  const out = new Float32Array(size * size);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const p = base << o;
    const s = seed * 31 + o;
    for (let y = 0; y < size; y++) {
      const gy = (y / size) * p, iy = Math.floor(gy), fy = gy - iy;
      const sy = fy * fy * (3 - 2 * fy), y0 = iy % p, y1 = (iy + 1) % p;
      for (let x = 0; x < size; x++) {
        const gx = (x / size) * p, ix = Math.floor(gx), fx = gx - ix;
        const sx = fx * fx * (3 - 2 * fx), x0 = ix % p, x1 = (ix + 1) % p;
        const a = hash(x0, y0, s), b = hash(x1, y0, s), c = hash(x0, y1, s), d = hash(x1, y1, s);
        out[y * size + x] += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
      }
    }
    total += amp;
    amp *= gain;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

// Paints a noise field into a 2D context; `fn(v, x, y, px)` fills px = [r, g, b, a].
export function paintNoise(g, size, opts, fn) {
  const n = fbm(size, opts);
  const img = g.createImageData(size, size);
  const px = [0, 0, 0, 255];
  for (let i = 0; i < n.length; i++) {
    px[3] = 255;
    fn(n[i], i % size, (i / size) | 0, px);
    img.data[i * 4] = px[0];
    img.data[i * 4 + 1] = px[1];
    img.data[i * 4 + 2] = px[2];
    img.data[i * 4 + 3] = px[3];
  }
  g.putImageData(img, 0, 0);
}

const grain = (x, y, s) => hash(x, y, s) - 0.5;
const cache = new Map();
const once = (key, make) => {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
};

// Cast-in-place concrete: soft blotches, pores and faint formwork seams.
export function concreteMaterial(tint = '#ffffff', { scale = 6 } = {}) {
  const tex = once('concrete', () => {
    const map = canvasTexture(512, 512, (g) => {
      paintNoise(g, 512, { octaves: 6, base: 4, seed: 11 }, (v, x, y, p) => {
        let c = 150 + (v - 0.5) * 70 + grain(x, y, 3) * 14;
        if (hash(x, y, 9) > 0.996) c -= 45; // pores
        if (y % 128 < 2) c -= 12; // panel seams
        p[0] = c + 2; p[1] = c; p[2] = c - 4;
      });
    }, { repeat: true });
    const bump = canvasTexture(256, 256, (g) => {
      paintNoise(g, 256, { octaves: 4, base: 8, seed: 12 }, (v, x, y, p) => {
        const c = 128 + (v - 0.5) * 120 + grain(x, y, 4) * 50;
        p[0] = p[1] = p[2] = c;
      });
    }, { repeat: true, srgb: false });
    return { map, bump };
  });
  const m = mat(tint, { map: tex.map, bumpMap: tex.bump, bumpScale: 0.6, roughness: 0.92 });
  m.userData.uvScale = scale;
  return m;
}

// Ground covers: compacted site soil, dusty urban ground, asphalt.
export function groundTexture(kind) {
  return once(`ground:${kind}`, () => canvasTexture(512, 512, (g) => {
    const cfg = {
      soil: { seed: 21, base: 3, col: [128, 104, 80], var: 70, grain: 26 },
      urban: { seed: 22, base: 4, col: [104, 102, 88], var: 46, grain: 14 },
      asphalt: { seed: 23, base: 8, col: [58, 59, 62], var: 22, grain: 34 },
      siteRoad: { seed: 24, base: 6, col: [112, 106, 98], var: 34, grain: 26 },
    }[kind];
    paintNoise(g, 512, { octaves: 6, base: cfg.base, seed: cfg.seed }, (v, x, y, p) => {
      const k = (v - 0.5) * cfg.var + grain(x, y, cfg.seed) * cfg.grain;
      p[0] = cfg.col[0] + k; p[1] = cfg.col[1] + k; p[2] = cfg.col[2] + k * 0.9;
      if (kind === 'urban' && v > 0.56) { p[0] -= 10; p[1] += 4; p[2] -= 14; } // patches of dry grass
    });
  }, { repeat: true }));
}

// ---- geometry helpers ----------------------------------------------------------------------
// Box-projected UVs in metres so a texture keeps one physical size on every face.
export function worldUV(geo, scale = 1) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = pos.getX(i); v = pos.getZ(i); }
    else if (ax >= az) { u = pos.getZ(i); v = pos.getY(i); }
    else { u = pos.getX(i); v = pos.getY(i); }
    uv[i * 2] = u / scale;
    uv[i * 2 + 1] = v / scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

export function mesh(geo, material, { x = 0, y = 0, z = 0, cast = true, receive = false } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

const Y = new THREE.Vector3(0, 1, 0);
// Cylinder between two points, as geometry (for merging) or as a mesh.
export function rodGeometry(a, b, radius, seg = 6) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.CylinderGeometry(radius, radius, dir.length(), seg, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, dir.clone().normalize()));
  g.translate(a.x + dir.x / 2, a.y + dir.y / 2, a.z + dir.z / 2);
  return g;
}
export function rod(a, b, radius, material) {
  const m = new THREE.Mesh(rodGeometry(a, b, radius), material);
  m.castShadow = true;
  return m;
}

// Steel lattice truss along +Y. `profile` lists the chord positions [x, z] of the cross-section;
// it tapers to `taper` × profile at the top. Every bay gets a ring of struts and a zig-zag brace.
export function latticeGeometry(len, profile, { step = 2, chord = 0.16, brace = 0.05, taper = 1, ends = true } = {}) {
  const parts = [];
  const at = (k, y) => {
    const s = 1 + (taper - 1) * (y / len);
    return new THREE.Vector3(profile[k][0] * s, y, profile[k][1] * s);
  };
  const n = profile.length;
  const bays = Math.max(1, Math.round(len / step));
  for (let k = 0; k < n; k++) parts.push(rodGeometry(at(k, 0), at(k, len), chord, 4));
  for (let i = 0; i <= bays; i++) {
    const y = (i / bays) * len;
    if (ends || (i > 0 && i < bays)) {
      for (let k = 0; k < n; k++) parts.push(rodGeometry(at(k, y), at((k + 1) % n, y), brace * 0.9, 4));
    }
    if (i === bays) break;
    const y1 = ((i + 1) / bays) * len;
    for (let k = 0; k < n; k++) {
      const flip = (i + k) % 2;
      parts.push(rodGeometry(at(k, flip ? y : y1), at((k + 1) % n, flip ? y1 : y), brace, 4));
    }
  }
  return mergeGeometries(parts);
}

export function rng(seed = 1) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp01 = (v) => Math.min(1, Math.max(0, v));
export const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const easeOut = (x) => 1 - Math.pow(1 - x, 3);
export const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const lerp = (a, b, t) => a + (b - a) * t;
export function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
