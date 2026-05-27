#!/usr/bin/env python3
"""
马斯克推文预测市场 — Telegram 预警机器人 v1.0
规则库文档：~/.claude/commands/musk-tgbot.md

用法（由 cron 调用）:
  python3 musk_tgbot.py window prebuild     # BJ 11:30 深夜会话前预告
  python3 musk_tgbot.py window peak_check   # BJ 12:30 深夜会话内检查
  python3 musk_tgbot.py window peak_end     # BJ 16:30 深夜会话结束
  python3 musk_tgbot.py window deadzone     # BJ 17:30 死区必检三项
  python3 musk_tgbot.py window morning_pre  # BJ 20:00 晨间会话预告
  python3 musk_tgbot.py window morning      # BJ 21:00 晨间建仓窗口
  python3 musk_tgbot.py check               # 每15分钟：异常检测 + 到期倒计时
  python3 musk_tgbot.py test                # 连接测试

Cron（UTC时间）:
  30 3 * * *   → window prebuild
  30 4 * * *   → window peak_check
  30 8 * * *   → window peak_end
  30 9 * * *   → window deadzone
  0  12 * * *  → window morning_pre
  0  13 * * *  → window morning
  */15 * * * * → check
"""

import os
import sys
import json
import math
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.request import urlopen, Request

# ── 配置 ──────────────────────────────────────────────────────────────────────

TG_TOKEN        = os.getenv("TELEGRAM_BOT_TOKEN", "")
TG_CHAT_ID      = os.getenv("TELEGRAM_CHAT_ID", "")
TG_GROUP_CHAT_ID = os.getenv("TELEGRAM_GROUP_CHAT_ID", "")

SCRIPT_DIR = Path(__file__).parent
STATE_FILE = SCRIPT_DIR / "tgbot_state.json"

# 引擎常量（与 musk_engine.py 保持同步）
GIST_ID   = 'd174b4498c408076ff218e164f24807e'
XTRACKER  = 'https://xtracker.polymarket.com/api/users/elonmusk/trackings?activeOnly=true'
DAILY_AVG = 43.4  # 206天历史均值

# 5大会话定义（来自206天673个会话分析，docs/知识库/RULES.md §7.1）
SESSIONS = [
    {'name': '下午会话', 'key': 'afternoon', 'emoji': '☀️',
     'hours': list(range(0, 6)),   'avg': 14.4, 'drop': 14},
    {'name': '傍晚会话', 'key': 'evening',   'emoji': '🌆',
     'hours': list(range(6, 11)),  'avg': 11.4, 'drop': 11},
    {'name': '深夜会话', 'key': 'night',     'emoji': '🌙',
     'hours': list(range(11, 17)), 'avg': 14.3, 'drop': 14, 'is_main': True},
    {'name': '清晨过渡', 'key': 'dawn',      'emoji': '🌅',
     'hours': list(range(17, 20)), 'avg': 16.4, 'drop': 16},
    {'name': '上午会话', 'key': 'morning',   'emoji': '🏙️',
     'hours': list(range(20, 24)), 'avg': 10.9, 'drop': 11},
]

# 告警冷却（秒）
COOLDOWNS = {
    'session_hot':  4 * 3600,
    'session_cold': 6 * 3600,
    'mu_drift':     3 * 3600,
    'price_high':   8 * 3600,
    'expiry_72h':  99 * 9999,  # 每期只发一次（靠 period_id 重置）
    'expiry_24h':  99 * 9999,
    'expiry_12h':  99 * 9999,
    'expiry_6h':   99 * 9999,
}

# ── 工具函数 ──────────────────────────────────────────────────────────────────

def bj_now():
    return datetime.now(timezone(timedelta(hours=8)))

def fetch_json(url, headers=None):
    h = {'User-Agent': 'MuskTgBot/1.0', 'Accept': 'application/json'}
    if headers:
        h.update(headers)
    req = Request(url, headers=h)
    with urlopen(req, timeout=15) as r:
        return json.loads(r.read())

def parse_range(s):
    s = s.replace('–', '-').replace('—', '-').strip()
    if '+' in s:
        lo = int(s.replace('+', '').strip())
        return (lo, lo + 999)
    if '-' in s:
        parts = s.split('-')
        if len(parts) == 2:
            try:
                return (int(parts[0].strip()), int(parts[1].strip()))
            except Exception:
                pass
    return None

def poisson_prob(lo, hi, mu):
    if mu <= 0:
        return 0.0
    prob = 0.0
    p = math.exp(-mu)
    for k in range(min(hi + 1, 800)):
        if k > 0:
            p *= mu / k
        if k >= lo:
            prob += p
    return min(prob, 1.0)

def vr_label(vr):
    if vr >= 2.5:  return '⭐高赔率'
    if vr >= 1.5:  return '✅明显低估'
    if vr >= 1.2:  return '✅低估'
    if vr >= 1.0:  return '🟡合理'
    if vr >= 0.8:  return '🟠略高估'
    return '❌高估'

def pace_emoji(deviation_pct):
    if deviation_pct > 30:   return '🔥🔥 极热'
    if deviation_pct > 15:   return '🔥 偏热'
    if deviation_pct < -30:  return '❄️❄️ 极冷'
    if deviation_pct < -15:  return '❄️ 偏冷'
    return '✅ 正常'

def parse_daily_count(d):
    if isinstance(d, (int, float)):
        return float(d)
    if isinstance(d, dict):
        return float(d.get('count', 0))
    return 0.0

# ── 数据获取 ──────────────────────────────────────────────────────────────────

def fetch_market_data():
    gist = fetch_json(
        f'https://api.github.com/gists/{GIST_ID}',
        {'Accept': 'application/vnd.github.v3+json'}
    )
    content = gist['files']['polymarket-data.json']['content']
    return json.loads(content)

def get_active_market(mdata):
    now_utc = datetime.now(timezone.utc)
    all_m = sorted(
        [m for m in mdata if isinstance(m, dict) and m.get('ranges')],
        key=lambda m: m.get('end_date', '')
    )
    active = [
        m for m in all_m
        if datetime.fromisoformat(m['end_date'].replace('Z', '')).replace(tzinfo=timezone.utc) > now_utc
        and any(r.get('price', 0) > 0 for r in m.get('ranges', []))
    ]
    return active[0] if active else (all_m[0] if all_m else None)

def fetch_tracking_stats():
    """获取当前追踪统计数据"""
    data = fetch_json(XTRACKER)
    if not data.get('success') or not data.get('data'):
        return None

    for t in data['data']:
        try:
            s = datetime.fromisoformat(t['startDate'].replace('Z', ''))
            e = datetime.fromisoformat(t['endDate'].replace('Z', ''))
            if not (5 <= (e - s).days <= 8):
                continue

            stats_url = f"https://xtracker.polymarket.com/api/trackings/{t['id']}?includeStats=true"
            sd = fetch_json(stats_url)
            if not (sd.get('success') and sd.get('data', {}).get('stats')):
                continue

            raw = sd['data']['stats']
            now_utc = datetime.now(timezone.utc)
            e_utc = e.replace(tzinfo=timezone.utc)
            s_utc = s.replace(tzinfo=timezone.utc)

            hrs_rem   = max(0, (e_utc - now_utc).total_seconds() / 3600)
            total_hrs = max(1,  (e_utc - s_utc).total_seconds() / 3600)
            elapsed   = raw.get('daysElapsed', 1) or 1
            total     = raw.get('total', 0)
            pace      = round(total / elapsed) if elapsed > 0 else DAILY_AVG

            return {
                'total':      total,
                'pace':       pace,
                'days_rem':   hrs_rem / 24,
                'hours_rem':  hrs_rem,
                'total_hours': total_hrs,
                'daily':      raw.get('daily', []),
                'end_date':   t['endDate'],
                'period_id':  f"{t['startDate'][:10]}_{t['endDate'][:10]}",
            }
        except Exception:
            continue

    return None

# ── µ 计算（保持与 musk_engine.py 算法一致）──────────────────────────────────

def compute_mu(stats):
    """
    计算自适应µ（信心加权融合）。
    返回 (mu_a, meta_dict)，meta 含关键调试信息。
    """
    C          = stats['total']
    days_rem   = stats['days_rem']
    total_hours = stats['total_hours']
    daily      = stats['daily']

    hours_rem      = days_rem * 24
    elapsed_hours  = max(1, total_hours - hours_rem)
    elapsed_frac   = min(1.0, elapsed_hours / total_hours)

    # 历史时间加权µ（简化）
    mu_hist = C + (stats['pace'] or DAILY_AVG) * days_rem

    # 当期观测µ（混合近期节奏）
    full_pace_h   = C / elapsed_hours
    recent_pace_h = None
    if daily and len(daily) >= 1:
        recent = daily[-2:] if len(daily) >= 2 else daily[-1:]
        recent_tweets = sum(parse_daily_count(d) for d in recent)
        recent_hours  = len(recent) * 24
        if recent_hours > 0:
            recent_pace_h = recent_tweets / recent_hours

    blended_h = (0.6 * recent_pace_h + 0.4 * full_pace_h) if recent_pace_h else full_pace_h
    mu_curr   = C + blended_h * hours_rem

    # 信心权重：随已过时间线性增大，最高80%
    curr_weight = min(0.8, elapsed_frac * 1.2)
    mu_a = curr_weight * mu_curr + (1 - curr_weight) * mu_hist

    blended_daily   = blended_h * 24
    deviation_pct   = (blended_daily - DAILY_AVG) / DAILY_AVG * 100
    recent_daily_v  = recent_pace_h * 24 if recent_pace_h else None

    return round(mu_a, 1), {
        'elapsed_frac':   elapsed_frac,
        'curr_weight':    curr_weight,
        'blended_daily':  round(blended_daily, 1),
        'recent_daily':   round(recent_daily_v, 1) if recent_daily_v else None,
        'deviation_pct':  round(deviation_pct, 1),
    }

# ── 区间分析 ──────────────────────────────────────────────────────────────────

def analyze_ranges(market, mu_a):
    """分析各区间价值比，返回 analysis list（按区间下界升序）"""
    total_p  = 0.0
    analysis = []
    for r in market.get('ranges', []):
        parsed = parse_range(r.get('range', ''))
        if not parsed or r.get('price', 0) < 1:
            continue
        p = poisson_prob(parsed[0], parsed[1], mu_a)
        total_p += p
        analysis.append({
            'range':     r['range'],
            'price':     r['price'],
            'parsed':    parsed,
            'raw_p':     p,
            'is_center': parsed[0] <= mu_a <= parsed[1],
        })
    for a in analysis:
        a['model_pct'] = (a['raw_p'] / total_p * 100) if total_p > 0 else 0
        a['vr']        = a['model_pct'] / a['price'] if a['price'] > 0 else 0
    analysis.sort(key=lambda x: x['parsed'][0])
    return analysis

def get_entry_suggestion(analysis, mu_a):
    """
    生成三层入场结构建议（docs/知识库/RULES.md § 4.1）：
      主仓：价值比最高（model_pct > 10%）
      保护仓：中心落点下方1档（+0.3档系统偏高对冲）
      高赔率仓：价格≤5¢ 且 VR≥2.0（可选）
    """
    center = next((a for a in analysis if a['is_center']), None)
    if not center and analysis:
        center = min(analysis, key=lambda x: abs((x['parsed'][0] + x['parsed'][1]) / 2 - mu_a))
    if not center:
        return None

    center_overpriced = center['price'] > 35 and center['vr'] < 1.0

    candidates = [a for a in analysis if a['model_pct'] > 10]
    main = max(candidates, key=lambda x: x['vr']) if candidates else center

    sorted_by_low = sorted(analysis, key=lambda x: x['parsed'][0])
    center_idx    = next((i for i, a in enumerate(sorted_by_low) if a['range'] == center['range']), None)
    protect       = sorted_by_low[center_idx - 1] if center_idx and center_idx > 0 else None

    lottery = [
        a for a in analysis
        if a['price'] <= 5 and a['vr'] >= 2.0
        and a['range'] not in {main['range'], protect['range'] if protect else ''}
    ]
    lottery.sort(key=lambda x: -x['vr'])

    return {
        'center':           center,
        'center_overpriced': center_overpriced,
        'main':             main,
        'protect':          protect,
        'lottery':          lottery[:1],
    }

# ── State 管理 ────────────────────────────────────────────────────────────────

def load_state():
    if STATE_FILE.exists():
        try:
            with open(STATE_FILE) as f:
                return json.load(f)
        except Exception:
            pass
    return {
        'last_count':        0,
        'last_mu':           None,
        'last_center_range': None,
        'last_center_price': None,
        'period_id':         None,
        'session_snapshots': {},   # 'night'/'morning' → {'count': N, 'time': ISO}
        'alerts_sent':       {},   # alert_key → ISO timestamp
    }

def save_state(state):
    with open(STATE_FILE, 'w') as f:
        json.dump(state, f, indent=2, ensure_ascii=False)

def can_alert(state, key, cooldown_sec):
    last = state['alerts_sent'].get(key)
    if not last:
        return True
    try:
        last_dt = datetime.fromisoformat(last)
        if last_dt.tzinfo is None:
            last_dt = last_dt.replace(tzinfo=timezone.utc)
        elapsed = (datetime.now(timezone.utc) - last_dt).total_seconds()
        return elapsed >= cooldown_sec
    except Exception:
        return True

def mark_alert(state, key):
    state['alerts_sent'][key] = datetime.now(timezone.utc).isoformat()

def reset_expiry_alerts(state):
    for key in ['expiry_72h', 'expiry_24h', 'expiry_12h', 'expiry_6h']:
        state['alerts_sent'].pop(key, None)

# ── Telegram 发送 ─────────────────────────────────────────────────────────────

def _send_one(chat_id: str, message: str) -> bool:
    """向单个 chat_id 发送消息"""
    try:
        url  = f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage"
        body = json.dumps({
            "chat_id":                  chat_id,
            "text":                     message,
            "parse_mode":               "Markdown",
            "disable_web_page_preview": True,
        }).encode()
        req = Request(url, data=body, headers={'Content-Type': 'application/json'})
        with urlopen(req, timeout=10) as r:
            return r.status == 200
    except Exception as e:
        print(f"[TG-ERROR] chat_id={chat_id} {e}")
        return False

def send_tg(message: str) -> bool:
    """
    发送消息到私聊 + 群组（如已配置）。
    失败时打印到 stdout（便于 cron 日志）。
    """
    if len(message) > 3800:
        message = message[:3800] + '\n...(截断)'

    if not TG_TOKEN or not TG_CHAT_ID:
        print(f"[TG-LOCAL] {message[:300]}")
        return True

    targets = [TG_CHAT_ID]
    if TG_GROUP_CHAT_ID:
        targets.append(TG_GROUP_CHAT_ID)

    results = [_send_one(cid, message) for cid in targets]
    return any(results)

# ── 消息格式化工具 ────────────────────────────────────────────────────────────

def fmt_vr_table(analysis, max_rows=6):
    """价值比全表，只显示 model_pct > 2% 的区间"""
    visible = [a for a in analysis if a['model_pct'] > 2.0][:max_rows]
    lines = []
    for a in visible:
        star = '★' if a['is_center'] else '  '
        lines.append(
            f"{star} `{a['range']:<10}` {a['price']:5.1f}¢  {a['vr']:.2f}x  {vr_label(a['vr'])}"
        )
    return '\n'.join(lines) if lines else '（暂无有效区间数据）'

def fmt_entry(entry):
    """三层入场结构建议，返回多行字符串"""
    if not entry:
        return '（无法生成建议）'
    lines = []
    m = entry['main']
    p = entry['protect']

    if entry['center_overpriced']:
        lines.append('⚠️ *中心区间>35¢已高估，主仓移至更高价值比区间*')

    lines.append(f"🟦 主仓 50-70%   → `{m['range']}` {m['price']:.1f}¢  VR{m['vr']:.2f}x")
    if p:
        lines.append(f"🟨 保护仓 20-30% → `{p['range']}` {p['price']:.1f}¢  VR{p['vr']:.2f}x  _(+0.3档偏高对冲)_")
    else:
        lines.append("🟨 保护仓 — 中心已在最低档，无下方区间")

    if entry['lottery']:
        lt = entry['lottery'][0]
        lines.append(f"⭐ 高赔率仓 ≤5%  → `{lt['range']}` {lt['price']:.1f}¢  VR{lt['vr']:.2f}x")

    vr_main = m['vr']
    if vr_main >= 1.2:
        eval_str = '✅ 有入场价值，可执行建仓'
    elif vr_main >= 1.0:
        eval_str = '🟡 勉强可入，等更好时机或小仓位试探'
    else:
        eval_str = '❌ 无正期望入场点，中心区间等价格回调'

    lines.append(f"\n*总体评估：{eval_str}*")
    return '\n'.join(lines)

def fmt_header(emoji, title, stats):
    """标准消息头：标题 + 关键数字"""
    now  = bj_now()
    hrs  = stats['hours_rem']
    days = stats['days_rem']
    return (
        f"{emoji} *{title}*\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"BJ {now.strftime('%H:%M')}  推文 {stats['total']}条  剩余 {hrs:.0f}h（{days:.1f}天）"
    )

# ── 类型一：时间窗口播报 ──────────────────────────────────────────────────────

def window_prebuild():
    """
    BJ 11:30 — 深夜会话前预告（最强建仓窗口）
    docs/知识库/RULES.md § 10.1「深夜爆发前定价洼地」+ § 3.1「最佳入场时间窗口」
    """
    try:
        stats  = fetch_tracking_stats()
        mdata  = fetch_market_data()
        market = get_active_market(mdata) if mdata else None

        if not stats or not market:
            send_tg("🎯 *深夜会话预告（BJ 11:30）*\n数据获取失败，请手动运行 /musk-alert")
            return

        mu_a, meta = compute_mu(stats)
        analysis   = analyze_ranges(market, mu_a)
        entry      = get_entry_suggestion(analysis, mu_a)
        center     = entry['center'] if entry else None

        center_str = f"{center['range']}  市价{center['price']:.1f}¢  VR{center['vr']:.2f}x" if center else '?'

        msg = (
            f"{fmt_header('🎯', '深夜会话即将开始 — 建仓窗口', stats)}\n"
            f"今日节奏：{meta['blended_daily']:.0f}条/天  {pace_emoji(meta['deviation_pct'])}\n\n"
            f"📐 *自适应µ：{mu_a:.0f}条 → 中心落点 {center_str}*\n\n"
            f"💰 *各区间价值比：*\n{fmt_vr_table(analysis)}\n\n"
            f"📋 *入场结构建议：*\n{fmt_entry(entry)}\n\n"
            f"━━━━━━━━━━━━━━━━━━━━\n"
            f"_BJ 12:00 是历史最强定价洼地_\n"
            f"_深夜爆发前 +150% 跳跃尚未被市场定价_\n"
            f"_有入场计划：12:00 前完成建仓_"
        )
        send_tg(msg)

        # 保存会话快照（用于 peak_check 异常检测）
        state = load_state()
        state['session_snapshots']['night'] = {
            'count': stats['total'],
            'time':  datetime.now(timezone.utc).isoformat(),
        }
        save_state(state)

    except Exception as e:
        send_tg(f"🎯 深夜会话预告失败：{e}")


def window_peak_check():
    """
    BJ 12:30 — 深夜会话内节奏检查（会话开始90分钟后）
    docs/知识库/RULES.md § 6.1「不追节奏」+ § 2.3「会话缺席的µ影响」
    深夜会话历史均值 14.3条（6小时），前90分钟预期约 3.6条
    """
    try:
        stats  = fetch_tracking_stats()
        mdata  = fetch_market_data()
        market = get_active_market(mdata) if mdata else None

        if not stats or not market:
            return  # 会话内检查，静默失败

        state      = load_state()
        mu_a, meta = compute_mu(stats)
        analysis   = analyze_ranges(market, mu_a)
        center     = next((a for a in analysis if a['is_center']), None)

        snap = state.get('session_snapshots', {}).get('night')
        if not snap:
            return  # 没有快照，跳过

        session_delta    = stats['total'] - snap['count']
        expected_90min   = 14.3 * (90 / 360)  # 14.3条 * (90min/360min整会话)
        ratio            = session_delta / expected_90min if expected_90min > 0 else 1.0
        center_str       = f"{center['range']}  市价{center['price']:.1f}¢" if center else '?'

        if ratio > 1.8:  # 偏热：实际 > 预期180%
            if not can_alert(state, 'session_hot', COOLDOWNS['session_hot']):
                return
            msg = (
                f"🔥 *深夜会话偏热！*\n"
                f"━━━━━━━━━━━━━━━━━━\n"
                f"过去90分钟：{session_delta}条 / 历史预期：{expected_90min:.0f}条\n"
                f"节奏比率：{ratio:.1f}x — 明显偏热\n\n"
                f"📐 µ已更新：{mu_a:.0f}条 → 落点可能右移\n"
                f"中心落点：{center_str}\n\n"
                f"💡 *操作提示*\n"
                f"• 价格正在上涨，不追仓（docs/知识库/RULES.md §6.1）\n"
                f"• 已有仓位：BJ 14:00 评估是否部分止盈\n"
                f"• 止盈目标：持仓价 +30% 以上可考虑卖出 30-50%"
            )
            send_tg(msg)
            mark_alert(state, 'session_hot')
            save_state(state)

        elif ratio < 0.2 and session_delta < 2:  # 会话异常沉默
            if not can_alert(state, 'session_cold', COOLDOWNS['session_cold']):
                return
            msg = (
                f"❄️ *深夜会话异常沉默*\n"
                f"━━━━━━━━━━━━━━━━━━\n"
                f"过去90分钟：{session_delta}条 / 历史预期：{expected_90min:.0f}条\n"
                f"节奏比率：{ratio:.1f}x — 会话可能缺席\n\n"
                f"📐 当前µ：{mu_a:.0f}条（*可能虚高约14条*）\n\n"
                f"💡 *操作提示*（docs/知识库/RULES.md §2.3）\n"
                f"• 单日沉默不改变整期µ，不要立刻换仓\n"
                f"• 等今日死区（BJ 17:30）重新评估µ和仓位\n"
                f"• 若连续2天沉默 → 触发§4.3连续降温规则"
            )
            send_tg(msg)
            mark_alert(state, 'session_cold')
            save_state(state)

    except Exception:
        pass  # 会话内检查，静默失败不打扰用户


def window_peak_end():
    """
    BJ 16:30 — 深夜会话结束，µ更新，提示死区即将到来
    docs/知识库/RULES.md § 2.3「会话缺席的µ影响」
    """
    try:
        stats  = fetch_tracking_stats()
        mdata  = fetch_market_data()
        market = get_active_market(mdata) if mdata else None

        if not stats or not market:
            send_tg(
                "🌙 *深夜会话结束（BJ 16:30）*\n"
                "数据获取失败，请手动检查µ更新。\n\n"
                "⏰ 下一步：BJ 17:30 死区评估"
            )
            return

        state      = load_state()
        mu_a, meta = compute_mu(stats)
        analysis   = analyze_ranges(market, mu_a)
        center     = next((a for a in analysis if a['is_center']), None)

        # 计算深夜会话总收益
        snap           = state.get('session_snapshots', {}).get('night')
        session_result = ''
        if snap:
            session_total = stats['total'] - snap['count']
            if session_total < 5:
                session_result = f"❄️ 深夜会话偏冷（{session_total}条 vs 均值14条）— µ可能虚高约14条"
            elif session_total > 20:
                session_result = f"🔥 深夜会话偏热（{session_total}条 vs 均值14条）"
            else:
                session_result = f"✅ 深夜会话正常（{session_total}条）"

        center_str = f"{center['range']}  市价{center['price']:.1f}¢  VR{center['vr']:.2f}x" if center else '?'

        msg = (
            f"🌙 *深夜会话结束 · µ更新*\n"
            f"━━━━━━━━━━━━━━━━━━━━\n"
            f"总推文：{stats['total']}条  剩余：{stats['hours_rem']:.1f}h\n"
            f"{session_result}\n\n"
            f"📐 *自适应µ：{mu_a:.0f}条*\n"
            f"中心落点：{center_str}\n\n"
            f"⏰ *下一步：BJ 17:30 死区评估*\n"
            f"全天最低活跃期，最理性的操作窗口\n"
            f"有亏损/偏移仓位 → 死区处理，不要拖到明天（docs/知识库/RULES.md §5.2）"
        )
        send_tg(msg)

    except Exception as e:
        send_tg(f"🌙 深夜会话结束。数据更新失败：{e}")


def window_deadzone():
    """
    BJ 17:30 — 死区必检三项
    docs/知识库/RULES.md § 5.2「止损与剪仓」+ § 4.3「连续降温规则」
    来自5月26日复盘：「越拖越不想动仓，死区是最后机会」
    """
    try:
        stats  = fetch_tracking_stats()
        mdata  = fetch_market_data()
        market = get_active_market(mdata) if mdata else None

        if not stats or not market:
            send_tg(
                "💤 *死区评估（BJ 17:30）*\n\n"
                "数据获取失败，请手动运行 /musk-alert\n\n"
                "⚠️ 铁律：有亏损仓位，死区出，不推迟\n"
                "「再等等看」= 死亡陷阱（docs/知识库/RULES.md §5.2）"
            )
            return

        mu_a, meta = compute_mu(stats)
        analysis   = analyze_ranges(market, mu_a)
        center     = next((a for a in analysis if a['is_center']), None)

        # ① 连续降温检查（docs/知识库/RULES.md §4.3）
        daily_list = stats.get('daily', [])
        cold_block = ''
        if len(daily_list) >= 2:
            recent_2  = [parse_daily_count(d) for d in daily_list[-2:]]
            threshold = DAILY_AVG * 0.3
            if all(c < threshold for c in recent_2):
                cold_block = (
                    f"🔴 *连续降温！近2天：{recent_2[0]:.0f}条/{recent_2[1]:.0f}条*\n"
                    f"（连续低于均值30%阈值 {threshold:.0f}条/天）\n"
                    f"→ µ可能虚高约14条，必须今天重算\n\n"
                )

        # ③ µ不确定性判断（剩余时间）
        hrs_rem = stats['hours_rem']
        if hrs_rem > 36:
            uncertainty_str = '大（±20条以上），建议已建保护仓'
            protect_tip     = '中心落点下方1档是否有仓位覆盖？（docs/知识库/RULES.md §3.4）'
        elif hrs_rem > 24:
            uncertainty_str = '中等（±12-20条）'
            protect_tip     = '可视情况决定是否补建保护仓'
        else:
            uncertainty_str = '小（±8条），µ已较稳'
            protect_tip     = '（剩余时间短，保护仓可不建）'

        center_str = f"{center['range']}  市价{center['price']:.1f}¢  VR{center['vr']:.2f}x" if center else '无数据'

        msg = (
            f"💤 *死区评估（BJ 17:30）— 全天最理性操作窗口*\n"
            f"━━━━━━━━━━━━━━━━━━━━\n"
            f"{cold_block}"
            f"总推文：{stats['total']}条  剩余：{hrs_rem:.1f}h\n"
            f"自适应µ：{mu_a:.0f}条  中心：{center_str}\n\n"
            f"✅ *必检三项：*\n\n"
            f"① *连续降温*：近2天发推是否连续 <{DAILY_AVG * 0.3:.0f}条/天？\n"
            f"   是 → 重算µ，评估是否需要调仓（docs/知识库/RULES.md §4.3）\n\n"
            f"② *仓位健康*：持仓区间模型概率 <15% 或浮亏 >20%？\n"
            f"   是 → *现在出场，不推迟*（docs/知识库/RULES.md §5.2 铁律）\n\n"
            f"③ *保护仓*：µ不确定性{uncertainty_str}\n"
            f"   {protect_tip}\n\n"
            f"━━━━━━━━━━━━━━━━━━━━\n"
            f"⚠️ 「再等等看」= 死亡陷阱\n"
            f"死区过后活跃期来临，情绪让你更难执行"
        )
        send_tg(msg)

    except Exception as e:
        send_tg(
            f"💤 *死区评估时间（BJ 17:30）*\n"
            f"数据失败：{e}\n\n"
            f"⚠️ 铁律：有亏损仓位，死区出，不拖延"
        )


def window_morning_pre():
    """
    BJ 20:00 — 上午会话即将开始（30分钟预告）
    docs/知识库/RULES.md § 3.1「晨间窗口 🥈 次强」
    """
    try:
        stats  = fetch_tracking_stats()
        mdata  = fetch_market_data()
        market = get_active_market(mdata) if mdata else None

        if not stats or not market:
            send_tg("🏙️ 晨间会话即将开始（BJ 20:00）。数据获取失败，BJ 21:00 完整播报见后。")
            return

        mu_a, meta = compute_mu(stats)
        analysis   = analyze_ranges(market, mu_a)
        center     = next((a for a in analysis if a['is_center']), None)
        hrs_rem    = stats['hours_rem']

        center_str = f"{center['range']}  市价{center['price']:.1f}¢" if center else '?'

        msg = (
            f"🏙️ *晨间会话即将开始（30分钟后 BJ 20:30）*\n"
            f"━━━━━━━━━━━━━━━━━━━━\n"
            f"CDT 7am 美国上午开始\n"
            f"历史：10.9条/会话 · 64%的天有上午会话\n\n"
            f"总推文：{stats['total']}条  剩余：{hrs_rem:.1f}h\n"
            f"自适应µ：{mu_a:.0f}条  中心落点：{center_str}\n\n"
            f"📋 *时机参考*\n"
            f"• 剩余 >2.5天 → 还早，观察为主\n"
            f"• 剩余 1.5–2.5天 → ✅ 最佳入场窗口\n"
            f"• 剩余 <1.5天 → µ较准，仅小仓位高确定性操作\n\n"
            f"_完整分析：BJ 21:00 晨间播报_"
        )
        send_tg(msg)

        # 保存快照
        state = load_state()
        state['session_snapshots']['morning'] = {
            'count': stats['total'],
            'time':  datetime.now(timezone.utc).isoformat(),
        }
        save_state(state)

    except Exception as e:
        send_tg(f"🏙️ 晨间会话预告失败：{e}")


def window_morning():
    """
    BJ 21:00 — 晨间建仓窗口完整分析（第二强建仓窗口）
    docs/知识库/RULES.md § 3.1、§ 3.2（完整入场清单）
    """
    try:
        stats  = fetch_tracking_stats()
        mdata  = fetch_market_data()
        market = get_active_market(mdata) if mdata else None

        if not stats or not market:
            send_tg("🏙️ 晨间建仓窗口（BJ 21:00）数据获取失败，请手动运行 /musk-alert")
            return

        mu_a, meta = compute_mu(stats)
        analysis   = analyze_ranges(market, mu_a)
        entry      = get_entry_suggestion(analysis, mu_a)
        center     = entry['center'] if entry else None
        hrs_rem    = stats['hours_rem']

        if hrs_rem > 60:
            timing = "🔵 还早（>2.5天）· 轻仓观察，价值比可能虚高"
        elif hrs_rem > 36:
            timing = "✅ 最佳入场时机（1.5–2.5天）"
        else:
            timing = "⚠️ 接近尾声（<1.5天）· 仅小仓位高确定性操作"

        center_str = f"{center['range']}" if center else '?'

        msg = (
            f"{fmt_header('🏙️', '晨间建仓窗口（BJ 21:00）', stats)}\n"
            f"今日节奏：{meta['blended_daily']:.0f}条/天  {pace_emoji(meta['deviation_pct'])}\n"
            f"{timing}\n\n"
            f"📐 *自适应µ：{mu_a:.0f}条 → {center_str}*\n\n"
            f"💰 *各区间价值比：*\n{fmt_vr_table(analysis)}\n\n"
            f"📋 *入场结构建议：*\n{fmt_entry(entry)}"
        )
        send_tg(msg)

    except Exception as e:
        send_tg(f"🏙️ 晨间建仓窗口数据失败：{e}")


# ── 类型二：到期倒计时预警 ────────────────────────────────────────────────────

def alert_expiry_72h(stats, analysis, entry):
    """T-72h：首次预测窗口，µ不确定性仍大"""
    center     = entry['center'] if entry else None
    center_str = f"{center['range']}  市价{center['price']:.1f}¢  VR{center['vr']:.2f}x" if center else '?'
    hrs_rem    = stats['hours_rem']
    send_tg(
        f"📅 *本期进入预测窗口 · 距到期约72小时*\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"📊 t-3精度参考：±1档覆盖率约52%（docs/知识库/RULES.md §2.2）\n\n"
        f"总推文：{stats['total']}条  剩余：{hrs_rem:.0f}h\n"
        f"🎯 中心落点：{center_str}\n\n"
        f"💡 *此阶段建议*\n"
        f"• µ不确定性±50条，不建议重仓入场\n"
        f"• 最多建保护仓（≤30%仓位）试探方向\n"
        f"• 中心区间>35¢ → 先看两侧低价区间价值比\n"
        f"• 铁律：到期前3天以上不入场（docs/知识库/RULES.md §2.2）\n\n"
        f"⏭ 下次到期预警：T-24h"
    )


def alert_expiry_24h(stats, analysis, entry):
    """T-24h：精确预测窗口，最重要的入场决策点"""
    center     = entry['center'] if entry else None
    center_str = f"{center['range']}  市价{center['price']:.1f}¢  VR{center['vr']:.2f}x" if center else '?'
    center_overpriced_note = ''
    if entry and entry['center_overpriced']:
        center_overpriced_note = '\n⚠️ *中心区间已高估（>35¢）！主仓应移至两侧低价区间*'
    hrs_rem = stats['hours_rem']
    send_tg(
        f"⏰ *距到期24小时 · 精确预测窗口*\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"📊 t-1精度：±1档覆盖率约85%（近13期回测）\n\n"
        f"总推文：{stats['total']}条  剩余：{hrs_rem:.0f}h\n"
        f"🎯 中心落点：{center_str}{center_overpriced_note}\n\n"
        f"💰 *各区间价值比：*\n{fmt_vr_table(analysis)}\n\n"
        f"📋 *最终入场建议：*\n{fmt_entry(entry)}\n\n"
        f"⏭ 下次到期预警：T-12h"
    )


def alert_expiry_12h(stats, analysis, entry):
    """T-12h：止盈评估窗口，流动性开始下降"""
    center     = entry['center'] if entry else None
    hrs_rem    = stats['hours_rem']
    profit_tip = ''
    if center and center['price'] > 70:
        profit_tip = f"\n💰 中心区间 {center['price']:.0f}¢（>70¢） → 考虑卖出50%锁利，剩余博到期$1"
    center_str = f"{center['range']}  市价{center['price']:.1f}¢  VR{center['vr']:.2f}x" if center else '?'
    send_tg(
        f"🔔 *距到期12小时 · 止盈评估窗口*\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"总推文：{stats['total']}条  剩余：{hrs_rem:.0f}h\n"
        f"中心落点：{center_str}{profit_tip}\n\n"
        f"💡 *操作指引*（docs/知识库/RULES.md §5.3）\n"
        f"• 持仓区间 >75¢ → 卖出50%锁利，剩余博全额\n"
        f"• 持仓区间模型概率 <15% → 考虑止损\n"
        f"• 流动性开始下降，大额换仓价差成本增大\n\n"
        f"⏭ 下次到期预警：T-6h（最后理性操作窗口）"
    )


def alert_expiry_6h(stats, analysis, entry):
    """T-6h：最后理性操作窗口，之后情绪干扰加剧"""
    center     = entry['center'] if entry else None
    hrs_rem    = stats['hours_rem']
    center_str = f"{center['range']}  市价{center['price']:.1f}¢  VR{center['vr']:.2f}x" if center else '?'
    send_tg(
        f"🚨 *距到期6小时 · 最后理性操作窗口*\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"总推文：{stats['total']}条  剩余：{hrs_rem:.0f}h\n"
        f"落点基本锁定：{center_str}\n\n"
        f"⚠️ *这是今天最理性的操作时机*\n"
        f"之后进入活跃期，情绪会干扰判断\n\n"
        f"🔴 *亏损仓位铁律*（docs/知识库/RULES.md §5.2）\n"
        f"• 持仓区间 VR <0.8 → *现在出，不推迟*\n"
        f"• 「再等等看」= 死亡陷阱\n"
        f"• 6h后流动性急剧下降，价差扩大\n\n"
        f"✅ *盈利仓位*\n"
        f"• 中心区间 >85¢ → 可卖出锁定大部分利润\n"
        f"• 已止盈50% or 持有到期 → 无需操作"
    )


def check_expiry_alerts(stats, analysis, entry, state):
    """检测并发送到期倒计时预警（每期只发一次）"""
    hrs_rem   = stats['hours_rem']
    period_id = stats.get('period_id', 'unknown')

    # 新周期重置预警记录
    if state.get('period_id') != period_id:
        reset_expiry_alerts(state)
        state['period_id'] = period_id

    sent = False

    if 66 <= hrs_rem <= 78 and can_alert(state, 'expiry_72h', COOLDOWNS['expiry_72h']):
        alert_expiry_72h(stats, analysis, entry)
        mark_alert(state, 'expiry_72h')
        sent = True
    elif 21 <= hrs_rem <= 27 and can_alert(state, 'expiry_24h', COOLDOWNS['expiry_24h']):
        alert_expiry_24h(stats, analysis, entry)
        mark_alert(state, 'expiry_24h')
        sent = True
    elif 9 <= hrs_rem <= 15 and can_alert(state, 'expiry_12h', COOLDOWNS['expiry_12h']):
        alert_expiry_12h(stats, analysis, entry)
        mark_alert(state, 'expiry_12h')
        sent = True
    elif 4 <= hrs_rem <= 8 and can_alert(state, 'expiry_6h', COOLDOWNS['expiry_6h']):
        alert_expiry_6h(stats, analysis, entry)
        mark_alert(state, 'expiry_6h')
        sent = True

    return sent


# ── 类型三：每15分钟异常检测 ─────────────────────────────────────────────────

def cmd_check():
    """
    每15分钟运行，检测：
      1. 到期倒计时预警
      2. µ漂移告警
      3. 中心区间价格异常
      4. 连续降温预警
    """
    state = load_state()

    try:
        stats  = fetch_tracking_stats()
        mdata  = fetch_market_data()
        market = get_active_market(mdata) if mdata else None

        if not stats or not market:
            save_state(state)
            return

        mu_a, meta = compute_mu(stats)
        analysis   = analyze_ranges(market, mu_a)
        entry      = get_entry_suggestion(analysis, mu_a)
        center     = entry['center'] if entry else None

        # ── 1. 到期倒计时 ──
        check_expiry_alerts(stats, analysis, entry, state)

        # ── 2. µ漂移检测（docs/知识库/RULES.md §4.3）──
        last_mu = state.get('last_mu')
        if last_mu is not None and can_alert(state, 'mu_drift', COOLDOWNS['mu_drift']):
            mu_delta = abs(mu_a - last_mu)
            if mu_delta >= 15:  # 约0.75档（RULES.md：1.5σ≈25-30条才换仓）
                direction  = '↗️ 上移' if mu_a > last_mu else '↘️ 下移'
                center_str = f"{center['range']}  市价{center['price']:.1f}¢" if center else '?'
                send_tg(
                    f"⚠️ *µ发生明显漂移*\n"
                    f"━━━━━━━━━━━━━━━━━━\n"
                    f"{last_mu:.0f} → {mu_a:.0f}条  {direction}了{mu_delta:.0f}条\n"
                    f"（超过0.75档阈值，中心落点可能已变）\n\n"
                    f"新中心落点：{center_str}\n\n"
                    f"💡 *操作提示*（docs/知识库/RULES.md §4.3）\n"
                    f"• 漂移 >25-30条（1.5σ）才考虑换仓\n"
                    f"• 调仓最好在死区（BJ 17:30）执行\n"
                    f"• 单日噪音不等于趋势，不要立刻动仓\n"
                    f"• 检查仓位：运行 /musk-check"
                )
                mark_alert(state, 'mu_drift')

        # ── 3. 中心区间价格异常（docs/知识库/RULES.md §1.1.2、§10.2）──
        if center and can_alert(state, 'price_high', COOLDOWNS['price_high']):
            if center['price'] > 35 and center['vr'] < 1.0:
                alternatives = sorted(
                    [a for a in analysis if a['range'] != center['range'] and a['vr'] >= 1.0],
                    key=lambda x: -x['vr']
                )
                alt_str = ''
                if alternatives:
                    best = alternatives[0]
                    alt_str = f"\n💡 价值比更优：`{best['range']}` {best['price']:.1f}¢  VR{best['vr']:.2f}x  {vr_label(best['vr'])}"
                send_tg(
                    f"⚠️ *中心区间定价偏高*（docs/知识库/RULES.md §1.1.2）\n"
                    f"━━━━━━━━━━━━━━━━━━\n"
                    f"中心落点 `{center['range']}` 已涨至 {center['price']:.1f}¢\n"
                    f"模型概率 ~{center['model_pct']:.0f}%  VR = {center['vr']:.2f}x ❌\n\n"
                    f"买中心区间是负EV操作\n"
                    f"（真实概率{center['model_pct']:.0f}% < 市场定价{center['price']:.0f}¢）\n"
                    f"{alt_str}\n\n"
                    f"完整对比：运行 /musk-scan"
                )
                mark_alert(state, 'price_high')

        # ── 4. 连续降温预警（docs/知识库/RULES.md §4.3 铁律）──
        daily_list = stats.get('daily', [])
        if len(daily_list) >= 2 and can_alert(state, 'rhythm_cold', COOLDOWNS['session_cold']):
            recent_2  = [parse_daily_count(d) for d in daily_list[-2:]]
            threshold = DAILY_AVG * 0.3  # 约13条/天
            if all(c < threshold for c in recent_2):
                send_tg(
                    f"❄️ *连续降温警告（docs/知识库/RULES.md §4.3 🔴 铁律）*\n"
                    f"━━━━━━━━━━━━━━━━━━\n"
                    f"近2天：{recent_2[0]:.0f}条 / {recent_2[1]:.0f}条\n"
                    f"（连续低于均值30%阈值 = {threshold:.0f}条/天）\n\n"
                    f"当前µ：{mu_a:.0f}条（*可能虚高约14条*）\n\n"
                    f"🔴 *必须在今日死区（BJ 17:30）：*\n"
                    f"1. 重算µ（手动下调约14条）\n"
                    f"2. 检查持仓区间是否仍在有效范围\n"
                    f"3. 若µ偏移 >1.5σ，评估是否换仓"
                )
                mark_alert(state, 'rhythm_cold')

        # ── 更新状态 ──
        state['last_count']        = stats['total']
        state['last_mu']           = mu_a
        state['last_center_range'] = center['range'] if center else None
        state['last_center_price'] = center['price'] if center else None

        save_state(state)

    except Exception as e:
        # check 是后台 cron，失败静默处理
        print(f"[CHECK-ERROR] {datetime.now().isoformat()} {e}")
        try:
            save_state(state)
        except Exception:
            pass


# ── 主入口 ────────────────────────────────────────────────────────────────────

WINDOW_DISPATCH = {
    'prebuild':   window_prebuild,
    'peak_check': window_peak_check,
    'peak_end':   window_peak_end,
    'deadzone':   window_deadzone,
    'morning_pre': window_morning_pre,
    'morning':    window_morning,
}


def main():
    args = sys.argv[1:]

    if not args:
        print(__doc__)
        return

    cmd = args[0]

    if cmd == 'window' and len(args) >= 2:
        fn = WINDOW_DISPATCH.get(args[1])
        if fn:
            fn()
        else:
            print(f"未知窗口类型: {args[1]}")
            print(f"可用类型: {list(WINDOW_DISPATCH.keys())}")

    elif cmd == 'check':
        cmd_check()

    elif cmd == 'test':
        ok = send_tg(
            "🤖 *马斯克推文市场 · Telegram 预警机器人*\n"
            "━━━━━━━━━━━━━━━━━━━━\n"
            "连接测试成功 ✅\n\n"
            "*将收到以下类型预警：*\n"
            "🎯 BJ 11:30 深夜会话前预告\n"
            "🔥/❄️ BJ 12:30 深夜会话内节奏检查\n"
            "🌙 BJ 16:30 深夜会话结束 · µ更新\n"
            "💤 BJ 17:30 死区必检三项\n"
            "🏙️ BJ 20:00 晨间会话预告\n"
            "🏙️ BJ 21:00 晨间建仓窗口\n"
            "📅 T-72h/24h/12h/6h 到期倒计时\n"
            "⚠️ µ漂移 · 价格异常 · 连续降温（随时）\n\n"
            "_规则库：/musk-tgbot_"
        )
        if ok:
            print("✅ 连接测试成功")
        else:
            print("❌ 发送失败，检查 TG_TOKEN 和 TG_CHAT_ID")

    else:
        print(__doc__)


if __name__ == '__main__':
    main()
