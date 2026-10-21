# 2026-10-09 — Rating tidak boleh disebut lagi — v0.9.20

Permintaan Fikri: plugin jangan sebut rating lagi. Berlaku untuk konten yang DIHASILKAN
(caption + prompt video). Rating di panel riset/skor/dataset tidak disentuh.

Sebelumnya: aturan "bukti sosial hanya rating, dan hanya kalau >= 4.8".

Perubahan (src/ai.js):
1. `productContext()` tidak pernah mengirim rating ke AI (nilai berapa pun) + selalu
   menambah `LARANGAN RATING`.
2. Konstanta `RATING_BAN` dipakai di semua template: video presenter, video hands-only,
   caption. Kalimat "boleh manfaatkan RATING" / "CUKUP RATING saja" dihapus.
3. `stripRating()` menegakkan di OUTPUT (caption via ensureHashtags, prompt video):
   "rating 4.9", "4.9/5", emoji bintang, "bintang 5", "ribuan/2rb review", #rating*.
   Jalan SEBELUM stripPrice (kalau tidak, "2rb review" dimakan pola harga dulu).
   Angka non-rating ("5 pilihan") dan hashtag biasa utuh.
4. Prompt tersimpan di chrome.storage yang masih menyuruh pakai rating tetap aman:
   rating tak dikirim ke model + ban di konteks + output di-scrub.

Test: `test/e2e-rating-gate.js` ditulis ulang (gate >= 4.8 diganti larangan total).
Suite penuh lulus. HANDOFF.md bagian 5 diperbarui.
