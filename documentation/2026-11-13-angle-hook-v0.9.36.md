# v0.9.36 — Angle, hook, tempo peluncuran (13 Nov 2026)

Ide diambil dari [dansugc/reverse-engineer-marketing](https://github.com/dansugc/reverse-engineer-marketing)
(MIT, `harness/playbooks/paid-meta.md` + `lessons.md`). Kodenya tidak dipakai: REM
mengambil data lewat API berbayar ScrapeCreators, sedangkan plugin ini tetap membaca
halaman Ad Library sendiri. Sort `total_impressions` milik REM tidak bisa dipakai:
Meta hanya membuka jangkauan untuk iklan di EU / politik.

## Yang baru (`src/fbadlib.js`)
- `angleOf(ad)`: angle dari teks iklan, urutan prioritas: Promo/harga, POV/skit,
  Before/after, Listicle, Perbandingan, Testimoni, Bukti sosial, Masalah, Demo fitur,
  Lainnya. Promo dicatat (`promo: true`) tapi tidak pernah jadi angle utama kalau ada
  angle lain, dan memunculkan peringatan "jangan tiru harga".
- `hookOf(ad)`: baris pertama teks iklan (bukan link/hashtag), harga dibuang, maks 90 karakter.
- `pageVelocity(list)`: per pengiklan: iklan terlihat, aktif, diluncurkan 30 hari
  terakhir, tempo TINGGI (≥10) / SEDANG (4–9) / RENDAH.
- `competitorStats()` menghitung angle di antara iklan TERBUKTI (≥14 hari) per niche,
  `topAngle` = angle terbanyak (minimal 2 iklan, bukan promo/lainnya).
- `polaScore()`: faktor baru **angle = angle TERBUKTI terbanyak di niche ini (+5)**;
  poin "ada link Shopee" turun 10 → 5 supaya total tetap 100. Iklan yang sudah
  berhenti tetap dinilai dari lama tayangnya (diberi label "sudah berhenti").
- `deepPrompt()` (🔬 Analisa dalam) sekarang ikut membawa angle, hook, tempo
  pengiklan, dan angle TERBUKTI terbanyak di niche.

## UI Ad Library
- 🏆 Top iklan: kolom **Angle · hook** (chip angle + hook dalam tanda kutip, label
  "berhenti" untuk iklan non-aktif), tempo pengiklan di kolom Page, dan baris
  **🎯 Angle di N iklan TERBUKTI yang tampil** (ikut filter niche).
- 🧬 kotak Analisa pola: hook, angle, dan tempo peluncuran pengiklan.

## Tes
- `test/e2e-pola-champion.js`: 8 contoh angle, promo tidak jadi angle utama,
  hook membuang link/harga dan dipotong 90 karakter, tempo per pengiklan, bonus
  angle +5 hanya kalau cocok, total poin tetap 100, prompt membawa angle/hook/tempo.
- `test/e2e-browser-fbadlib.js` (Ad Library live): chip angle di tiap baris Top iklan,
  header "Angle · hook", kotak pola menampilkan hook + tempo.

## Batasan
- Angle ditebak dari kata kunci teks, bukan dari video. Iklan yang teksnya pendek
  masuk "Lainnya".
- Taksonomi angle belum divalidasi ke ROAS kita sendiri. Bobotnya sengaja kecil (+5).
  Setelah ada cukup campaign yang ditandai angle-nya, cek ulang apakah angle
  benar-benar membedakan pemenang (seperti hook rate yang ternyata tidak).
