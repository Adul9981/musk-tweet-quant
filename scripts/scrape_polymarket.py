#!/usr/bin/env python3
"""
Polymarket Elon Musk Tweet Prediction Market Scraper
- Auto-discovers active 7-day tweet markets via Gamma API (dynamic fallback)
- Detects significant price changes (>= 10%) on high-value ranges → Telegram alert
- Appends price snapshots to polymarket-history.json for full-duration chart
"""

import json
import os
import re
import requests
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

GIST_TOKEN = os.getenv("GIST_TOKEN", "")
GIST_ID = "d174b4498c408076ff218e164f24807e"
GIST_FILE = "polymarket-data.json"
GIST_HISTORY_FILE = "polymarket-history.json"
GAMMA_API = "https://gamma-api.polymarket.com"

ALERT_THRESHOLD = 10.0       # Absolute price change (pp) to trigger alert
MIN_PRICE_TO_MONITOR = 5.0   # Minimum market price (%) to be considered "high-value"
MIN_LIQUIDITY = 500.0        # Min liquidity (USDC) to be considered "high-liquidity"
HISTORY_MAX_SNAPSHOTS = 2500 # ≈ 8 days at 5-min intervals


# ─── Market Discovery ─────────────────────────────────────────────────────────

_MONTHS = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
]


def generate_candidate_slugs() -> List[str]:
    """
    Generate every-day-start candidates with 7-day duration, covering
    start dates from 14 days ago to 10 days ahead.
    Handles irregular/overlapping market schedules (not limited to Fridays).
    """
    now = datetime.now(timezone.utc)
    seen: set = set()
    slugs: List[str] = []
    for days_offset in range(-14, 11):
        start = now + timedelta(days=days_offset)
        end = start + timedelta(days=7)
        slug = (
            f"elon-musk-of-tweets-"
            f"{_MONTHS[start.month - 1]}-{start.day}-"
            f"{_MONTHS[end.month - 1]}-{end.day}"
        )
        if slug not in seen:
            seen.add(slug)
            slugs.append(slug)
    return slugs


def discover_market_slugs() -> List[str]:
    """
    Discover all currently active Elon Musk tweet prediction markets.

    Polymarket runs these markets with irregular (non-Friday) start dates,
    sometimes with 2-3 overlapping 7-day windows simultaneously.

    Strategy A — Gamma API broad active search (fastest, catches all):
      Fetch all active events, filter by title/slug for Elon tweet markets.
      This is the most reliable method since there's no dedicated tag.

    Strategy B — Every-day slug probe (fallback if API search misses any):
      Directly test each candidate slug against Gamma API.
    """
    now = datetime.now(timezone.utc)
    url = f"{GAMMA_API}/events"
    found: List[str] = []

    # ── Strategy A: Gamma API broad active search ─────────────────────────────
    print("[discovery] Querying Gamma API for active Elon tweet markets...")
    for params in [
        {"active": "true", "closed": "false", "limit": "100",
         "order": "endDate", "ascending": "true"},
        {"active": "true", "closed": "false", "archived": "false", "limit": "200"},
    ]:
        try:
            resp = requests.get(url, params=params, timeout=30)
            if not resp.ok:
                continue
            slugs = _filter_tweet_markets(resp.json(), now)
            for s in slugs:
                if s not in found:
                    found.append(s)
            if found:
                break  # Got results from first query
        except Exception as exc:
            print(f"[discovery] Gamma API search error: {exc}")

    if found:
        print(f"[discovery] Strategy A found {len(found)} market(s): {found}")
        return found

    # ── Strategy B: Probe every-day candidates ────────────────────────────────
    print("[discovery] Strategy A found nothing — probing candidate slugs...")
    candidates = generate_candidate_slugs()
    print(f"[discovery] Testing {len(candidates)} candidates...")

    for slug in candidates:
        try:
            resp = requests.get(url, params={"slug": slug}, timeout=10)
            if not resp.ok:
                continue
            data = resp.json()
            if not (data and isinstance(data, list)):
                continue
            event = data[0]
            end_str = event.get("endDate") or event.get("end_date", "")
            if end_str and not event.get("closed", False):
                end = datetime.fromisoformat(end_str.replace("Z", "+00:00"))
                if end > now and slug not in found:
                    found.append(slug)
                    print(f"[discovery] ✓ {slug} (ends {end.strftime('%m-%d %H:%M')} UTC)")
        except Exception as exc:
            print(f"[discovery] Probe error {slug}: {exc}")

    if found:
        print(f"[discovery] Strategy B found {len(found)} market(s): {found}")
        return found

    print("[discovery] No active markets found — skipping this run.")
    return []


def _filter_tweet_markets(events: List[Dict], now: datetime) -> List[str]:
    """Filter Gamma event list for active Elon tweet markets."""
    slugs = []
    for event in events:
        title = (event.get("title") or "").lower()
        slug = event.get("slug") or ""
        slug_lower = slug.lower()
        if not slug:
            continue
        if not (("elon" in title or "elon-musk" in slug_lower) and
                ("tweet" in title or "post" in title)):
            continue
        end_str = event.get("endDate") or event.get("end_date", "")
        if not end_str:
            continue
        try:
            end = datetime.fromisoformat(end_str.replace("Z", "+00:00"))
            if end > now and not event.get("closed", False):
                slugs.append(slug)
        except Exception:
            pass
    return slugs


# ─── Gist I/O ─────────────────────────────────────────────────────────────────

def _gist_headers() -> Dict[str, str]:
    return {
        "Authorization": f"token {GIST_TOKEN}",
        "Accept": "application/vnd.github.v3+json",
    }


def get_current_gist_files() -> Dict[str, str]:
    """
    Return a dict of {filename: content_string} for all files in the Gist.
    Used to read both polymarket-data.json and polymarket-history.json.
    """
    if not GIST_TOKEN:
        return {}
    try:
        resp = requests.get(
            f"https://api.github.com/gists/{GIST_ID}",
            headers=_gist_headers(),
            timeout=30,
        )
        if resp.ok:
            files = resp.json().get("files", {})
            return {name: info.get("content", "") for name, info in files.items()}
    except Exception as exc:
        print(f"[gist] Failed to read files: {exc}")
    return {}


def get_current_gist_data() -> List[Dict]:
    """Read polymarket-data.json from Gist (used for price-change comparison)."""
    files = get_current_gist_files()
    content = files.get(GIST_FILE, "")
    if content:
        try:
            return json.loads(content)
        except Exception:
            pass
    return []


def update_gist(data: List[Dict], history_snapshots: List[Dict]) -> bool:
    """Write polymarket-data.json and polymarket-history.json to the Gist in one call."""
    if not GIST_TOKEN:
        print("[gist] No GIST_TOKEN — skipping update")
        return False

    history_payload = {
        "version": 2,
        "updated_at": datetime.utcnow().isoformat() + "Z",
        "snapshots": history_snapshots,
    }

    try:
        resp = requests.patch(
            f"https://api.github.com/gists/{GIST_ID}",
            json={
                "description": f"Polymarket Elon Musk Tweet Data — {datetime.utcnow().isoformat()}Z",
                "files": {
                    GIST_FILE: {
                        "content": json.dumps(data, indent=2, ensure_ascii=False)
                    },
                    GIST_HISTORY_FILE: {
                        "content": json.dumps(history_payload, ensure_ascii=False)
                    },
                },
            },
            headers=_gist_headers(),
            timeout=30,
        )
        return resp.status_code == 200
    except Exception as exc:
        print(f"[gist] Update failed: {exc}")
        return False


# ─── History Snapshot Management ──────────────────────────────────────────────

def load_history_snapshots(gist_files: Dict[str, str]) -> List[Dict]:
    """
    Read and parse existing history snapshots from polymarket-history.json.
    Returns a list of snapshot dicts, newest first trimmed to max size.
    """
    content = gist_files.get(GIST_HISTORY_FILE, "")
    if not content:
        return []
    try:
        parsed = json.loads(content)
        snaps = parsed.get("snapshots", [])
        return snaps if isinstance(snaps, list) else []
    except Exception as exc:
        print(f"[history] Failed to parse history: {exc}")
        return []


def build_snapshot(all_data: List[Dict]) -> Dict:
    """
    Create a compact price snapshot from the freshly scraped data.
    Format: {"ts": <unix_ms>, "markets": [{"slug": ..., "ranges": [{"r":..,"p":..,"l":..}]}]}
    """
    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    markets_snap = []
    for market in all_data:
        ranges_snap = [
            {
                "r": rng.get("range", ""),
                "p": round(rng.get("price") or 0, 2),
                "l": round(rng.get("liquidity") or 0, 0),
            }
            for rng in market.get("ranges", [])
            if rng.get("price") is not None
        ]
        if ranges_snap:
            markets_snap.append({
                "slug": market.get("slug", ""),
                "ranges": ranges_snap,
            })
    return {"ts": now_ms, "markets": markets_snap}


def append_snapshot(existing: List[Dict], new_snap: Dict) -> List[Dict]:
    """
    Append new snapshot, deduplicate within 2-minute windows, trim to max size.
    """
    TWO_MIN_MS = 2 * 60 * 1000
    # Skip if a snapshot with very close timestamp already exists
    new_ts = new_snap.get("ts", 0)
    for snap in existing[-5:]:  # Only check last 5 to keep it fast
        if abs(snap.get("ts", 0) - new_ts) < TWO_MIN_MS:
            print(f"[history] Skipping duplicate snapshot (within 2 min)")
            return existing

    updated = existing + [new_snap]
    # Trim oldest entries to stay within max
    if len(updated) > HISTORY_MAX_SNAPSHOTS:
        updated = updated[-HISTORY_MAX_SNAPSHOTS:]
    return updated


# ─── Price Change Alerts ──────────────────────────────────────────────────────

def check_price_changes(
    old_data: List[Dict], new_data: List[Dict]
) -> List[Tuple[str, List[str]]]:
    """
    Compare new vs old prices. Alert on high-value ranges with >= ALERT_THRESHOLD change.
    'High-value' = price >= MIN_PRICE_TO_MONITOR OR liquidity >= MIN_LIQUIDITY.
    """
    market_alerts: List[Tuple[str, List[str]]] = []

    for new_market in new_data:
        slug = new_market.get("slug")
        old_market = next((m for m in old_data if m.get("slug") == slug), None)
        if not old_market:
            continue

        old_ranges = {
            r["range"]: r
            for r in old_market.get("ranges", [])
            if r.get("price") is not None
        }

        alerts: List[str] = []
        for rng in new_market.get("ranges", []):
            name = rng.get("range")
            new_price = rng.get("price")
            liquidity = rng.get("liquidity", 0) or 0

            if not name or new_price is None:
                continue
            old_rng = old_ranges.get(name)
            if not old_rng or old_rng.get("price") is None:
                continue

            old_price = old_rng["price"]
            is_high_value = (
                new_price >= MIN_PRICE_TO_MONITOR
                or old_price >= MIN_PRICE_TO_MONITOR
                or liquidity >= MIN_LIQUIDITY
            )
            if not is_high_value:
                continue

            change = new_price - old_price
            if abs(change) >= ALERT_THRESHOLD:
                arrow = "📈" if change > 0 else "📉"
                alerts.append(
                    f"  {arrow} [{name}]: {old_price:.1f}% → {new_price:.1f}%  ({change:+.1f}%)"
                )

        if alerts:
            title = new_market.get("title") or slug or "Unknown Market"
            market_alerts.append((title, alerts))

    return market_alerts


def send_telegram(message: str) -> bool:
    """Send a Markdown-formatted message via Telegram bot."""
    token = os.getenv("TELEGRAM_BOT_TOKEN", "")
    chat_id = os.getenv("TELEGRAM_CHAT_ID", "")

    if not token or not chat_id:
        print(f"[telegram] Not configured. Alert:\n{message}")
        return False

    try:
        resp = requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={
                "chat_id": chat_id,
                "text": message,
                "parse_mode": "Markdown",
                "disable_web_page_preview": True,
            },
            timeout=10,
        )
        if resp.ok:
            print("[telegram] Alert sent")
        else:
            print(f"[telegram] Failed: {resp.status_code} {resp.text[:200]}")
        return resp.ok
    except Exception as exc:
        print(f"[telegram] Error: {exc}")
        return False


# ─── Polymarket Scraping ──────────────────────────────────────────────────────

def get_event_data(slug: str) -> Optional[Dict]:
    """Fetch raw event data from Gamma API by slug."""
    try:
        resp = requests.get(
            f"{GAMMA_API}/events",
            params={"slug": slug},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        if not data:
            return None
        event = data[0]
        return {
            "slug": slug,
            "title": event.get("title"),
            "volume": event.get("volume"),
            "liquidity": event.get("liquidity"),
            "start_date": event.get("startDate"),
            "end_date": event.get("endDate"),
            "markets": event.get("markets", []),
            "scraped_at": datetime.utcnow().isoformat() + "Z",
            "ranges": [],
        }
    except Exception as exc:
        print(f"[scrape] Error fetching '{slug}': {exc}")
        return None


def extract_range(question: str) -> Optional[str]:
    match = re.search(r"(\d+-\d+|\d+\+)", question)
    return match.group(1) if match else None


def scrape_polymarket_event(slug: str) -> Optional[Dict]:
    """Scrape all range data for a single event slug."""
    event_data = get_event_data(slug)
    if not event_data:
        return None

    ranges_data: List[Dict] = []
    for market in event_data.get("markets", []):
        range_str = extract_range(market.get("question", ""))
        if not range_str:
            continue

        outcome_prices = market.get("outcomePrices", "[]")
        try:
            prices = (
                json.loads(outcome_prices)
                if isinstance(outcome_prices, str)
                else outcome_prices
            )
            price = round(float(prices[0]) * 100, 2) if prices else None
        except Exception:
            price = None

        ranges_data.append({
            "range": range_str,
            "price": price,
            "liquidity": float(market.get("liquidity") or 0),
            "slug": market.get("slug", ""),
        })

    ranges_data.sort(
        key=lambda x: int(x["range"].split("-")[0])
        if "-" in x["range"]
        else int(x["range"].replace("+", "")) if "+" in x["range"]
        else 9999
    )
    event_data["ranges"] = ranges_data

    valid = [r for r in ranges_data if r.get("price") is not None]
    event_data["top_ranges"] = sorted(valid, key=lambda x: x["price"], reverse=True)[:3]
    return event_data


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    print(f"[main] Started at {datetime.utcnow().isoformat()}Z")

    # 1. Auto-discover active markets
    slugs = discover_market_slugs()
    if not slugs:
        print("[main] No markets found — nothing to do")
        return

    # 2. Read current Gist (data + history) before overwriting
    print("[main] Reading current Gist files...")
    gist_files = get_current_gist_files()
    old_data_str = gist_files.get(GIST_FILE, "")
    old_data: List[Dict] = []
    if old_data_str:
        try:
            old_data = json.loads(old_data_str)
        except Exception:
            pass

    existing_snapshots = load_history_snapshots(gist_files)
    print(f"[history] Loaded {len(existing_snapshots)} existing snapshots")

    # 3. Scrape fresh data
    all_data: List[Dict] = []
    for slug in slugs:
        print(f"[scrape] Fetching '{slug}'...")
        result = scrape_polymarket_event(slug)
        if result:
            all_data.append(result)
            top = ", ".join(
                f"{r['range']}: {r['price']}%"
                for r in (result.get("top_ranges") or [])
            )
            print(f"  ✓ {len(result['ranges'])} ranges | top: {top or '—'}")
        else:
            print(f"  ✗ No data returned")

    if not all_data:
        print("[main] Nothing scraped — aborting")
        return

    # 4. Check for price-change alerts
    if old_data:
        market_alerts = check_price_changes(old_data, all_data)
        if market_alerts:
            sections = []
            for title, lines in market_alerts:
                sections.append(f"*{title}*\n" + "\n".join(lines))
            message = "🚨 *Polymarket 价格大幅波动预警*\n\n" + "\n\n".join(sections)
            send_telegram(message)
        else:
            print("[main] No significant price changes")
    else:
        print("[main] No previous data — skipping price comparison")

    # 5. Build and append history snapshot
    new_snapshot = build_snapshot(all_data)
    updated_snapshots = append_snapshot(existing_snapshots, new_snapshot)
    print(f"[history] Total snapshots after append: {len(updated_snapshots)}")

    # 6. Write both files to Gist
    if update_gist(all_data, updated_snapshots):
        print(f"[main] Gist updated: {len(all_data)} markets, {len(updated_snapshots)} history points")
    else:
        print("[main] Gist update failed")
        print(json.dumps(all_data, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
