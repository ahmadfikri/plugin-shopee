/* e2e-feedback.js — prove the FEEDBACK LOOP works end to end:
 *   1. real snapshot loads
 *   2. a product matching a winner tag gets Max CPC from REALIZED EPC
 *   3. a product matching a zero-converter tag is hard-gated to SKIP
 *   4. an unseen product falls back to the account-wide EPC (not the formula)
 *   5. with no snapshot at all, the formula is used and flagged as such
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const snapPath = path.join(ROOT, "export", "performance-snapshot.json");
const snapshot = JSON.parse(fs.readFileSync(snapPath, "utf8"));

// minimal chrome.storage shim
const store = {};
const sb = {
  window: {}, console,
  chrome: { storage: { local: {
    get: (k, cb) => cb(typeof k === "string" ? { [k]: store[k] } : {}),
    set: (o, cb) => { Object.assign(store, o); cb && cb(); },
    remove: (k, cb) => { delete store[k]; cb && cb(); }
  } } }
};
sb.window = sb; sb.self = sb;
vm.createContext(sb);
for (const f of ["src/perf.js", "src/proscore.js"]) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sb, { filename: f });
}

const cfg = { commissionPct: 5, breakEvenCPC: 100, conversionRate: 4.0,
              momentumMaxAgeMonths: 3, momentumMinPerMonth: 100 };

function show(label, product, snap) {
  const calib = snap ? sb.RMPerf.calibrate(product, cfg, snap) : null;
  const pro = sb.RMProScore.scoreProduct(product, cfg, {}, calib);
  console.log(`\n${label}`);
  console.log(`  produk        : ${product.name}`);
  console.log(`  Max CPC       : Rp ${pro.economics.maxProfitableCPC}  (basis: ${pro.economics.basis}` +
              (pro.economics.matchedTag ? `, tag '${pro.economics.matchedTag}'` : "") + ")");
  console.log(`  rumus asumsi  : Rp ${pro.economics.formulaCPC}`);
  console.log(`  PRO / aksi    : ${pro.pro} ${pro.action}`);
  if (pro.gates.length) console.log(`  GATES         : ${pro.gates.join(" | ")}`);
  if (pro.economics.note) console.log(`  catatan       : ${pro.economics.note}`);
}

const base = { price: 120000, commissionPct: 11.5, rating: 4.9, reviewCount: 5000,
               likedCount: 9000, soldTotal: 4000, unitsPerMonth: 300, hasVideo: true };

console.log("=== SNAPSHOT ===");
console.log(`  global: ${snapshot.global.clicks} klik, conversion ${snapshot.global.conversionRate}%, ` +
            `EPC Rp ${snapshot.global.epc}, ROAS ${snapshot.global.roas}`);

show("1) MIRIP WINNER (KupuA17)", Object.assign({}, base,
  { name: "Casing Kupu Kupu A17 Soft Case Motif" }), snapshot);

show("2) MIRIP ZERO-CONVERTER (alatPel)", Object.assign({}, base,
  { name: "Alat Pel Lantai Spin Mop Microfiber" }), snapshot);

show("3) PRODUK BARU (belum pernah dijalankan)", Object.assign({}, base,
  { name: "Rak Bumbu Dapur Stainless 3 Tingkat" }), snapshot);

show("4) TANPA SNAPSHOT (rumus asumsi)", Object.assign({}, base,
  { name: "Casing Kupu Kupu A17 Soft Case Motif" }), null);

const assert = require("assert");
assert(sb.RMPerf.matchTag("Casing Kupu Kupu A17 Soft Case Motif", snapshot),
  "specific multi-token winner should match");
const genericOnly = { tags: { metal: {
  trusted: true, verdict: "zero-converter", clicks: 500, orders: 0, epc: 0, roas: 0
} } };
assert.strictEqual(sb.RMPerf.matchTag("Rak metal stainless dapur", genericOnly), null,
  "generic tag 'metal' must not zero-gate unrelated products");
console.log("\nMATCH SAFETY OK — generic one-word tag ignored");
