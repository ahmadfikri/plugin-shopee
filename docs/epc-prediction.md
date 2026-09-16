# EPC Prediction — Logika, Bobot, dan Baseline

Dokumen ini menjelaskan **cara kerja skor EPC** di panel detail produk
syabab-affiliathor: dari mana angkanya, bobotnya apa, dan kenapa metode ini yang
dipilih (bukan yang lain). Ditulis 2026-09-14.

---

## 1. Kenapa ada skor EPC (dan kenapa PRO score saja tidak cukup)

**PRO score** adalah penjumlahan berbobot manual (click economics 35% + click
appeal 30% + conversion trust 25% + proven demand 10%). Bobot itu **ditebak
manusia**, bukan dipelajari dari data. PRO score tidak memprediksi apa pun — skor
72 tidak berarti "72% peluang untung".

**EPC score** menjawab pertanyaan Fikri yang sebenarnya:

> "Kalau produk ini aku iklankan, kira-kira dapat berapa rupiah per klik, dan
> berapa peluangnya menutup biaya klikku?"

Jawabannya berupa **angka + rentang keyakinan + P(untung)**, dihitung dari data
performa Fikri sendiri (snapshot yang diimpor via Admin Panel → Feedback Loop).

---

## 2. Metode: Empirical Bayes (shrinkage)

### Kenapa Empirical Bayes, bukan machine learning

Dataset Fikri saat ini **~28–33 tag berlabel, 8 hari data**. Itu **terlalu kecil**
untuk gradient boosting / neural net — model kompleks di data kecil akan
**overfit** dan memberi prediksi palsu yang terlihat meyakinkan. Empirical Bayes
adalah alat yang **benar** untuk "memperkirakan sebuah rate ketika sebagian item
punya banyak data dan sebagian sedikit" — persis bentuk masalah ini.

(Model ML — Gradient Boosted Trees — baru jujur dibangun setelah dataset produk
mencapai ratusan baris. Itu sebabnya ada tombol **💾 Simpan Data Training**: tiap
capture menumbuhkan dataset sampai cukup besar. Sampai saat itu, Empirical Bayes.)

### Rumus inti

```
realized_epc[tag] = commission[tag] / clicks[tag]      (angka mentah, berisik kalau klik sedikit)
global_epc        = total_commission / total_clicks    (rata-rata global = "prior")

shrunk_epc[tag]   = (clicks × realized_epc + K × global_epc) / (clicks + K)
```

`shrunk_epc` inilah **prediksi** yang ditampilkan.

### K — kekuatan shrinkage (bobot penentu)

`K` = **berapa banyak klik bukti yang dibutuhkan** sebelum kita lebih percaya
angka tag itu sendiri daripada rata-rata global.

- **K = median jumlah klik per tag** (dibatasi 10–200).
- Tag dengan klik = K → prediksi ditimbang **~50/50** antara angka sendiri dan global.
- Tag dengan klik ≫ K → prediksi **hampir sepenuhnya** angka sendiri (bukti kuat).
- Tag dengan klik ≪ K → prediksi **ditarik keras ke global** (bukti lemah).

Ini adalah **posterior mean** dari model Normal-Normal / Beta-Binomial,
disederhanakan untuk sebuah rate. Bukan bobot karangan — K dihitung dari sebaran
data Fikri sendiri.

### Contoh nyata (dari data 13 Sep, K≈195)

| Tag | Klik | EPC mentah | EPC prediksi | Kenapa |
|---|--:|--:|--:|---|
| **PolkadotMag** | 15 | Rp 1.978 | **Rp 251** | Data tipis + 1 order CCTV gede → ditarik keras ke global. Tidak boleh percaya Rp 1.978 |
| **KupuA17** | 343 | Rp 5 | **Rp 47** | Klik banyak mengonfirmasi jelek → tetap rendah |
| **metal** | 267 | Rp 154 | **Rp 139** | Bukti cukup → dekat angka sendiri |
| **produk baru** | 0 | — | **Rp 119** (global) | Belum ada bukti → pakai prior, rentang lebar |

---

## 3. Ketidakpastian (confidence range)

Prediksi tunggal menipu kalau tidak ada rentangnya. Kita hitung **standard error**:

```
se = global_epc / sqrt(clicks + K)
epc_low  = epc − 1.28 × se     (~batas bawah 80%)
epc_high = epc + 1.28 × se     (~batas atas 80%)
```

- Klik sedikit → `se` besar → rentang **lebar** (jujur "belum tahu").
- Klik banyak → `se` kecil → rentang **sempit** (yakin).

Label keyakinan di panel:
- **tinggi** — klik ≥ 3×K
- **sedang** — klik ≥ K
- **rendah** — ada tag tapi klik < K
- **sangat rendah** — produk baru, tanpa riwayat (pakai prior global)

---

## 4. P(untung) — angka paling penting

Kalau `breakEvenCPC` (biaya klik impas) diisi di Admin Panel, kita hitung
**peluang EPC melebihi biaya klik**:

```
z = (epc − breakEvenCPC) / se
P(untung) = Φ(z)          (Φ = CDF normal standar)
```

Ini angka 0–100% yang **langsung bisa dipakai**: "produk ini 95% kemungkinan
menghasilkan lebih per klik daripada biayanya" (metal) vs "0%" (KupuA17).

---

## 5. Skor EPC 0–100 (untuk ditampilkan di sebelah PRO score)

Skor **bukan** pembobotan arbitrer baru. Ia transformasi monoton:

- **Kalau breakEvenCPC diketahui:** `skor = P(untung) × 100`. Jadi skor 65 = 65%
  peluang untung. Jujur dan langsung terbaca.
- **Kalau tidak:** skor = EPC relatif terhadap 2× global (100 = dua kali rata-rata earner).

**Gate keras:** tag yang **terbukti zero-converter** (≥25 klik, 0 order) → skor
di-cap maksimum 15, aksi **SKIP**. Ini menimpa semua perhitungan lain.

Band aksi:
- ≥65 **IKLANKAN** · ≥50 **LAYAK COBA** · ≥35 **HATI-HATI** · <35 **LEMAH** ·
  zero-converter → **SKIP**

---

## 6. Baseline & sumber data

- **Prior (global_epc, global_conv):** dari `snapshot.global` = total komisi /
  total klik seluruh riwayat. Ini "tebakan terbaik" untuk produk tanpa riwayat.
- **Per-tag:** dari `snapshot.tags[tag]` = klik, order, komisi, EPC realized.
- **Pencocokan produk → tag:** `RMPerf.matchTag(name)` mencocokkan nama produk ke
  tag historis lewat kata kunci (camelCase-split). Hanya tag `trusted` (≥25 klik)
  yang boleh memengaruhi keputusan.
- **breakEvenCPC:** dari config Admin Panel (biaya klik impas Fikri).

Snapshot disegarkan dengan menjalankan `analisis/export_perf_snapshot.py` setelah
tiap ingest harian, lalu impor JSON-nya via Admin Panel → Feedback Loop.

---

## 7. Batas jujur (jangan overclaim)

1. **~33 tag masih kecil.** Empirical Bayes menangani ini dengan benar (menarik ke
   prior), tapi jangan percaya prediksi tag berklik-sedikit secara mutlak — lihat
   rentangnya, bukan cuma titik tengahnya.
2. **Prediksi produk BENAR-BENAR baru** (tanpa tag cocok) hanya sebaik prior
   global — pada dasarnya "rata-rata". Untuk lebih baik dari itu butuh model
   fitur→EPC, yang butuh dataset lebih besar (sedang dikumpulkan via tombol
   Simpan Data Training).
3. **Tidak ada ML di sini** — dan itu disengaja. ML di 33 baris = overfit.

---

## 8. File terkait

- `src/epc.js` — implementasi (`build`, `predict`, `score`)
- `src/dataset.js` — kolektor data training untuk model masa depan
- `src/content.js` (MODE A) — menghitung prediksi & mengirim ke panel
- `src/panel.js` (`buildDetailModal`) — menampilkan kartu EPC SCORE + baris prediksi
- `test/e2e-epc.js` — tes yang mengunci perilaku shrinkage di angka nyata
