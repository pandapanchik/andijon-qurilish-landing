import 'lenis/dist/lenis.css';
import './style.css';
import Lenis from 'lenis';
import { initLang, onLangChange, t } from './i18n.js';
import { initSky } from './ui/sky.js';
import { initTablo } from './ui/tablo.js';
import { initSections } from './ui/sections.js';
import { segDisplay } from './ui/seg.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// the story starts at the top with an empty plot, so always open there
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
if (!location.hash) window.scrollTo(0, 0);

initLang();
const sky = initSky(document.getElementById('sky'));
const tablo = initTablo({ reduced });
onLangChange(() => tablo.refreshLabel());
const sections = initSections();

const lenis = reduced ? null : new Lenis({ lerp: 0.09, wheelMultiplier: 0.9 });
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  const target = document.querySelector(a.getAttribute('href'));
  if (!target) return;
  e.preventDefault();
  if (lenis) lenis.scrollTo(target, { offset: a.getAttribute('href') === '#top' ? 0 : -10, duration: 1.6 });
  else target.scrollIntoView();
});

// ---- scroll -> continuous section index --------------------------------------------------
const secEls = [...document.querySelectorAll('[data-sec]')];
let tops = [];
// a section takes over the camera once its top edge reaches the middle of the screen
const measure = () => {
  tops = secEls.map((el, i) => (i === 0 ? 0 : el.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.5));
};
measure();
window.addEventListener('resize', measure);
window.addEventListener('load', measure);

function sectionProgress(ref) {
  for (let i = tops.length - 1; i >= 0; i--) {
    if (ref >= tops[i]) {
      if (i === tops.length - 1) return i;
      return i + Math.min(1, (ref - tops[i]) / (tops[i + 1] - tops[i]));
    }
  }
  return 0;
}

// ---- hero build board ------------------------------------------------------------------
const setBuild = segDisplay(document.getElementById('buildDigits'), 3);
const boardLabel = document.getElementById('boardLabel');
const boardBar = document.getElementById('boardBar');
const replay = document.getElementById('replay');
const board = document.getElementById('board');
let wasDone = null;
function updateBoard(p) {
  setBuild(Math.round(p * 100));
  boardBar.style.transform = `scaleX(${p})`;
  const done = p >= 1;
  if (done !== wasDone) {
    wasDone = done;
    boardLabel.dataset.i18n = done ? 'board.done' : 'board.building';
    boardLabel.textContent = t(boardLabel.dataset.i18n);
    replay.hidden = !done;
    board.classList.toggle('is-done', done);
  }
}

// ---- 3D world (loaded lazily so text paints first) ---------------------------------------
let world = null;
const canvas = document.getElementById('scene');
import('./scene/world.js').then(({ createWorld }) => {
  try {
    world = createWorld(canvas, { reduced });
    replay.addEventListener('click', () => world.rebuild());
    document.body.classList.add('has-3d');
  } catch (err) {
    console.warn('3D scene unavailable, showing the static page.', err);
    updateBoard(1);
  }
});

// ---- one loop for everything -----------------------------------------------------------
let last = performance.now(), lastY = window.scrollY;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  lenis?.raf(now);
  const y = window.scrollY;
  const velocity = (y - lastY) / Math.max(dt, 1e-3);
  lastY = y;

  const s = sectionProgress(y);
  const max = document.documentElement.scrollHeight - window.innerHeight;
  tablo.update(dt, { progress: max > 0 ? y / max : 0, sectionIndex: Math.round(Math.min(s, secEls.length - 1)), scrollY: y, velocity });
  sections.update();

  if (world) {
    world.state.scroll = s;
    world.update(dt);
    updateBoard(world.state.build);
    sky(world.state.night);
  } else {
    sky(Math.min(1, Math.max(0, (s - 1.9) / 1.9)));
  }
  document.documentElement.style.setProperty('--hero-out', Math.min(1, y / window.innerHeight).toFixed(3));
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
