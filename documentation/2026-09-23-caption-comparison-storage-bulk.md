# Perbaikan 2026-09-23 — caption, comparison harga, error storage, bulk search

Laporan dari Fikri:
1. "caption kek idiot message-nya" — caption hasil generate norak/lebay.
2. "comparison engine kacau kalau compare harga, jangan terlalu ekstrim, buat apa adanya".
3. Error console: `return new Promise((r) => chrome.storage.local.remove(KEY, r));`
4. "bulk search didn't work".

Semua diagnosa dari membaca source langsung (bukan tebakan). 4 file JS lolos `node --check`.
Test suite: 26/27 lulus; 1 gagal (test 25 sort) ADALAH FLAKY browser (Shopee kadang
redirect fixture ke halaman item) — di-rerun langsung LULUS; tidak menyentuh kode yang diubah.

---

## 1. Caption "kek idiot" — `src/ai.js` (`DEFAULT_CAPTION_PROMPT`)

**Akar masalah:** prompt lama menyuruh model pakai *"nada bestie"* tanpa rem, jadi
hasilnya alay/hard-selling.

**Perubahan:** tone diganti jadi "santai dan WAJAR seperti orang biasa cerita",
eksplisit melarang hiperbola ('GILA', 'auto sultan', 'terbaik sedunia', 'wajib punya
atau nyesel'), kapital berlebihan, dan emoji bertumpuk. Ditambah aturan HARGA & DISKON:
angka HANYA jika ada di data produk; dilarang mengarang harga/diskon/persentase hemat/
perbandingan 'biasanya Rpxxx sekarang Rpxxx'.

## 2. Comparison harga ekstrim — `src/concepts.js`

**Akar masalah:** dua concept archetype secara aktif MENYURUH klaim harga mengada-ada:
- `price_shock` (lama): *"harga spesifik yang tak masuk akal murahnya"*, hook *"Rp15.000 doang tapi…"*.
- `comparison` (lama): *"adu yang murah vs yang mahal"*, hook *"yang Rp20rb vs Rp200rb"*.

Karena angka-angka itu tidak ada di data, model mengarang → klaim harga bohong/ekstrim.

**Perubahan:**
- `price_shock` → **"Harga apa adanya"**: tampilkan angka ASLI dari data, jangan
  membesar-besarkan, jangan klaim 'termurah'/'tak masuk akal'.
- `comparison` → **"Perbandingan wajar"**: bandingkan CARA/HASIL pakai vs cara lama
  (bukan adu harga karangan), dilarang mengarang angka 'murah vs mahal'.

## 3. Error `chrome.storage.local.remove(KEY, r)` — `src/perf.js` & `src/shortlist.js`

**Akar masalah:** `clear()` melempar callback resolver `r` langsung ke
`chrome.storage.local.remove`. Callback dipanggil TANPA membaca
`chrome.runtime.lastError`, sehingga Chrome memunculkan error
**"Unchecked runtime.lastError"** di console (itu error yang Fikri lihat).
Bandingkan dengan `concepts.js` / `perf.save()` yang sudah benar (baca lastError).

**Perubahan:** callback sekarang membaca (mengkonsumsi) `chrome.runtime.lastError`
lalu resolve, di kedua file. Kosongkan shortlist / clear snapshot tidak lagi
melempar ke console.

## 4. Bulk search "gak jalan" — perlu cek LIVE di Chrome (belum bisa dipastikan dari source)

Kode `runKeywords()` di `src/bulkscan.js` + handler `.rm-sl-kwscan` di `content.js`
terlihat lengkap dan benar secara logika. Penyebab paling mungkin bulk search gagal
adalah **runtime, bukan bug logika**:
- `findSearchInput()` tidak menemukan kotak search di halaman yang dibuka
  (halaman bukan Product Offer / selector Shopee berubah), ATAU
- React menelan Enter/klik saat input di-remount (sudah ada 1x retry), ATAU
- extension belum di-reload sehingga masih pakai build lama.

**Rencana besok (sesuai instruksi Fikri):** buka Chrome asli Fikri via Computer Use /
playwright-cli attach, buka halaman Product Offer yang dia pakai, jalankan Bulk Scan
Keyword sambil lihat console + panel LANGSUNG untuk menentukan di titik mana ia gagal —
bukan menebak dari test.

## Status
- v0.9.7 → perubahan ini belum di-tag. Butuh Fikri: reload extension + test caption/comparison.
- Push ke main tetap tugas Fikri (`git push origin main:main` diblokir policy dari sisi agent).
