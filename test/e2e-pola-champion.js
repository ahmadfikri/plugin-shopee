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

// 7. v0.9.35 "Analisa dalam": prompt carries baseline + facts, parser is strict but tolerant
{
  const e = { ad: champLike, pola: s(champLike), nicheStats: { ads: 4, terbukti: 2 },
    verdict: { name: "Case iPhone Anti Fall", price: 25000, rating: 4.9, reviews: 1200, sold: 8000, liked: 300,
      inStock: true, categoryL1: "Handphone & Aksesoris", action: "LAYAK COBA", roas: 1.6, maxCpc: 160, epc: 210, pro: 78, reasons: ["EPC niche kuat"] } };
  const bad = { ad: fashionOld, pola: s(fashionOld), nicheStats: null, verdict: { error: "timeout" } };
  const P = A.deepPrompt([e, bad]);
  for (const must of ["1,14", "8 dari 8 champion", "Hook rate TIDAK", "id=" + champLike.id, "Case iPhone Anti Fall",
    "prediksi ROAS bersih 1.6", "Max CPC Rp160", "GAGAL dibuka (timeout)", "COBA / UJI KECIL / LEWATI", '"hasil"'])
    assert.ok(P.includes(must), "deep prompt missing: " + must);
  assert.ok(!/https?:\/\//.test(P.split("PRODUK:")[1].split("Untuk TIAP")[0].replace(/Rp\d+/g, "")), "links stripped from ad copy");

  const out = A.parseDeep("Berikut hasilnya:\n```json\n" + JSON.stringify({ hasil: [
    { id: champLike.id, skor: 82.6, vonis: "coba", alasan: ["niche champion", "14+ hari"], risiko: ["CPR naik"], angle: "HP jatuh dari kasur, harga Rp25.000 murah" },
    { id: fashionOld.id, skor: 140, vonis: "skip aja", alasan: "komisi kecil" }], ringkasan: "Casing paling layak." }) + "\n```");
  assert.ok(out && out.hasil.length === 2);
  assert.strictEqual(out.hasil[0].skor, 83); assert.strictEqual(out.hasil[0].vonis, "COBA");
  assert.ok(!/Rp|murah|harga/i.test(out.hasil[0].angle), "price stripped from angle: " + out.hasil[0].angle);
  assert.strictEqual(out.hasil[1].skor, 100, "clamped"); assert.strictEqual(out.hasil[1].vonis, "UJI KECIL", "unknown verdict -> UJI KECIL");
  assert.deepStrictEqual(out.hasil[1].alasan, ["komisi kecil"]);
  assert.strictEqual(A.parseDeep("maaf, saya tidak bisa"), null);
  assert.strictEqual(A.parseDeep('{"foo":1}'), null);
}

// 8. v0.9.36 angle + hook + launch velocity
{
  const AO = (body) => A.angleOf(ad({ body })).id;
  assert.strictEqual(AO("Capek HP sering jatuh dari kasur? Ini solusinya"), "problem");
  assert.strictEqual(AO("POV: kamu baru pindah kos"), "pov");
  assert.strictEqual(AO("Dulu dapurku berantakan, sekarang rapi"), "beforeafter");
  assert.strictEqual(AO("5 barang dapur yang wajib punya"), "listicle");
  assert.strictEqual(AO("Jujur aku udah pakai 3 bulan"), "testimoni");
  assert.strictEqual(AO("Udah terjual ribuan, viral banget"), "socialproof");
  assert.strictEqual(AO("Tinggal putar, air langsung terperas"), "demo");
  assert.strictEqual(AO("Casing lucu motif bunga"), "lain");
  const pr = A.angleOf(ad({ body: "Diskon 50%! Capek HP retak?" }));
  assert.strictEqual(pr.id, "problem", "promo is recorded but never the main angle when another exists");
  assert.ok(pr.promo);
  assert.ok(A.polaScore(ad({ body: "Promo murah casing iPhone" })).warn.some((w) => /jangan tiru harga/.test(w)));

  assert.strictEqual(A.hookOf(ad({ body: "\n  HP sering jatuh?  Rp25.000 aja\nBaris kedua\n#fyp" })), "HP sering jatuh? aja");
  assert.strictEqual(A.hookOf(ad({ body: "https://s.shopee.co.id/x\nIni hook" })), "Ini hook");
  assert.ok(A.hookOf(ad({ body: "x".repeat(200) })).length <= 90);

  const now = Date.parse("2026-11-13T00:00:00Z");
  const mk = (pid, start, active) => ad({ pageId: pid, startDate: start, active });
  const vel = A.pageVelocity([mk("a", "2026-11-10", true), mk("a", "2026-11-01", false), mk("a", "2026-09-01", true), mk("b", "2026-11-12", true)], now);
  assert.deepStrictEqual([vel.a.total, vel.a.active, vel.a.last30, vel.a.tempo], [3, 2, 2, "RENDAH"]);
  const many = Array.from({ length: 12 }, () => mk("c", "2026-11-05", true));
  assert.strictEqual(A.pageVelocity(many, now).c.tempo, "TINGGI");

  // angle match bonus: two proven "problem" ads in the HP niche -> a third gets +5
  const p1 = ad({ pageId: "x", days: 20, body: "Casing iPhone, HP sering jatuh?" });
  const p2 = ad({ pageId: "y", days: 20, body: "Case Samsung, capek layar retak?" });
  const p3 = ad({ pageId: "z", days: 20, body: "Casing HP biar nggak lecet lagi" });
  const st = A.competitorStats([p1, p2, p3]);
  assert.strictEqual(st.byNiche.hp.topAngle, "problem");
  assert.strictEqual(A.polaScore(p3, st).parts.find((x) => /^Angle/.test(x[0]))[1], 5);
  const pDemo = ad({ pageId: "w", days: 20, body: "Casing HP tinggal pasang" });
  assert.strictEqual(A.polaScore(pDemo, A.competitorStats([p1, p2, pDemo])).parts.find((x) => /^Angle/.test(x[0]))[1], 0);
  // max score is still 100
  assert.strictEqual(A.polaScore(p3, st).parts.reduce((a, x) => a + x[2], 0), 100);
  // deep prompt now carries angle, hook and tempo
  const P2 = A.deepPrompt([{ ad: p3, pola: A.polaScore(p3, st), nicheStats: st.byNiche.hp, verdict: { error: "x" } }]);
  assert.ok(/Angle: Masalah/.test(P2) && /hook: "/.test(P2) && /tempo/.test(P2) && /angle TERBUKTI terbanyak: Masalah/.test(P2));
}

console.log("OK   pola champion: niche classifier, skor sesuai baseline, bonus multi-pengiklan, tanpa hook rate, " +
  "prompt + parser analisa dalam, angle + hook + tempo peluncuran (" + real.length + " iklan asli dinilai)");
