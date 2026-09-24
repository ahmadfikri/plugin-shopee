#!/usr/bin/env node
/**
 * Regression: the 10.10 campaign hashtags are in EVERY caption.
 *
 * Rule from Fikri (24 Sep 2026): every caption the plugin produces must carry
 * #1010BrandsFestival and #1010ShopeeMall.
 *
 * Two layers are tested, because the prompt alone is not enough: a stored
 * captionPrompt in chrome.storage can shadow the built-in template (the known
 * stale-prompt gotcha), and the model can simply ignore an instruction. So the
 * code-level safety net in ensureHashtags() must add the tags no matter what
 * text came back.
 */
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const ctx = vm.createContext({ console, Math, Object, Number, Array, String, JSON, RegExp, fetch: () => {} });
vm.runInContext(fs.readFileSync(__dirname + "/../src/ai.js", "utf8"), ctx);
const RMAi = ctx.RMAi;
assert(RMAi && typeof RMAi.ensureHashtags === "function", "RMAi.ensureHashtags tidak diekspor");

const TAGS = Array.from(RMAi.CAMPAIGN_TAGS); // cross-realm: copy into this realm
assert.deepStrictEqual(TAGS, ["#1010BrandsFestival", "#1010ShopeeMall"],
  "daftar hashtag kampanye tidak sesuai: " + JSON.stringify(TAGS));

const product = { name: "Case Bening iPhone 15 Polkadot", price: 45000, commissionPct: 8 };
const has = (t, tag) => new RegExp("(^|\\s)" + tag + "(\\s|$)").test(t);
const countOf = (t, tag) => (t.match(new RegExp(tag, "g")) || []).length;

function assertBoth(out, label) {
  for (const tag of TAGS) {
    assert(has(out, tag), `${label}: ${tag} tidak ada di output:\n${out}`);
    assert.strictEqual(countOf(out, tag), 1, `${label}: ${tag} muncul lebih dari sekali:\n${out}`);
  }
}

// --- 1. layer PROMPT: instruksi kampanye ada di template bawaan --------------
const prompt = RMAi.DEFAULT_CAPTION_PROMPT;
for (const tag of TAGS) {
  assert(prompt.includes(tag), `prompt bawaan tidak menyebut ${tag}`);
}

// --- 2. model lupa total (caption tanpa hashtag sama sekali) -----------------
{
  const out = RMAi.ensureHashtags(
    "Casing polkadot ini bikin HP lama kelihatan baru.\nCek link ya.", product);
  assertBoth(out, "tanpa hashtag");
  assert(/Casing polkadot/.test(out), "isi caption hilang");
}

// --- 3. model kasih hashtag lengkap tapi TANPA tag kampanye ------------------
{
  const body = "Motifnya lucu banget, cocok buat yang bosan casing polos.\nCek link ya.";
  const tagline = "#fyp #viral #casinghp #casingiphone #racunshopee #shopeefinds #checkoutdulu";
  const out = RMAi.ensureHashtags(body + "\n\n" + tagline, product);
  assertBoth(out, "hashtag lengkap tanpa kampanye");
  // tag kampanye harus nempel di BARIS hashtag, bukan bikin baris baru di tengah
  const lines = out.trim().split("\n");
  assert(has(lines[lines.length - 1], TAGS[0]) && has(lines[lines.length - 1], TAGS[1]),
    "tag kampanye tidak menempel di baris hashtag:\n" + out);
  assert(/#fyp/.test(out) && /#racunshopee/.test(out), "hashtag asli model hilang");
  assert(/Motifnya lucu/.test(out), "isi caption berubah");
}

// --- 4. model SUDAH menulisnya — jangan dobel -------------------------------
{
  const out = RMAi.ensureHashtags(
    "Casing polkadot, murah tapi gak murahan.\nCek link.\n\n" +
    "#fyp #viral #casinghp #racunshopee #shopeefinds " + TAGS.join(" "), product);
  assertBoth(out, "sudah ada dari model");
}

// --- 5. beda huruf besar-kecil dianggap sudah ada (jangan dobel) ------------
{
  const out = RMAi.ensureHashtags(
    "Casing bening.\nCek link.\n\n#fyp #viral #casinghp #racunshopee #shopeefinds " +
    "#1010brandsfestival #1010shopeemall", product);
  for (const tag of TAGS) {
    assert.strictEqual((out.match(new RegExp(tag, "gi")) || []).length, 1,
      `${tag} terduplikasi karena beda kapitalisasi:\n${out}`);
  }
}

// --- 6. output multi-variasi: dipotong ke caption pertama, tag tetap masuk --
{
  const out = RMAi.ensureHashtags(
    "Berikut 2 variasi caption:\n" +
    "--- VARIASI 1 ---\nCasing polkadot aesthetic.\n\n#fyp #viral #casinghp #racunshopee #shopeefinds\n\n" +
    "--- VARIASI 2 ---\nCasing lucu banget.\n\n#fyp #viral #casinghp #racunshopee #shopeefinds\n",
    product);
  assertBoth(out, "multi-variasi");
  assert(!/VARIASI/.test(out), "label variasi masih tersisa:\n" + out);
  assert(!/Casing lucu banget/.test(out), "variasi kedua tidak terpotong:\n" + out);
}

// --- 7. input kosong / aneh tidak melempar error ----------------------------
for (const weird of ["", "   ", null, undefined]) {
  const out = RMAi.ensureHashtags(weird, product);
  assertBoth(out, "input kosong (" + String(weird) + ")");
}

console.log("OK   hashtag kampanye 10.10 dijamin ada di setiap caption (7 skenario)");
console.log("     prompt bawaan + safety net ensureHashtags, tanpa duplikasi");
