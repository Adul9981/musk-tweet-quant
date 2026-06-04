#!/usr/bin/env python3
"""
马斯克推文预测市场 — 数据引擎
用法:
  python musk_engine.py scan              # 完整市场扫描
  python musk_engine.py session           # 当前会话状态
  python musk_engine.py check RANGE ENTRY # 仓位检查 (ENTRY 为小数, 如 0.45)
"""

import sys
import json
import math
from datetime import datetime, timezone, timedelta
from urllib.request import urlopen, Request
from urllib.error import URLError

# ── 常量 ──────────────────────────────────────────────────────────────────────

GIST_ID   = 'd174b4498c408076ff218e164f24807e'
XTRACKER  = 'https://xtracker.polymarket.com/api/users/elonmusk/trackings?activeOnly=true'
REFERRAL  = '?via=serene77mc-g6kj'
DAILY_AVG = 43.4

# 206天历史数据 小时权重（北京时间）
HOURLY_WEIGHTS_BJ = {
     0: 0.0495,  1: 0.0500,  2: 0.0512,  3: 0.0503,  4: 0.0415,  5: 0.0310,
     6: 0.0263,  7: 0.0335,  8: 0.0350,  9: 0.0295, 10: 0.0240, 11: 0.0256,
    12: 0.0280, 13: 0.0699, 14: 0.0785, 15: 0.0616, 16: 0.0530, 17: 0.0270,
    18: 0.0183, 19: 0.0223, 20: 0.0347, 21: 0.0467, 22: 0.0603, 23: 0.0522,
}

# 5大会话定义（来自206天673个会话分析）
SESSIONS = [
    {'name':'下午会话','emoji':'☀️', 'hours':list(range(0,6)),  'cdt':'CDT 11am–5pm',
     'freq':0.97,'avg':14.4,'med':10,'strong':15,'weak':5,'contrib':13.9,'drop':14},
    {'name':'傍晚会话','emoji':'🌆', 'hours':list(range(6,11)), 'cdt':'CDT 5–10pm',
     'freq':0.51,'avg':11.4,'med':6, 'strong':9, 'weak':3,'contrib':5.8, 'drop':11},
    {'name':'深夜会话','emoji':'🌙', 'hours':list(range(11,17)),'cdt':'CDT 10pm–3am',
     'freq':0.71,'avg':14.3,'med':11,'strong':16,'weak':5,'contrib':10.1,'drop':14},
    {'name':'清晨过渡','emoji':'🌅', 'hours':list(range(17,20)),'cdt':'CDT 4–7am',
     'freq':0.16,'avg':16.4,'med':13,'strong':19,'weak':6,'contrib':2.6, 'drop':16},
    {'name':'上午会话','emoji':'🏙️', 'hours':list(range(20,24)),'cdt':'CDT 7–11am',
     'freq':0.64,'avg':10.9,'med':8, 'strong':12,'weak':4,'contrib':7.0, 'drop':11},
]

# ── 工具函数 ───────────────────────────────────────────────────────────────────

def bj_now():
    return datetime.now(timezone(timedelta(hours=8)))

def get_bj_hour():
    return bj_now().hour

def fetch_json(url, headers=None):
    h = {'User-Agent': 'MuskEngine/1.0', 'Accept': 'application/json'}
    if headers:
        h.update(headers)
    req = Request(url, headers=h)
    with urlopen(req, timeout=15) as r:
        return json.loads(r.read())

def parse_range(s):
    s = s.replace('–','-').replace('—','-').strip()
    if '+' in s:
        lo = int(s.replace('+','').strip())
        return (lo, lo + 999)
    if '-' in s:
        parts = s.split('-')
        if len(parts) == 2:
            try:
                return (int(parts[0].strip()), int(parts[1].strip()))
            except:
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

def value_ratio(market_pct, model_pct):
    return model_pct / market_pct if market_pct > 0 else 0.0

def vr_label(vr):
    if vr >= 2.5:  return '⭐ 高赔率低估'
    if vr >= 1.5:  return '✅ 明显低估'
    if vr >= 1.2:  return '✅ 低估'
    if vr >= 1.0:  return '🟡 合理'
    if vr >= 0.8:  return '🟠 略高估'
    return '❌ 高估'

def suggest_entry(analysis, mu_a):
    """
    基于新规则（2026-05-27）生成入场结构建议：
    - 主仓：价值比最高的候选区间（model_pct > 10%）
    - 保护仓：中心落点下方1档（模型存在+0.3档系统性偏高，下侧风险更大）
    - 高赔率仓：价值比≥2.5且价格≤5¢的区间（可选）
    """
    if not analysis:
        return None

    # 找中心区间
    center = next((a for a in analysis if a['is_center']), None)
    if not center:
        center = min(analysis, key=lambda x: abs((x['parsed'][0]+x['parsed'][1])/2 - mu_a))

    # 中心区间是否定价过高（>35¢ 且 价值比<1.0）
    center_overpriced = center['price'] > 35 and center['vr'] < 1.0

    # 主仓候选：model_pct>10% 且价值比最高
    candidates = [a for a in analysis if a['model_pct'] > 10]
    main = max(candidates, key=lambda x: x['vr']) if candidates else center

    # 保护仓：中心落点正下方1档（因模型有+0.3档系统性偏高偏差）
    sorted_by_low = sorted(analysis, key=lambda x: x['parsed'][0])
    center_idx = next((i for i,a in enumerate(sorted_by_low) if a['range'] == center['range']), None)
    protect = sorted_by_low[center_idx - 1] if center_idx and center_idx > 0 else None

    # 高赔率候选：价格≤5¢ 且 价值比≥2.0
    lottery = [a for a in analysis if a['price'] <= 5 and a['vr'] >= 2.0
               and a['range'] not in {main['range'], protect['range'] if protect else ''}]
    lottery.sort(key=lambda x: -x['vr'])

    return {
        'center': center,
        'center_overpriced': center_overpriced,
        'main': main,
        'protect': protect,
        'lottery': lottery[:2],  # 最多2个高赔率仓候选
    }

# ── µ 计算 ─────────────────────────────────────────────────────────────────────

def simple_mu(C, pace, days_rem):
    return C + pace * days_rem

def time_weighted_mu(C, pace, days_rem):
    bj_h = get_bj_hour()
    rem_hours = days_rem * 24
    weight_sum = sum(HOURLY_WEIGHTS_BJ[(bj_h + i) % 24] for i in range(int(rem_hours)))
    expected   = rem_hours / 24  # 如果均匀分布，每小时权重=1/24，总和=rem_hours/24
    correction = (weight_sum - expected) * pace * 24 * 0.35  # 35%修正强度防止过拟合
    return C + pace * days_rem + correction

def best_mu(C, pace, days_rem):
    s = simple_mu(C, pace, days_rem)
    w = time_weighted_mu(C, pace, days_rem)
    return (s + w) / 2

def adaptive_mu(C, pace, days_rem, daily_breakdown=None, total_hours=168):
    """
    信心加权融合µ：随周期推进，当期实测数据权重逐渐增大
    - 周期初期：80%+依赖历史均值
    - 周期中期：50/50融合
    - 临近到期：80%+依赖当期实测节奏
    daily_breakdown: 每日推文数列表（xtracker返回），用于提取近24h速率
    """
    mu_hist = time_weighted_mu(C, pace, days_rem)

    hours_rem      = days_rem * 24
    elapsed_hours  = max(1, total_hours - hours_rem)
    elapsed_frac   = min(1.0, elapsed_hours / total_hours)

    # 全周期平均速率（条/小时）
    full_pace_h = C / elapsed_hours

    # 近24小时速率（从每日明细取最近1-2天）
    recent_pace_h = None
    if daily_breakdown and len(daily_breakdown) >= 1:
        recent = daily_breakdown[-2:] if len(daily_breakdown) >= 2 else daily_breakdown[-1:]
        recent_tweets = sum(d if isinstance(d, (int, float)) else d.get('count', 0) for d in recent)
        recent_hours  = len(recent) * 24
        if recent_hours > 0:
            recent_pace_h = recent_tweets / recent_hours

    # 混合当期速率：近24h 60% + 全程均值 40%
    if recent_pace_h is not None:
        blended_h = 0.6 * recent_pace_h + 0.4 * full_pace_h
    else:
        blended_h = full_pace_h

    # 当期观测µ（用混合速率推算剩余时间）
    mu_curr = C + blended_h * hours_rem

    # 信心权重：随已过时间线性增大，最高80%
    curr_weight = min(0.8, elapsed_frac * 1.2)
    hist_weight = 1.0 - curr_weight

    mu_adap = curr_weight * mu_curr + hist_weight * mu_hist

    meta = {
        'mu_historical':   round(mu_hist, 1),
        'mu_current':      round(mu_curr, 1),
        'current_weight':  round(curr_weight, 2),
        'hist_weight':     round(hist_weight, 2),
        'elapsed_frac':    round(elapsed_frac, 2),
        'full_pace_daily': round(full_pace_h * 24, 1),
        'recent_pace_daily': round(recent_pace_h * 24, 1) if recent_pace_h else None,
        'blended_pace_daily': round(blended_h * 24, 1),
    }
    return round(mu_adap, 1), meta

# ── 会话分析 ───────────────────────────────────────────────────────────────────

def session_states():
    h = get_bj_hour()
    result = []
    for sess in SESSIONS:
        h_start = sess['hours'][0]
        h_end   = sess['hours'][-1]
        if h < h_start:
            status = 'upcoming'
            eta    = f"{h_start - h}h后开始"
        elif h <= h_end:
            status = 'ongoing'
            eta    = '进行中 ◀'
        else:
            status = 'past'
            eta    = '已结束'
        result.append({**sess, 'status': status, 'eta': eta})
    return result

# ── 时机信号 ────────────────────────────────────────────────────────────────────

def timing_signal(h=None):
    h = h if h is not None else get_bj_hour()
    if h == 12:
        return 'BEST',   '🎯 最强建仓窗口',  'BJ 12:00 深夜爆发前30分钟——历史+150%跳跃，是全天价格最低洼，立即评估建仓'
    elif 13 <= h <= 16:
        return 'ACTIVE', '🌙 深夜爆发中',    '全天最高活跃期（CDT凌晨），持仓观察，BJ 14–15 是止盈最佳窗口'
    elif h == 21 or h == 22:
        return 'GOOD',   '🏙️ 晨间建仓窗口', 'CDT 8–9am 美国上午开始，活跃度回升，价值比 > 1.0 可入场建主仓'
    elif h == 18:
        return 'DEAD',   '💤 死区（全天最低）','全天最低点，µ不变，适合冷静评估错误仓位，是最理性的剪仓时机'
    elif 17 <= h <= 19:
        return 'DEAD',   '💤 睡眠过渡期',    'µ几乎停止增长，建议不操作，等待 BJ 20 后回暖'
    elif 0 <= h <= 4:
        return 'WATCH',  '☀️ 美国下午',      '活跃度中等稳定，观察今日节奏是否正常（预期日均约14条）'
    else:
        return 'NEUTRAL','🔵 过渡时段',      '活跃度中等，无明显建仓或止盈信号，持仓观察即可'

# ── 数据获取 ────────────────────────────────────────────────────────────────────

def fetch_market_data():
    gist = fetch_json(f'https://api.github.com/gists/{GIST_ID}',
                      {'Accept': 'application/vnd.github.v3+json'})
    content = gist['files']['polymarket-data.json']['content']
    return json.loads(content)

def fetch_current_tracking(market):
    """两步获取：先拿 tracking id，再拿 stats"""
    data = fetch_json(XTRACKER)
    if not data.get('success') or not data.get('data'):
        return None

    market_end = datetime.fromisoformat(market.get('end_date','').replace('Z','')).replace(tzinfo=timezone.utc)

    # 选匹配 market 的7天 tracking
    best = None
    for t in data['data']:
        try:
            s = datetime.fromisoformat(t['startDate'].replace('Z',''))
            e = datetime.fromisoformat(t['endDate'].replace('Z',''))
            if not (5 <= (e - s).days <= 8):
                continue
            t_end = e.replace(tzinfo=timezone.utc)
            diff = abs((t_end - market_end).total_seconds())
            if diff < 4 * 3600:
                best = t; break
        except:
            continue

    if not best:
        # fallback: 任意7天 tracking
        for t in data['data']:
            try:
                s = datetime.fromisoformat(t['startDate'].replace('Z',''))
                e = datetime.fromisoformat(t['endDate'].replace('Z',''))
                if 5 <= (e - s).days <= 8:
                    best = t; break
            except:
                continue

    if not best:
        return None

    # 第二步: 拿详细 stats
    try:
        stats_url  = f"https://xtracker.polymarket.com/api/trackings/{best['id']}?includeStats=true"
        stats_data = fetch_json(stats_url)
        if stats_data.get('success') and stats_data.get('data', {}).get('stats'):
            raw = stats_data['data']['stats']
            now_utc = datetime.now(timezone.utc)
            end_dt  = datetime.fromisoformat(best['endDate'].replace('Z','')).replace(tzinfo=timezone.utc)
            diff_ms = (end_dt - now_utc).total_seconds()
            days_rem    = max(0, diff_ms / 86400)
            hours_rem   = max(0, diff_ms / 3600)
            elapsed     = raw.get('daysElapsed', 1) or 1
            actual_pace = round(raw.get('total', 0) / elapsed) if elapsed > 0 else DAILY_AVG
            start_dt      = datetime.fromisoformat(best['startDate'].replace('Z','')).replace(tzinfo=timezone.utc)
            total_hours   = max(1, (end_dt - start_dt).total_seconds() / 3600)
            elapsed_hours = max(1, total_hours - hours_rem)
            return {
                **best,
                'stats': {
                    'total':          raw.get('total', 0),
                    'pace':           actual_pace,
                    'daysRemaining':  days_rem,
                    'hoursRemaining': hours_rem,
                    'totalHours':     total_hours,
                    'elapsedHours':   elapsed_hours,
                    'daily':          raw.get('daily', []),
                }
            }
    except Exception as e:
        pass  # fallback to basic info

    return best

# ── CMD: scan ──────────────────────────────────────────────────────────────────

def cmd_scan():
    now = bj_now()
    h   = now.hour
    print(f"\n⏳ 正在拉取实时数据... (北京时间 {now.strftime('%H:%M')})\n")

    try:
        mdata = fetch_market_data()
    except Exception as e:
        print(f"❌ 无法获取市场数据: {e}\n"); return

    # Gist 数据是 list，按到期日排序，优先选有有效价格的市场
    now_utc = datetime.now(timezone.utc)
    all_markets = sorted(
        [m for m in mdata if isinstance(m, dict) and m.get('ranges')],
        key=lambda m: m.get('end_date', '')
    )
    # 选还没到期的最近市场（有活跃价格）
    markets = [m for m in all_markets
               if datetime.fromisoformat(m['end_date'].replace('Z','')).replace(tzinfo=timezone.utc) > now_utc
               and any(r.get('price',0) > 0 for r in m.get('ranges',[]))]
    if not markets:
        markets = all_markets  # fallback: 取所有
    if not markets:
        print("❌ 没有找到活跃市场\n"); return

    market = markets[0]

    try:
        tracking = fetch_current_tracking(market)
    except Exception as e:
        print(f"⚠️ 无法获取推文追踪数据: {e}")
        tracking = None

    if tracking and tracking.get('stats'):
        C           = tracking['stats'].get('total', 0)
        pace        = tracking['stats'].get('pace', DAILY_AVG) or DAILY_AVG
        days_rem    = tracking['stats'].get('daysRemaining', 0)
        total_hours = tracking['stats'].get('totalHours', 168)
        daily       = tracking['stats'].get('daily', [])
        if days_rem == 0:
            t_end    = datetime.fromisoformat(tracking['endDate'].replace('Z','')).replace(tzinfo=timezone.utc)
            days_rem = max(0, (t_end - datetime.now(timezone.utc)).total_seconds() / 86400)
    else:
        C, pace, days_rem, total_hours, daily = 0, DAILY_AVG, 3.0, 168, []

    mu_s           = simple_mu(C, pace, days_rem)
    mu_w           = time_weighted_mu(C, pace, days_rem)
    mu_b           = best_mu(C, pace, days_rem)
    mu_a, adap_meta = adaptive_mu(C, pace, days_rem, daily_breakdown=daily, total_hours=total_hours)

    # 区间分析（使用自适应µ作为主判断依据）
    ranges_raw = market.get('ranges', [])
    analysis = []
    total_p   = 0
    for r in ranges_raw:
        parsed = parse_range(r.get('range',''))
        if not parsed or r.get('price', 0) < 1: continue
        p = poisson_prob(parsed[0], parsed[1], mu_a)
        total_p += p
        analysis.append({'range': r['range'], 'price': r['price'], 'parsed': parsed, 'raw_p': p,
                         'is_center': parsed[0] <= mu_a <= parsed[1]})
    for a in analysis:
        a['model_pct'] = (a['raw_p'] / total_p * 100) if total_p > 0 else 0
        a['vr'] = value_ratio(a['price'], a['model_pct'])
    analysis.sort(key=lambda x: x['parsed'][0])

    level, badge, desc = timing_signal(h)
    sessions = session_states()

    # ── 输出 ──
    SEP = '─' * 62
    print(SEP)
    print(f"  📊 马斯克推文预测市场  ·  实时扫描")
    print(f"  {now.strftime('%Y-%m-%d %H:%M')} 北京时间")
    print(SEP)

    print(f"\n⏰  当前时机：{badge}")
    print(f"    {desc}\n")

    title_short = market.get('title','')[:55]
    print(f"📋  {title_short}")
    print(f"    当前 {C} 条  ·  剩余 {days_rem:.1f} 天  ·  周期已过 {adap_meta['elapsed_frac']*100:.0f}%")

    # µ对比
    print(f"\n📐  µ 预测对比：")
    print(f"    历史时间加权µ  {adap_meta['mu_historical']:.0f}    （纯历史规律）")
    print(f"    当期观测µ      {adap_meta['mu_current']:.0f}    （当期实测节奏推算）")
    print(f"    ✨ 自适应µ     {mu_a:.0f}    （当期 {adap_meta['current_weight']*100:.0f}% + 历史 {adap_meta['hist_weight']*100:.0f}%）")

    # 今日节奏对比
    hist_daily = DAILY_AVG
    curr_daily = adap_meta['blended_pace_daily']
    recent_daily = adap_meta.get('recent_pace_daily')
    deviation = (curr_daily - hist_daily) / hist_daily * 100
    if recent_daily is not None:
        recent_dev = (recent_daily - hist_daily) / hist_daily * 100
        recent_str = f"近24h {recent_daily:.1f} 条/天（{'+' if recent_dev>=0 else ''}{recent_dev:.0f}%）"
    else:
        recent_str = "近24h 数据不足"
    pace_flag = '🔥 偏热' if deviation > 15 else ('❄️ 偏冷' if deviation < -15 else '✅ 正常')
    print(f"\n📈  节奏对比：历史均值 {hist_daily} 条/天")
    print(f"    全程均速  {adap_meta['full_pace_daily']:.1f} 条/天  ·  {recent_str}")
    print(f"    综合当期  {curr_daily:.1f} 条/天  {pace_flag}（偏差 {'+' if deviation>=0 else ''}{deviation:.0f}%）")

    print(f"\n🎯  中心落点区间 (µ ≈ {mu_a:.0f})：")
    centers = [a for a in analysis if a['is_center']]
    if centers:
        for c in centers:
            print(f"    ★ {c['range']:<12}  市价 {c['price']:5.1f}¢  模型 {c['model_pct']:5.1f}%  价值比 {c['vr']:.2f}x  {vr_label(c['vr'])}")
            if c['price'] > 35 and c['vr'] < 1.0:
                print(f"    ⚠️  中心区间价格 > 35¢ 且价值比 < 1.0 → 市场已充分定价，建议看两侧区间")
    else:
        print(f"    (µ={mu_a:.0f} 暂无完全匹配区间，请看下方全表)")

    print(f"\n💰  各区间价值比全表（model_pct > 2%）：")
    print(f"    {'区间':<12}  {'市价':>6}  {'模型概率':>8}  {'价值比':>6}  评级")
    print(f"    {'─'*12}  {'─'*6}  {'─'*8}  {'─'*6}  {'─'*12}")
    visible = sorted([a for a in analysis if a['model_pct'] > 2.0], key=lambda x: x['parsed'][0])
    for a in visible:
        tag = ' ★' if a['is_center'] else ''
        print(f"    {a['range']:<12}  {a['price']:5.1f}¢  {a['model_pct']:7.1f}%  {a['vr']:5.2f}x  {vr_label(a['vr'])}{tag}")

    # ── 入场结构建议 ──
    entry = suggest_entry(analysis, mu_a)
    if entry:
        print(f"\n📋  入场结构建议（基于价值比 + 回测规律）：")
        m = entry['main']
        p = entry['protect']

        # 主仓
        main_is_center = m['range'] == entry['center']['range']
        main_label = '中心落点' if main_is_center else f'偏移中心（中心为{entry["center"]["range"]}）'
        print(f"    🟦 主仓  50-70%  →  {m['range']}  市价 {m['price']:.1f}¢  价值比 {m['vr']:.2f}x  [{main_label}]")

        if entry['center_overpriced'] and not main_is_center:
            print(f"       ⚠️  中心区间已被高估，主仓移至价值比更高的相邻区间")

        # 保护仓（下方1档，因模型系统性偏高+0.3档）
        if p:
            protect_note = '（模型系统性偏高+0.3档，下方1档做对冲）'
            print(f"    🟨 保护仓 20-30%  →  {p['range']}  市价 {p['price']:.1f}¢  价值比 {p['vr']:.2f}x  {protect_note}")
        else:
            print(f"    🟨 保护仓  —  中心已在最低档，无下方区间可覆盖")

        # 高赔率仓
        if entry['lottery']:
            for lt in entry['lottery']:
                print(f"    ⭐ 高赔率仓 ≤5%  →  {lt['range']}  市价 {lt['price']:.1f}¢  价值比 {lt['vr']:.2f}x  （可选尾部押注）")
        else:
            print(f"    ⭐ 高赔率仓  —  当前无符合条件的高赔率区间（需价格≤5¢ 且 VR≥2.0）")

        # 总体评估
        if m['vr'] >= 1.2:
            entry_ok = '✅ 当前有入场价值（主仓价值比≥1.2）'
        elif m['vr'] >= 1.0:
            entry_ok = '🟡 勉强可入（价值比≥1.0但不高，建议等更好时机）'
        else:
            entry_ok = '❌ 当前无正期望入场点（最优区间价值比<1.0）'
        print(f"\n    总体评估：{entry_ok}")

    print(f"\n🕐  今日会话进展（北京时间）：")
    for s in sessions:
        print(f"    {s['emoji']} {s['name']:<6}  {s['cdt']:<16}  → {s['eta']}")

    print(f"\n{SEP}")
    print(f"  🔗 https://polymarket.com/event/{market.get('slug','')}{REFERRAL}")
    print(f"{SEP}\n")

# ── CMD: session ───────────────────────────────────────────────────────────────

def cmd_session():
    now = bj_now()
    h   = now.hour
    level, badge, desc = timing_signal(h)
    sessions = session_states()

    print(f"\n🕐  北京时间 {now.strftime('%H:%M')}  —  {badge}")
    print(f"    {desc}\n")
    print("  今日各会话状态：")
    for s in sessions:
        note = ''
        if s['status'] == 'ongoing':
            note = '  ← 你在这里'
        elif s['name'] == '深夜会话' and s['status'] == 'upcoming':
            note = '  ⚠️ 落点最大变量，提前关注'
        print(f"    {s['emoji']} {s['name']:<6}  {s['eta']:<16} {note}")
    print()

# ── CMD: check ─────────────────────────────────────────────────────────────────

def cmd_check(range_str, entry_price_decimal):
    now = bj_now()
    h   = now.hour
    print(f"\n⏳ 分析仓位中... (北京时间 {now.strftime('%H:%M')})\n")

    try:
        mdata    = fetch_market_data()
        now_utc2 = datetime.now(timezone.utc)
        all_m    = sorted([m for m in mdata if isinstance(m,dict) and m.get('ranges')],
                          key=lambda m: m.get('end_date',''))
        markets  = [m for m in all_m
                    if datetime.fromisoformat(m['end_date'].replace('Z','')).replace(tzinfo=timezone.utc) > now_utc2
                    and any(r.get('price',0)>0 for r in m.get('ranges',[]))] or all_m
        market   = markets[0]
        tracking = fetch_current_tracking(market)
    except Exception as e:
        print(f"❌ 数据获取失败: {e}\n"); return

    if tracking and tracking.get('stats'):
        C           = tracking['stats'].get('total', 0)
        pace        = tracking['stats'].get('pace', DAILY_AVG) or DAILY_AVG
        days_rem    = tracking['stats'].get('daysRemaining', 0)
        total_hours = tracking['stats'].get('totalHours', 168)
        daily       = tracking['stats'].get('daily', [])
        if days_rem == 0:
            t_end    = datetime.fromisoformat(tracking['endDate'].replace('Z','')).replace(tzinfo=timezone.utc)
            days_rem = max(0, (t_end - datetime.now(timezone.utc)).total_seconds() / 86400)
    else:
        C, pace, days_rem, total_hours, daily = 0, DAILY_AVG, 3.0, 168, []

    mu_a, adap_meta = adaptive_mu(C, pace, days_rem, daily_breakdown=daily, total_hours=total_hours)
    mu_b = mu_a  # 用自适应µ作为主判断依据

    # 找目标区间
    parsed = parse_range(range_str)
    if not parsed:
        print(f"❌ 无法解析区间: {range_str}\n"); return

    ranges_raw = market.get('ranges', [])
    analysis = []
    total_p  = 0
    for r in ranges_raw:
        p2 = parse_range(r.get('range',''))
        if not p2 or r.get('price',0) < 1: continue
        prob = poisson_prob(p2[0], p2[1], mu_b)
        total_p += prob
        analysis.append({'range': r['range'], 'price': r['price'], 'parsed': p2, 'raw_p': prob})
    for a in analysis:
        a['model_pct'] = (a['raw_p'] / total_p * 100) if total_p > 0 else 0
        a['vr'] = value_ratio(a['price'], a['model_pct'])

    target = next((a for a in analysis if a['parsed'] == parsed), None)
    if not target:
        # 模糊匹配
        target = next((a for a in analysis if abs(a['parsed'][0] - parsed[0]) <= 5), None)
    if not target:
        print(f"❌ 区间 {range_str} 不在当前市场列表\n"); return

    mu_in_range = parsed[0] <= mu_b <= parsed[1]
    entry_price_c = entry_price_decimal * 100
    current_price = target['price']
    pnl_pct = (current_price / entry_price_c - 1) * 100
    model_pct = target['model_pct']
    vr = target['vr']
    center_dist = mu_b - (parsed[0] + parsed[1]) / 2

    if mu_in_range and vr >= 1.2:
        action = '✅ 继续持仓'
        color  = ''
        reason = f'最佳µ ({mu_b:.0f}) 仍在你的区间内，价值比 {vr:.2f}x 健康，无需操作'
    elif mu_in_range and 0.8 <= vr < 1.2:
        action = '🟡 持仓观望'
        color  = ''
        reason = f'µ在区间内但价值比 {vr:.2f}x 偏低，持有到到期，不建议加仓'
    elif not mu_in_range and model_pct >= 15:
        action = '⚠️ 注意边界'
        color  = ''
        reason = f'µ={mu_b:.0f} 偏出区间中心约 {abs(center_dist):.0f} 条，仍有 {model_pct:.1f}% 概率，可持有但设好止损'
    elif model_pct < 10:
        action = '🔴 建议出场'
        color  = ''
        reason = f'模型概率仅 {model_pct:.1f}%，µ={mu_b:.0f} 大幅偏离，继续持有期望值为负'
    else:
        action = '🟠 减半仓'
        color  = ''
        reason = f'µ偏出，价值比 {vr:.2f}x 偏低，建议留半仓赌小概率，减半止损'

    SEP = '─' * 62
    print(SEP)
    print(f"  🔍 仓位检查报告  ·  {now.strftime('%Y-%m-%d %H:%M')} 北京")
    print(SEP)
    print(f"  持仓区间 : {range_str}")
    print(f"  入场价   : {entry_price_c:.1f}¢   当前市价 : {current_price:.1f}¢")
    pnl_str = f"+{pnl_pct:.1f}%" if pnl_pct >= 0 else f"{pnl_pct:.1f}%"
    print(f"  浮动盈亏 : {pnl_str}")
    curr_w = adap_meta['current_weight']
    deviation = 0
    if adap_meta['full_pace_daily'] and DAILY_AVG:
        deviation = (adap_meta['blended_pace_daily'] - DAILY_AVG) / DAILY_AVG * 100
    pace_flag = '🔥偏热' if deviation > 15 else ('❄️偏冷' if deviation < -15 else '✅正常')
    print(f"\n  自适应µ  : {mu_b:.0f} 条  |  剩余 {days_rem:.1f} 天  |  周期已过 {adap_meta['elapsed_frac']*100:.0f}%")
    print(f"  当期节奏 : {adap_meta['blended_pace_daily']:.1f} 条/天 {pace_flag}  （当期权重 {curr_w*100:.0f}% / 历史 {(1-curr_w)*100:.0f}%）")
    print(f"  模型概率 : {model_pct:.1f}%  |  价值比 {vr:.2f}x  |  µ {'在' if mu_in_range else '偏出'}区间")
    print(f"\n  📋 建议  : {action}")
    print(f"  {reason}")

    # ── 相邻区间对比（核心新增：横向价值比比较）──
    sorted_ranges = sorted(analysis, key=lambda x: x['parsed'][0])
    target_idx = next((i for i,a in enumerate(sorted_ranges) if a['range'] == target['range']), None)

    neighbors = []
    if target_idx is not None:
        for delta in [-2, -1, 1, 2]:
            idx = target_idx + delta
            if 0 <= idx < len(sorted_ranges):
                neighbors.append((delta, sorted_ranges[idx]))

    if neighbors:
        print(f"\n  🔄 相邻区间对比（横向价值比检验）：")
        print(f"  {'区间':<12}  {'市价':>6}  {'模型概率':>8}  {'价值比':>6}  评级  备注")
        print(f"  {'─'*12}  {'─'*6}  {'─'*8}  {'─'*6}  {'─'*8}  {'─'*10}")
        for delta, nb in sorted(neighbors, key=lambda x: x[0]):
            note = '← 你的仓位' if nb['range'] == target['range'] else \
                   ('← 保护仓候选' if delta == -1 else '')
            print(f"  {nb['range']:<12}  {nb['price']:5.1f}¢  {nb['model_pct']:7.1f}%  {nb['vr']:5.2f}x  {vr_label(nb['vr']):<10}  {note}")
        # 也打印持仓区间本身
        print(f"  {target['range']:<12}  {target['price']:5.1f}¢  {target['model_pct']:7.1f}%  {target['vr']:5.2f}x  {vr_label(target['vr']):<10}  ← 你的仓位")

        # 有没有更好的相邻区间？
        better = [nb for _, nb in neighbors if nb['vr'] > target['vr'] and nb['model_pct'] > 8]
        if better:
            best_alt = max(better, key=lambda x: x['vr'])
            print(f"\n  💡 相邻区间 {best_alt['range']} 价值比 {best_alt['vr']:.2f}x > 当前持仓 {vr:.2f}x")
            print(f"     如果µ支持，可考虑将部分仓位移至该区间（需权衡换仓成本）")

    level, badge, desc = timing_signal(h)
    print(f"\n  ⏰ 当前时机: {badge}")
    print(f"  {desc}")
    print(f"\n{SEP}\n")

# ── 入口 ───────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    args = sys.argv[1:]
    if not args or args[0] == 'scan':
        cmd_scan()
    elif args[0] == 'session':
        cmd_session()
    elif args[0] == 'check' and len(args) >= 3:
        cmd_check(args[1], float(args[2]))
    else:
        print(__doc__)
