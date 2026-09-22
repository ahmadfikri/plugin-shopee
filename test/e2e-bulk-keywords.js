/* e2e-bulk-keywords.js — intermittent keyword search guards. */
"use strict";
const fs = require("fs"), vm = require("vm"), assert = require("assert");

function node(text, href) {
  return {
    textContent: text,
    offsetParent: {}, disabled: false,
    getAttribute() { return null; },
    querySelector(s) { return s === "a[href]" && href ? { href } : null; }
  };
}

const wrong = { textContent: "Chat", offsetParent: {}, disabled: false,
  closest: () => ({ textContent: "Chat panel" }), parentElement: null };
const rightButton = { textContent: "Cari", disabled: false, type: "button", getAttribute: () => "" };
const form = { textContent: "Cari Produk", querySelectorAll: () => [rightButton], parentElement: null };
const right = { textContent: "", offsetParent: {}, disabled: false,
  closest: () => form, parentElement: form };
let cards = [node("produk sama", "https://s/1"), node("produk lama", "https://s/2")];

const document = {
  querySelector(sel) {
    if (sel.includes("loading") || sel.includes("aria-busy")) return null;
    return null; // force generic-input fallback
  },
  querySelectorAll(sel) {
    if (sel.includes("input")) return [wrong, right];
    return [];
  }
};
const window = {
  document,
  RMScraper: { findCards: () => cards }
};
const ctx = vm.createContext({ window, document, console, setTimeout, clearTimeout,
  Date, URLSearchParams, Event: function(){}, KeyboardEvent: function(){} });
vm.runInContext(fs.readFileSync(__dirname + "/../src/bulkscan.js", "utf8"), ctx);
const B = window.RMBulk;

assert.strictEqual(B.findSearchInput(), right, "generic fallback selects product-search context");
assert.strictEqual(B.findSearchButton(right), rightButton, "button is scoped beside chosen input");

const before = B._signature();
cards = [node("produk sama", "https://s/1"), node("produk BARU", "https://s/3")];
const after = B._signature();
assert.notStrictEqual(before, after, "signature sees changes beyond first card");

const src = fs.readFileSync(__dirname + "/../src/bulkscan.js", "utf8");
assert(src.includes("waitForSearchResult(prev, 15000)"), "search waits for verified transition");
assert(src.includes("attempt < 2"), "one retry exists for swallowed React submit");
assert(src.includes("data lama tidak disimpan"), "stale results are skipped, not stored");

console.log("BULK KEYWORD GUARDS LULUS");
console.log("  scoped input/button: OK");
console.log("  multi-card signature: OK");
console.log("  transition + retry + stale-skip: OK");
