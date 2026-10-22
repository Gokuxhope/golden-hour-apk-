/* ==========================================================================
   BusGo — front-end behaviour (presentation only; all rules live in Python)
   ripple · 3D tilt · toasts · page transitions · nav menus · number counters
   ========================================================================== */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  var inrFormatter = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /* ---------------------------------------------------------------- ripple */
  document.addEventListener("pointerdown", function (e) {
    var btn = e.target.closest(".btn, [data-ripple]");
    if (!btn || reduceMotion) return;
    var rect = btn.getBoundingClientRect();
    var ripple = document.createElement("span");
    ripple.className = "ripple";
    ripple.style.setProperty("--d", Math.max(rect.width, rect.height) * 2.2 + "px");
    ripple.style.setProperty("--x", e.clientX - rect.left + "px");
    ripple.style.setProperty("--y", e.clientY - rect.top + "px");
    btn.appendChild(ripple);
    ripple.addEventListener("animationend", function () { ripple.remove(); });
  });

  /* ------------------------------------------------------------------ tilt */
  function bindTilt(el) {
    if (!finePointer || reduceMotion || el.dataset.tiltBound) return;
    el.dataset.tiltBound = "1";
    var max = parseFloat(el.dataset.tilt) || 6;
    if (!$(".tilt-glare", el)) {
      var glare = document.createElement("span");
      glare.className = "tilt-glare";
      el.appendChild(glare);
    }
    var frame = null;
    el.addEventListener("pointermove", function (e) {
      if (frame) return;
      frame = requestAnimationFrame(function () {
        frame = null;
        var r = el.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width;
        var py = (e.clientY - r.top) / r.height;
        el.classList.add("is-tilting");
        el.style.setProperty("--ry", ((px - 0.5) * max * 2).toFixed(2) + "deg");
        el.style.setProperty("--rx", ((0.5 - py) * max * 2).toFixed(2) + "deg");
        el.style.setProperty("--mx", (px * 100).toFixed(1) + "%");
        el.style.setProperty("--my", (py * 100).toFixed(1) + "%");
      });
    });
    el.addEventListener("pointerleave", function () {
      el.classList.remove("is-tilting");
      el.style.setProperty("--rx", "0deg");
      el.style.setProperty("--ry", "0deg");
    });
  }

  /* ---------------------------------------------------------------- toasts */
  var TOAST_TIME = 4500;
  var stack = $("#toast-stack");

  function dismissToast(toast) {
    if (!toast || toast.classList.contains("is-leaving")) return;
    toast.classList.add("is-leaving");
    setTimeout(function () { toast.remove(); }, reduceMotion ? 0 : 320);
  }

  function armToast(toast, index) {
    toast.style.setProperty("--toast-time", TOAST_TIME + "ms");
    toast.style.animationDelay = (index || 0) * 90 + "ms";
    var remaining = TOAST_TIME + (index || 0) * 90;
    var started = Date.now();
    var timer = setTimeout(function () { dismissToast(toast); }, remaining);
    toast.addEventListener("mouseenter", function () {
      clearTimeout(timer);
      remaining -= Date.now() - started;
    });
    toast.addEventListener("mouseleave", function () {
      started = Date.now();
      timer = setTimeout(function () { dismissToast(toast); }, Math.max(remaining, 800));
    });
    var close = $(".toast-close", toast);
    if (close) close.addEventListener("click", function () { dismissToast(toast); });
  }

  function iconHTML(type) {
    var tpl = $("#toast-icons");
    var node = tpl && tpl.content.querySelector('[data-type="' + type + '"]');
    return node ? node.innerHTML : "";
  }

  /** Show a toast from JavaScript: BusGo.toast("Saved!", "success") */
  function toast(message, type) {
    type = type || "info";
    var el = document.createElement("div");
    el.className = "toast toast-" + type;
    el.setAttribute("role", "status");
    el.innerHTML = '<span class="toast-icon">' + iconHTML(type) + "</span><p></p>" +
      '<button class="toast-close" type="button" aria-label="Dismiss">' + iconHTML("close") + "</button>";
    $("p", el).textContent = message;
    stack.appendChild(el);
    armToast(el, 0);
    // keep at most 4 on screen
    var all = $all(".toast:not(.is-leaving)", stack);
    if (all.length > 4) dismissToast(all[0]);
    return el;
  }

  /* ------------------------------------------------------ page transitions */
  document.addEventListener("click", function (e) {
    var a = e.target.closest("a[href]");
    if (!a || reduceMotion) return;
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target && a.target !== "_self") return;
    if (a.hasAttribute("download") || a.dataset.noTransition !== undefined) return;
    var url = new URL(a.href, location.href);
    if (url.origin !== location.origin) return;
    if (url.pathname === location.pathname && url.search === location.search && url.hash) return;
    e.preventDefault();
    document.body.classList.add("is-leaving");
    setTimeout(function () { location.href = url.href; }, 170);
  });
  // Coming back with the browser's back button restores a cached page: undo the fade.
  window.addEventListener("pageshow", function () { document.body.classList.remove("is-leaving"); });

  /* ------------------------------------------------------------- nav menus */
  var nav = $(".nav");
  var navToggle = $("[data-nav-toggle]");
  if (navToggle) {
    navToggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      navToggle.setAttribute("aria-expanded", String(open));
    });
  }

  $all("[data-dropdown]").forEach(function (menu) {
    var toggle = $("[data-dropdown-toggle]", menu);
    toggle.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = menu.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(open));
      if (nav) nav.classList.remove("is-open");
    });
  });

  document.addEventListener("click", function (e) {
    $all("[data-dropdown].is-open").forEach(function (menu) {
      if (!menu.contains(e.target)) {
        menu.classList.remove("is-open");
        $("[data-dropdown-toggle]", menu).setAttribute("aria-expanded", "false");
      }
    });
    if (nav && nav.classList.contains("is-open") && !nav.contains(e.target)) {
      nav.classList.remove("is-open");
      navToggle.setAttribute("aria-expanded", "false");
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    $all("[data-dropdown].is-open").forEach(function (m) { m.classList.remove("is-open"); });
    if (nav) nav.classList.remove("is-open");
  });

  /* ------------------------------------------------------- number counters */
  function formatNumber(value, decimals) {
    if (decimals) return value.toFixed(decimals);
    return inrFormatter.format(Math.round(value));
  }

  /**
   * Animate an element's number from its current value to `to`.
   * Reads data-decimals, data-prefix and data-suffix from the element.
   */
  function animateNumber(el, to, duration) {
    var decimals = parseInt(el.dataset.decimals || "0", 10);
    var prefix = el.dataset.prefix || "";
    var suffix = el.dataset.suffix || "";
    var from = parseFloat(el.dataset.current || "0") || 0;
    el.dataset.current = to;
    if (el._raf) cancelAnimationFrame(el._raf);
    if (reduceMotion || from === to) {
      el.textContent = prefix + formatNumber(to, decimals) + suffix;
      return;
    }
    duration = duration || 900;
    var start = performance.now();
    function step(now) {
      var t = Math.min((now - start) / duration, 1);
      var eased = 1 - Math.pow(1 - t, 4);
      el.textContent = prefix + formatNumber(from + (to - from) * eased, decimals) + suffix;
      if (t < 1) el._raf = requestAnimationFrame(step);
    }
    el._raf = requestAnimationFrame(step);
  }

  // Elements with data-count="1234" count up from 0 when they scroll into view.
  function bindCounters(root) {
    var els = $all("[data-count]", root);
    if (!els.length) return;
    if (!("IntersectionObserver" in window)) {
      els.forEach(function (el) { animateNumber(el, parseFloat(el.dataset.count)); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        io.unobserve(el);
        setTimeout(function () {
          animateNumber(el, parseFloat(el.dataset.count), parseInt(el.dataset.duration || "1400", 10));
        }, parseInt(el.dataset.delay || "0", 10));
      });
    }, { threshold: 0.4 });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ------------------------------------------------------------------ init */
  function init(root) {
    $all("[data-tilt]", root).forEach(bindTilt);
    bindCounters(root);
  }

  $all(".toast", stack).forEach(armToast);
  init(document);

  // Public helpers for page scripts
  window.BusGo = {
    toast: toast,
    animateNumber: animateNumber,
    formatINR: function (n) { return inrFormatter.format(Math.round(n)); },
    reduceMotion: reduceMotion,
    init: init,
    $: $,
    $all: $all
  };
})();
