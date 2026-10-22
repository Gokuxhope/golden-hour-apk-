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

  /* ----------------------------------------------------------- search form */
  $all("[data-search-form]").forEach(function (form) {
    var from = $("[data-from]", form);
    var to = $("[data-to]", form);
    var dateInput = $("[data-date]", form);
    var swap = $("[data-swap]", form);
    var turn = 0;

    swap.addEventListener("click", function () {
      var tmp = from.value;
      from.value = to.value;
      to.value = tmp;
      turn += 180;
      swap.style.setProperty("--turn", turn + "deg");
      [from, to].forEach(function (s) {
        s.classList.remove("is-swapped");
        void s.offsetWidth; // restart the animation
        s.classList.add("is-swapped");
      });
    });

    var quick = $all("[data-quick-date]", form);
    function syncQuick() {
      quick.forEach(function (b) { b.classList.toggle("is-on", b.dataset.quickDate === dateInput.value); });
    }
    quick.forEach(function (b) {
      b.addEventListener("click", function () { dateInput.value = b.dataset.quickDate; syncQuick(); });
    });
    dateInput.addEventListener("change", syncQuick);

    form.addEventListener("submit", function (e) {
      if (from.value === to.value) {
        e.preventDefault();
        toast("From and To can't be the same city.", "error");
        return;
      }
      var btn = $(".search-submit", form);
      btn.classList.add("is-loading");
      document.body.classList.add("is-leaving");
    });
  });

  /* ------------------------------------------- results: loading + filters */
  var results = $("[data-results]");
  if (results) {
    var cards = $all(".bus-card:not(.skeleton-card)", results);
    var emptyMsg = $("[data-filter-empty]", results);
    var countEl = $("[data-visible-count]");
    var priceInput = $("[data-price]");
    var priceLabel = $("[data-price-label]");
    var state = { ac: false, sleeper: false, seater: false, slots: [], sort: "depart" };

    if (countEl) countEl.dataset.current = cards.length;

    // Restart the staggered entrance on whichever cards are visible.
    function stagger(list) {
      list.forEach(function (card, i) {
        card.classList.remove("reveal");
        card.style.setProperty("--i", i);
      });
      void results.offsetWidth;
      list.forEach(function (card) { card.classList.add("reveal"); });
    }

    function sortKey(card) {
      var d = card.dataset;
      if (state.sort === "price") return +d.fare;
      if (state.sort === "duration") return +d.duration;
      if (state.sort === "rating") return -d.rating;
      return d.depart;
    }

    function apply() {
      var maxPrice = priceInput ? +priceInput.value : Infinity;
      var visible = [];
      cards.forEach(function (card) {
        var d = card.dataset;
        var ok = true;
        if (state.ac && d.ac !== "1") ok = false;
        if (state.sleeper !== state.seater) {          // only one of the two chosen
          if (state.sleeper && d.sleeper !== "1") ok = false;
          if (state.seater && d.sleeper === "1") ok = false;
        }
        if (state.slots.length && state.slots.indexOf(d.slot) === -1) ok = false;
        if (+d.fare > maxPrice) ok = false;
        card.hidden = !ok;
        if (ok) visible.push(card);
      });

      var sorted = cards.slice().sort(function (a, b) {
        var ka = sortKey(a), kb = sortKey(b);
        return ka < kb ? -1 : ka > kb ? 1 : 0;
      });
      sorted.forEach(function (card) { results.insertBefore(card, emptyMsg); });
      visible.sort(function (a, b) { return sorted.indexOf(a) - sorted.indexOf(b); });

      stagger(visible);
      emptyMsg.hidden = visible.length > 0;
      if (countEl) animateNumber(countEl, visible.length, 500);
    }

    function setPressed(btn, on) {
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-pressed", String(on));
    }

    $all("[data-filter]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var key = btn.dataset.filter;
        state[key] = !state[key];
        setPressed(btn, state[key]);
        apply();
      });
    });

    $all("[data-filters] [data-slot]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var slot = btn.dataset.slot;
        var at = state.slots.indexOf(slot);
        if (at === -1) state.slots.push(slot); else state.slots.splice(at, 1);
        setPressed(btn, at === -1);
        apply();
      });
    });

    $all("[data-sort]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.sort = btn.dataset.sort;
        $all("[data-sort]").forEach(function (b) { b.classList.toggle("is-on", b === btn); });
        apply();
      });
    });

    if (priceInput) {
      var pending = null;
      var paintTrack = function () {
        var pct = (priceInput.value - priceInput.min) / ((priceInput.max - priceInput.min) || 1) * 100;
        priceInput.style.setProperty("--fill", pct + "%");
        priceLabel.textContent = "₹" + inrFormatter.format(+priceInput.value);
      };
      paintTrack();
      priceInput.addEventListener("input", function () {
        paintTrack();
        clearTimeout(pending);
        pending = setTimeout(apply, 120);
      });
    }

    var clear = $("[data-clear-filters]");
    if (clear) {
      clear.addEventListener("click", function () {
        state = { ac: false, sleeper: false, seater: false, slots: [], sort: state.sort };
        $all("[data-filter], [data-filters] [data-slot]").forEach(function (b) { setPressed(b, false); });
        if (priceInput) { priceInput.value = priceInput.max; priceInput.dispatchEvent(new Event("input")); }
        apply();
      });
    }

    // Fake network delay: show skeleton shimmer for 600ms, then the cards.
    setTimeout(function () {
      results.classList.remove("is-loading");
      stagger(cards);
    }, reduceMotion ? 0 : 600);
  }

  var modifyToggle = $("[data-modify-toggle]");
  if (modifyToggle) {
    modifyToggle.addEventListener("click", function () {
      var open = $("[data-modify]").classList.toggle("is-open");
      modifyToggle.setAttribute("aria-expanded", String(open));
    });
  }

  /* -------------------------------------------------------------- seat map */
  var seatMap = $("[data-seat-map]");
  if (seatMap) {
    var maxSeats = parseInt(seatMap.dataset.max, 10) || 6;
    var fareUrl = seatMap.dataset.fareUrl;
    var tripId = seatMap.dataset.trip;
    var seatsInput = $("[data-seats-input]");
    var chipsBox = $("[data-seat-chips]");
    var chipsEmpty = $("[data-chips-empty]");
    var chipTpl = $("#chip-template");
    var continueBtns = $all("[data-continue]");
    var barCount = $("[data-bar-count]");
    var selected = [];
    var ladiesWarned = false;
    var fareRequest = 0;

    function seatButton(id) { return $('.seat[data-seat="' + id + '"]', seatMap); }

    // Ask Python for the price of the current selection, then animate the numbers.
    function refreshFare() {
      var token = ++fareRequest;
      fetch(fareUrl + "?trip_id=" + encodeURIComponent(tripId) + "&seats=" + encodeURIComponent(selected.join(",")))
        .then(function (r) { return r.json(); })
        .then(function (fare) {
          if (token !== fareRequest) return; // a newer click already asked again
          $all("[data-fare]").forEach(function (el) {
            var key = el.dataset.fare;
            if (key === "seat_count") el.textContent = fare.seat_count;
            else animateNumber(el, fare[key], 650);
          });
        })
        .catch(function () { toast("Couldn't update the fare — is the server running?", "error"); });
    }

    function render() {
      seatsInput.value = selected.join(",");
      continueBtns.forEach(function (b) { b.disabled = selected.length === 0; });
      if (barCount) barCount.textContent = selected.length;

      // Seat chips in the summary (add new ones with a pop, drop removed ones)
      var existing = {};
      $all(".seat-chip", chipsBox).forEach(function (chip) { existing[chip.dataset.seat] = chip; });
      Object.keys(existing).forEach(function (id) {
        if (selected.indexOf(id) === -1) existing[id].remove();
      });
      selected.forEach(function (id) {
        if (existing[id]) return;
        var chip = chipTpl.content.firstElementChild.cloneNode(true);
        chip.dataset.seat = id;
        $(".seat-chip-id", chip).textContent = id;
        $("small", chip).textContent = seatButton(id).dataset.label;
        if (seatButton(id).dataset.ladies === "1") chip.classList.add("is-ladies");
        chipsBox.appendChild(chip);
      });
      chipsEmpty.hidden = selected.length > 0;
      refreshFare();
    }

    function toggle(btn, silent) {
      var id = btn.dataset.seat;
      var at = selected.indexOf(id);
      if (at !== -1) {
        selected.splice(at, 1);
        btn.classList.remove("is-selected");
        btn.setAttribute("aria-pressed", "false");
      } else {
        if (selected.length >= maxSeats) {
          replay(btn, "is-shake");
          toast("You can book up to " + maxSeats + " seats at a time.", "error");
          return;
        }
        selected.push(id);
        btn.classList.add("is-selected");
        btn.setAttribute("aria-pressed", "true");
        if (btn.dataset.ladies === "1" && !ladiesWarned && !silent) {
          ladiesWarned = true;
          toast("Seat " + id + " is reserved for ladies — the passenger must be female.", "info");
        }
      }
      if (!silent) replay(btn, "is-bounce");
    }

    seatMap.addEventListener("click", function (e) {
      var btn = e.target.closest(".seat");
      if (!btn || btn.disabled) return;
      toggle(btn);
      render();
    });

    (window.BUSGO_PRESELECTED || []).forEach(function (id) {
      var btn = seatButton(id);
      if (btn && !btn.disabled) toggle(btn, true);
    });
    render();

    $("[data-seat-form]").addEventListener("submit", function (e) {
      if (!selected.length) { e.preventDefault(); toast("Pick at least one seat first.", "error"); return; }
      continueBtns.forEach(function (b) { b.classList.add("is-busy"); });
    });
  }

  /* ------------------------------------------------------ passenger details */
  var paxForm = $("[data-pax-form]");
  if (paxForm) {
    var fillMe = $("[data-fill-me]", paxForm);
    if (fillMe) {
      fillMe.addEventListener("click", function () {
        var card = fillMe.closest(".pax-card");
        $('input[name^="name_"]', card).value = fillMe.dataset.name;
        $('input[name^="age_"]', card).value = fillMe.dataset.age;
        var radio = $('input[type="radio"][value="' + fillMe.dataset.gender + '"]', card);
        if (radio && !radio.disabled) radio.checked = true;
        $all(".is-invalid", card).forEach(function (el) { el.classList.remove("is-invalid"); });
        replay(card, "is-filled");
      });
    }

    paxForm.addEventListener("input", function (e) {
      var target = e.target.closest(".input, .segmented");
      if (target) target.classList.remove("is-invalid");
      var seg = e.target.closest(".segmented");
      if (seg) seg.classList.remove("is-invalid");
    });

    // Friendly checks before sending — Python checks everything again on the server.
    paxForm.addEventListener("submit", function (e) {
      var problems = [];
      function flag(el, message) { el.classList.add("is-invalid"); problems.push({ el: el, message: message }); }

      $all(".pax-card:not(.contact-card)", paxForm).forEach(function (card, i) {
        var n = i + 1;
        var name = $('input[name^="name_"]', card);
        var age = $('input[name^="age_"]', card);
        if (name.value.trim().length < 2) flag(name, "Enter a name for passenger " + n + ".");
        var a = parseInt(age.value, 10);
        if (!(a >= 1 && a <= 110)) flag(age, "Enter an age between 1 and 110 for passenger " + n + ".");
        if (!$('input[type="radio"]:checked', card)) flag($(".segmented", card), "Choose a gender for passenger " + n + ".");
      });
      var email = $('input[name="email"]', paxForm);
      var phone = $('input[name="phone"]', paxForm);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value.trim())) flag(email, "Enter a valid email address.");
      if (!/^(\+91|0)?[6-9]\d{9}$/.test(phone.value.replace(/[\s-]/g, ""))) flag(phone, "Enter a valid 10-digit mobile number.");

      if (problems.length) {
        e.preventDefault();
        toast(problems[0].message, "error");
        problems[0].el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
        problems.forEach(function (p) { replay(p.el, "is-shake"); });
      }
    });
  }

  // Restart a one-shot CSS animation class (bounce, shake...).
  function replay(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
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
