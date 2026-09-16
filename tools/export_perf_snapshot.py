#!/usr/bin/env python3
"""Export a PERFORMANCE SNAPSHOT for the syabab-affiliathor plugin.

Reads the analysis masters (read-only) and writes a NEW json file into the
plugin's own folder. The plugin never touches affiliate_dashboard.xlsx or
_data/ — it only imports this snapshot, so the boundary Fikri set is kept.

What the snapshot carries, per Shopee tag:
  clicks, orders, commission, spend, conversionRate (orders/clicks),
  epc (commission/click), roas (commission/spend), verdict
plus global averages used as a fallback for unseen products.

The plugin uses this to replace the flat 4% conversion assumption with REAL
numbers, to boost products resembling proven winners, and to flag products
resembling proven zero-converters.
"""
import json
import os
import sys
import importlib.util
import pandas as pd

# Paths are auto-detected so this runs on any machine:
#   1) CLI args:  export_perf_snapshot.py [ANALISIS_DIR] [OUT_JSON]
#   2) env vars:  SYABAB_ANALISIS_DIR / SYABAB_SNAPSHOT_OUT
#   3) fallback:  this script's own directory, sibling riset-plugin/export/
_HERE = os.path.dirname(os.path.abspath(__file__))
BASE = (sys.argv[1] if len(sys.argv) > 1
        else os.environ.get("SYABAB_ANALISIS_DIR") or _HERE)
_DEFAULT_OUT = os.path.join(os.path.dirname(BASE), "riset-plugin", "export",
                            "performance-snapshot.json")
OUT = (sys.argv[2] if len(sys.argv) > 2
       else os.environ.get("SYABAB_SNAPSHOT_OUT") or _DEFAULT_OUT)

# Minimum clicks before a tag's conversion rate is trustworthy at all.
MIN_CLICKS_TRUST = 25


def load_campaign_map():
    spec = importlib.util.spec_from_file_location(
        "ia_export", os.path.join(BASE, "ingest_affiliate.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.campaign_to_tag


def main():
    campaign_to_tag = load_campaign_map()
    tag_daily = pd.read_csv(os.path.join(BASE, "_data", "tag_daily.csv"))
    ads = pd.read_csv(os.path.join(BASE, "_data", "ads_daily.csv"))

    # Shopee side per tag
    sh = tag_daily.groupby("tag", as_index=False).agg(
        clicks=("clicks", "sum"), orders=("orders", "sum"),
        commission=("commission", "sum"))

    # Meta spend per tag (SUM per tag first — several campaigns feed one tag)
    ads = ads[ads["spend"] > 0].copy()
    ads["tag"] = ads["campaign"].map(campaign_to_tag)
    sp = (ads[ads["tag"].notna()].groupby("tag", as_index=False)["spend"].sum())

    df = sh.merge(sp, on="tag", how="left").fillna({"spend": 0})

    tags = {}
    for _, r in df.iterrows():
        clicks = int(r["clicks"]); orders = int(r["orders"])
        comm = float(r["commission"]); spend = float(r["spend"])
        conv = (orders / clicks) if clicks > 0 else None
        epc = (comm / clicks) if clicks > 0 else None
        roas = (comm / spend) if spend > 0 else None
        if roas is None:
            verdict = "no-spend"
        elif roas >= 1.5:
            verdict = "winner"
        elif roas >= 1.0:
            verdict = "profitable"
        elif roas >= 0.5:
            verdict = "thin"
        else:
            verdict = "loser"
        # a tag with real traffic and zero orders is a proven zero-converter
        if clicks >= MIN_CLICKS_TRUST and orders == 0:
            verdict = "zero-converter"
        tags[str(r["tag"])] = {
            "clicks": clicks, "orders": orders,
            "commission": round(comm), "spend": round(spend),
            "conversionRate": round(conv * 100, 2) if conv is not None else None,
            "epc": round(epc, 1) if epc is not None else None,
            "roas": round(roas, 2) if roas is not None else None,
            "trusted": clicks >= MIN_CLICKS_TRUST,
            "verdict": verdict,
        }

    tc, to = int(df["clicks"].sum()), int(df["orders"].sum())
    gc = float(df["commission"].sum()); gs = float(df["spend"].sum())
    snapshot = {
        "generatedAt": pd.Timestamp.now().isoformat(timespec="seconds"),
        "source": "syabab affiliate masters (read-only export)",
        "global": {
            "clicks": tc, "orders": to,
            "conversionRate": round(to / tc * 100, 2) if tc else None,
            "epc": round(gc / tc, 1) if tc else None,
            "roas": round(gc / gs, 2) if gs else None,
            "commission": round(gc), "spend": round(gs),
        },
        "minClicksTrust": MIN_CLICKS_TRUST,
        "tags": tags,
    }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(snapshot, f, indent=2)

    g = snapshot["global"]
    print(f"wrote {OUT}")
    print(f"global: {g['clicks']} klik, {g['orders']} order, "
          f"conversion {g['conversionRate']}%, EPC Rp {g['epc']}, ROAS {g['roas']}")
    print(f"tags: {len(tags)}")
    for name, t in sorted(tags.items(), key=lambda kv: -(kv[1]['roas'] or 0))[:8]:
        print(f"  {name:20} conv={str(t['conversionRate']):>6}%  roas={str(t['roas']):>5}  "
              f"{t['verdict']}{'' if t['trusted'] else '  (data tipis)'}")


if __name__ == "__main__":
    main()
