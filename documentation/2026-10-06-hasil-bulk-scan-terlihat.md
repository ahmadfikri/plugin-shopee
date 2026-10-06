# 2026-10-06 — Hasil bulk scan sekarang terlihat — v0.9.19

## Laporan
"Bulk scan jalan, tapi nggak ada yang berubah di UI."

## Bukti dari log aktivitas (v0.9.18, 6 Okt 22:20 WIB)
- Bulk scan berjalan normal: 9 kategori, setiap batch 20 kartu → 20 ter-parse → 20 diberi skor → tersimpan.
- Total riset naik 1217 → 1231 (14 produk baru; sisanya sudah ada dan diperbarui).
- Render tabel: 1231 tersimpan, 20 baris tampil, panel masih terpasang di halaman. Tidak ada error.

## Akar masalah
Data tersimpan, tapi tabel selalu menampilkan **20 teratas dari seluruh 1231 produk kumulatif**.
Karena sebagian besar produk hasil scan sudah ada, dan 14 produk baru skornya di bawah 20 teratas lama,
isi tabel sebelum dan sesudah scan sama persis. Ringkasan akhir juga cuma "Selesai — total 1231 produk",
tidak menyebut berapa yang baru.

## Perbaikan
- `shortlist.js`: setiap produk menyimpan `firstAt` (pertama masuk daftar) dan `run` (ID bulk scan yang terakhir menyentuhnya). Re-save dari observer halaman tidak menghapus tag `run`. `add()` mengembalikan `addedIds`/`seenIds`. Helper `filterItems()` dipakai tabel dan log.
- `bulkscan.js`: `run()` membuat ID run dan menghitung produk **unik** (halaman pembuka dan tab "All" sering sama, jadi jumlah per batch tidak dijumlahkan).
- `content.js`: setelah bulk scan kategori, tabel otomatis pindah ke tampilan **"🆕 Hasil bulk scan terakhir (N baru)"**, semua produk run itu, yang BARU di atas. Ringkasan: "Selesai — X halaman dipindai, Y produk: A BARU, B sudah ada (diperbarui). Total riset Z produk."
- `panel.js` / `panel.css`: badge hijau **BARU** di nama produk. Tombol "Semua produk" kembali ke daftar kumulatif.

## Test
- Baru: `test/e2e-browser-runview.js` (Chromium asli + extension asli). Gagal di kode lama, lulus di kode baru.
- `test/run-all.sh` 34 langkah lulus semua.

## Backup
`*.bak-20261006-runview` untuk shortlist.js, bulkscan.js, content.js, panel.js, manifest.json.
