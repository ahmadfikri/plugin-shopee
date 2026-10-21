# v0.9.23 — Gahwa Pack: filter gambar diperketat (anti logo bank/toko/review)

**Tanggal:** 2026-10-11
**File:** `src/gahwapack.js` (`collectImages`, `isProductImg`, `galleryBox`)
**Versi:** manifest 0.9.22 → **0.9.23**

## Masalah
Gahwa Pack masih menarik gambar yang **bukan produk**: logo bank
(BCA/BNI/BRI/Visa), logo kurir (Alfamart/Alfamidi), logo toko (rainbow
"case beauty"), dan foto review pembeli. Kalau gambar sampah ini masuk ke
engine video, hasil videonya jelek. Fokus Fikri: **cuma foto barang yang
dijual**.

## Diagnosa (dari DOM halaman Shopee ASLI, bukan tebakan)
Halaman produk `Casebeauty` di-save (Save Page As) lalu DOM-nya dibedah di
Chromium asli. Temuan:

- Gambar produk = hero `<img alt="Product image …">` (class `P39yUt NR6MMT`,
  450px) + thumbnail galeri (`P39yUt lazyload TnEtN4`, 82px, **alt kosong**).
- Sampah mengumumkan dirinya sendiri:
  - `alt="logo"` (31×) → bank/kurir/toko/sosmed
  - `alt="icon …" / "rating" / "app" / "profile"` → UI chrome
  - foto review pembeli ada di bawah `.rating-media-list…`
  - logo lain duduk di blok `voucher` / `payment` / `footer` / header toko
- Logika lama (`galleryBox`: ambil gambar terbesar lalu naik ke ancestor
  terluas) kelewat longgar → menyapu blok non-produk.

## Perbaikan
Filter dua-lapis, tidak bergantung pada nama class ter-obfuscate (P39yUt…)
yang bisa dirotasi Shopee saat redeploy:

1. **Anchor ke galeri**, bukan ke seluruh halaman:
   - utama: hero `img[alt^="Product image"]` → naik ke kolom galeri;
   - cadangan: container galeri by class; lalu `galleryBox` (size heuristic).
   Men-scope ke galeri = logo toko/bank/kurir/review (semuanya DI LUAR galeri)
   tak pernah ikut terbaca.
2. **`isProductImg(img, relaxed)`** sebagai satu gerbang untuk semua jalur:
   - tolak `alt` = logo/icon/rating/app/profile;
   - tolak kalau `closest()` ke blok rating-media/voucher/payment/footer/header;
   - `alt` kosong hanya diterima dalam mode **relaxed** (di dalam galeri) DAN
     bukan ukuran ikon (`iconLike`) → thumbnail produk lolos, logo kecil tidak.

## Bukti (dua gate, dua-duanya hijau)
- Halaman Shopee ASLI (casebeauty tersimpan), dijalankan di Chromium nyata:
  **5 gambar produk** terkumpul, **0 logo/ikon** lolos.
- `test/e2e-browser-gahwa.js` (fixture sengaja berisi logo BCA, Alfamart,
  shop-logo, foto review): **OK — 3 gambar**, semua logo + review dibuang.

## Backup
`src/gahwapack.js.bak-20261011-imgfilter`

## Cara verifikasi di browser (Fikri)
1. `chrome://extensions` → ⟳ reload extension → cek versi **0.9.23**.
2. Hard-reload tab produk Shopee.
3. Klik 🎞 Gahwa Pack → folder hasil harus berisi **hanya foto produk**,
   tidak ada logo bank/toko/kurir/review.
