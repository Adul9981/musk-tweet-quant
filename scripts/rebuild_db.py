#!/usr/bin/env python3
"""Rebuild the local database from the GitHub Gist snapshot (one command).

Exports the app's three data files (Polymarket market data, price history,
xtracker tweet stats) from the Gist into ./data/ and prints a freshness
summary. This makes the new project independent of the live gist at runtime;
the app can read ./data directly or via /api/gist-data.

Usage:
    python3 scripts/rebuild_db.py            # download from gist
    python3 scripts/rebuild_db.py --offline  # just validate local ./data
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
GIST_ID = "d174b4498c408076ff218e164f24807e"
FILES = [
    "polymarket-data.json",
    "polymarket-history.json",
    "xtracker-data.json",
]


def download(url: str, dest: Path) -> int:
    req = urllib.request.Request(url, headers={"User-Agent": "musk-tweet-quant-v2"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        body = resp.read()
    dest.write_bytes(body)
    return len(body)


def summarize(name: str, path: Path) -> str:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001
        return f"{name}: ❌ 解析失败（{exc}）"
    if name == "polymarket-data.json" and isinstance(data, list):
        return f"{name}: {len(data)} 个市场事件 · 更新时间 {data[0].get('scraped_at', '?')}"
    if name == "polymarket-history.json" and isinstance(data, dict):
        return f"{name}: {len(data.get('snapshots', []))} 个价格快照 · 更新时间 {data.get('updated_at', '?')}"
    if name == "xtracker-data.json" and isinstance(data, dict):
        return f"{name}: {len(data.get('data', []))} 个跟踪市场 · 更新时间 {data.get('updatedAt', '?')}"
    return f"{name}: 结构未知（{type(data).__name__}）"


def main() -> int:
    parser = argparse.ArgumentParser(description="Rebuild local database from gist.")
    parser.add_argument("--offline", action="store_true", help="validate local data only")
    args = parser.parse_args()

    DATA_DIR.mkdir(exist_ok=True)
    if not args.offline:
        base = f"https://gist.githubusercontent.com/Adul9981/{GIST_ID}/raw"
        for name in FILES:
            dest = DATA_DIR / name
            try:
                size = download(f"{base}/{name}", dest)
                print(f"✅ {name}: {size / 1024:.0f} KB")
            except Exception as exc:  # noqa: BLE001
                print(f"❌ {name}: {exc}", file=sys.stderr)
                return 1

    print("\n数据概况：")
    for name in FILES:
        path = DATA_DIR / name
        if path.exists():
            print("  " + summarize(name, path))
        else:
            print(f"  {name}: 缺失（请先联网重建）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
