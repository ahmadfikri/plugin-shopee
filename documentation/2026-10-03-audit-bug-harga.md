# 2026-10-03 — Audit bug plugin — v0.9.17

Full suite (30 langkah, termasuk 6 test Chromium asli) sudah hijau SEBELUM perubahan,
jadi audit dilakukan dengan membaca kode. Bug yang ditemukan & diperbaiki (src/ai.js):

1. **Larangan harga hanya di prompt, tidak di output.** AI tetap bisa menulis "Rp39.000",
   "25rb", "diskon 50%", "#hargamurah"/"#promo". Ditambah `stripPrice()` yang
   membersihkan caption (di ensureHashtags) dan prompt video (hasil generateVideoPrompt).
   Persen non-diskon ("100%") dan hashtag biasa tetap utuh.
2. **Template video custom tanpa `{{context}}`** kehilangan data produk DAN larangan harga.
   Sekarang otomatis ditambah "Data produk: {{context}}" (sama seperti jalur caption).
3. **`{{price}}` tidak diganti di jalur video** — tersisa sebagai teks literal. Sekarang kosong.

Koreksi info: di Admin Panel TIDAK ada field "Video prompt" (hanya Prompt Caption & Tag),
dan default-nya selalu kosong, jadi template video bawaan selalu dipakai.

Test baru: test/e2e-price-guard.js (gagal di kode lama, lulus di kode baru), masuk run-all.sh #30.
Backup: src/ai.js.bak-20261003-audit
