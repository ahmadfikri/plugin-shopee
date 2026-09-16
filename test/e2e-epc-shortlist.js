/* e2e-epc-shortlist.js — buktikan data EPC ikut ke hasil BULK SCAN (shortlist).
 *
 * Bug yang dilaporkan Fikri (2026-09-15): "epc data tidak tertampilkan di bulk
 * search". Penyebab: shortlist.add() tidak menyimpan field EPC sama sekali, dan
 * tabel shortlist tidak punya kolomnya.
 *
 * Tes ini memastikan: field tersimpan, kolom terender, ranking pakai EPC score,
 * zero-converter tenggelam, CSV memuat kolom EPC, dan entri lama (tanpa EPC)
 * menampilkan hint "scan ulang" bukan sel kosong.
 */
"use strict";
const fs = require("fs"), vm = require("vm");

// ---- in-memory chrome.storage.local shim ----
const store = {};
const chromeShim = {
  storage: {
    local: {
      get: (keys, cb) => cb(Object.fromEntries(
        (Array.isArray(keys) ? keys : [keys]).map((k) => [k, store[k]]))),
      set: (obj, cb) => { Object.assign(store, obj); cb && cb(); },
      remove: (k, cb) => { delete store[k]; cb && cb(); }
    }
  }
};

// In a browser, `window` IS the global object, so a module that sets
// `global.RMShortlist` also creates a bare `RMShortlist` global. Mirror that here
// by making ctx.window self-referential, otherwise bare references fail in the vm.
const ctx = {
  console, chrome: chromeShim,
  document: { createElement: () => ({ className: "", innerHTML: "" }) }
};
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ["epc.js", "shortlist.js", "charts.js", "panel.js"]) {
  vm.runInContext(fs.readFileSync(__dirname + "/../src/" + f, "utf8"), ctx);
}
const { RMShortlist, RMPanel, RMEpc } = ctx.window;

let ok = true;
const chk = (n, c, d) => { console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); if (!c) ok = false; };

// products as analytics.js would hand them over (pro + epcPred attached)
function prod(id, name, proScore, epcScore, epc, conf, tag, zero) {
  return {
    id, name, price: 45000, href: "https://shopee.co.id/x",
    pro: { pro: proScore, action: "LAYAK COBA",
           economics: { commissionPct: 10, maxProfitableCPC: 120, basis: "tag" },
           gates: [] },
    epcPred: epcScore == null ? null : {
      score: epcScore, action: epcScore >= 65 ? "IKLANKAN" : "HATI-HATI",
      epc, epc_low: Math.round(epc * 0.8), epc_high: Math.round(epc * 1.2),
      confidence: conf, basis: tag ? "tag" : "global",
      matchedTag: tag || null, zeroConverter: !!zero
    }
  };
}

(async () => {
  // --- bulk scan batch 1: with predictions ---
  await RMShortlist.add([
    prod("1.1", "Rak dapur kitchenCounter", 60, 100, 145, "sedang", "kitchenCounter"),
    prod("2.2", "Soft Case KupuA17 motif",   85,   0,  74, "sedang", "KupuA17"),
    prod("3.3", "Produk baru random",        70,  28, 125, "sangat rendah", null),
    prod("4.4", "Alat pel serbaguna",        75,   8,   0, "tinggi", "alatPel", true)
  ], "cari: dapur");

  const meta = await RMShortlist.getMeta();
  const items = meta.items || [];
  chk("4 produk tersimpan", items.length === 4, `total=${items.length}`);

  const kc = items.find((x) => x.id === "1.1");
  chk("field EPC ikut tersimpan",
      kc.epcScore === 100 && kc.epc === 145 && kc.epcConfidence === "sedang" &&
      kc.epcTag === "kitchenCounter",
      `score=${kc.epcScore} epc=${kc.epc} tag=${kc.epcTag}`);

  // --- ranking must use EPC score, not PRO ---
  const r = RMShortlist.ranked(items, 0);
  console.log("  urutan:", r.map((x) => `${x.name.slice(0,20)}(epc${x.epcScore}/pro${x.pro})`).join(" > "));
  chk("peringkat 1 = EPC tertinggi (bukan PRO tertinggi)",
      r[0].id === "1.1", `r[0]=${r[0].name}`);
  chk("zero-converter tenggelam ke dasar",
      r[r.length - 1].id === "4.4", `terakhir=${r[r.length-1].name}`);

  // --- table renders the EPC column ---
  const html = RMPanel.shortlistSection(meta, true);
  chk("tabel shortlist punya kolom EPC", /<th[^>]*>EPC<\/th>/.test(html));
  chk("tabel menampilkan Rp/klik", /Rp[\d.]+\/klik/.test(html));
  chk("skor EPC muncul di baris", html.includes(">100<"));

  // --- CSV includes EPC columns ---
  const csv = RMShortlist.toCsv(items);
  const head = csv.split("\n")[0];
  chk("CSV punya kolom epcScore/epc/epcConfidence",
      head.includes("epcScore") && head.includes("epcConfidence"),
      head.slice(0, 70));

  // --- legacy entry (scanned before snapshot) shows an explicit hint ---
  await RMShortlist.clear();
  await RMShortlist.add([prod("9.9", "Produk lama tanpa prediksi", 66, null)], "lama");
  const meta2 = await RMShortlist.getMeta();
  chk("entri tanpa EPC tersimpan dengan epcScore null",
      meta2.items[0].epcScore === null);
  const html2 = RMPanel.shortlistSection(meta2, true);
  chk("entri lama menampilkan hint 'scan ulang'", html2.includes("scan ulang"));

  console.log(ok ? "\nEPC SHORTLIST OK — data EPC ikut di bulk scan"
                 : "\nADA YANG GAGAL");
  process.exit(ok ? 0 : 1);
})();
