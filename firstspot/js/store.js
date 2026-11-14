// firstspot — data layer.
//   • Firebase mode (js/config.js filled in): real Google login + Firestore with live listeners.
//   • Demo mode (default):                   fake Google login + stories kept in this browser,
//                                             synced live between tabs. Zero setup.
import { firebaseConfig } from './config.js';

const clean = (o) => JSON.parse(JSON.stringify(o));

export async function createStore() {
  if (firebaseConfig && firebaseConfig.apiKey) {
    try {
      return await firebaseStore(firebaseConfig);
    } catch (e) {
      console.warn('Firebase failed to start, falling back to demo mode', e);
    }
  }
  return demoStore();
}

/* =================== Firebase =================== */
async function firebaseStore(cfg) {
  const base = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const [appM, authM, fsM] = await Promise.all([
    import(base + 'firebase-app.js'),
    import(base + 'firebase-auth.js'),
    import(base + 'firebase-firestore.js'),
  ]);
  const app = appM.initializeApp(cfg);
  const auth = authM.getAuth(app);
  const db = fsM.getFirestore(app);
  const col = fsM.collection(db, 'stories');

  const toUser = (u) =>
    u && { uid: u.uid, name: u.displayName || 'Reader', email: u.email, photo: u.photoURL || '' };
  const fromSnap = (d) => ({ id: d.id, ...d.data() });

  let resolveReady;
  const authReady = new Promise((r) => (resolveReady = r));
  const authSubs = new Set();
  let current = null;
  authM.onAuthStateChanged(auth, (u) => {
    current = toUser(u);
    authSubs.forEach((f) => f(current));
    resolveReady();
  });

  return {
    mode: 'firebase',
    authReady,
    onAuth(cb) {
      authSubs.add(cb);
      if (current !== null) cb(current);
      return () => authSubs.delete(cb);
    },
    async signIn() {
      await authM.signInWithPopup(auth, new authM.GoogleAuthProvider());
    },
    signOut: () => authM.signOut(auth),

    subscribeStories(cb) {
      const q = fsM.query(col, fsM.orderBy('createdAt', 'desc'), fsM.limit(60));
      return fsM.onSnapshot(q, (s) => cb(s.docs.map(fromSnap)));
    },
    subscribeStory(id, cb) {
      return fsM.onSnapshot(fsM.doc(db, 'stories', id), (d) => cb(d.exists() ? fromSnap(d) : null));
    },
    async getStory(id) {
      const d = await fsM.getDoc(fsM.doc(db, 'stories', id));
      return d.exists() ? fromSnap(d) : null;
    },
    async saveStory(story, id) {
      if (!current) throw new Error('Sign in first');
      const now = Date.now();
      if (id) {
        const { title, dek, body, graphic } = story;
        await fsM.updateDoc(fsM.doc(db, 'stories', id), clean({ title, dek, body, graphic, updatedAt: now }));
        return id;
      }
      const ref = await fsM.addDoc(
        col,
        clean({ ...story, author: { uid: current.uid, name: current.name, photo: current.photo }, createdAt: now, updatedAt: now })
      );
      return ref.id;
    },
    /** The live part: push new numbers and every open reader sees them ease into place. */
    async updateItems(id, items) {
      await fsM.updateDoc(fsM.doc(db, 'stories', id), clean({ 'graphic.items': items, updatedAt: Date.now() }));
    },
    deleteStory: (id) => fsM.deleteDoc(fsM.doc(db, 'stories', id)),
  };
}

/* =================== Demo =================== */
const KEY = 'firstspot.stories.v1';
const USER = 'firstspot.user.v1';

function seeds() {
  const now = Date.now();
  const H = 3600e3;
  const desk = { uid: 'desk', name: 'firstspot desk', photo: '' };
  const sim = (amp, period, phase) => ({ amp, period, phase });
  return [
    {
      id: 'sample-ports',
      sample: true,
      title: 'The world’s busiest ports, moving in real time',
      dek: 'Container throughput at six major hubs. Drag the globe, and watch the towers breathe.',
      body:
        'This is a sample story that ships with firstspot so you can see what a live graphic feels like.\n\n' +
        'Each tower is a port, and its height is throughput. The numbers here drift on their own; on a real story, the author pushes new values and every reader sees the towers ease into place without refreshing.\n\n' +
        'Sign in, hit Write, and build one of your own in about a minute.',
      author: desk,
      createdAt: now - 1 * H,
      updatedAt: now - 1 * H,
      graphic: {
        type: 'globe',
        unit: 'k TEU/day',
        color: 'blue',
        items: [
          { label: 'Shanghai', value: 48, lat: 31.2, lon: 121.5, sim: sim(5, 23, 0) },
          { label: 'Singapore', value: 39, lat: 1.35, lon: 103.8, sim: sim(4, 31, 1.3) },
          { label: 'Rotterdam', value: 28, lat: 51.9, lon: 4.5, sim: sim(3, 19, 2.1) },
          { label: 'Los Angeles', value: 24, lat: 33.7, lon: -118.3, sim: sim(3, 27, 0.7) },
          { label: 'Dubai', value: 21, lat: 25.0, lon: 55.1, sim: sim(2.5, 17, 3.1) },
          { label: 'Santos', value: 14, lat: -23.9, lon: -46.3, sim: sim(2, 29, 4.2) },
        ],
      },
    },
    {
      id: 'sample-grid',
      sample: true,
      title: 'Who’s keeping the lights on this afternoon?',
      dek: 'A live look at the power mix, source by source.',
      body:
        'Sample data, live motion. Bars rise and fall as the mix shifts through the day.\n\n' +
        'Because a graphic is just a list of labels and numbers, anything can be a story: election nights, sports scores, sensor readings, sales, weather.',
      author: desk,
      createdAt: now - 3 * H,
      updatedAt: now - 3 * H,
      graphic: {
        type: 'bars',
        unit: 'GW',
        color: 'mint',
        items: [
          { label: 'Wind', value: 31, sim: sim(4, 21, 0) },
          { label: 'Solar', value: 27, sim: sim(5, 33, 1.1) },
          { label: 'Hydro', value: 14, sim: sim(1.5, 25, 2) },
          { label: 'Nuclear', value: 18, sim: sim(0.6, 40, 0.4) },
          { label: 'Gas', value: 21, sim: sim(3, 18, 3) },
          { label: 'Coal', value: 6, sim: sim(1, 28, 5) },
        ],
      },
    },
    {
      id: 'sample-footfall',
      sample: true,
      title: 'The shape of a week downtown',
      dek: 'Foot traffic across seven days, rendered as terrain.',
      body:
        'Sample data again, this time as a landscape. Peaks mark the busiest days, valleys the quiet ones.\n\n' +
        'Orbit around it and look at the ridgeline from the side.',
      author: desk,
      createdAt: now - 6 * H,
      updatedAt: now - 6 * H,
      graphic: {
        type: 'terrain',
        unit: 'k visitors',
        color: 'violet',
        items: [
          { label: 'Mon', value: 42, sim: sim(4, 22, 0) },
          { label: 'Tue', value: 51, sim: sim(4, 26, 1) },
          { label: 'Wed', value: 58, sim: sim(5, 20, 2) },
          { label: 'Thu', value: 63, sim: sim(5, 30, 3) },
          { label: 'Fri', value: 79, sim: sim(6, 24, 4) },
          { label: 'Sat', value: 91, sim: sim(7, 28, 5) },
          { label: 'Sun', value: 55, sim: sim(4, 19, 6) },
        ],
      },
    },
  ];
}

function demoStore() {
  const sd = seeds();
  const read = (k, d) => {
    try {
      return JSON.parse(localStorage.getItem(k)) ?? d;
    } catch {
      return d;
    }
  };
  const write = (k, v) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  };
  const mine = () => read(KEY, []);
  const all = () => [...mine(), ...sd].sort((a, b) => b.createdAt - a.createdAt);

  const bc = 'BroadcastChannel' in window ? new BroadcastChannel('firstspot-demo') : null;
  const storySubs = new Set();
  const authSubs = new Set();
  const getUser = () => read(USER, null);
  const notify = () => storySubs.forEach((f) => f());
  const notifyAuth = () => authSubs.forEach((f) => f(getUser()));
  if (bc)
    bc.onmessage = (e) => {
      if (e.data === 'stories') notify();
      if (e.data === 'auth') notifyAuth();
    };
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) notify();
    if (e.key === USER) notifyAuth();
  });
  const touch = (what) => {
    bc?.postMessage(what);
    what === 'auth' ? notifyAuth() : notify();
  };

  return {
    mode: 'demo',
    authReady: Promise.resolve(),
    onAuth(cb) {
      authSubs.add(cb);
      cb(getUser());
      return () => authSubs.delete(cb);
    },
    async signIn() {
      write(USER, { uid: 'demo-user', name: 'Demo Reader', email: 'demo@firstspot.local', photo: '' });
      touch('auth');
    },
    async signOut() {
      localStorage.removeItem(USER);
      touch('auth');
    },
    subscribeStories(cb) {
      const f = () => cb(all());
      storySubs.add(f);
      f();
      return () => storySubs.delete(f);
    },
    subscribeStory(id, cb) {
      const f = () => cb(all().find((s) => s.id === id) || null);
      storySubs.add(f);
      f();
      return () => storySubs.delete(f);
    },
    async getStory(id) {
      return all().find((s) => s.id === id) || null;
    },
    async saveStory(story, id) {
      const u = getUser();
      if (!u) throw new Error('Sign in first');
      const list = mine();
      const now = Date.now();
      if (id) {
        const i = list.findIndex((s) => s.id === id);
        if (i < 0) throw new Error('Not found');
        const { title, dek, body, graphic } = story;
        list[i] = { ...list[i], title, dek, body, graphic, updatedAt: now };
      } else {
        id = 'u' + now.toString(36) + Math.random().toString(36).slice(2, 6);
        list.push({ ...story, id, author: { uid: u.uid, name: u.name, photo: '' }, createdAt: now, updatedAt: now });
      }
      write(KEY, list);
      touch('stories');
      return id;
    },
    async updateItems(id, items) {
      const list = mine();
      const s = list.find((x) => x.id === id);
      if (!s) return;
      s.graphic.items = items;
      s.updatedAt = Date.now();
      write(KEY, list);
      touch('stories');
    },
    async deleteStory(id) {
      write(KEY, mine().filter((s) => s.id !== id));
      touch('stories');
    },
  };
}
