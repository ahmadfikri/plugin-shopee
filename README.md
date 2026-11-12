# syabab-affiliathor — v0.9.32

Chrome extension (Manifest V3) untuk riset produk **Shopee affiliate**: menyuntik
panel analisa ke halaman offer & halaman produk, memberi **vonis + prediksi ROAS
bersih** dan **Max CPC Meta setelah pajak**, membaca sinyal iklan kompetitor di
Meta Ad Library, plus generator caption, prompt video Veo/Gemini dan Launch pack
siap-posting.

**Self-contained:** tanpa backend, tanpa dependency npm, tanpa Facebook/Meta API
(Ad Library dibaca dari halaman publiknya, bukan API), tidak menyentuh
`affiliate_dashboard.xlsx`. Semua data lokal (`chrome.storage`).

Riwayat perubahan per versi ada di `documentation/` (satu file per perubahan).

---

## 📄 Baru di proyek ini? Baca `HANDOFF.md` dulu
`HANDOFF.md` berisi model bisnis, batasan yang tidak boleh dilanggar, arsitektur,
selector terverifikasi, jebakan yang sudah pernah menipu, dan daftar kerja berikutnya.
`STATUS.md` berisi ringkasan fitur + riwayat perbaikan.

## ✅ Verifikasi (butuh Node.js saja)
```bash
bash test/run-all.sh
```
Harus berakhir `SEMUA VERIFIKASI LULUS` (50 langkah, beberapa memakai Chromium asli).

⚠️ Langkah 49 (`test/e2e-browser-fbadlib2.js`) membuka halaman Ad Library **live**
milik Beyond.shopcart dan mengharapkan tepat 6 iklan aktif. Kalau pengiklan itu
menambah/mematikan iklan, langkah ini gagal walau plugin benar. Per 7 Nov 2026
halaman itu menampilkan 5 iklan, jadi langkah 49 merah. Lihat
`documentation/2026-11-07-dokumentasi-v0.9.32.md`.

## 🔌 Pasang
Panduan lengkap (pasang, semua field config + default, halaman yang didukung,
troubleshooting): **[docs/SETUP.md](docs/SETUP.md)**.

1. `chrome://extensions` → **Developer mode** ON
2. **Load unpacked** → pilih folder `riset-plugin/`
3. Buka `affiliate.shopee.co.id/offer/product_offer` → panel muncul otomatis

⚠️ Setelah mengubah kode: klik **↻ reload** di kartu ekstensi **lalu refresh halaman**.

## ⚙️ Config (Admin Panel)
Klik ikon ekstensi → **Admin Panel**. Isi:
- **Ekonomi**: komisi %, break-even CPC, conversion rate, **PPN Meta (11%)** dan
  **WHT Shopee (2,5%)** untuk hitungan setelah pajak
- **Affiliate ID**: default `11300901968` (diisi otomatis, nilai manual tidak ditimpa)
- **DeepSeek**: API key + model (wajib untuk tombol Caption & Prompt Video)
- **Feedback Loop**: tempel `export/performance-snapshot.json` → **Impor Snapshot**

## 🎯 Fitur
- **PRO SCORE** 4 pilar (ekonomi-klik, daya-klik, konversi, permintaan) + **Max CPC**
- **Feedback loop**: Max CPC dikalibrasi dari **EPC nyata**; produk mirip
  zero-converter otomatis di-**SKIP**
- **Bulk Scan** — dua cara, keduanya menumpuk ke **Shortlist Kumulatif**
  (top 20 + tampilkan semua + export CSV):
  - **▶ Semua Kategori** — klik tab kategori otomatis, opsi ikut paginasi
  - **🔎 Bulk Scan Keyword** — isi daftar kata kunci (dipisah koma), plugin mencari
    satu per satu, re-query input/tombol React, retry sekali kalau submit tertelan,
    dan **hanya menyimpan hasil yang terbukti berubah + selesai ter-render**.
    Setelah selesai, tabel bawah otomatis menampilkan **hasil keyword terakhir**;
    tombol `Lihat seluruh shortlist` kembali ke ranking kumulatif.
- **Sort ↕** tersedia di setiap header tabel utama dan shortlist (Harga, Komisi,
  Max CPC, EPC, PRO, keyword, dll), toggle naik/turun tanpa reload.
- **Experiment ID zero-typing (v0.9)**: generate caption/video otomatis membuat
  satu ID aman (≤20 karakter) yang dipakai identik sebagai **nama campaign Meta +
  tag Shopee**. Caption dan video berbagi konsep/ID; tombol `Eksperimen Baru`
  merotasi konsep dan membuat ID berikutnya. Hipotesis masuk Learning Ledger otomatis.
- **Campaign Registry XLSX** dibuat otomatis di folder analisis setiap dashboard
  rebuild; kolom manual dipertahankan, performa/alias/unmatched diperbarui.
- **Panel halaman produk (v0.9.25+)**: vonis dulu (IKLANKAN / LAYAK COBA / UJI
  KECIL / HATI-HATI / LEWATI), lalu **prediksi ROAS bersih** (setelah PPN + WHT,
  1,00x = impas beneran), P(untung), **Max CPC Meta setelah pajak**, risiko dan
  dasar data. Listing, shortlist dan drill-down memakai mesin keputusan yang sama.
- **Prior per niche + 🎲 Thompson sampling (v0.9.26)**: produk baru ditarik ke
  rata-rata niche-nya; shortlist memberi "Uji 3 produk ini dulu".
- **⬇ Video**: unduh video produk (mp4 langsung)
- **🎞 Gahwa Pack**: satu klik unduh galeri + varian + video + `gahwa_job.json`
- **🎬 Prompt Video**: prompt Veo/Gemini 9:16, 10 detik, hook 3 detik, framing
  menurut ukuran produk, tanpa harga dan tanpa rating
- **✨ Caption**: satu caption SEO-first + disclaimer + hashtag niche/FYP, tanpa
  harga dan tanpa rating. Satu request per produk (klik dobel aman, v0.9.31)
- **🚀 Launch pack (v0.9.32)**: satu blok siap tempel berisi nama campaign Meta
  (= `sub_id` dari short-link), short-link affiliate, caption, prompt video, dan
  checklist (CPC > Rp200, vonis 2x24 jam, scale +20% kalau ROAS ≥ 1,4)
- **Meta Ad Library (v0.9.29–0.9.32)**: download video HD per iklan / semua,
  export data iklan JSON, badge **🏆 TERBUKTI / 📈 MENJANJIKAN / 🆕 BARU / SCALING**
  dari lama tayang + variasi, panel **🏆 Top iklan**, **🔍 Analisa produk TERBUKTI**
  (buka link Shopee di tab latar, ambil vonis plugin), **✍ brief kreatif**,
  **pelacak kompetitor** (iklan baru / tidak terlihat lagi), **📒 Cek semua kompetitor**
- **TikTok downloader**: 1080p tanpa watermark (lewat offscreen blob)
- **💰 Payout Shopee (v0.9.31)**: di detail payout, simpan payout, tarif WHT nyata,
  export CSV per hari + JSON (rekening/nama bank tidak disimpan)
- **Log aktivitas**: rekam klik, tahap bulk scan, error → export dari panel/popup

## 🔄 Menyegarkan data feedback loop
```bash
cd ../analisis
python3 export_perf_snapshot.py
```
→ tulis `export/performance-snapshot.json`, lalu impor via Admin Panel.

## ⚠️ Catatan jujur
- Angka **Terjual/bln & omset = ESTIMASI** dari data publik Shopee, bukan angka resmi.
- Shopee sering mengubah HTML dan punya anti-bot. Scraper dibuat defensif, tapi
  selector bisa perlu kalibrasi ulang. **Jangan** ganti scraping dengan panggilan
  API Shopee — itu memicu CAPTCHA dan berisiko men-flag sesi.
- **Bulk Scan Semua Kategori** sudah dipakai dan jalan untuk pencarian sederhana.
  Bug "error setelah search" (node tab di-cache) sudah diperbaiki + dikunci tes.
- **Bulk Scan Keyword** sekarang punya regression test untuk stale-result, selector
  input/tombol yang salah, signature collision, dan React submit yang tertelan;
  selector DOM tetap perlu diverifikasi kalau Shopee mengubah markup.
- Ikon masih placeholder.
- Sinyal Ad Library adalah **proxy** (lama tayang), bukan data profit. Validasi
  produk lewat panel EPC sebelum bikin campaign. Video kompetitor untuk riset
  angle saja; jangan iklankan ulang.
- URL video Ad Library kedaluwarsa (`oe=`): refresh halaman lama sebelum download.
- Repo ada di folder yang disinkron Google Drive. Drive bisa menaruh file `Icon\r`
  kosong di `.git` sehingga `git fetch` gagal (`bad object refs/Icon?`). Pindahkan
  file itu keluar dari `.git`, atau keluarkan `.git` dari sinkronisasi.

- **Audit hardening v0.9:** concept win-rate hanya memakai exact Experiment ID;
  broad-tag log lama diabaikan. Product→tag matcher menolak tag generik satu kata.
  Dataset/shortlist writes diserialkan dan storage errors dipermukaan-kan. Data DOM
  Shopee di-escape sebelum HTML, URL dibatasi HTTP(S), dead Shopee API dibuang,
  perhitungan review 4–5★ array diperbaiki, dan saturation scoring lama dihapus.

## 📁 Struktur
```
manifest.json  HANDOFF.md  STATUS.md  DESIGN.md  README.md
src/            29 content script (3 grup: Shopee, affiliate, FB Ad Library)
                + background.js (service worker) + offscreen + admin/ + popup/
test/           run-all.sh (50 langkah) + fixtures/
documentation/  satu file .md per perubahan
export/         performance-snapshot.json (feedback loop)
assets/         icon16/48/128.png (placeholder)
```

## 🌿 Branch & rilis
```
feat/vX.Y.Z-*   kerja per batch → PR ke main (PR #1–#5 sudah merge)
main            versi terbaru (sekarang v0.9.32)
release/v0.9.0  di-fast-forward ke main tiap rilis (nama lama, isi v0.9.32)
```
