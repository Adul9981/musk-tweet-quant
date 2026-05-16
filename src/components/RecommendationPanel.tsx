import { useState, useMemo } from 'react';
import { Target, TrendingUp, TrendingDown, Clock, Shield, Edit3, Zap, Star } from 'lucide-react';
import type { Position } from './PositionManager';

interface RangeItem {
  range: string;
  price: number;
  realProb: number;
  isCenter?: boolean;
  parsed: { min: number; max: number } | null;
}

interface Props {
  mu: number;
  remainingDays: number;
  analysisData: RangeItem[];
  positions: Position[];
}

const CAPITAL_KEY = 'rec_capital_v1';

type Phase = 'watch' | 'entry1' | 'entry2' | 'sell_wing1' | 'sell_wing2' | 'final';

const PHASE_INFO: Record<Phase, { label: string; color: string; bg: string; border: string; accent: string; desc: string }> = {
  watch:      { label: '观望期',              color: 'text-slate-300',   bg: 'bg-slate-800/70',       border: 'border-slate-700/50',   accent: 'from-slate-600 to-slate-500',    desc: '距到期超3天，不确定性高，暂不入场' },
  entry1:     { label: '第一次建仓 · 首开仓', color: 'text-sky-300',     bg: 'bg-sky-900/40',         border: 'border-sky-500/30',     accent: 'from-sky-500 to-blue-500',       desc: '倒数第三天上午（北京时间），分散布局中心+两翼，部署总资金约25%' },
  entry2:     { label: '第二次加仓 · 主力仓', color: 'text-emerald-300', bg: 'bg-emerald-900/40',     border: 'border-emerald-500/30', accent: 'from-emerald-500 to-teal-500',   desc: '距到期1.5–2.5天，落点更确定，集中加仓中心区间，部署总资金约40%' },
  sell_wing1: { label: '翼仓减仓 + 超额机会', color: 'text-amber-300',   bg: 'bg-amber-900/30',       border: 'border-amber-500/30',   accent: 'from-amber-500 to-orange-500',   desc: '距到期1–1.5天，开始减仓翼仓，同步寻找最佳盈亏比区间做超额收益' },
  sell_wing2: { label: '翼仓继续减仓',        color: 'text-orange-300',  bg: 'bg-orange-900/30',      border: 'border-orange-500/30',  accent: 'from-orange-500 to-red-500',     desc: '距到期0.5–1天，翼仓再减仓，专注等待中心落点结算' },
  final:      { label: '最终冲刺期',          color: 'text-rose-300',    bg: 'bg-rose-900/30',        border: 'border-rose-500/30',    accent: 'from-rose-500 to-pink-500',      desc: '到期前12小时，翼仓清仓；中心若已涨到65%+ 可减仓止盈' },
};

export function RecommendationPanel({ mu, remainingDays, analysisData, positions }: Props) {
  const [capital, setCapital] = useState<number>(() => {
    try { return parseInt(localStorage.getItem(CAPITAL_KEY) || '5000'); }
    catch { return 5000; }
  });
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState('');

  const saveCapital = () => {
    const v = parseInt(inputVal.replace(/,/g, ''));
    if (!isNaN(v) && v > 0) {
      setCapital(v);
      try { localStorage.setItem(CAPITAL_KEY, v.toString()); } catch { /* ignore */ }
    }
    setEditing(false);
  };

  const sortedRanges = useMemo(() =>
    [...analysisData]
      .filter(r => r.parsed && r.price >= 1)
      .sort((a, b) => (a.parsed?.min ?? 0) - (b.parsed?.min ?? 0)),
    [analysisData]
  );
  const centerIdx  = sortedRanges.findIndex(r => r.isCenter);
  const center     = centerIdx >= 0 ? sortedRanges[centerIdx] : null;
  const upperWing  = centerIdx >= 0 && centerIdx < sortedRanges.length - 1 ? sortedRanges[centerIdx + 1] : null;
  const lowerWing  = centerIdx > 0 ? sortedRanges[centerIdx - 1] : null;

  // ── Phase detection（修正：entry1 从2.5天开始，对应倒数第三天上午）
  const phase: Phase =
    remainingDays >= 3.0 ? 'watch' :
    remainingDays >= 2.5 ? 'entry1' :
    remainingDays >= 1.5 ? 'entry2' :
    remainingDays >= 1.0 ? 'sell_wing1' :
    remainingDays >= 0.5 ? 'sell_wing2' : 'final';

  const info = PHASE_INFO[phase];

  // ── 最佳盈亏比区间（超额收益机会）——price / realProb 最低 = 最便宜
  const bestValueRange = useMemo(() => {
    if (phase !== 'sell_wing1' && phase !== 'sell_wing2') return null;
    const candidates = sortedRanges.filter(r =>
      !r.isCenter && r.realProb >= 5 && r.price >= 3 && r.price <= 35
    );
    if (!candidates.length) return null;
    const ranked = candidates
      .map(r => ({ ...r, evRatio: r.realProb / r.price }))
      .sort((a, b) => b.evRatio - a.evRatio);
    const best = ranked[0];
    return best.evRatio >= 1.25 ? best : null; // 只有当价格 < 模型概率80%时才推荐
  }, [sortedRanges, phase]);

  // 中心仓位当前估值（用于计算超额下注金额）
  const centerPosition = positions.find(p => center && p.range === center.range);
  const centerCurrentValue = centerPosition && center && center.price > 0
    ? centerPosition.shares * (center.price / 100)
    : null;
  const valueBetAmount = centerCurrentValue
    ? Math.round(centerCurrentValue * 0.12)   // 中心当前估值的12%
    : Math.round(capital * 0.04);              // 回退：总资金的4%

  // ── Buy recommendations
  const buyRecs = useMemo(() => {
    type BuyRec = { range: string; price: number; amount: number; shares: number; reason: string; tag: string; tagColor: string; tagBg: string };
    const recs: BuyRec[] = [];
    const add = (r: RangeItem, amount: number, reason: string, tag: string, tagColor: string, tagBg: string) => {
      recs.push({ range: r.range, price: r.price, amount, shares: Math.round(amount / (r.price / 100)), reason, tag, tagColor, tagBg });
    };

    if (phase === 'entry1' && center) {
      const budget = Math.round(capital * 0.25);
      add(center,    Math.round(budget * 0.60), '中心主仓，首次建仓 60%', '主仓', 'text-sky-200', 'bg-sky-500/25');
      if (upperWing) add(upperWing, Math.round(budget * 0.28), '上翼保险仓', '上翼', 'text-slate-300', 'bg-slate-700/60');
      if (lowerWing) add(lowerWing, Math.round(budget * 0.12), '下翼少量保险', '下翼', 'text-slate-300', 'bg-slate-700/60');
    }

    if (phase === 'entry2' && center) {
      const budget = Math.round(capital * 0.40);
      add(center, Math.round(budget * 0.90), '落点更确定，集中加仓中心（主力仓位）', '主力加仓', 'text-emerald-200', 'bg-emerald-500/25');
    }

    // 低价保险机会
    if (phase !== 'watch' && phase !== 'final') {
      [upperWing, lowerWing].filter(Boolean).forEach(wing => {
        if (!wing) return;
        if (wing.price < wing.realProb * 0.60 && wing.price < 9) {
          if (!recs.find(r => r.range === wing.range)) {
            add(wing, Math.round(capital * 0.02),
              `价格 ${wing.price.toFixed(1)}% 远低于模型概率 ${wing.realProb.toFixed(1)}%，低价保险`,
              '低价险', 'text-violet-200', 'bg-violet-500/25');
          }
        }
      });
    }
    return recs;
  }, [phase, center, upperWing, lowerWing, capital]);

  // ── Sell recommendations
  const sellRecs = useMemo(() => {
    type SellRec = { range: string; currentPrice: number; entryPrice?: number; pct: number; est?: number; reason: string; tag: string; tagColor: string; tagBg: string };
    const recs: SellRec[] = [];

    const getPos = (range?: string | null) => range ? positions.find(p => p.range === range) : undefined;
    const est = (p: Position | undefined, currentPrice: number, pct: number) =>
      p ? Math.round(p.shares * (currentPrice / 100) * (pct / 100)) : undefined;

    const addWingSell = (wing: RangeItem | null | undefined, pct: number, reason: string, tag: string, tagColor: string, tagBg: string) => {
      if (!wing) return;
      const p = getPos(wing.range);
      recs.push({ range: wing.range, currentPrice: wing.price, entryPrice: p?.entryPrice, pct, est: est(p, wing.price, pct), reason, tag, tagColor, tagBg });
    };

    if (phase === 'sell_wing1') {
      addWingSell(upperWing, 40, '距到期1–1.5天，翼仓第一批减仓40%', '减40%', 'text-amber-200', 'bg-amber-500/25');
      addWingSell(lowerWing, 40, '距到期1–1.5天，翼仓第一批减仓40%', '减40%', 'text-amber-200', 'bg-amber-500/25');
    }
    if (phase === 'sell_wing2') {
      addWingSell(upperWing, 50, '距到期0.5–1天，翼仓再减50%', '再减50%', 'text-orange-200', 'bg-orange-500/25');
      addWingSell(lowerWing, 50, '距到期0.5–1天，翼仓再减50%', '再减50%', 'text-orange-200', 'bg-orange-500/25');
    }
    if (phase === 'final') {
      addWingSell(upperWing, 100, '到期前12小时，清仓翼仓', '清仓', 'text-rose-200', 'bg-rose-500/25');
      addWingSell(lowerWing, 100, '到期前12小时，清仓翼仓', '清仓', 'text-rose-200', 'bg-rose-500/25');
    }

    // 中心止盈
    if (center && remainingDays < 1.5) {
      const cp = getPos(center.range);
      if (center.price >= 75) {
        recs.push({
          range: center.range, currentPrice: center.price, entryPrice: cp?.entryPrice,
          pct: 30, est: est(cp, center.price, 30),
          reason: `中心涨至 ${center.price.toFixed(0)}%，高价止盈区，减30%锁定收益`,
          tag: '止盈30%', tagColor: 'text-emerald-200', tagBg: 'bg-emerald-500/25',
        });
      } else if (center.price >= 65) {
        recs.push({
          range: center.range, currentPrice: center.price, entryPrice: cp?.entryPrice,
          pct: 20, est: est(cp, center.price, 20),
          reason: `中心涨至 ${center.price.toFixed(0)}%，轻度止盈20%，主仓继续持有`,
          tag: '止盈20%', tagColor: 'text-teal-200', tagBg: 'bg-teal-500/25',
        });
      }
    }

    return recs;
  }, [phase, center, upperWing, lowerWing, positions, remainingDays]);

  if (!center) {
    return (
      <div className="rounded-2xl p-6 border border-slate-700/50 bg-gradient-to-br from-slate-900 to-[#162538] text-center py-12">
        <Target className="w-8 h-8 mx-auto mb-3 text-slate-600 opacity-40" />
        <p className="text-slate-500 text-sm">等待市场数据加载...</p>
      </div>
    );
  }

  const totalBuy = buyRecs.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-900 via-[#162538] to-[#0f1a28] overflow-hidden shadow-xl">
      {/* 顶部渐变色条 */}
      <div className={`h-1 bg-gradient-to-r ${info.accent}`} />

      <div className="p-6 space-y-5">
        {/* ── Header ── */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${info.accent} flex items-center justify-center shadow-lg`}>
                <Target className="w-4 h-4 text-white" />
              </div>
              实时操作建议
            </h2>
            <p className="text-xs text-slate-500 mt-1 pl-10">买入 · 卖出 · 止盈 · 超额机会 — 全自动计算</p>
          </div>
          {editing ? (
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 text-sm">$</span>
              <input
                type="number"
                value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                onBlur={saveCapital}
                onKeyDown={e => { if (e.key === 'Enter') saveCapital(); if (e.key === 'Escape') setEditing(false); }}
                className="w-28 px-2 py-1.5 bg-slate-800 border border-sky-500 rounded-lg text-slate-200 text-sm focus:outline-none font-mono"
                autoFocus
              />
            </div>
          ) : (
            <button
              onClick={() => { setEditing(true); setInputVal(capital.toString()); }}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-600 transition-colors"
            >
              <span className="font-mono font-medium">总资金 ${capital.toLocaleString()}</span>
              <Edit3 className="w-3 h-3 text-slate-500" />
            </button>
          )}
        </div>

        {/* ── Phase + prediction ── */}
        <div className={`rounded-xl p-4 ${info.bg} border ${info.border} flex items-center gap-4`}>
          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${info.accent} flex items-center justify-center shrink-0 shadow-lg`}>
            <Clock className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-base font-bold ${info.color}`}>{info.label}</p>
            <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{info.desc}</p>
          </div>
          <div className="text-right shrink-0 pl-4 border-l border-slate-700/50">
            <p className="text-[10px] text-slate-500 mb-0.5 uppercase tracking-wider">预测落点</p>
            <p className="text-2xl font-bold text-sky-300 font-mono">~{Math.round(mu)}</p>
            <p className="text-[11px] text-slate-500 font-mono">{center.range}  {center.price.toFixed(1)}%</p>
          </div>
        </div>

        {/* ── Buy recommendations ── */}
        {buyRecs.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">建议买入</h3>
              <span className="ml-auto text-sm font-bold text-emerald-400 font-mono">${totalBuy.toLocaleString()}</span>
            </div>
            <div className="space-y-2">
              {buyRecs.map((rec, i) => (
                <div key={i} className={`rounded-xl p-3.5 border flex items-center justify-between ${
                  rec.tag === '主仓' || rec.tag === '主力加仓' ? 'bg-sky-950/60 border-sky-500/25' :
                  rec.tag === '低价险' ? 'bg-violet-950/60 border-violet-500/25' :
                  'bg-slate-800/60 border-slate-700/40'
                }`}>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono font-bold text-white text-sm">{rec.range}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${rec.tagColor} ${rec.tagBg}`}>{rec.tag}</span>
                    </div>
                    <p className="text-xs text-slate-400">{rec.reason}</p>
                    <p className="text-[11px] text-slate-500 font-mono mt-0.5">现价 {rec.price.toFixed(1)}% · 买入后持 {rec.shares.toLocaleString()} 份</p>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <p className="text-xl font-bold text-emerald-400 font-mono">${rec.amount.toLocaleString()}</p>
                    <p className="text-[11px] text-slate-500">中奖 → ${rec.shares.toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
            {phase === 'entry1' && (
              <p className="text-[11px] text-slate-500 mt-2 px-1 flex items-center gap-1">
                <span className="text-amber-500">●</span>
                剩余 ${(capital - totalBuy).toLocaleString()} 留作第二次加仓 + 超额机会，本轮不要全部投入
              </p>
            )}
          </div>
        )}

        {/* ── Sell / Take-profit recommendations ── */}
        {sellRecs.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <TrendingDown className="w-3.5 h-3.5 text-amber-400" />
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">建议减仓 / 止盈</h3>
            </div>
            <div className="space-y-2">
              {sellRecs.map((rec, i) => {
                const pnlPct = rec.entryPrice ? ((rec.currentPrice - rec.entryPrice) / rec.entryPrice * 100) : null;
                const isProfit = pnlPct !== null && pnlPct > 0;
                return (
                  <div key={i} className={`rounded-xl p-3.5 border flex items-center justify-between ${
                    rec.tag.includes('止盈') ? 'bg-emerald-950/60 border-emerald-500/25' :
                    rec.tag === '清仓' ? 'bg-rose-950/60 border-rose-500/25' :
                    'bg-amber-950/50 border-amber-500/25'
                  }`}>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono font-bold text-white text-sm">{rec.range}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${rec.tagColor} ${rec.tagBg}`}>{rec.tag}</span>
                        {pnlPct !== null && (
                          <span className={`text-[10px] font-mono font-semibold ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isProfit ? '+' : ''}{pnlPct.toFixed(0)}% vs 入场
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400">{rec.reason}</p>
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      {rec.est !== undefined ? (
                        <>
                          <p className="text-xl font-bold text-amber-400 font-mono">≈${rec.est.toLocaleString()}</p>
                          <p className="text-[11px] text-slate-500">按市价估算</p>
                        </>
                      ) : (
                        <p className="text-xs text-slate-500 italic">记录持仓后<br/>显示金额</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── 超额收益机会（1–1.5天专属）── */}
        {bestValueRange && (
          <div className="rounded-xl border border-yellow-500/30 bg-gradient-to-br from-yellow-950/50 to-amber-950/30 overflow-hidden">
            <div className="h-0.5 bg-gradient-to-r from-yellow-500 to-amber-400" />
            <div className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Star className="w-4 h-4 text-yellow-400" />
                <h3 className="text-xs font-bold text-yellow-300 uppercase tracking-wider">超额收益机会</h3>
                <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300 font-bold">EV+</span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="text-sm font-bold text-white font-mono mb-1">{bestValueRange.range}</p>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    市价 <span className="text-yellow-300 font-bold">{bestValueRange.price.toFixed(1)}%</span>，
                    模型概率 <span className="text-sky-300 font-bold">{bestValueRange.realProb.toFixed(1)}%</span>，
                    价格仅为模型的 <span className="text-yellow-300 font-bold">{(bestValueRange.price / bestValueRange.realProb * 100).toFixed(0)}%</span>
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                    策略：用中心仓位的稳定收益覆盖风险，小仓位博弈该区间的超额赔率。
                    建议用 <span className="text-yellow-300">{centerCurrentValue ? '中心当前估值12%' : '总资金4%'}</span> 买入。
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-2xl font-bold text-yellow-400 font-mono">${valueBetAmount}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">建议下注</p>
                  <p className="text-[11px] text-amber-400 font-mono font-semibold mt-0.5">
                    中奖 → ${Math.round(valueBetAmount / (bestValueRange.price / 100)).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-3 text-[11px]">
                <div className="flex-1 p-2 bg-slate-800/60 rounded-lg text-center">
                  <p className="text-slate-500">盈亏比</p>
                  <p className="text-yellow-300 font-bold font-mono">{(100 / bestValueRange.price).toFixed(1)}x</p>
                </div>
                <div className="flex-1 p-2 bg-slate-800/60 rounded-lg text-center">
                  <p className="text-slate-500">EV 指数</p>
                  <p className="text-emerald-400 font-bold font-mono">{bestValueRange.evRatio.toFixed(2)}</p>
                </div>
                <div className="flex-1 p-2 bg-slate-800/60 rounded-lg text-center">
                  <p className="text-slate-500">模型胜率</p>
                  <p className="text-sky-300 font-bold font-mono">{bestValueRange.realProb.toFixed(1)}%</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── 观望期提示 ── */}
        {phase === 'watch' && (
          <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50 text-center">
            <Shield className="w-6 h-6 mx-auto mb-2 text-slate-500 opacity-60" />
            <p className="text-sm text-slate-300 font-semibold">当前处于观望期</p>
            <p className="text-xs text-slate-500 mt-1">
              还剩 <span className="text-sky-400 font-bold">{Math.round(remainingDays * 24)} 小时</span>，
              距到期约 <span className="text-sky-400 font-bold">3天</span> 时（倒数第三天上午）开始第一次建仓
            </p>
            <p className="text-xs text-slate-600 mt-1">此期间观察发推速率是否稳定，确认预测落点方向</p>
          </div>
        )}

        {/* ── 操作时间表 ── */}
        <div className="p-4 bg-slate-800/40 rounded-xl border border-slate-700/40">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
            <Zap className="w-3 h-3 text-sky-400" />操作时间表（以北京时间24:00到期为基准）
          </h3>
          <div className="space-y-3">
            {[
              {
                label: '倒数第三天上午',
                sublabel: '距到期 2.5–3天',
                action: `第一次建仓  中心 $${Math.round(capital*0.15).toLocaleString()}  上翼 $${Math.round(capital*0.07).toLocaleString()}  下翼 $${Math.round(capital*0.03).toLocaleString()}`,
                active: phase === 'entry1',
                color: 'from-sky-500 to-blue-500',
              },
              {
                label: '倒数第二天',
                sublabel: '距到期 1.5–2.5天',
                action: `第二次加仓  中心主力 $${Math.round(capital*0.36).toLocaleString()}（落点已更明确）`,
                active: phase === 'entry2',
                color: 'from-emerald-500 to-teal-500',
              },
              {
                label: '最后一天上午',
                sublabel: '距到期 1–1.5天',
                action: '翼仓各减40%  +  评估超额收益机会',
                active: phase === 'sell_wing1',
                color: 'from-amber-500 to-orange-400',
              },
              {
                label: '最后一天晚上',
                sublabel: '距到期 0.5–1天',
                action: '翼仓再减50%，专注等待中心落点结算',
                active: phase === 'sell_wing2',
                color: 'from-orange-500 to-red-500',
              },
              {
                label: '到期前12小时',
                sublabel: '最终阶段',
                action: '翼仓清仓  ·  中心 >65% 则止盈20–30%',
                active: phase === 'final',
                color: 'from-rose-500 to-pink-500',
              },
            ].map((step, i) => (
              <div key={i} className={`flex items-start gap-3 transition-opacity ${step.active ? 'opacity-100' : 'opacity-35'}`}>
                <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${step.active ? `bg-gradient-to-br ${step.color} shadow-lg` : 'bg-slate-600'}`} />
                <div className="flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className={`text-xs font-bold ${step.active ? 'text-white' : 'text-slate-500'}`}>{step.label}</span>
                    <span className="text-[10px] text-slate-600">{step.sublabel}</span>
                  </div>
                  <span className={`text-xs ${step.active ? 'text-slate-300' : 'text-slate-600'}`}>{step.action}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-[11px] text-slate-600 text-center">建议基于模型预测，不构成投资建议 · 请结合实际流动性操作</p>
      </div>
    </div>
  );
}
