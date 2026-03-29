#!/usr/bin/env python3
"""
Polymarket Elon Musk Tweet Prediction Market Scraper
Scrapes range market prices from Polymarket and saves to Gist
"""

import json
import re
import requests
from datetime import datetime
from typing import Dict, List, Optional

GIST_URL = "https://gist.github.com/coveym/REPLACE_WITH_YOUR_GIST_ID"
GIST_TOKEN = "ghp_REPLACE_WITH_YOUR_GITHUB_TOKEN"
GIST_FILE = "polymarket-data.json"

# Polymarket market slugs for 7-day tweet prediction markets
MARKET_SLUGS = [
    "elon-musk-of-tweets-march-27-april-3",
    "elon-musk-of-tweets-march-31-april-7",
    "elon-musk-of-tweets-april-7-april-14",
]


def scrape_polymarket_page(slug: str) -> Optional[Dict]:
    """Scrape Polymarket page for range market data"""
    url = f"https://polymarket.com/event/{slug}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }

    try:
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        html = response.text

        # Extract JSON data from the page
        # Look for embedded market data
        data = {
            "slug": slug,
            "url": url,
            "scraped_at": datetime.utcnow().isoformat(),
            "ranges": [],
        }

        # Extract price and range data using regex
        # Pattern: "price":"X","groupItemTitle":"100-119"
        price_range_pattern = r'"price":"([0-9.]+)","groupItemTitle":"([^"]+)"'
        matches = re.findall(price_range_pattern, html)

        if matches:
            for price, range_label in matches:
                # Filter for numeric ranges only
                if re.match(r"^\d+-\d+$", range_label):
                    prob = float(price) * 100  # Convert to percentage
                    data["ranges"].append(
                        {
                            "range": range_label,
                            "price": round(prob, 2),
                            "price_raw": price,
                        }
                    )

        # Sort by range
        def sort_key(item):
            range_str = item["range"]
            if range_str.startswith("<"):
                return 0
            elif range_str.endswith("+"):
                return 9999
            else:
                return int(range_str.split("-")[0])

        data["ranges"] = sorted(data["ranges"], key=sort_key)

        # Extract current answer if available
        answer_pattern = r'"answer":"([^"]+)"'
        answer_match = re.search(answer_pattern, html)
        if answer_match:
            data["current_answer"] = answer_match.group(1)

        # Extract market title
        title_pattern = r'"headline":"([^"]+)"'
        title_match = re.search(title_pattern, html)
        if not title_match:
            title_pattern = r"<title>([^<]+)</title>"
            title_match = re.search(title_pattern, html)
        if title_match:
            data["title"] = title_match.group(1)

        return data if data["ranges"] else None

    except Exception as e:
        print(f"Error scraping {slug}: {e}")
        return None


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
        print(f"Scraping {slug}...")
        data = scrape_polymarket_page(slug)
        if data:
            all_data.append(data)
            print(f"  Found {len(data['ranges'])} ranges")
        else:
            print(f"  No data found")

    if all_data:
        # Try to update Gist
        if "coveym" not in GIST_URL or "REPLACE" in GIST_TOKEN:
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
