# syabab-affiliathor — STATUS (2026-09-13, akhir sesi)

Chrome MV3 extension, 14 content script, self-contained (tanpa backend, tanpa
dependency npm). Verifikasi: `bash test/run-all.sh` → harus `SEMUA VERIFIKASI LULUS`.

👉 **Sesi/device baru: baca `HANDOFF.md` lebih dulu.**

## FILOSOFI (menentukan semua desain skor)
Fikri = **click-arbitrage affiliate**: untung dari KLIK yang jadi komisi, tidak
peduli barangnya apa. Saturasi pasar / pangsa pasar / kesegaran listing sudah
DIBUANG dari scoring. Angka terpenting: **Max CPC**.

## MESIN SKOR (`src/proscore.js`) — 4 pilar
| Pilar | Bobot | Isi |
|---|---|---|
| CLICK ECONOMICS | 35% | → **Max CPC**. Pakai **EPC nyata** kalau ada snapshot; kalau tidak, rumus asumsi |
| CLICK APPEAL | 30% | harga impulse, ada video, diskon, social proof |
| CONVERSION TRUST | 25% | rating, jumlah review, % bintang 4-5, official |
| PROVEN DEMAND | 10% | terbukti laku |

Hard gate: **zero-converter** (mirip tag yang terbukti 0 order) · ekonomi klik lemah ·
rating <3,8. Aksi: ≥70 IKLANKAN · ≥55 LAYAK COBA · ≥40 HATI-HATI · <40 LEMAH · gate → SKIP.

## FITUR YANG SUDAH JADI
1. **MODE A — halaman detail produk**: scrape DOM ter-render (rating, breakdown
   bintang, sold, favorit, stok) → panel analisa inline. **HIJAU kalau PRO ≥ 75**.
2. **MODE B — halaman listing offer**: header ringkasan aksi (N iklankan/coba/lewati,
   kandidat terbaik, Max CPC tertinggi) + 2 chart ranking (PRO score & Max CPC,
   ber-nama produk) + tabel PRO score + Shortlist Kumulatif.
3. **FEEDBACK LOOP** (`src/perf.js`) — impor snapshot performa nyata; Max CPC
   dikalibrasi dari **EPC terukur** (rumus melebihkan ~2,4x); produk mirip
   zero-converter di-gate SKIP; label basis ✅ tag / ~ global / ⚠️ asumsi.
4. **BULK SCAN** (`src/bulkscan.js`) — klik tab kategori sendiri, jeda 2,5s,
   opsi telusuri paginasi, progress live, tombol Stop, disimpan tiap batch.
5. **SHORTLIST KUMULATIF** (`src/shortlist.js`) — akumulasi lintas halaman,
   dedup per id, **top 20** default + **"Tampilkan semua (N)"**, export CSV, kosongkan.
6. **Unduh video** — Shopee sajikan `.mp4` LANGSUNG, jadi one-click download jalan.
7. **Prompt video Veo/Gemini** — 2 template (HANDS-ONLY+beat untuk barang yang bisa
   dipegang, presenter untuk lainnya), hook 3 detik jadi prioritas tertinggi,
   presenter dipilih AI sesuai target pasar, berupa PERINTAH siap-eksekusi.
8. **Caption** — SATU caption + 8–12 hashtag (termasuk FYP), teks biasa, siap paste.
9. **Admin Panel** — ekonomi, ambang, DeepSeek (key/model/prompt), impor snapshot.
10. **Scheduler tahan-banting** — MAX_WAIT, re-entrancy guard, suspend, retry.

## RIWAYAT PERBAIKAN PENTING (jangan diulang)
- **Panel sering tidak muncul**: debounce di-reset tiap mutasi DOM (Shopee React SPA
  bermutasi terus) → ditambah **MAX_WAIT 2,5s** + jaring pengaman retry.
- **Panel dibangun 2x**: blok "enrich lalu rebuild" menghapus panel pertama dan
  mengosongkan shortlist → blok itu DIHAPUS (enrich sudah dimatikan).
- **Bulk scan kacau**: observer membangun ulang panel di tengah crawl → **suspend()**.
- **Bulk scan KEDUA mandek** (harus reload tab): suspend/resume boolean + handler
  tidak menunggu `run()` in-flight → render telat menimpa panel & blank shortlist.
  Fix: `suspendDepth` counter, `waitIdle()`, guard `if(suspended)return` setelah
  `await loadCfg()`, dan tampilkan `{error}` RMBulk. Dikunci `test/e2e-rescan.js`.
- **Caption tetap 3 variasi** walau template diubah: config LAMA tersimpan di
  `chrome.storage` menang atas template baru → ditambah **migrasi otomatis** di
  `storage.js` yang mengosongkan prompt default lama.
- **Auto-fetch API Shopee** memicu CAPTCHA anti-bot → `fetchOne` dimatikan permanen.
- **Navigasi otomatis (playwright) ke halaman produk kena CAPTCHA**, tapi kalau
  Fikri sendiri yang membuka halaman → aman. Kalibrasi selector harus lewat halaman
  yang dia buka manual.

## TES
`test/run-all.sh` menjalankan: syntax semua JS · validasi manifest · cek semua file
yang dirujuk manifest ada · `e2e.js` (pipeline) · `e2e-feedback.js` (kalibrasi) ·
`e2e-shortlist.js` (bulk scan) · `e2e-scheduler.js` (determinisme).

## BELUM SELESAI
Lihat `HANDOFF.md` §10 — ringkasnya: bulk scan belum diuji live, sold/bulan belum
dibawa ke MODE A, umur listing & lokasi toko masih "?", nama toko di parent element,
ikon placeholder, DeepSeek belum diuji live, Link Builder + Shopee Open API belum dibangun.
