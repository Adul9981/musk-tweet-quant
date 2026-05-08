import { useState, useMemo } from 'react';
import { Target, TrendingUp, TrendingDown, Clock, Shield, Edit3 } from 'lucide-react';
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

const PHASE_INFO: Record<Phase, { label: string; color: string; bg: string; border: string; desc: string }> = {
  watch:      { label: '观望期',         color: 'text-slate-400',   bg: 'bg-slate-800/60',    border: 'border-slate-700/40', desc: '距到期超2.5天，不确定性较大，暂不建议入场' },
  entry1:     { label: '第一次建仓',     color: 'text-sky-400',     bg: 'bg-sky-500/10',      border: 'border-sky-500/25',   desc: '分散布局中心+两翼，部署总资金约25%' },
  entry2:     { label: '第二次加仓',     color: 'text-emerald-400', bg: 'bg-emerald-500/10',  border: 'border-emerald-500/25', desc: '集中加仓中心区间，部署总资金约40%' },
  sell_wing1: { label: '翼仓第一批减仓', color: 'text-amber-400',   bg: 'bg-amber-500/10',    border: 'border-amber-500/25', desc: '翼仓各卖出40%，锁定部分利润' },
  sell_wing2: { label: '翼仓第二批减仓', color: 'text-orange-400',  bg: 'bg-orange-500/10',   border: 'border-orange-500/25', desc: '翼仓再卖50%，专注等待中心落点' },
  final:      { label: '最终持仓期',     color: 'text-rose-400',    bg: 'bg-rose-500/10',     border: 'border-rose-500/25',  desc: '翼仓清仓；中心若已涨到65%+可减仓止盈' },
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

  // Sort ranges, find center and wings
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

  // Phase
  const phase: Phase =
    remainingDays >= 2.5 ? 'watch' :
    remainingDays >= 2.0 ? 'entry1' :
    remainingDays >= 1.5 ? 'entry2' :
    remainingDays >= 1.0 ? 'sell_wing1' :
    remainingDays >= 0.5 ? 'sell_wing2' : 'final';

  const info = PHASE_INFO[phase];

  // ── Buy recommendations ───────────────────────────────────────────────────
  const buyRecs = useMemo(() => {
    type BuyRec = { range: string; price: number; amount: number; shares: number; reason: string; tag: string; tagColor: string };
    const recs: BuyRec[] = [];
    const add = (r: RangeItem, amount: number, reason: string, tag: string, tagColor: string) => {
      recs.push({ range: r.range, price: r.price, amount, shares: Math.round(amount / (r.price / 100)), reason, tag, tagColor });
    };

    if (phase === 'entry1' && center) {
      const budget = Math.round(capital * 0.25);
      add(center,    Math.round(budget * 0.60), '中心主仓，第一次建仓60%', '主仓', 'bg-sky-500/20 text-sky-300');
      if (upperWing) add(upperWing, Math.round(budget * 0.28), '上翼保险仓', '上翼', 'bg-slate-700 text-slate-400');
      if (lowerWing) add(lowerWing, Math.round(budget * 0.12), '下翼保险仓（少量）', '下翼', 'bg-slate-700 text-slate-400');
    }

    if (phase === 'entry2' && center) {
      const budget = Math.round(capital * 0.40);
      add(center, Math.round(budget * 0.90), '集中加仓中心区间（主力仓位）', '加仓', 'bg-emerald-500/20 text-emerald-300');
      // Leave 10% for cheap insurance
    }

    // Cheap insurance signal — any active phase when a wing is deeply discounted
    if (phase !== 'watch' && phase !== 'final') {
      [upperWing, lowerWing].filter(Boolean).forEach(wing => {
        if (!wing) return;
        if (wing.price < wing.realProb * 0.60 && wing.price < 9) {
          if (!recs.find(r => r.range === wing.range)) {
            add(wing, Math.round(capital * 0.02),
              `市价 ${wing.price.toFixed(1)}% 远低于模型 ${wing.realProb.toFixed(1)}%，低价保险`,
              '低价险', 'bg-violet-500/20 text-violet-300');
          }
        }
      });
    }
    return recs;
  }, [phase, center, upperWing, lowerWing, capital]);

  // ── Sell recommendations ──────────────────────────────────────────────────
  const sellRecs = useMemo(() => {
    type SellRec = { range: string; currentPrice: number; entryPrice?: number; pct: number; est?: number; reason: string; tag: string; tagColor: string };
    const recs: SellRec[] = [];

    const pos = (range?: string | null) => range ? positions.find(p => p.range === range) : undefined;
    const est = (p: Position | undefined, currentPrice: number, pct: number) =>
      p ? Math.round(p.shares * (currentPrice / 100) * (pct / 100)) : undefined;

    // Wing sell — time-based
    const addWingSell = (wing: RangeItem | null | undefined, pct: number, reason: string, tag: string, tagColor: string) => {
      if (!wing) return;
      const p = pos(wing.range);
      recs.push({ range: wing.range, currentPrice: wing.price, entryPrice: p?.entryPrice, pct, est: est(p, wing.price, pct), reason, tag, tagColor });
    };

    if (phase === 'sell_wing1') {
      addWingSell(upperWing, 40, '距到期1.5天，第一批减仓', '减40%', 'bg-amber-500/20 text-amber-300');
      addWingSell(lowerWing, 40, '距到期1.5天，第一批减仓', '减40%', 'bg-amber-500/20 text-amber-300');
    }
    if (phase === 'sell_wing2') {
      addWingSell(upperWing, 50, '距到期1天，第二批减仓', '再减50%', 'bg-orange-500/20 text-orange-300');
      addWingSell(lowerWing, 50, '距到期1天，第二批减仓', '再减50%', 'bg-orange-500/20 text-orange-300');
    }
    if (phase === 'final') {
      addWingSell(upperWing, 100, '到期前12小时，清仓翼仓', '清仓', 'bg-rose-500/20 text-rose-300');
      addWingSell(lowerWing, 100, '到期前12小时，清仓翼仓', '清仓', 'bg-rose-500/20 text-rose-300');
    }

    // Center take-profit — price triggered
    if (center && remainingDays < 1.5) {
      const cp = pos(center.range);
      if (center.price >= 75) {
        recs.push({
          range: center.range, currentPrice: center.price, entryPrice: cp?.entryPrice,
          pct: 30, est: est(cp, center.price, 30),
          reason: `中心区间涨至 ${center.price.toFixed(0)}%，已进入高价止盈区，减30%锁利`,
          tag: '止盈30%', tagColor: 'bg-emerald-500/20 text-emerald-300',
        });
      } else if (center.price >= 65) {
        recs.push({
          range: center.range, currentPrice: center.price, entryPrice: cp?.entryPrice,
          pct: 20, est: est(cp, center.price, 20),
          reason: `中心区间涨至 ${center.price.toFixed(0)}%，可轻度止盈20%`,
          tag: '止盈20%', tagColor: 'bg-teal-500/20 text-teal-300',
        });
      }
    }

    return recs;
  }, [phase, center, upperWing, lowerWing, positions, remainingDays]);

  if (!center) {
    return (
      <div className="bg-[#162538] rounded-2xl p-6 border border-slate-800/80 text-center py-10">
        <Target className="w-8 h-8 mx-auto mb-3 text-slate-600 opacity-40" />
        <p className="text-slate-500 text-sm">等待市场数据加载...</p>
      </div>
    );
  }

  const totalBuy = buyRecs.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="bg-[#162538] rounded-2xl p-6 border border-slate-800/80 space-y-5">

      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-200 flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/25 flex items-center justify-center">
              <Target className="w-4 h-4 text-sky-400" />
            </div>
            实时操作建议
          </h2>
          <p className="text-xs text-slate-500 mt-1 pl-10">买入 · 卖出 · 止盈 · 保险加仓 — 全自动计算</p>
        </div>
        {/* Capital setting */}
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
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition-colors"
          >
            <span className="font-mono font-medium">总资金 ${capital.toLocaleString()}</span>
            <Edit3 className="w-3 h-3 text-slate-500" />
          </button>
        )}
      </div>

      {/* ── Phase + prediction ── */}
      <div className={`rounded-xl p-4 ${info.bg} border ${info.border} flex items-center gap-4`}>
        <Clock className="w-5 h-5 text-slate-400 shrink-0" />
        <div className="flex-1">
          <p className={`text-base font-bold ${info.color}`}>{info.label}</p>
          <p className="text-xs text-slate-500 mt-0.5">{info.desc}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[11px] text-slate-500 mb-0.5">预测落点</p>
          <p className="text-xl font-bold text-sky-400 font-mono">~{Math.round(mu)} 条</p>
          <p className="text-[11px] text-slate-500 font-mono">{center.range} @ {center.price.toFixed(1)}%</p>
        </div>
      </div>

      {/* ── Buy recommendations ── */}
      {buyRecs.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">建议买入</h3>
            <span className="ml-auto text-sm font-bold text-emerald-400 font-mono">${totalBuy.toLocaleString()} 合计</span>
          </div>
          <div className="space-y-2">
            {buyRecs.map((rec, i) => (
              <div key={i} className={`rounded-xl p-3.5 border flex items-center justify-between ${
                rec.tag === '主仓' || rec.tag === '加仓' ? 'bg-sky-500/10 border-sky-500/20' :
                rec.tag === '低价险' ? 'bg-violet-500/10 border-violet-500/20' :
                'bg-slate-800/50 border-slate-700/40'
              }`}>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono font-bold text-slate-100">{rec.range}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${rec.tagColor}`}>{rec.tag}</span>
                  </div>
                  <p className="text-xs text-slate-500">{rec.reason}</p>
                  <p className="text-[11px] text-slate-600 font-mono mt-0.5">当前价 {rec.price.toFixed(1)}% · 买入后持 {rec.shares} 份</p>
                </div>
                <div className="text-right shrink-0 ml-4">
                  <p className="text-lg font-bold text-emerald-400 font-mono">${rec.amount}</p>
                  <p className="text-[11px] text-slate-500">中奖可得 ${rec.shares}</p>
                </div>
              </div>
            ))}
          </div>
          {phase === 'entry1' && (
            <p className="text-[11px] text-slate-600 mt-2 px-1">
              剩余 ${(capital - totalBuy).toLocaleString()} 留作第二次加仓 + 机动资金，不要现在全部投入。
            </p>
          )}
        </div>
      )}

      {/* ── Sell / Take-profit recommendations ── */}
      {sellRecs.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <TrendingDown className="w-3.5 h-3.5 text-amber-400" />
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">建议减仓 / 止盈</h3>
          </div>
          <div className="space-y-2">
            {sellRecs.map((rec, i) => {
              const pnlPct = rec.entryPrice ? ((rec.currentPrice - rec.entryPrice) / rec.entryPrice * 100) : null;
              const isProfit = pnlPct !== null && pnlPct > 0;
              return (
                <div key={i} className={`rounded-xl p-3.5 border flex items-center justify-between ${
                  rec.tag.includes('止盈') ? 'bg-emerald-500/10 border-emerald-500/20' :
                  rec.tag === '清仓' ? 'bg-rose-500/10 border-rose-500/20' :
                  'bg-amber-500/10 border-amber-500/20'
                }`}>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono font-bold text-slate-100">{rec.range}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${rec.tagColor}`}>{rec.tag}</span>
                      {pnlPct !== null && (
                        <span className={`text-[10px] font-mono ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isProfit ? '+' : ''}{pnlPct.toFixed(0)}% vs 入场
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">{rec.reason}</p>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    {rec.est !== undefined ? (
                      <>
                        <p className="text-lg font-bold text-amber-400 font-mono">≈${rec.est}</p>
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

      {phase === 'watch' && (
        <div className="p-4 bg-slate-800/40 rounded-xl border border-slate-700/40 text-center">
          <Shield className="w-6 h-6 mx-auto mb-2 text-slate-500 opacity-60" />
          <p className="text-sm text-slate-400 font-medium">暂时观望，等待入场窗口</p>
          <p className="text-xs text-slate-500 mt-1">距到期 2.5 天（{Math.round(remainingDays * 24)} 小时）后开始第一次建仓</p>
          <p className="text-xs text-slate-600 mt-1">建议在此期间观察马斯克发推速率是否平稳</p>
        </div>
      )}

      {/* ── Schedule ── */}
      <div className="p-4 bg-slate-800/40 rounded-xl border border-slate-700/40">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <Clock className="w-3 h-3" />操作时间表
        </h3>
        <div className="space-y-2.5">
          {[
            { label: '距到期 2–2.5天',  action: `第一次建仓  中心 $${Math.round(capital*0.15)}  上翼 $${Math.round(capital*0.07)}  下翼 $${Math.round(capital*0.03)}`, active: phase === 'entry1' },
            { label: '距到期 1.5–2天',  action: `第二次加仓  中心 $${Math.round(capital*0.36)}（主力仓位）`, active: phase === 'entry2' },
            { label: '1.5天晚上',        action: '翼仓各卖 40%', active: phase === 'sell_wing1' },
            { label: '1天晚上',          action: '翼仓再卖 50%', active: phase === 'sell_wing2' },
            { label: '到期前 12小时',    action: '翼仓清仓 · 中心>65%则减20-30%', active: phase === 'final' },
          ].map((step, i) => (
            <div key={i} className={`flex items-start gap-2.5 text-xs ${step.active ? '' : 'opacity-40'}`}>
              <div className={`w-2 h-2 rounded-full mt-0.5 shrink-0 ${step.active ? 'bg-sky-400' : 'bg-slate-600'}`} />
              <div className="flex-1 flex justify-between gap-4">
                <span className={`font-medium shrink-0 ${step.active ? 'text-sky-300' : 'text-slate-500'}`}>{step.label}</span>
                <span className={step.active ? 'text-slate-300' : 'text-slate-500'}>{step.action}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[11px] text-slate-600 text-center">建议基于模型预测，不构成投资建议 · 请结合实际流动性操作</p>
    </div>
  );
}
