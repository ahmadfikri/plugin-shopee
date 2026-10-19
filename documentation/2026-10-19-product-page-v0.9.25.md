# 2026-10-19 — v0.9.25: product-page panel rebuilt (decision first)

Scope: Shopee **product pages only** (`/product/<shop>/<item>`). The listing / product-offer
page and its drill-down modal are unchanged.

## Why
The old panel was 13 cards of equal weight + two competing scores (PRO, EPC), and four of
the cards were always wrong on this page: Stok, Umur listing, Lokasi toko (always "?") and
Official (hard-coded "Tidak"). It also compared EPC (per **Shopee** click) against a CPC
target (per **Meta** click) — a unit mismatch that undervalued every product ~1.5x
(you get ~1.48 Shopee clicks per Meta click).

## What the panel shows now (in this order)
1. **Vonis** — IKLANKAN / LAYAK COBA / HATI-HATI / LEWATI / UJI KECIL (produk baru) /
   IMPOR DATA (belum ada snapshot), with the reason in one line.
2. **4 angka**: Prediksi ROAS (+ rentang 80%), P(untung), Max CPC Meta (break-even),
   budget uji maks Rp30rb (aturan WAJIB MATIKAN net −30rb).
3. **Chart 1** — nilai 1 klik Meta (titik + rentang) vs CPC Meta (garis); area merah = rugi.
4. **Chart 2** — ROAS produk ini vs riwayat tag, balik modal (1x), dan 3 winner kamu.
5. **Risiko** — zero-converter, tag yang rugi, arrival < 1 (hanya kalau tag ≥ 3 hari),
   review < 30, rating < 4.6, snapshot > 3 hari, gate PRO.
6. **Dasar data** — tag acuan, hari & rentang tanggal, klik, order, konversi, EPC nyata →
   prediksi (Empirical Bayes), arrival, CPC Meta, ROAS nyata, net. Produk baru: angka
   global + peluang dasar (berapa % produk yang pernah diiklankan balik modal; sekarang 17/120).
7. **Kepercayaan pembeli** — rating, review, % 4–5★, terjual, favorit, komisi, bar bintang.
8. **Riwayat eksperimen produk ini** — ID yang pernah dibuat di browser ini + hasilnya
   kalau ID itu sudah ada di snapshot.
9. Tombol: *Bikin konten* (Caption, Prompt Video, Gahwa Pack, Video) dan *Lainnya*
   (Eksperimen Baru, Simpan, Refresh Data Training). Tombol "–" menciutkan panel (diingat).
10. Skor PRO lama dipindah ke blok lipat — bobot manual, bukan prediksi.

## Math
- value per Meta click = EPC × arrival (Shopee clicks / Meta clicks, same clean days)
- ROAS = value ÷ Meta CPC. CPC = CPC tag itu kalau ≥100 klik Meta, else CPC rata-rata kamu,
  else `breakEvenCPC` Admin Panel. Checked against real data: polkadotIphone 2.42 vs 2.39
  measured, kitchenCounter 2.31 vs 2.30, redchefTumbler 0.54 vs 0.54, global 1.26 vs 1.28.
- P(untung) = Φ((value − CPC) / (se × arrival)), se from the EB posterior.

## Other changes
- `analisis/export_perf_snapshot.py`: per tag + global `metaClicks`, `metaCpc`, `arrival`,
  `firstDate`, `lastDate`, `days` (see 2026-10-19-feedback-snapshot-refresh.md).
- `src/epc.js`: uses the snapshot's `epc` when present (clean-day EPC), not commission ÷ clicks.
- `src/content.js`: product page uses `RMProductPage.build`; a click on the inline panel's
  padding no longer deletes it (backdrop-close only applies to the overlay modal).

## Tests
- `test/e2e-productpage.js` (#36): decision math on the real snapshot (20 checks).
- `test/e2e-browser-productpage.js` (#37): real Chromium + extension on the product fixture,
  with and without snapshot; checks verdict, both charts, history, no NaN/undefined/null,
  old cards gone, all buttons present, minimise / ✕ / padding click, zero page errors.
- `bash test/run-all.sh`: all 37 pass.

## Not verified
Real Shopee page in your logged-in Chrome (DOM may differ from the fixture). Rating and
%4–5★ show "?" on the fixture because it lacks Shopee's rating classes; on real Shopee
those selectors were verified earlier (HANDOFF §11).

## Revert
`git revert` this commit, or the `*.bak-20261019-pp` files next to each changed file.
