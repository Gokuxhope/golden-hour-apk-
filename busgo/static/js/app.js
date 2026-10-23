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

  /* --------------------------------------------------------------- payment */
  var payForm = $("[data-pay-form]");
  if (payForm) {
    var tabs = $all("[data-tab]", payForm);
    var tabBar = $("[data-tabs]", payForm);
    var methodInput = $("[data-pay-method]", payForm);

    tabs.forEach(function (tab, index) {
      tab.addEventListener("click", function () {
        tabs.forEach(function (t) {
          var on = t === tab;
          t.classList.toggle("is-on", on);
          t.setAttribute("aria-selected", String(on));
        });
        $all("[data-panel]", payForm).forEach(function (panel) {
          var on = panel.dataset.panel === tab.dataset.tab;
          panel.hidden = !on;
          if (on) replay(panel, "is-on");
        });
        tabBar.style.setProperty("--tab", index);
        methodInput.value = tab.dataset.tab;
      });
    });

    // Live card preview
    var cc = $("[data-cc]", payForm);
    var ccOut = {
      number: $("[data-cc-number]", payForm), name: $("[data-cc-name]", payForm),
      exp: $("[data-cc-exp]", payForm), cvv: $("[data-cc-cvv]", payForm)
    };
    $all("[data-cc-in]", payForm).forEach(function (input) {
      var key = input.dataset.ccIn;
      input.addEventListener("input", function () {
        var v = input.value;
        if (key === "number") {
          v = v.replace(/\D/g, "").slice(0, 16);
          input.value = v.replace(/(.{4})/g, "$1 ").trim();
          var padded = (v + "••••••••••••••••").slice(0, 16);
          ccOut.number.textContent = padded.replace(/(.{4})/g, "$1 ").trim();
        } else if (key === "exp") {
          v = v.replace(/\D/g, "").slice(0, 4);
          input.value = v.length > 2 ? v.slice(0, 2) + "/" + v.slice(2) : v;
          ccOut.exp.textContent = input.value || "MM/YY";
        } else if (key === "cvv") {
          input.value = v.replace(/\D/g, "").slice(0, 4);
          ccOut.cvv.textContent = input.value.replace(/./g, "•") || "•••";
        } else {
          ccOut.name.textContent = v.toUpperCase() || "YOUR NAME";
        }
      });
      if (key === "cvv") {
        input.addEventListener("focus", function () { cc.classList.add("is-flipped"); });
        input.addEventListener("blur", function () { cc.classList.remove("is-flipped"); });
      }
    });

    // Fake processing: spinner for 2 seconds, then really submit to Python.
    var paying = false;
    payForm.addEventListener("submit", function (e) {
      if (paying) return;
      e.preventDefault();
      paying = true;
      var btn = $("[data-pay-btn]", payForm);
      btn.classList.add("is-paying");
      btn.setAttribute("aria-busy", "true");
      payForm.classList.add("is-paying");
      setTimeout(function () { payForm.submit(); }, 2000);
    });
  }

  /* ------------------------------------------------------ ticket utilities */
  $all("[data-print]").forEach(function (btn) {
    btn.addEventListener("click", function () { window.print(); });
  });

  $all("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var text = btn.dataset.copy;
      var done = function () { toast("PNR " + text + " copied to clipboard.", "success"); };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(done, function () { toast("PNR: " + text, "info"); });
      } else {
        toast("PNR: " + text, "info");
      }
    });
  });

  /* -------------------------------------------------------------- confetti */
  var confettiCanvas = $("[data-confetti]");
  if (confettiCanvas && !reduceMotion) {
    setTimeout(function () { burstConfetti(confettiCanvas); }, 650);
  } else if (confettiCanvas) {
    confettiCanvas.remove();
  }

  function burstConfetti(canvas) {
    var ctx = canvas.getContext("2d");
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = window.innerWidth, H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    var colors = ["#a78bfa", "#8b5cf6", "#22d3ee", "#67e8f9", "#f472b6", "#fbbf24", "#34d399", "#ffffff"];
    var origin = $(".check-wrap");
    var r = origin ? origin.getBoundingClientRect() : { left: W / 2, top: H / 3, width: 0, height: 0 };
    var ox = r.left + r.width / 2, oy = r.top + r.height / 2;
    var parts = [];

    function spawn(x, y, count, spread, baseAngle, power) {
      for (var i = 0; i < count; i++) {
        var angle = baseAngle + (Math.random() - 0.5) * spread;
        var speed = power * (0.45 + Math.random() * 0.75);
        parts.push({
          x: x, y: y,
          vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          w: 6 + Math.random() * 6, h: 8 + Math.random() * 8,
          rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.35,
          wobble: Math.random() * Math.PI * 2,
          color: colors[(Math.random() * colors.length) | 0],
          round: Math.random() < 0.25
        });
      }
    }
    // One burst from the checkmark, two side cannons from the bottom corners.
    spawn(ox, oy, 110, Math.PI * 2, 0, 15);
    spawn(0, H, 60, 0.6, -Math.PI / 3, 24);
    spawn(W, H, 60, 0.6, -Math.PI * 2 / 3, 24);

    var start = performance.now();
    function frame(now) {
      var t = now - start;
      ctx.clearRect(0, 0, W, H);
      var alive = 0;
      parts.forEach(function (p) {
        p.vx *= 0.985;
        p.vy = p.vy * 0.985 + 0.32;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        p.wobble += 0.12;
        if (p.y > H + 30) return;
        alive++;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(1, Math.cos(p.wobble));
        ctx.globalAlpha = Math.max(0, Math.min(1, 1.8 - t / 2400));
        ctx.fillStyle = p.color;
        if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.w / 2.4, 0, Math.PI * 2); ctx.fill(); }
        else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      if (alive && t < 4400) requestAnimationFrame(frame);
      else canvas.remove();
    }
    requestAnimationFrame(frame);
  }

  /* -------------------------------------------- tabs with sliding underline */
  $all("[data-underline-tabs]").forEach(function (bar) {
    var tabsEls = $all("[data-tab-target]", bar);
    var line = $(".tab-underline", bar);

    // The underline is 100px wide; move and stretch it with transform only.
    function moveLine(tab, instant) {
      if (instant) line.style.transition = "none";
      line.style.transform = "translateX(" + tab.offsetLeft + "px) scaleX(" + tab.offsetWidth / 100 + ")";
      if (instant) { void line.offsetWidth; line.style.transition = ""; }
    }

    function show(tab) {
      tabsEls.forEach(function (t) {
        var on = t === tab;
        t.classList.toggle("is-on", on);
        t.setAttribute("aria-selected", String(on));
      });
      $all("[data-tab-panel]").forEach(function (panel) {
        var on = panel.dataset.tabPanel === tab.dataset.tabTarget;
        panel.hidden = !on;
        if (on) {
          $all(".reveal", panel).forEach(function (el, i) { el.style.setProperty("--i", i); replay(el, "reveal"); });
        }
      });
      moveLine(tab);
      var url = new URL(location.href);
      url.searchParams.set("tab", tab.dataset.tabTarget);
      history.replaceState(null, "", url);
    }

    tabsEls.forEach(function (tab) { tab.addEventListener("click", function () { show(tab); }); });
    var current = $(".tab.is-on", bar) || tabsEls[0];
    moveLine(current, true);
    window.addEventListener("resize", function () { moveLine($(".tab.is-on", bar), true); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { moveLine($(".tab.is-on", bar), true); });
  });

  /* ---------------------------------------------------------- cancel modal */
  var modal = $("[data-modal]");
  if (modal) {
    var card = $(".modal-card", modal);
    var lastTrigger = null;
    var mEl = function (name) { return $("[data-m-" + name + "]", modal); };

    function openModal(trigger) {
      lastTrigger = trigger;
      modal.hidden = false;
      document.body.classList.add("modal-open");
      void modal.offsetWidth;
      modal.classList.add("is-open");
      card.focus();

      // Reset, then ask Python for the refund quote.
      mEl("route").textContent = "Checking refund…";
      mEl("body").classList.add("is-loading");
      mEl("blocked").hidden = true;
      mEl("confirm").disabled = true;
      mEl("refund").dataset.current = "0";
      mEl("refund").textContent = "0";
      $all(".policy li", modal).forEach(function (li) { li.classList.remove("is-active"); });
      mEl("form").action = trigger.dataset.cancelUrl;

      fetch(trigger.dataset.refundUrl)
        .then(function (r) { return r.json(); })
        .then(function (q) {
          mEl("body").classList.remove("is-loading");
          mEl("route").textContent = (q.route || "") + " · " + (q.date || "") + " · " + (q.depart || "") + " · Seats " + (q.seats || []).join(", ");
          mEl("total").textContent = inrFormatter.format(q.total || 0);
          mEl("hours").textContent = q.departs_in || "Departed";
          var tier = q.percent === 90 ? "90" : q.percent === 50 ? "50" : "0";
          var active = $('.policy li[data-tier="' + tier + '"]', modal);
          if (active) active.classList.add("is-active");
          if (q.ok) {
            mEl("percent").textContent = q.percent + "% refund";
            mEl("deduction").textContent = inrFormatter.format(q.deduction);
            animateNumber(mEl("refund"), q.refund, 900);
            mEl("confirm").disabled = false;
          } else {
            mEl("percent").textContent = "No refund";
            mEl("deduction").textContent = inrFormatter.format(q.total || 0);
            mEl("blocked").textContent = q.message;
            mEl("blocked").hidden = false;
          }
        })
        .catch(function () { toast("Couldn't load the refund details.", "error"); closeModal(); });
    }

    function closeModal() {
      modal.classList.remove("is-open");
      document.body.classList.remove("modal-open");
      setTimeout(function () { modal.hidden = true; }, reduceMotion ? 0 : 260);
      if (lastTrigger) lastTrigger.focus();
    }

    $all("[data-cancel]").forEach(function (btn) {
      btn.addEventListener("click", function () { openModal(btn); });
    });
    $all("[data-modal-close]", modal).forEach(function (el) { el.addEventListener("click", closeModal); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !modal.hidden) closeModal();
      // keep Tab focus inside the dialog
      if (e.key === "Tab" && !modal.hidden) {
        var focusables = $all("button:not([disabled]), a[href]", card);
        var first = focusables[0], last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    mEl("form").addEventListener("submit", function () {
      mEl("confirm").classList.add("is-busy");
      mEl("confirm").innerHTML = '<span class="spinner"></span> Cancelling…';
    });
  }

  /* -------------------------------------------------------------- PNR input */
  var pnrInput = $("[data-pnr-input]");
  if (pnrInput) {
    pnrInput.addEventListener("input", function () {
      var pos = pnrInput.selectionStart;
      pnrInput.value = pnrInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
      pnrInput.setSelectionRange(pos, pos);
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
