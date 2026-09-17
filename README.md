<div align="center">

# ⏱️ Countdown

![Vanilla JS](https://img.shields.io/badge/Vanilla_JS-ES2020-f7df1e?style=flat-square&logo=javascript&logoColor=black)
![HTML5](https://img.shields.io/badge/HTML-5-e34f26?style=flat-square&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS-3-1572b6?style=flat-square&logo=css3&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-offline_ready-5a0fc8?style=flat-square&logo=pwa&logoColor=white)
![No Build](https://img.shields.io/badge/Build_step-none-3dd68c?style=flat-square)
![No Dependencies](https://img.shields.io/badge/Dependencies-none-3dd68c?style=flat-square)
![localStorage](https://img.shields.io/badge/Storage-localStorage-f5a623?style=flat-square)

[![Live Demo](https://img.shields.io/badge/⏱️_Live_Demo-countdown-3d5af1?style=for-the-badge)](https://pero-grubac.github.io/countdown/)

</div>

---

## 📌 Project Overview

**Countdown** is a small, client-side app for tracking the moments you're waiting
on — a deadline, a flight, a launch, a birthday, or a 25-minute focus timer. Create
as many timers as you like, each counting down live. The **target timestamp** is the
single source of truth, so a timer survives refreshes, closed tabs, offline periods,
and a sleeping laptop — it always shows the correct time, never a drifting counter.

Plain HTML, CSS, and vanilla JavaScript. No framework, no build step, no backend,
no tracking, no ads. It installs as a PWA and works fully offline.

---

## ✨ Features

- ⏳ **Two ways to count down** — a duration (`25 minutes`) or a specific date & time
- 🎯 **Accurate by design** — remaining time is always `targetTime − now`, so refresh, close, offline, and tab-sleep never throw it off
- 🗓️ **Custom date picker** — always starts weeks on **Monday**; time format is your choice: **24-hour**, **12-hour**, or **Auto (your region)**
- 🔔 **Alert sounds** — 5 built-in sounds (Chime · Bell · Marimba · Arcade · Alarm), chosen per timer, synthesized with the Web Audio API — no audio files
- 🎉 **Confetti on end** — an optional canvas burst; auto-skipped under reduced-motion
- 🖥️ **Background notifications** — an optional browser notification when a timer ends, so it reaches you even if the tab isn't focused
- 🔗 **Shareable links** — send a countdown to anyone; because the target is an absolute instant, everyone stays **in sync across time zones**
- 💾 **Persistent** — timers and settings live in `localStorage`; nothing leaves your device
- 📲 **Installable PWA** — offline app-shell via a service worker, maskable icons, standalone display
- ♿ **Accessible** — keyboard-navigable, focus-trapped modals, `role="timer"`, polite live regions, honors `prefers-reduced-motion`
- 🌗 **Light & dark** — follows your system theme; state shown by both label and color, never color alone

---

## 🧩 Timer states

| State | When | Shown as |
|-------|------|----------|
| **Active** | More than a minute remaining | Indigo pill + progress fill |
| **Ending soon** | Under 60 seconds left | Amber pill |
| **Expired** | Reached zero | Red pill, stops at `Expired`, stays until deleted |

---

## ⚙️ How It Works

### Accuracy model

Remaining time is **never** stored or decremented. Each timer keeps an absolute
`targetTime` (epoch ms), and the display is always computed as `targetTime − Date.now()`.

```
targetTime (fixed)  ──►  remaining = targetTime − now  ──►  formatted "02d 14h 31m 59s"
```

A `requestAnimationFrame` loop (throttled to ~4 fps) only decides *when* to repaint —
it never counts. When the tab is hidden the loop pauses; a `visibilitychange` / `focus`
handler forces an immediate, correct repaint the instant you return. So a tab suspended
for an hour shows the right time the moment it wakes.

### Architecture

Logic is fully separated from rendering. Pure modules know nothing about the DOM; the
UI layer knows nothing about persistence; the controller wires them together.

```
        storage.js   format.js   model.js        (pure logic — no DOM)
             │           │           │
             └───────────┴─────┬─────┘
                               ▼
        app.js  ──►  ui.js  ──►  DOM             (controller → render)
             │
             ├─ sound.js      (Web Audio alerts)
             ├─ confetti.js   (canvas burst)
             ├─ notify.js     (Notification API)
             └─ share.js      (encode/decode links)
```

### Sharing & sync

`share.js` packs a countdown (`id`, name, `targetTime`, `createdAt`, sound) into the URL
**hash** — no server required, so it works straight from static hosting. Opening the link
decodes it and adds that countdown to the recipient's list, then cleans the URL. Since the
target is an absolute instant, every device counts down to the exact same moment.

```
#c=<base64url({ id, n, t, c, s })>   →   decoded on load → imported once
```

### Background notifications

Each active timer schedules a `setTimeout` for its exact end time. Delivery is
**best-effort**: browsers throttle timers in hidden tabs and pause them during device
sleep, so a notification may arrive a little late — the on-screen sound and confetti still
fire from the paint loop. Reliable always-on-time background delivery would require real
push (a service worker + push service + backend).

### Storage

`storage.js` is a defensive `localStorage` wrapper: it validates every record, drops
malformed ones, recovers from corrupt JSON, and degrades to an in-memory session with a
visible notice if storage is blocked. Timers and settings are kept under separate keys.

---

## 📁 Project Structure

```
countdown/
├── index.html                 # App shell: masthead, grid, create/edit modal, settings
├── styles.css                 # Design tokens, light/dark theme, layout, components
├── manifest.webmanifest       # PWA metadata (name, icons, theme, standalone)
├── service-worker.js          # Offline app-shell cache (network-first navigations)
├── favicon.svg                # App mark (stopwatch)
├── icons/                     # PWA icons — 192, 512, maskable-512, apple-touch
└── js/
    ├── storage.js             # localStorage abstraction — timers + settings (safe)
    ├── format.js              # Pure formatting — remaining time, target date, clock mode
    ├── model.js               # Timer creation, remaining/state/progress derivation
    ├── sound.js               # Web Audio alert sounds (synthesized, 5 presets)
    ├── confetti.js            # Dependency-free canvas confetti burst
    ├── notify.js              # Notification API wrapper (permission + show)
    ├── share.js               # Shareable-link encode / decode via URL hash
    ├── ui.js                  # All DOM rendering, the modal, the date picker
    └── app.js                 # Controller: state, CRUD, redraw loop, scheduling, SW
```

---

## 🗃️ Data Model

```js
{
  id:         "uuid",           // identity — never the array position
  name:       "Deadline",       // optional
  targetTime: 1790000000000,    // absolute instant, epoch ms — the source of truth
  createdAt:  1789990000000,    // gives the progress bar its full interval
  sound:      "chime"           // alert to play when this timer ends
}
```

Settings (`timeFormat`, `sound`, `confetti`, `notify`) are stored under a separate key.

---

## 🚀 Setup & Run

There's **no build step** — it's static files. Because it registers a service worker and
loads modules over `http(s)`, serve it rather than opening `file://`:

```bash
# any static server works — pick one:
python3 -m http.server 8000
npx serve .
```

Then open [http://localhost:8000](http://localhost:8000).

### Prerequisites

- A modern browser
- Any static file server (for local development)

---

## 🌍 Deploy to GitHub Pages

No workflow or build needed — just publish the files:

1. Push the contents of this folder to a repository (root, or a `/docs` folder).
2. In **Settings → Pages → Source**, select that branch (and `/docs` if you used it).
3. Open `https://<your-username>.github.io/<repo>/`.

All asset paths are **relative**, so it works from a project subpath (`/<repo>/`) with no
changes, and the service worker's scope follows the same path.

---

## 🏗️ Tech Stack

| Tool | Role |
|------|------|
| HTML5 + CSS3 | Markup and styling (CSS custom properties, light/dark, responsive) |
| Vanilla JavaScript (ES2020) | All logic — no framework, no state library |
| Web Audio API | Synthesized alert sounds |
| Canvas 2D | Confetti burst |
| Notification API | Background end-of-timer alerts |
| Web Share / Clipboard API | Sharing countdown links |
| Service Worker | Offline app-shell caching |
| localStorage | Timer and settings persistence |
| Google Fonts (IBM Plex Mono) | Monospaced numerals so digits don't jitter — the only external asset |

No UI libraries. No CSS frameworks. No npm dependencies.

---

_Everything runs in your browser. No accounts, no tracking, no ads — your timers stay on
your device, and a share link carries only the countdown you choose to send._