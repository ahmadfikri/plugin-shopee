# 2026-10-06 — Log aktivitas (black box) — v0.9.18

## Kenapa
Fikri: bulk scan jalan tapi tidak ada produk yang tampil. Diagnosa lewat Playwright di Shopee tidak bisa
(anti-bot). Permintaan Fikri: catat semua aktivitas & klik, lalu analisa error dari log itu.

## Apa yang dicatat (src/activitylog.js, key chrome.storage `rm_activity_log`, ring buffer 3000 baris)
- `click` — setiap klik di halaman (panel plugin & halaman Shopee): tag, class, teks, `plugin: true/false`
- `input` — isian kolom plugin + kotak search produk Shopee saja (input lain & password TIDAK dibaca)
- `search-enter`, `url`, `page-open` (versi plugin, ukuran layar)
- `page-scan` / `page-store` — tiap render panel: kartu ditemukan -> produk ter-parse -> disimpan
- `bulk-start`, `bulk-progress`, `bulk-search-wait`, `bulk-batch`, `bulk-end`, `bulk-crash`
  `bulk-batch` = kartu -> parse -> analisa -> punya skor -> added/updated/total + 2 contoh produk
- `shortlist-render` — total di storage, cocok filter, filter aktif, BARIS YANG BENAR-BENAR ADA DI LAYAR,
  apakah host masih menempel di halaman, label keyword yang tersimpan
- `diag-zero-products` (+ HTML kartu pertama), `console` (baris "RM:"), `js-error`, `promise-error`, `run-crash`

## Cara ambil
Panel bawah: "⬇ Log aktivitas" (file baru riset-activitylog-<ts>.json), "Hapus log".
Juga di popup ikon extension: "⬇ Download log aktivitas" (berfungsi walau panel tidak muncul) dan di kotak diagnosa 0 produk.

## Lain
- Hapus definisi ganda `findPageButton` di bulkscan.js (salinan kedua menimpa yang pertama).
- Test baru: test/e2e-browser-activitylog.js (Chromium asli, unduh file log, cek isinya).
