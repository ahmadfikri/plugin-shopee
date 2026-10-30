# v0.9.29 — Downloader FB Ad Library + perbaikan TikTok downloader (30 Okt 2026)

## Yang baru

### 1. Download video dari Meta Ad Library (Galeri Iklan)
- Buka halaman apa pun di `https://www.facebook.com/ads/library/...` (pencarian keyword atau halaman satu pengiklan). Tidak perlu login.
- Tiap kartu iklan video dapat tombol **"⬇ Download video HD"** di bawah "ID Galeri".
- Bar di kanan bawah: **"⬇ Semua video HD (N)"** dan **"⬇ Data iklan (JSON)"** (teks iklan, link Shopee, tanggal mulai, CTA, nama page).
- File: `Downloads/fbads/<page>/<page>_<adId>_hd.mp4`. Kalau iklan punya beberapa video (carousel/DCO): `_1`, `_2`, dst.

### Cara kerjanya (diverifikasi di Chromium asli, 30 Okt 2026)
- Data iklan ada di JSON halaman: `ad_archive_id` + `snapshot.videos[]` / `snapshot.cards[]` berisi `video_hd_url` dan `video_sd_url`.
- Player di halaman memakai file **SD (360p)**. Jadi klik kanan "Save video" biasa cuma dapat 360p. Plugin mengambil **HD (576p-720p)**. Contoh nyata halaman Beyond.shopcart: HD 720x1280 vs SD 360x640.
- 30 iklan pertama ada di JSON inline. Iklan yang muncul saat scroll datang dari `/api/graphql`; `src/fbadlib-hook.js` (MAIN world) hanya MEMBACA respons itu dan meneruskannya ke content script. Tidak mengubah request.
- URL fbcdn sudah ditandatangani: tidak butuh cookie/Referer. Urutan: HD langsung → HD via blob → SD.
- URL video punya masa berlaku (parameter `oe=`). Kalau halaman dibuka berjam-jam, refresh dulu sebelum download.

### 2. Perbaikan TikTok downloader (v0.9.28 sebelumnya belum lolos tes browser)
- **Bug:** di Chromium asli CDN TikTok menolak `chrome.downloads` (`SERVER_FORBIDDEN`), padahal `fetch()` dari extension diterima (200). Selain itu `ttWaitDownload` bisa menunggu selamanya kalau download gagal sebelum listener terpasang → tes hang.
- **Fix:** video di-fetch di offscreen document (`src/offscreen.html/js`) → blob URL → `chrome.downloads`. `ttWaitDownload` sekarang juga polling state + timeout 180 detik.
- Hasil tes nyata: `tiktok_7106594312292453675_1080p.mp4`, 1080x1920, 3,36 MB.
- Catatan: 1080p TikTok sering codec **H.265 (HEVC)**. Bisa diputar di Mac/Chrome; kalau editor tertentu tidak bisa membuka, convert ke H.264 dulu.

### 3. Perbaikan kecil
- `src/ai.js`: `AbortController`/`setTimeout` di-guard. Timeout 45 detik dari v0.9.28 membuat 5 tes prompt (case, size-framing, concepts, rating-gate, price-guard) crash di sandbox node. Perilaku di Chrome tidak berubah.

## File
| File | Status |
|---|---|
| `src/fbadlib.js` | baru — parser iklan + rencana download (dipakai tes node juga) |
| `src/fbadlib-hook.js` | baru — baca respons GraphQL (MAIN world) |
| `src/fbadlib-content.js`, `src/fbadlib.css` | baru — tombol per kartu + bar |
| `src/offscreen.html`, `src/offscreen.js` | baru — fetch → blob untuk download |
| `src/background.js` | handler `fbadlib-download`, `fbadlib-json`; TikTok lewat blob |
| `manifest.json` | v0.9.29, izin `offscreen`, host `facebook.com/ads/library`, `*.fbcdn.net` |
| `src/popup/popup.html` | keterangan FB Ad Library |
| `test/e2e-fbadlib.js` + `test/fixtures/fbadlib-*` | tes parser pakai payload asli |
| `test/e2e-browser-fbadlib.js` | tes Chromium asli: tombol, download HD (ffprobe), scroll GraphQL |
| `test/run-all.sh` | langkah 42-45 |

Backup sebelum ubah: `*.bak-20261030-fbadlib`.

## Verifikasi
`bash test/run-all.sh` → **SEMUA VERIFIKASI LULUS** (45 langkah). FB: 6/6 file HD lengkap, file pertama 576x1024, scroll pencarian "shopee" 30 → 116 iklan tertangkap.

## Batasan
- Kalau Facebook mengganti nama field JSON (`video_hd_url`, `ad_archive_id`), downloader berhenti menemukan video. Tes `e2e-browser-fbadlib.js` akan menangkapnya.
- Video ini milik pengiklan lain. Pakai untuk riset hook/angle. Mengiklankan ulang video orang lain berisiko kena tolak/report hak cipta di Meta.
