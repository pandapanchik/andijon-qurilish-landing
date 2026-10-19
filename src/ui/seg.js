// Tiny seven-segment LED display drawn in SVG, used by the header lift and the hero build board.
const SEGS = {
  a: [4, 0, 12, 3], b: [16, 3, 3, 13], c: [16, 19, 3, 13], d: [4, 32, 12, 3],
  e: [1, 19, 3, 13], f: [1, 3, 3, 13], g: [4, 16, 12, 3],
};
const DIGITS = {
  0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd',
  6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', ' ': '',
};
const NS = 'http://www.w3.org/2000/svg';

export function segDisplay(svg, count) {
  const step = 24;
  svg.setAttribute('viewBox', `0 0 ${count * step - 2} 35`);
  const cells = [];
  for (let i = 0; i < count; i++) {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('transform', `translate(${i * step} 0) skewX(-6)`);
    const cell = {};
    for (const [k, [x, y, w, h]] of Object.entries(SEGS)) {
      const r = document.createElementNS(NS, 'rect');
      Object.entries({ x, y, width: w, height: h, rx: 1.2 }).forEach(([a, v]) => r.setAttribute(a, v));
      g.appendChild(r);
      cell[k] = r;
    }
    svg.appendChild(g);
    cells.push(cell);
  }
  let last = '';
  return (value) => {
    const str = String(value).padStart(count, ' ').slice(-count);
    if (str === last) return;
    last = str;
    [...str].forEach((ch, i) => {
      const on = DIGITS[ch] ?? '';
      for (const k of Object.keys(SEGS)) cells[i][k].classList.toggle('on', on.includes(k));
    });
  };
}
