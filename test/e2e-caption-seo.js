#!/usr/bin/env node
/**
 * Regression: caption SEO prompt + niche tags + disclaimer (v0.9.24).
 *
 * Fikri 2026-10-13: caption fokus SEO, dan setiap caption wajib ada disclaimer
 * "produk mungkin sedikit berbeda". Replaces the old 10.10 campaign-tag test
 * (campaign over, tags removed in v0.9.23).
 *
 * Two layers: the built-in prompt must ask for it, AND ensureHashtags() must
 * enforce it on the output, because a stored captionPrompt can shadow the
 * default and the model can ignore instructions.
 */
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const ctx = vm.createContext({ console, Math, Object, Number, Array, String, JSON, RegExp, fetch: () => {} });
vm.runInContext(fs.readFileSync(__dirname + "/../src/ai.js", "utf8"), ctx);
const RMAi = ctx.RMAi;
const D = RMAi.CAPTION_DISCLAIMER;
assert(D && /mungkin sedikit berbeda/.test(D), "CAPTION_DISCLAIMER tidak diekspor / salah");

const product = { name: "Case Bening iPhone 15 Polkadot", price: 45000, commissionPct: 8 };
const NICHE = Array.from(RMAi.nicheTags(product.name));
const count = (t, s) => t.split(s).length - 1;

function check(out, label) {
  assert.strictEqual(count(out, D), 1, `${label}: disclaimer harus tepat 1x:\n${out}`);
  const lines = out.trim().split("\n");
  const last = lines[lines.length - 1];
  assert(/^#/.test(last.trim()), `${label}: baris terakhir harus hashtag:\n${out}`);
  const dIdx = lines.findIndex((l) => l === D);
  assert(dIdx >= 0 && dIdx < lines.length - 1, `${label}: disclaimer harus di atas hashtag:\n${out}`);
  for (const tag of NICHE) {
    assert(new RegExp("(^|\\s)" + tag + "\\b", "i").test(out), `${label}: ${tag} hilang:\n${out}`);
  }
  assert(!/#1010/i.test(out), `${label}: tag kampanye 10.10 masih ada`);
}

// 1. prompt bawaan minta SEO + disclaimer
const P = RMAi.DEFAULT_CAPTION_PROMPT;
assert(/SEO/.test(P) && /KALIMAT PERTAMA WAJIB memuat kata kunci utama/.test(P), "prompt tidak SEO-first");
assert(P.includes(D), "prompt tidak menyebut disclaimer");
assert(/LARANGAN HARGA/.test(P) && /LARANGAN RATING/.test(P), "larangan harga/rating hilang dari prompt");

// 2. model lupa hashtag + disclaimer
{
  const out = RMAi.ensureHashtags("Casing iphone 15 polkadot ini bikin HP lama kelihatan baru.\nCek link ya.", product);
  check(out, "tanpa hashtag");
  assert(/Casing iphone 15 polkadot/.test(out), "isi caption hilang");
}
// 3. hashtag lengkap tanpa disclaimer
{
  const out = RMAi.ensureHashtags(
    "Casing iphone 15 polkadot, motifnya lucu.\nCek link ya.\n\n" +
    "#fyp #viral #casinghp #casingiphone15 #racunshopee #shopeefinds #checkoutdulu", product);
  check(out, "tanpa disclaimer");
}
// 4. model sudah tulis disclaimer persis — jangan dobel
{
  const out = RMAi.ensureHashtags(
    "Casing iphone 15 polkadot.\nCek link.\n" + D + "\n\n" +
    "#fyp #viral #casinghp #casehp #aksesorishp #racunshopee #shopeefinds", product);
  check(out, "sudah ada");
}
// 5. varian disclaimer buatan model diganti ke versi baku
{
  const out = RMAi.ensureHashtags(
    "Casing iphone 15 polkadot.\nCek link.\n*Produk mungkin berbeda sedikit... eh, produk mungkin sedikit berbeda ya\n\n" +
    "#fyp #viral #casinghp #casehp #aksesorishp #racunshopee #shopeefinds", product);
  check(out, "varian model");
}
// 6. disclaimer di bawah hashtag (salah posisi) dipindah ke atas
{
  const out = RMAi.ensureHashtags(
    "Casing iphone 15 polkadot.\nCek link.\n\n" +
    "#fyp #viral #casinghp #casehp #aksesorishp #racunshopee #shopeefinds\n" + D, product);
  check(out, "salah posisi");
}
// 7. input kosong tidak error
for (const w of ["", "   ", null, undefined]) check(RMAi.ensureHashtags(w, product), "kosong(" + w + ")");

console.log("OK   caption SEO-first + niche tags + disclaimer 'mungkin sedikit berbeda' (7 skenario)");
