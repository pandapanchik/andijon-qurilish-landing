// Shared helpers for the cartoon construction scene: toon materials, canvas textures, math.
import * as THREE from 'three';

let gradient;
export function gradientMap() {
  if (!gradient) {
    gradient = new THREE.DataTexture(new Uint8Array([70, 150, 215, 255]), 4, 1, THREE.RedFormat);
    gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
    gradient.needsUpdate = true;
  }
  return gradient;
}

export const toon = (color, opts = {}) =>
  new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(), ...opts });

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

// Steel lattice used for crane masts, jibs and safety nets.
export function latticeMaterial(color, rx = 1, ry = 1, line = 8) {
  const t = canvasTexture(64, 64, (g) => {
    g.strokeStyle = color;
    g.lineWidth = line;
    g.strokeRect(line / 2, line / 2, 64 - line, 64 - line);
    g.beginPath();
    g.moveTo(0, 64);
    g.lineTo(64, 0);
    g.stroke();
  }, { repeat: true });
  t.repeat.set(rx, ry);
  return new THREE.MeshToonMaterial({
    map: t, gradientMap: gradientMap(), alphaTest: 0.5, side: THREE.DoubleSide,
  });
}

export function mesh(geo, mat, { x = 0, y = 0, z = 0, cast = true, receive = false } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

// Thin rod between two points (tie bars, cables, rebar).
export function rod(a, b, radius, mat) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, dir.length(), 6), mat);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
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
export const easeOutBack = (x) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
export const lerp = (a, b, t) => a + (b - a) * t;
export function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
