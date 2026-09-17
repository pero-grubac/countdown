/*
 * sound.js — completion alerts, synthesized with the Web Audio API.
 *
 * No audio files: every sound is generated from oscillators, so there's
 * nothing to download and the whole thing works offline and from a single
 * file. Browsers block audio until the user interacts with the page, so we
 * resume the context on the first gesture (see armUnlock) and again right
 * before playing.
 */
window.CD = window.CD || {};

CD.sound = (function () {
  "use strict";

  var ctx = null;

  function getCtx() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try {
        ctx = new AC();
      } catch (e) {
        return null;
      }
    }
    return ctx;
  }

  function resume() {
    var c = getCtx();
    if (c && c.state === "suspended") {
      c.resume().catch(function () {});
    }
  }

  // Unlock audio on the first user gesture, then stop listening.
  function armUnlock() {
    function onGesture() {
      resume();
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
      window.removeEventListener("touchstart", onGesture);
    }
    window.addEventListener("pointerdown", onGesture);
    window.addEventListener("keydown", onGesture);
    window.addEventListener("touchstart", onGesture);
  }

  // One note with a click-free attack/decay envelope.
  function note(c, dest, freq, start, dur, type, peak) {
    var osc = c.createOscillator();
    var g = c.createGain();
    osc.type = type || "triangle";
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(peak || 0.2, start + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g);
    g.connect(dest);
    osc.start(start);
    osc.stop(start + dur + 0.03);
  }

  // Each recipe schedules its notes relative to time t.
  var RECIPES = {
    chime: function (c, dest, t) {
      [523.25, 659.25, 783.99].forEach(function (f, i) {
        note(c, dest, f, t + i * 0.12, 0.6, "triangle", 0.22);
      });
    },
    bell: function (c, dest, t) {
      note(c, dest, 660, t, 1.4, "sine", 0.26);
      note(c, dest, 1320, t, 1.0, "sine", 0.07);
      note(c, dest, 990, t, 1.1, "sine", 0.05);
    },
    marimba: function (c, dest, t) {
      [392, 523.25, 659.25, 783.99].forEach(function (f, i) {
        note(c, dest, f, t + i * 0.09, 0.28, "sine", 0.28);
      });
    },
    arcade: function (c, dest, t) {
      [659.25, 783.99, 1046.5].forEach(function (f, i) {
        note(c, dest, f, t + i * 0.08, 0.16, "square", 0.11);
      });
    },
    alarm: function (c, dest, t) {
      for (var i = 0; i < 4; i++) {
        note(c, dest, i % 2 ? 660 : 880, t + i * 0.22, 0.14, "square", 0.12);
      }
    },
  };

  var LIST = [
    { id: "chime", label: "Chime" },
    { id: "bell", label: "Bell" },
    { id: "marimba", label: "Marimba" },
    { id: "arcade", label: "Arcade" },
    { id: "alarm", label: "Alarm" },
  ];
  var DEFAULT = "chime";

  function has(id) {
    return Object.prototype.hasOwnProperty.call(RECIPES, id);
  }

  function play(id) {
    var c = getCtx();
    if (!c) return;
    if (c.state === "suspended") c.resume().catch(function () {});
    var recipe = RECIPES[has(id) ? id : DEFAULT];
    var master = c.createGain();
    master.gain.value = 0.9;
    master.connect(c.destination);
    recipe(c, master, c.currentTime + 0.03);
  }

  return {
    list: LIST,
    DEFAULT: DEFAULT,
    has: has,
    play: play,
    resume: resume,
    armUnlock: armUnlock,
  };
})();
