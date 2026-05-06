import { useState } from 'react';
import { Plus, Trash2, Briefcase, DollarSign, TrendingUp, TrendingDown } from 'lucide-react';

export interface Position {
  id: string;
  range: string;
  entryPrice: number;   // % — e.g. 20.5 means you paid $0.205 per YES share
  amount: number;       // USDC invested
  shares: number;       // YES shares = amount / (entryPrice / 100)
  timestamp: number;
  marketSlug: string;
}

export interface RangeOption {
  range: string;
  currentPrice: number;  // live market price %
  modelProb: number;     // model probability %
  isCenter: boolean;
}

interface Props {
  positions: Position[];
  onAdd: (pos: Position) => void;
  onDelete: (id: string) => void;
  rangeOptions: RangeOption[];
  currentMarketSlug: string;
}

export function PositionManager({ positions, onAdd, onDelete, rangeOptions, currentMarketSlug }: Props) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedRange, setSelectedRange] = useState('');
  const [entryPrice, setEntryPrice] = useState('');
  const [amount, setAmount] = useState('');

  const handleRangeSelect = (range: string) => {
    setSelectedRange(range);
    const opt = rangeOptions.find(r => r.range === range);
    if (opt && opt.currentPrice > 0) {
      setEntryPrice(opt.currentPrice.toFixed(1));
    }
  };

  const handleAdd = () => {
    const ep = parseFloat(entryPrice);
    const amt = parseFloat(amount);
    if (!selectedRange || isNaN(ep) || ep <= 0 || ep >= 100 || isNaN(amt) || amt <= 0) return;
    const shares = amt / (ep / 100);
    const pos: Position = {
      id: `pos_${Date.now()}`,
      range: selectedRange,
      entryPrice: ep,
      amount: amt,
      shares,
      timestamp: Date.now(),
      marketSlug: currentMarketSlug,
    };
    onAdd(pos);
    setSelectedRange('');
    setEntryPrice('');
    setAmount('');
    setIsFormOpen(false);
  };

  const canSubmit =
    selectedRange !== '' &&
    !isNaN(parseFloat(entryPrice)) && parseFloat(entryPrice) > 0 && parseFloat(entryPrice) < 100 &&
    !isNaN(parseFloat(amount)) && parseFloat(amount) > 0;

  // Enrich positions with live data
  const enriched = positions.map(pos => {
    const opt = rangeOptions.find(r => r.range === pos.range);
    const currentPrice = opt?.currentPrice ?? 0;
    const modelProb = opt?.modelProb ?? 0;
    const currentValue = currentPrice > 0 ? pos.shares * (currentPrice / 100) : 0;
    const pnl = currentValue - pos.amount;
    const pnlPct = pos.amount > 0 ? (pnl / pos.amount) * 100 : 0;

    let signal: 'takeprofit' | 'stoploss' | 'modelexit' | null = null;
    if (currentPrice >= 70) signal = 'takeprofit';
    else if (currentPrice > 0 && currentPrice <= pos.entryPrice * 0.4) signal = 'stoploss';
    else if (modelProb > 0 && modelProb < 3) signal = 'modelexit';

    return { ...pos, currentPrice, modelProb, currentValue, pnl, pnlPct, signal };
  });

  const totalInvested = enriched.reduce((s, p) => s + p.amount, 0);
  const totalValue = enriched.reduce((s, p) => s + p.currentValue, 0);
  const totalPnl = totalValue - totalInvested;
  const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;
  const hasSignal = enriched.some(p => p.signal);

  return (
    <div className="space-y-6">
      {/* ── Portfolio summary ── */}
      {enriched.length > 0 && (
        <div className="bg-[#162538] rounded-2xl p-6 border border-slate-800/80">
          <h2 className="text-base font-semibold text-slate-200 flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/25 flex items-center justify-center">
              <Briefcase className="w-4 h-4 text-sky-400" />
            </div>
            持仓汇总
          </h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-slate-800/50 rounded-xl border border-slate-700/40">
              <p className="text-[11px] text-slate-500 mb-1.5 uppercase tracking-wide">总投入</p>
              <p className="text-2xl font-bold text-slate-200 font-mono">${totalInvested.toFixed(0)}</p>
            </div>
            <div className="text-center p-4 bg-slate-800/50 rounded-xl border border-sky-500/20">
              <p className="text-[11px] text-slate-500 mb-1.5 uppercase tracking-wide">当前估值</p>
              <p className="text-2xl font-bold text-sky-400 font-mono">${totalValue.toFixed(0)}</p>
              <p className="text-[11px] text-slate-600 mt-1">按市价折算</p>
            </div>
            <div className={`text-center p-4 rounded-xl border ${
              totalPnl >= 0 ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-rose-500/10 border-rose-500/20'
            }`}>
              <p className="text-[11px] text-slate-500 mb-1.5 uppercase tracking-wide">浮动盈亏</p>
              <p className={`text-2xl font-bold font-mono ${totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(0)}
              </p>
              <p className={`text-[11px] mt-1 font-mono ${totalPnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {totalPnlPct >= 0 ? '+' : ''}{totalPnlPct.toFixed(1)}%
              </p>
            </div>
          </div>
          <div className="mt-4 p-3 bg-slate-800/40 rounded-lg text-xs text-slate-500 border border-slate-700/40">
            ⚠️ 各区间互斥，最终只有一个区间结算为 YES。当前估值与浮盈均按市价折算，非中奖金额。
          </div>
        </div>
      )}

      {/* ── Add position form ── */}
      <div className="bg-[#162538] rounded-2xl p-6 border border-slate-800/80">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-200 flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-sky-400" />
            </div>
            记录持仓
          </h2>
          {!isFormOpen && (
            <button
              onClick={() => setIsFormOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              添加仓位
            </button>
          )}
        </div>

        {isFormOpen && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Range */}
              <div>
                <label className="block text-xs text-slate-400 mb-1.5 font-medium">选择区间</label>
                <select
                  value={selectedRange}
                  onChange={e => handleRangeSelect(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-sky-500 transition-colors"
                >
                  <option value="">-- 选择区间 --</option>
                  {rangeOptions.map(opt => (
                    <option key={opt.range} value={opt.range}>
                      {opt.range}  ({opt.currentPrice.toFixed(1)}%{opt.isCenter ? '  ★中心' : ''})
                    </option>
                  ))}
                </select>
              </div>

              {/* Entry price */}
              <div>
                <label className="block text-xs text-slate-400 mb-1.5 font-medium">入场价格 (%)</label>
                <div className="relative">
                  <input
                    type="number"
                    value={entryPrice}
                    onChange={e => setEntryPrice(e.target.value)}
                    placeholder="如 20.5"
                    min="0.1"
                    max="99.9"
                    step="0.1"
                    className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-sky-500 transition-colors"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs pointer-events-none">%</span>
                </div>
                {entryPrice && !isNaN(parseFloat(entryPrice)) && parseFloat(entryPrice) > 0 && (
                  <p className="text-[11px] text-slate-500 mt-1 font-mono">
                    每份 ${(parseFloat(entryPrice) / 100).toFixed(3)} · 赔率 {(100 / parseFloat(entryPrice)).toFixed(2)}x
                  </p>
                )}
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs text-slate-400 mb-1.5 font-medium">投入金额 (USDC)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm pointer-events-none">$</span>
                  <input
                    type="number"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="如 100"
                    min="1"
                    step="1"
                    className="w-full pl-7 pr-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-sky-500 transition-colors"
                  />
                </div>
                {entryPrice && amount && !isNaN(parseFloat(entryPrice)) && !isNaN(parseFloat(amount)) && parseFloat(entryPrice) > 0 && (
                  <p className="text-[11px] text-slate-500 mt-1 font-mono">
                    ≈ {(parseFloat(amount) / (parseFloat(entryPrice) / 100)).toFixed(0)} 份 YES token
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleAdd}
                disabled={!canSubmit}
                className="flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                确认添加
              </button>
              <button
                onClick={() => { setIsFormOpen(false); setSelectedRange(''); setEntryPrice(''); setAmount(''); }}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 text-sm rounded-lg transition-colors border border-slate-700"
              >
                取消
              </button>
              {selectedRange && (
                <span className="text-xs text-slate-500 ml-auto">
                  {rangeOptions.find(r => r.range === selectedRange)?.isCenter ? '⭐ 模型中心区间' : ''}
                </span>
              )}
            </div>
          </div>
        )}

        {!isFormOpen && enriched.length === 0 && (
          <div className="text-center py-10 text-slate-600">
            <Briefcase className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm text-slate-500">暂无持仓记录</p>
            <p className="text-xs mt-1">点击「添加仓位」记录你的下注</p>
          </div>
        )}
      </div>

      {/* ── Positions list ── */}
      {enriched.length > 0 && (
        <div className="bg-[#162538] rounded-2xl p-6 border border-slate-800/80">
          <h2 className="text-base font-semibold text-slate-200 mb-5">持仓明细</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">区间</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">入场价</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">当前价</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">份数</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">投入</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">当前估值</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">浮盈</th>
                  <th className="py-2 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {enriched.map(pos => {
                  const rowBg =
                    pos.signal === 'takeprofit' ? 'border-l-2 border-l-emerald-500 bg-emerald-500/5' :
                    pos.signal === 'stoploss'   ? 'border-l-2 border-l-rose-500 bg-rose-500/5' :
                    pos.signal === 'modelexit'  ? 'border-l-2 border-l-amber-500 bg-amber-500/5' : '';
                  return (
                    <tr key={pos.id} className={`border-b border-slate-800/60 hover:bg-slate-800/30 transition-colors ${rowBg}`}>
                      <td className="py-3 px-3">
                        <div>
                          <span className="font-mono font-semibold text-slate-200">{pos.range}</span>
                          {pos.signal && (
                            <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                              pos.signal === 'takeprofit' ? 'bg-emerald-500/20 text-emerald-300' :
                              pos.signal === 'stoploss'   ? 'bg-rose-500/20 text-rose-300' :
                                                           'bg-amber-500/20 text-amber-300'
                            }`}>
                              {pos.signal === 'takeprofit' ? '止盈↑' : pos.signal === 'stoploss' ? '减仓↓' : '出场'}
                            </span>
                          )}
                          <p className="text-[10px] text-slate-600 font-mono mt-0.5">
                            {new Date(pos.timestamp).toLocaleDateString('zh-CN', {
                              month: 'numeric', day: 'numeric',
                              hour: '2-digit', minute: '2-digit',
                            })}
                          </p>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-400">{pos.entryPrice.toFixed(1)}%</td>
                      <td className="py-3 px-3 text-right font-mono">
                        {pos.currentPrice > 0 ? (
                          <span className={pos.currentPrice >= pos.entryPrice ? 'text-emerald-400' : 'text-rose-400'}>
                            {pos.currentPrice.toFixed(1)}%
                            {pos.currentPrice >= pos.entryPrice
                              ? <TrendingUp className="w-3 h-3 inline ml-1 opacity-60" />
                              : <TrendingDown className="w-3 h-3 inline ml-1 opacity-60" />}
                          </span>
                        ) : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-500">{pos.shares.toFixed(0)}</td>
                      <td className="py-3 px-3 text-right font-mono text-slate-400">${pos.amount.toFixed(0)}</td>
                      <td className="py-3 px-3 text-right font-mono text-sky-400">
                        {pos.currentValue > 0 ? `$${pos.currentValue.toFixed(1)}` : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="py-3 px-3 text-right">
                        {pos.currentValue > 0 ? (
                          <div>
                            <p className={`font-mono font-semibold ${pos.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {pos.pnl >= 0 ? '+' : ''}${pos.pnl.toFixed(1)}
                            </p>
                            <p className={`text-[10px] font-mono ${pos.pnlPct >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                              {pos.pnlPct >= 0 ? '+' : ''}{pos.pnlPct.toFixed(1)}%
                            </p>
                          </div>
                        ) : <span className="text-slate-600 font-mono">—</span>}
                      </td>
                      <td className="py-3 px-3">
                        <button
                          onClick={() => onDelete(pos.id)}
                          title="删除持仓"
                          className="p-1.5 rounded hover:bg-rose-500/20 text-slate-600 hover:text-rose-400 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Signal legend */}
          {hasSignal && (
            <div className="mt-5 p-3 bg-slate-800/40 rounded-xl text-xs text-slate-500 border border-slate-800 flex flex-wrap gap-x-5 gap-y-2">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                止盈信号：当前价格 ≥ 70% · 建议锁定部分利润
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0"></span>
                减仓信号：价格较入场跌幅 ≥ 60% · 考虑止损
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0"></span>
                出场信号：模型概率 {'<'} 3% · 区间已无胜算
              </span>
            </div>
          )}

          {/* Payout projection */}
          <div className="mt-4 p-4 bg-sky-500/5 rounded-xl border border-sky-500/10">
            <p className="text-xs text-slate-500 mb-3 font-medium">若该区间命中，单笔收益（各区间互斥，只有一个兑现）</p>
            <div className="space-y-2">
              {enriched.map(pos => {
                const winPayout = pos.shares;          // each YES share pays $1 if correct
                const netGain   = winPayout - pos.amount;
                const modelProb = pos.modelProb;
                return (
                  <div key={pos.id} className="flex items-center justify-between text-xs">
                    <span className="font-mono text-slate-400">{pos.range}</span>
                    <div className="flex items-center gap-4 text-right">
                      <span className="text-slate-600">
                        中奖 → <span className="text-emerald-400 font-semibold font-mono">${winPayout.toFixed(0)}</span>
                        <span className="text-slate-600"> (+${netGain.toFixed(0)})</span>
                      </span>
                      <span className="text-slate-600">
                        模型概率 <span className={`font-semibold font-mono ${modelProb >= 20 ? 'text-sky-400' : modelProb >= 5 ? 'text-amber-400' : 'text-rose-400'}`}>
                          {modelProb.toFixed(1)}%
                        </span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
