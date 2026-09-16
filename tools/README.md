# tools/

`export_perf_snapshot.py` — salinan exporter feedback loop, disertakan agar folder
plugin ini mandiri saat diunduh ke device lain.

Dia MEMBACA master data analisis (read-only) dan MENULIS file baru
`../export/performance-snapshot.json`. Dia tidak pernah mengubah
`affiliate_dashboard.xlsx` atau `_data/`.

Path auto-detect. Kalau folder analisis ada di tempat lain:

    python3 tools/export_perf_snapshot.py /path/ke/analisis ../export/performance-snapshot.json

Butuh: python3 + pandas. Lalu impor JSON-nya via Admin Panel → Feedback Loop.
