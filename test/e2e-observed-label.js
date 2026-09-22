#!/usr/bin/env node
/**
 * Regression: the cumulative shortlist's "Dari kata kunci" column must never be
 * filled with a URL path.
 *
 * The bug this locks out was visible in a screen recording: every product the
 * observer auto-captured on affiliate.shopee.co.id/offer/product_offer showed
 * "/offer/product_off" in that column, because the label fell back to
 * location.pathname. A URL path is not a keyword — the column could not be used
 * to tell which search a product came from, which is the only thing it is for.
 *
 * observedLabel() is extracted from content.js and exercised directly: content.js
 * is one big IIFE that boots against a live DOM, so loading the whole file here
 * would test the boot sequence rather than this decision.
 */
const assert = require("assert");
const fs = require("fs");

const src = fs.readFileSync(__dirname + "/../src/content.js", "utf8");

// --- the fallback must be gone from the shortlist call site -------------------
assert(
  !/RMShortlist\.add\([^)]*location\.pathname/.test(src),
  "shortlist label must not fall back to location.pathname"
);
assert(
  /RMShortlist\.add\(a\.products,\s*observedLabel\(a\)\)/.test(src),
  "shortlist label must come from observedLabel()"
);

// --- extract observedLabel and run it for real --------------------------------
const m = src.match(/function observedLabel\(a\)\s*\{[\s\S]*?\n  \}/);
assert(m, "observedLabel() not found in content.js");

let searchBox = null;
let activeTab = null;
const ctx = {
  window: {},
  document: {
    querySelector(sel) {
      if (/tabs-tab-active|aria-selected/.test(sel)) return activeTab;
      return null;
    }
  },
  location: { search: "", pathname: "/offer/product_offer" }
};
ctx.window.RMBulk = { findSearchInput: () => searchBox };
const observedLabel = new Function(
  "window", "document", "location",
  m[0] + "; return observedLabel;"
)(ctx.window, ctx.document, ctx.location);

// 1. marketplace ?keyword= wins and is prefixed so the latest-batch filter matches
assert.strictEqual(observedLabel({ keyword: "tumbler" }), "cari: tumbler",
  "URL keyword becomes a 'cari: ' label");

// 2. no URL keyword -> whatever is typed in the page's own search box
searchBox = { value: " pokemon card " };
assert.strictEqual(observedLabel({ keyword: "" }), "cari: pokemon card",
  "typed search term is used and trimmed");

// 3. empty search box -> the active category tab, which is honest provenance
searchBox = { value: "" };
activeTab = { textContent: " Mobile & Accessories " };
assert.strictEqual(observedLabel({ keyword: "" }), "Mobile & Accessories",
  "active category tab labels a category scan");

// 4. nothing knowable -> blank, NEVER the pathname
activeTab = null;
const blank = observedLabel({ keyword: "" });
assert.strictEqual(blank, "", "unknown provenance is blank");
assert(!/offer|product_off|\//.test(blank), "label must never contain a URL path");

// 5. a search box that throws (blocked/absent) must not break capture
searchBox = null;
ctx.window.RMBulk = { findSearchInput: () => { throw new Error("no box"); } };
assert.strictEqual(observedLabel({ keyword: "" }), "",
  "a throwing search box degrades to blank, not a crash");

console.log("OBSERVED LABEL LULUS");
console.log("  ?keyword= -> 'cari: ...': OK");
console.log("  kotak search yang diketik dipakai: OK");
console.log("  tab kategori jadi label kategori: OK");
console.log("  tidak ada lagi /offer/product_offer di kolom kata kunci: OK");
