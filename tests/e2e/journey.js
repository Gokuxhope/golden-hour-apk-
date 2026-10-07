/* ============================================================
   GoldenHour — end-to-end journey in a real browser (Playwright)

   Drives the whole paramedic flow on phone-sized screens, light and
   dark, full glass and lite, and checks what only a real renderer can:
   the font loads, nothing overflows sideways, tap targets are big
   enough, the Broadcast dock stays above the tab bar, blur is off in
   lite mode. Saves a screenshot of every step.

   Not part of `npm test` (CI has no browser). Run locally:
     npm run test:e2e                     # screenshots → tests/e2e/out
     PLAYWRIGHT_PATH=/path/to/playwright npm run test:e2e
     E2E_ROOT=unzipped-apk/assets/public npm run test:e2e   # test a built APK
   ============================================================ */

var http = require("http");
var fs = require("fs");
var path = require("path");

function loadPlaywright() {
  var tries = [process.env.PLAYWRIGHT_PATH, "playwright", "/opt/node22/lib/node_modules/playwright"].filter(Boolean);
  for (var i = 0; i < tries.length; i++) { try { return require(tries[i]); } catch (_) {} }
  console.log("SKIP — Playwright is not installed (set PLAYWRIGHT_PATH or `npm i -D playwright`).");
  process.exit(0);
}
var chromium = loadPlaywright().chromium;

var ROOT = path.resolve(process.env.E2E_ROOT || path.join(__dirname, "..", "..", "www"));
var OUT = process.env.E2E_OUT || path.join(__dirname, "out");
fs.mkdirSync(OUT, { recursive: true });

var TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2" };
var server = http.createServer(function (req, res) {
  var p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/index.html";
  var f = path.join(ROOT, p);
  if (f.indexOf(ROOT) !== 0 || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});

var passed = 0, failed = 0;
function ok(cond, name, detail) {
  if (cond) { passed++; console.log("  ok   " + name); }
  else { failed++; console.log("  FAIL " + name + (detail ? "\n       " + detail : "")); }
}

/* Every visible control a thumb has to hit, with its rendered size. */
function smallTargets(page) {
  return page.evaluate(function () {
    var sel = "button, a[href], input:not([type=hidden]):not([type=file]), select, textarea";
    return Array.prototype.filter.call(document.querySelectorAll(sel), function (el) {
      var r = el.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      var cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || el.closest("[hidden]")) return false;
      return Math.min(r.height, r.width) < 44 && el.type !== "range";
    }).map(function (el) { var r = el.getBoundingClientRect(); return (el.id || el.className) + " " + Math.round(r.width) + "×" + Math.round(r.height); });
  });
}

async function journey(browser, base, o) {
  var tag = o.scheme + "-" + o.width + (o.lite ? "-lite" : "");
  console.log("\n" + tag);
  var ctx = await browser.newContext({
    viewport: { width: o.width, height: o.height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: o.scheme
  });
  await ctx.route(/railway\.app/, function (r) { return r.abort(); });
  await ctx.addInitScript(function (lite) {
    window.__GH_DEMO = true; window.__GH_POLL_MS = 400; window.__GH_DEMO_POST_MS = 200; window.confirm = function () { return true; };
    try { localStorage.setItem("gh.ui.fx", lite ? "lite" : "full"); } catch (_) {}
  }, !!o.lite);
  var page = await ctx.newPage();
  var errors = [];
  page.on("pageerror", function (e) { errors.push(String(e)); });
  page.on("console", function (m) { if (m.type() === "error") errors.push(m.text()); });
  var n = 0;
  async function shot(name) { await page.waitForTimeout(500); await page.screenshot({ path: path.join(OUT, tag + "-" + String(++n).padStart(2, "0") + "-" + name + ".png") }); }
  async function noOverflow(where) {
    var over = await page.evaluate(function () { return document.documentElement.scrollWidth - window.innerWidth; });
    ok(over <= 0, where + ": nothing overflows sideways", over + "px too wide");
  }

  await page.goto(base);
  await page.evaluate(function () { return document.fonts.ready; });
  ok(await page.evaluate(function () { return document.fonts.check("600 16px Inter"); }), "Inter is loaded from the app bundle");
  var tabBlur = await page.$eval("#tabbar", function (el) { var cs = getComputedStyle(el); return cs.backdropFilter || cs.webkitBackdropFilter || "none"; });
  ok(o.lite ? tabBlur === "none" : tabBlur !== "none", o.lite ? "lite: no blur on the tab bar" : "full: tab bar is frosted glass", tabBlur);
  await shot("home");
  await noOverflow("home");
  var small = await smallTargets(page);
  ok(small.length === 0, "home: every tap target is at least 44px", small.join(", "));

  await page.click("#startAlertBtn");
  await shot("form");
  var dock = await page.evaluate(function () {
    var s = document.querySelector(".submit-bar").getBoundingClientRect();
    var t = document.getElementById("tabbar").getBoundingClientRect();
    return { dockBottom: s.bottom, dockTop: s.top, tabTop: t.top, vh: window.innerHeight };
  });
  ok(dock.dockTop > 0 && dock.dockBottom <= dock.tabTop + 1 && dock.tabTop < dock.vh,
    "form: the Broadcast dock floats above the tab bar, in reach from the first screen", JSON.stringify(dock));

  await page.click("#quickCase .chip >> text=Stroke");
  await page.click('#ageChips [data-age-band="adult"]');
  await page.click('#genderSeg [data-value="M"]');
  await page.click('#consciousnessGroup [data-value="Semi-Conscious"]');
  await page.fill("#systolicBp", "85"); await page.fill("#diastolicBp", "55");
  await page.fill("#heartRate", "128"); await page.fill("#spo2", "88");
  ok(await page.evaluate(function () { return document.documentElement.classList.contains("kbd-open"); }), "form: typing hides the floating bars");
  await page.click('#fastFace [data-yn="yes"]');
  await page.click('#etaChips [data-eta="10"]');
  await page.evaluate(function () { document.getElementById("heartRate").scrollIntoView({ block: "center" }); });
  await shot("vitals");
  await noOverflow("form");
  small = await smallTargets(page);
  ok(small.length === 0, "form: every tap target is at least 44px", small.join(", "));

  await page.click("#submitBtn");
  await page.waitForSelector("#successOverlay:not([hidden])");
  await shot("broadcast-pending");
  var x = await page.evaluate(function () {
    var s = document.querySelector("#successOverlay .sheet").getBoundingClientRect();
    var b = document.querySelector("#successOverlay .sheet-x").getBoundingClientRect();
    return { right: s.right - b.right, top: b.top - s.top, centre: (b.left + b.width / 2) - (s.left + s.width / 2) };
  });
  ok(x.centre > 0 && x.right < 30 && x.top < 40, "sheet: close button sits in the top-right corner", JSON.stringify(x));
  await page.waitForSelector("#statusChip.status-accepted", { timeout: 8000 });
  await shot("broadcast-accepted");
  await page.click("#successOverlay .sheet-x");
  await page.click('.tab[data-view="home"]');
  ok(await page.evaluate(function () { return window.scrollY === 0; }), "home: a new screen opens at the top");
  await shot("home-active");
  await noOverflow("active case");
  small = await smallTargets(page);
  ok(small.length === 0, "active case: every tap target is at least 44px", small.join(", "));

  await page.click("#editPatientBtn");
  await shot("edit-patient");
  await page.click("#editCancelBtn");
  /* A status poll in flight can overwrite ARRIVED with ACCEPTED (known
     app.js issue, not a rendering one). Park the poll before tapping. */
  await page.evaluate(function () { window.__GH_POLL_MS = 1e9; });
  await page.waitForTimeout(500);
  await page.click("#arrivedBtn");
  await page.waitForSelector("#arrivedBanner:not([hidden])");
  await shot("arrived");

  await page.click('.tab[data-view="settings"]');
  var ink = await page.$eval("#tabbar", function (el) { return el.style.getPropertyValue("--tab-i"); });
  ok(ink === "3", "settings: the tab lens moved under Settings", ink);
  await shot("settings");

  ok(errors.length === 0, "no script errors", errors.join(" | "));
  await ctx.close();
}

(async function () {
  await new Promise(function (r) { server.listen(0, "127.0.0.1", r); });
  var base = "http://127.0.0.1:" + server.address().port + "/";
  var browser = await chromium.launch();
  try {
    await journey(browser, base, { scheme: "light", width: 360, height: 780 });
    await journey(browser, base, { scheme: "dark", width: 412, height: 915 });
    await journey(browser, base, { scheme: "light", width: 390, height: 844, lite: true });
  } finally {
    await browser.close();
    server.close();
  }
  console.log("\n" + (failed ? "FAIL" : "PASS") + " — " + passed + " passed, " + failed + " failed · screenshots in " + OUT);
  process.exit(failed ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
