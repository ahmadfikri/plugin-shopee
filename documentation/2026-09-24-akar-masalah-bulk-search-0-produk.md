# Perbaikan 2026-09-24 (v0.9.10) — AKAR MASALAH bulk search keyword: 0 produk

Laporan Fikri (dengan screenshot): search "tumbler" → "Selesai — 0/1 kata kunci — total 0
produk", tabel jadi kosong total, "pages gak berenti", "top product gak berubah".

## 1. AKAR MASALAH (akhirnya ketemu) — selector 'loading' kelewat luas

`waitForSearchResult()` — dipakai **khusus** jalur bulk scan KEYWORD — menunggu
`pageLoading()` menjadi false. `pageLoading()` mencocokkan:

```
.ant-spin-spinning, .ant-skeleton, [aria-busy='true'], [class*='loading' i]
```

`[class*='loading' i]` terlalu luas untuk halaman React/antd. Satu node visible
permanen seperti `image-loading` / `lazyloading` / `loadingWrapper` membuat
`pageLoading()` **selalu true**, sehingga syarat `transitioned && !loading`
**tidak pernah** terpenuhi → hasil dianggap "tidak terverifikasi" → tidak ada yang
disimpan → **0/1 kata kunci, 0 produk**, padahal hasilnya jelas terlihat di layar.

**Bukti asimetri yang menunjuk bug:** Bulk Scan Semua KATEGORI selalu jalan, karena
ia memakai `waitForChange()` yang tidak pernah memanggil `pageLoading()`. Hanya
jalur keyword yang kena. Itu persis keluhan berulang "bulk search didn't work".

**Bukti eksperimental:** test baru `test/e2e-loading-guard.js` mensimulasikan node
`image-loading` visible permanen + hasil pencarian berubah.
- Kode LAMA (HEAD sebelumnya): `{ready:false, cards:0}` → FAIL (gejala Fikri direproduksi)
- Kode BARU: `{ready:true, cards:4}` → PASS

**Perbaikan:** `pageLoading()` dipersempit ke indikator sibuk milik framework saja
(`.ant-spin-spinning, .ant-skeleton-active, [aria-busy='true']`). Plus jaring pengaman:
setelah masa tenggang (maks 6s / setengah budget), indikator loading tidak lagi
dipercaya — spinner nyangkut tidak bisa menggantung scan selamanya.

## 2. Auto-clear yang merusak data (bug bikinan sendiri di v0.9.9)

v0.9.9 membersihkan shortlist **di awal** klik Bulk Scan Keyword. Ketika scan lalu
gagal verifikasi (bug #1), Fikri ditinggal dengan tabel KOSONG dan riset lamanya hilang
— lebih buruk dari sebelumnya.

**Perbaikan:** wipe jadi **LAZY**. `runKeywords({clearFirst:true})` membersihkan daftar
hanya sesaat sebelum batch pertama yang benar-benar bisa disimpan. Scan yang tidak
menemukan apa pun kini tidak mengubah apa pun.

## 3. Pagination bisa tidak berhenti (bug bikinan sendiri di v0.9.9)

Loop lama: `for (pg=2; total < MAX_ANALYZE; pg++)`. Kalau sebuah halaman tidak menambah
produk baru, `total` tidak tumbuh, `total < 200` selalu benar → klik "next" tanpa henti.
Itu "pages gak berenti".

**Perbaikan:** tiga rem independen — cap produk `MAX_ANALYZE=200`, cap halaman
`MAX_PAGES=12`, dan berhenti setelah 2 halaman berturut-turut tanpa produk baru.

## Catatan yang BELUM dikerjakan (jujur)
- **"top product gak berubah"**: chart Top Produk / Max CPC masih dihitung dari produk
  HALAMAN yang sedang dibuka (`a.products`), sedangkan tabel sekarang kumulatif. Setelah
  bug #1 beres, chart akan ikut terisi benar saat panel re-render — tapi secara desain
  chart page-scoped vs tabel kumulatif memang belum konsisten. Opsi berikutnya: jadikan
  chart bersumber dari shortlist kumulatif juga (belum dikerjakan, menunggu keputusan).
- Root cause #1 dibuktikan lewat reproduksi test, BUKAN lewat inspeksi halaman Shopee asli
  Fikri. Kalau setelah reload masih 0 produk, langkah berikutnya wajib buka Chrome asli.

## Verifikasi
- `node --check` semua file lolos.
- Suite penuh: **SEMUA VERIFIKASI LULUS** (29 test, termasuk regressi baru 19b).
