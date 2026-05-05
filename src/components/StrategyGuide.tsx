import { useState } from 'react';
import {
  BookOpen, TrendingUp, AlertTriangle, CheckCircle2,
  ArrowRight, Zap, Shield, Target, DollarSign,
  ChevronDown, ChevronUp, Info,
} from 'lucide-react';

// ─── tiny helpers ─────────────────────────────────────────────────────────────
function Tag({ label, color }: { label: string; color: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold tracking-wide ${color}`}>
      {label}
    </span>
  );
}

function SectionTitle({ icon: Icon, title, sub }: { icon: any; title: string; sub?: string }) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div className="w-9 h-9 rounded-lg bg-sky-500/10 border border-sky-500/25 flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="w-4.5 h-4.5 text-sky-400" />
      </div>
      <div>
        <h2 className="text-base font-bold text-slate-100">{title}</h2>
        {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function InfoBox({ children, color = 'sky' }: { children: React.ReactNode; color?: string }) {
  const cls = color === 'amber'
    ? 'bg-amber-500/8 border-amber-500/30 text-amber-300'
    : color === 'rose'
      ? 'bg-rose-500/8 border-rose-500/30 text-rose-300'
      : color === 'emerald'
        ? 'bg-emerald-500/8 border-emerald-500/30 text-emerald-300'
        : 'bg-sky-500/8 border-sky-500/30 text-sky-300';
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm leading-relaxed ${cls}`}>
      {children}
    </div>
  );
}

function Collapsible({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-slate-700/60 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-slate-300 hover:text-slate-100 hover:bg-slate-800/50 transition-colors"
      >
        <span>{title}</span>
        {open ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
      </button>
      {open && <div className="px-4 pb-4 pt-1">{children}</div>}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function StrategyGuide() {
  return (
    <div className="max-w-4xl mx-auto space-y-8 text-slate-300">

      {/* Header */}
      <div className="bg-[#162538] rounded-2xl p-6 border border-slate-800/80">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/25 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-sky-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-100">下注策略指南</h1>
            <p className="text-xs text-slate-500">基于数学模型的仓位管理与入场时机</p>
          </div>
        </div>
        <p className="text-sm text-slate-400 leading-relaxed">
          本指南以数值模拟为核心，演示在马斯克推文7天预测周期中，
          如何根据模型输出决定入场时机、资金比例与仓位调整。
          所有数字均为模拟示例，实际操作请结合网站实时数据。
        </p>
      </div>

      {/* 1. 数学基础 */}
      <div className="bg-[#162538] rounded-2xl p-6 border border-slate-800/80 space-y-5">
        <SectionTitle icon={TrendingUp} title="数学基础：不确定性如何随时间收缩" />

        <p className="text-sm leading-relaxed">
          在剩余时间 T 天内，马斯克推文数的不确定性可以用等效标准差衡量。
          由于他的发推行为具有明显的"爆发性"（非泊松），实际波动约为纯泊松假设的 <span className="text-amber-400 font-semibold">2.5 倍</span>：
        </p>

        <div className="bg-slate-900/60 rounded-xl p-4 font-mono text-sm space-y-2 border border-slate-700/40">
          <div className="text-sky-400">σ_剩余 ≈ √(日均速率 × 剩余天数) × 2.5</div>
          <div className="text-slate-500 text-xs mt-3">— 以日均速率 55 条/天为例 —</div>
          <div className="grid grid-cols-4 gap-2 text-xs mt-1">
            {[
              { t: '剩余4天', sigma: 37 },
              { t: '剩余3天', sigma: 32 },
              { t: '剩余2天', sigma: 26 },
              { t: '剩余1天', sigma: 18 },
            ].map(({ t, sigma }) => (
              <div key={t} className="bg-slate-800/60 rounded-lg p-2 text-center">
                <div className="text-slate-400">{t}</div>
                <div className="text-emerald-400 font-bold text-base">±{sigma}</div>
                <div className="text-slate-600 text-[10px]">条</div>
              </div>
            ))}
          </div>
        </div>

        <InfoBox color="sky">
          <span className="font-semibold">核心原则：</span>
          σ 越小，最优 Kelly 仓位越大，入场越合理。
          区间宽度通常为 50 条，当 σ 降至 25 条以下（约剩余2天时），
          模型的区分能力才开始明显优于随机猜测。
        </InfoBox>

        <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700/40 text-sm space-y-2">
          <div className="text-slate-400 text-xs mb-3 uppercase tracking-wide">Kelly 仓位公式（单区间）</div>
          <div className="font-mono text-sky-400">f* = (模型概率 p − 市场价格 q) / (1 − q)</div>
          <div className="text-xs text-slate-500 mt-2">
            例：模型认为 38%，市场标价 30% → f* = (0.38−0.30)/(1−0.30) = 11.4%<br />
            实操建议使用 <span className="text-amber-400">1/4 Kelly</span>（f/4），即约 2.9% 的总资金下注该区间
          </div>
        </div>
      </div>

      {/* 2. 两次入场原则 */}
      <div className="bg-[#162538] rounded-2xl p-6 border border-slate-800/80 space-y-5">
        <SectionTitle icon={Target} title="两次入场，而非三次" sub="把最大筹码留给信息最充分的时刻" />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-900/50 rounded-xl p-4 border border-emerald-500/20">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center text-sm font-bold text-emerald-400">1</div>
              <div>
                <div className="text-sm font-semibold text-slate-200">第一次入场</div>
                <div className="text-xs text-slate-500">剩余 2.5–3 天</div>
              </div>
            </div>
            <div className="space-y-1.5 text-xs text-slate-400">
              <div>· 已有 4 天真实数据，速率基本稳定</div>
              <div>· σ ≈ 30 条，区分能力开始出现</div>
              <div>· 优先用 Convert 机制降低成本</div>
              <div>· <span className="text-emerald-400 font-semibold">投入总资金的 30%（$300）</span></div>
            </div>
          </div>
          <div className="bg-slate-900/50 rounded-xl p-4 border border-sky-500/20">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-sky-500/15 flex items-center justify-center text-sm font-bold text-sky-400">2</div>
              <div>
                <div className="text-sm font-semibold text-slate-200">第二次入场</div>
                <div className="text-xs text-slate-500">剩余 18–30 小时</div>
              </div>
            </div>
            <div className="space-y-1.5 text-xs text-slate-400">
              <div>· σ ≈ 18 条，落点基本已定</div>
              <div>· Kelly 分数最大，是核心决策窗口</div>
              <div>· 根据实时数据重新计算 µ</div>
              <div>· <span className="text-sky-400 font-semibold">投入总资金的 50%（$500）</span></div>
            </div>
          </div>
        </div>

        <div className="bg-slate-800/40 rounded-xl p-3 border border-slate-700/40 text-xs text-slate-500 flex items-start gap-2">
          <Info className="w-3.5 h-3.5 text-slate-600 shrink-0 mt-0.5" />
          <span>剩余 $200（20%）作为应急储备，仅在最后 6 小时出现明显边界风险时动用。</span>
        </div>
      </div>

      {/* 3. 具体数值模拟 */}
      <div className="bg-[#162538] rounded-2xl p-6 border border-slate-800/80 space-y-6">
        <SectionTitle icon={DollarSign} title="具体数值模拟" sub="$1000 总资金，三种情景" />

        {/* 基础参数 */}
        <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700/40">
          <div className="text-xs text-slate-500 uppercase tracking-wide mb-3">基础参数（第一次入场时刻）</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            {[
              { label: '当前推文数', val: '220 条', color: 'text-sky-400' },
              { label: '日均速率', val: '55 条/天', color: 'text-emerald-400' },
              { label: '剩余天数', val: '3 天', color: 'text-amber-400' },
              { label: '模型落点 µ', val: '385 条', color: 'text-violet-400' },
            ].map(({ label, val, color }) => (
              <div key={label} className="bg-slate-800/60 rounded-lg p-3 text-center">
                <div className="text-[11px] text-slate-500 mb-1">{label}</div>
                <div className={`font-bold font-mono ${color}`}>{val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 区间分析表 */}
        <div>
          <div className="text-xs text-slate-500 uppercase tracking-wide mb-3">区间价格 vs 模型概率（第一次入场时）</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-slate-700/60">
                  <th className="text-left py-2 pr-3">区间</th>
                  <th className="text-right py-2 px-3">市场价</th>
                  <th className="text-right py-2 px-3">模型概率</th>
                  <th className="text-right py-2 px-3">边际α</th>
                  <th className="text-right py-2 px-3">¼ Kelly仓位</th>
                  <th className="text-right py-2 pl-3">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {[
                  { range: '< 300', mkt: 3, model: 1, note: '' },
                  { range: '300–349', mkt: 8, model: 12, note: '小仓' },
                  { range: '350–399', mkt: 30, model: 38, note: '主仓 ✓', highlight: true },
                  { range: '400–449', mkt: 35, model: 32, note: '对冲' },
                  { range: '450–499', mkt: 18, model: 13, note: '' },
                  { range: '500+', mkt: 6, model: 4, note: '', convertSource: true },
                ].map(({ range, mkt, model, note, highlight, convertSource }) => {
                  const alpha = model / mkt;
                  const kelly4 = Math.max(0, (model / 100 - mkt / 100) / (1 - mkt / 100) / 4 * 100);
                  return (
                    <tr key={range} className={highlight ? 'bg-emerald-500/5' : ''}>
                      <td className={`py-2.5 pr-3 font-mono font-semibold ${highlight ? 'text-emerald-400' : 'text-slate-300'}`}>
                        {range}
                        {convertSource && <span className="ml-1.5 text-violet-400 text-[10px]">← Convert源</span>}
                      </td>
                      <td className="text-right py-2.5 px-3 text-slate-400 font-mono">{mkt}%</td>
                      <td className={`text-right py-2.5 px-3 font-mono font-semibold ${model > mkt ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {model}%
                      </td>
                      <td className={`text-right py-2.5 px-3 font-mono ${alpha > 1 ? 'text-emerald-400' : 'text-slate-500'}`}>
                        {alpha.toFixed(2)}x
                      </td>
                      <td className="text-right py-2.5 px-3 font-mono text-sky-400">
                        {kelly4 > 0 ? kelly4.toFixed(1) + '%' : '—'}
                      </td>
                      <td className={`text-right py-2.5 pl-3 text-[11px] font-semibold ${
                        note.includes('主仓') ? 'text-emerald-400' :
                        note.includes('对冲') ? 'text-amber-400' :
                        note.includes('小仓') ? 'text-sky-400' : 'text-slate-600'
                      }`}>
                        {note || '忽略'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="text-[11px] text-slate-600 mt-2">边际α = 模型概率 / 市场价格；{'>'}1 表示有正边际，建议买入</div>
        </div>

        {/* 第一次入场分配 */}
        <div>
          <div className="text-xs text-slate-500 uppercase tracking-wide mb-3">第一次入场：$300 分配（剩余3天）</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              {
                label: '350–399（主仓）', amount: 150, pct: 50,
                shares: '500份', price: '$0.30/份',
                color: 'border-emerald-500/30 bg-emerald-500/5', tag: 'text-emerald-400',
              },
              {
                label: '300–349（下翼对冲）', amount: 90, pct: 30,
                shares: '1125份', price: '$0.08/份',
                color: 'border-sky-500/30 bg-sky-500/5', tag: 'text-sky-400',
                note: '速率下滑时的保护',
              },
              {
                label: '400–449（上翼对冲）', amount: 60, pct: 20,
                shares: '171份', price: '$0.35/份',
                color: 'border-amber-500/30 bg-amber-500/5', tag: 'text-amber-400',
                note: 'µ距400边界仅15条',
              },
            ].map(({ label, amount, pct, shares, price, color, tag, note }) => (
              <div key={label} className={`rounded-xl border p-4 ${color}`}>
                <div className="text-xs text-slate-500 mb-2">{label}</div>
                <div className={`text-2xl font-bold font-mono ${tag}`}>${amount}</div>
                <div className="text-xs text-slate-500 mt-1">{pct}% · {shares} · {price}</div>
                {note && <div className="text-[11px] text-slate-600 mt-2 italic">{note}</div>}
              </div>
            ))}
          </div>
          <InfoBox color="amber">
            <span className="font-semibold">为什么下翼（300–349）比上翼（400–449）多？</span>
            <br />
            马斯克存在正向爆发偏态：低速率罕见，高速率爆发常见。
            因此对"落在更高区间"的防护已由400–449承担，
            对"落在更低区间"的防护优先级更高。
          </InfoBox>
        </div>

        {/* 三种情景 */}
        <div className="space-y-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">第二次入场决策：三种情景（剩余1天时）</div>

          {/* 情景A */}
          <div className="bg-slate-900/50 rounded-xl p-5 border border-emerald-500/25 space-y-4">
            <div className="flex items-center gap-3">
              <Tag label="情景 A" color="bg-emerald-500/20 text-emerald-400" />
              <span className="text-sm font-semibold text-slate-200">落点稳定，远离边界</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              {[
                { k: '当前推文', v: '320 条' },
                { k: '剩余', v: '1 天' },
                { k: '预测落点 µ', v: '375 条' },
                { k: '距400边界', v: '25 条 ✓' },
              ].map(({ k, v }) => (
                <div key={k} className="bg-slate-800/60 rounded-lg p-2.5 text-center">
                  <div className="text-slate-500">{k}</div>
                  <div className="text-emerald-400 font-bold font-mono mt-0.5">{v}</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              σ ≈ 18 条，P(超过400) ≈ 8%。落点清晰，可以重仓集中。
            </p>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-lg p-3 text-center">
                <div className="text-slate-500 mb-1">350–399（主仓）</div>
                <div className="text-emerald-400 font-bold text-lg">$350</div>
                <div className="text-slate-500">70%</div>
              </div>
              <div className="bg-sky-500/10 border border-sky-500/20 rounded-lg p-3 text-center">
                <div className="text-slate-500 mb-1">400–449（轻对冲）</div>
                <div className="text-sky-400 font-bold text-lg">$100</div>
                <div className="text-slate-500">20%</div>
              </div>
              <div className="bg-slate-800/60 rounded-lg p-3 text-center">
                <div className="text-slate-500 mb-1">备用</div>
                <div className="text-slate-400 font-bold text-lg">$50</div>
                <div className="text-slate-500">10%</div>
              </div>
            </div>
            <div className="text-[11px] text-slate-500 italic">
              预计净收益：若350–399中，$150（第一次）+ $350（第二次）共500份，结算$1 → 赚约$850
            </div>
          </div>

          {/* 情景B */}
          <div className="bg-slate-900/50 rounded-xl p-5 border border-amber-500/25 space-y-4">
            <div className="flex items-center gap-3">
              <Tag label="情景 B" color="bg-amber-500/20 text-amber-400" />
              <span className="text-sm font-semibold text-slate-200">落点在区间边界附近</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              {[
                { k: '当前推文', v: '340 条' },
                { k: '剩余', v: '1 天' },
                { k: '预测落点 µ', v: '395 条' },
                { k: '距400边界', v: '5 条 ⚠️' },
              ].map(({ k, v }) => (
                <div key={k} className="bg-slate-800/60 rounded-lg p-2.5 text-center">
                  <div className="text-slate-500">{k}</div>
                  <div className="text-amber-400 font-bold font-mono mt-0.5">{v}</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              σ ≈ 18 条，P(超过400) ≈ 39%。两个区间几乎各半，强行押注会面临接近 50% 的二元风险。
            </p>
            <InfoBox color="amber">
              <span className="font-semibold">边界情景处理原则：</span>不要押单边。
              5条差距在 18 条的σ面前微不足道，任何一天的发推节奏异常都可能导致越线。
            </InfoBox>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-amber-500/10 border border-amber-500/25 rounded-lg p-3 text-center">
                <div className="text-slate-500 mb-1">350–399</div>
                <div className="text-amber-400 font-bold text-lg">$200</div>
                <div className="text-slate-500">40%（等权）</div>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/25 rounded-lg p-3 text-center">
                <div className="text-slate-500 mb-1">400–449</div>
                <div className="text-amber-400 font-bold text-lg">$200</div>
                <div className="text-slate-500">40%（等权）</div>
              </div>
            </div>
            <div className="bg-slate-800/40 rounded-lg p-3 text-xs text-slate-500">
              剩余 $100 暂时不动，等最后 6 小时发推数据进一步明确后，若越过 400 则全押 400–449，
              否则全押 350–399。
            </div>
          </div>

          {/* 情景C */}
          <div className="bg-slate-900/50 rounded-xl p-5 border border-rose-500/25 space-y-4">
            <div className="flex items-center gap-3">
              <Tag label="情景 C" color="bg-rose-500/20 text-rose-400" />
              <span className="text-sm font-semibold text-slate-200">速率出现重大异常</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              {[
                { k: '当天实际速率', v: '130 条 ⚡' },
                { k: '原模型速率', v: '55 条/天' },
                { k: '速率偏差', v: '+136%' },
                { k: '新预测落点 µ', v: '460 条 ↑↑' },
              ].map(({ k, v }) => (
                <div key={k} className="bg-slate-800/60 rounded-lg p-2.5 text-center">
                  <div className="text-slate-500">{k}</div>
                  <div className="text-rose-400 font-bold font-mono mt-0.5">{v}</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              第5天马斯克爆发性发推130条（远超日均55条）。
              重新计算：当前共 350 条，剩余2天 µ = 350 + 55×2 = <span className="text-rose-400 font-semibold">460 条</span>，
              落入 450–499 区间。第一次入场的 350–399 主仓已偏离2个区间。
            </p>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2 bg-rose-500/8 border border-rose-500/25 rounded-lg px-3 py-2.5">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span>以当前市场价清空 350–399 的第一次仓位。此时市场价可能已跌至 15–20%，亏损约 $75–100。</span>
              </div>
              <div className="flex items-center gap-2 bg-emerald-500/8 border border-emerald-500/25 rounded-lg px-3 py-2.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>第二次入场 $500 全部重新分配：450–499 主仓 $300 + 400–449 对冲 $150 + 备用 $50。</span>
              </div>
              <div className="flex items-center gap-2 bg-amber-500/8 border border-amber-500/25 rounded-lg px-3 py-2.5">
                <Info className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>核心原则：不因为"已经亏了"而拒绝止损。第一次仓位的损失已经发生，第二次入场必须基于当前最新数据做独立决策。</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Convert 机制 */}
      <div className="bg-[#162538] rounded-2xl p-6 border border-slate-800/80 space-y-5">
        <SectionTitle icon={Zap} title="Convert 机制：以 NO 换 YES" sub="在 Polymarket 分类市场中降低入场成本" />

        <div className="bg-slate-900/60 rounded-xl p-4 border border-violet-500/25 space-y-3">
          <div className="text-xs text-violet-400 uppercase tracking-wide font-semibold">等价恒等式</div>
          <div className="font-mono text-sm text-slate-300">
            NO_X ≡ YES_A + YES_B + YES_C + ... （除 X 外所有区间的 YES 之和）
          </div>
          <div className="text-xs text-slate-500">
            两者赔付结构完全相同：无论哪个其他区间赢，都各赔付 $1。
            Polymarket 的 Convert 按钮即执行此等价转换。
          </div>
        </div>

        <div className="space-y-3">
          <div className="text-sm font-semibold text-slate-300">为什么 Convert 比直接买入便宜？</div>

          <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700/40 space-y-4 text-sm">
            <div>
              <div className="text-xs text-slate-500 mb-2 uppercase tracking-wide">数值对比（市场overround = 3%）</div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-800/60 rounded-lg p-3">
                  <div className="text-slate-500 mb-2">各区间 YES 价格之和</div>
                  <div className="font-mono space-y-1">
                    <div>350–399: <span className="text-emerald-400">30.9%</span></div>
                    <div>400–449: <span className="text-slate-400">36.1%</span></div>
                    <div>450–499: <span className="text-slate-400">18.6%</span></div>
                    <div>300–349: <span className="text-slate-400">8.2%</span></div>
                    <div>&lt;300: <span className="text-slate-400">3.1%</span></div>
                    <div>500+: <span className="text-slate-600">6.2%</span></div>
                    <div className="border-t border-slate-700 pt-1 mt-1">
                      合计 = <span className="text-amber-400 font-bold">103%</span>（超额3%）
                    </div>
                  </div>
                </div>
                <div className="bg-slate-800/60 rounded-lg p-3 space-y-2">
                  <div className="text-slate-500 mb-2">入场方式对比</div>
                  <div>
                    <div className="text-slate-400">直接买 YES_350–399：</div>
                    <div className="font-mono text-rose-400">$0.309 / 份</div>
                    <div className="text-[11px] text-slate-600 mt-0.5">$300 → 970 份</div>
                  </div>
                  <div className="border-t border-slate-700 pt-2">
                    <div className="text-slate-400">Convert 路线（买 NO_500+ 转换）：</div>
                    <div className="font-mono">
                      NO_500+ 成本：<span className="text-slate-300">$0.938</span><br />
                      卖出其余YES：<span className="text-slate-400">-$0.660</span><br />
                      <span className="text-emerald-400 font-bold">净成本：$0.278 / 份</span>
                    </div>
                    <div className="text-[11px] text-slate-600 mt-0.5">$300 → 1079 份（多 11.2%）</div>
                  </div>
                </div>
              </div>
            </div>

            <InfoBox color="emerald">
              <span className="font-semibold">节省公式：</span>
              每份 YES_目标区间 的有效成本 = 市场价格 − (总超额 overround)
              <br />
              即：$0.309 − $0.03 = $0.279，与上方计算吻合。
              Overround 越高，Convert 节省越多（通常 5–15%）。
            </InfoBox>
          </div>
        </div>

        <div className="space-y-3">
          <div className="text-sm font-semibold text-slate-300">选哪个区间的 NO 做转换源？</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-900/60 rounded-xl p-4 border border-emerald-500/20">
              <div className="text-emerald-400 font-semibold mb-2">✓ 理想的转换源</div>
              <div className="space-y-1.5 text-slate-400">
                <div>· 你高度确信该区间不会中（真实概率 &lt;2%）</div>
                <div>· YES 价格在 5–20% 之间（流动性较好）</div>
                <div>· 即买 NO 本身也有正 EV（市场高估了它）</div>
                <div>· 通常是距落点中心最远的 1–2 个区间</div>
              </div>
            </div>
            <div className="bg-slate-900/60 rounded-xl p-4 border border-rose-500/20">
              <div className="text-rose-400 font-semibold mb-2">✗ 避免用作转换源</div>
              <div className="space-y-1.5 text-slate-400">
                <div>· YES 价格 &lt;3%（流动性差，卖出时滑点大）</div>
                <div>· 靠近落点中心的区间（风险太高）</div>
                <div>· 临近结算的最后 6 小时（操作复杂，速度优先）</div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700/40 space-y-3">
          <div className="text-xs text-slate-500 uppercase tracking-wide">叠加边际：双重优势</div>
          <div className="flex items-start gap-3 text-xs">
            <ArrowRight className="w-3.5 h-3.5 text-violet-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-slate-300 font-semibold">边际①</span>
              <span className="text-slate-400">：市场 overround 带来成本折扣（约 3–6%）</span>
            </div>
          </div>
          <div className="flex items-start gap-3 text-xs">
            <ArrowRight className="w-3.5 h-3.5 text-violet-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-slate-300 font-semibold">边际②</span>
              <span className="text-slate-400">：选了被市场高估的 NO（如市场标 8%，真实 2%）→ NO 本身额外收益 6%</span>
            </div>
          </div>
          <div className="flex items-start gap-3 text-xs">
            <ArrowRight className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-emerald-400 font-semibold">合计</span>
              <span className="text-slate-400">：同样 $300，有效入场规模可达 $330–345</span>
            </div>
          </div>
        </div>
      </div>

      {/* 5. 减仓逻辑 */}
      <div className="bg-[#162538] rounded-2xl p-6 border border-slate-800/80 space-y-5">
        <SectionTitle icon={Shield} title="减仓与止损规则" sub="只有两种情况应该主动平仓" />

        <div className="space-y-3">
          {[
            {
              num: '01',
              title: '落点中心漂移超过 1.5 个区间',
              body: '若第一次入场后，模型预测的 µ 发生了 >75 条的偏移（通常因为马斯克当天爆发性发推或骤然沉默），原有仓位几乎必输。以当时市场价止损，损失通常在 $60–100 之间，用第二次入场的 $500 重新覆盖新的落点。',
              color: 'border-rose-500/30',
              tagColor: 'bg-rose-500/15 text-rose-400',
            },
            {
              num: '02',
              title: '持仓价格涨超 75%（获利了结）',
              body: '若第二次入场的主仓价格从 30% 涨到了 75%+，意味着市场已经认可你的判断。卖出 50% 仓位锁定利润，剩余 50% 持有到结算。注意：这是"锁定利润"，而非对判断失去信心。',
              color: 'border-emerald-500/30',
              tagColor: 'bg-emerald-500/15 text-emerald-400',
            },
          ].map(({ num, title, body, color, tagColor }) => (
            <div key={num} className={`bg-slate-900/50 rounded-xl p-4 border ${color} flex gap-4`}>
              <div className={`text-lg font-bold font-mono shrink-0 px-2 py-1 rounded-lg ${tagColor}`}>{num}</div>
              <div>
                <div className="text-sm font-semibold text-slate-200 mb-1.5">{title}</div>
                <div className="text-xs text-slate-400 leading-relaxed">{body}</div>
              </div>
            </div>
          ))}
        </div>

        <InfoBox color="rose">
          <span className="font-semibold">不应该减仓的情况：</span>
          "感觉不对"、当天推文比平时少、市场价格下跌。
          单日数据无法推翻多日均值；短期价格下跌可能是加仓机会而非卖出信号。
        </InfoBox>
      </div>

      {/* 6. 快速参考 */}
      <div className="bg-[#162538] rounded-2xl p-6 border border-slate-800/80 space-y-5">
        <SectionTitle icon={CheckCircle2} title="快速参考总表" sub="$1000 总资金 · 两次入场框架" />

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 border-b border-slate-700/60">
                <th className="text-left py-2 pr-3">时机</th>
                <th className="text-right py-2 px-3">金额</th>
                <th className="text-left py-2 px-3">主要分配</th>
                <th className="text-left py-2 pl-3">建议方式</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              <tr>
                <td className="py-3 pr-3 text-slate-300">第一次<br /><span className="text-slate-500">剩余2.5–3天</span></td>
                <td className="text-right py-3 px-3 font-mono text-emerald-400 font-bold">$300</td>
                <td className="py-3 px-3 text-slate-400">中心50% · 下翼30% · 上翼20%</td>
                <td className="py-3 pl-3 text-violet-400">Convert 优先</td>
              </tr>
              <tr>
                <td className="py-3 pr-3 text-slate-300">第二次（情景A）<br /><span className="text-slate-500">剩余18–30h，远离边界</span></td>
                <td className="text-right py-3 px-3 font-mono text-sky-400 font-bold">$500</td>
                <td className="py-3 px-3 text-slate-400">主区间70% · 对冲20% · 备用10%</td>
                <td className="py-3 pl-3 text-slate-400">Convert + 直接</td>
              </tr>
              <tr>
                <td className="py-3 pr-3 text-slate-300">第二次（情景B）<br /><span className="text-slate-500">剩余18–30h，边界±8条</span></td>
                <td className="text-right py-3 px-3 font-mono text-amber-400 font-bold">$400</td>
                <td className="py-3 px-3 text-slate-400">边界两侧各40% · 暂留20%</td>
                <td className="py-3 pl-3 text-slate-400">直接购买</td>
              </tr>
              <tr>
                <td className="py-3 pr-3 text-slate-300">应急储备<br /><span className="text-slate-500">最后6h边界风险时</span></td>
                <td className="text-right py-3 px-3 font-mono text-slate-400 font-bold">$200</td>
                <td className="py-3 px-3 text-slate-400">单边全押明确方向</td>
                <td className="py-3 pl-3 text-slate-400">直接购买</td>
              </tr>
            </tbody>
          </table>
        </div>

        <Collapsible title="预期收益情景一览（模拟）">
          <div className="mt-3 space-y-2">
            {[
              { s: '主仓精准命中（中心区间赢）', p: '30%', r: '+$650–900', color: 'text-emerald-400' },
              { s: '邻近仓位命中（±1区间赢）', p: '35%', r: '+$100–300', color: 'text-sky-400' },
              { s: 'µ漂移，止损后第二次救回', p: '20%', r: '-$50–150', color: 'text-amber-400' },
              { s: '速率极端异常，全部错失', p: '10%', r: '-$400–600', color: 'text-rose-400' },
              { s: '边界情景，两侧各半', p: '5%', r: '-$100–200', color: 'text-rose-400' },
            ].map(({ s, p, r, color }) => (
              <div key={s} className="flex items-center justify-between text-xs bg-slate-800/40 rounded-lg px-3 py-2">
                <span className="text-slate-400">{s}</span>
                <div className="flex items-center gap-4 shrink-0">
                  <span className="text-slate-500">{p}</span>
                  <span className={`font-mono font-semibold w-28 text-right ${color}`}>{r}</span>
                </div>
              </div>
            ))}
          </div>
        </Collapsible>

        <div className="text-xs text-slate-600 text-center">
          以上为模拟数据，不构成投资建议。预测市场存在本金损失风险。
        </div>
      </div>
    </div>
  );
}
