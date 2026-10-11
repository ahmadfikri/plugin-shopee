# 2026-10-11 — 🎞 Gahwa Pack — v0.9.21

**Permintaan Fikri:** di halaman produk, satu klik untuk mengunduh semua attachment
halaman + teks yang berguna untuk engine Gahwa (image-to-video non-AI).

## Yang dilakukan tombol
Muncul di panel hanya di halaman produk (`/product/<shop>/<item>` atau `-i.<shop>.<item>`).
Satu klik → folder `~/Downloads/gahwa/<yymmdd>-<slug>/`:

| File | Isi |
|---|---|
| `img01.jpg …` (maks 12) | gambar galeri + varian dari area product-briefing, URL CDN dikanonikkan ke resolusi penuh (`…/file/<hash>`), duplikat digabung, ikon < 30px dilewati, foto ulasan pembeli / avatar toko tidak ikut |
| `video.mp4` | video listing jika berupa mp4 langsung. Jika HLS (.m3u8), URL dicatat di job; `gahwa.py --job` mengambil 20 detik pertama dengan ffmpeg |
| `gahwa_job.json` | `product` (nama, short_name, varian, fitur dari deskripsi, cuplikan deskripsi), `suggest` (hook 2 baris untuk morph, caption ≤3 kata dari varian/fitur, CTA "Link di bio") |

**Larangan tetap berlaku:** setiap teks yang menyebut harga/diskon/promo/murah/%/rating/
bintang/terjual dibuang sebelum masuk job (regex `BANNED` di `gahwapack.js`).

## Arsitektur
- `src/gahwapack.js` (content script): baca DOM ter-render saja, tanpa API/fetch Shopee.
- `src/background.js` (service worker baru): `chrome.downloads.download` — downloader
  browser sendiri, tidak terhalang CORS CDN Shopee. Izin manifest baru: `downloads`.
- Self-contained: tidak ada backend; engine dijalankan terpisah di Mac.

## Menjalankan Gahwa dari pack
```
cd /Users/clawbot/Documents/money-maker/gahwa
../MoneyPrinterTurbo/.venv/bin/python gahwa.py --job ~/Downloads/gahwa/<folder> --verify
```
Argumen CLI eksplisit (`--hook`, `--caption`, `--music`, `--out`, …) selalu menang atas job.

## Verifikasi
- `test/e2e-browser-gahwa.js`: extension asli di Chromium asli, fixture halaman produk di URL
  Shopee asli. Cek: 3 gambar unik full-res (bukan _tn/@resize, tanpa badge/ulasan), job.json
  tertulis, varian berharga ("Diskon 50%") & baris harga/rating di deskripsi tidak bocor, nama folder.
- Batas test: unduhan yang dimulai extension tidak lewat `route()` Playwright, jadi gambar
  fixture berakhir `SERVER_BAD_CONTENT` (hash palsu ke CDN asli) — test memastikan URL yang
  diminta benar & kegagalan bukan sebab lokal. Belum diuji di Shopee live.
- `run-all.sh` 35 langkah lulus.

## Backup
`manifest.json.bak-20261011-gahwa`, `src/panel.js.bak-20261011-gahwa`, `src/content.js.bak-20261011-gahwa`.
