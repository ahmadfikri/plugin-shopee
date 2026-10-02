# 2026-10-02 — LARANGAN HARGA di prompt video & caption (v0.9.15)

**Aturan Fikri:** JANGAN pernah bicara soal harga di prompt video maupun caption.

**Perubahan:**
- `src/ai.js` `productContext()`: harga TIDAK lagi dikirim ke AI (pola sama dengan jumlah terjual); diganti baris "LARANGAN HARGA: ..." (no Rp, diskon, potongan, promo, % hemat, 'murah', 'terjangkau', 'harga miring', perbandingan harga).
- Caption prompt: aturan lama "HARGA & DISKON: sebut angka hanya jika ada di data" diganti LARANGAN HARGA.
- Prompt video default (presenter) + hands-only: ditambah LARANGAN HARGA eksplisit.
- Larangan rating tidak lagi menyarankan "angkat sisi harga".
- Placeholder `{{price}}` sekarang selalu kosong (melindungi template custom di Settings juga).
- `src/concepts.js`: konsep `price_shock` ("Harga apa adanya") DIHAPUS dari rotasi. Kode `pr` tetap di experiment.js untuk baris ledger lama.
- `test/e2e-rating-gate.js`: diperbarui — sekarang mewajibkan harga TIDAK ada di konteks + larangan harga ada.
- manifest 0.9.14 → 0.9.15

**Tidak berubah:** kolom Harga di panel/tabel riset (data riset untuk Fikri, bukan konten iklan).

**Verifikasi:** semua 31 test e2e (termasuk 6 test browser Chromium asli) PASS.
**Backup:** `src/ai.js.bak-20261002-price`, `src/concepts.js.bak-20261002-price`, commit sebelumnya fc8a28b.
