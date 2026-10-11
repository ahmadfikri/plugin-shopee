# 2026-10-11 — Gahwa Pack: ambil galeri produk saja — v0.9.22

**Masalah (tes Fikri di Shopee asli):** pack `261011-casebeauty-untuk-case` berisi img06 = logo toko (397px)
dan img07–img12 = logo kurir/pembayaran (52×22 px, mis. Alfamart). Penyebab: `collectImages()` memindai seluruh
product-briefing, dan filter ikon hanya membuang gambar < 30px.

**Perbaikan (`src/gahwapack.js`):**
- `galleryBox()`: cari gambar utama terbesar (≥200px), naik ke ancestor terlebar yang masih ±1 kolom
  (≤1,45× lebar gambar utama) = kolom galeri. Hanya gambar di kolom itu + gambar di tombol varian yang diambil.
- `iconLike()`: buang gambar < 40px atau rasio > 1,6 / < 0,6 (logo kurir 52×22).
- Fallback ke perilaku lama (+ filter ikon) kalau gambar utama tidak ketemu.

**Gahwa (`gahwa.py --job`):** kalau `img07.jpg` tidak ada, pakai `img07.*` (Chrome bisa mengganti ekstensi sesuai tipe file).

**Test:** fixture `test/fixtures/shopee-product.html` diberi logo kurir/bayar + logo toko di kolom info;
`test/e2e-browser-gahwa.js` memastikan tidak ada yang ikut. run-all.sh lulus semua.
Backup: `*.bak-20261011-gallery`.
