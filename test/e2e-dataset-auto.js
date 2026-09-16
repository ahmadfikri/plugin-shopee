/* e2e-dataset-auto.js — kunci AUTO-CAPTURE data training (Fikri, 2026-09-15:
 * "biarkan data collector berjalan tanpa otomatis pencet save").
 *
 * Yang paling penting diuji: MERGE. Halaman listing memberi baris TIPIS (tanpa
 * rating/review/stok), halaman detail memberi baris KAYA. Kalau bulk scan
 * menimpa data detail dengan null, dataset training jadi rusak — dan itu baru
 * ketahuan berbulan-bulan kemudian saat model dilatih. Jadi dikunci di sini.
 */
"use strict";
const fs = require("fs"), vm = require("vm");

const store = {};
const chromeShim = {
  storage: { local: {
    get: (keys, cb) => cb(Object.fromEntries(
      (Array.isArray(keys) ? keys : [keys]).map((k) => [k, store[k]]))),
    set: (obj, cb) => { Object.assign(store, obj); cb && cb(); }
  } }
};
const ctx = { console, chrome: chromeShim, location: { href: "https://shopee.co.id/p" } };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + "/../src/dataset.js", "utf8"), ctx);
const RMDataset = ctx.window.RMDataset;

const cfg = { commissionPct: 10 };
let ok = true;
const chk = (n, c, d) => { console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); if (!c) ok = false; };

(async () => {
  // ---- 1. auto-capture dari halaman DETAIL (kaya) ----
  const richDetail = {
    name: "Soft Case Samsung A17 motif kupu", shopid: "111", itemid: "999",
    rating: 4.8, totalReviews: 23760, starBreakdown: { 5: 20900, 4: 2000, 3: 500, 2: 200, 1: 160 },
    historicalSold: 10000, likedCount: 6900, inStock: true
  };
  const prodDetail = { id: "111.999", name: richDetail.name, price: 25000, href: "u" };
  let r = await RMDataset.capture(richDetail, prodDetail, cfg, { source: "detail", auto: true });
  chk("detail tersimpan otomatis", r.total === 1 && !r.updated);
  let rows = await RMDataset.all();
  const rich = rows[0];
  chk("baris detail punya rating", rich.rating === 4.8, `rating=${rich.rating}`);
  chk("baris detail punya review_count", rich.review_count === 23760);
  chk("baris detail punya pct_4_5_star", rich.pct_4_5_star > 0.9,
      `pct=${(rich.pct_4_5_star || 0).toFixed(3)}`);
  chk("ditandai source=detail & auto", rich.source === "detail" && rich.auto === true);
  chk("capture_count = 1", rich.capture_count === 1);

  // ---- 2. BULK listing menyertakan produk yang SAMA (tipis) ----
  const listing = [
    { id: "111.999", name: richDetail.name, price: 25000, commissionPct: 11.5,
      href: "u", hasVideo: true },                       // sama dgn detail di atas
    { id: "222.888", name: "Rak dapur susun 4 tingkat", price: 55000,
      commissionPct: 8, href: "u2" },                    // produk baru
    { id: "333.777", name: "Tumbler stainless 500ml", price: 60000,
      commissionPct: 12, href: "u3" }
  ];
  const m = await RMDataset.captureMany(listing, cfg);
  console.log(`  captureMany: +${m.added} baru, ${m.updated} diperbarui, total ${m.total}`);
  chk("2 produk baru ditambahkan", m.added === 2, `added=${m.added}`);
  chk("1 produk diperbarui (bukan duplikat)", m.updated === 1, `updated=${m.updated}`);
  chk("total 3 baris (tanpa duplikat)", m.total === 3);

  // ---- 3. INTI: data kaya TIDAK boleh ditimpa null dari listing ----
  rows = await RMDataset.all();
  const after = rows.find((x) => x.itemid === "999");
  chk("rating detail TETAP ada setelah bulk scan", after.rating === 4.8,
      `rating=${after.rating}`);
  chk("review_count TETAP ada", after.review_count === 23760, `rv=${after.review_count}`);
  chk("historical_sold TETAP ada", after.historical_sold === 10000);
  chk("liked_count TETAP ada", after.liked_count === 6900);
  chk("source tidak turun ke listing", after.source === "detail", `source=${after.source}`);
  chk("capture_count naik jadi 2", after.capture_count === 2, `n=${after.capture_count}`);
  // listing DID contribute the real commission from the card
  chk("komisi dari kartu listing terpakai", after.commission_pct === 11.5,
      `comm=${after.commission_pct}`);

  // ---- 4. baris listing murni tetap tipis tapi berguna ----
  const thin = rows.find((x) => x.itemid === "888");
  chk("baris listing punya harga", thin.price === 55000);
  chk("baris listing punya komisi", thin.commission_pct === 8);
  chk("baris listing punya price_bucket", thin.price_bucket === "30-70k",
      `bucket=${thin.price_bucket}`);
  chk("baris listing ditandai source=listing", thin.source === "listing");
  chk("baris listing rating null (belum buka detail)", thin.rating === null);

  // ---- 5. buka detail SETELAH listing -> baris naik jadi kaya ----
  await RMDataset.capture({
    name: "Rak dapur susun 4 tingkat", shopid: "222", itemid: "888",
    rating: 4.9, totalReviews: 800, historicalSold: 2000, inStock: true
  }, { id: "222.888", name: "Rak dapur susun 4 tingkat", price: 55000, href: "u2" },
     cfg, { source: "detail", auto: true });
  rows = await RMDataset.all();
  const upgraded = rows.find((x) => x.itemid === "888");
  chk("listing -> detail: rating terisi", upgraded.rating === 4.9);
  chk("listing -> detail: source naik jadi detail", upgraded.source === "detail");
  chk("listing -> detail: komisi lama tidak hilang", upgraded.commission_pct === 8);
  chk("total tetap 3 baris", rows.length === 3, `n=${rows.length}`);

  // ---- 6. CSV memuat kolom sumber ----
  const csv = RMDataset.toCsv(rows);
  chk("CSV punya kolom source", csv.split("\n")[0].includes("source"));

  console.log(ok ? "\nDATASET AUTO OK — data kaya aman dari timpa listing"
                 : "\nADA YANG GAGAL");
  process.exit(ok ? 0 : 1);
})();
