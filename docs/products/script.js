(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fit = c => { const r = c.getBoundingClientRect(), d = devicePixelRatio || 1;
    c.width = r.width * d; c.height = r.height * d; const x = c.getContext('2d'); x.setTransform(d,0,0,d,0,0); return [x, r.width, r.height]; };

  // Starfield
  const stars = document.getElementById('stars');
  let sx, sw, sh, pts = [];
  const initStars = () => { [sx, sw, sh] = fit(stars);
    pts = Array.from({length: 120}, () => ({x: Math.random()*sw, y: Math.random()*sh, r: Math.random()*1.2+.2, p: Math.random()*6})); };
  const drawStars = t => { sx.clearRect(0,0,sw,sh);
    for (const p of pts) { sx.globalAlpha = .35 + .35*Math.sin(t/900 + p.p); sx.fillStyle = '#cfe6ff'; sx.beginPath(); sx.arc(p.x,p.y,p.r,0,7); sx.fill(); } };

  // Ship tracker viz: ocean grid, ships with detection brackets, radar sweep
  const shipC = document.getElementById('viz-ships');
  let ctx1, w1, h1, ships = [];
  const initShips = () => { [ctx1, w1, h1] = fit(shipC);
    ships = Array.from({length: 5}, () => ({x: Math.random()*w1, y: 25+Math.random()*(h1-50), v: .15+Math.random()*.3})); };
  const drawShips = t => {
    ctx1.fillStyle = '#06182a'; ctx1.fillRect(0,0,w1,h1);
    ctx1.strokeStyle = '#35e0ff15'; ctx1.lineWidth = 1;
    for (let x = 0; x < w1; x += 24) { ctx1.beginPath(); ctx1.moveTo(x,0); ctx1.lineTo(x,h1); ctx1.stroke(); }
    for (let y = 0; y < h1; y += 24) { ctx1.beginPath(); ctx1.moveTo(0,y); ctx1.lineTo(w1,y); ctx1.stroke(); }
    const sweep = (t/12) % (w1 + 80) - 40;
    const g = ctx1.createLinearGradient(sweep-50,0,sweep,0); g.addColorStop(0,'#35e0ff00'); g.addColorStop(1,'#35e0ff40');
    ctx1.fillStyle = g; ctx1.fillRect(sweep-50,0,50,h1);
    for (const s of ships) {
      s.x += s.v; if (s.x > w1 + 10) s.x = -10;
      ctx1.fillStyle = '#e8f6ff'; ctx1.fillRect(s.x-4,s.y-1.5,8,3);
      if (Math.abs(s.x - sweep) < 50 || s.x < sweep) { // detected once swept
        ctx1.strokeStyle = '#35e0ff'; const b = 9;
        ctx1.beginPath();
        ctx1.moveTo(s.x-b,s.y-b+4); ctx1.lineTo(s.x-b,s.y-b); ctx1.lineTo(s.x-b+4,s.y-b);
        ctx1.moveTo(s.x+b-4,s.y-b); ctx1.lineTo(s.x+b,s.y-b); ctx1.lineTo(s.x+b,s.y-b+4);
        ctx1.moveTo(s.x+b,s.y+b-4); ctx1.lineTo(s.x+b,s.y+b); ctx1.lineTo(s.x+b-4,s.y+b);
        ctx1.moveTo(s.x-b+4,s.y+b); ctx1.lineTo(s.x-b,s.y+b); ctx1.lineTo(s.x-b,s.y+b-4);
        ctx1.stroke();
      }
    }
  };

  // RFI viz: radar scene with noisy streaks + waveform with bursts
  const rfiC = document.getElementById('viz-rfi');
  let ctx2, w2, h2;
  const initRfi = () => { [ctx2, w2, h2] = fit(rfiC); };
  const drawRfi = t => {
    ctx2.fillStyle = '#140d05'; ctx2.fillRect(0,0,w2,h2);
    ctx2.strokeStyle = '#ffb23e'; ctx2.lineWidth = 1.6; ctx2.beginPath();
    const burst = Math.floor(t/1400) % 2 === 0 ? ((t % 1400) < 500) : false;
    for (let x = 0; x <= w2; x += 2) {
      const base = Math.sin(x/18 + t/500) * 10;
      const spike = burst && x > w2*.45 && x < w2*.65 ? (Math.random()-.5)*70 : 0;
      const y = h2/2 + base + spike;
      x ? ctx2.lineTo(x,y) : ctx2.moveTo(x,y);
    }
    ctx2.stroke();
    if (burst) { ctx2.fillStyle = '#ff4fa322'; ctx2.fillRect(w2*.45,0,w2*.2,h2);
      ctx2.fillStyle = '#ff4fa3'; ctx2.font = '11px ui-monospace,monospace'; ctx2.fillText('RFI DETECTED', w2*.45+8, 16); }
    for (let i = 0; i < 40; i++) { ctx2.fillStyle = `rgba(255,178,62,${Math.random()*.08})`; ctx2.fillRect(Math.random()*w2, Math.random()*h2, 2, 1); }
  };

  const init = () => { initStars(); initShips(); initRfi(); };
  init(); addEventListener('resize', init);
  const frame = t => { drawStars(t); drawShips(t); drawRfi(t); if (!reduce) requestAnimationFrame(frame); };
  requestAnimationFrame(frame);

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
