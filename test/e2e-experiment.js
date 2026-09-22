/* e2e-experiment.js — zero-typing campaign/tag identity. */
const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const mem = {};
const localStorage = {
  getItem: (k) => Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null,
  setItem: (k, v) => { mem[k] = String(v); }
};
const window = { localStorage };
const ctx = vm.createContext({ window, localStorage, console, Date, Math, setTimeout });
for (const f of ["concepts.js", "experiment.js", "ledger.js"]) {
  vm.runInContext(fs.readFileSync(__dirname + "/../src/" + f, "utf8"), ctx);
}

(async () => {
  const p = {
    id: "1.2", name: "Case iPhone Polkadot Wanita", href: "https://shopee.co.id/product/1/2",
    suggestedTag: "polkadotIphone", price: 25000, rating: 4.9
  };
  const one = await window.RMExperiment.ensure(p, "problem_solve");
  assert.strictEqual(one.metaCampaignName, one.shopeeTag, "Meta name = Shopee tag");
  assert.strictEqual(one.campaignTag, one.experimentId, "experiment ID is the one identity");
  assert(/^[a-z0-9]{1,20}$/.test(one.campaignTag), "ID safe and <=20 chars");
  assert.strictEqual(one.baseTag, "polkadotIphone");
  assert(one.hypothesis.includes("Problem"), "hypothesis auto-generated from concept");

  const reused = await window.RMExperiment.ensure(p, "problem_solve");
  assert.strictEqual(reused.campaignTag, one.campaignTag, "same open experiment reused");

  await window.RMLedger.add({
    tag: one.campaignTag, experimentId: one.experimentId, baseTag: one.baseTag,
    reasoning: one.hypothesis, concept: one.concept,
    product: { name: p.name, href: p.href, price: p.price, rating: p.rating }
  });
  const secondLog = await window.RMLedger.add({
    tag: one.campaignTag, experimentId: one.experimentId, baseTag: one.baseTag,
    reasoning: one.hypothesis, concept: one.concept, product: { name: p.name }
  });
  assert.strictEqual(secondLog.reused, true, "caption+video do not duplicate ledger row");
  assert.strictEqual((await window.RMLedger.all()).length, 1);

  window.RMExperiment.reset(p);
  const two = await window.RMExperiment.ensure(p, "satisfying");
  assert.notStrictEqual(two.campaignTag, one.campaignTag, "new experiment gets new ID");
  assert.strictEqual(two.concept, "satisfying");

  console.log("EXPERIMENT ID LULUS");
  console.log("  first:", one.campaignTag, "| next:", two.campaignTag);
  console.log("  ledger dedup: 1 row");
})().catch((e) => { console.error(e); process.exit(1); });
