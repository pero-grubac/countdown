/*
 * confetti.js — a small dependency-free confetti burst on a full-screen canvas.
 *
 * The canvas sits above everything but ignores pointer events, so it never gets
 * in the way. Honors prefers-reduced-motion by doing nothing, and stops its own
 * animation loop once every particle has fallen away.
 */
window.CD = window.CD || {};

CD.confetti = (function () {
  "use strict";

  var canvas = null;
  var g = null; // 2d context
  var parts = [];
  var running = false;

  var COLORS = ["#3d5af1", "#8298ff", "#f1b23d", "#f14d5a", "#27c093", "#ffffff"];

  function dpr() {
    return window.devicePixelRatio || 1;
  }

  function ensure() {
    if (!canvas) {
      canvas = document.getElementById("confetti");
      if (canvas) g = canvas.getContext("2d");
    }
    return !!g;
  }

  function resize() {
    if (!canvas) return;
    canvas.width = Math.floor(window.innerWidth * dpr());
    canvas.height = Math.floor(window.innerHeight * dpr());
  }

  function reducedMotion() {
    return (
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  function burst() {
    if (!ensure() || reducedMotion()) return;
    resize();
    var d = dpr();
    var cx = canvas.width / 2;
    var originY = canvas.height * 0.26;
    var n = 150;
    for (var i = 0; i < n; i++) {
      parts.push({
        x: cx + (Math.random() - 0.5) * 140 * d,
        y: originY + (Math.random() - 0.5) * 50 * d,
        vx: (Math.random() - 0.5) * 17 * d,
        vy: (Math.random() * -9 - 4) * d,
        grav: 0.3 * d,
        size: (Math.random() * 6 + 4) * d,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.45,
        color: COLORS[(Math.random() * COLORS.length) | 0],
        life: 0,
        ttl: 130 + Math.random() * 50,
      });
    }
    if (!running) {
      running = true;
      requestAnimationFrame(tick);
    }
  }

  function tick() {
    g.clearRect(0, 0, canvas.width, canvas.height);
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.vy += p.grav;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life++;
      var alpha = 1 - p.life / p.ttl;
      if (alpha <= 0 || p.y > canvas.height + 40) {
        parts.splice(i, 1);
        continue;
      }
      g.save();
      g.globalAlpha = alpha < 1 ? alpha : 1;
      g.translate(p.x, p.y);
      g.rotate(p.rot);
      g.fillStyle = p.color;
      g.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      g.restore();
    }
    if (parts.length) {
      requestAnimationFrame(tick);
    } else {
      running = false;
      g.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  window.addEventListener("resize", function () {
    if (running) resize();
  });

  return { burst: burst };
})();
