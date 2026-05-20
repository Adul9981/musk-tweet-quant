#!/usr/bin/env python3
"""
xtracker 数据抓取器
- 每 3 分钟由 GitHub Actions 运行，无梯子问题
- 拉取 elonmusk 活跃追踪列表 + 每条追踪的详细统计
- 结果存入 Gist（xtracker-data.json），前端直接读 Gist
"""

import json
import os
import time
import requests
from datetime import datetime, timezone

GIST_TOKEN = os.getenv("GIST_TOKEN", "")
GIST_ID    = "d174b4498c408076ff218e164f24807e"   # 和 polymarket 共用同一个 Gist
GIST_FILE  = "xtracker-data.json"

BASE_URL = "https://xtracker.polymarket.com"
HEADERS  = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
    "Referer": "https://polymarket.com/",
}


def get(url: str, params: dict = None, retries: int = 3):
    for attempt in range(retries):
        try:
            r = requests.get(url, params=params, headers=HEADERS, timeout=15)
            if r.status_code in (429, 403):
                wait = 2 ** attempt * 3
                print(f"  [{r.status_code}] 等待 {wait}s 重试...")
                time.sleep(wait)
                continue
            r.raise_for_status()
            return r.json()
        except Exception as e:
            print(f"  请求失败（attempt {attempt+1}/{retries}）: {e}")
            time.sleep(2)
    return None


def fetch_trackings():
    print(">> 拉取活跃追踪列表...")
    data = get(f"{BASE_URL}/api/users/elonmusk/trackings", params={"activeOnly": "true"})
    if not data or not data.get("success"):
        print("  ✗ 获取追踪列表失败")
        return []

    all_trackings = data.get("data", [])
    # 只保留 5-10 天的（7天市场）
    seven_day = [
        t for t in all_trackings
        if 5 <= (
            (datetime.fromisoformat(t["endDate"].replace("Z", "+00:00")) -
             datetime.fromisoformat(t["startDate"].replace("Z", "+00:00"))).days
        ) <= 10
    ]
    print(f"  找到 {len(seven_day)} 个 7 天追踪")
    return seven_day[:5]


def fetch_tracking_stats(tracking_id: str):
    print(f"  >> 拉取统计 id={tracking_id}...")
    data = get(f"{BASE_URL}/api/trackings/{tracking_id}", params={"includeStats": "true"})
    if not data or not data.get("success"):
        return None
    return data.get("data")


def save_to_gist(payload: dict):
    if not GIST_TOKEN:
        print("  ⚠ 未设置 GIST_TOKEN，跳过上传")
        return False

    r = requests.patch(
        f"https://api.github.com/gists/{GIST_ID}",
        headers={
            "Authorization": f"token {GIST_TOKEN}",
            "Accept": "application/vnd.github.v3+json",
        },
        json={"files": {GIST_FILE: {"content": json.dumps(payload, ensure_ascii=False)}}},
        timeout=15,
    )
    if r.status_code == 200:
        print(f"  ✓ 已保存到 Gist ({GIST_FILE})")
        return True
    else:
        print(f"  ✗ Gist 保存失败: {r.status_code} {r.text[:200]}")
        return False


def main():
    print(f"=== xtracker 抓取 [{datetime.now(timezone.utc).isoformat()}] ===")

    trackings = fetch_trackings()
    if not trackings:
        print("无活跃追踪，跳过")
        return

    results = []
    for t in trackings:
        stats_data = fetch_tracking_stats(str(t["id"]))

        # 构建和前端期望格式一致的数据
        entry = {
            "id":          t["id"],
            "title":       t.get("title", ""),
            "startDate":   t.get("startDate", ""),
            "endDate":     t.get("endDate", ""),
            "marketLink":  t.get("marketLink", ""),
        }

        if stats_data:
            stats = stats_data.get("stats", {})

            # 处理每日推文数据
            daily_raw  = stats.get("daily", [])
            daily_map  = {}
            for d in daily_raw:
                date_str = d["date"].split("T")[0]
                daily_map[date_str] = daily_map.get(date_str, 0) + d.get("count", 0)
            daily_totals = sorted(
                [{"date": k, "count": v} for k, v in daily_map.items()],
                key=lambda x: x["date"]
            )

            # 计算今日北京时间的推文数
            now_bj    = datetime.now(timezone.utc)
            today_bj  = datetime.fromtimestamp(
                now_bj.timestamp() + 8 * 3600, tz=timezone.utc
            ).strftime("%Y-%m-%d")
            today_total = sum(
                v for k, v in daily_map.items()
                if datetime.fromtimestamp(
                    datetime.fromisoformat(k + "T00:00:00+00:00").timestamp() + 8 * 3600,
                    tz=timezone.utc
                ).strftime("%Y-%m-%d") == today_bj
            )

            now       = datetime.now(timezone.utc)
            end_dt    = datetime.fromisoformat(t["endDate"].replace("Z", "+00:00"))
            diff_ms   = (end_dt - now).total_seconds()
            days_rem  = max(0, int(diff_ms // 86400))
            hours_rem = max(0, int((diff_ms % 86400) // 3600))

            entry["stats"] = {
                "total":           stats.get("total", 0),
                "pace":            round(stats["total"] / stats["daysElapsed"])
                                   if stats.get("daysElapsed", 0) > 0 else 0,
                "percentComplete": stats.get("percentComplete", 0),
                "daysRemaining":   days_rem,
                "hoursRemaining":  hours_rem,
                "todayTotal":      today_total,
                "daysTotal":       stats.get("daysTotal", 7),
                "daily":           daily_totals,
            }
        else:
            entry["stats"] = None

        results.append(entry)

    payload = {
        "success":     True,
        "updatedAt":   datetime.now(timezone.utc).isoformat(),
        "data":        results,
    }

    save_to_gist(payload)
    print("=== 完成 ===")


if __name__ == "__main__":
    main()
