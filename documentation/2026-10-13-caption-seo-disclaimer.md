# v0.9.24 — Caption SEO-first + disclaimer (2026-10-13)

Permintaan Fikri: "plugin caption fokus sekali lagi di SEO, terus kasih disclaimer, product mungkin sedikit berbeda".

## Yang berubah
- `src/ai.js` → `DEFAULT_CAPTION_PROMPT` ditulis ulang SEO-first:
  1. AI menentukan 1 kata kunci utama 2-4 kata yang diketik pembeli (bukan judul Shopee panjang).
  2. Kalimat pertama wajib memuat kata kunci itu di 3-6 kata awal (baris sebelum "lainnya" paling berbobot untuk pencarian TikTok/IG/FB).
  3. Badan caption memuat 2-3 variasi long-tail secara alami, dilarang keyword stuffing.
  4. Manfaat konkret pakai kata yang dicari orang.
  5. Hashtag (c) sekarang 1-2 tag SEO dari kata kunci utama (mis. `#casingiphone15`).
  6. Caption 3-5 baris (sebelumnya 2-4) agar muat long-tail.
- Konstanta baru `CAPTION_DISCLAIMER` = "Catatan: tampilan produk asli mungkin sedikit berbeda dari video."
- Fungsi baru `ensureDisclaimer()` dipanggil di akhir `ensureHashtags()`: tepat satu baris disclaimer, posisi tepat di atas baris hashtag. Varian buatan model diganti versi baku; disclaimer yang salah posisi (di bawah hashtag) dipindah. Tetap jalan walau ada captionPrompt custom di storage.
- Larangan harga & rating, niche tags, satu caption — tidak berubah.

## Test
- `test/e2e-campaign-hashtag.js` (sudah basi sejak v0.9.23) diganti `test/e2e-caption-seo.js` (7 skenario).
- `test/e2e-price-guard.js` disesuaikan: cek niche tag + disclaimer, bukan tag 10.10.
- `bash test/run-all.sh` → SEMUA VERIFIKASI LULUS.

## Catatan
- Kalau di Admin Panel ada captionPrompt custom, bagian SEO tidak ikut (yang dipakai prompt custom itu). Disclaimer tetap muncul. Kosongkan field captionPrompt agar prompt SEO bawaan dipakai.
- Setelah update: Chrome → chrome://extensions → ⟳ pada kartu plugin, lalu reload tab Shopee.

## Revert
`src/ai.js.bak-20261013-seo`, `manifest.json.bak-20261013-seo`, atau `git revert` commit v0.9.24.
