#!/usr/bin/env node
/**
 * Property regression for the EPC score.
 *
 * The bug this locks out was not a crash — it was a metric that quietly stopped
 * carrying information. score() used to be P(EPC > click cost) x 100. Because
 * `se` is the standard error of the MEAN it shrinks with clicks, so the normal
 * CDF saturated: measured on the real snapshot, 59% of tags scored >=95 or <=5,
 * only 19 distinct values existed across 60 tags, and a tag earning Rp107.5
 * against a Rp100 click cost — a 7% margin — scored a perfect 100. On screen the
 * whole EPC column read 100 or 98, which cannot rank anything.
 *
 * These are PROPERTIES, not fixed numbers, so the model can be tuned without
 * rewriting the test — but it can no longer collapse without failing.
 */
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const ctx = vm.createContext({ console, Math, Object, Number, Array, String, JSON });
vm.runInContext(fs.readFileSync(__dirname + "/../src/epc.js", "utf8"), ctx);
const RMEpc = ctx.RMEpc;

// A synthetic book of tags spanning clear losers to clear winners, with both
// thick and thin evidence. Deterministic: it must not depend on whatever the
// user's latest exported snapshot happens to contain.
const tags = {};
const epcs = [10, 20, 30, 45, 60, 75, 90, 100, 110, 125, 140, 160, 180, 210, 250, 400];
epcs.forEach((e, i) => {
  const clicks = [30, 120, 600, 2500][i % 4];
  tags["tag" + i] = { clicks, orders: Math.max(1, Math.round(clicks * 0.04)),
                      commission: e * clicks, trusted: true };
});
tags.zeroConv = { clicks: 400, orders: 0, commission: 0, trusted: true };
// Same realized earnings per click, wildly different amounts of evidence. This
// isolates the shrinkage property: nothing else about them differs.
tags.thinHigh = { clicks: 30, orders: 2, commission: 200 * 30, trusted: true };
tags.thickHigh = { clicks: 2500, orders: 100, commission: 200 * 2500, trusted: true };
const snapshot = {
  global: { clicks: 21244, orders: 903, commission: 2377349, epc: 111.9 },
  tags
};

const model = RMEpc.build(snapshot);
assert(model, "model gagal dibangun");

const COST = 100;   // cfg.breakEvenCPC — what a click actually costs
const preds = Object.keys(model.tags).map((t) => {
  const p = RMEpc.predict(model, { tag: t, breakEvenCpc: COST });
  return Object.assign({ tag: t }, p, RMEpc.score(p));
});

// --- 1. the score must actually discriminate ---------------------------------
const distinct = new Set(preds.map((p) => p.score));
assert(distinct.size >= Math.ceil(preds.length * 0.6),
  `skor tidak membedakan: hanya ${distinct.size} nilai unik dari ${preds.length} tag`);

const saturated = preds.filter((p) => p.score >= 95 || p.score <= 5).length;
assert(saturated / preds.length < 0.25,
  `skor mentok di ujung untuk ${saturated}/${preds.length} tag — ini bug lama yang kembali`);

// --- 2. more earnings per click must never score lower, evidence being equal --
const thick = preds.filter((p) => p.clicks === 2500 && !p.zeroConverter)
  .sort((a, b) => a.epc - b.epc);
for (let i = 1; i < thick.length; i++) {
  assert(thick[i].score >= thick[i - 1].score,
    `skor tidak monoton terhadap EPC: ${thick[i - 1].tag}(${thick[i - 1].epc.toFixed(0)})=` +
    `${thick[i - 1].score} vs ${thick[i].tag}(${thick[i].epc.toFixed(0)})=${thick[i].score}`);
}

// --- 3. break-even must sit at the middle of the scale -----------------------
const atCost = RMEpc.predict(model, { tag: null, breakEvenCpc: snapshot.global.epc });
const atCostScore = RMEpc.score(atCost).score;
assert(Math.abs(atCostScore - 50) <= 2,
  `EPC yang tepat menutupi biaya klik harus ~50, dapat ${atCostScore}`);

// --- 4. thin evidence must be pulled toward neutral, not shout ---------------
const thin = RMEpc.score(RMEpc.predict(model, { tag: "thinHigh", breakEvenCpc: COST })).score;
const thick2 = RMEpc.score(RMEpc.predict(model, { tag: "thickHigh", breakEvenCpc: COST })).score;
assert(Math.abs(thin - 50) < Math.abs(thick2 - 50),
  `bukti tipis (${thin}) harus lebih dekat ke netral daripada bukti tebal (${thick2}) ` +
  "pada EPC realisasi yang sama");

// an unseen product (no tag at all) must not look confident
const unseen = RMEpc.score(RMEpc.predict(model, { tag: null, breakEvenCpc: COST })).score;
assert(unseen > 20 && unseen < 80,
  `produk tanpa riwayat tidak boleh dapat skor ekstrem, dapat ${unseen}`);

// --- 5. a proven zero-converter stays capped --------------------------------
const zc = preds.find((p) => p.tag === "zeroConv");
assert(zc.zeroConverter, "tag 400 klik 0 order harus ditandai zero-converter");
assert(zc.score <= 15, `zero-converter harus dibatasi <=15, dapat ${zc.score}`);
assert(/SKIP/.test(zc.action), "zero-converter harus beraksi SKIP, dapat " + zc.action);

// --- 6. no click cost configured -> refuse to rank, do not invent -----------
const noCost = RMEpc.score(RMEpc.predict(model, { tag: "tag0", breakEvenCpc: 0 }));
assert.strictEqual(noCost.score, 50,
  "tanpa biaya klik, skor harus netral 50 bukan angka karangan");

console.log("EPC SCORE PROPERTIES LULUS");
console.log("  nilai unik: " + distinct.size + "/" + preds.length +
            ", mentok: " + saturated + " (" + Math.round(100 * saturated / preds.length) + "%)");
console.log("  monoton terhadap EPC: OK");
console.log("  break-even = ~50: " + atCostScore);
console.log("  bukti tipis ditarik ke netral, produk baru = " + unseen + ": OK");
console.log("  zero-converter dibatasi " + zc.score + " + SKIP: OK");
