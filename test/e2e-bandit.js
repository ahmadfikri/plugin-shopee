/* e2e-bandit.js — v0.9.26 Thompson-sampling test plan.
 *   1. properties on synthetic posteriors (winner always, loser never,
 *      uncertain beats a narrow mediocre one, P(dipilih) sums to k)
 *   2. deterministic for the same input; zero-converters / missing ROAS skipped
 *   3. ties reported when identical posteriors compete
 *   4. real snapshot: products built through RMEpc.predict + roasPrior
 *   5. the panel block renders without NaN/undefined, and fast enough
 */
"use strict";
const fs = require("fs"), vm = require("vm"), path = require("path");

const ctx = { window: {}, console };
vm.createContext(ctx);
for (const f of ["epc.js", "niche.js", "bandit.js", "charts.js", "panel.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", f), "utf8"), ctx);
}
const { RMEpc, RMNiche, RMBandit, RMPanel } = ctx.window;
const snap = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "test", "fixtures", "performance-snapshot-2026-10-21.json"), "utf8"));

let ok = true;
function chk(name, cond, detail) {
  console.log(`  ${cond ? "OK  " : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) ok = false;
}
const it = (id, roas, roasSd, extra) => Object.assign({ id, name: id, roas, roasSd }, extra || {});

// 1) properties
const pool = [it("winner", 3.0, 0.1), it("loser", 0.3, 0.05), it("uncertain", 1.2, 1.0),
              it("mediocre", 1.1, 0.05), it("zero", 5, 0.1, { epcZero: true }), it("old", null, null)];
const r = RMBandit.plan(pool, { k: 2, draws: 4000 });
const byId = Object.fromEntries(r.rows.map((x) => [x.item.id, x]));
chk("k = 2, kandidat = 4 (zero-converter & tanpa ROAS dilewati)", r.k === 2 && r.eligible === 4 && r.skipped === 2,
    `k ${r.k}, eligible ${r.eligible}, skipped ${r.skipped}`);
chk("winner selalu dipilih", byId.winner.pPick > 0.99, String(byId.winner.pPick));
chk("loser hampir tak pernah", byId.loser.pPick < 0.02, String(byId.loser.pPick));
chk("produk tak pasti > produk pas-pasan yang sudah pasti", byId.uncertain.pPick > byId.mediocre.pPick,
    `${byId.uncertain.pPick.toFixed(3)} vs ${byId.mediocre.pPick.toFixed(3)}`);
const sum = r.rows.reduce((a, x) => a + x.pPick, 0);
chk("jumlah P(dipilih) = k", Math.abs(sum - 2) < 1e-9, sum.toFixed(6));
chk("pBest dijumlah = 1", Math.abs(r.rows.reduce((a, x) => a + x.pBest, 0) - 1) < 1e-9);
chk("picks = winner + uncertain", r.picks.map((x) => x.item.id).sort().join() === "uncertain,winner",
    r.picks.map((x) => x.item.id).join());
chk("P(≥1x) masuk akal", byId.winner.pAbove1 > 0.99 && byId.loser.pAbove1 < 0.01 && byId.mediocre.pAbove1 > 0.9);

// 2) determinism
const r2 = RMBandit.plan(pool.slice().reverse(), { k: 2, draws: 4000 });
chk("hasil sama walau urutan input beda (seed dari id)",
    r2.rows.every((x) => Math.abs(x.pPick - byId[x.item.id].pPick) < 1e-12));
chk("k > kandidat dipangkas", RMBandit.plan([it("a", 1, 0.2)], { k: 3 }).k === 1);
chk("input kosong aman", RMBandit.plan([], {}).picks.length === 0 && RMBandit.plan(null).k === 0);
chk("sd 0 tetap jalan", RMBandit.plan([it("a", 2, 0), it("b", 1, 0)], { k: 1 }).picks[0].item.id === "a");

// 3) ties
const tie = RMBandit.plan([it("n1", 1.3, 0.8), it("n2", 1.3, 0.8), it("n3", 1.3, 0.8)], { k: 1 });
chk("3 posterior identik, k=1 → ties dilaporkan", tie.ties === 1, `ties ${tie.ties}`);
chk("3 posterior identik → P(dipilih) ~1/3 masing-masing", tie.rows.every((x) => Math.abs(x.pPick - 1 / 3) < 0.05),
    tie.rows.map((x) => x.pPick.toFixed(2)).join("/"));

// 4) real snapshot
const model = RMEpc.build(snap);
function product(id, name, tag) {
  const niche = RMNiche.classify({ name }).niche;
  const pred = RMEpc.predict(model, { tag: tag || null, niche, breakEvenCpc: 100 });
  const ec = RMEpc.roasPrior(pred, snap, {});
  return { id, name, niche, epcTag: tag || null, epcZero: pred.zeroConverter,
           roas: ec.roas, roasSd: ec.roasSd, href: "https://shopee.co.id/x-i.1." + id };
}
const real = [
  product("1", "Casing iPhone 15 Polkadot", "polkadotIphone"),
  product("2", "Kitchen counter organizer", "kitchenCounter"),
  product("3", "Redchef tumbler 1L", "redchefTumbler"),
  product("4", "Casing Samsung A55 motif bunga"),
  product("5", "Rak bumbu dapur 3 susun"),
  product("6", "Legging olahraga wanita"),
  product("7", "Kaos kaki anak lucu")
];
chk("semua produk nyata punya ROAS & sd terhingga", real.every((x) => Number.isFinite(x.roas) && Number.isFinite(x.roasSd)),
    real.map((x) => `${x.id}:${x.roas && x.roas.toFixed(2)}±${x.roasSd && x.roasSd.toFixed(2)}`).join(" "));
const rp = RMBandit.plan(real, { k: 3 });
console.log("    rencana:", rp.rows.map((x) => `${x.item.name.slice(0, 22)}(${x.item.niche}) ROAS ${x.roas.toFixed(2)} pilih ${(x.pPick * 100).toFixed(0)}%`).join(" | "));
const pid = rp.picks.map((x) => x.item.id);
chk("polkadotIphone terpilih", pid.includes("1"));
chk("produk niche 'lainnya' tidak terpilih", !pid.includes("6") && !pid.includes("7"));
chk("redchefTumbler tidak terpilih", !pid.includes("3"));

// 5) panel block
const html = RMPanel.testPlanBlock(real);
chk("blok rencana uji tampil (kandidat layak)", /Uji 3 produk ini dulu/.test(html) && !/layak diuji/.test(html));
const weakHtml = RMPanel.testPlanBlock(real.filter((x) => x.niche === "lainnya").concat([real[2]]));
chk("semua kandidat lemah → peringatan, bukan rekomendasi", /Belum ada kandidat yang layak diuji/.test(weakHtml) && !/Uji 3 produk/.test(weakHtml));
chk("blok tanpa NaN/undefined/null", !/NaN|undefined|null/.test(html.replace(/rel="noopener"/g, "")));
chk("nama produk di-escape", !/<script>/.test(RMPanel.testPlanBlock([
  Object.assign({}, real[0], { name: "<script>x</script>" }), real[1]])));
chk("tanpa prediksi → petunjuk impor/scan ulang", /scan ulang/.test(RMPanel.testPlanBlock([{ id: "a", name: "a" }])));
chk("item kosong → tidak render apa-apa", RMPanel.testPlanBlock([]) === "");

const big = Array.from({ length: 500 }, (_, i) => it("p" + i, 0.5 + (i % 37) / 20, 0.2 + (i % 11) / 10));
const t0 = Date.now();
const rb = RMBandit.plan(big, { k: 3 });
const ms = Date.now() - t0;
chk("500 produk (dipangkas 100) < 400ms", ms < 400 && rb.eligible === 100, `${ms}ms, eligible ${rb.eligible}`);
const t1 = Date.now(); RMBandit.plan(big, { k: 3 });
chk("render ulang input sama = memo (<5ms)", Date.now() - t1 < 5);

console.log(ok ? "\nBANDIT LULUS" : "\nBANDIT GAGAL");
process.exit(ok ? 0 : 1);
