#!/usr/bin/env node
/**
 * Regression: rating is only ever mentioned when it is GOOD (>= 4.8).
 *
 * Rule from Fikri: a 4.5 or 4.2 rating is technically "high" but in a Shopee ad
 * it LOWERS trust — Indonesian buyers read anything under 4.8 as a hesitation
 * signal. So below the threshold the rating must not reach the model at all, and
 * the model must be told explicitly not to invent or discuss one.
 *
 * productContext() feeds BOTH the caption and the video prompt, so gating it
 * there covers every generated asset. This test asserts the gate from both
 * sides: the number is present above the threshold, absent below it.
 */
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const ctx = vm.createContext({ console, Math, Object, Number, Array, String, JSON, fetch: () => {} });
vm.runInContext(fs.readFileSync(__dirname + "/../src/ai.js", "utf8"), ctx);
const RMAi = ctx.RMAi;
assert(RMAi && typeof RMAi.productContext === "function", "RMAi.productContext tidak diekspor");

const base = { name: "Case Bening iPhone 15", price: 45000, commissionPct: 8 };

// --- above / at the threshold: rating IS mentioned ---------------------------
for (const r of [4.8, 4.9, 5, "4.85"]) {
  const out = RMAi.productContext(Object.assign({}, base, { rating: r }));
  assert(/Rating:/.test(out), `rating ${r} (>=4.8) harus disebut, dapat: ${out}`);
  assert(out.includes(String(r)), `nilai rating ${r} harus muncul apa adanya`);
  assert(!/LARANGAN/.test(out), `rating bagus ${r} tidak boleh memicu larangan`);
}

// --- below the threshold: rating is NOT mentioned, and it is forbidden -------
for (const r of [4.79, 4.5, 4.2, 3.9, 0, "4.1"]) {
  const out = RMAi.productContext(Object.assign({}, base, { rating: r }));
  assert(!/Rating:/.test(out), `rating ${r} (<4.8) TIDAK boleh disebut, dapat: ${out}`);
  assert(!new RegExp("\\b" + String(r).replace(".", "\\.") + "\\b").test(out),
    `angka rating ${r} bocor ke konteks: ${out}`);
  assert(/LARANGAN/.test(out) && /rating/i.test(out),
    `harus ada larangan eksplisit menyebut rating untuk ${r}: ${out}`);
}

// --- missing / unusable rating behaves like "below threshold" ----------------
for (const r of [null, undefined, "", "n/a", NaN]) {
  const p = Object.assign({}, base);
  if (r !== undefined) p.rating = r;
  const out = RMAi.productContext(p);
  assert(!/Rating:/.test(out), `rating kosong (${String(r)}) tidak boleh disebut`);
  assert(/LARANGAN/.test(out), `rating kosong (${String(r)}) harus memicu larangan`);
}

// --- the rest of the context is untouched by the gate -----------------------
const good = RMAi.productContext(Object.assign({}, base, { rating: 4.9 }));
const bad = RMAi.productContext(Object.assign({}, base, { rating: 4.2 }));
for (const out of [good, bad]) {
  assert(out.includes("Case Bening iPhone 15"), "nama produk hilang dari konteks");
  assert(/Rp45\.000/.test(out), "harga hilang dari konteks");
  assert(/Komisi: 8%/.test(out), "komisi hilang dari konteks");
}

console.log("RATING GATE LULUS");
console.log("  >=4.8 disebut (4.8, 4.9, 5): OK");
console.log("  <4.8 disembunyikan + dilarang (4.79, 4.5, 4.2, 3.9): OK");
console.log("  rating kosong/NaN diperlakukan seperti di bawah ambang: OK");
console.log("  nama/harga/komisi tetap utuh: OK");
