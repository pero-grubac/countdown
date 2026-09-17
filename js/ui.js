/*
 * ui.js — everything that touches the DOM.
 *
 * app.js owns the data and the clock; this module owns pixels. They talk
 * through a small set of callbacks passed to init(), so neither reaches into
 * the other's internals.
 */
window.CD = window.CD || {};

CD.ui = (function () {
  "use strict";

  var fmt = CD.format;
  var model = CD.model;

  var cb = {}; // { onNew, onEdit, onDelete, onSubmit }
  var el = {}; // cached DOM references
  var cards = []; // live render refs, one per visible timer
  var editingId = null;
  var lastFocused = null; // element to restore focus to when the modal closes

  var STATE_TEXT = { active: "Active", soon: "Ending soon", expired: "Expired" };
  var MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  // Custom date picker state. calView is the first day of the shown month;
  // calSel is the chosen day as { y, m, d } (local), or null.
  var calView = null;
  var calSel = null;
  var use12h = false; // does the visitor's locale use a 12-hour clock?

  // Effects settings, kept in sync with storage via the app.
  var settings = { sound: true, confetti: true, notify: false, timeFormat: "24" };

  /* ---------- setup ---------- */

  function init(callbacks) {
    cb = callbacks || {};
    el.grid = document.getElementById("grid");
    el.empty = document.getElementById("empty");
    el.storageWarning = document.getElementById("storage-warning");

    el.modal = document.getElementById("modal");
    el.backdrop = document.getElementById("modal-backdrop");
    el.dialog = document.getElementById("dialog");
    el.modalTitle = document.getElementById("modal-title");
    el.form = document.getElementById("timer-form");
    el.name = document.getElementById("timer-name");
    el.error = document.getElementById("form-error");
    el.submit = document.getElementById("form-submit");
    el.groupDuration = document.getElementById("group-duration");
    el.groupDatetime = document.getElementById("group-datetime");
    el.days = document.getElementById("dur-days");
    el.hours = document.getElementById("dur-hours");
    el.minutes = document.getElementById("dur-minutes");
    el.dtGrid = document.getElementById("dt-grid");
    el.dtTitle = document.getElementById("dt-title");
    el.dtPrev = document.getElementById("dt-prev");
    el.dtNext = document.getElementById("dt-next");
    el.dtHour = document.getElementById("dt-hour");
    el.dtMin = document.getElementById("dt-min");
    el.dtAmpm = document.getElementById("dt-ampm");
    el.dtTimeLabel = document.getElementById("dt-time-label");
    el.soundSelect = document.getElementById("timer-sound");
    el.soundPreview = document.getElementById("sound-preview");
    el.typeRadios = Array.prototype.slice.call(
      document.querySelectorAll('input[name="ctype"]')
    );

    // Settings modal.
    el.settingsModal = document.getElementById("settings-modal");
    el.settingsDialog = document.getElementById("settings-dialog");
    el.settingsBackdrop = document.getElementById("settings-backdrop");
    el.setSound = document.getElementById("set-sound");
    el.setConfetti = document.getElementById("set-confetti");
    el.setNotify = document.getElementById("set-notify");
    el.setTimeFormat = document.getElementById("set-timeformat");
    el.notifyHint = document.getElementById("notify-hint");
    el.toast = document.getElementById("toast");

    // Header + empty-state "new" buttons.
    Array.prototype.forEach.call(document.querySelectorAll('[data-act="new"]'), function (b) {
      b.addEventListener("click", function () {
        cb.onNew && cb.onNew();
      });
    });

    // Modal dismissal: header close, cancel button, backdrop click, Escape.
    document.getElementById("modal-close").addEventListener("click", closeModal);
    document.getElementById("form-cancel").addEventListener("click", closeModal);
    el.backdrop.addEventListener("click", closeModal);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        if (isModalOpen()) closeModal();
        else if (!el.settingsModal.hidden) closeSettings();
      }
      if (e.key === "Tab") {
        var dlg = activeDialog();
        if (dlg) trapFocus(e, dlg);
      }
    });

    // Switch between duration and date-and-time fields.
    el.typeRadios.forEach(function (r) {
      r.addEventListener("change", syncType);
    });

    // Quick-add chips add to whatever is already typed.
    Array.prototype.forEach.call(el.form.querySelectorAll("[data-add-min]"), function (chip) {
      chip.addEventListener("click", function () {
        addMinutes(parseInt(chip.getAttribute("data-add-min"), 10));
      });
    });

    // Calendar month navigation.
    el.dtPrev.addEventListener("click", function () {
      shiftMonth(-1);
    });
    el.dtNext.addEventListener("click", function () {
      shiftMonth(1);
    });

    // Populate the alert-sound options.
    CD.sound.list.forEach(function (s) {
      var opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.label;
      el.soundSelect.appendChild(opt);
    });
    el.soundPreview.addEventListener("click", function () {
      CD.sound.resume();
      CD.sound.play(el.soundSelect.value);
    });

    // Configure 12- vs 24-hour time entry from the visitor's locale.
    configureTimeEntry();

    // Settings.
    Array.prototype.forEach.call(
      document.querySelectorAll('[data-act="settings"]'),
      function (b) {
        b.addEventListener("click", openSettings);
      }
    );
    document.getElementById("settings-close").addEventListener("click", closeSettings);
    el.settingsBackdrop.addEventListener("click", closeSettings);
    el.setSound.addEventListener("change", pushSettings);
    el.setConfetti.addEventListener("change", pushSettings);
    el.setNotify.addEventListener("change", onNotifyToggle);
    el.setTimeFormat.addEventListener("change", function () {
      pushSettings();
      applyTimeFormat();
    });

    // Let audio start on the first interaction (browsers block it otherwise).
    CD.sound.armUnlock();

    if (cb.initialSettings) applySettings(cb.initialSettings);

    el.form.addEventListener("submit", onSubmit);
  }

  /* ---------- settings ---------- */

  function applySettings(s) {
    settings = {
      sound: !!s.sound,
      confetti: !!s.confetti,
      notify: !!s.notify,
      timeFormat: s.timeFormat === "12" || s.timeFormat === "auto" ? s.timeFormat : "24",
    };
    el.setSound.checked = settings.sound;
    el.setConfetti.checked = settings.confetti;
    el.setTimeFormat.value = settings.timeFormat;
    applyTimeFormat();

    // Notifications can only be "on" if the browser still grants permission.
    clearNotifyHint();
    if (!CD.notify.isSupported()) {
      el.setNotify.checked = false;
      el.setNotify.disabled = true;
      setNotifyHint("This browser doesn't support notifications.");
    } else {
      var granted = CD.notify.permission() === "granted";
      el.setNotify.checked = settings.notify && granted;
      if (settings.notify && !granted) {
        // Permission was withdrawn since last time; fall back to off.
        settings.notify = false;
      }
    }
  }

  // Push the chosen clock format into the formatter, the time inputs, and cards.
  function applyTimeFormat() {
    CD.format.setClockMode(settings.timeFormat);
    configureTimeEntry();
    if (cb.onRefresh) cb.onRefresh();
  }

  function pushSettings() {
    settings = {
      sound: el.setSound.checked,
      confetti: el.setConfetti.checked,
      notify: el.setNotify.checked,
      timeFormat: el.setTimeFormat.value,
    };
    if (cb.onSettingsChange) cb.onSettingsChange(settings);
  }

  // Turning notifications on requires (and requests) browser permission.
  function onNotifyToggle() {
    clearNotifyHint();
    if (!el.setNotify.checked) {
      pushSettings();
      return;
    }
    if (!CD.notify.isSupported()) {
      el.setNotify.checked = false;
      setNotifyHint("This browser doesn't support notifications.");
      return;
    }
    CD.notify.request().then(function (p) {
      if (p === "granted") {
        pushSettings();
      } else {
        el.setNotify.checked = false;
        setNotifyHint(
          p === "denied"
            ? "Notifications are blocked. Enable them in your browser settings."
            : "Notification permission wasn't granted."
        );
        pushSettings();
      }
    });
  }

  function setNotifyHint(msg) {
    el.notifyHint.textContent = msg;
    el.notifyHint.hidden = false;
  }
  function clearNotifyHint() {
    el.notifyHint.textContent = "";
    el.notifyHint.hidden = true;
  }

  /* ---------- share + toast ---------- */

  function shareTimer(timer) {
    var link = CD.share.url(timer);
    if (navigator.share) {
      navigator
        .share({ title: timer.name || "Countdown", url: link })
        .catch(function (err) {
          if (err && err.name === "AbortError") return; // user dismissed the sheet
          copyLink(link);
        });
      return;
    }
    copyLink(link);
  }

  function copyLink(link) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(
        function () {
          toast("Link copied \u2014 send it to anyone.");
        },
        function () {
          window.prompt("Copy this link:", link);
        }
      );
    } else {
      window.prompt("Copy this link:", link);
    }
  }

  var toastHandle = null;
  function toast(msg) {
    if (!el.toast) return;
    el.toast.textContent = msg;
    el.toast.hidden = false;
    clearTimeout(toastHandle);
    toastHandle = setTimeout(function () {
      el.toast.hidden = true;
    }, 2600);
  }

  // Called by the controller after it imports a countdown from a share link.
  function flashShared(timer) {
    toast((timer.name ? "\u201C" + timer.name + "\u201D" : "Shared countdown") + " added.");
  }

  function openSettings() {
    lastFocused = document.activeElement;
    el.settingsModal.hidden = false;
    document.body.classList.add("modal-open");
    window.requestAnimationFrame(function () {
      el.setSound.focus();
    });
  }

  function closeSettings() {
    if (el.settingsModal.hidden) return;
    el.settingsModal.hidden = true;
    if (el.modal.hidden) document.body.classList.remove("modal-open");
    if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
  }

  function showStorageWarning() {
    if (el.storageWarning) el.storageWarning.hidden = false;
  }

  /* ---------- grid rendering ---------- */

  function clearGrid() {
    cards = [];
    el.grid.textContent = "";
  }

  function render(timers, now) {
    clearGrid();
    var ordered = model.sortForDisplay(timers);

    el.empty.hidden = ordered.length > 0;
    el.grid.hidden = ordered.length === 0;

    ordered.forEach(function (t) {
      var ref = buildCard(t, now);
      el.grid.appendChild(ref.cardEl);
      cards.push(ref);
    });
  }

  function seg(value, unit) {
    var s = document.createElement("span");
    s.className = "seg";
    var n = document.createElement("span");
    n.className = "num";
    n.textContent = value;
    var u = document.createElement("span");
    u.className = "unit";
    u.textContent = unit;
    s.appendChild(n);
    s.appendChild(u);
    return s;
  }

  // Fill the numerals area for a given remaining span (or the expired label).
  function paintTime(timeEl, timer, now) {
    timeEl.textContent = "";
    if (model.isExpired(timer, now)) {
      var badge = document.createElement("span");
      badge.className = "expired-label";
      badge.textContent = "Expired";
      timeEl.appendChild(badge);
      timeEl.setAttribute("aria-label", "Expired");
      return;
    }
    var ms = model.remaining(timer, now);
    fmt.segments(ms).forEach(function (p) {
      timeEl.appendChild(seg(p.value, p.unit));
    });
    timeEl.setAttribute("aria-label", fmt.spoken(ms));
  }

  function buildCard(timer, now) {
    var st = model.state(timer, now);

    var card = document.createElement("article");
    card.className = "card" + (timer.name ? "" : " card--noname");
    card.setAttribute("data-state", st);

    // Head: optional name + state pill.
    var head = document.createElement("header");
    head.className = "card__head";
    if (timer.name) {
      var h = document.createElement("h2");
      h.className = "card__name";
      h.textContent = timer.name;
      head.appendChild(h);
    }
    var pill = document.createElement("span");
    pill.className = "pill";
    pill.setAttribute("data-state", st);
    pill.textContent = STATE_TEXT[st];
    head.appendChild(pill);
    card.appendChild(head);

    // Hero: the countdown itself.
    var time = document.createElement("div");
    time.className = "card__time";
    time.setAttribute("role", "timer");
    paintTime(time, timer, now);
    card.appendChild(time);

    // Progress track — elapsed vs. the whole interval.
    var track = document.createElement("div");
    track.className = "track";
    track.setAttribute("aria-hidden", "true");
    var fill = document.createElement("div");
    fill.className = "track__fill";
    fill.style.width = (model.progress(timer, now) * 100).toFixed(2) + "%";
    track.appendChild(fill);
    card.appendChild(track);

    // Target line.
    var tgt = document.createElement("p");
    tgt.className = "card__target";
    tgt.textContent = fmt.target(timer.targetTime, now);
    card.appendChild(tgt);

    // Actions.
    var actions = document.createElement("footer");
    actions.className = "card__actions";
    var label = timer.name ? '"' + timer.name + '"' : "unnamed countdown";
    actions.appendChild(
      actionButton("Share", "Share " + label, function () {
        shareTimer(timer);
      })
    );
    actions.appendChild(
      actionButton("Edit", "Edit " + label, function () {
        cb.onEdit && cb.onEdit(timer.id);
      })
    );
    actions.appendChild(
      actionButton("Delete", "Delete " + label, function () {
        cb.onDelete && cb.onDelete(timer.id);
      }, true)
    );
    card.appendChild(actions);

    // Polite live region: announces the moment a timer expires.
    var live = document.createElement("span");
    live.className = "sr-only";
    live.setAttribute("aria-live", "polite");
    card.appendChild(live);

    return {
      id: timer.id,
      timer: timer,
      cardEl: card,
      timeEl: time,
      trackFill: fill,
      pill: pill,
      liveEl: live,
      state: st,
      key: renderKey(timer, now),
    };
  }

  function actionButton(text, ariaLabel, handler, danger) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "btn btn--ghost" + (danger ? " btn--danger" : "");
    b.textContent = text;
    b.setAttribute("aria-label", ariaLabel);
    b.addEventListener("click", handler);
    return b;
  }

  // A cheap signature of everything visible on a card, to skip idle redraws.
  function renderKey(timer, now) {
    var st = model.state(timer, now);
    if (st === "expired") return "expired";
    return (
      st +
      "|" +
      fmt
        .segments(model.remaining(timer, now))
        .map(function (p) {
          return p.value + p.unit;
        })
        .join("") +
      "|" +
      Math.round(model.progress(timer, now) * 400) // ~0.25% resolution
    );
  }

  /* ---------- per-frame updates ---------- */

  function tick(now) {
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      var key = renderKey(c.timer, now);
      if (key === c.key) continue; // nothing changed since last paint
      c.key = key;

      var st = model.state(c.timer, now);
      paintTime(c.timeEl, c.timer, now);
      c.trackFill.style.width = (model.progress(c.timer, now) * 100).toFixed(2) + "%";
      c.pill.textContent = STATE_TEXT[st];
      c.pill.setAttribute("data-state", st);
      c.cardEl.setAttribute("data-state", st);

      if (st === "expired" && c.state !== "expired") {
        var who = c.timer.name ? c.timer.name : "Countdown";
        c.liveEl.textContent = who + " has ended.";
        if (settings.sound) CD.sound.play(c.timer.sound);
        if (settings.confetti) CD.confetti.burst();
      }
      c.state = st;
    }
  }

  /* ---------- modal ---------- */

  function isModalOpen() {
    return el.modal && !el.modal.hidden;
  }

  function openCreate() {
    editingId = null;
    el.modalTitle.textContent = "New countdown";
    el.submit.textContent = "Create countdown";
    el.form.reset();
    setType("duration");
    el.soundSelect.value = CD.sound.DEFAULT;
    initCalendar(null);
    openModal();
  }

  function openEdit(timer) {
    editingId = timer.id;
    el.modalTitle.textContent = "Edit countdown";
    el.submit.textContent = "Save changes";
    el.form.reset();
    el.name.value = timer.name || "";
    el.soundSelect.value = CD.sound.has(timer.sound) ? timer.sound : CD.sound.DEFAULT;
    // Prefill as an absolute date/time; the user can switch to duration.
    setType("datetime");
    var d = new Date(timer.targetTime);
    initCalendar(d);
    writeTime(d.getHours(), d.getMinutes());
    openModal();
  }

  function openModal() {
    clearError();
    lastFocused = document.activeElement;
    el.modal.hidden = false;
    document.body.classList.add("modal-open");
    // Focus the first useful field once the dialog is painted.
    window.requestAnimationFrame(function () {
      el.name.focus();
    });
  }

  function closeModal() {
    if (!isModalOpen()) return;
    el.modal.hidden = true;
    document.body.classList.remove("modal-open");
    editingId = null;
    if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
  }

  function setType(type) {
    el.typeRadios.forEach(function (r) {
      r.checked = r.value === type;
    });
    syncType();
  }

  function syncType() {
    var type = currentType();
    var isDuration = type === "duration";
    el.groupDuration.hidden = !isDuration;
    el.groupDatetime.hidden = isDuration;
  }

  function currentType() {
    var checked = el.typeRadios.filter(function (r) {
      return r.checked;
    })[0];
    return checked ? checked.value : "duration";
  }

  function addMinutes(mins) {
    setType("duration");
    var total =
      (parseInt(el.days.value, 10) || 0) * 1440 +
      (parseInt(el.hours.value, 10) || 0) * 60 +
      (parseInt(el.minutes.value, 10) || 0) +
      mins;
    el.days.value = Math.floor(total / 1440) || "";
    el.hours.value = Math.floor((total % 1440) / 60) || "";
    el.minutes.value = total % 60 || "";
    // Keep at least one field showing the added value.
    if (!el.days.value && !el.hours.value && !el.minutes.value) el.minutes.value = "0";
  }

  /* ---------- date picker (Monday-first, 24-hour) ---------- */

  // Monday-based weekday index: Mon=0 ... Sun=6.
  function mondayIndex(jsDay) {
    return (jsDay + 6) % 7;
  }

  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  // seed: a Date to preselect and show, or null for "current month, nothing picked".
  function initCalendar(seed) {
    var base = seed || new Date();
    calView = new Date(base.getFullYear(), base.getMonth(), 1);
    calSel = seed
      ? { y: seed.getFullYear(), m: seed.getMonth(), d: seed.getDate() }
      : null;
    buildCalendar();
  }

  function shiftMonth(delta) {
    if (!calView) calView = new Date();
    calView = new Date(calView.getFullYear(), calView.getMonth() + delta, 1);
    buildCalendar();
  }

  function buildCalendar() {
    var grid = el.dtGrid;
    grid.textContent = "";

    var year = calView.getFullYear();
    var month = calView.getMonth();
    el.dtTitle.textContent = MONTHS[month] + " " + year;

    var today = startOfDay(new Date());
    // Never navigate to a month entirely in the past.
    el.dtPrev.disabled =
      year === today.getFullYear() && month === today.getMonth();

    var first = new Date(year, month, 1);
    var lead = mondayIndex(first.getDay());
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var total = Math.ceil((lead + daysInMonth) / 7) * 7;

    for (var i = 0; i < total; i++) {
      var dayNum = i - lead + 1;
      if (dayNum < 1 || dayNum > daysInMonth) {
        var blank = document.createElement("span");
        blank.className = "dtcal__cell dtcal__cell--empty";
        blank.setAttribute("aria-hidden", "true");
        grid.appendChild(blank);
        continue;
      }

      var cellDate = new Date(year, month, dayNum);
      var isPast = cellDate < today;
      var isToday = cellDate.getTime() === today.getTime();
      var isSel =
        calSel && calSel.y === year && calSel.m === month && calSel.d === dayNum;

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "dtcal__cell dtcal__day";
      btn.textContent = String(dayNum);
      if (isToday) btn.classList.add("is-today");
      if (isSel) {
        btn.classList.add("is-selected");
        btn.setAttribute("aria-current", "date");
      }
      if (isPast) {
        btn.disabled = true;
      } else {
        btn.setAttribute("aria-label", dayNum + " " + MONTHS[month] + " " + year);
        (function (dn) {
          btn.addEventListener("click", function () {
            calSel = { y: year, m: month, d: dn };
            buildCalendar();
          });
        })(dayNum);
      }
      grid.appendChild(btn);
    }
  }

  // Shape the time inputs to the chosen format (locale only when "auto").
  function configureTimeEntry() {
    if (settings.timeFormat === "12") {
      use12h = true;
    } else if (settings.timeFormat === "24") {
      use12h = false;
    } else {
      try {
        use12h = !!new Intl.DateTimeFormat([], { hour: "numeric" }).resolvedOptions().hour12;
      } catch (e) {
        use12h = false;
      }
    }
    if (use12h) {
      el.dtHour.min = 1;
      el.dtHour.max = 12;
      el.dtAmpm.hidden = false;
    } else {
      el.dtHour.min = 0;
      el.dtHour.max = 23;
      el.dtAmpm.hidden = true;
    }
    el.dtTimeLabel.textContent = "Time";
  }

  // Read the time inputs and return 24-hour { h, m }, treating blanks as 0.
  function readTime() {
    var h = parseInt(el.dtHour.value, 10);
    var m = parseInt(el.dtMin.value, 10);
    if (isNaN(h)) h = use12h ? 12 : 0;
    if (isNaN(m)) m = 0;
    if (use12h) {
      h = h % 12; // 12 -> 0
      if (el.dtAmpm.value === "pm") h += 12;
    }
    return { h: h, m: m };
  }

  // Set the time inputs from a 24-hour hour/minute, honoring the locale format.
  function writeTime(h24, m) {
    if (use12h) {
      var pm = h24 >= 12;
      var h12 = h24 % 12;
      if (h12 === 0) h12 = 12;
      el.dtHour.value = h12;
      el.dtAmpm.value = pm ? "pm" : "am";
    } else {
      el.dtHour.value = h24;
    }
    el.dtMin.value = m;
  }

  function readForm() {
    var name = el.name.value;
    var sound = el.soundSelect.value;
    if (currentType() === "duration") {
      var d = parseInt(el.days.value, 10) || 0;
      var h = parseInt(el.hours.value, 10) || 0;
      var m = parseInt(el.minutes.value, 10) || 0;
      if (d < 0 || h < 0 || m < 0) {
        return { error: "Duration can't be negative." };
      }
      var durationMs = ((d * 24 + h) * 60 + m) * 60 * 1000;
      return { input: { name: name, durationMs: durationMs, sound: sound } };
    }
    if (!calSel) return { error: "Pick a date on the calendar." };

    // Validate the raw hour against the locale's range before converting.
    if (el.dtHour.value !== "") {
      var rawH = parseInt(el.dtHour.value, 10);
      var okH = use12h ? rawH >= 1 && rawH <= 12 : rawH >= 0 && rawH <= 23;
      if (isNaN(rawH) || !okH) {
        return { error: use12h ? "Enter an hour from 1 to 12." : "Enter an hour from 0 to 23." };
      }
    }
    if (el.dtMin.value !== "") {
      var rawM = parseInt(el.dtMin.value, 10);
      if (isNaN(rawM) || rawM < 0 || rawM > 59) {
        return { error: "Enter minutes from 0 to 59." };
      }
    }

    var t = readTime();
    // Compose from local components so the target is local wall-clock time.
    var ts = new Date(calSel.y, calSel.m, calSel.d, t.h, t.m, 0, 0).getTime();
    return { input: { name: name, targetTime: ts, sound: sound } };
  }

  function onSubmit(e) {
    e.preventDefault();
    clearError();
    var parsed = readForm();
    if (parsed.error) return showError(parsed.error);

    // app.js validates target semantics (future / > 0) and persists.
    var result = cb.onSubmit ? cb.onSubmit(parsed.input, editingId) : { error: "Not ready." };
    if (result && result.error) {
      showError(result.error);
      return;
    }
    closeModal();
  }

  function showError(msg) {
    el.error.textContent = msg;
    el.error.hidden = false;
    el.submit.setAttribute("aria-describedby", "form-error");
  }

  function clearError() {
    el.error.textContent = "";
    el.error.hidden = true;
    el.submit.removeAttribute("aria-describedby");
  }

  /* ---------- helpers ---------- */

  function activeDialog() {
    if (el.modal && !el.modal.hidden) return el.dialog;
    if (el.settingsModal && !el.settingsModal.hidden) return el.settingsDialog;
    return null;
  }

  // Keep keyboard focus inside the dialog while it's open.
  function trapFocus(e, dialog) {
    var focusables = dialog.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    var list = Array.prototype.filter.call(focusables, function (n) {
      return !n.disabled && n.offsetParent !== null;
    });
    if (!list.length) return;
    var first = list[0];
    var last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return {
    init: init,
    render: render,
    tick: tick,
    openCreate: openCreate,
    openEdit: openEdit,
    closeModal: closeModal,
    showStorageWarning: showStorageWarning,
    flashShared: flashShared,
  };
})();
