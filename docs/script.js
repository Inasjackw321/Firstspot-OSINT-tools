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
