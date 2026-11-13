# syabab-affiliathor — STATUS (2026-11-13, v0.9.36)

Chrome MV3 extension, content scripts + service worker, self-contained (tanpa
backend, tanpa dependency npm). Verifikasi: `bash test/run-all.sh` (53 langkah) →
harus `SEMUA VERIFIKASI LULUS`. Panduan pasang + config: `docs/SETUP.md`.

**Status tes per 12 Nov 2026:** 52/53 hijau. Langkah 49 (`e2e-browser-fbadlib2.js`)
merah karena halaman Ad Library live Beyond.shopcart menampilkan 5 iklan,
sedangkan tes mengharapkan 6. Kode plugin tidak berubah; yang berubah data live.
Detail: `documentation/2026-11-12-v0.9.33-v0.9.35.md`.

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
8. **Caption** — SATU caption + 6–9 hashtag terstruktur, teks biasa, siap paste.
9. **Admin Panel** — ekonomi, ambang, DeepSeek (key/model/prompt), impor snapshot.
10. **Scheduler tahan-banting** — MAX_WAIT, re-entrancy guard, suspend, retry.
11. **Experiment ID zero-typing (v0.9)** — satu ID otomatis = nama campaign Meta
    = tag Shopee; caption/video reuse satu konsep+ID, `Eksperimen Baru` merotasi,
    hipotesis otomatis masuk Learning Ledger.
12. **Campaign Registry XLSX** — pipeline membuat `campaign_registry.xlsx`
    otomatis saat dashboard rebuild; kolom manual aman, performa/alias direfresh.
13. **Gemini fidelity contract** — maksimal 3 shot, identitas produk terkunci,
    larangan morph/duplikasi/jari ekstra; casing mengunci rear hemisphere dan cutout.
14. **Bulk keyword hardened** — selector input/tombol lokal, signature multi-card,
    transition gate, stale-result skip, retry satu kali untuk React submit.
15. **Latest-keyword lower table + Sort ↕** — setelah bulk keyword, tabel bawah
    menampilkan batch terakhir (bukan top-20 global yang terlihat stale); tombol
    kembali ke seluruh shortlist. Semua header bisa sort asc/desc.
16. **Audit hardening selesai** — exact concept attribution, strict tag matching,
    serialized storage writes + visible errors, escaped DOM/HTTP-only links,
    correct array 4–5★, dead saturation scoring dan dead Shopee API dihapus,
    detail price scan dipersempit.

### v0.9.14 – v0.9.35 (ringkas; detail per file di `documentation/`)
17. **Aturan konten**: video 10 detik (v0.9.14), **larangan harga** di caption &
    prompt + `stripPrice` di output (v0.9.15/0.9.17), **tanpa rating** (v0.9.20),
    hashtag per niche (v0.9.23), caption SEO-first + disclaimer (v0.9.24).
18. **Experiment ID unik** nama+konsep+tanggal+sidik produk+acak (v0.9.16).
19. **Log aktivitas** + hasil bulk scan per run terlihat (v0.9.18/0.9.19).
20. **🎞 Gahwa Pack** — galeri + varian + video + job JSON (v0.9.21–0.9.23).
21. **Panel halaman produk decision-first** + snapshot bersih (v0.9.25).
22. **Prior per niche + 🎲 Thompson sampling** (v0.9.26).
23. **Listing pakai satu mesin keputusan** + forest plot ROAS (v0.9.27).
24. **TikTok downloader** 1080p + **FB Ad Library HD downloader** (v0.9.28/0.9.29).
25. **Sinyal iklan untung** (🏆/📈/🆕/SCALING) + 🏆 Top iklan; affiliate ID default
    `11300901968` (v0.9.30).
26. **Fix caption "dipencet beberapa kali baru nongol"**, ekonomi **setelah pajak**
    (PPN 11%, WHT 2,5%, impas ROAS kotor 1,14), 🔍 Analisa produk TERBUKTI, pelacak
    kompetitor, ✍ brief kreatif, 💰 panel payout (v0.9.31).
27. **🚀 Launch pack** (campaign = `sub_id`) + 🚀 dari Ad Library + 📒 Cek semua
    kompetitor (v0.9.32).
28. **Caption engagement** — momen relatable + hal berguna + pertanyaan penutup;
    `stripEngagementBait()` membuang kalimat minta like/share/tag/komen kata (v0.9.33).
29. **Ad Library: filter niche + 🧬 Analisa pola champion** skor 0–100 dari lama
    tayang, variasi, niche, link multi-pengiklan; tanpa hook rate (v0.9.34).
30. **Ad Library: ☑ checkbox + 🔬 Analisa dalam** — buka link Shopee yang dicentang
    di tab latar, DeepSeek menilai skor + COBA / UJI KECIL / LEWATI (v0.9.35).
31. **`docs/SETUP.md`** — pasang, semua field config + default, troubleshooting.
32. **Angle + hook + tempo peluncuran** di Top iklan & Analisa pola (v0.9.36).

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
`test/run-all.sh` menjalankan 53 langkah: syntax semua JS · validasi manifest · cek
semua file yang dirujuk manifest ada · tes Node (pipeline, kalibrasi, bulk scan,
scheduler, aturan konten, EPC, niche, bandit, parser TikTok/Ad Library, affiliate ID)
· tes Chromium asli (bulk scan, sort, CSV, modal, Gahwa, caption, TikTok, Ad Library,
Launch pack). Tes yang memakai snapshot memakai salinan beku
`test/fixtures/performance-snapshot-2026-10-21.json`.

Tes yang bergantung pada halaman **live** (bisa merah tanpa ada bug): langkah 44
(TikTok live) dan 45/49 (Ad Library Beyond.shopcart).

## RENCANA PENGERASAN (kerja otonom, mulai 23 Sep 2026)
Perintah Fikri: "semua fitur dan functionality core harus consistent dan zero bug,
fitur bulk search paling penting". Ledger sesi tidak reachable di install ini, jadi
DAFTAR INI adalah state yang bertahan. Urutan dikerjakan dari atas.

Prinsipnya: setiap fitur inti harus punya test di BROWSER NYATA, bukan stub Node.
Stub tidak pernah bisa menangkap kolaps-anchor, race render, atau ringkasan scan
yang terhapus — tiga bug yang baru ditemukan begitu test browser pertama ada.

- [x] bulk keyword scan — `test/e2e-browser-bulk.js` (v0.9.1)
- [x] skor EPC tidak boleh kolaps — `test/e2e-epc-score.js` (v0.9.2)
- [x] bulk scan SEMUA KATEGORI di browser nyata — `test/e2e-browser-category.js`
      (v0.9.3; menemukan bug ringkasan-hilang yang sama seperti keyword scan)
- [x] sort tabel (angka vs teks, toggle, satu kolom aktif) — `test/e2e-browser-sort.js` (v0.9.4; tanpa bug)
- [x] Export CSV — file terunduh, kolom lengkap, nama koma+kutip utuh — `test/e2e-browser-csv.js` (v0.9.5; tanpa bug)
- [x] modal detail — buka dari tabel, isi terbaca, tutup ✕/backdrop, panel utuh — `test/e2e-browser-modal.js` (v0.9.6; tanpa bug)
- [x] Experiment ID — logika inti tertutup PENUH oleh `test/e2e-experiment.js`
      (satu identity id caption=video, dedup ledger jadi 1 baris, ＋Eksperimen
      Baru memutar konsep + id baru). KETERBATASAN: jalur UI-nya (klik ✨Caption
      lalu 🎬Prompt Video di modal) TIDAK bisa diuji browser di konfigurasi ini —
      butuh (a) id ekstensi untuk membuka Admin page set API key, dan MV3
      content-script-only ini tidak punya service worker sehingga id-nya tidak
      bisa didapat andal (CDP Target.getTargets tidak melihatnya, dan id unpacked
      Chrome bukan hash-path murni), plus (b) panggilan jaringan DeepSeek. Test
      browser setengah-jadi dihapus daripada dibuat lolos palsu. Kalau nanti
      ditambah service_worker minimal (atau `key` tetap di manifest), id jadi
      pasti dan test UI ini bisa dibuat benar.
- [ ] realisme fixture: `test/fixtures/shopee-offer.html` dibangun dari kontrak
      selector, BUKAN dari dump Shopee asli. Selama itu belum diganti dump nyata,
      test browser membuktikan kontrak plugin sendiri — bukan bahwa markup Shopee
      belum berubah. Minta Fikri satu dump HTML halaman Product Offer.

Aturan rilis (sejak v0.9.25): tiap perubahan → `bash test/run-all.sh` hijau → bump
`manifest.json` → tulis `documentation/YYYY-MM-DD-*.md` → commit di branch
`feat/vX.Y.Z-*` → push branch itu → **PR ke `main`** → merge. Setelah merge,
`release/v0.9.0` di-fast-forward ke `main`. Agen tidak push langsung ke `main`
(policy); masuk lewat PR. Branch `integration` dan tag `v0.9.x` berhenti di v0.9.13
dan tidak dipakai lagi.

## BELUM SELESAI
Lihat `HANDOFF.md` §10 — ringkasnya: selector bulk perlu dipantau jika Shopee
mengubah DOM, sold/bulan belum dibawa ke MODE A, umur listing & lokasi toko masih
"?", nama toko di parent element, ikon placeholder, dan pembuatan custom link
Shopee via Open API belum dibangun. Tambahan sejak v0.9.31:
- **Langkah 49 merah** karena data live Ad Library (5 iklan, tes minta 6). Perlu
  dibuat tidak bergantung jumlah iklan live, atau pakai fixture.
- Panel 💰 payout sudah terbukti jalan di halaman payout asli (1 Nov 2026).
