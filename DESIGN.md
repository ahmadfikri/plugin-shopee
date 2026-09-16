# Riset Market Plugin (versi kita) — Rancangan / DESIGN

**Status:** rancangan, belum dibangun. **Dibuat:** 2026-09-13.
**Lokasi proyek (BARU, terpisah total):** `/Users/clawbot/Downloads/syabab-afliathor/riset-plugin/`

## Batasan wajib (dari Fikri, 2026-09-13) — JANGAN dilanggar
1. **JANGAN menyentuh `affiliate_dashboard.xlsx`** atau apapun di folder `analisis/`. Plugin ini proyek berdiri sendiri. Kalau perlu ekspor, tulis FILE BARU milik plugin (CSV/JSON di folder plugin), bukan ke dashboard.
2. **Belum ada koneksi Facebook API langsung.** Jangan rancang fitur yang bergantung pada Meta API. (Nanti terpisah, kalau token sudah siap.)
3. **Caption + tag creation pakai DeepSeek API**, API key diatur di config plugin (bukan hard-code, bukan diambil dari sistem lain).
4. **Self-contained.** Plugin TIDAK boleh memanggil / menulis ke sistem besar lain (MoneyPrinter, pipeline.py, cron, ingest_*.py, knowledge base). Semua konfigurasi ada di dalam plugin sendiri, lewat **Admin Panel** di dalam plugin.

## Apa ini
Chromium browser extension (Manifest V3) yang menyuntik panel "Riset Market" ke halaman hasil pencarian Shopee. Semua data di-scrape dari DOM publik Shopee — tanpa API Shopee, tanpa login. Berdiri sendiri: tidak ada backend, tidak ada dependency ke sistem lain. Storage lokal pakai chrome.storage.

## Arsitektur (semua di dalam folder plugin)
```
riset-plugin/
  manifest.json          # MV3, permissions: storage, activeTab, host shopee.co.id + api.deepseek.com
  src/
    content.js           # scrape kartu produk di halaman search, inject panel
    scraper.js           # parse harga/terjual/rating/review/umur-listing/toko dari DOM
    analytics.js         # hitung market size, bucket harga/umur, saturasi, skor layak-iklan
    panel.js / panel.css # UI panel yang disuntik (header cards, charts, grid)
    charts.js            # render 4 chart (pakai lib ringan, mis. chart bawaan/canvas)
    ai.js                # panggil DeepSeek API untuk caption + tag (key dari config)
    admin/               # Admin Panel di dalam plugin (options page)
      admin.html/js/css  # config: DeepSeek API key & model, % komisi, CPC break-even,
                         #         ambang saturasi, prompt template caption/tag
    storage.js           # chrome.storage: config + snapshot riwayat + watchlist lokal
  export/                # file ekspor BARU milik plugin (bukan affiliate_dashboard)
```

## Fitur — MENIRU AutoAds (baseline)
- Panel disuntik ke halaman search Shopee, tombol tampil/sembunyi.
- Header cards: Market Size, Rentang Harga, Rentang Umur Listing, jumlah produk.
- 4 chart (toggle Penjualan/Total Terjual/Omset 30 hari): terjual per umur, terjual per harga, OMSET per harga (sweet-spot), tooltip.
- Grid produk beranotasi: Terjual/Bln, ±Omset/Bln, umur listing, rating+review, toko.
- Sort (+ Omset Perbulan), Filter (Trend / Range Harga Min-Max / Umur listing), export.

## Fitur PEMBEDA (yang bikin ciamik) — disetujui Fikri
1. **Skor "Layak Iklan"** per produk — dari harga × %komisi (config) → CPC break-even; label 🟢/🟡/🔴. Menjawab "aku bakal UNTUNG kalau iklanin ini?", bukan cuma "pasarnya besar?".
2. **Skor Saturasi/Peluang** — % omset yang dikuasai 3 toko teratas. Terkonsentrasi = 🔴 jenuh; tersebar = 🟢 ada ruang.
3. **Deteksi produk momentum** — umur < 3 bln TAPI terjual > ambang/bln.
4. **Caption + Tag via DeepSeek** — pilih produk → generate caption iklan + saran sub_id tag lewat DeepSeek API (key di Admin Panel, model bisa diganti, prompt bisa diedit).
5. **Watchlist lokal + ekspor** — simpan kandidat ke storage plugin, ekspor sebagai FILE BARU (CSV/JSON) di `riset-plugin/export/`. TIDAK menyentuh affiliate_dashboard.
6. **Riwayat snapshot** — simpan hasil scan tiap keyword ke storage lokal → tren pasar naik/turun.
7. **Harga vs median pasar** — tiap produk ditandai di atas/bawah median.

## Admin Panel (config, di dalam plugin)
- DeepSeek API key + pilihan model + toggle aktif/nonaktif AI.
- Prompt template untuk caption & untuk tag.
- Parameter ekonomi: % komisi Shopee, target CPC break-even (default ~Rp100), ambang saturasi, ambang "momentum".
- Preferensi tampilan (chart mana yang tampil, dsб).
- Semua tersimpan di chrome.storage — tidak ada file config di luar plugin.

## Yang SENGAJA TIDAK dibangun (hormati batasan)
- Tidak ada koneksi Facebook/Meta API.
- Tidak menulis ke affiliate_dashboard.xlsx atau _data/ apa pun.
- Tidak memanggil pipeline / cron / knowledge base / sistem lain.
- Tidak ada backend server — murni client-side extension.

## Catatan jujur
- Terjual/Bln & omset = ESTIMASI dari sinyal publik (total terjual ÷ umur listing), bukan angka resmi Shopee. Berguna untuk arah, bukan presisi.
- Shopee sering ganti struktur DOM & punya anti-bot; scraper harus defensif (selector longgar, gagal dengan anggun) dan mungkin perlu perawatan berkala.
- DeepSeek API = biaya token milik Fikri; panggilan hanya saat dia klik generate, tidak otomatis.
