#!/usr/bin/env node
/**
 * REAL-BROWSER end-to-end test for the shortlist CSV export.
 *
 * Real Chromium + real extension. The export builds a Blob and triggers a
 * download via a synthetic <a download>; this test intercepts that download,
 * reads the file Chromium actually wrote, and parses it. What it locks:
 *   * the file is really produced on click (not just a dead button),
 *   * the header has every column,
 *   * a product NAME containing a comma and a double-quote does not shift or
 *     break columns — the CSV-escaping bug that silently corrupts every row
 *     after the offending one.
 *
 * The comma/quote case is injected through the fixture: one product name is
 * crafted to contain both, so a broken escaper produces the wrong column count.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const EXT = path.resolve(__dirname, "..");
// Fixture with one hostile product name (comma + quote + newline-ish text).
let FIXTURE = fs.readFileSync(__dirname + "/fixtures/shopee-offer.html", "utf8");
FIXTURE = FIXTURE.replace(
  'render("", 12);',
  // inject a product whose NAME would break a naive CSV writer
  'render("", 12); (function(){var g=document.getElementById("grid");' +
  'var a=document.createElement("a");' +
  'a.href="https://shopee.co.id/evil-i.777.7";' +
  'a.innerHTML=\'<div class="ItemCard__contentSection">\' +' +
  '  \'<div class="ItemCard__name">Case "Pro", Max, iPhone</div>\' +' +
  '  \'<div class="ItemCard__price"><span class="price">Rp99.000</span></div>\' +' +
  '  \'<div class="ItemCardSold__wrap">500 terjual</div>\' +' +
  '  \'<div class="commRate">9.5%</div></div>\';' +
  'g.appendChild(a);})();'
);
const URL = "https://affiliate.shopee.co.id/offer/product_offer";

function loadPlaywright() {
  const c = ["playwright", "playwright-core",
    "/opt/homebrew/lib/node_modules/@playwright/cli/node_modules/playwright-core",
    "/usr/local/lib/node_modules/@playwright/cli/node_modules/playwright-core"];
  for (const p of c) { try { return require(p); } catch (_) {} }
  return null;
}

// A correct CSV line parser (RFC4180-ish): honours quotes and escaped quotes.
function parseLine(line) {
  const out = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else {
      if (ch === '"') q = true;
      else if (ch === ",") { out.push(cur); cur = ""; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

(async () => {
  const pw = loadPlaywright();
  if (!pw) { console.log("BROWSER E2E CSV DILEWATI — playwright tidak terpasang."); process.exit(0); }

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "rm-csv-"));
  const ctx = await pw.chromium.launchPersistentContext(profile, {
    headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`,
           "--no-first-run", "--no-default-browser-check", "--window-position=-2400,-2400"],
    acceptDownloads: true
  });

  let failed = null;
  try {
    await ctx.route("https://affiliate.shopee.co.id/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: FIXTURE }));
    const page = ctx.pages()[0] || await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    await page.goto(URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".rm-sl-export", { timeout: 20000 });
    // let the landing-page products (incl. the hostile one) reach the shortlist
    await page.waitForTimeout(1500);

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 20000 }),
      page.click(".rm-sl-export")
    ]);
    const dest = path.join(profile, "export.csv");
    await download.saveAs(dest);
    assert(fs.existsSync(dest) && fs.statSync(dest).size > 0, "file CSV tidak terbentuk / kosong");

    const text = fs.readFileSync(dest, "utf8").replace(/\r\n/g, "\n").trim();
    const lines = text.split("\n");
    const header = parseLine(lines[0]);

    for (const col of ["name", "price", "maxCPC", "keyword", "href", "pro", "action"]) {
      assert(header.includes(col), "kolom '" + col + "' hilang dari header CSV: " + header.join(","));
    }

    // every data row must have exactly as many fields as the header — this is
    // what breaks when a name with a comma is not quoted correctly
    const width = header.length;
    lines.slice(1).forEach((ln, i) => {
      const cells = parseLine(ln);
      assert.strictEqual(cells.length, width,
        `baris ${i + 1} punya ${cells.length} kolom, seharusnya ${width} — escaping CSV rusak: ${ln}`);
    });

    // the hostile name must round-trip intact
    const nameIdx = header.indexOf("name");
    const names = lines.slice(1).map((ln) => parseLine(ln)[nameIdx]);
    assert(names.some((n) => n === 'Case "Pro", Max, iPhone'),
      "nama produk dengan koma+kutip tidak terjaga utuh: " + JSON.stringify(names.slice(0, 5)));

    assert.strictEqual(errors.length, 0, "error JS: " + errors.join(" | "));

    console.log("BROWSER E2E CSV LULUS");
    console.log("  file benar-benar terunduh (" + fs.statSync(dest).size + " byte): OK");
    console.log("  header memuat semua kolom kunci: OK");
    console.log("  tiap baris punya jumlah kolom benar: OK");
    console.log("  nama dengan koma+kutip utuh: OK");
  } catch (e) {
    failed = e;
  } finally {
    await ctx.close().catch(() => {});
    fs.rmSync(profile, { recursive: true, force: true });
  }
  if (failed) { console.error("BROWSER E2E CSV GAGAL:", failed.message); process.exit(1); }
})();
