# v0.9.23 — Hashtag per-niche menggantikan tag kampanye 10.10 yang sudah over

**Tanggal:** 2026-10-11
**File:** `src/ai.js`
**Alasan:** Fikri — kampanye 10.10 (#1010BrandsFestival #1010ShopeeMall) SUDAH
BERAKHIR. Memaksa tag kampanye mati ke setiap caption cuma buang slot hashtag.

## Yang berubah
1. Konstanta `CAMPAIGN_TAGS` (dua tag 10.10) DIHAPUS.
2. Diganti `NICHE_TAGS` — peta regex kategori → 2-3 hashtag Indonesia yang
   BENAR-BENAR diketik pembeli, per niche:
   - casing/case → `#casinghp #casehp #aksesorishp`
   - anti gores/tempered → `#antigores #temperedglass #pelindunglayar`
   - TWS/earphone → `#twsmurah #earphone #headsetbluetooth`
   - powerbank/charger, holder/tripod, tumbler/botol, dompet, jam/smartwatch,
     parfum/skincare, kacamata, mainan, gadget komputer, furnitur, peralatan
     tidur, elektronik rumah, fashion muslim, fashion umum, tas, sepatu,
     aksesoris motor — masing-masing punya set tag sendiri.
   - fallback (tak terdeteksi) → `#shopeefinds #rekomendasibarang #belanjaonline`
3. `nicheTags(name)` memilih set berdasarkan nama produk (specific→generic,
   first match wins).
4. Prompt caption: bagian (a) sekarang `{{NICHE_TAGS}}` (di-inject per produk),
   bukan tag kampanye hardcoded.
5. `ensureCampaignTags` → `ensureNicheTags(text, product)`: menjamin tag niche
   produk muncul di caption apa pun yang model hasilkan (termasuk kalau user
   pakai captionPrompt custom lama di Admin Panel — enforcement jalan di OUTPUT,
   jadi stored prompt basi tetap dapat tag niche).
6. Safety-net: `ensureHashtags` kini MENGHAPUS `#1010BrandsFestival` /
   `#1010ShopeeMall` kalau captionPrompt tersimpan yang basi masih memunculkannya.

## Catatan Gahwa Pack
Gahwa Pack (`gahwapack.js`) TIDAK menulis hashtag ke `gahwa_job.json` — field
`suggest.captions` itu TEKS LAYAR video (≤3 kata, morph/reveal), bukan caption
sosial. Jadi hashtag niche tidak dipasang di teks video (memang tidak boleh).
Yang "ngikut" di Gahwa Pack adalah **filter gambar v0.9.23** — `collect()`
memanggil `collectImages()` yang sama, jadi Gahwa Pack otomatis hanya mengambil
foto produk (tanpa logo bank/toko/kurir/review).

## Struktur hashtag final per caption (6-9 tag)
(a) 2-3 tag NICHE produk (wajib, dari `nicheTags`)
(b) 2 tag reach: `#fyp #viral`
(c) 1-2 tag niche tambahan dari nama produk
(d) 2-3 tag niat-beli: `#racunshopee #shopeefinds #checkoutdulu #tiktokmademebuyit`

## Cara ganti saat ada kampanye baru
Edit `NICHE_TAGS` (tambah/ubah set per niche). Kalau mau tag kampanye musiman
lagi, tambahkan satu entri wajib terpisah — JANGAN hardcode ke semua caption
tanpa tanggal kedaluwarsa.

## Backup
`src/ai.js.bak-20261011-nichetags`

## Verifikasi
- `node --check src/ai.js` → OK
- Uji fungsi `nicheTags()` atas 9 nama produk → tiap niche dapat tag yang benar,
  produk tak-terkategori dapat fallback.
- `node --check src/gahwapack.js` → OK, versi manifest 0.9.23.

## Verifikasi di browser (Fikri)
1. `chrome://extensions` → ⟳ reload → cek versi **0.9.23**.
2. Hard-reload tab produk.
3. Generate caption → cek baris hashtag: ada tag niche produk (mis. casing →
   `#casinghp`), TIDAK ada `#1010BrandsFestival`/`#1010ShopeeMall` lagi.
