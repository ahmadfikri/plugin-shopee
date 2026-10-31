# v0.9.32 — Launch pack + cek semua kompetitor (31 Okt 2026)

## 🚀 Launch pack (panel halaman produk)
Satu klik menghasilkan satu blok teks yang siap ditempel:
1. **Nama campaign Meta** = tag yang tertanam di short-link (`sub_id`). Diambil langsung dari link, jadi pasti sama. Ini syarat agar `campaign_to_tag()` di dashboard bisa memasangkan spend Meta ke komisi Shopee.
2. **Short-link** affiliate (ID 11300901968), untuk baris pertama caption Facebook.
3. **Caption** (aturan caption yang sudah ada: tanpa harga, hashtag niche + FYP, disclaimer).
4. **Prompt video** Veo/Gemini, memakai konsep yang sama dengan caption.
5. **Checklist**: vonis plugin + ROAS bersih, Max CPC Meta setelah pajak, CPC > Rp200 (sumber: Zaki), vonis setelah run 2x24 jam, CPR Meta > Rp200 = matikan, scale +20% kalau ROAS ≥ 1,4, larangan harga.

Satu request per produk (berbagi kunci dengan tombol Caption), progres "1/2 caption → 2/2 prompt video", error tampil di panel.

## 🚀 dari Ad Library
Di panel 🏆 Top iklan, produk yang hasil analisanya **IKLANKAN** atau **LAYAK COBA** dapat link 🚀. Link membuka halaman produk dengan `#rm-launch`, dan Launch pack dibuat otomatis.

## 📒 Cek semua kompetitor
Tombol di bar Ad Library dan di popup plugin: membuka ulang semua halaman pengiklan yang pernah dilacak (maks 15 tab, yang paling lama tidak dicek duluan). Pelacak di tiap halaman langsung menunjukkan iklan baru / tidak terlihat lagi.

## Verifikasi
- `test/e2e-browser-launch.js`: campaign = sub_id (`taplakMeja`), short-link dengan affiliate ID, caption + prompt (2 request), checklist lengkap, tanpa harga; `#rm-launch` membuat pack sendiri.
- `test/e2e-browser-fbadlib2.js` ditambah cek tombol 📒 (page dibuka ulang).
- `bash test/run-all.sh` → SEMUA VERIFIKASI LULUS (50 langkah).

## Perubahan di sisi analisis (bukan repo plugin)
- `analisis/kill_verdict_3d.py`: NET = bersih setelah PPN 11% dan WHT 2,5%; "ROAS < impas" dan "hari cuan" memakai 1,14; net lifetime −30rb juga setelah pajak. Batas scale 1,4 tetap ROAS kotor.
- `analisis/ingest_affiliate.py`: warna ROAS di Dashboard (E17 + tabel per tag) memakai sel N10 (impas setelah pajak); blok **KOMISI CAIR** di M14:N20 + sheet **Payout**.
- `analisis/ingest_payout.py` (baru): gabungkan `payout-shopee-*.csv` dari plugin ke `_data/payouts.csv`, cek angka per payout, rebuild dashboard.
