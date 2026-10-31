/* e2e-productpage.js — decision math of the v0.9.25 product-page panel,
 * checked against the REAL performance snapshot (export/performance-snapshot.json).
 *
 * The core claim: value per Meta click = EPC x arrival, and value / Meta CPC
 * reproduces each tag's measured ROAS. If that stops holding, the panel's
 * headline ROAS is wrong and this test fails.
 */
"use strict";
const fs = require("fs"), vm = require("vm"), path = require("path");

const ctx = { window: {}, console };
vm.createContext(ctx);
for (const f of ["epc.js", "productpage.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", f), "utf8"), ctx);
}
const { RMEpc, RMProductPage } = ctx.window;
const snap = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "test", "fixtures", "performance-snapshot-2026-10-21.json"), "utf8"));
const model = RMEpc.build(snap);
const now = new Date(Date.parse(snap.generatedAt) + 3600e3);

let ok = true;
function chk(name, cond, detail) {
  console.log(`  ${cond ? "OK  " : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) ok = false;
}
function decideTag(tag, at) {
  const pred = RMEpc.predict(model, { tag, breakEvenCpc: 100 });
  return RMProductPage.decide(pred, snap, tag, { breakEvenCPC: 100 }, at || now);
}

// 1) Snapshot carries the fields the panel needs
chk("snapshot punya metaCpc + arrival global", snap.global.metaCpc > 0 && snap.global.arrival > 0,
    `CPC ${snap.global.metaCpc}, arrival ${snap.global.arrival}`);
chk("aviva tidak ada di snapshot", !("aviva" in snap.tags));
chk("'(none)' tidak ada di snapshot", !("(none)" in snap.tags));

// 2) Realized ROAS is reproduced by EPC x arrival / CPC (using realized EPC)
for (const tag of ["polkadotIphone", "kitchenCounter", "redchefTumbler"]) {
  const t = snap.tags[tag];
  if (!t) { chk(`tag ${tag} ada`, false); continue; }
  const implied = t.epc * t.arrival / t.metaCpc;
  chk(`${tag}: EPC×arrival÷CPC ≈ ROAS nyata`, Math.abs(implied - t.roas) / t.roas < 0.12,
      `${implied.toFixed(2)} vs ${t.roas}`);
}

// 3) Verdicts
const win = decideTag("polkadotIphone");
chk("polkadotIphone: basis tag", win.basis === "tag");
chk("polkadotIphone: IKLANKAN/LAYAK COBA", /IKLANKAN|LAYAK COBA/.test(win.action), `${win.action}, ROAS ${win.roas.toFixed(2)}`);
chk("polkadotIphone: rentang ROAS rendah ≤ titik ≤ tinggi", win.roasLow <= win.roas && win.roas <= win.roasHigh);
chk("polkadotIphone: Max CPC > CPC sekarang", win.maxCpc > win.cpc, `${Math.round(win.maxCpc)} vs ${win.cpc}`);
chk("polkadotIphone: P(untung) 0..1", win.pProfit >= 0 && win.pProfit <= 1, String(win.pProfit));

const lose = decideTag("redchefTumbler");
chk("redchefTumbler: LEWATI/HATI-HATI", /LEWATI|HATI-HATI/.test(lose.action), `${lose.action}, ROAS ${lose.roas.toFixed(2)}`);
chk("redchefTumbler: ada risiko tercatat", lose.risks.length > 0, lose.risks.join(" | "));

const zc = Object.entries(snap.tags).find(([, t]) => t.verdict === "zero-converter");
if (zc) {
  const z = decideTag(zc[0]);
  chk(`zero-converter (${zc[0]}) → LEWATI`, z.action === "LEWATI" && z.zeroConverter);
}

const fresh = decideTag(null);
chk("produk baru → UJI KECIL basis global", fresh.action === "UJI KECIL" && fresh.basis === "global");
chk("produk baru: peluang dasar disebut", fresh.base && fresh.reasons.some((r) => /balik modal/.test(r)),
    fresh.base ? `${fresh.base.paidBack}/${fresh.base.tested}` : "");
// v0.9.31: panel ROAS is AFTER tax = gross snapshot ROAS / 1.14 (PPN 11%, WHT 2.5%)
const BE = RMEpc.breakEvenRoas({});
chk("break-even setelah pajak = 1,11/0,975", Math.abs(BE - 1.11 / 0.975) < 1e-9, BE.toFixed(3));
chk("produk baru: ROAS bersih ≈ ROAS snapshot / 1,14", Math.abs(fresh.roas - snap.global.roas / BE) / (snap.global.roas / BE) < 0.12,
    `${fresh.roas.toFixed(2)} vs ${(snap.global.roas / BE).toFixed(2)}`);
chk("Max CPC = nilai klik x 0,975 / 1,11", Math.abs(fresh.maxCpc - fresh.value * 0.975 / 1.11) < 1e-6,
    `${Math.round(fresh.maxCpc)} dari nilai ${Math.round(fresh.value)}`);
const tax0 = RMEpc.roasPrior({ epc: 200, epc_low: 150, epc_high: 250, se: 20 }, { global: { arrival: 1, metaCpc: 100 } },
  { metaVatPct: 0, shopeeWhtPct: 0 });
chk("pajak 0% di Admin Panel = ROAS kotor", Math.abs(tax0.roas - 2) < 1e-9, tax0.roas);

const none = RMProductPage.decide(null, null, null, {}, now);
chk("tanpa snapshot → IMPOR DATA, tidak crash", none.action === "IMPOR DATA" && !none.ready);

const stale = decideTag("polkadotIphone", new Date(Date.parse(snap.generatedAt) + 6 * 86400e3));
chk("snapshot > 3 hari → peringatan", stale.risks.some((r) => /Snapshot sudah/.test(r)));

// 4) A tag with no Meta data still renders numbers (falls back to global CPC/arrival)
const bare = { generatedAt: snap.generatedAt, global: snap.global,
  tags: { onlyShopee: { clicks: 400, orders: 20, commission: 60000, spend: 0, roas: null, trusted: true } } };
const m2 = RMEpc.build(bare);
const b = RMProductPage.decide(RMEpc.predict(m2, { tag: "onlyShopee", breakEvenCpc: 100 }), bare, "onlyShopee", {}, now);
chk("tag tanpa data Meta → pakai CPC & arrival global", b.cpcSrc === "CPC rata-rata kamu" && b.arrivalSrc === "global" && b.roas > 0);

if (!ok) { console.log("PRODUCT PAGE DECISION GAGAL"); process.exit(1); }
console.log("PRODUCT PAGE DECISION OK");
