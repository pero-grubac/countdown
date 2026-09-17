# Countdown

A small, client-side countdown utility. Create multiple timers — either a
duration ("25 minutes") or a target moment ("Sep 20, 12:00") — and each one
counts down live. Timers survive refreshes, closed tabs, and offline periods
because the **target timestamp** is the source of truth, not a decrementing
counter.

Plain HTML, CSS, and vanilla JavaScript. No build step, no framework.

## Features

- **Two ways to count down** — a duration, or a specific date and time.
- **Locale-aware, Monday-first** — the calendar always starts weeks on Monday,
  while times are shown and entered in the visitor's own format (24-hour, or
  12-hour with AM/PM).
- **Alert sound on end** — five sounds (Chime, Bell, Marimba, Arcade, Alarm),
  chosen per timer and synthesized with the Web Audio API (no audio files).
- **Confetti on end** — an optional canvas burst; skipped under
  `prefers-reduced-motion`.
- **Background notifications** — an optional browser notification when a timer
  ends, so it reaches you even if the tab isn't focused (requires permission;
  delivery is best-effort since browsers throttle hidden tabs).
- **Settings** — toggle sound, confetti, and notifications; saved locally.

## Run locally

Because it registers a service worker and loads modules over `http(s)`, open it
through a local server rather than `file://`:

```bash
# any static server works, e.g.
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Deploy to GitHub Pages

1. Push these files to a repository (root or a `/docs` folder).
2. In **Settings → Pages**, set the source to that branch/folder.
3. Open `https://<user>.github.io/<repo>/`.

All asset paths are **relative**, so it works from a project subpath
(`/<repo>/`) without changes. The service worker's scope follows the same path.

## How it stays accurate

Remaining time is always computed as `targetTime - Date.now()`. A
`requestAnimationFrame` loop (throttled to ~4 fps) only decides *when* to
repaint; it never counts down itself. When the tab is hidden the loop pauses,
and a `visibilitychange` / `focus` handler forces an immediate, correct repaint
the moment you return — so a tab suspended for 30 seconds shows the right time
instantly.

## Project layout

```
index.html              markup + app shell
styles.css              tokens, light/dark theme, layout, components
manifest.webmanifest    PWA metadata
service-worker.js       offline app-shell cache
favicon.svg, icons/     app icons
js/
  storage.js            localStorage abstraction (timers + settings)
  format.js             pure display formatting (remaining time, target date)
  model.js              timer creation, remaining/state/progress derivation
  sound.js              Web Audio alert sounds (synthesized)
  confetti.js           canvas confetti burst
  notify.js             Notification API wrapper
  ui.js                 DOM rendering, the create/edit modal, the date picker
  app.js                controller: state, CRUD, redraw loop, notifications, SW
```

## Data model

```js
{
  id: "uuid",
  name: "Deadline",
  targetTime: 1790000000000,
  createdAt: 1789990000000,
  sound: "chime"
}
```

Identity is the `id`, never array position. `createdAt` gives the progress bar
its full interval (`targetTime - createdAt`). `sound` is the alert to play when
this timer ends. Settings (sound / confetti / notify) are stored separately.
