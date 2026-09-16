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
    satu per satu dan **menunggu hasil benar-benar ter-render** sebelum lanjut
    (guard anti-bot Shopee)
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
- **Bulk Scan Keyword** baru dibangun, **belum diuji live** — lihat `HANDOFF.md` §10.
- Ikon masih placeholder.

## 📁 Struktur
```
manifest.json  HANDOFF.md  STATUS.md  DESIGN.md  README.md
src/     14 content script + admin/ + popup/
test/    run-all.sh + 4 test e2e + fixture
export/  performance-snapshot.json (feedback loop)
assets/  icon16/48/128.png (placeholder)
```
