#!/usr/bin/env python3
"""merge_training.py — gabungkan export data training dari banyak kontributor.

Collective-intelligence merge (Fikri kumpulkan seminggu sekali). Baca semua file
`training-*.json` di sebuah folder, gabung, dedup, tulis satu dataset master.

Pemakaian:
    python3 merge_training.py <folder_berisi_json> [output.csv]

Dedup: per (contributor, itemid) — kontributor beda boleh punya produk sama
(itu justru sinyal berharga: hasil beda dari orang beda). Dalam satu kontributor,
capture terbaru menang. Tidak perlu pandas — pure stdlib, jalan di mana saja.
"""
import json
import os
import sys
import csv
import glob


def main():
    if len(sys.argv) < 2:
        print("Pakai: python3 merge_training.py <folder_json> [output.csv]")
        sys.exit(1)
    folder = sys.argv[1]
    out_csv = sys.argv[2] if len(sys.argv) > 2 else os.path.join(folder, "training-master.csv")
    out_json = os.path.splitext(out_csv)[0] + ".json"

    files = sorted(glob.glob(os.path.join(folder, "training-*.json")))
    if not files:
        print(f"Tidak ada file training-*.json di {folder}")
        sys.exit(1)

    # dedup key -> row (latest capture wins within a contributor)
    merged = {}
    contributors = set()
    per_contrib = {}
    for f in files:
        try:
            with open(f, encoding="utf-8") as fh:
                payload = json.load(fh)
        except Exception as e:
            print(f"  ! lewati {os.path.basename(f)}: {e}")
            continue
        rows = payload.get("rows", payload if isinstance(payload, list) else [])
        c = payload.get("contributor", "anon")
        contributors.add(c)
        for r in rows:
            contrib = r.get("contributor", c)
            key = (contrib, r.get("itemid") or r.get("url"))
            prev = merged.get(key)
            # keep the row with the latest updated_at/captured_at
            ts = r.get("updated_at") or r.get("captured_at") or ""
            pts = (prev.get("updated_at") or prev.get("captured_at") or "") if prev else ""
            if prev is None or ts >= pts:
                merged[key] = r
            per_contrib[contrib] = per_contrib.get(contrib, 0) + 1

    rows = list(merged.values())
    if not rows:
        print("Tidak ada baris valid.")
        sys.exit(1)

    # union of all columns (schemas may differ slightly across plugin versions)
    cols = []
    for r in rows:
        for k in r:
            if k not in cols:
                cols.append(k)

    with open(out_csv, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=cols)
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in cols})

    with open(out_json, "w", encoding="utf-8") as fh:
        json.dump({"schema": "syabab-affiliathor/training-master-v1",
                   "count": len(rows),
                   "contributors": sorted(contributors),
                   "rows": rows}, fh, indent=2, ensure_ascii=False)

    print(f"Gabung {len(files)} file dari {len(contributors)} kontributor")
    print(f"  kontributor: {', '.join(sorted(contributors))}")
    print(f"  total baris unik: {len(rows)}")
    with_cat = sum(1 for r in rows if r.get("category_l1"))
    with_rating = sum(1 for r in rows if r.get("rating") not in (None, ""))
    print(f"  ada kategori: {with_cat} · ada rating: {with_rating}")
    print(f"  -> {out_csv}")
    print(f"  -> {out_json}")
    # readiness signal for modelling
    if len(rows) >= 200:
        print("  ✅ >=200 baris: cukup untuk mulai coba model fitur (GBT/regresi).")
    else:
        print(f"  ⏳ {len(rows)}/200 baris menuju ambang model fitur. Terus kumpulkan.")


if __name__ == "__main__":
    main()
