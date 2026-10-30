#!/usr/bin/env node
/* v0.9.30: affiliate ID 11300901968 is the default, also for configs saved
 * earlier with affiliateId "" — but a user-entered ID is never overwritten. */
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const src = fs.readFileSync(__dirname + "/../src/storage.js", "utf8");

function load(stored) {
  const store = stored === undefined ? {} : { rm_config: stored };
  const chrome = { storage: { local: {
    get: (k, cb) => cb({ [k]: store[k] }),
    set: (o, cb) => { Object.assign(store, o); cb && cb(); } } } };
  const ctx = { chrome, console, window: {} };
  ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  const S = ctx.window.RMStore || ctx.RMStore;
  assert.ok(S, "storage module exported");
  return S.getConfig();
}

(async () => {
  assert.strictEqual((await load()).ai.affiliateId, "11300901968", "fresh install");
  assert.strictEqual((await load({ ai: { affiliateId: "" } })).ai.affiliateId, "11300901968", "old config with empty id");
  assert.strictEqual((await load({ ai: { affiliateId: "  " } })).ai.affiliateId, "11300901968", "whitespace = empty");
  assert.strictEqual((await load({ ai: { affiliateId: "999" } })).ai.affiliateId, "999", "user value kept");
  assert.strictEqual((await load({ ai: { apiKey: "k" } })).ai.apiKey, "k", "other fields untouched");
  console.log("AFFILIATE ID DEFAULT OK — 11300901968, user value tidak ditimpa");
})().catch((e) => { console.error(e); process.exit(1); });
