#!/usr/bin/env node
/**
 * Regression (2026-10-09): NO RATING anywhere in generated captions / video
 * prompts. Supersedes the old "mention rating only if >= 4.8" gate.
 *
 * Enforced on both sides: the rating never reaches the model (productContext),
 * every prompt template carries the ban, and the OUTPUT is scrubbed so a stale
 * stored prompt or an ignoring model can't leak one.
 */
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

let lastPrompt = "";
let reply = "";
const fetch = async (_u, opts) => {
  lastPrompt = JSON.parse(opts.body).messages.map((m) => m.content).join("\n");
  return { ok: true, json: async () => ({ choices: [{ message: { content: reply } }] }) };
};
const ctx = vm.createContext({ console, Math, Object, Number, Array, String, JSON, RegExp, Promise, fetch });
vm.runInContext(fs.readFileSync(__dirname + "/../src/ai.js", "utf8"), ctx);
const RMAi = ctx.RMAi;
assert(RMAi && RMAi.productContext && RMAi.stripRating, "RMAi.productContext/stripRating tidak diekspor");

const base = { name: "Case Bening iPhone 15", price: 45000, commissionPct: 8 };

// 1. rating value never reaches the model, at any value; ban always present.
for (const r of [5, 4.9, 4.8, "4.85", 4.5, 3.9, 0, null, undefined, "n/a", NaN]) {
  const p = Object.assign({}, base);
  if (r !== undefined) p.rating = r;
  const out = RMAi.productContext(p);
  assert(!/Rating:/.test(out), `rating ${String(r)} bocor ke konteks: ${out}`);
  assert(!/\b4\.9\b|\b4\.85\b/.test(out), `angka rating ${String(r)} bocor: ${out}`);
  assert(/LARANGAN RATING/.test(out), `larangan rating wajib ada (${String(r)})`);
  assert(out.includes("Case Bening iPhone 15"), "nama produk hilang");
  assert(/LARANGAN HARGA/.test(out) && /Komisi: 8%/.test(out), "harga/komisi rusak");
}

// 2. no prompt template tells the model rating is OK.
const cfg = { ai: { enabled: true, apiKey: "x", baseUrl: "http://stub", model: "m", captionPrompt: "", videoPrompt: "" } };
(async () => {
  const names = ["Case iPhone 16 Pro Floral", "Rak Dapur Susun 3 Tingkat", "Gamis Syari Premium Wanita"]; // hands / judge / large
  for (const n of names) {
    const product = { name: n, price: 39000, rating: 4.9 };
    reply = "Nemu banget. Rating 4.9/5 ⭐⭐⭐⭐⭐, 2rb review, bintang 5!\n#fyp #viral #shopeefinds #racunshopee #checkoutdulu #rating5";
    for (const [label, fn] of [["video", RMAi.generateVideoPrompt], ["caption", RMAi.generateCaption]]) {
      const out = await fn(cfg, product);
      assert(!/rating|⭐|★|bintang|\/5\b|review/i.test(out), `${label} ${n} masih ada rating: ${out}`);
      assert(/LARANGAN RATING/.test(lastPrompt), `${label} ${n}: ban tidak ada di prompt`);
      assert(!/CUKUP RATING|boleh manfaatkan RATING/i.test(lastPrompt), `${label} ${n}: prompt masih mengizinkan rating`);
      assert(!/Rating:\s*4\.9/.test(lastPrompt), `${label} ${n}: rating dikirim ke model`);
    }
  }

  // 3. stripRating scrubs the forms but leaves normal text alone.
  const dirty = "Case ini tahan banting. Rating 4.9/5 dari pembeli, ⭐4.8, ratusan review, 1.200 ulasan, bintang 5 semua.\nWarna 5 pilihan, muat 5 buah.\n#fyp #ratingtinggi #casehp";
  const clean = RMAi.stripRating(dirty);
  assert(!/rating|⭐|\/5|review|ulasan|bintang/i.test(clean), "masih ada rating: " + clean);
  assert(/Case ini tahan banting/.test(clean), "teks normal ikut terhapus");
  assert(/Warna 5 pilihan, muat 5 buah/.test(clean), "angka non-rating ikut terhapus");
  assert(/#fyp/.test(clean) && /#casehp/.test(clean), "hashtag normal ikut terhapus");

  console.log("NO-RATING LULUS");
  console.log("  rating tak pernah dikirim ke model (semua nilai): OK");
  console.log("  semua template (tangan/presenter/besar) + caption bawa larangan: OK");
  console.log("  output caption & video prompt di-scrub: OK");
  console.log("  teks/angka/hashtag normal utuh: OK");
})().catch((e) => { console.error(e); process.exit(1); });
