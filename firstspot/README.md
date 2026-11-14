# firstspot

News you can touch. A tiny, modern news site where every story can carry a **live, interactive 3D graphic** (bars, globe, or terrain) and readers sign in with **Google**.

No build step, no framework: plain HTML, CSS and ES modules, with [three.js](https://threejs.org) vendored in `vendor/`.

## Try it now (demo mode)

```bash
cd firstspot
python3 -m http.server 8000
# open http://localhost:8000
```

Out of the box it runs in **demo mode**: the Google button signs you in as a local "Demo Reader", and stories are saved in your browser and synced live between tabs. Open a story in two tabs, change a number in one, and watch the other move.

## Go live (real Google login + shared live data)

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com).
2. **Authentication → Sign-in method → Google → Enable.**
3. **Firestore Database → Create database.**
4. **Project settings → Your apps → Web app**, then copy the config into `js/config.js`:
   ```js
   export const firebaseConfig = { apiKey: '…', authDomain: '…', projectId: '…', appId: '…' };
   ```
5. Publish `firestore.rules` (Firestore → Rules, or `firebase deploy --only firestore:rules`). Anyone can read; only signed-in authors can publish; only an author can edit, delete, or push live updates to their own story.
6. Authentication → Settings → **Authorized domains**: add the domain you host on.
7. Host the `firstspot/` folder anywhere static (Firebase Hosting, GitHub Pages, Netlify, Vercel…).

## How "live" works

A graphic is just a list of `{ label, value }` items. Three ways to make it move:

- **Author pushes an update.** On your story page, change a number under "Push a live update". It's written to Firestore, and every open reader sees the 3D graphic ease to the new value (Firestore `onSnapshot`).
- **Live data URL.** Point a story at a public https JSON endpoint (`[{"label":"A","value":3}]` or `{"A":3}`); readers' browsers poll it every 10 seconds. The endpoint must allow CORS.
- **Make it breathe.** Items drift gently on their own, deterministic by clock so everyone sees the same thing.

## Layout

```
index.html        shell + importmap
css/style.css     design tokens, light/dark, responsive
js/app.js         router + views (home, story, editor)
js/graphics.js    three.js scenes: Bars, Globe, Terrain (+ shared thumbnail renderer)
js/store.js       Firebase backend and demo backend, same interface
js/config.js      your Firebase config
firestore.rules   security rules
```

Adding a new graphic type: subclass `Graphic` in `js/graphics.js` (implement `build()` and `frame()`), register it in `CLASSES` and `TYPES`.
