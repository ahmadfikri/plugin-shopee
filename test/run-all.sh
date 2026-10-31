#!/usr/bin/env bash
# run-all.sh — verify the whole plugin in one command. No dependencies beyond Node.
#   cd riset-plugin && bash test/run-all.sh
set -u
cd "$(dirname "$0")/.." || exit 1

fail=0
echo "=== 1. Syntax check semua JS ==="
for f in src/*.js src/admin/*.js src/popup/*.js; do
  if node --check "$f" >/dev/null 2>&1; then
    echo "  OK   $f"
  else
    echo "  FAIL $f"; node --check "$f"; fail=1
  fi
done

echo
echo "=== 2. manifest.json valid ==="
if python3 -c "import json,sys; d=json.load(open('manifest.json')); print('  OK   name=%s v%s, %d content scripts' % (d['name'], d['version'], len(d['content_scripts'][0]['js'])))" 2>/dev/null; then :; else
  echo "  FAIL manifest.json tidak valid"; fail=1
fi

echo
echo "=== 3. Setiap script di manifest benar-benar ada ==="
python3 - <<'PY'
import json, os, sys
d = json.load(open("manifest.json"))
missing = []
for f in d["content_scripts"][0]["js"] + [d["options_page"], d["action"]["default_popup"]]:
    if not os.path.exists(f):
        missing.append(f)
for f in d.get("icons", {}).values():
    if not os.path.exists(f):
        missing.append(f)
if missing:
    print("  FAIL file hilang:", ", ".join(missing)); sys.exit(1)
print("  OK   semua file yang dirujuk manifest ada")
PY
[ $? -ne 0 ] && fail=1

echo
echo "=== 4. Test: pipeline dasar (scraper -> analytics -> panel) ==="
node test/e2e.js >/tmp/rm_t1.log 2>&1 && tail -3 /tmp/rm_t1.log || { echo "  FAIL"; cat /tmp/rm_t1.log; fail=1; }

echo
echo "=== 5. Test: feedback loop (kalibrasi Max CPC) ==="
node test/e2e-feedback.js >/tmp/rm_t2.log 2>&1 && grep -E "Max CPC|GATES|basis" /tmp/rm_t2.log | head -8 || { echo "  FAIL"; cat /tmp/rm_t2.log; fail=1; }

echo
echo "=== 6. Test: bulk scan + shortlist ==="
node test/e2e-shortlist.js >/tmp/rm_t3.log 2>&1 && tail -4 /tmp/rm_t3.log || { echo "  FAIL"; cat /tmp/rm_t3.log; fail=1; }

echo
echo "=== 7. Test: bulk scan tab (bug node-stale) ==="
node test/e2e-bulk-tabs.js || fail=1

echo
echo "=== 8. Test: scheduler deterministik (butuh ~8 detik) ==="
node test/e2e-scheduler.js || fail=1

echo
echo "=== 9. Test: bulk scan kedua tidak mandek (rescan race) ==="
node test/e2e-rescan.js || fail=1

echo
echo "=== 10. Test: EPC prediction (Empirical Bayes shrinkage) ==="
node test/e2e-epc.js || fail=1

echo
echo "=== 11. Test: kolom EPC SCORE tampil di tabel listing ==="
node test/e2e-epc-table.js || fail=1

echo
echo "=== 12. Test: data EPC ikut di bulk scan (shortlist) ==="
node test/e2e-epc-shortlist.js || fail=1

echo
echo "=== 13. Test: aturan prompt khusus casing HP ==="
node test/e2e-case-prompt.js || fail=1

echo
echo "=== 14. Test: framing menurut ukuran produk (kecil=tangan, besar=tubuh) ==="
node test/e2e-size-framing.js || fail=1

echo
echo "=== 15. Test: auto-capture dataset + merge aman (listing vs detail) ==="
node test/e2e-dataset-auto.js || fail=1

echo
echo "=== 16. Test: rotasi konsep video/caption (anti mass-production) ==="
node test/e2e-concepts.js || fail=1

echo
echo "=== 17. Test: Learning Ledger (vonis CR-vs-CPC + warn pola) ==="
node test/e2e-ledger.js || fail=1

echo
echo "=== 18. Test: Experiment ID zero-typing (Meta campaign = Shopee tag) ==="
node test/e2e-experiment.js || fail=1

echo
echo "=== 19. Test: bulk keyword tahan stale-result / React submit ==="
node test/e2e-bulk-keywords.js || fail=1

echo
echo "=== 19b. Test: REGRESSI node 'loading' nyangkut tidak menggantung keyword scan ==="
node test/e2e-loading-guard.js || fail=1

echo
echo "=== 19c. Test: BROWSER NYATA — keyword scan menelusuri halaman 2,3 (pager non-antd) ==="
node test/e2e-browser-pagination.js || fail=1

echo

echo
echo "=== 20. Test: concept win-rate hanya dari exact Experiment ID ==="
node test/e2e-conceptperf-exact.js || fail=1

echo
echo "=== 21. Test: kolom 'Dari kata kunci' tidak pernah berisi URL path ==="
node test/e2e-observed-label.js || fail=1

echo
echo "=== 22. Test: properti skor EPC — tidak boleh kolaps jadi konstanta ==="
node test/e2e-epc-score.js || fail=1

echo
echo "=== 23. Test: BROWSER NYATA — bulk keyword scan end-to-end ==="
echo "    (Chromium asli + extension di-load; bukan stub. Ini satu-satunya test"
echo "     yang bisa menangkap bug seperti seluruh halaman kolaps jadi 1 produk.)"
node test/e2e-browser-bulk.js || fail=1

echo
echo "=== 24. Test: BROWSER NYATA — bulk scan semua kategori ==="
node test/e2e-browser-category.js || fail=1

echo
echo "=== 25. Test: BROWSER NYATA — sort tabel (angka vs teks, toggle) ==="
node test/e2e-browser-sort.js || fail=1

echo
echo "=== 26. Test: BROWSER NYATA — export CSV (koma/kutip di nama) ==="
node test/e2e-browser-csv.js || fail=1

echo
echo "=== 27. Test: BROWSER NYATA — modal detail (panel tidak blank) ==="
node test/e2e-browser-modal.js || fail=1

echo
echo "=== 28. Test: rating hanya disebut kalau >=4.8 (caption & prompt) ==="
node test/e2e-rating-gate.js || fail=1

echo
echo "=== 29. Test: caption SEO-first + niche tag + disclaimer ==="
node test/e2e-caption-seo.js || fail=1

echo
echo "=== 30. Test: larangan harga ditegakkan di OUTPUT caption & prompt video ==="
node test/e2e-price-guard.js || fail=1

echo
echo "=== 31. Test BROWSER: log aktivitas mencatat klik + tiap tahap bulk scan ==="
node test/e2e-browser-activitylog.js || fail=1

echo "=== 34. Browser test: setelah bulk scan, tabel = hasil scan itu (BARU di atas) ==="
node test/e2e-browser-runview.js || fail=1

echo "=== 35. Browser E2E: 🎞 Gahwa Pack di halaman produk (gambar full-res + job.json, tanpa harga/rating) ==="
node test/e2e-browser-gahwa.js || fail=1

echo "=== 36. Test: keputusan panel halaman produk (EPC x arrival vs CPC Meta, snapshot asli) ==="
node test/e2e-productpage.js || fail=1

echo "=== 37. Browser E2E: panel halaman produk v0.9.25 (vonis, chart, riwayat, tombol) ==="
node test/e2e-browser-productpage.js || fail=1

echo "=== 38. Test: niche (kategori) + prior hierarkis, snapshot asli ==="
node test/e2e-niche.js || fail=1

echo "=== 39. Test: rencana uji Thompson sampling (shortlist) ==="
node test/e2e-bandit.js || fail=1

echo "=== 40. Browser E2E: rencana uji muncul setelah bulk scan (snapshot asli) ==="
node test/e2e-browser-testplan.js || fail=1

echo "=== 41. Test: ringkasan halaman listing pakai mesin keputusan yang sama (v0.9.27) ==="
node test/e2e-listing.js || fail=1

echo "=== 42. Test: TikTok downloader (parse + kualitas max, tanpa watermark) ==="
node test/e2e-tiktok.js || fail=1

echo "=== 43. Test: FB Ad Library parser (payload asli inline + GraphQL) ==="
node test/e2e-fbadlib.js || fail=1

echo "=== 44. Browser E2E: TikTok downloader (TikTok live, file 1080p tersimpan) ==="
node test/e2e-browser-tiktok.js || fail=1

echo "=== 45. Browser E2E: FB Ad Library (tombol per iklan, download HD, scroll GraphQL) ==="
node test/e2e-browser-fbadlib.js || fail=1

echo "=== 46. Test: affiliate ID default 11300901968 (config lama ikut, nilai user aman) ==="
node test/e2e-affid-default.js || fail=1

echo "=== 47. Browser E2E: caption 1 klik walau halaman lazy-load (regresi 'dipencet berkali-kali') ==="
node test/e2e-browser-caption.js || fail=1

echo "=== 48. Test + browser: payout Shopee tercatat, banner merah hilang ==="
node test/e2e-payout.js || fail=1

echo "=== 49. Browser E2E: Ad Library analisa TERBUKTI + pelacak + brief (live) ==="
node test/e2e-browser-fbadlib2.js || fail=1

echo "=== 50. Browser E2E: 🚀 Launch pack (campaign = sub_id, checklist, #rm-launch) ==="
node test/e2e-browser-launch.js || fail=1

if [ "$fail" -eq 0 ]; then
  echo "SEMUA VERIFIKASI LULUS — plugin siap di-load ke Chrome."
else
  echo "ADA YANG GAGAL — lihat output di atas."
fi
exit $fail
