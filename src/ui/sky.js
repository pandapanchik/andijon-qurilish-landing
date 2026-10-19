// CSS sky behind the transparent WebGL canvas: sunset at the top of the page, night at the bottom.
const STOPS = {
  top: ['#2E2F6E', '#070A22'],
  mid: ['#8E4E80', '#151A45'],
  low: ['#F08E6E', '#232A5E'],
  horizon: ['#F2A585', '#2D3366'],
};
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => {
  const A = hex(a), B = hex(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`;
};

export function initSky(el) {
  const stars = el.querySelector('.sky__stars');
  const dots = [];
  for (let i = 0; i < 140; i++) {
    const x = Math.random() * 100, y = Math.random() * 62, s = Math.random() < 0.15 ? 2 : 1;
    dots.push(`${x.toFixed(2)}vw ${y.toFixed(2)}vh 0 ${s / 2}px rgba(255,255,255,${(0.4 + Math.random() * 0.6).toFixed(2)})`);
  }
  stars.style.boxShadow = dots.join(',');

  let last = -1;
  return (night) => {
    const n = Math.round(night * 200) / 200;
    if (n === last) return;
    last = n;
    const c = Object.fromEntries(Object.entries(STOPS).map(([k, [a, b]]) => [k, mix(a, b, n)]));
    el.style.setProperty('--sky', `linear-gradient(180deg, ${c.top} 0%, ${c.mid} 36%, ${c.low} 58%, ${c.horizon} 76%)`);
    el.style.setProperty('--night', n);
  };
}
