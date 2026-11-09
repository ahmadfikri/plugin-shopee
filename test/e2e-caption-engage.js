#!/usr/bin/env node
/**
 * Regression: engagement caption tanpa engagement bait (v0.9.33).
 *
 * Fikri 2026-11-09: caption harus mendorong like & share, tetap SEO friendly.
 * Caranya lewat isi (momen relatable, hal berguna, pertanyaan penutup), bukan
 * minta like/share/tag, karena FB/IG menurunkan engagement bait. Dua lapis:
 * prompt bawaan meminta struktur engagement + larangan bait, dan
 * ensureHashtags() membuang kalimat bait dari output tanpa merusak kata kunci,
 * ajakan cek link, hashtag, dan disclaimer.
 */
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const ctx = vm.createContext({ console, Math, Object, Number, Array, String, JSON, RegExp, fetch: () => {} });
vm.runInContext(fs.readFileSync(__dirname + "/../src/ai.js", "utf8"), ctx);
const RMAi = ctx.RMAi;
const P = RMAi.DEFAULT_CAPTION_PROMPT;
const product = { name: "Case Bening iPhone 15 Polkadot" };

// 1. prompt: SEO tetap nomor satu, engagement ditambahkan, bait dilarang
assert(/KALIMAT PERTAMA WAJIB memuat kata kunci utama/.test(P), "aturan SEO kalimat pertama hilang");
assert(/momen relatable/i.test(P), "prompt tidak minta momen relatable");
assert(/pertanyaan terbuka/i.test(P), "prompt tidak minta pertanyaan penutup");
assert(/LARANGAN ENGAGEMENT BAIT/.test(P), "larangan engagement bait hilang");
assert(/LARANGAN HARGA/.test(P) && /LARANGAN RATING/.test(P), "larangan harga/rating hilang");

// 2. kalimat bait dibuang, sisanya utuh
const bait = [
  "Jangan lupa like dan share ya!",
  "Like kalau kamu setuju.",
  "Share ke temen kamu yang HP-nya sering jatuh.",
  "Tag temen kamu yang butuh ini!",
  "Komen MAU kalau pengen link-nya.",
  "Kasih like dulu dong.",
  "Bagikan video ini biar makin banyak yang tau.",
];
for (const b of bait) {
  const raw = "Casing iphone 15 polkadot ini bening dan nggak gampang kuning. " + b +
    "\nHP kamu paling sering jatuh di mana? Cek link ya.\n\n" +
    "#casinghp #casehp #aksesorishp #fyp #viral #casingiphone15 #racunshopee";
  const out = RMAi.ensureHashtags(raw, product);
  assert(!RMAi.BAIT_PATTERNS.some((re) => re.test(out.split("\n#")[0])), `bait lolos: "${b}"\n${out}`);
  assert(/^Casing iphone 15 polkadot ini bening/.test(out), `kalimat kata kunci rusak: "${b}"\n${out}`);
  assert(/HP kamu paling sering jatuh di mana\?/.test(out), `pertanyaan penutup hilang: "${b}"\n${out}`);
  assert(/Cek link ya\./.test(out), `ajakan cek link hilang: "${b}"\n${out}`);
  assert(out.includes(RMAi.CAPTION_DISCLAIMER), `disclaimer hilang: "${b}"`);
  assert(/#casingiphone15/.test(out), `hashtag hilang: "${b}"`);
}

// 3. kalimat wajar TIDAK ikut terbuang (false positive)
const safe = [
  "Aku love banget warnanya, apalagi kalau kena cahaya.",
  "Cocok buat kamu yang suka casing simpel.",
  "Gampang dibersihin, tinggal lap pakai tisu basah.",
  "Kirim paketnya cepat dan rapi.",
  "Buat yang HP-nya sering jatuh dari kasur, ini aman.",
];
for (const s of safe) {
  assert.strictEqual(RMAi.stripEngagementBait(s), s, `kalimat wajar ikut terbuang: "${s}"`);
}

// 4. baris hashtag & link tidak disentuh
const tagLine = "#likeforlike #sharethis #casinghp";
assert.strictEqual(RMAi.stripEngagementBait(tagLine), tagLine, "baris hashtag ikut diubah");

console.log("OK   caption engagement: struktur relatable + tanpa engagement bait (" +
  (bait.length + safe.length + 1) + " skenario)");
