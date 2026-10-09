/* ============================================================
   Build a single, self-contained, clickable demo of the app.

     node tools/build-demo.js            → demo/GoldenHour-demo.html

   Everything is inlined (styles, scripts, the Inter font, the icon
   sprite), the app is forced into demo mode, and the Socket.IO client is
   left out, so the file opens straight from disk, from a chat attachment
   or from a static host and never touches the network or the backend.

   Two demo-only shims, neither of which ships in the APK:
   • window.confirm always answers yes. Some hosts (and embedded viewers)
     refuse native dialogs, which would make "Reached hospital" and
     "Clear history" do nothing during a presentation.
   • Once a hospital accepts, the status poll is parked. In demo mode the
     simulated hospital never reports ARRIVED, so a later poll would flip a
     closed case back to "Accepted" (a known app.js issue, tracked
     separately).
   ============================================================ */

var fs = require("fs");
var path = require("path");

var ROOT = path.join(__dirname, "..", "www");
var OUT = process.argv[2] || path.join(__dirname, "..", "demo", "GoldenHour-demo.html");

function read(f) { return fs.readFileSync(path.join(ROOT, f), "utf8"); }
function safeScript(src) {
  if (/<\/script/i.test(src)) throw new Error("a script contains </script> and cannot be inlined");
  return src;
}

var html = read("index.html");
var font = fs.readFileSync(path.join(ROOT, "fonts", "inter-var-latin.woff2")).toString("base64");
var css = read("style.css").replace('url("fonts/inter-var-latin.woff2")', 'url("data:font/woff2;base64,' + font + '")');
if (css.indexOf("data:font/woff2") === -1) throw new Error("font reference not found in style.css");

var demoConfig = [
  "window.GH_CONFIG = {",
  '  SERVER_BASE: "", API_PATH: "/api/v1", MODE: "demo", REALTIME: false, POLL_MS: 1500,',
  '  FALLBACK_ORIGIN: { lat: 12.9716, lng: 77.5946, label: "Bengaluru city centre" }',
  "};",
  "window.confirm = function () { return true; };"
].join("\n");

var parkPoll = [
  "(function () {",
  "  var chip = document.getElementById('statusChip');",
  "  if (!chip || !window.MutationObserver) return;",
  "  new MutationObserver(function () {",
  "    if (chip.classList.contains('status-accepted')) window.__GH_POLL_MS = 1e9;",
  "    else window.__GH_POLL_MS = 0;",
  "  }).observe(chip, { attributes: true, attributeFilter: ['class'] });",
  "})();"
].join("\n");

var out = html
  .replace(/<link rel="preload"[^>]*>\n?/, "")
  .replace('<link rel="stylesheet" href="style.css">', function () { return "<style>\n" + css + "\n</style>"; })
  .replace('<title>GoldenHour</title>', "<title>GoldenHour Demo</title>")
  .replace(/<script src="config\.js"><\/script>\n<script src="vendor\/socket\.io\.min\.js"><\/script>\n<script src="app\.js"><\/script>\n<script src="ui\.js"><\/script>/,
    function () {
      return "<script>\n" + demoConfig + "\n</script>\n" +
        "<script>\n" + safeScript(read("app.js")) + "\n</script>\n" +
        "<script>\n" + safeScript(read("ui.js")) + "\n</script>\n" +
        "<script>\n" + parkPoll + "\n</script>";
    });

if (/src="(config|app|ui)\.js"|href="style\.css"/.test(out)) throw new Error("an asset was not inlined");

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out);
console.log("wrote " + path.relative(process.cwd(), OUT) + " (" + Math.round(out.length / 1024) + " KB)");
