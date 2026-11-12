#!/usr/bin/env node
/* Unit test for v0.9.34 niche + "pola champion" score (src/fbadlib.js).
 * Baseline = Fikri's data: 8/8 champions were casing HP or rumah/dapur,
 * fashion/kecantikan failed, hook rate is not a signal (not used). */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const A = require("../src/fbadlib.js");

const ad = (o) => Object.assign({ id: String(Math.random()), pageId: "p1", pageName: "P1", days: 1, variants: 1,
  body: "", linkUrl: "", videos: [] }, o);

// 1. niche classifier on copy Indonesian affiliates actually write
const N = (body) => A.nicheOf(ad({ body })).id;
assert.strictEqual(N("Casing iPhone 15 polkadot lucu banget"), "hp");
assert.strictEqual(N("Softcase Samsung A17 anti kuning"), "hp");
assert.strictEqual(N("Rak dapur susun 3 biar rapi"), "rumah");
assert.strictEqual(N("Tumbler stainless tahan dingin 24 jam"), "rumah");
assert.strictEqual(N("Alat pel putar tinggal twist"), "rumah");
assert.strictEqual(N("Kipas turbo kecil anginnya kencang"), "gadget");
assert.strictEqual(N("Gamis kain lembut adem"), "fashion");
assert.strictEqual(N("Flatshoes wanita empuk"), "fashion");
assert.strictEqual(N("Serum wajah glowing"), "beauty");
assert.strictEqual(N("Mainan anak edukasi"), "lainnya");
assert.strictEqual(N("showcase rumah ini"), "lainnya", "'case' inside a word must not match");

// 2. score ordering follows the baseline
const L = "https://s.shopee.co.id/abc123";
const champLike = ad({ days: 30, variants: 5, body: "Casing iPhone anti jatuh " + L });
const nicheNew = ad({ days: 3, variants: 1, body: "Rak dapur serbaguna " + L });
const fashionOld = ad({ days: 30, variants: 5, body: "Gamis motif adem " + L });
const s = (a, list) => A.polaScore(a, A.competitorStats(list || [a]));
assert.ok(s(champLike).score >= 70, "old scaled casing ad = CHAMPION: " + s(champLike).score);
assert.strictEqual(s(champLike).tier, "CHAMPION");
assert.ok(s(fashionOld).score < s(champLike).score, "same age/variants, fashion scores lower");
assert.ok(s(fashionOld).warn.some((w) => /komisi\/order kecil/.test(w)), "fashion warning shown");
assert.ok(s(nicheNew).score < 45 && s(nicheNew).tier === "LEMAH", "3-day ad is not proven yet: " + s(nicheNew).score);
assert.ok(s(nicheNew).warn.some((w) => /Belum 14 hari/.test(w)));

// 3. competitor pattern: same link pushed by 2 different advertisers = +10
const a1 = ad({ pageId: "p1", days: 20, body: "Casing iPhone " + L });
const a2 = ad({ pageId: "p2", days: 20, body: "Case iPhone lucu " + L });
const solo = s(a1, [a1]).score, shared = s(a1, [a1, a2]).score;
assert.strictEqual(shared - solo, 10, "multi-advertiser bonus");
assert.strictEqual(s(a1, [a1, a2]).advertisers, 2);

// 4. no Shopee link -> no link points, score still computed
const noLink = s(ad({ days: 30, variants: 3, body: "Casing HP" }));
assert.ok(noLink.parts.find((p) => /Tanpa link/.test(p[0]))[1] === 0);

// 5. hook rate is deliberately not a factor
for (const p of s(champLike).parts) assert.ok(!/hook/i.test(p[0]), "hook rate must not be scored");
assert.ok(s(champLike).score <= 100);

// 6. real captured payloads do not throw and every ad gets a niche + score
const fx = (f) => fs.readFileSync(path.join(__dirname, "fixtures", f), "utf8");
const real = A.extractFromText(fx("fbadlib-inline.json")).concat(A.extractFromText(fx("fbadlib-graphql.txt")));
const st = A.competitorStats(real);
for (const r of real) {
  const p = A.polaScore(r, st);
  assert.ok(p.score >= 0 && p.score <= 100 && ["CHAMPION", "MIRIP", "LEMAH"].includes(p.tier));
}

console.log("OK   pola champion: niche classifier, skor sesuai baseline, bonus multi-pengiklan, tanpa hook rate (" +
  real.length + " iklan asli dinilai)");
