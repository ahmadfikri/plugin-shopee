# v0.9.30 — Sinyal iklan kompetitor yang untung + affiliate ID default (30 Okt 2026)

## 1. Sinyal "iklan untung" di Meta Ad Library
Tiap kartu iklan dapat badge, dan bar kanan bawah punya tombol **"🏆 Top iklan"**.

**Dasar logika:** orang tidak membayar iklan rugi berminggu-minggu. Jadi lama tayang adalah sinyal publik terkuat bahwa iklan itu untung. Banyak variasi dari kreatif yang sama (`collation_count`) berarti pengiklan sedang men-scale.

| Badge | Syarat |
|---|---|
| 🏆 TERBUKTI | tayang ≥ 14 hari |
| 📈 MENJANJIKAN | 7-13 hari |
| 🆕 BARU | < 7 hari |
| + SCALING | ≥ 3 variasi |

- Hari tayang = `start_date` sampai `end_date` (hari terakhir terlihat aktif), inklusif.
- Skor urut = hari × (1 + 0,25 per variasi tambahan, maks 9).
- Panel Top iklan: maks 60 iklan berurut skor, link Shopee dari iklan (buka → panel plugin di halaman produk langsung kasih vonis EPC), tombol download video per baris.
- Export JSON sekarang berurut skor dan menyertakan `signal` + `shopeeLink`.

**Batasan:** ini proxy, bukan data profit. Pengiklan bermodal besar bisa membiarkan iklan rugi jalan lama. Selalu validasi produknya pakai panel EPC sebelum bikin campaign.

## 2. Affiliate ID default `11300901968`
- Diverifikasi 30 Okt dari short-link aktif Fikri (`utm_source=an_11300901968`).
- Config lama yang menyimpan `affiliateId: ""` otomatis terisi (via `migrate()` di `src/storage.js`). ID yang diisi manual di Admin Panel tidak pernah ditimpa.

## 3. Bersih-bersih
- 64 file `*.bak-*` dipindah (bukan dihapus) ke `/Users/clawbot/Downloads/syabab-afliathor/_arsip-backup-plugin/2026-10-30/` dengan daftar di `MANIFEST.txt`. Riwayat lengkap tetap di git.
- `.gitignore` menambah `*.bak-*`.

## Verifikasi
`bash test/run-all.sh` → SEMUA VERIFIKASI LULUS (46 langkah). Browser asli, halaman Beyond.shopcart: 6 badge (🏆 15 hari, 📈 8 hari, 🆕 5 hari, ...), panel Top iklan 6 baris dengan 6 link Shopee. Tes baru: `test/e2e-affid-default.js`.
