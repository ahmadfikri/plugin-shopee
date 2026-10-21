/* niche.js — coarse product family ("niche") for hierarchical pooling (v0.9.26).
 *
 * Why: the EPC model used to pull every new product toward ONE global average.
 * Fikri's own record says the families behave very differently (snapshot
 * 2026-10-21, tags with >= Rp10rb spend):
 *   hp (casing / aksesoris HP)   8 of 24 paid back, ROAS 1.39
 *   rumah (dapur / rumah)        4 of 22 paid back, ROAS 1.26
 *   lainnya (everything else)    0 of 12 paid back, ROAS 0.31
 * So a new product is now shrunk toward ITS niche, and the niche toward global.
 *
 * Source of the niche, best first:
 *   1. Shopee breadcrumb L1 on the product page ("Handphone & Aksesoris" ...)
 *   2. keywords in the product / tag name
 * The keyword table MUST match NICHE_KEYWORDS in analisis/export_perf_snapshot.py
 * (test/e2e-niche.js checks it against every keyword-classified tag).
 */
(function (global) {
  "use strict";

  const KEYWORDS = {
    hp: ["case", "casing", "iphone", "samsung", "oppo", "vivo", "xiaomi",
      "redmi", "realme", "infinix", "magsafe", "polka", "phone",
      "handphone", "softcase", "selfie", "metal", "bling", "blink", "hp", "a17", "a15", "a05"],
    rumah: ["kitchen", "dapur", "rack", "rak", "food", "container", "fridge",
      "kulkas", "panci", "cooking", "masak", "tumbler", "botol", "gelas",
      "piring", "wadah", "sikat", "pel", "spice", "taplak", "lampu",
      "rice", "cooker", "waffle", "sink", "magnet", "locknlock",
      "compartment", "kotak", "organizer", "cermin", "nyamuk", "kipas",
      "bablov", "keranjang", "sendok", "teflon", "talenan",
      "bumbu", "pengering", "jemuran"]
  };
  const ORDER = ["hp", "rumah"];
  const L1 = { "handphone & aksesoris": "hp", "perlengkapan rumah": "rumah" };
  // Every L1 name seen in Fikri's Shopee commission reports (2026-10-21). A
  // scraped breadcrumb is trusted ONLY if its first level is one of these, so a
  // stray "-cat." link elsewhere on the page can never mislabel a product.
  const KNOWN_L1 = new Set(["aksesoris fashion", "audio", "buku & alat tulis",
    "buku & majalah", "elektronik", "fashion bayi & anak", "fashion muslim",
    "gaming & konsol", "handphone & aksesoris", "hewan peliharaan", "hobi & koleksi",
    "ibu & bayi", "jam tangan", "kamera & drone", "kesehatan", "komputer & aksesoris",
    "koper & tas travel", "makanan & minuman", "mobil", "olahraga & outdoor",
    "pakaian pria", "pakaian wanita", "perawatan & kecantikan", "perlengkapan rumah",
    "sepatu pria", "sepatu wanita", "sepeda motor", "tas pria", "tas wanita",
    "tiket, voucher, & layanan"]);
  const LABEL = { hp: "Casing & aksesoris HP", rumah: "Rumah & dapur", lainnya: "Lainnya" };

  function tokens(name) {
    return String(name || "")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
  }

  // null when no keyword matches (caller decides the default)
  function fromName(name) {
    const toks = tokens(name);
    const compact = toks.join("");
    for (const niche of ORDER) {
      for (const kw of KEYWORDS[niche]) {
        if ((kw.length >= 4 && compact.includes(kw)) || (kw.length < 4 && toks.includes(kw))) return niche;
      }
    }
    return null;
  }

  /* classify({ name, categoryL1 }) -> { niche, source }
   * A recognised breadcrumb L1 wins: an L1 that is not hp/rumah (e.g. "Pakaian
   * Wanita") means "lainnya" even if the name contains "case". An unrecognised
   * L1 string is ignored and the name keywords decide. */
  function classify(p) {
    const l1 = String((p && p.categoryL1) || "").trim().toLowerCase().replace(/\s+/g, " ");
    if (l1 && KNOWN_L1.has(l1)) return { niche: L1[l1] || "lainnya", source: "kategori" };
    const k = fromName(p && p.name);
    if (k) return { niche: k, source: "nama" };
    return { niche: "lainnya", source: "default" };
  }

  global.RMNiche = { classify, fromName, tokens, KEYWORDS, LABEL };
})(typeof window !== "undefined" ? window : this);
