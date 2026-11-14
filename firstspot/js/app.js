import { createStore } from './store.js';
import { createGraphic, mountStage, thumbs, PALETTE, TYPES, fmt } from './graphics.js';

/* ---------- tiny helpers ---------- */
// h() builds DOM with textContent only, so user-written stories can never inject HTML.
const h = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'value') e.value = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(9)) {
    if (kid == null || kid === false) continue;
    e.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return e;
};
const svg = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstChild;
};
const GOOGLE_G = `<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`;

const ago = (t) => {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
let toastTm;
const toast = (msg) => {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTm);
  toastTm = setTimeout(() => t.classList.remove('show'), 2800);
};
const initials = (n = '?') => n.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const avatar = (u, sm) =>
  h('span', { class: 'avatar' + (sm ? ' sm' : '') }, u?.photo ? h('img', { src: u.photo, alt: '', referrerpolicy: 'no-referrer' }) : initials(u?.name));
const hasLive = (g) => g.source || g.items.some((i) => i.sim);

/* ---------- state ---------- */
const app = document.getElementById('app');
let store;
let user = null;
let cleanups = [];
const onLeave = (fn) => cleanups.push(fn);

function signInButton(big) {
  return h(
    'button',
    {
      class: 'gbtn' + (big ? ' lg' : ''),
      onclick: async () => {
        try {
          await store.signIn();
          if (store.mode === 'demo') toast('Signed in as Demo Reader (demo mode)');
        } catch (e) {
          if (e?.code !== 'auth/popup-closed-by-user' && e?.code !== 'auth/cancelled-popup-request') toast('Sign-in failed. Check the Firebase setup.');
        }
      },
    },
    svg(GOOGLE_G),
    h('span', {}, 'Sign in', h('span', { class: 'long' }, ' with Google'))
  );
}

function renderAuth() {
  const el = document.getElementById('auth');
  el.replaceChildren(
    user
      ? h('div', { class: 'me' }, avatar(user), h('span', { class: 'nm' }, user.name), h('button', { class: 'btn ghost sm', onclick: () => store.signOut() }, 'Sign out'))
      : signInButton(false)
  );
}

/* ---------- router ---------- */
function route() {
  cleanups.splice(0).forEach((f) => {
    try {
      f();
    } catch {}
  });
  app.replaceChildren();
  const [, page, arg] = (location.hash || '#/').split('/');
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === (page === 'write' ? 'write' : 'home')));
  window.scrollTo(0, 0);
  if (page === 'story' && arg) storyView(arg);
  else if (page === 'write') editorView(arg);
  else homeView();
}

/* ---------- shared bits ---------- */
function liveTags(story) {
  return h(
    'div',
    { class: 'tags' },
    h('span', { class: 'tag type' }, TYPES[story.graphic.type] || 'Graphic'),
    hasLive(story.graphic) && h('span', { class: 'tag' }, 'Live'),
    story.sample && h('span', { class: 'tag' }, 'Sample')
  );
}
const byline = (s) => h('div', { class: 'by' }, avatar(s.author, true), h('span', {}, h('b', {}, s.author?.name || 'Unknown'), ' · ', ago(s.createdAt)));
const specKey = (g) => g.type + g.color + g.items.map((i) => i.label + i.lat + i.lon).join('|');

/* ---------- HOME ---------- */
function homeView() {
  const hero = h(
    'section',
    { class: 'hero fade' },
    h('p', { class: 'eyebrow' }, 'Interactive news'),
    h('h1', {}, 'News you can ', h('em', {}, 'touch.')),
    h('p', { class: 'lede' }, 'Stories with live 3D graphics. Drag, zoom, and watch the numbers move as the world does.'),
    h('div', { class: 'cta' }, user ? h('a', { class: 'btn', href: '#/write' }, 'Write a story') : signInButton(true), !user && h('a', { class: 'btn ghost', href: '#/write' }, 'See how it works'))
  );
  const featured = h('section', { class: 'featured' });
  const gridHead = h('div', { class: 'section-h' }, h('h3', {}, 'Latest'));
  const grid = h('div', { class: 'grid' });
  const empty = h('div', { class: 'empty' }, h('h3', {}, 'No stories yet'), h('p', {}, 'Be the first to publish a live 3D story.'), h('a', { class: 'btn', href: '#/write' }, 'Write the first one'));
  const wrap = h('div', { class: 'wrap' }, hero, featured, gridHead, grid, empty);
  app.append(wrap);

  let key = '';
  let ents = new Map(); // id -> graphic
  let disposers = [];
  const teardown = () => {
    disposers.splice(0).forEach((f) => f());
    ents.forEach((g) => g.dispose());
    ents = new Map();
  };

  const paint = (list) => {
    empty.hidden = list.length > 0;
    gridHead.hidden = list.length < 2;
    const k = list.map((s) => s.id + specKey(s.graphic)).join(',');
    if (k === key) {
      list.forEach((s) => ents.get(s.id)?.setSpec(s.graphic)); // same shape: just ease to new numbers
      return;
    }
    key = k;
    teardown();
    featured.replaceChildren();
    grid.replaceChildren();
    list.forEach((s, i) => {
      const g = createGraphic(s.graphic);
      ents.set(s.id, g);
      if (i === 0) {
        const stage = h('div', { class: 'stage' }, h('span', { class: 'pill' }, h('i', { class: 'pulse' }), 'Live'), h('span', { class: 'hint' }, 'Drag to rotate · scroll to zoom'));
        featured.append(
          stage,
          h(
            'div',
            { class: 'copy' },
            liveTags(s),
            h('h2', {}, h('a', { href: `#/story/${s.id}` }, s.title)),
            s.dek && h('p', {}, s.dek),
            h('div', { class: 'by' }, avatar(s.author, true), h('span', {}, h('b', {}, s.author?.name), ' · ', ago(s.createdAt))),
            h('div', { style: 'margin-top:22px' }, h('a', { class: 'btn', href: `#/story/${s.id}` }, 'Open story'))
          )
        );
        const m = mountStage(stage, g);
        disposers.push(m.dispose);
      } else {
        const canvas = h('canvas', { class: 'thumb', 'aria-hidden': 'true' });
        grid.append(
          h('a', { class: 'card fade', href: `#/story/${s.id}` }, canvas, h('h4', {}, s.title), h('div', { class: 'meta' }, h('span', { class: 'tag type' }, TYPES[s.graphic.type]), h('span', {}, ago(s.createdAt))))
        );
        disposers.push(thumbs.add(canvas, g));
      }
    });
  };
  const unsub = store.subscribeStories(paint);
  onLeave(() => {
    unsub();
    teardown();
  });
}

/* ---------- STORY ---------- */
function normalizeFeed(json, prev) {
  let rows = [];
  if (Array.isArray(json)) rows = json.map((r) => [r.label ?? r.name, r.value]);
  else if (json && typeof json === 'object') rows = Object.entries(json.items && !Array.isArray(json.items) ? json.items : json);
  return rows
    .filter(([l, v]) => l != null && Number.isFinite(Number(v)))
    .slice(0, 12)
    .map(([l, v]) => {
      const old = prev.find((p) => p.label === String(l));
      return { ...(old || {}), label: String(l).slice(0, 24), value: Number(v) };
    });
}

function storyView(id) {
  const root = h('article', { class: 'wrap story' }, h('div', { class: 'skeleton' }));
  app.append(root);
  let story = null;
  let graphic = null;
  let stage = null;
  let legendKey = '';
  let rows = [];
  let pillEl;
  let pillText;
  let lastFeed = 0;
  let feedTimer = 0;
  let saveTm = 0;
  const timers = [];

  const legendEl = h('div', { class: 'legend' });
  const buildLegend = () => {
    const s = story.graphic;
    legendEl.replaceChildren(h('h5', {}, 'By the numbers'));
    rows = s.items.map((it) => {
      const v = h('b', {}, '0');
      const bar = h('i');
      legendEl.append(h('div', { class: 'row' }, h('div', { class: 'top2' }, h('span', {}, it.label), v), h('div', { class: 'bar' }, bar)));
      return { v, bar };
    });
  };

  const tick = () => {
    if (!graphic) return;
    const mx = graphic.dom || 1;
    rows.forEach((r, i) => {
      const val = graphic.value(i);
      const t = fmt(val, graphic.spec.unit);
      if (r.v.textContent !== t) r.v.textContent = t;
      r.bar.style.width = Math.min(100, (val / mx) * 100) + '%';
    });
    raf = requestAnimationFrame(tick);
  };
  let raf = 0;

  const pillTick = () => {
    if (!pillText || !story) return;
    const g = story.graphic;
    pillText.textContent = hasLive(g) ? 'streaming' : 'updated ' + ago(lastFeed || story.updatedAt);
  };
  const flash = () => {
    if (!pillEl) return;
    pillEl.classList.remove('flash');
    void pillEl.offsetWidth;
    pillEl.classList.add('flash');
  };

  async function pull() {
    const src = story?.graphic.source;
    if (!src) return;
    try {
      const r = await fetch(src, { cache: 'no-store' });
      const items = normalizeFeed(await r.json(), story.graphic.items);
      if (items.length) {
        graphic.setSpec({ ...story.graphic, items });
        lastFeed = Date.now();
        flash();
      }
    } catch {
      /* feed unreachable (or blocked by CORS) — keep showing the last numbers */
    }
  }

  function first(s) {
    story = s;
    document.title = `${s.title} — firstspot`;
    graphic = createGraphic(s.graphic);
    const mine = user && s.author?.uid === user.uid;
    pillText = h('span', { class: 'sub' }, '');
    pillEl = h('span', { class: 'pill' }, h('i', { class: 'pulse' }), 'Live ', pillText);
    stage = h('div', { class: 'stage' }, pillEl, h('span', { class: 'hint' }, 'Drag to rotate · scroll to zoom'));
    buildLegend();
    legendKey = specKey(s.graphic);
    const body = (s.body || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    root.replaceChildren(
      ...[
      h('a', { class: 'back', href: '#/' }, '← All stories'),
      liveTags(s),
      h('h1', {}, s.title),
      s.dek && h('p', { class: 'dek' }, s.dek),
      h('div', { class: 'byline' }, avatar(s.author, true), h('div', { class: 'by' }, h('b', {}, s.author?.name), h('span', { class: 'sep' }, '·'), h('span', {}, ago(s.createdAt)))),
      h('div', { class: 'story-grid fade' }, stage, legendEl),
      body.length > 0 && h('div', { class: 'prose' }, body.map((p) => h('p', {}, p))),
      mine && authorPanel(s),
      ].filter(Boolean)
    );
    const m = mountStage(stage, graphic);
    onLeave(m.dispose);
    raf = requestAnimationFrame(tick);
    pillTick();
    timers.push(setInterval(pillTick, 1000));
    if (s.graphic.source && /^https:\/\//.test(s.graphic.source)) {
      pull();
      feedTimer = setInterval(pull, 10000);
    }
  }

  function authorPanel(s) {
    const draft = s.graphic.items.map((i) => ({ ...i }));
    const save = () => {
      clearTimeout(saveTm);
      saveTm = setTimeout(() => store.updateItems(id, draft).catch(() => toast('Couldn’t push the update')), 280);
    };
    const inputs = draft.map((it, i) =>
      h(
        'label',
        { class: 'field', style: 'margin:0' },
        h('span', {}, it.label),
        h('input', {
          class: 'in',
          type: 'number',
          step: 'any',
          value: it.value,
          oninput: (e) => {
            const v = parseFloat(e.target.value);
            if (Number.isFinite(v)) {
              draft[i].value = v;
              save();
            }
          },
        })
      )
    );
    return h(
      'section',
      { class: 'panel' },
      h('h3', {}, 'Push a live update'),
      h('p', { class: 'sub' }, 'Change a number and every reader watching sees the graphic move, with no refresh.'),
      h('div', { class: 'rows' }, inputs),
      h(
        'div',
        { class: 'actions' },
        h('a', { class: 'btn ghost sm', href: `#/write/${id}` }, 'Edit story'),
        h(
          'button',
          {
            class: 'btn ghost sm danger',
            onclick: async () => {
              if (!confirm('Delete this story for everyone?')) return;
              await store.deleteStory(id);
              toast('Story deleted');
              location.hash = '#/';
            },
          },
          'Delete'
        )
      )
    );
  }

  const unsub = store.subscribeStory(id, (s) => {
    if (!s) {
      root.replaceChildren(h('div', { class: 'gate' }, h('h2', {}, 'Story not found'), h('p', {}, 'It may have been deleted.'), h('a', { class: 'btn', href: '#/' }, 'Back home')));
      return;
    }
    if (!story) return first(s);
    story = s;
    const k = specKey(s.graphic);
    graphic.setSpec(s.graphic);
    if (k !== legendKey) {
      legendKey = k;
      buildLegend();
    }
    lastFeed = 0;
    flash();
    pillTick();
  });
  onLeave(() => {
    unsub();
    cancelAnimationFrame(raf);
    clearInterval(feedTimer);
    clearTimeout(saveTm);
    timers.forEach(clearInterval);
    graphic?.dispose();
    document.title = 'firstspot — news you can touch';
  });
}

/* ---------- EDITOR ---------- */
const BLANK = {
  title: '',
  dek: '',
  body: '',
  graphic: {
    type: 'bars',
    unit: '',
    color: 'blue',
    source: '',
    live: false,
    items: [
      { label: 'Alpha', value: 40 },
      { label: 'Beta', value: 65 },
      { label: 'Gamma', value: 30 },
    ],
  },
};
const GEO_DEFAULT = [
  ['London', 51.5, -0.1],
  ['New York', 40.7, -74],
  ['Tokyo', 35.7, 139.7],
  ['Sydney', -33.9, 151.2],
];

async function editorView(id) {
  const wrap = h('section', { class: 'wrap editor' });
  app.append(wrap);
  if (!user) {
    wrap.append(
      h('div', { class: 'gate' }, h('h2', {}, 'Sign in to write'), h('p', {}, 'Publish stories with live 3D graphics. It takes one click with Google, and about a minute to build your first graphic.'), signInButton(true))
    );
    return;
  }
  let draft = structuredClone(BLANK);
  if (id) {
    const s = await store.getStory(id);
    if (!s || s.author?.uid !== user.uid) {
      wrap.append(h('div', { class: 'gate' }, h('h2', {}, 'You can’t edit this story'), h('p', {}, 'Only its author can.'), h('a', { class: 'btn', href: '#/' }, 'Back home')));
      return;
    }
    draft = { title: s.title, dek: s.dek || '', body: s.body || '', graphic: { source: '', live: false, ...structuredClone(s.graphic), live: s.graphic.items.some((i) => i.sim) } };
  }
  const g = draft.graphic;

  const previewBox = h('div', { class: 'preview' });
  let graphicObj = null;
  let mount = null;
  let mountedType = '';

  const collect = () =>
    g.items
      .filter((i) => String(i.label).trim() && Number.isFinite(Number(i.value)))
      .map((i, n) => {
        const o = { label: String(i.label).trim().slice(0, 24), value: Number(i.value) };
        if (g.type === 'globe') {
          o.lat = Number.isFinite(+i.lat) ? +i.lat : 0;
          o.lon = Number.isFinite(+i.lon) ? +i.lon : 0;
        }
        if (g.live) o.sim = { amp: Math.max(Math.abs(o.value) * 0.09, 0.5), period: 14 + ((n * 7) % 19), phase: n * 1.3 };
        return o;
      });
  const spec = () => ({ type: g.type, unit: g.unit, color: g.color, items: collect() });

  function refresh() {
    const sp = spec();
    if (!sp.items.length) return;
    if (!graphicObj || mountedType !== g.type) {
      mount?.dispose();
      graphicObj?.dispose();
      graphicObj = createGraphic(sp);
      mountedType = g.type;
      previewBox.replaceChildren();
      const stage = h('div', { class: 'stage' }, h('span', { class: 'pill' }, h('i', { class: 'pulse' }), 'Preview'), h('span', { class: 'hint' }, 'Drag to rotate · scroll to zoom'));
      previewBox.append(stage, h('p', { class: 'sub', style: 'color:var(--muted);font-size:13px;margin-top:12px;text-align:center' }, 'This is exactly what readers will see.'));
      mount = mountStage(stage, graphicObj);
    } else graphicObj.setSpec(sp);
  }

  /* form pieces */
  const seg = h('div', { class: 'seg', role: 'tablist' });
  const paintSeg = () => {
    seg.replaceChildren(
      ...Object.entries(TYPES).map(([k, label]) =>
        h('button', {
          type: 'button',
          class: g.type === k ? 'on' : '',
          onclick: () => {
            g.type = k;
            if (k === 'globe') g.items.forEach((it, i) => { if (it.lat == null) { const d = GEO_DEFAULT[i % GEO_DEFAULT.length]; it.lat = d[1]; it.lon = d[2]; } });
            paintSeg();
            paintItems();
            refresh();
          },
        }, label)
      )
    );
  };
  const sw = h('div', { class: 'swatches' });
  const paintSw = () =>
    sw.replaceChildren(
      ...Object.entries(PALETTE).map(([k, c]) =>
        h('button', { type: 'button', class: g.color === k ? 'on' : '', style: `background:${c}`, 'aria-label': k, onclick: () => { g.color = k; paintSw(); refresh(); } })
      )
    );
  const itemsEl = h('div', { class: 'items' });
  const addBtn = h('button', { type: 'button', class: 'btn ghost sm', style: 'margin-top:10px', onclick: () => {
    if (g.items.length >= 10) return toast('Ten items is the max');
    const n = g.items.length;
    const d = GEO_DEFAULT[n % GEO_DEFAULT.length];
    g.items.push({ label: `Item ${n + 1}`, value: 50, lat: d[1], lon: d[2] });
    paintItems();
    refresh();
  } }, '+ Add item');
  function paintItems() {
    const geo = g.type === 'globe';
    itemsEl.replaceChildren(
      ...g.items.map((it, i) => {
        const bind = (key, ph, type = 'text', cls = '') =>
          h('input', { class: 'in ' + cls, type, step: 'any', placeholder: ph, value: it[key] ?? '', 'aria-label': ph, oninput: (e) => { it[key] = type === 'number' ? e.target.value : e.target.value; refresh(); } });
        return h(
          'div',
          { class: 'item' + (geo ? ' geo' : '') },
          bind('label', 'Label'),
          bind('value', 'Value', 'number'),
          geo && bind('lat', 'Lat', 'number'),
          geo && bind('lon', 'Lon', 'number'),
          h('button', { type: 'button', class: 'x', 'aria-label': 'Remove', onclick: () => { if (g.items.length <= 1) return; g.items.splice(i, 1); paintItems(); refresh(); } }, '×')
        );
      })
    );
  }

  const title = h('input', { class: 'in title', placeholder: 'Headline', maxlength: 140, value: draft.title, oninput: (e) => (draft.title = e.target.value) });
  const dek = h('input', { class: 'in', placeholder: 'One-line summary (optional)', maxlength: 220, value: draft.dek, oninput: (e) => (draft.dek = e.target.value) });
  const body = h('textarea', { class: 'in', placeholder: 'Write your story. Leave a blank line between paragraphs.', oninput: (e) => (draft.body = e.target.value) }, draft.body);
  const unit = h('input', { class: 'in', placeholder: 'e.g. GW, %, votes', maxlength: 14, value: g.unit, oninput: (e) => { g.unit = e.target.value; refresh(); } });
  const live = h('input', { type: 'checkbox', checked: g.live, onchange: (e) => { g.live = e.target.checked; refresh(); } });
  const source = h('input', { class: 'in', type: 'url', placeholder: 'https://example.com/data.json (optional)', value: g.source, oninput: (e) => (g.source = e.target.value.trim()) });

  const publish = h('button', { class: 'btn', type: 'button' }, id ? 'Save changes' : 'Publish');
  publish.onclick = async () => {
    const items = collect();
    if (!draft.title.trim()) return toast('Add a headline first');
    if (items.length < 1) return toast('Add at least one item with a number');
    if (g.source && !/^https:\/\//.test(g.source)) return toast('Live data URL must start with https://');
    publish.disabled = true;
    try {
      const out = await store.saveStory(
        { title: draft.title.trim(), dek: draft.dek.trim(), body: draft.body.trim(), graphic: { type: g.type, unit: g.unit.trim(), color: g.color, source: g.source, items } },
        id
      );
      toast(id ? 'Saved' : 'Published');
      location.hash = `#/story/${out}`;
    } catch (e) {
      publish.disabled = false;
      toast(e.message || 'Couldn’t publish');
    }
  };

  const field = (label, el, hint) => h('label', { class: 'field' }, h('span', {}, label), el, hint && h('small', {}, hint));
  wrap.append(
    h('h1', {}, id ? 'Edit story' : 'New story'),
    h('p', { class: 'lede' }, 'Pick a graphic, add your numbers, publish. You can push new numbers any time and readers see them move live.'),
    h(
      'div',
      { class: 'ed-grid' },
      h(
        'div',
        {},
        field('Headline', title),
        field('Summary', dek),
        h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Graphic'), seg),
        h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Colour'), sw),
        field('Unit', unit),
        h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Data'), itemsEl, addBtn),
        h('label', { class: 'field check' }, live, h('span', {}, 'Make it breathe', h('small', {}, 'Numbers drift gently on their own, handy for a feed-like feel. You can still push real updates anytime.'))),
        field('Live data URL', source, 'Optional. A public https JSON endpoint, either [{"label","value"}] or {"Label": value}. Readers’ browsers poll it every 10 seconds.'),
        field('Story', body),
        h('div', { class: 'row2' }, publish, h('a', { class: 'btn ghost', href: id ? `#/story/${id}` : '#/' }, 'Cancel'))
      ),
      previewBox
    )
  );
  paintSeg();
  paintSw();
  paintItems();
  refresh();
  onLeave(() => {
    mount?.dispose();
    graphicObj?.dispose();
  });
}

/* ---------- boot ---------- */
(async function boot() {
  store = await createStore();
  if (store.mode === 'demo') {
    const b = document.getElementById('banner');
    let dismissed = false;
    try { dismissed = sessionStorage.getItem('fs.banner') === '1'; } catch {}
    if (!dismissed) {
      b.hidden = false;
      b.append(
        h('span', {}, 'Demo mode: sign-in and stories live in this browser only. Add your Firebase keys in ', h('code', {}, 'js/config.js'), ' for real Google login and live sync.'),
        h('button', { 'aria-label': 'Dismiss', onclick: () => { b.hidden = true; try { sessionStorage.setItem('fs.banner', '1'); } catch {} } }, '×')
      );
    }
  }
  let first = true;
  store.onAuth((u) => {
    const changed = (u?.uid || null) !== (user?.uid || null);
    user = u;
    renderAuth();
    if (!first && changed) route();
  });
  await store.authReady;
  first = false;
  window.addEventListener('hashchange', route);
  route();
})();
