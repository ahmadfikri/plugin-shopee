# 2026-10-03 — Experiment ID (Campaign Meta = Tag Shopee) lebih unik — v0.9.16

## Masalah
Format lama: nama(8) + hash(2) + konsep(2) + yymmdd(6) + counter(2), contoh `polkadotyjps26100301`.
- Counter disimpan di storage browser lokal -> kalau storage dihapus / reinstall / PC lain, counter mulai dari 01 lagi -> ID yang SAMA bisa keluar lagi dan data dua campaign tercampur di satu tag Shopee.
- Hash cuma 2 karakter dari nama tag, bukan dari produk -> dua produk dengan tag dasar mirip bisa bentrok.
- Dua ID berbeda hanya 2-3 karakter di tengah -> susah dibedakan di Ads Manager.

## Perubahan (src/experiment.js)
Format baru, selalu tepat 20 karakter huruf kecil/angka:
`nama(6) + konsep(2) + yymmdd(6) + sidikProduk(3) + acak(3)` — contoh `polkadps2610038jwjv4`.
- sidikProduk = hash FNV dari product id / URL -> produk beda = ID beda walau namanya sama.
- acak = 3 karakter dari crypto.getRandomValues (46.656 kemungkinan) -> tidak lagi tergantung counter lokal.
- Dicek terhadap semua ID yang pernah dibuat di browser ini; kalau bentrok, diacak ulang (maks 20x).
- Bagian depan tetap terbaca: nama produk + kode konsep + tanggal.
- Analisis (ingest_affiliate.py) tidak mem-parse format ID, jadi aman.

## Test
test/e2e-experiment.js ditambah: panjang tepat 20, prefix terbaca, produk kembar beda sidik, 300 eksperimen berturut tanpa duplikat, ID setelah storage dihapus tidak mengulang. Semua 21 test non-browser lolos.

Backup: src/experiment.js.bak-20261003-uniqid
