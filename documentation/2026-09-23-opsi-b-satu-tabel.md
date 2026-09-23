# Perbaikan 2026-09-23 (lanjutan) — Opsi B: gabung Product Table + Shortlist jadi SATU tabel

Laporan Fikri: "product pages dan shortlist kumulatif informasinya redundan, bikin lebih cakep."
Setelah gw tampilkan analisis, Fikri pilih **Opsi B: satu tabel pintar**.

## Kenapa redundan (dari baca source, bukan tebakan)
- `productTable` (halaman ini) & `shortlistSection` (kumulatif) berbagi 6 dari 8 kolom.
- `content.js run()` SUDAH memanggil `RMShortlist.add(a.products, …)` tiap render →
  produk yang tampil di product table detik itu juga sudah jadi baris teratas shortlist.
  Jadi keduanya literally data yang sama, cuma shortlist juga simpan halaman sebelumnya.

## Perubahan
**`src/panel.js`**
- `build()`: buang `productTable(a)`. Panel kini = verdict cards + charts + SATU tabel (shortlist host).
- Hapus dead code `productRow`, `epcCell`, `productTable` (~55 baris).
- `shortlistRow`: tambah kolom **Rating** + kolom **Aksi** (🔗 buka Shopee, ☆ watchlist, ✨ caption);
  nama produk kini drill target (🔍) dengan `data-id`. Kolom "Dari kata kunci" → "Kata kunci",
  prefix internal `cari: ` di-strip di tampilan biar bersih.
- `shortlistSection(meta, expanded, filterKeyword, pageLabel)`: judul jadi "🗂 Riset Produk (kumulatif)";
  tombol **"Halaman ini"** (filter ke produk halaman yang lagi dibuka) + **"Semua produk"**.
- Konsistenkan `global.RMShortlist.stats/ranked` (dulu guard `global.RMShortlist` tapi panggil bare — pecah di konteks terisolasi).

**`src/shortlist.js`**
- Entry simpan `rating` + `unitsPerMonth`. CSV export tambah kolom `rating`, `unitsPerMonth`.

**`src/content.js`**
- `renderShortlist` kirim `pageLabel = observedLabel(lastAnalysis)` ke `shortlistSection`.
- Wire tombol "Halaman ini" (`.rm-sl-page`).
- Handler drill/star/caption: resolve produk dari `lastAnalysis` DULU, fallback ke
  entry shortlist tersimpan (`shortlistEntry(id)`) untuk baris dari scan halaman lama.
  Drill baris lama → buka Shopee link (analisa dalam butuh DOM ke-render).

## Alur baru
Satu tabel riset kumulatif. Default nampilin top-20 (toggle "Tampilkan semua").
"Halaman ini" nyaring ke produk halaman aktif; "Semua produk" balik ke seluruh riset.
Detail per produk (Rating breakdown, Terjual, Stok, Umur listing) tetap di modal drill-down,
bukan lagi kolom tabel — itu yang bikin dua tabel dulu keliatan kembar.

## Verifikasi
- `node --check` semua file lolos.
- Test suite penuh: **28/28 LULUS** ("SEMUA VERIFIKASI LULUS").
- Test yang di-update mengikuti desain baru (bukan regresi): `e2e-shortlist` (judul),
  `e2e-epc-table` (arahkan ke tabel tunggal + hint "scan ulang"), `e2e-browser-bulk`
  (kolom keyword index 7→8, judul, prefix strip), `e2e-browser-category` (index 7→8),
  `e2e-browser-sort` (arahkan ke `.rm-sl-table`).

## Status
- Belum di-tag. Butuh Fikri: reload extension + lihat tabel tunggal di Chrome.
- Push ke main tetap tugas Fikri.

## Tambahan sesi ini (permintaan lanjutan Fikri)
1. **Auto-clear saat Bulk Scan Keyword.** Pencet tombol → shortlist lama dibersihkan
   dulu (`RMShortlist.clear()`), biar hasil scan baru tidak nyampur/rusuh dengan scan
   sebelumnya. Filter direset ke tampilan bersih. (`src/content.js`)
2. **Ikuti pagination, bukan cuma tab.** Untuk keyword spesifik, `runKeywords` kini
   menelusuri halaman hasil (pagination "1 2 3 4 5 …") via `findNextPage()`, bukan hanya
   halaman 1. (`src/bulkscan.js`)
3. **Cap 200 produk.** `MAX_ANALYZE = 200` — penelusuran halaman berhenti begitu total
   produk yang dianalisa mencapai 200, agar keyword besar tidak lari liar / menghajar
   anti-bot Shopee. Karena shortlist di-clear di awal, `total` = produk scan ini saja.
- Suite tetap **28/28 LULUS** setelah ketiga tambahan ini.
