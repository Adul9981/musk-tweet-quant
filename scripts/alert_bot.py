#!/usr/bin/env python3
"""
Telegram Alert Bot for Elon Musk Tweets
Monitors new tweets and sends instant notifications to Telegram
"""

import os
import json
import time
import requests
from datetime import datetime
from pathlib import Path

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")
STATE_FILE = "tweet_state.json"
XTRACKER_POSTS_URL = "https://xtracker.polymarket.com/api/users/elonmusk/posts?limit=10"


def load_state():
    if Path(STATE_FILE).exists():
        try:
            with open(STATE_FILE, "r") as f:
                return json.load(f)
        except:
            pass
    return {"last_tweet_id": None, "last_check": None}


def save_state(state):
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)


def get_latest_tweets():
    try:
        res = requests.get(XTRACKER_POSTS_URL, timeout=10)
        if res.ok:
            data = res.json()
            if data.get("success") and data.get("data"):
                return data["data"]
    except Exception as e:
        print(f"Error fetching tweets: {e}")
    return []


def format_tweet_notification(tweet):
    content = tweet.get("content", "")[:500]
    tweet_id = tweet.get("platformId", "")
    created_at = tweet.get("createdAt", "")

    try:
        dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
        time_str = dt.strftime("%Y-%m-%d %H:%M:%S UTC")
    except:
        time_str = created_at

    link = f"https://x.com/elonmusk/status/{tweet_id}" if tweet_id else ""

    message = f"""🔔 *马斯克发推了！*

📝 {content}

🕐 {time_str}
🔗 {link}"""

    return message


def send_telegram(message):
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        print("Telegram not configured. Message would be:")
        print(message)
        return False

    try:
        url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
        data = {
            "chat_id": TELEGRAM_CHAT_ID,
            "text": message,
            "parse_mode": "Markdown",
            "disable_web_page_preview": False,
        }
        res = requests.post(url, json=data, timeout=10)
        return res.ok
    except Exception as e:
        print(f"Error sending Telegram: {e}")
        return False


def main():
    print(f"[{datetime.now().isoformat()}] Checking for new tweets...")

    state = load_state()
    tweets = get_latest_tweets()

    if not tweets:
        print("No tweets found")
        return

    latest_tweet = tweets[0]
    latest_id = latest_tweet.get("platformId", "")

    if state["last_tweet_id"] and latest_id == state["last_tweet_id"]:
        print("No new tweets")
        return

    if state["last_tweet_id"]:
        print(f"New tweet detected! ID: {latest_id}")
        message = format_tweet_notification(latest_tweet)
        if send_telegram(message):
            print("Notification sent!")
        else:
            print("Failed to send notification")

    state["last_tweet_id"] = latest_id
    state["last_check"] = datetime.now().isoformat()
    save_state(state)


if __name__ == "__main__":
    main()
