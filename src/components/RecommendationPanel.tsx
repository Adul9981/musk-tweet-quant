import { useState, useMemo } from 'react';
import { Target, TrendingUp, TrendingDown, Clock, Shield, Edit3, Zap, Star, AlertTriangle, Flame, Moon, Minus } from 'lucide-react';
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
  currentTweetCount?: number;   // 当前推文总数
  bjHour?: number;              // 北京时间小时（0-23）
}

// ── 活跃时段定义（来自知识库 03_马斯克行为规律.md）──────────────────────────
type SessionLevel = 'peak' | 'active' | 'low' | 'dead';
interface SessionDef {
  label: string;
  level: SessionLevel;
  hours: number[];
  desc: string;
  action: string;
  color: string;
  bg: string;
  border: string;
}

const SESSIONS: SessionDef[] = [
  {
    label: '🔥 深夜爆发期',
    level: 'peak',
    hours: [12, 13, 14, 15],
    desc: '全天最高峰，日均 3.0–3.4条/h，BJ 12→13跳跃+150%',
    action: '最佳止盈评估窗口 / 期末NO埋伏出场窗口',
    color: 'text-orange-300',
    bg: 'bg-orange-950/40',
    border: 'border-orange-500/40',
  },
  {
    label: '⚡ 美国上午活跃期',
    level: 'active',
    hours: [20, 21, 22, 23, 0, 1, 2, 3],
    desc: '美国上午/下午，中等活跃，0.8–1.8条/h',
    action: '可建仓 / 补仓 / 评估期末NO机会',
    color: 'text-emerald-300',
    bg: 'bg-emerald-950/30',
    border: 'border-emerald-500/30',
  },
  {
    label: '💤 入睡低谷期',
    level: 'dead',
    hours: [16, 17, 18, 19],
    desc: 'Musk入睡，全天最低 0.2–0.4条/h，BJ 17:30为死区',
    action: '⚠️ 强制剪仓评估（死区）/ 不追买',
    color: 'text-slate-400',
    bg: 'bg-slate-800/50',
    border: 'border-slate-600/40',
  },
  {
    label: '📉 美国傍晚低谷',
    level: 'low',
    hours: [4, 5, 6, 7, 8, 9, 10, 11],
    desc: '美国傍晚/晚上，偏低 0.4–0.8条/h',
    action: '等待 / 低价建仓窗口（价格往往在此最低）',
    color: 'text-teal-300',
    bg: 'bg-teal-950/20',
    border: 'border-teal-500/20',
  },
];

const CAPITAL_KEY = 'rec_capital_v1';

// ── Phase 定义（对齐知识库 05_入场与仓位框架.md）──────────────────────────
// 铁律：到期前 2–2.5 天是最佳入场窗口
type Phase = 'watch' | 'entry' | 'hold' | 'trim1' | 'trim2' | 'final';

const PHASE_INFO: Record<Phase, {
  label: string; color: string; bg: string; border: string; accent: string; desc: string;
}> = {
  watch: {
    label: '观望期',
    color: 'text-slate-300',
    bg: 'bg-slate-800/70',
    border: 'border-slate-700/50',
    accent: 'from-slate-600 to-slate-500',
    desc: '距到期 > 2.5天，µ不确定性高（±35条），暂不入场',
  },
  entry: {
    label: '⭐ 最佳入场窗口',
    color: 'text-emerald-300',
    bg: 'bg-emerald-950/40',
    border: 'border-emerald-500/30',
    accent: 'from-emerald-500 to-emerald-500',
    desc: '距到期 2–2.5天，铁律入场时机 — 主仓(50-70%) + 保护仓(20-30%下方1档) + 可选高赔率仓(≤10%)',
  },
  hold: {
    label: '持有观察期',
    color: 'text-emerald-300',
    bg: 'bg-emerald-900/30',
    border: 'border-emerald-500/20',
    accent: 'from-emerald-600 to-teal-600',
    desc: '距到期 1.5–2天，监控µ偏移，偏移 > 1.5σ（约25条）才考虑调仓，否则持有',
  },
  trim1: {
    label: '翼仓减仓 + 超额机会',
    color: 'text-amber-300',
    bg: 'bg-amber-900/30',
    border: 'border-amber-500/30',
    accent: 'from-amber-500 to-orange-500',
    desc: '距到期 1–1.5天，BJ 17:30死区评估是否剪仓，同步寻找高赔率超额机会',
  },
  trim2: {
    label: '翼仓继续减仓',
    color: 'text-orange-300',
    bg: 'bg-orange-900/30',
    border: 'border-orange-500/30',
    accent: 'from-orange-500 to-red-500',
    desc: '距到期 0.5–1天，继续减仓低概率区间，专注等待中心落点结算',
  },
  final: {
    label: '最终冲刺期',
    color: 'text-rose-300',
    bg: 'bg-rose-900/30',
    border: 'border-rose-500/30',
    accent: 'from-rose-500 to-pink-500',
    desc: '到期前12小时，中心 ≥ 75¢ 可减50%锁利；中心 < 75¢ 且模型概率 > 85% 仍可加仓',
  },
};

export function RecommendationPanel({ mu, remainingDays, analysisData, positions, currentTweetCount, bjHour }: Props) {
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

  // ── 当前时段 ──────────────────────────────────────────────────────────────
  const currentSession = useMemo(() => {
    if (bjHour === undefined) return null;
    return SESSIONS.find(s => s.hours.includes(bjHour)) ?? SESSIONS[3];
  }, [bjHour]);

  // ── 价值比（VR）计算 ──────────────────────────────────────────────────────
  // VR = 模型概率 / 市场价格。VR ≥ 1.0 值得入场，VR ≥ 1.2 理想，VR ≥ 2.5 可做高赔率仓
  const sortedRanges = useMemo(() =>
    [...analysisData]
      .filter(r => r.parsed && r.price >= 1)
      .sort((a, b) => (a.parsed?.min ?? 0) - (b.parsed?.min ?? 0))
      .map(r => ({ ...r, vr: r.price > 0 ? r.realProb / r.price : 0 })),
    [analysisData]
  );

  const centerIdx  = sortedRanges.findIndex(r => r.isCenter);
  const center     = centerIdx >= 0 ? sortedRanges[centerIdx] : null;
  // 保护仓：中心下方1档（模型存在+0.3档系统性偏高，下侧风险更大）
  const protectRange = centerIdx > 0 ? sortedRanges[centerIdx - 1] : null;
  // 上方相邻（仅用于参考对比）
  const upperRange = centerIdx >= 0 && centerIdx < sortedRanges.length - 1
    ? sortedRanges[centerIdx + 1] : null;

  // ── 主仓选择：比较中心和两侧，选价值比最高的 ───────────────────────────────
  const mainRange = useMemo(() => {
    if (!center) return null;
    const candidates = [protectRange, center, upperRange].filter(Boolean) as typeof sortedRanges;
    return candidates.reduce((best, r) => r.vr > best.vr ? r : best, center);
  }, [center, protectRange, upperRange]);

  // 高赔率仓：VR ≥ 2.5，价格 ≤ 5¢，非中心区间
  const highOddsRange = useMemo(() => {
    if (!mainRange) return null;
    const candidates = sortedRanges.filter(r =>
      !r.isCenter && r.vr >= 2.5 && r.price <= 5 && r.price >= 1
    );
    if (!candidates.length) return null;
    return candidates.sort((a, b) => b.vr - a.vr)[0];
  }, [sortedRanges, mainRange]);

  // ── Phase 判断（对齐知识库，2–2.5天是核心入场窗口）───────────────────────
  const phase: Phase =
    remainingDays >= 2.5 ? 'watch' :
    remainingDays >= 2.0 ? 'entry' :
    remainingDays >= 1.5 ? 'hold' :
    remainingDays >= 1.0 ? 'trim1' :
    remainingDays >= 0.5 ? 'trim2' : 'final';

  const info = PHASE_INFO[phase];

  // ── 超额收益机会（trim1/trim2 专属）──────────────────────────────────────
  const extraRange = useMemo(() => {
    if (phase !== 'trim1' && phase !== 'trim2') return null;
    const candidates = sortedRanges.filter(r =>
      !r.isCenter && r.vr >= 1.5 && r.price >= 2 && r.price <= 15
    );
    if (!candidates.length) return null;
    const best = candidates.sort((a, b) => b.vr - a.vr)[0];
    return best;
  }, [sortedRanges, phase]);

  // ── 买入建议 ───────────────────────────────────────────────────────────────
  const buyRecs = useMemo(() => {
    type BuyRec = {
      range: string; price: number; vr: number; amount: number; shares: number;
      reason: string; tag: string; tagColor: string; tagBg: string; vrOk: boolean;
    };
    const recs: BuyRec[] = [];

    const add = (r: typeof sortedRanges[0], amount: number, reason: string, tag: string, tagColor: string, tagBg: string) => {
      recs.push({
        range: r.range, price: r.price, vr: r.vr,
        amount, shares: Math.round(amount / (r.price / 100)),
        reason, tag, tagColor, tagBg,
        vrOk: r.vr >= 1.0,
      });
    };

    if (phase === 'entry' && mainRange) {
      const mainAmt  = Math.round(capital * 0.55); // 主仓 ~55%
      const protAmt  = Math.round(capital * 0.25); // 保护仓 ~25%

      add(mainRange, mainAmt,
        `VR=${mainRange.vr.toFixed(2)} — 价值比最高区间，主仓 55%（铁律：主仓集中，不分散）`,
        '主仓', 'text-emerald-200', 'bg-emerald-500/25');

      if (protectRange && protectRange.range !== mainRange.range) {
        add(protectRange, protAmt,
          `VR=${protectRange.vr.toFixed(2)} — 中心下方1档，系统性偏高+0.3档，保护仓`,
          '保护仓', 'text-teal-200', 'bg-teal-500/25');
      }

      if (highOddsRange) {
        const highAmt = Math.round(capital * 0.08);
        add(highOddsRange, highAmt,
          `VR=${highOddsRange.vr.toFixed(2)} — 价格 ${highOddsRange.price.toFixed(1)}¢，高赔率仓（可选）`,
          '高赔率', 'text-yellow-200', 'bg-yellow-500/20');
      }
    }

    // 到期前<12小时 + 中心 < 75¢ + 模型概率 > 85% → 可加仓
    if (phase === 'final' && center && center.realProb > 85 && center.price < 75) {
      add(center, Math.round(capital * 0.10),
        `模型概率 ${center.realProb.toFixed(0)}%，市价仅 ${center.price.toFixed(0)}¢，最后窗口加仓`,
        '终盘加仓', 'text-rose-200', 'bg-rose-500/25');
    }

    return recs;
  }, [phase, mainRange, protectRange, highOddsRange, center, capital]);

  // ── 卖出建议 ───────────────────────────────────────────────────────────────
  const sellRecs = useMemo(() => {
    type SellRec = {
      range: string; currentPrice: number; entryPrice?: number;
      pct: number; est?: number; reason: string; tag: string; tagColor: string; tagBg: string;
    };
    const recs: SellRec[] = [];
    const getPos = (range?: string | null) => range ? positions.find(p => p.range === range) : undefined;
    const estAmt = (p: Position | undefined, price: number, pct: number) =>
      p ? Math.round(p.shares * (price / 100) * (pct / 100)) : undefined;

    // 翼仓减仓
    const addSell = (r: typeof sortedRanges[0] | null | undefined, pct: number, reason: string, tag: string, tc: string, tb: string) => {
      if (!r) return;
      const p = getPos(r.range);
      recs.push({ range: r.range, currentPrice: r.price, entryPrice: p?.entryPrice, pct, est: estAmt(p, r.price, pct), reason, tag, tagColor: tc, tagBg: tb });
    };

    if (phase === 'trim1') {
      // 只减上方翼仓（概率已走低的区间）
      if (upperRange && upperRange.range !== mainRange?.range) {
        addSell(upperRange, 40, 'BJ 17:30死区评估：上方翼仓第一批减40%', '减40%', 'text-amber-200', 'bg-amber-500/25');
      }
    }
    if (phase === 'trim2') {
      if (upperRange && upperRange.range !== mainRange?.range) {
        addSell(upperRange, 50, '翼仓再减50%，专注等待中心落点结算', '再减50%', 'text-orange-200', 'bg-orange-500/25');
      }
    }
    if (phase === 'final') {
      if (upperRange && upperRange.range !== mainRange?.range) {
        addSell(upperRange, 100, '到期前12小时，清仓低概率翼仓', '清仓', 'text-rose-200', 'bg-rose-500/25');
      }
    }

    // 中心止盈（到期前1.5天内）
    if (center && remainingDays < 1.5) {
      const cp = getPos(center.range);
      if (center.price >= 75) {
        recs.push({ range: center.range, currentPrice: center.price, entryPrice: cp?.entryPrice, pct: 50, est: estAmt(cp, center.price, 50), reason: `中心涨至 ${center.price.toFixed(0)}¢，减50%锁利；剩余50%博$1到期`, tag: '止盈50%', tagColor: 'text-emerald-200', tagBg: 'bg-emerald-500/25' });
      } else if (center.price >= 65) {
        recs.push({ range: center.range, currentPrice: center.price, entryPrice: cp?.entryPrice, pct: 20, est: estAmt(cp, center.price, 20), reason: `中心涨至 ${center.price.toFixed(0)}¢（BJ 14-15高峰评估），轻度止盈20%`, tag: '止盈20%', tagColor: 'text-teal-200', tagBg: 'bg-teal-500/25' });
      }
    }

    // 强制止损提示
    if (remainingDays < 2 && center) {
      const lowProbPos = positions.find(p => {
        const r = sortedRanges.find(s => s.range === p.range);
        return r && r.realProb < 15 && !r.isCenter;
      });
      if (lowProbPos) {
        const r = sortedRanges.find(s => s.range === lowProbPos.range);
        if (r) {
          recs.push({ range: r.range, currentPrice: r.price, entryPrice: lowProbPos.entryPrice, pct: 100, est: estAmt(lowProbPos, r.price, 100), reason: `模型概率 < 15%，铁律：死区内强制评估是否止损出场`, tag: '⚠️ 止损', tagColor: 'text-red-200', tagBg: 'bg-red-500/20' });
        }
      }
    }

    return recs;
  }, [phase, upperRange, mainRange, center, positions, sortedRanges, remainingDays]);

  // ── 期末 NO 埋伏策略 触发检测 ────────────────────────────────────────────
  // 条件：到期当天 + 推文在区间中段 + NO价格≤15¢ + 处于活跃窗口
  const noAmbushSignal = useMemo(() => {
    if (!currentTweetCount || !center?.parsed || remainingDays > 1) return null;
    const { min, max } = center.parsed;
    const distToTop = max - currentTweetCount;
    const isInRange = currentTweetCount >= min && currentTweetCount <= max;
    const isActiveWindow = currentSession?.level === 'peak' || currentSession?.level === 'active';

    // 找所有区间的NO价格（即 100 - YES价格，这里price是YES价格）
    // 实际上 NO价格 = 100 - YES价格（近似，不含手续费）
    const noPriceCents = center.price > 0 ? (100 - center.price) : null;
    const noIsLow = noPriceCents !== null && noPriceCents <= 20;

    if (!isInRange || distToTop < 5) return null; // 太接近上沿不算

    const conditions = [
      { ok: remainingDays <= 1,    label: '到期当天' },
      { ok: isInRange && distToTop >= 10, label: `推文在中段（距上沿${distToTop}条）` },
      { ok: noIsLow ?? false,      label: `NO价格低（≈${noPriceCents?.toFixed(0)}¢）` },
      { ok: isActiveWindow,        label: `处于活跃窗口（${currentSession?.label}）` },
    ];
    const hitCount = conditions.filter(c => c.ok).length;
    if (hitCount < 2) return null;

    return { conditions, hitCount, noPriceCents, distToTop };
  }, [currentTweetCount, center, remainingDays, currentSession]);

  // ── 出本留利提醒 ─────────────────────────────────────────────────────────
  const returnPrincipalAlerts = useMemo(() => {
    return positions.filter(pos => {
      const r = sortedRanges.find(s => s.range === pos.range);
      if (!r || !pos.entryPrice) return false;
      const pnlPct = (r.price - pos.entryPrice) / pos.entryPrice * 100;
      return pnlPct >= 100;
    }).map(pos => {
      const r = sortedRanges.find(s => s.range === pos.range)!;
      const pnlPct = ((r.price - pos.entryPrice!) / pos.entryPrice! * 100).toFixed(0);
      return { range: pos.range, price: r.price, entryPrice: pos.entryPrice!, pnlPct };
    });
  }, [positions, sortedRanges]);

  if (!center) {
    return (
      <div className="rounded-xl px-4 py-3 border border-slate-700/40 bg-slate-900/40 flex items-center gap-2">
        <Target className="w-4 h-4 text-slate-600 shrink-0" />
        <p className="text-slate-500 text-xs">推荐操作面板：等待市场区间数据...</p>
      </div>
    );
  }

  const mainVR = mainRange?.vr ?? 0;
  const totalBuy = buyRecs.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="rounded-2xl border border-slate-700/60 bg-gradient-to-br from-[#040a06] via-[#0a1a0d] to-[#040a06] overflow-hidden shadow-xl">
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
            <p className="text-xs text-slate-400 mt-1 pl-10">主仓 · 保护仓 · 高赔率仓 — 对齐知识库规则</p>
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
                className="w-28 px-2 py-1.5 bg-slate-800 border border-emerald-500 rounded-lg text-slate-200 text-sm focus:outline-none font-mono"
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

        {/* ── 出本留利提醒（最高优先级）── */}
        {returnPrincipalAlerts.length > 0 && returnPrincipalAlerts.map((a, i) => (
          <div key={i} className="rounded-xl border border-emerald-400/50 bg-emerald-950/50 p-4 flex items-start gap-3">
            <div className="text-xl shrink-0 animate-pulse">💰</div>
            <div className="flex-1">
              <p className="text-sm font-bold text-emerald-300">出本留利信号 · {a.range}</p>
              <p className="text-xs text-emerald-200/80 mt-0.5">
                入场 <span className="font-mono font-bold">{a.entryPrice.toFixed(1)}¢</span> → 现价 <span className="font-mono font-bold text-emerald-300">{a.price.toFixed(1)}¢</span>，已涨 <span className="font-mono font-bold text-emerald-300">+{a.pnlPct}%</span>
              </p>
              <p className="text-xs text-emerald-400 mt-1 font-semibold">→ 卖出本金部分，剩余利润仓零成本持有</p>
            </div>
          </div>
        ))}

        {/* ── 当前时段信号 ── */}
        {currentSession && (
          <div className={`rounded-xl border p-3.5 ${currentSession.bg} ${currentSession.border}`}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                {currentSession.level === 'peak' && <Flame className="w-4 h-4 text-orange-400" />}
                {currentSession.level === 'active' && <Zap className="w-4 h-4 text-emerald-400" />}
                {currentSession.level === 'dead' && <Moon className="w-4 h-4 text-slate-400" />}
                {currentSession.level === 'low' && <Minus className="w-4 h-4 text-teal-400" />}
                <span className={`text-xs font-bold ${currentSession.color}`}>{currentSession.label}</span>
              </div>
              <span className="text-xs text-slate-500 font-mono">BJ {bjHour?.toString().padStart(2,'0')}:xx</span>
            </div>
            <p className="text-xs text-slate-400 mb-1">{currentSession.desc}</p>
            <p className={`text-xs font-semibold ${currentSession.color}`}>→ {currentSession.action}</p>
          </div>
        )}

        {/* ── 期末 NO 埋伏策略触发 ── */}
        {noAmbushSignal && (
          <div className="rounded-xl border border-yellow-500/50 bg-yellow-950/40 overflow-hidden">
            <div className="h-0.5 bg-gradient-to-r from-yellow-500 to-orange-400" />
            <div className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Star className="w-4 h-4 text-yellow-400" />
                <span className="text-xs font-bold text-yellow-300 uppercase tracking-wider">
                  期末 NO 埋伏信号
                  <span className="ml-2 text-yellow-500 normal-case font-normal">（{noAmbushSignal.hitCount}/4 条件满足）</span>
                </span>
              </div>
              <div className="space-y-1.5 mb-3">
                {noAmbushSignal.conditions.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className={c.ok ? 'text-emerald-400' : 'text-slate-600'}>{c.ok ? '✅' : '○'}</span>
                    <span className={c.ok ? 'text-slate-300' : 'text-slate-600'}>{c.label}</span>
                  </div>
                ))}
              </div>
              <div className="bg-yellow-950/60 rounded-lg p-3 text-xs text-yellow-200/90 leading-relaxed">
                <p className="font-semibold mb-1">策略：买入当前区间 NO（≤20%仓位）</p>
                <p>→ 涨幅达 +100% 后出本金，利润仓持有至活跃窗口结束或速率归零</p>
                <p className="text-yellow-400/70 mt-1">⚠️ 风险：发推停滞则 NO 亏损，控制仓位</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Phase 状态 + 预测落点 ── */}
        <div className={`rounded-xl p-4 ${info.bg} border ${info.border} flex items-center gap-4`}>
          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${info.accent} flex items-center justify-center shrink-0 shadow-lg`}>
            <Clock className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-base font-bold ${info.color}`}>{info.label}</p>
            <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{info.desc}</p>
          </div>
          <div className="text-right shrink-0 pl-4 border-l border-slate-700/50">
            <p className="text-xs text-slate-300 mb-0.5 uppercase tracking-wider font-medium">预测落点 µ</p>
            <p className="text-2xl font-bold text-emerald-300 font-mono">~{Math.round(mu)}</p>
            <p className="text-xs text-slate-300 font-mono">{center.range}  {center.price.toFixed(1)}¢</p>
          </div>
        </div>

        {/* ── VR 入场条件检查（entry 期显示）── */}
        {phase === 'entry' && mainRange && (
          <div className={`rounded-xl p-3.5 border ${mainVR >= 1.2 ? 'border-emerald-500/40 bg-emerald-950/30' : mainVR >= 1.0 ? 'border-emerald-500/30 bg-emerald-950/20' : 'border-red-500/40 bg-red-950/20'}`}>
            <p className="text-xs font-bold text-slate-300 mb-2 uppercase tracking-wider">入场条件检查</p>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center gap-2">
                <span className={remainingDays <= 2.5 && remainingDays >= 2.0 ? 'text-emerald-400' : 'text-red-400'}>
                  {remainingDays <= 2.5 && remainingDays >= 2.0 ? '✅' : '❌'}
                </span>
                <span className="text-slate-300">距到期 2–2.5天（当前 {(remainingDays * 24).toFixed(0)}h）</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={mainVR >= 1.0 ? 'text-emerald-400' : 'text-red-400'}>{mainVR >= 1.0 ? '✅' : '❌'}</span>
                <span className="text-slate-300">
                  主仓 VR = <span className={`font-mono font-bold ${mainVR >= 1.2 ? 'text-emerald-400' : mainVR >= 1.0 ? 'text-emerald-400' : 'text-red-400'}`}>{mainVR.toFixed(2)}</span>
                  <span className="text-slate-500 ml-1">（≥1.0可入 / ≥1.2理想）</span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-amber-400">⚠️</span>
                <span className="text-slate-400">避开BJ 13-16活跃高峰（价格已被推高）</span>
              </div>
            </div>
            {!mainVR || mainVR < 1.0 ? (
              <p className="text-xs text-red-400 mt-2 font-semibold">
                ⛔ VR &lt; 1.0，市场价格偏高 — 等价格回落或改选相邻区间
              </p>
            ) : null}
          </div>
        )}

        {/* ── 买入建议 ── */}
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
                  rec.tag === '主仓' ? 'bg-emerald-950/60 border-emerald-500/25' :
                  rec.tag === '保护仓' ? 'bg-teal-950/60 border-teal-500/25' :
                  rec.tag === '高赔率' ? 'bg-yellow-950/50 border-yellow-500/20' :
                  rec.tag === '终盘加仓' ? 'bg-rose-950/60 border-rose-500/25' :
                  'bg-slate-800/60 border-slate-700/40'
                }`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-mono font-bold text-white text-sm">{rec.range}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${rec.tagColor} ${rec.tagBg}`}>{rec.tag}</span>
                      <span className={`text-xs font-mono font-semibold px-1.5 py-0.5 rounded ${rec.vrOk ? 'text-emerald-400 bg-emerald-950/60' : 'text-red-400 bg-red-950/60'}`}>
                        VR {rec.vr.toFixed(2)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">{rec.reason}</p>
                    <p className="text-xs text-slate-300 font-mono mt-0.5">现价 {rec.price.toFixed(1)}¢ · 买入后持 {rec.shares.toLocaleString()} 份</p>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <p className="text-xl font-bold text-emerald-400 font-mono">${rec.amount.toLocaleString()}</p>
                    <p className="text-xs text-slate-300">中奖 → ${rec.shares.toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
            {phase === 'entry' && (
              <p className="text-xs text-slate-400 mt-2 px-1 flex items-center gap-1">
                <span className="text-amber-400">●</span>
                剩余 ${(capital - totalBuy).toLocaleString()} 留作紧急加仓备用（µ偏移超1.5σ时使用）
              </p>
            )}
          </div>
        )}

        {/* ── 卖出 / 止盈建议 ── */}
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
                    rec.tag.includes('止损') ? 'bg-red-950/60 border-red-500/25' :
                    rec.tag === '清仓' ? 'bg-rose-950/60 border-rose-500/25' :
                    'bg-amber-950/50 border-amber-500/25'
                  }`}>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono font-bold text-white text-sm">{rec.range}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${rec.tagColor} ${rec.tagBg}`}>{rec.tag}</span>
                        {pnlPct !== null && (
                          <span className={`text-xs font-mono font-semibold ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isProfit ? '+' : ''}{pnlPct.toFixed(0)}% vs 入场
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">{rec.reason}</p>
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      {rec.est !== undefined ? (
                        <>
                          <p className="text-xl font-bold text-amber-400 font-mono">≈${rec.est.toLocaleString()}</p>
                          <p className="text-xs text-slate-300">按市价估算</p>
                        </>
                      ) : (
                        <p className="text-xs text-slate-400 italic">记录持仓后<br/>显示金额</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── 超额收益机会（trim 期）── */}
        {extraRange && (
          <div className="rounded-xl border border-yellow-500/30 bg-gradient-to-br from-yellow-950/50 to-amber-950/30 overflow-hidden">
            <div className="h-0.5 bg-gradient-to-r from-yellow-500 to-amber-400" />
            <div className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Star className="w-4 h-4 text-yellow-400" />
                <h3 className="text-xs font-bold text-yellow-300 uppercase tracking-wider">超额收益机会</h3>
                <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300 font-bold">EV+</span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="text-sm font-bold text-white font-mono mb-1">{extraRange.range}</p>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    市价 <span className="text-yellow-300 font-bold">{extraRange.price.toFixed(1)}¢</span>，
                    模型概率 <span className="text-emerald-300 font-bold">{extraRange.realProb.toFixed(1)}%</span>，
                    VR = <span className="text-yellow-300 font-bold">{extraRange.vr.toFixed(2)}</span>
                  </p>
                  <p className="text-xs text-slate-400 mt-1">用主仓利润的5-10%小仓位博超额赔率</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-slate-400">盈亏比</p>
                  <p className="text-2xl font-bold text-yellow-400 font-mono">{(100 / extraRange.price).toFixed(1)}x</p>
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
            <p className="text-xs text-slate-400 mt-1">
              距到期 <span className="text-emerald-400 font-bold">{(remainingDays * 24).toFixed(0)} 小时</span>，
              µ不确定性约 <span className="text-amber-400 font-bold">±35条</span>
            </p>
            <p className="text-xs text-slate-400 mt-1">到期前 <span className="text-emerald-400 font-bold">2–2.5天</span>（约 {Math.round(remainingDays * 24 - 60)} 小时后）开始入场</p>
          </div>
        )}

        {/* ── 持有期提示 ── */}
        {phase === 'hold' && (
          <div className="p-4 bg-emerald-950/20 rounded-xl border border-emerald-700/30">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-300 space-y-1">
                <p className="font-semibold text-slate-200">持有期检查清单</p>
                <p>• µ偏移 &lt; 1.5σ（25条以内）→ <span className="text-emerald-400">不调仓，继续持有</span></p>
                <p>• µ偏移 ≥ 1.5σ → <span className="text-amber-400">等BJ 17:30死区内评估调仓</span></p>
                <p>• Musk连续2天低于均值30%+ → <span className="text-rose-400">必须重算µ</span></p>
              </div>
            </div>
          </div>
        )}

        {/* ── 三个强制检查点时间表 ── */}
        <div className="p-4 bg-slate-800/40 rounded-xl border border-slate-700/40">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
            <Zap className="w-3 h-3 text-emerald-400" />每日三个强制检查点（北京时间）
          </h3>
          <div className="space-y-3">
            {[
              {
                time: 'BJ 11:45',
                label: '深夜前建仓窗口',
                action: phase === 'entry'
                  ? `✅ 当前在入场期 — 检查VR是否≥1.0，避开BJ 13-16高峰`
                  : phase === 'watch'
                  ? '观望 — 距到期仍 > 2.5天，不入场'
                  : '检查仓位状态，评估是否需要补仓',
                active: phase === 'entry',
                color: 'from-emerald-500 to-emerald-500',
              },
              {
                time: 'BJ 17:30',
                label: '死区剪仓评估（强制）',
                action: phase === 'trim1' || phase === 'trim2'
                  ? '⚠️ 当前在减仓期 — 检查概率<15%的区间，评估是否止损'
                  : '检查今日会话是否缺席 → 修正µ；浮亏>20%且µ偏出 → 止损',
                active: phase === 'trim1' || phase === 'trim2',
                color: 'from-amber-500 to-orange-500',
              },
              {
                time: 'BJ 21:00',
                label: '晨间补仓窗口',
                action: 'VR≥1.0且主仓未达50-70% → 可补仓；否则等次日BJ 11:45',
                active: false,
                color: 'from-emerald-500 to-teal-500',
              },
            ].map((step, i) => (
              <div key={i} className={`flex items-start gap-3 transition-opacity ${step.active ? 'opacity-100' : 'opacity-45'}`}>
                <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${step.active ? `bg-gradient-to-br ${step.color} shadow-lg` : 'bg-slate-600'}`} />
                <div className="flex-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className={`text-xs font-bold font-mono ${step.active ? 'text-white' : 'text-slate-400'}`}>{step.time}</span>
                    <span className={`text-xs ${step.active ? 'text-slate-300' : 'text-slate-500'}`}>{step.label}</span>
                  </div>
                  <p className={`text-xs mt-0.5 leading-relaxed ${step.active ? 'text-slate-200' : 'text-slate-400'}`}>{step.action}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-slate-400 text-center">建议基于模型预测，不构成投资建议 · 请结合实际流动性操作</p>
      </div>
    </div>
  );
}
