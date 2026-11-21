#!/usr/bin/env python3
"""Low-price and rebound watch alerts for the active Musk tweet market.

The service only sends notifications and writes an audit trail. It never places
orders or touches wallet credentials.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

from musk_tgbot import (
    bj_now,
    compute_mu,
    fetch_tracking_stats,
    parse_range,
    poisson_prob,
    send_tg,
)


GAMMA = "https://gamma-api.polymarket.com"
CLOB = "https://clob.polymarket.com"
STATE_DIR = Path(os.environ.get("MUSK_ALERT_STATE_DIR", "/var/lib/musk-quant"))
STATE_FILE = STATE_DIR / "watch-state.json"
EVENTS_FILE = STATE_DIR / "watch-events.jsonl"
LOW_PRICE = float(os.environ.get("MUSK_LOW_PRICE_CENTS", "10"))
REBOUND_CENTS = float(os.environ.get("MUSK_REBOUND_CENTS", "2"))
MIN_HOURS_REMAINING = float(os.environ.get("MUSK_MIN_HOURS_REMAINING", "6"))
MAX_HOURS_REMAINING = float(os.environ.get("MUSK_MAX_HOURS_REMAINING", "72"))
ENTRY_WINDOW_HOURS = float(os.environ.get("MUSK_ENTRY_WINDOW_HOURS", "76"))
ENTRY_WINDOW_MIN_HOURS = float(os.environ.get("MUSK_ENTRY_WINDOW_MIN_HOURS", "48"))
POLL_SECONDS = max(30, int(os.environ.get("MUSK_ALERT_POLL_SECONDS", "60")))
RANGE_ID = re.compile(r"(\d+)\s*-\s*(\d+)")
RANGE_PLUS = re.compile(r"(\d+)\s*\+")


def fetch_json(url):
    request = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
            "Accept": "application/json",
        },
    )
    with urlopen(request, timeout=20) as response:
        return json.loads(response.read())


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).replace(microsecond=0).isoformat()


def parse_json_field(value):
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return []
    return value or []


def event_hours_remaining(end_date: str) -> float:
    try:
        end = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
        return max(0.0, (end - utc_now()).total_seconds() / 3600)
    except (TypeError, ValueError):
        return 0.0


def discover_active_event():
    candidates = []
    try:
        payload = fetch_json(
            f"{GAMMA}/events?active=true&closed=false&limit=200&order=endDate&ascending=true"
        )
        for event in payload if isinstance(payload, list) else []:
            slug = str(event.get("slug") or "")
            title = str(event.get("title") or "")
            if "elon-musk-of-tweets" not in slug and "Musk # tweets" not in title:
                continue
            if event.get("closed") or event.get("archived"):
                continue
            hours = event_hours_remaining(str(event.get("endDate") or ""))
            if hours > 0:
                candidates.append((hours, event))
    except Exception:
        pass

    # Gamma's list endpoint can return 406 to some clients. Exact weekly slugs
    # are stable and remain a reliable fallback.
    if not candidates:
        today = utc_now().date()
        months = [
            "january", "february", "march", "april", "may", "june",
            "july", "august", "september", "october", "november", "december",
        ]
        for offset in range(-10, 2):
            start = today.fromordinal(today.toordinal() + offset)
            end = start.fromordinal(start.toordinal() + 7)
            slug = (
                f"elon-musk-of-tweets-{months[start.month - 1]}-{start.day}-"
                f"{months[end.month - 1]}-{end.day}-{end.year}"
            )
            try:
                payload = fetch_json(f"{GAMMA}/events?slug={slug}")
            except Exception:
                continue
            if not isinstance(payload, list) or not payload:
                continue
            event = payload[0]
            hours = event_hours_remaining(str(event.get("endDate") or ""))
            if hours > 0 and not event.get("closed"):
                candidates.append((hours, event))

    candidates.sort(key=lambda item: item[0])
    return candidates[0][1] if candidates else None


def normalize_market(event):
    end_date = str(event.get("endDate") or "")
    ranges = []
    for market in event.get("markets") or []:
        if market.get("closed") or market.get("archived"):
            continue
        question = str(market.get("question") or "")
        match = RANGE_ID.search(question)
        if match:
            low, high = int(match.group(1)), int(match.group(2))
            label = f"{low}-{high}"
        else:
            match = RANGE_PLUS.search(question)
            if not match:
                continue
            low = int(match.group(1))
            high = low + 999
            label = f"{low}+"
        prices = parse_json_field(market.get("outcomePrices"))
        token_ids = parse_json_field(market.get("clobTokenIds"))
        try:
            price = round(float(prices[0]) * 100, 2)
        except (IndexError, TypeError, ValueError):
            continue
        ranges.append(
            {
                "range": label,
                "parsed": (low, high),
                "price": price,
                "liquidity": float(market.get("liquidity") or 0),
                "slug": market.get("slug") or "",
                "token_id": token_ids[0] if token_ids else None,
            }
        )
    ranges.sort(key=lambda row: row["parsed"][0])
    return {
        "slug": event.get("slug") or "",
        "title": event.get("title") or "",
        "end_date": end_date,
        "hours_remaining": event_hours_remaining(end_date),
        "ranges": ranges,
        "event_url": f"https://polymarket.com/event/{event.get('slug', '')}",
    }


def analyze_ranges(market, mu):
    total_probability = 0.0
    rows = []
    for row in market["ranges"]:
        probability = poisson_prob(row["parsed"][0], row["parsed"][1], mu)
        total_probability += probability
        rows.append({**row, "raw_probability": probability})
    for row in rows:
        row["model_probability"] = (
            row["raw_probability"] / total_probability * 100
            if total_probability > 0
            else 0.0
        )
        row["vr"] = (
            row["model_probability"] / row["price"] if row["price"] > 0 else 0.0
        )
    return rows


def clob_history(token_id: str, limit_minutes: int = 180):
    if not token_id:
        return []
    url = f"{CLOB}/prices-history?market={token_id}&interval=1d&fidelity=1"
    try:
        payload = fetch_json(url)
    except Exception:
        return []
    cutoff = utc_now().timestamp() - limit_minutes * 60
    return [
        {"ts": int(point["t"]), "price": round(float(point["p"]) * 100, 2)}
        for point in payload.get("history", [])
        if int(point.get("t", 0)) >= cutoff
    ]


def load_state():
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            pass
    return {"period": "", "ranges": {}, "last_error": None}


def save_state(state):
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    tmp = STATE_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(STATE_FILE)


def record(signal):
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    with EVENTS_FILE.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(signal, ensure_ascii=False) + "\n")


def cooldown_ok(row, kind, seconds):
    last = row.get(f"{kind}_sent_at")
    if not last:
        return True
    try:
        return (utc_now() - datetime.fromisoformat(last)).total_seconds() >= seconds
    except ValueError:
        return True


def history_min(history, minutes):
    cutoff = utc_now().timestamp() - minutes * 60
    values = [p for p in history if p["ts"] >= cutoff]
    if not values:
        return None
    return min(values, key=lambda point: point["price"])


def center_row(rows, mu):
    if not rows:
        return None
    for row in rows:
        if row["parsed"][0] <= mu <= row["parsed"][1]:
            return row
    return min(rows, key=lambda row: abs(sum(row["parsed"]) / 2 - mu))


def coverage_rows(rows, center):
    if not center:
        return []
    ordered = sorted(rows, key=lambda row: row["parsed"][0])
    index = next(
        (i for i, row in enumerate(ordered) if row["range"] == center["range"]),
        None,
    )
    if index is None:
        return [center]
    return ordered[max(0, index - 1):index + 2]


def format_coverage(rows, center):
    lines = []
    for row in coverage_rows(rows, center):
        marker = " ◀ 中心" if center and row["range"] == center["range"] else ""
        lines.append(
            f"`{row['range']}`  YES {row['price']:.1f}¢  "
            f"概率 {row['model_probability']:.1f}%  VR {row['vr']:.2f}{marker}"
        )
    return "\n".join(lines) if lines else "当前区间数据不足"


def send_entry_window(market, rows, center, mu, stats, meta):
    daily = float(meta.get("blended_daily") or 0)
    deviation = float(meta.get("deviation_pct") or 0)
    message = (
        f"🟡 *进入 T-3 建仓观察窗口 · 约 {market['hours_remaining']:.0f} 小时到期*\n"
        "━━━━━━━━━━━━━━━━━━━━\n"
        f"当前推文：{stats.get('total', 0)} 条  预测落点：~{mu:.0f} 条\n"
        f"近期节奏：{daily:.0f} 条/天（偏差 {deviation:+.0f}%）\n\n"
        f"🎯 *当前覆盖结构*\n{format_coverage(rows, center)}\n\n"
        "📚 *历史回测参考（近13期）*\n"
        "• T-3：±1档覆盖 54%\n"
        "• T-2：±1档覆盖 69%\n"
        "• T-1：±1档覆盖 85%\n\n"
        "💡 *提醒含义*\n"
        "• 现在适合开始关注并评估轻仓，不建议直接满仓。\n"
        "• 优先看中心区间与下方一档；若中心价格 >35¢ 且 VR<1，"
        "不要追中心，改比相邻区间。\n"
        "• 到 T-2/T-1 再根据落点和价格决定是否加仓。\n"
        "• 仅为提醒，不会自动买入。\n"
        f"[打开市场]({market['event_url']})"
    )
    return send_tg(message)


def send_center_drift(market, rows, center, old_center, old_mu, mu, meta):
    direction = "上移" if mu >= old_mu else "下移"
    delta = mu - old_mu
    center_text = (
        f"{old_center or '—'} → {center['range']}"
        if center and old_center != center["range"]
        else center["range"] if center else "—"
    )
    message = (
        "⚠️ *落点发生变化 · 建议重新检查对应区间*\n"
        "━━━━━━━━━━━━━━━━━━━━\n"
        f"预测落点：{old_mu:.1f} → {mu:.1f} 条（{direction} {delta:+.1f}）\n"
        f"中心区间：{center_text}\n"
        f"剩余时间：{market['hours_remaining']:.1f} 小时\n"
        f"近期节奏偏差：{float(meta.get('deviation_pct') or 0):+.0f}%\n\n"
        f"📋 *更新后的关注结构*\n{format_coverage(rows, center)}\n\n"
        "历史参考：T-1 ±1档覆盖约85%，但中心单档仅约38%，"
        "因此优先检查中心上下相邻区间，不要把注意力只放在单一区间。\n\n"
        "⚠️ 这是区间变化提醒，不是自动买入指令。\n"
        f"[打开市场]({market['event_url']})"
    )
    return send_tg(message)


def send_watch(market, row, mu):
    no_price = max(0.0, 100.0 - row["price"])
    message = (
        "👀 *低价区间进入关注区*\n"
        "━━━━━━━━━━━━━━━━━━━━\n"
        f"区间：`{row['range']}`\n"
        f"YES：{row['price']:.1f}¢  NO：{no_price:.0f}¢\n"
        f"模型概率：{row['model_probability']:.1f}%  VR：{row['vr']:.2f}x\n"
        f"当前落点：~{mu:.0f}条  剩余：{market['hours_remaining']:.1f}h\n\n"
        "状态：价格已进入低价观察区，先观察是否止跌，不追跌。\n"
        f"[打开市场]({market['event_url']})"
    )
    return send_tg(message)


def send_rebound(market, row, mu, recent_low):
    rise = row["price"] - recent_low["price"]
    low_time = datetime.fromtimestamp(recent_low["ts"], timezone.utc).astimezone(
        timezone.utc
    )
    message = (
        "🚨 *低价区间反弹确认*\n"
        "━━━━━━━━━━━━━━━━━━━━\n"
        f"区间：`{row['range']}`\n"
        f"当前：{row['price']:.1f}¢  近30分钟低点：{recent_low['price']:.1f}¢\n"
        f"反弹：+{rise:.1f}¢  低点时间：{low_time:%H:%M} UTC\n"
        f"模型概率：{row['model_probability']:.1f}%  VR：{row['vr']:.2f}x\n"
        f"当前落点：~{mu:.0f}条  剩余：{market['hours_remaining']:.1f}h\n\n"
        "⚠️ 这是关注提醒，不是自动买入。请检查盘口深度、最新推文节奏和仓位上限。\n"
        f"[打开市场]({market['event_url']})"
    )
    return send_tg(message)


def run_once(dry_run=False, verbose=False):
    event = discover_active_event()
    if not event:
        raise RuntimeError("no active Elon tweet market found")
    market = normalize_market(event)
    stats = fetch_tracking_stats()
    if not stats:
        raise RuntimeError("tracking stats unavailable")
    mu, meta = compute_mu(stats)
    rows = analyze_ranges(market, mu)
    state = load_state()
    if state.get("period") != market["slug"]:
        state = {
            "period": market["slug"],
            "ranges": {},
            "last_error": None,
            "mu_history": [],
            "last_mu": None,
            "last_center_range": None,
        }
    state.setdefault("mu_history", [])
    state.setdefault("ranges", {})

    center = center_row(rows, mu)
    now_ts = int(utc_now().timestamp())
    state["mu_history"] = [
        point
        for point in state["mu_history"]
        if int(point.get("ts", 0)) >= now_ts - 24 * 3600
    ][-1440:]
    state["mu_history"].append({"ts": now_ts, "mu": mu})

    alerts = []
    now_text = iso(utc_now())

    if (
        ENTRY_WINDOW_MIN_HOURS <= market["hours_remaining"] <= ENTRY_WINDOW_HOURS
        and cooldown_ok(state, "entry", 30 * 86400)
    ):
        delivered = True
        if not dry_run:
            delivered = send_entry_window(market, rows, center, mu, stats, meta)
        record(
            {
                "ts": now_text,
                "kind": "entry_window",
                "market": market["slug"],
                "center_range": center["range"] if center else None,
                "mu": mu,
                "hours_remaining": round(market["hours_remaining"], 2),
                "delivered": bool(delivered),
                "dry_run": dry_run,
            }
        )
        state["entry_sent_at"] = now_text
        alerts.append(("entry_window", center, None))

    last_mu = state.get("last_mu")
    last_center = state.get("last_center_range")
    if (
        last_mu is not None
        and center is not None
        and (abs(mu - float(last_mu)) >= 20 or center["range"] != last_center)
        and cooldown_ok(state, "center_drift", 2 * 3600)
    ):
        delivered = True
        if not dry_run:
            delivered = send_center_drift(
                market,
                rows,
                center,
                last_center,
                float(last_mu),
                mu,
                meta,
            )
        record(
            {
                "ts": now_text,
                "kind": "center_drift",
                "market": market["slug"],
                "old_center": last_center,
                "center_range": center["range"],
                "old_mu": float(last_mu),
                "mu": mu,
                "hours_remaining": round(market["hours_remaining"], 2),
                "delivered": bool(delivered),
                "dry_run": dry_run,
            }
        )
        state["center_drift_sent_at"] = now_text
        alerts.append(("center_drift", center, None))

    state["last_mu"] = mu
    state["last_center_range"] = center["range"] if center else None

    for row in rows:
        range_state = state["ranges"].setdefault(
            row["range"],
            {"history": [], "watch_sent_at": None, "rebound_sent_at": None},
        )
        history = range_state.setdefault("history", [])
        incoming = (
            clob_history(row["token_id"], 180)
            if row["price"] <= 15 and len(history) < 2
            else []
        )
        if incoming:
            by_ts = {int(point["ts"]): point["price"] for point in history}
            by_ts.update({int(point["ts"]): point["price"] for point in incoming})
            history = [
                {"ts": ts, "price": price}
                for ts, price in sorted(by_ts.items())
                if ts >= utc_now().timestamp() - 6 * 3600
            ]
        history.append({"ts": int(utc_now().timestamp()), "price": row["price"]})
        range_state["history"] = history[-420:]

        midpoint = sum(row["parsed"]) / 2
        within_mu_path = abs(midpoint - mu) <= 60 or row["vr"] >= 1.5
        eligible_time = MIN_HOURS_REMAINING <= market["hours_remaining"] <= MAX_HOURS_REMAINING
        candidate = row["price"] <= LOW_PRICE and row["vr"] >= 1.0 and within_mu_path
        if (
            candidate
            and eligible_time
            and cooldown_ok(range_state, "watch", 6 * 3600)
        ):
            alerts.append(("watch", row, None))
            range_state["watch_sent_at"] = now_text

        recent_low = history_min(history, 30)
        if (
            eligible_time
            and recent_low is not None
            and recent_low["price"] <= LOW_PRICE
            and row["price"] - recent_low["price"] >= REBOUND_CENTS
            and row["model_probability"] >= 2.0
            and within_mu_path
            and cooldown_ok(range_state, "rebound", 3 * 3600)
        ):
            alerts.append(("rebound", row, recent_low))
            range_state["rebound_sent_at"] = now_text

    for kind, row, recent_low in alerts:
        if kind in {"entry_window", "center_drift"}:
            if verbose:
                print(
                    json.dumps(
                        {
                            "kind": kind,
                            "market": market["slug"],
                            "center": row["range"] if row else None,
                            "mu": mu,
                            "hours_remaining": round(market["hours_remaining"], 2),
                            "dry_run": dry_run,
                        },
                        ensure_ascii=False,
                    )
                )
            continue
        delivered = True
        if not dry_run:
            delivered = (
                send_rebound(market, row, mu, recent_low)
                if kind == "rebound"
                else send_watch(market, row, mu)
            )
        signal = {
            "ts": now_text,
            "kind": kind,
            "market": market["slug"],
            "range": row["range"],
            "price": row["price"],
            "vr": round(row["vr"], 3),
            "model_pct": round(row["model_probability"], 2),
            "mu": mu,
            "hours_remaining": round(market["hours_remaining"], 2),
            "low_30m": recent_low["price"] if recent_low else None,
            "delivered": bool(delivered),
            "dry_run": dry_run,
        }
        record(signal)
        if verbose:
            print(json.dumps(signal, ensure_ascii=False))

    if verbose:
        print(
            f"[watch] {market['slug']} ranges={len(rows)} center={center['range'] if center else '—'} "
            f"mu={mu:.1f} hours={market['hours_remaining']:.1f} alerts={len(alerts)}"
        )
    save_state(state)
    return len(alerts)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--verbose", action="store_true")
    argv = parser.parse_args()

    if argv.once:
        try:
            run_once(dry_run=argv.dry_run, verbose=argv.verbose)
        except Exception as exc:
            print(f"[watch-error] {exc}", flush=True)
            raise
        return

    failure_count = 0
    while True:
        try:
            run_once(dry_run=False, verbose=True)
            failure_count = 0
        except Exception as exc:
            failure_count += 1
            print(f"[watch-error] {iso(utc_now())} {exc}", flush=True)
            if failure_count == 3:
                send_tg(
                    "⚠️ *Musk 低价提醒服务异常*\n"
                    f"已连续失败 {failure_count} 次。\n错误：`{str(exc)[:240]}`"
                )
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
