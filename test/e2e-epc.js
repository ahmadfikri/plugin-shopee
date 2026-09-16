/* e2e-epc.js — verify the Empirical Bayes EPC estimator on real snapshot numbers.
 *
 * Ground truth shape (from performance-snapshot.json + 13 Sep ingest):
 *   global ~ EPC Rp 118.8
 *   KupuA17: 343 clicks, EPC ~Rp 5   (many clicks, tiny commission -> stays low)
 *   PolkadotMag: 15 clicks, EPC ~Rp 1978 (few clicks, one big order -> MUST shrink down)
 *   alatPel: 124 clicks, 0 orders (zero-converter -> capped)
 */
"use strict";
const fs = require("fs"), vm = require("vm");

const src = fs.readFileSync(__dirname + "/../src/epc.js", "utf8");
const ctx = { window: {}, console };
vm.createContext(ctx);
vm.runInContext(src, ctx);
const RMEpc = ctx.window.RMEpc;

const snapshot = {
  global: { clicks: 6951, orders: 282, commission: 825980, epc: 118.8 },
  tags: {
    KupuA17:        { clicks: 343, orders: 6,  commission: 1836,  epc: 5.35 },
    polkadotIphone: { clicks: 440, orders: 15, commission: 33741, epc: 76.7 },
    metal:          { clicks: 267, orders: 11, commission: 41026, epc: 153.7 },
    PolkadotMag:    { clicks: 15,  orders: 4,  commission: 29665, epc: 1977.7 },
    alatPel:        { clicks: 124, orders: 0,  commission: 0,     epc: 0 },
    shellaSaukia:   { clicks: 61,  orders: 0,  commission: 0,     epc: 0 }
  }
};

let ok = true;
function chk(name, cond, detail) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
  if (!cond) ok = false;
}

const model = RMEpc.build(snapshot);
console.log(`K (median clicks, shrinkage strength) = ${model.K}`);
console.log(`global EPC = Rp ${model.globalEpc.toFixed(1)}\n`);

const breakEven = 130;

const pm = RMEpc.predict(model, { tag: "PolkadotMag", breakEvenCpc: breakEven });
console.log(`PolkadotMag raw 1978 -> Rp ${pm.epc.toFixed(0)} [${pm.epc_low.toFixed(0)}-${pm.epc_high.toFixed(0)}] conf=${pm.confidence}`);
chk("PolkadotMag shrunk far below raw 1978", pm.epc < 900);
chk("PolkadotMag still above global", pm.epc > model.globalEpc);

const ku = RMEpc.predict(model, { tag: "KupuA17", breakEvenCpc: breakEven });
console.log(`KupuA17 raw 5 -> Rp ${ku.epc.toFixed(0)} conf=${ku.confidence} P(profit)=${(ku.pProfit*100).toFixed(0)}%`);
chk("KupuA17 stays low", ku.epc < 60);
chk("KupuA17 P(profit) low", ku.pProfit < 0.2);

const me = RMEpc.predict(model, { tag: "metal", breakEvenCpc: breakEven });
console.log(`metal raw 154 -> Rp ${me.epc.toFixed(0)} P(profit)=${(me.pProfit*100).toFixed(0)}%`);
chk("metal near its own EPC", me.epc > 115 && me.epc < 160);

const ap = RMEpc.predict(model, { tag: "alatPel", breakEvenCpc: breakEven });
const apS = RMEpc.score(ap);
console.log(`alatPel zeroConverter=${ap.zeroConverter} score=${apS.score} "${apS.action}"`);
chk("alatPel flagged zero-converter", ap.zeroConverter === true);
chk("alatPel score capped <=15", apS.score <= 15);

const nw = RMEpc.predict(model, { breakEvenCpc: breakEven });
console.log(`NEW product Rp ${nw.epc.toFixed(0)} basis=${nw.basis} conf=${nw.confidence}`);
chk("new product uses global prior", nw.basis === "global");
chk("new product widest uncertainty", nw.confidence === "sangat rendah");

chk("metal scores >= KupuA17", RMEpc.score(me).score >= RMEpc.score(ku).score,
    `metal=${RMEpc.score(me).score} kupu=${RMEpc.score(ku).score}`);

console.log(ok ? "\nEPC ESTIMATOR OK" : "\nADA YANG GAGAL");
process.exit(ok ? 0 : 1);
