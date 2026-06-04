#!/usr/bin/env python3
"""
马斯克推文预测模型回测脚本
测试：在到期前 t-3天/t-2天/t-1天，模型预测的中心区间是否命中实际落点

数据来源：
  - 市场结算结果：Polymarket Gamma API
  - 每日推文数：xtracker.polymarket.com/api/users/elonmusk/posts（聚合UTC日期）
  - 样本：33期，2025-11-04 至 2026-05-26

注意：每日推文数基于UTC日期，市场边界为12pm ET (16:00 UTC)，day1存在约半天偏差。
"""

import math
from datetime import date, timedelta

# ──────────────────────────────────────────────────────────────────────
# 历史时间权重（206天数据，BJ时间，每小时日均发推条数）
# ──────────────────────────────────────────────────────────────────────
HOURLY_WEIGHTS_BJ = {
    0: 2.15, 1: 1.72, 2: 1.45, 3: 1.12, 4: 0.98, 5: 0.89,
    6: 0.92, 7: 0.97, 8: 1.05, 9: 1.08, 10: 1.12, 11: 1.18,
    12: 1.20, 13: 3.03, 14: 3.41, 15: 2.67, 16: 2.30, 17: 1.15,
    18: 0.80, 19: 0.85, 20: 1.20, 21: 1.65, 22: 2.62, 23: 2.27,
}
HIST_DAILY_AVG = 43.4  # 历史日均发推数（2025-11 至 2026-05 全期均值）
# 注：Apr-May 2026实际日均约22-28条，全期均值43.4偏高（受Jan 2026峰值影响）


# ──────────────────────────────────────────────────────────────────────
# 模型核心：给定当前累积数和剩余天数，预测最终µ
# ──────────────────────────────────────────────────────────────────────
def predict_mu(current_total: int, days_elapsed: float, days_remaining: float,
               use_adaptive: bool = True) -> dict:
    """
    预测最终推文总数µ

    Returns:
        dict with keys: simple_mu, adaptive_mu, center_range_simple, center_range_adaptive
    """
    # 1. 简单µ：当前 + 历史均速 × 剩余天数
    simple_mu = current_total + HIST_DAILY_AVG * days_remaining

    # 2. 自适应µ：结合当期实测节奏
    if days_elapsed > 0:
        current_pace = current_total / days_elapsed  # 条/天
        elapsed_ratio = days_elapsed / (days_elapsed + days_remaining)  # 0→1
        current_weight = min(0.8, elapsed_ratio * 1.2)  # 最多80%权重给当期
        hist_weight = 1 - current_weight

        adaptive_pace = current_weight * current_pace + hist_weight * HIST_DAILY_AVG
        adaptive_mu = current_total + adaptive_pace * days_remaining

        deviation_pct = (current_pace - HIST_DAILY_AVG) / HIST_DAILY_AVG * 100
        pace_flag = '🔥偏热' if deviation_pct > 20 else ('❄️偏冷' if deviation_pct < -20 else '✅正常')
    else:
        adaptive_mu = simple_mu
        deviation_pct = 0
        pace_flag = '✅正常'

    # 3. 最终预测：adaptive或simple
    best_mu = adaptive_mu if use_adaptive else simple_mu

    def mu_to_range(mu):
        if mu >= 500: return '500+'
        low = int(mu // 20) * 20
        return f"{low}-{low+19}"

    return {
        'simple_mu': round(simple_mu, 1),
        'adaptive_mu': round(adaptive_mu if use_adaptive else simple_mu, 1),
        'best_mu': round(best_mu, 1),
        'current_pace': round(current_total / days_elapsed, 1) if days_elapsed > 0 else 0,
        'deviation_pct': round(deviation_pct, 1),
        'pace_flag': pace_flag,
        'center_range_simple': mu_to_range(simple_mu),
        'center_range_adaptive': mu_to_range(adaptive_mu if use_adaptive else simple_mu),
    }


def range_distance(predicted: str, actual: str) -> int:
    """计算两个区间之间相差几档（每档20条）"""
    def range_low(r):
        if r == '500+': return 500
        return int(r.split('-')[0])
    return abs(range_low(predicted) - range_low(actual)) // 20


# ──────────────────────────────────────────────────────────────────────
# 历史数据（33期，2025-11-04 至 2026-05-26）
# 来源：Gamma API结算结果 + xtracker每日推文聚合（UTC日期）
# ──────────────────────────────────────────────────────────────────────
HISTORICAL_PERIODS = [
    # 2025-11-04 → 2025-11-11, 总146条
    {'name':'2025-11-04', 'end_date':'2025-11-11', 'actual_winner':'140-159',
     'daily': [30, 10, 14, 28, 23, 21, 20]},
    # 2025-11-07 → 2025-11-14, 总220条
    {'name':'2025-11-07', 'end_date':'2025-11-14', 'actual_winner':'240-259',
     'daily': [28, 23, 21, 20, 29, 45, 54]},
    # 2025-11-25 → 2025-12-02, 总283条
    {'name':'2025-11-25', 'end_date':'2025-12-02', 'actual_winner':'260-279',
     'daily': [68, 39, 50, 42, 17, 37, 30]},
    # 2025-11-28 → 2025-12-05, 总258条
    {'name':'2025-11-28', 'end_date':'2025-12-05', 'actual_winner':'240-259',
     'daily': [42, 17, 37, 30, 49, 25, 58]},
    # 2025-12-16 → 2025-12-23, 总343条
    {'name':'2025-12-16', 'end_date':'2025-12-23', 'actual_winner':'340-359',
     'daily': [31, 63, 27, 80, 10, 87, 45]},
    # 2025-12-19 → 2025-12-26, 总358条
    {'name':'2025-12-19', 'end_date':'2025-12-26', 'actual_winner':'340-359',
     'daily': [80, 10, 87, 45, 30, 71, 35]},
    # 2026-01-03 → 2026-01-10, 总574条（峰值期）
    {'name':'2026-01-03', 'end_date':'2026-01-10', 'actual_winner':'500+',
     'daily': [93, 84, 56, 74, 83, 109, 75]},
    # 2026-01-06 → 2026-01-13, 总572条（峰值期，市场有540-559细分桶）
    {'name':'2026-01-06', 'end_date':'2026-01-13', 'actual_winner':'540-559',
     'daily': [74, 83, 109, 75, 110, 84, 37]},
    # 2026-01-09 → 2026-01-16, 总528条（峰值期，市场有540-559细分桶）
    {'name':'2026-01-09', 'end_date':'2026-01-16', 'actual_winner':'540-559',
     'daily': [75, 110, 84, 37, 43, 100, 79]},
    # 2026-01-27 → 2026-02-03, 总353条
    {'name':'2026-01-27', 'end_date':'2026-02-03', 'actual_winner':'340-359',
     'daily': [39, 40, 97, 56, 44, 43, 34]},
    # 2026-01-30 → 2026-02-06, 总299条
    {'name':'2026-01-30', 'end_date':'2026-02-06', 'actual_winner':'280-299',
     'daily': [56, 44, 43, 34, 59, 41, 22]},
    # 2026-02-17 → 2026-02-24, 总349条
    {'name':'2026-02-17', 'end_date':'2026-02-24', 'actual_winner':'360-379',
     'daily': [75, 27, 42, 79, 54, 31, 41]},
    # 2026-02-20 → 2026-02-27, 总340条
    {'name':'2026-02-20', 'end_date':'2026-02-27', 'actual_winner':'300-319',
     'daily': [79, 54, 31, 41, 41, 43, 51]},
    # 2026-03-03 → 2026-03-10, 总315条
    {'name':'2026-03-03', 'end_date':'2026-03-10', 'actual_winner':'340-359',
     'daily': [14, 32, 57, 35, 60, 60, 57]},
    # 2026-03-06 → 2026-03-13, 总366条
    {'name':'2026-03-06', 'end_date':'2026-03-13', 'actual_winner':'360-379',
     'daily': [35, 60, 60, 57, 81, 16, 57]},
    # 2026-03-10 → 2026-03-17, 总307条
    {'name':'2026-03-10', 'end_date':'2026-03-17', 'actual_winner':'280-299',
     'daily': [81, 16, 57, 64, 37, 29, 23]},
    # 2026-03-17 → 2026-03-24, 总382条
    {'name':'2026-03-17', 'end_date':'2026-03-24', 'actual_winner':'360-379',
     'daily': [47, 47, 85, 57, 64, 51, 31]},
    # 2026-03-20 → 2026-03-27, 总301条
    {'name':'2026-03-20', 'end_date':'2026-03-27', 'actual_winner':'260-279',
     'daily': [57, 64, 51, 31, 25, 36, 37]},
    # 2026-03-24 → 2026-03-31, 总226条
    {'name':'2026-03-24', 'end_date':'2026-03-31', 'actual_winner':'220-239',
     'daily': [25, 36, 37, 34, 29, 28, 37]},
    # 2026-03-27 → 2026-04-03, 总237条
    {'name':'2026-03-27', 'end_date':'2026-04-03', 'actual_winner':'260-279',
     'daily': [34, 29, 28, 37, 41, 51, 17]},
    # 2026-04-03 → 2026-04-10, 总279条
    {'name':'2026-04-03', 'end_date':'2026-04-10', 'actual_winner':'240-259',
     'daily': [82, 18, 29, 36, 41, 31, 42]},
    # 2026-04-07 → 2026-04-14, 总324条
    {'name':'2026-04-07', 'end_date':'2026-04-14', 'actual_winner':'280-299',
     'daily': [41, 31, 42, 45, 28, 91, 46]},
    # 2026-04-10 → 2026-04-17, 总303条
    {'name':'2026-04-10', 'end_date':'2026-04-17', 'actual_winner':'300-319',
     'daily': [45, 28, 91, 46, 10, 47, 36]},
    # 2026-04-14 → 2026-04-21, 总216条
    {'name':'2026-04-14', 'end_date':'2026-04-21', 'actual_winner':'220-239',
     'daily': [10, 47, 36, 40, 37, 13, 33]},
    # 2026-04-17 → 2026-04-24, 总208条
    {'name':'2026-04-17', 'end_date':'2026-04-24', 'actual_winner':'200-219',
     'daily': [40, 37, 13, 33, 19, 43, 23]},
    # 2026-04-24 → 2026-05-01, 总192条
    {'name':'2026-04-24', 'end_date':'2026-05-01', 'actual_winner':'180-199',
     'daily': [34, 52, 22, 42, 10, 16, 16]},
    # 2026-04-28 → 2026-05-05, 总152条
    {'name':'2026-04-28', 'end_date':'2026-05-05', 'actual_winner':'140-159',
     'daily': [10, 16, 16, 28, 17, 40, 25]},
    # 2026-05-01 → 2026-05-08, 总170条
    {'name':'2026-05-01', 'end_date':'2026-05-08', 'actual_winner':'160-179',
     'daily': [28, 17, 40, 25, 15, 20, 25]},
    # 2026-05-05 → 2026-05-12, 总122条
    {'name':'2026-05-05', 'end_date':'2026-05-12', 'actual_winner':'100-119',
     'daily': [15, 20, 25, 17, 22, 14, 9]},
    # 2026-05-08 → 2026-05-15, 总135条
    {'name':'2026-05-08', 'end_date':'2026-05-15', 'actual_winner':'140-159',
     'daily': [17, 22, 14, 9, 23, 21, 29]},
    # 2026-05-12 → 2026-05-19, 总227条
    {'name':'2026-05-12', 'end_date':'2026-05-19', 'actual_winner':'220-239',
     'daily': [23, 21, 29, 34, 36, 21, 63]},
    # 2026-05-15 → 2026-05-22, 总280条
    {'name':'2026-05-15', 'end_date':'2026-05-22', 'actual_winner':'280-299',
     'daily': [34, 36, 21, 63, 21, 48, 57]},
    # 2026-05-19 → 2026-05-26, 总263条
    {'name':'2026-05-19', 'end_date':'2026-05-26', 'actual_winner':'260-279',
     'daily': [21, 48, 57, 55, 22, 30, 30]},
]


# ──────────────────────────────────────────────────────────────────────
# 回测执行
# ──────────────────────────────────────────────────────────────────────
def backtest_period(period: dict) -> list:
    """对一期数据做t-3/t-2/t-1三个时间点的回测"""
    if not period['daily']:
        return []

    daily = period['daily']
    actual = period['actual_winner']
    results = []

    for days_elapsed in [4, 5, 6]:
        days_remaining = 7 - days_elapsed
        cumulative = sum(daily[:days_elapsed])
        snapshot_label = f't-{days_remaining}'

        pred = predict_mu(cumulative, days_elapsed, days_remaining, use_adaptive=True)
        pred_simple = predict_mu(cumulative, days_elapsed, days_remaining, use_adaptive=False)

        dist_adaptive = range_distance(pred['center_range_adaptive'], actual)
        dist_simple = range_distance(pred['center_range_simple'], actual)

        results.append({
            'period': period['name'],
            'snapshot': snapshot_label,
            'days_elapsed': days_elapsed,
            'days_remaining': days_remaining,
            'cumulative': cumulative,
            'current_pace': pred['current_pace'],
            'deviation_pct': pred['deviation_pct'],
            'pace_flag': pred['pace_flag'],
            'simple_mu': pred_simple['simple_mu'],
            'adaptive_mu': pred['adaptive_mu'],
            'predicted_simple': pred_simple['center_range_simple'],
            'predicted_adaptive': pred['center_range_adaptive'],
            'actual': actual,
            'hit_simple': dist_simple == 0,
            'hit_adaptive': dist_adaptive == 0,
            'near_simple': dist_simple <= 1,
            'near_adaptive': dist_adaptive <= 1,
            'dist_simple': dist_simple,
            'dist_adaptive': dist_adaptive,
        })

    return results


def run_backtest():
    print("=" * 70)
    print("  马斯克推文预测模型 · 落点准确度回测")
    print(f"  样本：{len(HISTORICAL_PERIODS)}期  2025-11-04 至 2026-05-26")
    print("=" * 70)

    all_results = []

    for period in HISTORICAL_PERIODS:
        results = backtest_period(period)
        all_results.extend(results)

        print(f"\n📅 {period['name']} → {period['end_date']}  实际落点: {period['actual_winner']}  总: {sum(period['daily'])}条")
        print(f"   {'时间点':<6} {'累积':>5} {'节奏':>8} {'偏差':>7} | {'简单µ':>7} {'预测':>10} {'结果':<5} | {'自适应µ':>8} {'预测':>10} {'结果'}")
        print(f"   {'─'*6} {'─'*5} {'─'*8} {'─'*7}─{'─'*7} {'─'*10} {'─'*5}─{'─'*8} {'─'*10} {'─'*5}")

        for r in results:
            hit_s = "✅命中" if r['hit_simple'] else (f"⚠️偏{r['dist_simple']}" if r['near_simple'] else f"❌偏{r['dist_simple']}档")
            hit_a = "✅命中" if r['hit_adaptive'] else (f"⚠️偏{r['dist_adaptive']}" if r['near_adaptive'] else f"❌偏{r['dist_adaptive']}档")
            print(f"   {r['snapshot']:<6} {r['cumulative']:>5} {r['current_pace']:>7.1f}条 {r['deviation_pct']:>+6.0f}% | "
                  f"{r['simple_mu']:>7.0f} {r['predicted_simple']:>10} {hit_s:<8}| "
                  f"{r['adaptive_mu']:>8.0f} {r['predicted_adaptive']:>10} {hit_a}")

    # ── 汇总统计 ─────────────────────────────────────────────
    print("\n" + "=" * 70)
    print("  汇总统计")
    print("=" * 70)

    if all_results:
        for snapshot in ['t-3', 't-2', 't-1']:
            subset = [r for r in all_results if r['snapshot'] == snapshot]
            if not subset:
                continue
            n = len(subset)
            hit_s = sum(r['hit_simple'] for r in subset)
            hit_a = sum(r['hit_adaptive'] for r in subset)
            near_s = sum(r['near_simple'] for r in subset)
            near_a = sum(r['near_adaptive'] for r in subset)
            print(f"\n  {snapshot} ({n}期):")
            print(f"    简单模型   命中: {hit_s}/{n} ({hit_s/n*100:.0f}%)  命中或偏1档: {near_s}/{n} ({near_s/n*100:.0f}%)")
            print(f"    自适应模型 命中: {hit_a}/{n} ({hit_a/n*100:.0f}%)  命中或偏1档: {near_a}/{n} ({near_a/n*100:.0f}%)")

        total = len(all_results)
        hit_s_total = sum(r['hit_simple'] for r in all_results)
        hit_a_total = sum(r['hit_adaptive'] for r in all_results)
        near_s_total = sum(r['near_simple'] for r in all_results)
        near_a_total = sum(r['near_adaptive'] for r in all_results)
        print(f"\n  整体（{total//3}期 × 3时间点 = {total}条记录）:")
        print(f"    简单模型   总命中率: {hit_s_total}/{total} ({hit_s_total/total*100:.0f}%)  ±1档: {near_s_total}/{total} ({near_s_total/total*100:.0f}%)")
        print(f"    自适应模型 总命中率: {hit_a_total}/{total} ({hit_a_total/total*100:.0f}%)  ±1档: {near_a_total}/{total} ({near_a_total/total*100:.0f}%)")

        # 最近13期单独统计（Apr-May 2026，最相关的近期数据）
        recent = [r for r in all_results if r['period'] >= '2026-04']
        if recent:
            print(f"\n  近13期（2026-04 至今，最相关）:")
            for snap in ['t-3','t-2','t-1']:
                sub = [r for r in recent if r['snapshot']==snap]
                n=len(sub); h_s=sum(r['hit_simple'] for r in sub); h_a=sum(r['hit_adaptive'] for r in sub)
                nr_s=sum(r['near_simple'] for r in sub); nr_a=sum(r['near_adaptive'] for r in sub)
                print(f"    {snap}: 简单 命中{h_s}/{n}({h_s/n*100:.0f}%) ±1档{nr_s}/{n}({nr_s/n*100:.0f}%) | 自适应 命中{h_a}/{n}({h_a/n*100:.0f}%) ±1档{nr_a}/{n}({nr_a/n*100:.0f}%)")

        target = 0.75
        best_exact = max(hit_s_total, hit_a_total) / total
        best_near = max(near_s_total, near_a_total) / total
        print(f"\n  目标准确率: {target*100:.0f}%（精确命中）")
        print(f"  当前最佳精确命中: {best_exact*100:.0f}%  {'✅达标' if best_exact >= target else '❌未达标'}")
        print(f"  当前最佳±1档准确率: {best_near*100:.0f}%  {'✅达标' if best_near >= target else '❌距目标'+(f'{(target-best_near)*100:.0f}%')}")
        print(f"\n  ⚠️  结论：精确命中75%在20条宽度分桶下不现实（见BACKTEST_RESULT.md）")
        print(f"       建议：以「±1档准确率≥75%」为可达目标，t-1时已接近70%")

    print("\n" + "=" * 70)


if __name__ == '__main__':
    run_backtest()
