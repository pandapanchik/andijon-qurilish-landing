// Section behaviour: brick-drop headings, reveal-on-enter, the elevator-shaft timeline, the lead form.
import { t, onLangChange } from '../i18n.js';
import { submitLead } from './lead.js';

// Each letter of a heading drops into place like a brick being laid.
function splitDrop(el) {
  const text = el.textContent;
  el.setAttribute('aria-label', text);
  el.textContent = '';
  let i = 0;
  text.split(' ').forEach((word, w) => {
    const ws = document.createElement('span');
    ws.className = 'w';
    ws.setAttribute('aria-hidden', 'true');
    for (const ch of word) {
      const c = document.createElement('span');
      c.className = 'ch';
      c.style.setProperty('--i', i++);
      c.textContent = ch;
      ws.appendChild(c);
    }
    el.appendChild(ws);
    if (w < text.split(' ').length - 1) el.appendChild(document.createTextNode(' '));
  });
}

export function initSections() {
  const drops = [...document.querySelectorAll('[data-drop]')];
  const splitAll = () => drops.forEach(splitDrop);
  splitAll();
  onLangChange(splitAll);

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    }
  }, { threshold: 0.3 });
  document.querySelectorAll('[data-drop], .compare, .shaft, .chips, .passport, .cases, .quote, .permit')
    .forEach((el) => io.observe(el));

  // elevator shaft: the cabin parks at the step closest to the middle of the screen
  const shaft = document.getElementById('shaft');
  const stops = [...shaft.querySelectorAll('.stop')];
  let current = -1;
  function updateShaft() {
    const mid = window.innerHeight * 0.55;
    let best = 0, bestD = Infinity;
    stops.forEach((s, i) => {
      const r = s.getBoundingClientRect();
      const d = Math.abs(r.top + r.height / 2 - mid);
      if (d < bestD) { bestD = d; best = i; }
    });
    if (best === current) return;
    current = best;
    stops.forEach((s, i) => {
      s.classList.toggle('is-here', i === best);
      s.classList.toggle('is-passed', i < best);
    });
    shaft.style.setProperty('--cabin', `${stops[best].offsetTop + 2}px`);
  }

  // lead form
  const form = document.getElementById('leadForm');
  const ok = document.getElementById('formOk');
  const phone = form.elements.phone;
  phone.addEventListener('input', () => {
    let d = phone.value.replace(/\D/g, '');
    if (!d.startsWith('998')) d = `998${d}`.slice(0, 12);
    d = d.slice(0, 12);
    const parts = [d.slice(0, 3), d.slice(3, 5), d.slice(5, 8), d.slice(8, 10), d.slice(10, 12)].filter(Boolean);
    phone.value = `+${parts.join(' ')}`;
  });
  const setErr = (name, msg) => {
    form.querySelector(`[data-err="${name}"]`).textContent = msg;
    form.elements[name].setAttribute('aria-invalid', msg ? 'true' : 'false');
  };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = form.elements.name.value.trim();
    const digits = phone.value.replace(/\D/g, '');
    setErr('name', name ? '' : t('form.errName'));
    setErr('phone', digits.length === 12 ? '' : t('form.errPhone'));
    if (!name) return form.elements.name.focus();
    if (digits.length !== 12) return phone.focus();

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = t('form.sending');
    try {
      await submitLead({ name, phone: `+${digits}`, type: form.elements.type.value });
      ok.textContent = t('form.ok');
      ok.hidden = false;
      form.classList.add('is-sent');
      form.reset();
    } finally {
      btn.disabled = false;
      btn.textContent = t('form.submit');
    }
  });

  return { update: updateShaft };
}
