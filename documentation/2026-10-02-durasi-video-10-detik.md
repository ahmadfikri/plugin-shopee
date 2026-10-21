# 2026-10-02 — Durasi default prompt video: 8 → 10 detik (v0.9.14)

**Permintaan Fikri:** instruksi "Buat Video" kenapa 8 detik, jadikan 10 detik sebagai default.

**Kenapa dulu 8 detik:** template ditulis untuk Google Veo/Gemini, yang menghasilkan klip maksimal 8 detik per generate.

**Perubahan (`src/ai.js`, kedua template — DEFAULT_VIDEO_PROMPT & HANDS_VIDEO_PROMPT):**
- "durasi 8 detik" → "durasi 10 detik" (2x)
- Contoh perintah pembuka "berdurasi 8 detik" → "berdurasi 10 detik" (2x)
- Alur presenter "3-8s" → "3-10s"
- GEMINI_RULES "Maksimal 3 shot dalam 8 detik" → "dalam 10 detik"
- Alur hands-only: DEMO "3-6s" → "3-7s", HERO SHOT "6-8s" → "7-10s"
- Bagian 3 detik pertama (hook) tidak diubah.
- manifest 0.9.13 → 0.9.14

**Catatan:**
- Veo/Gemini tetap bisa memotong ke 8 detik; Kling/Hailuo mendukung 10 detik.
- Kalau field "Video prompt" di Settings pernah diisi manual, template custom itu yang dipakai (bukan default ini).
- Wajib klik ⟳ di kartu extension (chrome://extensions) setelah update.

**Verifikasi:** syntax OK; test e2e-case-prompt, e2e-concepts, e2e-size-framing PASS.
**Backup:** `src/ai.js.bak-20261002-8s` + commit sebelumnya 27aaf08.
