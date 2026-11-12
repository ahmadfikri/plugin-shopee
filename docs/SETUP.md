# Setup syabab-affiliathor

Panduan pasang dari nol sampai semua fitur jalan. Butuh: Google Chrome (atau
Chromium), dan Node.js kalau mau menjalankan test. Tidak ada backend, tidak ada
`npm install`.

## 1. Ambil kode

```bash
git clone https://github.com/ahmadfikri/plugin-shopee.git
cd plugin-shopee
```

Kode ekstensi ada di root repo ini (folder yang berisi `manifest.json`).

## 2. Pasang di Chrome

1. Buka `chrome://extensions`.
2. Nyalakan **Developer mode** (pojok kanan atas).
3. Klik **Load unpacked**, pilih folder yang berisi `manifest.json`.
4. Kartu **syabab-affiliathor** muncul. Pin ikonnya di toolbar supaya gampang dibuka.

Setiap kali kode berubah (`git pull`): klik **⟳** di kartu ekstensi, **lalu refresh**
tab Shopee / Ad Library. Content script tidak ter-update sendiri.

## 3. Isi config (Admin Panel)

Klik ikon ekstensi → **Admin Panel**. Klik **Simpan** setelah mengubah apa pun.
**Reset ke default** mengembalikan semua nilai di tabel di bawah.

Semua config tersimpan di `chrome.storage.local` browser itu sendiri (key
`rm_config`). Tidak pernah dikirim ke server mana pun selain DeepSeek (khusus
teks prompt, kalau AI dinyalakan).

### 3a. Ekonomi

| Field | Default | Isi dengan | Dipakai untuk |
|---|---|---|---|
| Komisi Shopee (%) | `3.5` | rata-rata % komisi produk yang biasa kamu iklankan | estimasi nilai per klik |
| Break-even CPC (Rp) | `100` | batas bayar per klik yang masih untung | vonis "Layak Iklan" dan Max CPC |
| PPN Meta efektif (%) | `11` | PPN 12% × DPP 11/12. Ditagih **di luar** "Amount spent" | Max CPC & ROAS setelah pajak |
| Pajak payout Shopee / WHT (%) | `2.5` | PPh 5% × 50%, dipotong saat payout | Max CPC & ROAS setelah pajak |
| Conversion rate (%) | `4.0` | klik → order. Data akun kita sekitar 5% | estimasi nilai per klik |
| Momentum: umur maks (bulan) | `3` | produk lebih muda dari ini dianggap baru | label momentum (tampilan saja) |
| Momentum: min terjual/bln | `100` | penjualan per bulan minimum | label momentum (tampilan saja) |

Impas setelah pajak = (1 + PPN) / (1 − WHT) = 1,11 / 0,975 ≈ **ROAS kotor 1,14**.

### 3b. AI (DeepSeek) — wajib untuk Caption, Prompt Video, Brief kreatif

| Field | Default | Isi dengan |
|---|---|---|
| Aktifkan AI | mati | centang setelah API key diisi |
| Affiliate ID | `11300901968` | ID affiliate Shopee kamu (angka setelah `an_` di short-link). Dipakai membuat short-link `s.shopee.co.id/an_redir?...&sub_id=<tag>` di bawah caption |
| API Key | kosong | key dari [platform.deepseek.com](https://platform.deepseek.com/) → API Keys. Formatnya `sk-...` |
| Model | `deepseek-chat` | biarkan |
| Base URL | `https://api.deepseek.com/v1/chat/completions` | biarkan |
| Prompt Caption | kosong | **biarkan kosong**. Kosong = pakai template bawaan (SEO + engagement tanpa bait, tanpa harga, tanpa rating, disclaimer). Isian di sini **menimpa** template bawaan; guard harga/rating/bait tetap jalan |
| Prompt Tag | template bawaan | biarkan |

Jangan commit API key ke repo dan jangan tempel di chat. Key hanya disimpan di
browser lewat Admin Panel.

### 3c. Feedback Loop (opsional, sangat disarankan)

Membuat Max CPC pakai **EPC nyata** dari akunmu, bukan asumsi.

1. Di folder `analisis/` (pipeline dashboard), jalankan:
   ```bash
   python export_perf_snapshot.py
   ```
   Hasilnya `riset-plugin/export/performance-snapshot.json`. Lokasi bisa diubah
   lewat argumen `export_perf_snapshot.py [ANALISIS_DIR] [OUT_JSON]` atau env
   `SYABAB_ANALISIS_DIR` / `SYABAB_SNAPSHOT_OUT`.
2. Tempel isi file itu ke **Snapshot JSON** → **Impor Snapshot**.
3. Ulangi tiap minggu supaya angkanya ikut data terbaru.

### 3d. Learning Ledger, Data Training, Tampilan

| Field | Default | Keterangan |
|---|---|---|
| Kumpulkan otomatis | nyala | simpan fitur produk tiap buka halaman produk / listing |
| Nama/ID Kontributor | kosong | label asal data waktu export (mis. `fikri`) |
| Tampilkan grafik | nyala | grafik di panel |

Ledger dan dataset bisa di-export CSV/JSON dari Admin Panel. Tidak ada yang perlu
diisi supaya fitur lain jalan.

## 4. Halaman yang dipakai plugin

| Halaman | Yang muncul |
|---|---|
| `affiliate.shopee.co.id/offer/product_offer` | panel analisa, PRO SCORE, Max CPC, Bulk Scan, Shortlist |
| halaman produk `shopee.co.id/...` | panel detail produk, ⬇ Video, 🎬 Prompt Video, ✍️ Caption, 🚀 Launch pack |
| `facebook.com/ads/library` | bar 🎬 syabab (kanan bawah): filter niche, ⬇ Download video HD, 🧬 Analisa pola, 🏆 Top iklan → 🔍 Analisa produk TERBUKTI, 📒 pelacak kompetitor, ✍️ brief |
| TikTok | downloader video |

## 5. Cek pemasangan

```bash
bash test/run-all.sh
```

Harus berakhir `SEMUA VERIFIKASI LULUS`. Test browser (`e2e-browser-*`) butuh
Playwright/Chromium dan koneksi internet; kalau Playwright tidak ada, test itu
dilewati. Test yang membuka halaman live (Ad Library, TikTok) bisa gagal kalau
isi halamannya berubah atau jaringan lambat, bukan karena kode rusak.

## 6. Masalah umum

| Gejala | Solusi |
|---|---|
| Panel / bar tidak muncul | ⟳ di `chrome://extensions`, lalu refresh tab |
| Tombol Caption bilang AI mati | isi API Key + centang Aktifkan AI, Simpan |
| Caption tanpa short-link, ada peringatan Affiliate ID | isi Affiliate ID, Simpan |
| Short-link gagal dibuat | buka dari halaman produk Shopee (URL produk harus terbaca) |
| Caption masih gaya lama | kosongkan **Prompt Caption**, Simpan |
| 🔍 Analisa produk TERBUKTI tidak ada | scroll Ad Library sampai muncul iklan ≥14 hari dengan link Shopee |
