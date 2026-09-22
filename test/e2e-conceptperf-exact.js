/* e2e-conceptperf-exact.js — concept learning must use exact experiment tags. */
"use strict";
const fs = require("fs"), vm = require("vm"), assert = require("assert");
const mem = {
  rm_concept_log: JSON.stringify([
    { tag: "polkadotIphone", concept: "before_after", day: "legacy", ts: 1 }
  ])
};
const localStorage = {
  getItem: (k) => mem[k] || null,
  setItem: (k, v) => { mem[k] = String(v); }
};
const window = { localStorage };
const ctx = vm.createContext({ window, localStorage, console, Date });
vm.runInContext(fs.readFileSync(__dirname + "/../src/conceptperf.js", "utf8"), ctx);
const C = window.RMConceptPerf;

(async () => {
  let wr = await C.winRates({ tags: { polkadotIphone: { epc: 500, roas: 4 } } });
  assert.strictEqual(wr.concepts.length, 0, "legacy broad-tag attribution must be ignored");
  assert(/broad-tag lama diabaikan/.test(wr.note));

  await C.log("polkadotyjps26092101", "problem_solve", "polkadotyjps26092101");
  await C.log("polkadotyjps26092101", "problem_solve", "polkadotyjps26092101");
  const rows = await C.all();
  assert.strictEqual(rows.length, 2, "one legacy + one exact row; duplicate exact ignored");

  wr = await C.winRates({ tags: {
    polkadotyjps26092101: { epc: 220, roas: 1.8, clicks: 100, orders: 6 }
  }});
  assert.strictEqual(wr.concepts.length, 1);
  assert.strictEqual(wr.concepts[0].concept, "problem_solve");
  assert.strictEqual(wr.concepts[0].avgRoas, 1.8);
  console.log("CONCEPT ATTRIBUTION EXACT LULUS");
})().catch((e) => { console.error(e); process.exit(1); });
