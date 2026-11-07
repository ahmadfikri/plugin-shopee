# HANDOFF — baca ini pertama

**Untuk sesi Kiro / device baru.** Dokumen ini membuatmu langsung nyambung tanpa
perlu menelusuri riwayat chat. Baca ini → `STATUS.md` → jalankan verifikasi.

Pemilik: **Fikri**. Proyek: **syabab-affiliathor**, Chrome extension (MV3) untuk
riset produk Shopee affiliate. Dibangun 2026-09-13.

---

## 1. VERIFIKASI DULU (30 detik, wajib sebelum mengubah apa pun)

```bash
cd riset-plugin
bash test/run-all.sh
```
Harus berakhir dengan `SEMUA VERIFIKASI LULUS`. Butuh **Node.js** saja (tanpa npm
install, tanpa dependency). Kalau ada yang FAIL, perbaiki itu dulu.

## 2. PASANG KE CHROME
`chrome://extensions` → Developer mode ON → **Load unpacked** → pilih folder
`riset-plugin/`. Setelah MENGUBAH KODE, klik ikon **↻ reload** di kartu ekstensi
lalu **refresh halaman Shopee** — kalau tidak, kamu menguji kode lama.

## 3. MODEL BISNIS FIKRI (ini menentukan semua desain skor)
> "Secara fundamental saya tidak terlalu peduli barang yang harus saya jual,
> yang penting user click ads tersebut."

Dia **click-arbitrage affiliate**: untung dari KLIK yang jadi komisi, bukan dari
jualan barang. Maka:
- Produk "tepat" = paling mungkin **diklik**, **convert**, dan komisinya
  menutup **biaya klik**.
- **Saturasi pasar / pangsa pasar / kesegaran listing TIDAK RELEVAN** — sudah
  dibuang dari scoring. Produk jenuh justru bagus (terbukti orang beli).
- Angka paling penting untuknya: **Max CPC** = batas bayar per klik.

## 4. BATASAN YANG TIDAK BOLEH DILANGGAR
1. **JANGAN menyentuh `../analisis/affiliate_dashboard.xlsx` atau `../analisis/_data/`
   dari dalam plugin.** Plugin proyek terpisah. Ekspor selalu ke file BARU milik plugin.
2. **Tanpa Facebook/Meta API** di plugin.
3. **Self-contained**: tanpa backend, tanpa memanggil sistem lain (pipeline/cron/KB).
   Semua config di `chrome.storage` via Admin Panel.
4. **Ambil data dengan SCRAPE DOM ter-render, JANGAN panggil API Shopee.**
   `enrich.js#fetchOne` sengaja DIMATIKAN: memanggil `/api/v4/item/get` dari
   subdomain affiliate memicu CAPTCHA anti-bot (`scene=crawler_item`) dan bisa
   men-flag sesi Shopee Fikri.

## 5. ATURAN KONTEN (video & caption) — jangan diubah tanpa diminta
- **TANPA RATING (aturan Fikri 2026-10-09, menggantikan "hanya rating").** Caption
  dan prompt video tidak boleh menyebut rating, bintang, jumlah review, jumlah
  terjual, atau favorit. Rating tidak dikirim ke AI (`ai.js#productContext`), semua
  template memuat `RATING_BAN`, dan `stripRating()` membersihkan OUTPUT. Rating tetap
  dipakai di panel riset/skor (itu data, bukan konten).
- **SEBUT NAMA PRODUK** dengan jelas.
- **3 DETIK PERTAMA adalah prioritas tertinggi** — kedua template video punya blok
  khusus yang menuntut penjelasan detik-per-detik.
- **Presenter: AI yang memutuskan** sesuai target pasar (produk pria→pria,
  fashion muslim→berhijab, dst). JANGAN hardcode perempuan berhijab — aturan itu
  dicabut 2026-09-13. Wajib dewasa (min ~20th), natural tidak lebay, outdoor siang.
- **Produk yang bisa dipegang tangan** (HP/casing/aksesoris + tumbler, mug, parfum,
  dompet, jam, squishy, dll) → mode **HANDS-ONLY + musik beat**, tanpa wajah.
- **FRAMING DITENTUKAN UKURAN PRODUK** (`productSize()` di `ai.js` → `small` /
  `large` / `unknown`):
  * **KECIL** (muat digenggam: casing, tumbler, parfum, dompet, powerbank) →
    **HANDS-ONLY**, tanpa wajah/tubuh.
  * **BESAR** atau dipakai di badan (lemari, rak, kipas, sprei, gamis, tas,
    sepatu, helm) → **PRESENTER dengan TUBUH terlihat** + minimal satu shot produk
    berdampingan dengan orang sebagai **pembanding skala**; kalau dipakai,
    tunjukkan **saat dipakai**.
  * **TIDAK DIKENAL** → template presenter tapi AI diinstruksikan **menilai
    sendiri** ukurannya dengan aturan yang sama, dan menyebut keputusannya.
  * `BIG_ITEMS` MENANG atas daftar handheld — "tas selempang HP" itu tas, bukan
    aksesoris HP; "sarung bantal" itu besar, bukan sarung HP.
  Dikunci `test/e2e-size-framing.js`.
- **KHUSUS CASING HP** (`isPhoneCase()` → blok `CASE_RULES` di `ai.js`):
  WAJIB **tangan PEREMPUAN** dewasa terawat (kulit bersih, kuku **berkutek** warna
  elegan, aesthetic) — bukan pria, bukan netral. Dan **HP JANGAN dibolak-balik**
  depan-belakang: AI salah render, casing muncul di KEDUA sisi. Gantinya
  **digoyang/dimiringkan pelan** (gentle shake, subtle tilt, orbit maks ~30°),
  casing hanya ditampilkan dari satu sisi. Baris "putar 360" di template diberi
  syarat "hanya jika BUKAN casing" agar tidak kontradiktif.
  Dikunci `test/e2e-case-prompt.js`.
- **Caption: SATU saja** (bukan 3 variasi), teks biasa tanpa markdown, diakhiri
  blok **6–9 hashtag** (2 reach + niche searchable + buyer-intent).
- **Caption SEO-first + disclaimer (v0.9.24, Fikri 2026-10-13).** Kalimat pertama
  wajib memuat 1 kata kunci utama yang diketik pembeli (2-4 kata), badan memuat
  2-3 variasi long-tail, 1-2 hashtag SEO dari kata kunci itu. Setiap caption
  WAJIB berisi baris `CAPTION_DISCLAIMER` ("Catatan: tampilan produk asli mungkin
  sedikit berbeda dari video.") tepat di atas baris hashtag — ditegakkan di
  output oleh `ensureDisclaimer()`, jadi tetap muncul walau captionPrompt custom.
  Dikunci `test/e2e-caption-seo.js`.
- **ROTASI KONSEP** (`concepts.js` → `{{CONCEPT}}` di video & caption prompt,
  v0.6.0): 8 archetype (curiosity, price-shock, before/after, POV, mistake-warning,
  satisfying, problem-solve, comparison). `RMConcepts.next(tag)` memutar konsep
  supaya video berturut untuk satu produk TIDAK PERNAH sama konsepnya —
  melawan penalti Meta Andromeda (reward diversitas) + TikTok anti-mass-production
  (15 Sep 2025). Video prompt juga menuntut variasi angle/latar/lighting.
  Aturan hashtag direvisi 8-12 → 6-9 (2 reach + niche searchable + buyer-intent),
  sesuai riset 2026 (hashtag = SEO, bukan virality). Dikunci `test/e2e-concepts.js`.
  Concept win-rate sudah exact di v0.9: hanya Experiment ID 1:1 yang boleh
  memengaruhi bias; menunggu campaign ID baru memperoleh data performa.
- Prompt video harus **berupa PERINTAH** ("Buatkan video vertikal 9:16…").

## 6. ARSITEKTUR SINGKAT
```
manifest.json          MV3, 20 content script (urutan muat penting)
src/storage.js         config + migrasi prompt lama
src/perf.js            FEEDBACK LOOP — kalibrasi dari hasil nyata
src/epc.js             PREDIKSI EPC — Empirical Bayes shrinkage (P(untung)+rentang)
src/dataset.js         kolektor data training (fitur produk) untuk model masa depan
                       — OTOMATIS (cfg.autoCapture, default true): tiap halaman
                       detail dibuka → baris KAYA; tiap listing/bulk scan → baris
                       TIPIS tapi massal. Export via Admin Panel; koordinator
                       gabung dgn tools/merge_training.py

⚠️ **`mergeRow()` WAJIB dipertahankan.** Baris baru TIDAK BOLEH menimpa field
non-null yang sudah ada dengan null, dan `source` tidak boleh turun dari `detail`
ke `listing`. Tanpa ini, satu bulk scan akan MENGHAPUS rating/review/sold yang
sudah terkumpul dari halaman detail — kerusakan yang baru ketahuan berbulan-bulan
kemudian saat model dilatih. Juga: `commission_pct` diambil dari nilai SCRAPE
produk (kartu listing punya `.commRate` = komisi ASLI), bukan dari
`cfg.commissionPct` yang hanya asumsi global. Dikunci `test/e2e-dataset-auto.js`.
src/shortlist.js       akumulator bulk scan (chrome.storage)
src/scraper.js         DOM halaman listing affiliate
src/detailscrape.js    DOM halaman detail produk
src/enrich.js          (fetch DIMATIKAN — lihat batasan #4)
src/video.js           deteksi + unduh video produk (.mp4 langsung)
src/proscore.js        mesin skor 4 pilar click-affiliate
src/conceptperf.js     exact concept-performance loop; hanya Experiment ID 1:1,
                       broad-tag log lama sengaja diabaikan
src/experiment.js      v0.9 ZERO-TYPING identity: satu ID = nama campaign Meta =
                       tag Shopee; caption/video reuse satu konsep+ID, hipotesis auto
src/ledger.js          Learning Ledger; join outcome + CR-vs-CPC failure mode
src/analytics.js       agregasi pasar + panggil proscore
src/ai.js              template caption / prompt video (DeepSeek)
src/charts.js          bar chart SVG tanpa library
src/panel.js           semua render UI
src/bulkscan.js        crawler otomatis tab kategori
src/content.js         orkestrator + SCHEDULER (baca §8)
src/admin/             Admin Panel (config + impor snapshot)
test/run-all.sh        verifikasi semuanya
```

## 7. DUA MODE
- **MODE A — halaman detail produk** (`shopee.co.id/product/<shop>/<item>`):
  scrape DOM → `src/productpage.js` (v0.9.25): vonis dulu (IKLANKAN / LAYAK COBA /
  HATI-HATI / LEWATI / UJI KECIL / IMPOR DATA), lalu prediksi ROAS + rentang,
  P(untung), Max CPC Meta, chart nilai-per-klik-Meta vs CPC, chart patokan, risiko,
  dasar data, kepercayaan pembeli, riwayat eksperimen, tombol konten.
  Rumus: nilai 1 klik Meta = EPC × arrival; ROAS = itu ÷ CPC Meta (dari snapshot).
  Drill-down di halaman listing tetap pakai `RMPanel.buildDetailModal` (tidak diubah).
- **MODE B — halaman listing** (`affiliate.shopee.co.id/offer/product_offer`):
  scrape semua kartu → header ringkasan aksi + 2 chart ranking + tabel PRO +
  **Shortlist Kumulatif** (top 20, bisa dibuka semua) + dua tombol bulk scan.

## 7b. DUA JENIS BULK SCAN (`src/bulkscan.js`)
- **▶ Bulk Scan Semua Kategori** (`run`) — mengklik tab kategori satu per satu,
  jeda 2,5s, opsi ikut telusuri paginasi.
- **🔎 Bulk Scan Keyword** (`runKeywords`) — isi daftar kata kunci dipisah koma,
  plugin mengisi kotak pencarian, submit, **menunggu produk BENAR-BENAR ter-render**
  (`waitForRender`: jumlah kartu harus stabil 2x pembacaan) baru scrape, jeda 3s,
  lanjut kata kunci berikutnya. Penantian render itu adalah **guard anti-bot** yang
  diminta Fikri — jangan pernah menembakkan pencarian berikutnya sebelum yang
  sebelumnya selesai render.

⚠️ **JANGAN cache node tab.** Wajib pakai `findTabByLabel(label)` yang re-query DOM
setiap iterasi. Shopee (React) MENGGANTI node tab tiap render, dan sebuah pencarian
membangun ulang seluruh daftar — node yang dicache jadi *detached* dan `.click()`
gagal dalam diam. Itu penyebab bug "bulk scan error setelah search" (2026-09-14).
`test/e2e-bulk-tabs.js` mengunci perilaku ini (kode lama 0/5 klik, kode baru 5/5).

⚠️ **`RMPerf.matchTag()` mengembalikan OBJEK `{tag, stats, score, hits}`, BUKAN string.**
`RMEpc.predict({tag})` mencari tag berdasarkan NAMA, jadi wajib kirim `m.tag`.
Mengirim objeknya bikin lookup gagal DALAM DIAM → semua produk jatuh ke prior
global → skor EPC identik untuk semua produk (bug "gak ada scoring baru",
2026-09-15). `test/e2e-epc-table.js` mengunci ini: ia menuntut produk ber-tag
berbeda hasilnya dari produk baru.

⚠️ **Prediksi EPC dihitung di `analytics.js`, bukan hanya di MODE A.** Semua
permukaan mengambil `p.epcPred` dari situ: tabel listing, drill-down modal, dan
shortlist. Kalau menambah permukaan baru, jangan hitung ulang — pakai `p.epcPred`.
Tanpa snapshot, sel EPC menampilkan hint "— impor snapshot" (JANGAN dibiarkan
kosong; sel kosong terlihat seperti fitur rusak).

⚠️ **suspend()/resume() WAJIB counter, bukan boolean, dan handler bulk scan WAJIB
`await waitIdle()` setelah suspend.** Penyebab bug "bulk scan KEDUA mandek, harus
reload tab" (2026-09-14): scan pertama selesai → `resume()` → observer memicu
`run()` (async, sedang ambil config) → user klik scan kedua → `run()` yang telat
itu menimpa panel & mengosongkan host shortlist. Tiga lapis perbaikan di
`content.js`: (1) `suspendDepth` counter supaya suspend bisa nested;
(2) `waitIdle()` menunggu `runInFlight` selesai sebelum scan mengambil alih;
(3) `run()` cek `if (suspended) return` LAGI setelah `await loadCfg()` untuk
membatalkan render telat. Handler juga menampilkan `{error}` dari RMBulk (dulu
diabaikan → UI diam). `test/e2e-rescan.js` mengunci ini.

## 8. SCHEDULER — JANGAN SEDERHANAKAN
`content.js` punya scheduler dengan **MAX_WAIT_MS**, penjaga re-entrancy, flag
suspend, dan jaring pengaman retry. Ini BUKAN over-engineering: versi naif
(debounce biasa) membuat panel **sering tidak muncul**, karena Shopee React SPA
bermutasi terus sehingga `clearTimeout` mereset debounce selamanya. Bulk scan juga

### BULK KEYWORD — HASIL BAWAH + SORT (v0.9)
Setelah scan keyword selesai, Shopee/native list di atas dan plugin table punya
peran berbeda: tabel bawah otomatis difilter ke `lastKeyword` yang benar-benar
berhasil disimpan, sehingga batch baru tidak tersembunyi oleh top-20 global.
`Lihat seluruh shortlist` menghapus filter. Semua header tabel punya tombol ↕
(ascending/descending) dan sorting dilakukan in-place tanpa scan/reload.

WAJIB memanggil `suspend()`/`resume()`, kalau tidak observer merusak scan sendiri.
`test/e2e-scheduler.js` mengunci perilaku ini — jalankan setelah menyentuh bagian itu.

## 9. FEEDBACK LOOP — cara menyegarkan data
Max CPC akurat hanya kalau snapshot performa diimpor.
```bash
cd ../analisis
python3 export_perf_snapshot.py            # path auto-detect
# atau: python3 export_perf_snapshot.py <ANALISIS_DIR> <OUT_JSON>
```
→ menulis `riset-plugin/export/performance-snapshot.json`.
Lalu: Admin Panel → **Feedback Loop** → tempel isi JSON → **Impor Snapshot**.

Kenapa penting (terukur): rumus `harga × komisi% × 4%` **melebihkan ~2,4x**.
Untuk KupuA17 rumus bilang Rp 552/klik, EPC nyatanya **Rp 228/klik**.

## 9b. EXPERIMENT ID + CAMPAIGN REGISTRY (v0.9)
- Generate caption/video → plugin otomatis membuat `experimentId` aman (huruf kecil
  + angka, maks 20 karakter). Nilai itu dipakai PERSIS sebagai nama campaign Meta
  dan tag Shopee; tidak ada form ketik manual.
- Caption dan prompt video pada produk yang sama memakai konsep + ID yang sama.
  Klik `＋ Eksperimen Baru` untuk rotasi konsep dan ID berikutnya.
- Hipotesis dibuat otomatis dari produk + archetype konsep dan dicatat ke Ledger.
- Pipeline analisis otomatis membuat
  `../analisis/campaign_registry.xlsx` setiap dashboard rebuild. Sheet:
  `CampaignRegistry`, `Aliases`, `Unmatched`, `ReadMe`.
- Kolom manual (`concept`, URL, hypothesis, notes, lifecycle) dipertahankan saat
  rebuild berikutnya; kolom performa dibuat ulang dari master.

Snapshot juga menandai **zero-converter** (mis. `alatPel`: 124 klik, 0 order) →
produk mirip langsung di-gate **SKIP**.

## 10. YANG BELUM SELESAI (kandidat kerja berikutnya)
1. **Bulk scan kategori sudah dipakai Fikri dan JALAN** untuk pencarian sederhana.
   Bug "error setelah search" sudah diperbaiki (§7b). Yang belum: verifikasi
   selector tab di lebih banyak variasi halaman. Kalau tab tidak terdeteksi, minta
   Fikri kirim `outerHTML` tab-nya.
2. **Bulk Scan Keyword sudah diuji live oleh Fikri (2026-09-21).** Search native
   berhasil, tetapi hasil baru awalnya tersembunyi oleh ranking shortlist global;
   v0.9 sekarang otomatis menampilkan batch keyword terakhir di tabel bawah.
   Kalau input tidak terdeteksi setelah perubahan DOM Shopee, cek `findSearchInput()`.
3. **MODE A tidak punya angka sold/bulan** → pilar `permintaan` pakai fallback
   total sold. Idealnya bawa `unitsPerMonth` dari listing via storage saat diklik.
4. **`Umur listing` & `Lokasi toko` masih "?"** di panel detail (selector belum ada).
5. **Nama toko tidak ada di `.ItemCard__contentSection`** (ada di elemen parent).
6. **Ikon masih PNG placeholder** polos.
7. **Hasil DeepSeek belum diuji live** — API key belum diisi Fikri.
8. **Experiment ID + sub_id disiplin SUDAH dibangun (v0.9).** Yang belum hanya
   pembuatan custom link Shopee langsung via Open API
   (`open-api.affiliate.shopee.co.id/graphql`, GraphQL + HMAC-SHA256) — dashboard
   Fikri punya menu "Open API", tapi ada laporan program ditutup untuk pendaftar
   baru; harus dicek dari dashboard-nya.

## 11. SELECTOR TERVERIFIKASI (mahal didapat — jangan diubah tanpa bukti baru)
Listing affiliate: `.ItemCard__contentSection` (kontainer), `.ItemCard__name`,
`.ItemCardPrice__wrap .price`, `.ItemCardSold__wrap`, **`.commRate`** ("Comm Rate 11,5%"
→ komisi ASLI, ini yang bikin Max CPC bisa akurat).
Detail: **`.product-rating-overview__rating-score`** (rating), 
**`.product-rating-overview__filter`** ("5 star (20,9k)" → breakdown bintang).
Video: `.mp4` LANGSUNG di `down-tx-id.vod.susercontent.com` (bukan HLS).

**Dua jebakan parsing yang sudah pernah menipu:**
- Harga di halaman detail: JANGAN scan `body.textContent` (ketemu "Rp70" duluan).
  Ambil dari ELEMEN yang teksnya persis `^Rp\d{1,3}(\.\d{3})+$`, pilih yang paling
  sering muncul.
- `totalReviews`: JUMLAHKAN breakdown bintang. Regex "…ratings" keserap angka
  rating (4.8 + 23,8k → 4.823.800, salah).

## 12. GAYA KERJA YANG FIKRI HARAPKAN
- Bahasa Indonesia, panggil dia **boss** di Telegram (dashboard: profesional).
- **Jujur brutal.** Kalau gagal, bilang gagal. Jangan mengarang hasil.
- **Verifikasi sebelum klaim** — jalankan tes/baca DOM, jangan bilang "sudah jalan"
  tanpa bukti.
- Kalau ingest data Shopee: **update sheet DULU, tunjukkan buktinya, baru analisa.**
- Eksekusi, jangan cuma menyarankan. Tapi jangan langgar batasan di §4.

## v0.9.14 (2026-10-02)
- Prompt video default 10 detik (sebelumnya 8). Lihat documentation/2026-10-02-durasi-video-10-detik.md
- v0.9.15 (2026-10-02): LARANGAN HARGA — harga tidak dikirim ke AI, dilarang di prompt video & caption, konsep price_shock dihapus. Lihat documentation/2026-10-02-larangan-harga.md

## v0.9.16 (2026-10-03)
Experiment ID (Campaign Meta = Tag Shopee) dibuat unik: nama6+konsep2+yymmdd+sidikProduk3+acak3, cek bentrok. Lihat documentation/2026-10-03-experiment-id-unik.md

## v0.9.17 (2026-10-03)
Audit: price guard di output caption+video (stripPrice), template video custom tetap dapat {{context}}, {{price}} tidak bocor. Lihat documentation/2026-10-03-audit-bug-harga.md

## v0.9.18 (2026-10-06) Log aktivitas
src/activitylog.js merekam klik, input plugin/search, tiap tahap bulk scan, render shortlist (baris di layar), error JS.
Ekspor via panel "⬇ Log aktivitas" atau popup. Lihat documentation/2026-10-06-log-aktivitas.md.

## v0.9.19 (2026-10-06) Hasil bulk scan terlihat
Log v0.9.18 membuktikan bulk scan menyimpan semua batch (1217→1231), tapi tabel tetap top-20 kumulatif yang sama, jadi terlihat "tidak terjadi apa-apa". Sekarang setelah bulk scan kategori tabel = hasil run itu (field `run` + `firstAt` di shortlist), BARU di atas dengan badge, ringkasan menyebut jumlah baru/sudah ada (produk unik). Test: `test/e2e-browser-runview.js`. Detail: `documentation/2026-10-06-hasil-bulk-scan-terlihat.md`.

## v0.9.21 (2026-10-11) 🎞 Gahwa Pack
Tombol baru di panel halaman PRODUK: satu klik mengunduh semua gambar galeri + varian (resolusi penuh, `_tn`/`@resize` dibuang, duplikat digabung), video listing (mp4 langsung; HLS dicatat URL-nya), dan `gahwa_job.json` (nama, varian, fitur dari deskripsi, saran hook/caption/CTA — TANPA harga & rating) ke `~/Downloads/gahwa/<yymmdd>-<slug>/`. Unduhan lewat `chrome.downloads` di service worker baru `src/background.js` (izin baru: `downloads`). Modul: `src/gahwapack.js`. Engine: `python gahwa.py --job ~/Downloads/gahwa/<folder>` (di `/Users/clawbot/Documents/money-maker/gahwa/`). Test: `test/e2e-browser-gahwa.js` (Chromium asli). Detail: `documentation/2026-10-11-gahwa-pack.md`.

## v0.9.22 (2026-10-11) Gahwa Pack: galeri saja
Logo toko dan logo kurir/pembayaran tidak ikut lagi. Gambar diambil dari kolom galeri (anchor: gambar utama terbesar) + tombol varian, ikon/rasio aneh dibuang. Detail: documentation/2026-10-11-gahwa-pack-galeri-saja.md

## v0.9.23 (2026-10-11) Hashtag per niche + filter Gahwa Pack
Tag kampanye 10.10 dihapus (kampanye selesai), diganti 2-3 tag niche per kategori produk (`NICHE_TAGS`). Detail: documentation/2026-10-11-hashtag-per-niche.md, documentation/2026-10-11-gahwa-pack-filter-v0923.md

## v0.9.24 (2026-10-13) Caption SEO-first + disclaimer
Prompt caption bawaan sekarang SEO-first (kata kunci utama di kalimat pertama, long-tail di badan, hashtag SEO dari kata kunci). Setiap caption dapat baris disclaimer "produk asli mungkin sedikit berbeda" di atas hashtag, ditegakkan di output. Detail: documentation/2026-10-13-caption-seo-disclaimer.md

## v0.9.25 (2026-10-19) Panel halaman produk dirombak + snapshot diperbaiki
Panel halaman produk baru (`src/productpage.js`): keputusan dulu, baru bukti. Snapshot sekarang tanpa aviva/(none), EPC dari hari klik bersih, plus metaCpc/arrival/days per tag. `epc.js` memakai EPC dari snapshot. Test baru #36 dan #37. Detail: documentation/2026-10-19-product-page-v0.9.25.md

## v0.9.26 (2026-10-21) Prior per niche + rencana uji Thompson sampling
Produk baru sekarang ditarik ke rata-rata NICHE-nya (hp / rumah / lainnya), bukan rata-rata global. Niche diambil dari breadcrumb Shopee (`detailscrape.categoryPath`), fallback kata di nama (`src/niche.js`, tabel keyword harus sama dengan `NICHE_KEYWORDS` di `analisis/export_perf_snapshot.py`, dicek test #38). Snapshot punya blok `niches` (tested/paidBack/EPC/CPC/arrival). Shortlist dapat blok "🎲 Uji 3 produk ini dulu" (`src/bandit.js`, Thompson sampling, seed dari id produk). Test baru #38-#40. Detail: documentation/2026-10-21-niche-thompson-v0.9.26.md

## v0.9.27 (2026-10-21) Halaman listing / Product Offer dirombak
Listing, shortlist, drill-down dan halaman produk sekarang memakai SATU mesin keputusan (`RMProductPage.decide`, dipanggil dari `analytics.js` → `p.decision`). Panel atas: vonis per kategori, kartu Thompson/ROAS/Max CPC Meta/niche, forest plot ROAS, rencana uji halaman. Tabel: Niche, Prediksi ROAS, Max CPC Meta, Vonis (kolom PRO & EPC skor lama dibuang dari tabel, tetap di CSV). Test baru #41. Detail: documentation/2026-10-21-listing-v0.9.27.md

## v0.9.28–v0.9.29 (2026-10-30) TikTok + FB Ad Library downloader
TikTok 1080p tanpa watermark dan video HD dari Meta Ad Library (bukan SD 360p yang dipakai player). CDN TikTok menolak `chrome.downloads` langsung, jadi video di-fetch di offscreen document (`src/offscreen.html/js`) lalu diunduh sebagai blob. Iklan hasil scroll dibaca dari respons `/api/graphql` oleh `src/fbadlib-hook.js` (MAIN world, hanya membaca). Izin baru: `offscreen`, host `facebook.com/ads/library`, `*.fbcdn.net`. Detail: documentation/2026-10-30-downloader-fb-adlib-v0.9.29.md

## v0.9.30 (2026-10-30) Sinyal iklan untung + affiliate ID default
Badge 🏆 TERBUKTI (≥14 hari) / 📈 MENJANJIKAN (7-13) / 🆕 BARU (<7) / SCALING (≥3 variasi), panel 🏆 Top iklan. Ini proxy dari lama tayang, BUKAN data profit. Affiliate ID default `11300901968` lewat `migrate()`; nilai manual tidak ditimpa. Detail: documentation/2026-10-30-sinyal-iklan-untung-v0.9.30.md

## v0.9.31 (2026-10-31) Fix caption + pajak + payout + Ad Library
- Bug caption "dipencet beberapa kali baru nongol": panel halaman produk dibangun ulang saat carousel lazy-load dan karena retry mencari `.rm-panel` (padahal `.rm-pp-root`). Sekarang rebuild hanya kalau URL produk berganti. ⚠️ Jangan kembalikan deteksi "halaman berubah" berbasis jumlah kartu di halaman produk.
- Ekonomi setelah pajak: Max CPC Meta = nilai klik × (1 − WHT) ÷ (1 + PPN); default PPN 11%, WHT 2,5%; impas ROAS kotor 1,14.
- 🔍 Analisa produk TERBUKTI (tab latar, maks 12, jeda 2,5 detik, tanpa API Shopee), pelacak kompetitor (`rm_fbadlib_track`), ✍ brief kreatif (harga/link/hashtag kompetitor dibuang sebelum dikirim), 💰 panel payout (`rm_payouts`, rekening tidak disimpan).
Detail: documentation/2026-10-31-batch-v0.9.31.md

## v0.9.32 (2026-10-31) Launch pack
🚀 satu blok: nama campaign Meta = `sub_id` dari short-link (syarat `campaign_to_tag()` di dashboard bisa memasangkan spend ke komisi), short-link, caption, prompt video, checklist. 🚀 dari Ad Library (`#rm-launch`) dan 📒 Cek semua kompetitor (maks 15 tab). Detail: documentation/2026-10-31-launch-pack-v0.9.32.md

## Status repo & rilis (2026-11-07)
- `main` = v0.9.32 (PR #1–#5 merge). `release/v0.9.0` di-fast-forward ke `main` 7 Nov (namanya lama, isinya v0.9.32).
- Alur kerja: branch `feat/vX.Y.Z-*` → PR ke `main`. Agen tidak push langsung ke `main`.
- `bash test/run-all.sh`: 49/50 hijau. Langkah 49 merah karena data live Ad Library (5 iklan, tes minta 6), bukan bug plugin. Kandidat kerja: buat langkah 49 tidak bergantung jumlah iklan live.
- Repo di folder Google Drive: Drive bisa menaruh file `Icon\r` di `.git` → `git fetch` gagal `bad object refs/Icon?`. Pindahkan file itu keluar `.git`.
Detail: documentation/2026-11-07-dokumentasi-v0.9.32.md
