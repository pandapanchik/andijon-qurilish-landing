// The header "tablo": a site signboard with an elevator floor indicator and a crane jib whose
// trolley rides along with scroll progress, carrying the name of the current section.
import { segDisplay } from './seg.js';
import { t } from '../i18n.js';

const SECTION_KEYS = ['', 'nav.why', 'nav.process', 'nav.proof', 'nav.contact'];

export function initTablo({ reduced }) {
  const header = document.getElementById('tablo');
  const trolley = document.getElementById('trolley');
  const cable = document.getElementById('jibCable');
  const load = document.getElementById('jibLoad');
  const tag = document.getElementById('jibTag');
  const lift = header.querySelector('.lift');
  const setFloor = segDisplay(document.getElementById('liftDigits'), 2);
  const burger = header.querySelector('.tablo__burger');
  const nav = document.getElementById('nav');

  burger.addEventListener('click', () => {
    const open = burger.getAttribute('aria-expanded') !== 'true';
    burger.setAttribute('aria-expanded', String(open));
    header.classList.toggle('is-open', open);
  });
  nav.addEventListener('click', (e) => {
    if (e.target.closest('a')) {
      burger.setAttribute('aria-expanded', 'false');
      header.classList.remove('is-open');
    }
  });

  let angle = 0, angVel = 0, cableLen = 18, lastX = 0, lastVel = 0, section = -1, dirTimer = 0;
  setFloor('00');

  function setSection(i) {
    if (i === section) return;
    section = i;
    tag.textContent = SECTION_KEYS[i] ? t(SECTION_KEYS[i]) : 'AQH';
    setFloor(String(i + 1).padStart(2, '0'));
    header.querySelectorAll('.tablo__nav a').forEach((a, k) => a.classList.toggle('is-here', k + 1 === i));
  }

  return {
    refreshLabel() { const s = section; section = -1; setSection(s); },
    update(dt, { progress, sectionIndex, scrollY, velocity }) {
      header.classList.toggle('is-scrolled', scrollY > 24);
      header.style.setProperty('--tape', `${-scrollY * 0.35}px`);
      setSection(sectionIndex);

      // direction arrows on the lift indicator, held briefly after scrolling stops
      if (Math.abs(velocity) > 20) { lift.dataset.dir = velocity > 0 ? 'down' : 'up'; dirTimer = 0.6; }
      dirTimer -= dt;
      if (dirTimer <= 0) delete lift.dataset.dir;

      const width = trolley.parentElement.clientWidth - 46;
      const x = progress * width;
      trolley.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`;
      if (reduced) return;

      // pendulum: the load swings back when the trolley accelerates
      const vel = (x - lastX) / Math.max(dt, 1e-3);
      const acc = (vel - lastVel) / Math.max(dt, 1e-3);
      lastX = x;
      lastVel = vel;
      angVel += (-angle * 38 - angVel * 4.5 - acc * 0.0009) * dt;
      angle = Math.max(-0.9, Math.min(0.9, angle + angVel * dt));
      // moving fast -> the operator hoists the load up; idle -> it hangs lower
      const targetLen = Math.abs(vel) > 60 ? 8 : 20;
      cableLen += (targetLen - cableLen) * Math.min(1, dt * 3);
      cable.style.height = `${cableLen.toFixed(1)}px`;
      load.style.transform = `translate3d(0, ${cableLen.toFixed(1)}px, 0)`;
      trolley.style.setProperty('--swing', `${angle.toFixed(3)}rad`);
    },
  };
}
