# GoldenHour — ambulance app

A paramedic fills a short form, taps **Broadcast request**, and every hospital
registered within the chosen radius is alerted at once. The first hospital to
accept claims the case; the ambulance screen updates itself to
**"Accepted by …"**, shares live GPS with that hospital, and closes the case
on **Reached hospital**.

Plain HTML/CSS/JS. No framework, no runtime dependencies beyond the bundled
Socket.IO client. Wrapped by Capacitor into an Android APK.

---

## Try it in 5 seconds

Serve `www/` (or open `www/index.html`). With `MODE: "demo"` in
`www/config.js` — or `window.__GH_DEMO = true` — it runs on sample data with a
simulated hospital acceptance and never touches the network.

## Run the tests

```bash
npm install
npm test            # unit (logic) + functional (jsdom: full paramedic flow + design guards)
npm run test:e2e    # real-browser journey with Playwright, if installed (screenshots → tests/e2e/out)
```

`test:e2e` drives the app at 360/390/412 px, light and dark, full glass and
lite, and checks what only a renderer can: the font loads, nothing overflows
sideways, every tap target is ≥ 44 px, the Broadcast dock stays above the tab
bar. Point it at a built APK's files with
`E2E_ROOT=unzipped-apk/assets/public npm run test:e2e`.

## Build the APK

### Option A — GitHub Actions (no Android Studio needed)

1. Push to `main`/`master` or open a pull request
   (or **Actions** → **Build GoldenHour APK** → **Run workflow** on `main`)
2. Download the `goldenhour-debug-apk` artifact when it goes green
3. Copy `app-debug.apk` to a phone and tap to install
   (allow "Install unknown apps" once)

Each CI run signs with a fresh debug key, so Android treats every build as a
different signer: uninstall the previous build first (queued cases and local
history live in the app's storage and go with it).

### Option B — locally

Needs JDK 21 and the Android SDK (platform 36).

```bash
npm install
npx cap sync android
cd android && ./gradlew assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk
```

## Go live

Set the backend in `www/config.js`:

```js
SERVER_BASE: "https://your-backend.example.com",
```

`MODE: "auto"` goes live whenever a server can be resolved. See `API.md` for
the contract.

---

## Design system — "liquid glass" (v4)

Same palette and screens as before; the surface language and its cost changed.

- **Palette unchanged.** Cyan navigates, orange acts; green / amber / red only
  ever mean clinical state. A test fails if a core colour token moves.
- **Glass where it floats, frost where it scrolls.** Real backdrop blur is
  spent only on the top bar, the floating tab bar, the Broadcast dock and the
  sheet scrim. Cards get their frosted look from translucency over a static
  gradient, which costs nothing per scroll frame.
- **Lighter visuals.** Phones with ≤ 3 GB RAM or ≤ 4 cores get `html.fx-lite`
  before first paint (no blur, same layout). Crews can switch it in
  **Settings → Appearance**, along with System / Light / Dark.
- **Motion** is transform/opacity only: screens rise in, the tab lens slides
  on a spring, sheets come up from the bottom. `prefers-reduced-motion` and
  `prefers-reduced-transparency` are honoured.
- **Type & icons ship inside the app:** Inter variable (48 KB, OFL) in
  `www/fonts/`, and a hand-picked Lucide subset (ISC) inlined as an SVG sprite
  in `index.html`. Nothing is fetched from the internet.
- **Comfort:** the Broadcast button is docked above the tab bar so it is
  always in reach; the floating bars step aside while the keyboard is up; a
  new screen opens at the top.

## Layout

```
www/                   the web app — the source of truth
  index.html           every screen, plus the icon sprite
  style.css            liquid-glass design system
  app.js               all case logic (Capacitor, transport, outbox, case book)
  ui.js                presentation only: tab lens, appearance, keyboard, slider
  config.js            backend address and mode
  fonts/               Inter (variable, Latin) + licence
  vendor/              Socket.IO client
capacitor.config.json
android/               generated Capacitor project (manifest is hand-edited)
tests/                 unit, functional (jsdom) and e2e (Playwright) suites
.github/workflows/     CI that tests and builds the APK
API.md                 backend contract
```

Edit `www/`, then run `npx cap sync android` to copy it into the APK project.

`app.js` in `www/` is the built bundle taken from the working APK; if you keep
the original modular source elsewhere, port changes there too. `ui.js` never
calls into `app.js` — it only reads the DOM — so the two can evolve separately.
