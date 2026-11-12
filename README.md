# syabab-affiliathor

Chrome extension (Manifest V3) untuk riset produk **Shopee affiliate**: menyuntik
panel analisa ke halaman offer & halaman produk, memberi **PRO SCORE** dan
**Max CPC** (batas bayar per klik agar tetap untung), plus generator prompt video
Veo/Gemini dan caption siap-posting.

**Self-contained:** tanpa backend, tanpa dependency npm, tanpa Facebook/Meta API,
tidak menyentuh `affiliate_dashboard.xlsx`. Semua data lokal (`chrome.storage`).

---

## 📄 Baru di proyek ini? Baca `HANDOFF.md` dulu
`HANDOFF.md` berisi model bisnis, batasan yang tidak boleh dilanggar, arsitektur,
selector terverifikasi, jebakan yang sudah pernah menipu, dan daftar kerja berikutnya.
`STATUS.md` berisi ringkasan fitur + riwayat perbaikan.

## ✅ Verifikasi (butuh Node.js saja)
```bash
bash test/run-all.sh
```
Harus berakhir `SEMUA VERIFIKASI LULUS`.

## 🔌 Pasang
Panduan lengkap (pasang, semua field config + default, halaman yang didukung,
troubleshooting): **[docs/SETUP.md](docs/SETUP.md)**.

1. `chrome://extensions` → **Developer mode** ON
2. **Load unpacked** → pilih folder `riset-plugin/`
3. Buka `affiliate.shopee.co.id/offer/product_offer` → panel muncul otomatis

⚠️ Setelah mengubah kode: klik **↻ reload** di kartu ekstensi **lalu refresh halaman**.

## ⚙️ Config (Admin Panel)
Klik ikon ekstensi → **Admin Panel**. Isi:
- **Ekonomi**: komisi %, break-even CPC, conversion rate
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
- **Panel detail produk**: rating, breakdown bintang, favorit, stok → PRO score;
  **hijau kalau PRO ≥ 75**
- **⬇ Video**: unduh video produk (mp4 langsung)
- **🎬 Prompt Video**: prompt Veo/Gemini 9:16, hook 3 detik, mode HANDS-ONLY untuk
  barang yang bisa dipegang
- **✨ Caption**: satu caption + hashtag FYP, siap copy-paste

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

- **Audit hardening v0.9:** concept win-rate hanya memakai exact Experiment ID;
  broad-tag log lama diabaikan. Product→tag matcher menolak tag generik satu kata.
  Dataset/shortlist writes diserialkan dan storage errors dipermukaan-kan. Data DOM
  Shopee di-escape sebelum HTML, URL dibatasi HTTP(S), dead Shopee API dibuang,
  perhitungan review 4–5★ array diperbaiki, dan saturation scoring lama dihapus.

## 📁 Struktur
```
manifest.json  HANDOFF.md  STATUS.md  DESIGN.md  README.md
src/     20 content script + admin/ + popup/
test/    run-all.sh + 20 test/regression gates
export/  performance-snapshot.json (feedback loop)
assets/  icon16/48/128.png (placeholder)
```
