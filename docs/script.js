(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Fake download buttons (prototype: no real file)
  const toast = document.getElementById('toast'); let tt;
  const say = msg => { toast.textContent = msg; toast.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => toast.classList.remove('show'), 3200); };
  document.querySelectorAll('.dl').forEach(btn => {
    const label = btn.querySelector('.label'), meta = btn.querySelector('.meta');
    btn.addEventListener('click', () => {
      if (btn.classList.contains('busy')) return;
      btn.style.setProperty('--w', btn.offsetWidth + 'px');
      btn.classList.remove('done'); btn.classList.add('busy');
      label.textContent = btn.classList.contains('dl-ship') ? 'Sailing in…' : 'Filtering noise…';
      meta.textContent = '';
      setTimeout(() => {
        btn.classList.remove('busy'); btn.classList.add('done');
        label.textContent = 'Ready ✓'; meta.textContent = 'prototype';
        say(`${btn.dataset.name} isn't released yet. This is a prototype, so no file was downloaded.`);
        setTimeout(() => { btn.classList.remove('done'); label.textContent = 'Download'; meta.textContent = 'v0.1 prototype'; }, 2600);
      }, reduce ? 300 : 2300);
    });
  });
})();

(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;
  if (reduce) { document.querySelectorAll('.reveal').forEach(e => e.classList.add('in')); return; }

  // cursor glow
  addEventListener('pointermove', e => { root.style.setProperty('--mx', e.clientX + 'px'); root.style.setProperty('--my', e.clientY + 'px'); });

  // rotating word
  const words = ['ships', 'interference', 'jammers', 'change from orbit'], el = document.getElementById('rot'); let i = 0;
  setInterval(() => { el.classList.add('out'); setTimeout(() => { i = (i + 1) % words.length; el.textContent = words[i]; el.classList.remove('out'); }, 300); }, 2400);

  // scroll reveal
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); setTimeout(() => e.target.classList.add('tilt'), 1100); io.unobserve(e.target); } }), {threshold: .15});
  document.querySelectorAll('.reveal').forEach(e => io.observe(e));

  // 3D card tilt
  document.querySelectorAll('.card').forEach(c => {
    c.addEventListener('pointermove', e => { const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      c.style.transform = `perspective(900px) rotateY(${x * 7}deg) rotateX(${-y * 7}deg) translateY(-4px)`; });
    c.addEventListener('pointerleave', () => { c.style.transform = ''; });
  });
})();
