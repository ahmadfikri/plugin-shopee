/* e2e.js — run the REAL plugin pipeline (scraper -> analytics -> panel) against
 * a Shopee-like fixture, using a minimal DOM shim so no dependency is needed.
 * This exercises the actual src/*.js the extension ships. */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(__dirname, "fixture-shopee.html"), "utf8");

/* ---- tiny DOM shim: enough of the API that scraper/panel use ---- */
function makeEl(tag) {
  return {
    tagName: (tag || "div").toUpperCase(), children: [], attrs: {}, _text: "",
    className: "", style: {},
    set textContent(v) { this._text = v; }, get textContent() {
      return this._text || this.children.map((c) => c.textContent).join(" ");
    },
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k] != null ? this.attrs[k] : null; },
    appendChild(c) { this.children.push(c); return c; },
    prepend(c) { this.children.unshift(c); return c; },
    addEventListener() {},
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
    querySelectorAll(sel) { return queryAll(this, sel); },
    get classList() {
      const cn = this.className;
      return { contains: (c) => (" " + cn + " ").includes(" " + c + " ") };
    },
    remove() {}
  };
}
// extremely small selector engine: supports tag, .class, [attr], [attr='v'], a[href]
function matches(el, sel) {
  sel = sel.trim();
  if (sel.startsWith("[")) {
    const m = sel.match(/^\[([\w-]+)(?:[*^]?=['"]?([^'"\]]+)['"]?)?\]$/);
    if (!m) return false;
    const val = el.getAttribute(m[1]);
    if (val == null) return false;
    return m[2] ? String(val).includes(m[2]) : true;
  }
  let tag = null, cls = null, attr = null;
  const am = sel.match(/\[([\w-]+)(?:[*^]?=['"]?([^'"\]]+)['"]?)?\]/);
  if (am) { attr = am; sel = sel.replace(am[0], ""); }
  if (sel.includes(".")) { const p = sel.split("."); tag = p[0] || null; cls = p[1]; }
  else if (sel) tag = sel;
  if (tag && el.tagName !== tag.toUpperCase()) return false;
  if (cls && !(" " + el.className + " ").includes(" " + cls + " ")) return false;
  if (attr) {
    const v = el.getAttribute(attr[1]); if (v == null) return false;
    if (attr[2] && !String(v).includes(attr[2])) return false;
  }
  return true;
}
function walk(el, out) { for (const c of el.children) { out.push(c); walk(c, out); } }
function queryAll(root, selector) {
  const all = []; walk(root, all);
  // take last simple token of a descendant selector
  const token = selector.trim().split(/\s+/).pop();
  return all.filter((e) => matches(e, token));
}

/* ---- parse the fixture HTML into shim nodes (very small parser) ---- */
function parse(htmlStr) {
  const root = makeEl("root");
  const stack = [root];
  const re = /<(\/?)([a-zA-Z0-9]+)([^>]*)>|([^<]+)/g;
  let m;
  while ((m = re.exec(htmlStr))) {
    if (m[4] != null && m[4].trim()) {
      const t = m[4].replace(/\s+/g, " ").trim();
      if (t) stack[stack.length - 1]._text += (stack[stack.length - 1]._text ? " " : "") + t;
    } else if (m[2]) {
      if (m[1]) { if (stack.length > 1) stack.pop(); }
      else {
        const el = makeEl(m[2]);
        const attrs = m[3] || "";
        const cm = attrs.match(/class=["']([^"']*)["']/); if (cm) el.className = cm[1];
        let am; const ar = /([\w-]+)=["']([^"']*)["']/g;
        while ((am = ar.exec(attrs))) { if (am[1] !== "class") el.setAttribute(am[1], am[2]); }
        stack[stack.length - 1].appendChild(el);
        if (!/\/>$/.test(m[0]) && !["img", "br", "input"].includes(m[2])) stack.push(el);
      }
    }
  }
  return root;
}

const docRoot = parse(html);
const mainEl = docRoot.querySelectorAll("main")[0] || docRoot;

/* ---- global sandbox emulating window + document + chrome ---- */
const store = {};
const sandbox = {
  window: {}, console,
  location: { search: "?keyword=tas anak sekolah", pathname: "/search", href: "https://shopee.co.id/search?keyword=tas" },
  document: {
    querySelector: (s) => docRoot.querySelectorAll(s)[0] || (s === "main" ? mainEl : null),
    querySelectorAll: (s) => docRoot.querySelectorAll(s),
    createElement: makeEl, body: mainEl
  },
  URLSearchParams: URLSearchParams,
  chrome: {
    storage: { local: {
      get: (k, cb) => cb(typeof k === "string" ? { [k]: store[k] } : {}),
      set: (o, cb) => { Object.assign(store, o); cb && cb(); }
    } },
    runtime: {}, tabs: {}
  },
  fetch: () => Promise.reject(new Error("no network in harness"))
};
sandbox.window = sandbox;
sandbox.self = sandbox;
vm.createContext(sandbox);

/* ---- load the REAL plugin scripts in manifest order ---- */
for (const f of ["storage.js", "scraper.js", "proscore.js", "analytics.js", "ai.js", "charts.js", "panel.js"]) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, "src", f), "utf8"), sandbox, { filename: f });
}

/* ---- run the pipeline ---- */
(async () => {
  console.log("=== 1. SCRAPE ===");
  const snap = sandbox.RMScraper.scrapePage();
  console.log("keyword:", snap.keyword, "| products parsed:", snap.products.length);
  snap.products.forEach((p) =>
    console.log(`  - ${p.name.slice(0, 40)} | Rp${p.price} | sold=${p.soldTotal} | shop=${p.shop}`));

  console.log("\n=== 2. ANALYZE ===");
  const cfg = await sandbox.RMStore.getConfig();
  const a = sandbox.RMAnalytics.analyze(snap, cfg);
  console.log("Market Size:", a.marketSize.toLocaleString("id-ID"));
  console.log("Price range:", a.priceMin, "-", a.priceMax, "| median", a.medianPrice);
  console.log("Saturation:", a.saturation, "(" + a.top3Pct + "% top-3)");
  console.log("Sweet-spot bucket:", a.sweetSpot ? (a.sweetSpot.lo + "-" + a.sweetSpot.hi) : "n/a");
  console.log("\n  --- ADVANCED ---");
  console.log("  Opportunity Score:", a.opportunityScore + "/100 ->", a.verdict);
  console.log("  Breakdown:", JSON.stringify(a.scoreBreakdown));
  console.log("  Quadrant:", a.quadrant);
  console.log("  Est. affiliate profit/mo:", a.profitPerMonth.toLocaleString("id-ID"));
  console.log("  Recommended entry price:", a.entryPrice ? a.entryPrice.toLocaleString("id-ID") : "n/a");
  console.log("  Age dist:", JSON.stringify(a.ageDist));
  console.log("\n  per-product verdicts:");
  a.products.forEach((p) =>
    console.log(`  - ${p.name.slice(0, 34).padEnd(34)} Rp${String(p.price).padStart(7)} | ` +
      `u/mo=${String(p.unitsPerMonth).padStart(5)} | rev/mo=${p.revenuePerMonth} | ` +
      `LAYAK=${p.layak.verdict} (vpc Rp${p.layak.valuePerClick})`));

  console.log("\n=== 3. PANEL (render smoke test) ===");
  const panel = sandbox.RMPanel.build(a, cfg);
  const html = panel.innerHTML;
  console.log("panel built, innerHTML length:", html.length);
  for (const must of ["Riset Market", "Market Size", "Layak Iklan", "Export"]) {
    console.log("  contains '" + must + "':", html.includes(must));
  }

  console.log("\n=== 4. AI gating ===");
  try { await sandbox.RMAi.generateCaption(cfg, a.products[0]); console.log("  UNEXPECTED: AI ran"); }
  catch (e) { console.log("  AI correctly blocked:", e.message); }

  console.log("\nE2E PIPELINE OK");
})().catch((e) => { console.error("E2E FAILED:", e); process.exit(1); });
