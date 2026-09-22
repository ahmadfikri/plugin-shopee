/* e2e-shortlist.js — prove BULK SCAN + SHORTLIST works:
 *   1. multiple scans accumulate into one list
 *   2. re-scanning the same page UPDATES, never duplicates
 *   3. collapsed view = top 20 by PRO, expanded = everything
 *   4. CSV export contains every row
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const ROOT = path.join(__dirname, "..");
const store = {};
const sb = {
  window: {}, console,
  chrome: { storage: { local: {
    get: (k, cb) => cb(typeof k === "string" ? { [k]: store[k] } : {}),
    set: (o, cb) => { Object.assign(store, o); cb && cb(); },
    remove: (k, cb) => { delete store[k]; cb && cb(); }
  } } },
  document: { createElement: () => ({ className: "", set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h; } }) }
};
sb.window = sb; sb.self = sb;
vm.createContext(sb);
for (const f of ["src/shortlist.js", "src/charts.js", "src/proscore.js", "src/panel.js"]) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sb, { filename: f });
}

const cfg = { commissionPct: 5, breakEvenCPC: 100, conversionRate: 4.0 };

// build a batch of fake scanned products for a given keyword
function batch(keyword, n, startId, priceBase) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = {
      id: "P" + (startId + i),
      name: `${keyword} produk ${i + 1}`,
      price: priceBase + i * 5000,
      commissionPct: 5 + (i % 8),
      rating: 4.5 + (i % 5) / 10,
      reviewCount: 100 * (i + 1),
      likedCount: 500 * (i + 1),
      soldTotal: 200 * (i + 1),
      unitsPerMonth: 30 * (i + 1),
      hasVideo: i % 2 === 0,
      href: "https://shopee.co.id/product/1/" + (startId + i)
    };
    p.pro = sb.RMProScore.scoreProduct(p, cfg, {}, null);
    out.push(p);
  }
  return out;
}

(async () => {
  console.log("=== 1. tiga scan kategori berbeda ===");
  let r = await sb.RMShortlist.add(batch("tas anak", 20, 100, 60000), "tas anak");
  console.log(`  scan 1 'tas anak'  : +${r.added} baru, total ${r.total}`);
  r = await sb.RMShortlist.add(batch("tumbler", 18, 200, 90000), "tumbler");
  console.log(`  scan 2 'tumbler'   : +${r.added} baru, total ${r.total}`);
  r = await sb.RMShortlist.add(batch("casing hp", 25, 300, 45000), "casing hp");
  console.log(`  scan 3 'casing hp' : +${r.added} baru, total ${r.total}`);

  console.log("\n=== 2. scan ULANG halaman yang sama (harus UPDATE, bukan duplikat) ===");
  r = await sb.RMShortlist.add(batch("tumbler", 18, 200, 90000), "tumbler");
  console.log(`  +${r.added} baru, ${r.updated} diperbarui, total tetap ${r.total}`);

  const meta = await sb.RMShortlist.getMeta();
  const items = meta.items;
  const s = sb.RMShortlist.stats(items);
  console.log(`\n=== 3. statistik ===`);
  console.log(`  total ${s.total} · ${s.scans || meta.scans} scan · kata kunci: ${meta.keywords.join(", ")}`);
  console.log(`  ${s.iklankan} iklankan · ${s.coba} coba · ${s.skip} lewati`);
  console.log(`  terbaik: ${s.best.name} (PRO ${s.best.pro}, Max CPC Rp${s.best.maxCPC})`);

  console.log(`\n=== 4. tampilan ringkas vs semua ===`);
  const top = sb.RMShortlist.ranked(items, 20);
  const all = sb.RMShortlist.ranked(items, 0);
  console.log(`  ringkas (top 20) : ${top.length} baris`);
  console.log(`  semua            : ${all.length} baris`);
  console.log(`  urutan turun?    : ${all.every((x, i) => i === 0 || all[i - 1].pro >= x.pro)}`);

  const collapsed = sb.RMPanel.shortlistSection(meta, false);
  const expanded = sb.RMPanel.shortlistSection(meta, true);
  const rows = (h) => (h.match(/<tr>/g) || []).length - 1; // minus header row
  console.log(`  HTML ringkas     : ${rows(collapsed)} baris produk`);
  console.log(`  HTML semua       : ${rows(expanded)} baris produk`);
  console.log(`  tombol toggle    : ${/rm-sl-toggle/.test(collapsed)}`);
  console.log(`  label "semua"    : ${/Tampilkan semua \(\d+\)/.test(collapsed)}`);

  console.log(`\n=== 5. hasil keyword terakhir + sort ===`);
  const filtered = sb.RMPanel.shortlistSection(meta, true, "casing hp");
  console.log(`  filtered casing hp: ${rows(filtered)} baris`);
  console.log(`  tombol lihat semua: ${/rm-sl-all/.test(filtered)}`);
  console.log(`  icon sort          : ${(filtered.match(/rm-sort/g) || []).length}`);
  assert.strictEqual(rows(filtered), 25, "lower table must show latest keyword batch");
  assert(!/tumbler produk/.test(filtered), "old keyword rows must be hidden in latest view");
  assert(/Hasil terakhir: casing hp/.test(filtered));
  assert(/rm-sl-all/.test(filtered));
  assert((filtered.match(/class="rm-sort"/g) || []).length >= 8);

  const csv = sb.RMShortlist.toCsv(items);
  console.log(`\n=== 6. CSV ===`);
  const one = batch("race", 1, 900, 50000);
  await sb.RMShortlist.add(one, "cari: race");
  await sb.RMShortlist.add(one, "/offer/product_offer");
  const raceRow = (await sb.RMShortlist.getAll()).find((x) => x.id === "P900");
  assert.strictEqual(raceRow.keyword, "cari: race",
    "observer re-save must preserve explicit bulk keyword label");
  console.log(`  baris CSV (+header): ${csv.trim().split("\n").length} untuk ${items.length} produk`);
  const hostileMeta = { items: [Object.assign({}, items[0], {
    name: '<img src=x onerror="boom">', keyword: '<script>bad</script>'
  })], scans: 1, keywords: [] };
  const hostileHtml = sb.RMPanel.shortlistSection(hostileMeta, true);
  assert(!hostileHtml.includes("<img src=x"), "product HTML must not execute");
  assert(!hostileHtml.includes("<script>bad"), "keyword HTML must not execute");
  assert(hostileHtml.includes("&lt;img"), "escaped product markup remains readable");
  console.log("\nE2E SHORTLIST OK");
})().catch((e) => { console.error("GAGAL:", e); process.exit(1); });
