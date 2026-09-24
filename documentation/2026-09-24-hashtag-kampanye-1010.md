# Hashtag kampanye 10.10 wajib di setiap caption

**Tanggal:** 24 September 2026
**Versi:** v0.9.12 (commit `85cf83d`, tag `v0.9.12`)
**Permintaan Fikri:** "mulai hari ini semua caption di plugin harus tambahkan
hashtag: 1010BrandsFestival dan 1010ShopeeMall"

## Apa yang berubah

Setiap caption yang dihasilkan plugin sekarang selalu memuat dua hashtag:

```
#1010BrandsFestival #1010ShopeeMall
```

Ditulis persis dengan kapitalisasinya (CamelCase), karena itu nama kampanye
Shopee, bukan tag biasa.

## Kenapa dipasang di DUA lapis

Menaruhnya di prompt saja tidak cukup, ada dua cara ia bisa gagal:

1. **Prompt tersimpan menutupi template bawaan.** Admin Panel menyimpan
   `captionPrompt` di `chrome.storage`, dan nilai tersimpan itu MENGALAHKAN
   template bawaan (gotcha yang sudah pernah kejadian, lihat
   `project.riset_plugin.stale_config_gotcha`). Kalau Fikri punya prompt
   tersimpan dari sebelumnya, perubahan template tidak akan terpakai.
2. **Model bisa mengabaikan instruksi.** DeepSeek tidak dijamin menuruti setiap
   aturan di prompt.

Jadi:

| Lapis | Lokasi | Fungsi |
|---|---|---|
| Instruksi | `DEFAULT_CAPTION_PROMPT`, bagian `(a)` | Model diminta menulis tag kampanye sendiri, dengan kapitalisasi persis |
| Safety net | `ensureCampaignTags()` di `src/ai.js` | Menempelkan tag yang hilang ke caption yang sudah jadi, apa pun yang model kembalikan |

`ensureCampaignTags()` dipanggil dari `ensureHashtags()` di **kedua** jalur
keluar — jalur "model sudah kasih >=6 hashtag" dan jalur fallback "hashtag
kurang, pakai blok bawaan" — jadi tidak ada celah.

## Perilaku safety net

- Tag yang hilang ditempelkan ke **baris hashtag terakhir**, bukan bikin baris
  baru. Isi caption tidak pernah disentuh.
- Kalau tidak ada baris hashtag sama sekali, tag ditambahkan sebagai baris baru
  di akhir.
- **Tidak menduplikasi.** Kalau model sudah menulisnya, dibiarkan. Pengecekan
  case-insensitive, jadi `#1010shopeemall` dari model tidak memicu tag kedua.
- Output multi-variasi tetap dipotong ke caption pertama seperti sebelumnya,
  lalu tag kampanye dijamin ada di sisa yang dipertahankan.

## Aturan 6-9 hashtag 2026 TIDAK diubah

Awalnya saya menaikkan instruksi jadi "8-11 hashtag" dan itu **memecahkan
test** `e2e-concepts.js`, yang sengaja mengunci aturan hasil riset 2026:
6-9 hashtag, bukan gaya 2023 yang 8-12 FYP-heavy.

Test itu benar dan saya yang salah. Yang diperbaiki: instruksi sekarang
berbunyi **"6-9 hashtag organik DITAMBAH 2 tag kampanye wajib"** — tag kampanye
ditambahkan di atas kuota organik, bukan menggantinya. Jumlah organik tetap
6-9 seperti aturan lama.

## Verifikasi

`test/e2e-campaign-hashtag.js` (baru, test ke-29 di suite), 7 skenario:

1. Prompt bawaan benar-benar menyebut kedua tag
2. Model lupa hashtag total
3. Model kasih hashtag lengkap tapi tanpa tag kampanye
4. Model sudah menulisnya → tidak dobel
5. Model menulisnya dengan huruf kecil → tidak dobel
6. Output multi-variasi → terpotong, tag tetap masuk
7. Input kosong/null/undefined → tidak error

Suite penuh: **29 test lulus** (`bash test/run-all.sh`).

## Kalau kampanye 10.10 sudah selesai

Edit satu baris di `src/ai.js`:

```js
const CAMPAIGN_TAGS = ["#1010BrandsFestival", "#1010ShopeeMall"];
```

Kosongkan array-nya (`[]`) untuk mematikan, atau ganti isinya untuk kampanye
berikutnya. Prompt dan safety net dua-duanya baca dari konstanta ini, jadi satu
edit cukup. Test akan gagal (assertion nomor 1) sebagai pengingat bahwa daftarnya
berubah — perbarui test-nya sekalian.

## Yang perlu Fikri lakukan

1. **Reload extension** di `chrome://extensions` (ikon ⟳), lalu hard-reload tab
   Shopee. Penanda cepat: versi di kartu extension harus `0.9.12`.
2. Generate satu caption dan pastikan dua tag itu muncul di baris hashtag.
3. `git push origin main:main` — commit ini ada di lokal; `origin/main` masih
   tertinggal (v0.9.10), agen diblokir push ke main oleh kebijakan.
