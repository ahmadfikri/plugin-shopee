# 2026-10-19 — Feedback loop snapshot refresh + export fixes

Changed: `analisis/export_perf_snapshot.py` (plugin code unchanged).

## Fixes
- **aviva excluded** (PERSONAL_TAGS from ingest_affiliate.py). Old snapshot (5 Okt) had aviva as a
  trusted tag with EPC Rp 8.583/klik, inflating the global EPC prior used for new products.
- **'(none)' excluded** — untagged traffic is not a product.
- **ANOMALY_DATES (24-26 Sep)**: EPC and conversion use clicks + commission from clean days only.
  ROAS/commission/orders still use every day (same rule as the dashboard).

## Added fields (ignored by current plugin, ready for future UI)
- per tag: `firstDate`, `lastDate`, `days`
- top level: `excluded` (what was filtered and why)

## Result
- 5 Okt: 104 tags, global EPC Rp 146,1, conversion 5,24%
- 19 Okt: 143 tags (62 trusted ≥25 klik), global EPC Rp 137,7, conversion 4,76%, ROAS 1,28
- Global EPC recomputed independently from tag_daily.csv: Rp 137,7 (match)
- `bash test/run-all.sh`: all pass

## Apply
Admin Panel → Feedback Loop → import `riset-plugin/export/performance-snapshot.json`, then re-scan.

## Revert
`analisis/export_perf_snapshot.py.bak-20261019-232131`,
`riset-plugin/export/performance-snapshot.json.bak-20261019-232131`
