# v0.9.26 — Prior per niche + rencana uji Thompson sampling (2026-10-21)

Tujuan (Fikri): menaikkan peluang menemukan produk yang cocok untuk campaign.
Sumber ide: google-research `offline_online_bandits` (uji online yang di-warm-start
dari data lama) dan partial pooling (Empirical Bayes hierarkis). Tidak ada ML berat:
120-an produk yang pernah diiklankan terlalu sedikit untuk model besar.

## Kenapa niche
Data snapshot 2026-10-21, hanya tag dengan spend ≥ Rp10rb yang dihitung "diuji":

| Niche | Diuji | Balik modal | ROAS niche | EPC | CPC Meta | Arrival |
|---|---|---|---|---|---|---|
| hp (casing & aksesoris HP) | 24 | 8 | 1.39 | Rp146 | Rp163 | 1.53 |
| rumah (rumah & dapur) | 22 | 4 | 1.26 | Rp129 | Rp146 | 1.44 |
| lainnya | 12 | 0 | 0.31 | Rp54 | Rp188 | 1.02 |

Sebelumnya semua produk baru dapat angka global yang sama. Sekarang:
- produk baru di niche hp → UJI KECIL, prediksi ROAS ~1.37x, peluang balik modal ~32%
- produk baru di niche lainnya → **HATI-HATI** (0 dari 12 yang pernah diuji balik modal)

## Perubahan
- `analisis/export_perf_snapshot.py`: `niche` + `nicheSource` per tag, blok `niches`,
  `minTestSpend`. Niche dari keyword nama tag; kalau tidak ada keyword, dari kategori
  L1 item Same Shop (≥3 item, ≥60%); selain itu "lainnya".
- `src/niche.js` (baru): klasifikasi. Breadcrumb L1 yang dikenali menang; L1 tak dikenal
  diabaikan; lalu keyword nama; default "lainnya".
- `src/detailscrape.js`: `categoryPath()` dari JSON-LD BreadcrumbList atau link `-cat.`.
- `src/epc.js`: prior niche (EPC, `tau` = sebaran EPC antar-produk dari tag ≥100 klik,
  peluang balik modal = Beta posterior dengan prior rata-rata semua niche, kekuatan 4).
  Tag ditarik ke EPC niche-nya. `predict({niche})` → basis `niche`. `roasPrior()` baru:
  arrival & CPC dari tag → niche → global (dipakai halaman produk dan rencana uji).
- `src/productpage.js`: vonis & "Dasar data" untuk basis niche (sumber niche ditampilkan).
- `src/bandit.js` (baru): Thompson sampling, 2000 simulasi, top-3, seed dari id produk
  (tidak berubah tiap render), memo, maks 200 kandidat. Melaporkan kalau pilihan
  sebenarnya seri (produk baru di niche sama punya prediksi identik).
- `src/analytics.js`, `src/shortlist.js`: niche + `roas`/`roasSd` per produk; kolom CSV baru.
- `src/panel.js`: blok "🎲 Uji 3 produk ini dulu" di atas tabel shortlist. Kalau semua
  kandidat P(ROAS≥1x) < 10% → "⚠ Belum ada kandidat yang layak diuji". Hanya HTML,
  tidak ada tombol/handler baru, jadi bulk scan tidak tersentuh.
- `src/content.js`: halaman produk kirim niche ke prediksi; dataset ikut simpan `categoryL1`.

## Batas jujur
- Produk baru dalam niche yang sama tetap tidak bisa dibedakan satu sama lain sebelum diuji.
- Produk yang cocok dengan tag lama memakai posterior tag itu (sempit), padahal listing-nya
  bisa beda. Ini perilaku lama, belum diubah.
- Niche cuma 3 kelompok kasar. Dipecah lebih halus kalau data per sub-kategori sudah cukup.

## Test
`bash test/run-all.sh` — semua lulus. Baru: #38 `e2e-niche.js`, #39 `e2e-bandit.js`,
#40 `e2e-browser-testplan.js` (Chromium nyata, bulk scan + snapshot asli). #37 ditambah
langkah produk baru dengan breadcrumb.

## Rollback
File `*.bak-20261021-ts` di sebelah setiap file yang diubah, atau `git revert`.
