# Dokumentasi disegarkan ke v0.9.32 (7 Nov 2026)

Tidak ada perubahan kode. Hanya dokumen.

## Yang diubah
| File | Perubahan |
|---|---|
| `README.md` | Judul v0.9.32, daftar fitur v0.9.25–0.9.32 (panel produk, niche/Thompson, Gahwa Pack, Launch pack, Ad Library, TikTok, payout, log aktivitas), config pajak + affiliate ID, struktur repo, alur branch, catatan tes live dan file `Icon` dari Google Drive |
| `STATUS.md` | Header 2026-11-07 / v0.9.32, status tes 49/50, ringkasan fitur #17–#27, aturan rilis lewat PR (bukan `integration` + tag), daftar tes yang bergantung data live |
| `HANDOFF.md` | Bagian v0.9.28–v0.9.32 + status repo & rilis |

## Status tes saat dokumentasi ini ditulis
`bash test/run-all.sh` di `main` (c0f33bb): **49 dari 50 langkah lulus**.

Langkah 49 (`test/e2e-browser-fbadlib2.js`) gagal:
```
The input did not match the regular expression /6 iklan baru/.
Input: '📒 Sejak kunjungan 2026-10-29: 5 iklan baru ...'
```
Penyebab: tes membuka halaman Ad Library **live** Beyond.shopcart dan mengharapkan
6 iklan aktif. Sekarang halaman itu menampilkan 5. Pelacaknya sendiri bekerja
benar: 5 iklan baru dan 1 tidak terlihat lagi terdeteksi. Ini masalah tes yang
bergantung data live, bukan bug plugin.

Usulan perbaikan (belum dikerjakan): hitung jumlah iklan yang benar-benar tampil
lalu bandingkan dengan angka itu, atau ganti halaman live dengan fixture.

## Repo
- `release/v0.9.0` di-fast-forward dari v0.9.0 (2d6af4f) ke `main` (c0f33bb) pada 7 Nov.
- `git fetch` sempat gagal `bad object refs/Icon?`: Google Drive menaruh 252 file
  `Icon\r` kosong di `.git` (6 Nov). File itu dipindahkan keluar `.git`, fetch normal.
