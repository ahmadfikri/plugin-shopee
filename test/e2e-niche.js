/* e2e-niche.js — v0.9.26 niche classifier + hierarchical (niche) prior,
 * checked against the REAL snapshot (export/performance-snapshot.json).
 *   1. JS classifier == Python classifier on every keyword-classified tag
 *   2. breadcrumb L1 beats the name; unknown L1 strings are ignored
 *   3. new product -> basis 'niche', niche EPC/CPC/arrival, niche win rate
 *   4. a family that never paid back (lainnya) is HATI-HATI, not UJI KECIL
 *   5. breadcrumb scraper (JSON-LD and "-cat." links) on a fake DOM
 */
"use strict";
const fs = require("fs"), vm = require("vm"), path = require("path");

const ctx = { window: {}, console };
vm.createContext(ctx);
for (const f of ["epc.js", "niche.js", "productpage.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", f), "utf8"), ctx);
}
const { RMEpc, RMNiche, RMProductPage } = ctx.window;
const snap = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "export", "performance-snapshot.json"), "utf8"));
const now = new Date(Date.parse(snap.generatedAt) + 3600e3);

let ok = true;
function chk(name, cond, detail) {
  console.log(`  ${cond ? "OK  " : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) ok = false;
}

// 1) snapshot shape + JS/Python classifier parity
chk("snapshot punya blok niches (hp, rumah, lainnya)",
    !!(snap.niches && snap.niches.hp && snap.niches.rumah && snap.niches.lainnya));
let mism = [];
let nk = 0;
for (const [tag, t] of Object.entries(snap.tags)) {
  if (t.nicheSource !== "keyword") continue;
  nk++;
  const js = RMNiche.fromName(tag);
  if (js !== t.niche) mism.push(`${tag}: py=${t.niche} js=${js}`);
}
chk(`klasifikasi JS == Python di ${nk} tag (sumber keyword)`, nk > 50 && mism.length === 0, mism.slice(0, 5).join("; "));
const noKw = Object.entries(snap.tags).filter(([tag, t]) => t.nicheSource !== "keyword");
chk("tag tanpa keyword juga tanpa keyword di JS", noKw.every(([tag]) => RMNiche.fromName(tag) === null));

// 2) classify precedence
const c = (name, l1) => RMNiche.classify({ name, categoryL1: l1 });
chk("kategori HP menang", c("Botol minum lucu", "Handphone & Aksesoris").niche === "hp");
chk("kategori Perlengkapan Rumah → rumah", c("Rak piring", "Perlengkapan Rumah").niche === "rumah");
chk("kategori dikenal non-hp/rumah → lainnya walau ada kata 'case'",
    c("Pencil case lucu", "Buku & Alat Tulis").niche === "lainnya");
chk("L1 tak dikenal diabaikan → pakai nama", c("Casing iPhone 15 polkadot", "Diskon Kilat").niche === "hp" &&
    c("Casing iPhone 15 polkadot", "Diskon Kilat").source === "nama");
chk("spasi ganda di L1 tetap dikenali", c("x", "Handphone  &  Aksesoris").niche === "hp");
chk("nama tanpa keyword → lainnya/default", c("Legging olahraga wanita").niche === "lainnya" &&
    c("Legging olahraga wanita").source === "default");
chk("token pendek: 'pel' kena 'Alat Pel', tidak kena 'polkadotLagi'?",
    RMNiche.fromName("Alat Pel Lantai") === "rumah" && RMNiche.fromName("pelangi") === null);

// 3) niche prior for a new product
const model = RMEpc.build(snap);
chk("model punya prior niche", model.niches.hp && model.niches.rumah && model.niches.lainnya);
for (const k of ["hp", "rumah", "lainnya"]) {
  const nn = model.niches[k];
  chk(`niche ${k}: EPC≈snapshot, tau>0, win 0..1`,
      Math.abs(nn.epc - snap.niches[k].epc) / snap.niches[k].epc < 0.02 && nn.tau > 0 &&
      nn.winRate > 0 && nn.winRate < 1 && nn.winLow <= nn.winRate && nn.winRate <= nn.winHigh,
      `epc ${nn.epc.toFixed(1)} vs ${snap.niches[k].epc}, tau ${nn.tau.toFixed(1)}, win ${(nn.winRate * 100).toFixed(0)}% (${nn.paidBack}/${nn.tested})`);
}
chk("win rate hp > rumah > lainnya (urutan data nyata)",
    model.niches.hp.winRate > model.niches.rumah.winRate && model.niches.rumah.winRate > model.niches.lainnya.winRate);

const decideNew = (niche) => RMProductPage.decide(
  RMEpc.predict(model, { tag: null, niche, breakEvenCpc: 100 }), snap, null, { breakEvenCPC: 100 }, now);
const nh = decideNew("hp");
chk("produk baru hp: basis niche + UJI KECIL", nh.basis === "niche" && nh.action === "UJI KECIL", `${nh.basis} ${nh.action}`);
chk("produk baru hp: CPC & arrival dari niche", nh.cpcSrc === "CPC rata-rata niche" && nh.arrivalSrc === "niche",
    `${nh.cpcSrc} / ${nh.arrivalSrc}`);
chk("produk baru hp: ROAS ≈ ROAS niche", Math.abs(nh.roas - snap.niches.hp.roas) / snap.niches.hp.roas < 0.15,
    `${nh.roas.toFixed(2)} vs ${snap.niches.hp.roas}`);
chk("produk baru hp: alasan menyebut peluang niche", nh.reasons.some((r) => /Peluang balik modal produk baru di niche/.test(r)));
const nl = decideNew("lainnya");
chk("produk baru lainnya (0 balik modal): HATI-HATI", nl.action === "HATI-HATI", `${nl.action} — ${nl.reasons.join(" ")}`);
const ng = RMProductPage.decide(RMEpc.predict(model, { tag: null, breakEvenCpc: 100 }), snap, null, { breakEvenCPC: 100 }, now);
chk("tanpa niche tetap basis global (kompatibel)", ng.basis === "global" && ng.action === "UJI KECIL");
for (const d of [nh, nl]) {
  chk(`angka ${d.niche} terhingga`, [d.roas, d.roasLow, d.roasHigh, d.value, d.pProfit].every(Number.isFinite));
}

// tag shrinkage now pulls toward the niche, not global
const thin = Object.entries(snap.tags).find(([, t]) => t.niche === "lainnya" && t.clicks >= 5 && t.clicks <= 40 && t.epc != null);
if (thin) {
  const [tg, t] = thin;
  const K = model.K;
  const exp = (t.clicks * t.epc + K * model.niches.lainnya.epc) / (t.clicks + K);
  chk(`tag tipis '${tg}' ditarik ke EPC niche lainnya`, Math.abs(model.tags[tg].epc - exp) < 0.01,
      `${model.tags[tg].epc.toFixed(1)} vs ${exp.toFixed(1)}`);
}
const pi = RMProductPage.decide(RMEpc.predict(model, { tag: "polkadotIphone", niche: "hp", breakEvenCpc: 100 }),
  snap, "polkadotIphone", { breakEvenCPC: 100 }, now);
chk("polkadotIphone tetap basis tag + IKLANKAN/LAYAK COBA", pi.basis === "tag" && /IKLANKAN|LAYAK COBA/.test(pi.action),
    `${pi.action} ROAS ${pi.roas.toFixed(2)}`);

// 5) breadcrumb scraper on a fake DOM
const dsCtx = { window: {}, console, location: { pathname: "/product/1/2" } };
function fakeDoc(scripts, anchors) {
  return {
    querySelectorAll(sel) {
      if (/ld\+json/.test(sel)) return scripts.map((t) => ({ textContent: t }));
      if (/-cat\./.test(sel)) return anchors.map((t) => ({ textContent: t }));
      return [];
    },
    querySelector() { return null; }, body: { textContent: "" }
  };
}
vm.createContext(dsCtx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", "detailscrape.js"), "utf8"), dsCtx);
const DS = dsCtx.window.RMDetailScrape;
dsCtx.document = fakeDoc([JSON.stringify({ "@type": "BreadcrumbList", itemListElement: [
  { position: 2, name: "Handphone & Aksesoris" }, { position: 1, name: "Shopee" },
  { position: 3, name: "Casing & Covers" }] })], []);
chk("breadcrumb dari JSON-LD (urut posisi, 'Shopee' dibuang)",
    JSON.stringify(DS.categoryPath()) === JSON.stringify(["Handphone & Aksesoris", "Casing & Covers"]), JSON.stringify(DS.categoryPath()));
dsCtx.document = fakeDoc(["{rusak"], ["Shopee", "Perlengkapan Rumah", "Perlengkapan Dapur", "Perlengkapan Rumah"]);
chk("breadcrumb dari link -cat. (JSON rusak diabaikan, tanpa duplikat)",
    JSON.stringify(DS.categoryPath()) === JSON.stringify(["Perlengkapan Rumah", "Perlengkapan Dapur"]), JSON.stringify(DS.categoryPath()));
dsCtx.document = fakeDoc([], []);
chk("tanpa breadcrumb → []", DS.categoryPath().length === 0);

console.log(ok ? "\nNICHE LULUS" : "\nNICHE GAGAL");
process.exit(ok ? 0 : 1);
