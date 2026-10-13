#!/usr/bin/env node
/**
 * Regression (2026-10-03): NO PRICE in caption or video prompt — enforced on
 * the OUTPUT, not only asked for in the prompt (an LLM can ignore the ban).
 * Also: a custom video template without {{context}} must still receive the
 * product data + price ban, and {{price}} must never leak as a literal.
 */
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

let lastPrompt = "";
let reply = "";
const fetch = async (_url, opts) => {
  lastPrompt = JSON.parse(opts.body).messages.map((m) => m.content).join("\n");
  return { ok: true, json: async () => ({ choices: [{ message: { content: reply } }] }) };
};
const ctx = vm.createContext({ console, Math, Object, Number, Array, String, JSON, RegExp, Promise, fetch });
vm.runInContext(fs.readFileSync(__dirname + "/../src/ai.js", "utf8"), ctx);
const RMAi = ctx.RMAi;

const PRICE_RE = /Rp\s?\d|\d+\s?rb\b|diskon\s*\d+\s?%|\d+\s?%\s*off|#hargamurah|#promo|#diskon|harga murah|murah banget|termurah/i;

// 1. stripPrice scrubs the common forms but keeps normal text.
const dirty = "Case cantik banget! Cuma Rp39.000 aja, harga murah, diskon 50% hari ini.\n" +
  "Tahan banting 100%, 25rb doang.\n#fyp #hargamurah #promo #racunshopee";
const clean = RMAi.stripPrice(dirty);
assert(!PRICE_RE.test(clean), "masih ada harga: " + clean);
assert(/Case cantik banget!/.test(clean), "teks normal ikut terhapus");
assert(/Tahan banting 100%/.test(clean), "persen non-diskon jangan dihapus");
assert(/#fyp/.test(clean) && /#racunshopee/.test(clean), "hashtag normal ikut terhapus");

// 2. caption output path is scrubbed and still carries niche tags + disclaimer.
const product = { name: "Case iPhone 16 Pro Floral Pearl", price: 39000, rating: 4.9 };
const cfg = { ai: { enabled: true, apiKey: "x", baseUrl: "http://stub", model: "m",
  captionPrompt: "", videoPrompt: "" } };
(async () => {
  reply = "POV: nemu case paling cakep, cuma Rp 39rb! Super murah.\n#fyp #viral #shopeefinds #promo #racunshopee #checkoutdulu";
  const cap = await RMAi.generateCaption(cfg, product);
  assert(!PRICE_RE.test(cap) && !/super murah/i.test(cap), "caption masih ada harga: " + cap);
  assert(/#casinghp/.test(cap), "hashtag niche hilang");
  assert(cap.includes(RMAi.CAPTION_DISCLAIMER), "disclaimer hilang");
  assert(!/39\.?000/.test(lastPrompt), "harga bocor ke prompt caption");

  // 3. video prompt output path is scrubbed.
  reply = "Video 9:16 10 detik. Teks di layar: 'Cuma Rp39.000, diskon 40%'. Tangan menggoyang HP.";
  const vid = await RMAi.generateVideoPrompt(cfg, product);
  assert(!PRICE_RE.test(vid), "prompt video masih ada harga: " + vid);
  assert(/Tangan menggoyang HP/.test(vid), "isi prompt video ikut terhapus");
  assert(!/39\.?000/.test(lastPrompt), "harga bocor ke prompt video");

  // 4. custom video template without {{context}} still gets product data + ban,
  //    and {{price}} never leaks as a literal placeholder.
  const custom = { ai: Object.assign({}, cfg.ai, { videoPrompt: "Bikin video untuk {{name}} harga {{price}}" }) };
  reply = "ok";
  await RMAi.generateVideoPrompt(custom, product);
  assert(!/{{price}}/.test(lastPrompt), "placeholder {{price}} bocor");
  assert(/LARANGAN HARGA/.test(lastPrompt), "template custom kehilangan larangan harga");
  assert(/Case iPhone 16 Pro Floral Pearl/.test(lastPrompt), "template custom kehilangan data produk");

  console.log("PRICE GUARD LULUS");
})().catch((e) => { console.error(e); process.exit(1); });
