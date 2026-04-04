#!/usr/bin/env python3
"""
Polymarket Elon Musk Tweet Prediction Market Scraper
Uses Gamma API to get market data and prices
"""

import json
import re
import requests
from datetime import datetime
from typing import Dict, List, Optional

GIST_URL = "https://gist.github.com/Adul9981/d174b4498c408076ff218e164f24807e"
GIST_TOKEN = "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"
GIST_FILE = "polymarket-data.json"

GAMMA_API = "https://gamma-api.polymarket.com"

MARKET_SLUGS = [
    "elon-musk-of-tweets-march-31-april-7",
    "elon-musk-of-tweets-april-3-april-10",
    "elon-musk-of-tweets-april-7-april-14",
]


def get_event_data(slug: str) -> Optional[Dict]:
    """Fetch event data from Gamma API"""
    url = f"{GAMMA_API}/events"
    params = {"slug": slug}

    try:
        response = requests.get(url, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()

        if not data or len(data) == 0:
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
            "scraped_at": datetime.utcnow().isoformat(),
            "ranges": [],
        }
    except Exception as e:
        print(f"Error fetching event {slug}: {e}")
        return None


def extract_range(question: str) -> Optional[str]:
    """Extract range from question text like 'Will Elon Musk post 240-259 tweets...'"""
    match = re.search(r"(\d+-\d+)", question)
    return match.group(1) if match else None


def scrape_polymarket_event(slug: str) -> Optional[Dict]:
    """Scrape complete market data for an event"""
    event_data = get_event_data(slug)
    if not event_data:
        return None

    ranges_data = []
    for market in event_data.get("markets", []):
        question = market.get("question", "")
        range_str = extract_range(question)

        if range_str:
            outcome_prices = market.get("outcomePrices", "[]")
            try:
                prices = (
                    json.loads(outcome_prices)
                    if isinstance(outcome_prices, str)
                    else outcome_prices
                )
                price = float(prices[0]) * 100 if prices else None
            except:
                price = None

            ranges_data.append(
                {
                    "range": range_str,
                    "price": round(price, 2) if price else None,
                    "liquidity": float(market.get("liquidity", 0))
                    if market.get("liquidity")
                    else 0,
                    "slug": market.get("slug", ""),
                }
            )

    # Sort by range
    def sort_key(item):
        range_str = item["range"]
        if "-" in range_str:
            return int(range_str.split("-")[0])
        return 9999

    ranges_data = sorted(ranges_data, key=sort_key)
    event_data["ranges"] = ranges_data

    # Calculate top ranges
    valid_ranges = [r for r in ranges_data if r.get("price")]
    valid_ranges.sort(key=lambda x: x["price"], reverse=True)
    event_data["top_ranges"] = valid_ranges[:3]

    return event_data


def update_gist(data: List[Dict]) -> bool:
    """Update Gist with new data"""
    import urllib.request
    import urllib.parse

    gist_api_url = f"https://api.github.com/gists/{GIST_URL.split('/')[-1]}"

    payload = {
        "description": f"Polymarket Elon Musk Tweet Data - Updated {datetime.utcnow().isoformat()}",
        "files": {
            GIST_FILE: {"content": json.dumps(data, indent=2, ensure_ascii=False)}
        },
    }

    req = urllib.request.Request(
        gist_api_url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"token {GIST_TOKEN}",
            "Accept": "application/vnd.github.v3+json",
            "Content-Type": "application/json",
        },
        method="PATCH",
    )

    try:
        with urllib.request.urlopen(req) as response:
            return response.status == 200
    except Exception as e:
        print(f"Error updating Gist: {e}")
        return False


def main():
    print(f"Scraping Polymarket data at {datetime.utcnow().isoformat()}")

    all_data = []

    for slug in MARKET_SLUGS:
        print(f"Fetching {slug}...")
        data = scrape_polymarket_event(slug)
        if data:
            all_data.append(data)
            print(f"  Found {len(data['ranges'])} ranges")
            if data.get("top_ranges"):
                top = ", ".join(
                    [f"{r['range']}: {r['price']}%" for r in data["top_ranges"]]
                )
                print(f"  Top: {top}")
        else:
            print(f"  No data found")

    if all_data:
        if not GIST_URL or not GIST_TOKEN or "REPLACE" in GIST_TOKEN:
            print("\n⚠️  Gist not configured. Data:")
            print(json.dumps(all_data, indent=2, ensure_ascii=False))
        else:
            if update_gist(all_data):
                print(f"\n✅ Successfully updated Gist with {len(all_data)} markets")
            else:
                print("\n❌ Failed to update Gist")
    else:
        print("\n❌ No data scraped")


if __name__ == "__main__":
    main()
