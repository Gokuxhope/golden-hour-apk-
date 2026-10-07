/* ============================================================
   GoldenHour — unit tests (pure logic, no DOM)
   Exercises the public API that www/app.js exports under Node.
   Run:  node tests/test.js
   ============================================================ */

var assert = require("assert");
var app = require("../www/app.js");

var passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log("  ok   " + name); }
  catch (e) { failed++; console.log("  FAIL " + name + "\n       " + e.message); }
}
function group(title) { console.log("\n" + title); }

/* ── Vital bands ───────────────────────────────────────────── */

function bands(key, table) {
  Object.keys(table).forEach(function (value) {
    var expected = table[value];
    check(key + " " + value + " → " + expected, function () {
      assert.strictEqual(app.getBandFor(key, Number(value)), expected);
    });
  });
}

group("Vital bands");
bands("systolicBp", { 85: "critical", 95: "caution", 120: "good", 150: "caution", 190: "critical" });
bands("diastolicBp", { 45: "critical", 55: "caution", 80: "good", 100: "caution", 130: "critical" });
bands("heartRate", { 40: "critical", 55: "caution", 80: "good", 110: "caution", 128: "critical" });
bands("respRate", { 6: "critical", 10: "caution", 16: "good", 25: "caution", 35: "critical" });
bands("spo2", { 85: "critical", 92: "caution", 98: "good" });
bands("glucose", { 50: "critical", 65: "caution", 110: "good", 200: "caution", 300: "critical" });

check("blank is no band, never 'good'", function () {
  assert.strictEqual(app.getBandFor("heartRate", ""), null);
  assert.strictEqual(app.getBandFor("heartRate", null), null);
});
check("out-of-range readings get no band and are flagged", function () {
  assert.strictEqual(app.getBandFor("heartRate", 400), null);
  assert.strictEqual(app.isOutOfRange("heartRate", 400), true);
  assert.strictEqual(app.isOutOfRange("spo2", 101), true);
  assert.strictEqual(app.isOutOfRange("spo2", 97), false);
});
check("an unknown vital key is never out of range", function () {
  assert.strictEqual(app.isOutOfRange("temperature", 39), false);
  assert.strictEqual(app.getBandFor("temperature", 39), null);
});

/* ── Coercion ──────────────────────────────────────────────── */

group("Coercion");
check("toNumberOrNull keeps zero and drops blanks", function () {
  assert.strictEqual(app.toNumberOrNull("0"), 0);
  assert.strictEqual(app.toNumberOrNull(""), null);
  assert.strictEqual(app.toNumberOrNull("  "), null);
  assert.strictEqual(app.toNumberOrNull("abc"), null);
  assert.strictEqual(app.toNumberOrNull(undefined), null);
});
check("toTextOrNull trims and drops blanks", function () {
  assert.strictEqual(app.toTextOrNull("  hi  "), "hi");
  assert.strictEqual(app.toTextOrNull("   "), null);
  assert.strictEqual(app.toTextOrNull(null), null);
});

/* ── Age bands ─────────────────────────────────────────────── */

group("Age bands");
check("five bands, ending with Unknown", function () {
  assert.deepStrictEqual(app.AGE_BANDS.map(function (b) { return b.id; }), ["baby", "child", "adult", "senior", "unknown"]);
});
check("ages fall into the expected band", function () {
  assert.strictEqual(app.describeAgeBand(1).id, "baby");
  assert.strictEqual(app.describeAgeBand(8).id, "child");
  assert.strictEqual(app.describeAgeBand(35).id, "adult");
  assert.strictEqual(app.describeAgeBand(75).id, "senior");
});
check("missing or impossible ages are Unknown", function () {
  ["", null, undefined, -1, 200, "abc"].forEach(function (v) {
    assert.strictEqual(app.describeAgeBand(v).id, "unknown", String(v));
  });
});
check("each band's representative value lands in its own band", function () {
  app.AGE_BANDS.filter(function (b) { return b.value !== null; }).forEach(function (b) {
    assert.strictEqual(app.describeAgeBand(b.value).id, b.id);
  });
});
check("ageBandLabel speaks the label", function () {
  assert.strictEqual(app.ageBandLabel(75), "Senior citizen");
  assert.strictEqual(app.ageBandById("adult").hint, "18 – 60");
});

/* ── Payload ───────────────────────────────────────────────── */

group("Payload");
var form = {
  caseTypeId: "12", category: "STROKE", age: "35", gender: "M", bloodGroup: "B+",
  systolicBp: "85", diastolicBp: "55", heartRate: "128", respRate: "", spo2: "88", glucose: "110",
  consciousness: "Semi-Conscious", lat: 12.9716, lng: 77.5946, accuracy: 12, originSource: "gps",
  radiusKm: 25, images: ["a", "b", "c", "d", "e"], eta: "10", notes: "  left side weak  ",
  ambulanceId: "KA01AB1234", face: true, arm: false, speech: true, onsetHours: "2"
};
var payload = app.buildPayload(form);
check("numbers are numbers and blanks are null", function () {
  assert.strictEqual(payload.case_type_id, 12);
  assert.strictEqual(payload.age, 35);
  assert.strictEqual(payload.vitals.systolic_bp, 85);
  assert.strictEqual(payload.vitals.resp_rate, null);
  assert.strictEqual(payload.eta_minutes, 10);
});
check("origin keeps GPS accuracy and source", function () {
  assert.deepStrictEqual(payload.origin, { lat: 12.9716, lng: 77.5946, accuracy_m: 12, source: "gps" });
});
check("a hand-set origin never claims an accuracy", function () {
  var p = app.buildPayload(Object.assign({}, form, { originSource: "manual" }));
  assert.strictEqual(p.origin.accuracy_m, null);
  assert.strictEqual(p.origin.source, "manual");
});
check("images are capped at four", function () {
  assert.strictEqual(payload.images.length, app.MAX_IMAGES);
});
check("free text is trimmed", function () {
  assert.strictEqual(payload.notes, "left side weak");
});
check("stroke cases carry the FAST assessment", function () {
  assert.deepStrictEqual(payload.stroke_assessment, { face: true, arm: false, speech: true, onset_hours: 2 });
});
check("non-stroke cases do not", function () {
  var p = app.buildPayload(Object.assign({}, form, { category: "CARDIAC" }));
  assert.strictEqual("stroke_assessment" in p, false);
});
check("radius defaults to 15 km and gender to Unknown", function () {
  var p = app.buildPayload({});
  assert.strictEqual(p.broadcast_radius_km, 15);
  assert.strictEqual(p.gender, "U");
});
check("the payload never carries a priority — the server decides", function () {
  assert.strictEqual("priority" in payload, false);
});

/* ── Needs ─────────────────────────────────────────────────── */

group("Resources needed");
check("unconscious or low SpO2 needs a ventilator", function () {
  assert.strictEqual(app.deriveNeeds({ consciousness: "Unconscious" }).ventilator, true);
  assert.strictEqual(app.deriveNeeds({ vitals: { spo2: "85" } }).ventilator, true);
  assert.strictEqual(app.deriveNeeds({ vitals: { spo2: "97" } }).ventilator, false);
});
check("low systolic needs blood", function () {
  assert.strictEqual(app.deriveNeeds({ vitals: { systolic_bp: "80" } }).blood, true);
});
check("trauma needs blood, imaging and theatre", function () {
  var n = app.deriveNeeds({ category: "TRAUMA" });
  assert.deepStrictEqual([n.blood, n.imaging, n.ot, n.cathlab], [true, true, true, false]);
});
check("cardiac needs the cath lab", function () {
  assert.strictEqual(app.deriveNeeds({ category: "CARDIAC" }).cathlab, true);
});
check("stroke needs imaging", function () {
  assert.strictEqual(app.deriveNeeds({ category: "STROKE" }).imaging, true);
});

/* ── Reference data ────────────────────────────────────────── */

group("Reference data");
check("demo case list has 33 entries with unique ids", function () {
  assert.strictEqual(app.DEMO_CASE_TYPES.length, 33);
  var ids = app.DEMO_CASE_TYPES.map(function (t) { return t.id; });
  assert.strictEqual(new Set(ids).size, ids.length);
});
check("every demo case type has a known category", function () {
  var known = app.CATEGORY_LABELS.map(function (c) { return c[0]; });
  app.DEMO_CASE_TYPES.forEach(function (t) { assert.ok(known.indexOf(t.category) !== -1, t.label); });
});
check("quick picks have a short label", function () {
  app.DEMO_CASE_TYPES.filter(function (t) { return t.quick; }).forEach(function (t) { assert.ok(t.short, t.label); });
});
check("categoryOf resolves ids, including string ids", function () {
  assert.strictEqual(app.categoryOf(app.DEMO_CASE_TYPES, "12"), "STROKE");
  assert.strictEqual(app.categoryOf(app.DEMO_CASE_TYPES, null), null);
  assert.strictEqual(app.categoryOf(app.DEMO_CASE_TYPES, 999), null);
});

console.log("\n" + (failed ? "FAIL" : "PASS") + " — " + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
