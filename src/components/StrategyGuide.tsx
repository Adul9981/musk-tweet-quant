import { useState } from 'react';
import {
  BookOpen, TrendingUp, AlertTriangle, CheckCircle2,
  Zap, Shield, Target, DollarSign,
  ChevronDown, ChevronUp, Info,
} from 'lucide-react';

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

      {/* 1. 市场结构说明 */}
      <div className="bg-[#162538] rounded-2xl p-6 border border-slate-800/80 space-y-5">
        <SectionTitle icon={Target} title="市场结构：每个区间宽度固定 20 条" />

        <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700/40 font-mono text-xs space-y-1">
          {['0–19', '20–39', '40–59', '...', '280–299', '300–319', '320–339', '340–359', '360–379', '380–399', '400–419', '420–439', '...', '560–579', '580+'].map(r => (
            <div key={r} className={r === '380–399' ? 'text-emerald-400 font-bold' : r === '...' ? 'text-slate-600' : 'text-slate-400'}>
              {r === '380–399' ? `► ${r}  ← 示例中心区间（µ=390落于此）` : r}
            </div>
          ))}
        </div>

        <InfoBox color="amber">
          <span className="font-semibold">区间宽度 = 20 条</span>，这是理解所有边界风险的基础。
          每个区间只有20条的容错空间，马斯克一个"话多的下午"就能轻松跨越一个区间边界。
        </InfoBox>
      </div>

      {/* 2. 数学基础 */}
      <div className="bg-[#162538] rounded-2xl p-6 border border-slate-800/80 space-y-5">
        <SectionTitle icon={TrendingUp} title="数学基础：σ 与区间宽度的关系" sub="这是判断分仓还是集中的核心依据" />

        <p className="text-sm leading-relaxed">
          在剩余时间 T 天内，推文数的不确定性（σ）远大于纯泊松假设，
          因为马斯克发推行为具有明显爆发性，实际波动约为泊松σ的 <span className="text-amber-400 font-semibold">2.5 倍</span>：
        </p>

        <div className="bg-slate-900/60 rounded-xl p-4 font-mono text-sm border border-slate-700/40 space-y-2">
          <div className="text-sky-400">σ_剩余 ≈ √(日均速率 × 剩余天数) × 2.5</div>
          <div className="text-slate-500 text-xs">以日均速率 55 条/天为例：</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs mt-2">
              <thead>
                <tr className="text-slate-500 border-b border-slate-700/40">
                  <th className="text-left py-1.5 pr-3">剩余时间</th>
                  <th className="text-right py-1.5 px-3">σ（条）</th>
                  <th className="text-right py-1.5 px-3">σ / 区间宽度</th>
                  <th className="text-right py-1.5 pl-3">含义</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {[
                  { t: '剩余4天', s: 37, ratio: 1.85, meaning: '分布跨约4个区间', color: 'text-rose-400' },
                  { t: '剩余3天', s: 32, ratio: 1.6, meaning: '分布跨约3–4个区间', color: 'text-amber-400' },
                  { t: '剩余2天', s: 26, ratio: 1.3, meaning: '分布跨约3个区间', color: 'text-amber-400' },
                  { t: '剩余1天', s: 18, ratio: 0.9, meaning: '分布跨约2个区间', color: 'text-emerald-400' },
                  { t: '剩余6小时', s: 9, ratio: 0.45, meaning: '基本收敛在1–2个区间', color: 'text-emerald-400' },
                ].map(({ t, s, ratio, meaning, color }) => (
                  <tr key={t}>
                    <td className="py-2 pr-3 text-slate-400">{t}</td>
                    <td className={`text-right py-2 px-3 font-bold ${color}`}>±{s}</td>
                    <td className={`text-right py-2 px-3 font-bold ${color}`}>{ratio}</td>
                    <td className="text-right py-2 pl-3 text-slate-500">{meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <InfoBox color="sky">
          <span className="font-semibold">核心结论：</span>
          即使剩余1天，σ仍约等于1个区间宽度（0.9倍）。
          这意味着<span className="font-semibold">永远不应该把全部资金押在单一区间</span>，
          至少需要覆盖中心区间 + 两侧各1个相邻区间。
        </InfoBox>

        <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700/40 text-sm space-y-2">
          <div className="text-slate-400 text-xs mb-2 uppercase tracking-wide">Kelly 仓位公式</div>
          <div className="font-mono text-sky-400">f* = (模型概率 p − 市场价格 q) / (1 − q)</div>
          <div className="text-xs text-slate-500 mt-2">
            例：模型认为某区间概率 25%，市场标价 15%<br />
            f* = (0.25 − 0.15) / (1 − 0.15) = 11.8%<br />
            建议使用 <span className="text-amber-400">¼ Kelly</span>（约 3%）以应对模型不确定性
          </div>
        </div>
      </div>

      {/* 3. 两次入场 */}
      <div className="bg-[#162538] rounded-2xl p-6 border border-slate-800/80 space-y-5">
        <SectionTitle icon={Target} title="两次入场原则" sub="把最大筹码留给信息最充分的时刻" />

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
              <div>· 已有4天真实数据，σ ≈ 32条 ≈ 1.6个区间</div>
              <div>· 必须覆盖中心±2个区间共5个仓位</div>
              <div>· 优先用 Convert 机制降低入场成本</div>
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
              <div>· σ ≈ 18条 ≈ 0.9个区间，分布收窄</div>
              <div>· 重新计算µ，按最新速率重新评估</div>
              <div>· 集中在中心±1个区间（3个仓位）</div>
              <div>· <span className="text-sky-400 font-semibold">投入总资金的 50%（$500）</span></div>
            </div>
          </div>
        </div>

        <div className="bg-slate-800/40 rounded-xl p-3 border border-slate-700/40 text-xs text-slate-500 flex items-start gap-2">
          <Info className="w-3.5 h-3.5 text-slate-600 shrink-0 mt-0.5" />
          <span>剩余 $200（20%）作为应急储备，仅在最后 6 小时出现明显边界风险时动用。</span>
        </div>
      </div>

      {/* 4. 具体数值模拟 */}
      <div className="bg-[#162538] rounded-2xl p-6 border border-slate-800/80 space-y-6">
        <SectionTitle icon={DollarSign} title="具体数值模拟" sub="$1000 总资金 · 20条宽区间 · 三种情景" />

        {/* 基础参数 */}
        <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700/40">
          <div className="text-xs text-slate-500 uppercase tracking-wide mb-3">基础参数（第一次入场时刻，剩余3天）</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            {[
              { label: '当前推文数', val: '225 条', color: 'text-sky-400' },
              { label: '日均速率', val: '55 条/天', color: 'text-emerald-400' },
              { label: '剩余天数', val: '3 天', color: 'text-amber-400' },
              { label: '模型落点 µ', val: '390 条', color: 'text-violet-400' },
            ].map(({ label, val, color }) => (
              <div key={label} className="bg-slate-800/60 rounded-lg p-3 text-center">
                <div className="text-[11px] text-slate-500 mb-1">{label}</div>
                <div className={`font-bold font-mono ${color}`}>{val}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 text-xs text-slate-500">
            µ = 225 + 55 × 3 = 390，落在区间 <span className="text-emerald-400 font-semibold">380–399</span>，
            距上边界（400）= <span className="text-amber-400 font-semibold">10条</span>，
            距下边界（380）= <span className="text-amber-400 font-semibold">10条</span>（恰好居中）
          </div>
        </div>

        {/* 区间分析表 */}
        <div>
          <div className="text-xs text-slate-500 uppercase tracking-wide mb-3">区间概率分析（第一次入场时，σ ≈ 32条）</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-slate-700/60">
                  <th className="text-left py-2 pr-3">区间</th>
                  <th className="text-right py-2 px-3">市场价</th>
                  <th className="text-right py-2 px-3">模型概率</th>
                  <th className="text-right py-2 px-3">¼ Kelly仓</th>
                  <th className="text-right py-2 px-3">$300中分配</th>
                  <th className="text-right py-2 pl-3">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {[
                  { range: '340–359', mkt: 5, model: 8, alloc: 30, note: '远边对冲' },
                  { range: '360–379', mkt: 12, model: 20, alloc: 60, note: '下翼' },
                  { range: '380–399', mkt: 18, model: 26, alloc: 90, note: '主仓 ✓', highlight: true },
                  { range: '400–419', mkt: 15, model: 22, alloc: 75, note: '上翼' },
                  { range: '420–439', mkt: 9, model: 14, alloc: 45, note: '远边对冲' },
                  { range: '其余合计', mkt: 41, model: 10, alloc: 0, note: '忽略' },
                ].map(({ range, mkt, model, alloc, note, highlight }) => {
                  const kelly4 = model > mkt ? Math.max(0, (model / 100 - mkt / 100) / (1 - mkt / 100) / 4 * 100) : 0;
                  return (
                    <tr key={range} className={highlight ? 'bg-emerald-500/5' : ''}>
                      <td className={`py-2.5 pr-3 font-mono font-semibold ${highlight ? 'text-emerald-400' : 'text-slate-300'}`}>{range}</td>
                      <td className="text-right py-2.5 px-3 text-slate-400 font-mono">{mkt}%</td>
                      <td className={`text-right py-2.5 px-3 font-mono font-semibold ${model > mkt ? 'text-emerald-400' : 'text-slate-500'}`}>{model}%</td>
                      <td className="text-right py-2.5 px-3 font-mono text-sky-400">{kelly4 > 0 ? kelly4.toFixed(1) + '%' : '—'}</td>
                      <td className="text-right py-2.5 px-3 font-mono text-amber-400">{alloc > 0 ? `$${alloc}` : '—'}</td>
                      <td className={`text-right py-2.5 pl-3 text-[11px] font-semibold ${
                        note.includes('主仓') ? 'text-emerald-400' :
                        note.includes('翼') ? 'text-sky-400' :
                        note.includes('远边') ? 'text-slate-500' : 'text-slate-600'
                      }`}>{note}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3 space-y-1 text-xs text-slate-500">
            <div>· 注意：σ=32条时，概率分散在多个区间，单区间最高概率仅约26%</div>
            <div>· "其余合计"包含所有距中心较远的区间，市场价占41%但真实概率仅10%，是 Convert 机制的理想来源</div>
          </div>
        </div>

        {/* 三种情景 */}
        <div className="space-y-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">
            第二次入场决策：三种情景（剩余约1天，σ ≈ 18条）
          </div>

          {/* 情景A */}
          <div className="bg-slate-900/50 rounded-xl p-5 border border-emerald-500/25 space-y-4">
            <div className="flex items-center gap-3">
              <Tag label="情景 A" color="bg-emerald-500/20 text-emerald-400" />
              <span className="text-sm font-semibold text-slate-200">落点稳定，距边界超过半个区间（≥10条）</span>
            </div>

            <div className="bg-slate-900/60 rounded-xl p-3 font-mono text-xs border border-slate-700/40">
              <div className="text-slate-500 mb-2">当前状态（剩余1天）：</div>
              <div>当前推文 = 335 条 · 剩余1天 · µ = 335 + 55 = <span className="text-emerald-400 font-bold">390 条</span></div>
              <div className="mt-2 text-slate-400">
                380–399 区间：390 距上边界(400) = <span className="text-emerald-400">10条</span>，距下边界(380) = <span className="text-emerald-400">10条</span>
              </div>
              <div className="mt-1 text-slate-500 text-[11px]">
                P(380–399中) ≈ 42%  |  P(超出400) ≈ 29%  |  P(低于380) ≈ 29%
              </div>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              σ=18条，P(超出任一边界)≈58%。即便是"稳定"情景，仍有近六成概率跑出中心区间。
              因此不能全押主仓，需保留相邻区间的对冲仓位。
            </p>

            <div className="grid grid-cols-3 gap-2 text-xs">
              {[
                { range: '360–379（下翼）', amt: 75, pct: '15%', color: 'text-sky-400', bg: 'bg-sky-500/10 border-sky-500/20' },
                { range: '380–399（主仓）', amt: 300, pct: '60%', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/25' },
                { range: '400–419（上翼）', amt: 75, pct: '15%', color: 'text-sky-400', bg: 'bg-sky-500/10 border-sky-500/20' },
              ].map(({ range, amt, pct, color, bg }) => (
                <div key={range} className={`rounded-xl border p-3 text-center ${bg}`}>
                  <div className="text-slate-500 mb-1 text-[11px]">{range}</div>
                  <div className={`font-bold text-lg ${color}`}>${amt}</div>
                  <div className="text-slate-500 text-[11px]">{pct}</div>
                </div>
              ))}
            </div>
            <div className="text-xs text-slate-500">剩余 $50 作为最后6小时追加用</div>
          </div>

          {/* 情景B */}
          <div className="bg-slate-900/50 rounded-xl p-5 border border-amber-500/25 space-y-4">
            <div className="flex items-center gap-3">
              <Tag label="情景 B" color="bg-amber-500/20 text-amber-400" />
              <span className="text-sm font-semibold text-slate-200">落点靠近区间边界（距边界 ≤5条）</span>
            </div>

            <div className="bg-slate-900/60 rounded-xl p-3 font-mono text-xs border border-slate-700/40">
              <div className="text-slate-500 mb-2">当前状态（剩余1天）：</div>
              <div>当前推文 = 342 条 · 剩余1天 · µ = 342 + 55 = <span className="text-amber-400 font-bold">397 条</span></div>
              <div className="mt-2 text-slate-400">
                380–399 区间：397 距上边界(400) = <span className="text-rose-400 font-bold">3条 ⚠️</span>，距下边界(380) = 17条
              </div>
              <div className="mt-1 text-slate-500 text-[11px]">
                P(380–399中) ≈ 27%  |  P(超出400，进入400–419) ≈ 43%  |  P(低于380) ≈ 30%
              </div>
            </div>

            <InfoBox color="amber">
              <span className="font-semibold">3条的距离意味着什么？</span>
              σ=18条，区间上边界仅差3条。马斯克下午发3条转发就能跳入400–419。
              此时400–419的概率（43%）已经超过了380–399（27%），主仓方向已经反转！
            </InfoBox>

            <div className="grid grid-cols-2 gap-3 text-xs">
              {[
                { range: '380–399（原主仓）', amt: 150, pct: '30%', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/25' },
                { range: '400–419（新主仓）', amt: 200, pct: '40%', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/25' },
              ].map(({ range, amt, pct, color, bg }) => (
                <div key={range} className={`rounded-xl border p-3 text-center ${bg}`}>
                  <div className="text-slate-500 mb-1 text-[11px]">{range}</div>
                  <div className={`font-bold text-lg ${color}`}>${amt}</div>
                  <div className="text-slate-500 text-[11px]">{pct}</div>
                </div>
              ))}
            </div>
            <div className="bg-slate-800/40 rounded-lg p-3 text-xs text-slate-500">
              剩余 $150 暂时保留。等最后6小时推文数据明朗后：
              若当前数超过395，全押400–419；若低于385，全押380–399。
            </div>
          </div>

          {/* 情景C */}
          <div className="bg-slate-900/50 rounded-xl p-5 border border-rose-500/25 space-y-4">
            <div className="flex items-center gap-3">
              <Tag label="情景 C" color="bg-rose-500/20 text-rose-400" />
              <span className="text-sm font-semibold text-slate-200">速率突变——落点飞出2个以上区间</span>
            </div>

            <div className="bg-slate-900/60 rounded-xl p-3 font-mono text-xs border border-slate-700/40">
              <div className="text-slate-500 mb-2">异常事件（第5天）：</div>
              <div>当天实际发推 = <span className="text-rose-400 font-bold">130 条</span>（日均55条的2.4倍）</div>
              <div className="mt-2">
                原预测 µ = 390 → 新预测 µ = 225 + 130 + 55×2 = <span className="text-rose-400 font-bold">465 条</span>
              </div>
              <div className="mt-1 text-slate-400">
                落点跳入 460–479 区间，距第一次入场的主仓(380–399)相差 <span className="text-rose-400">4个区间</span>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-start gap-2 bg-rose-500/8 border border-rose-500/25 rounded-lg px-3 py-2.5">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                <span>第一次入场的380–399主仓（$90）：以当前市价清仓，价格可能已跌至3–5%，亏损约$65。接受并止损。</span>
              </div>
              <div className="flex items-start gap-2 bg-emerald-500/8 border border-emerald-500/25 rounded-lg px-3 py-2.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>第二次入场全部基于新的落点重新分配：460–479主仓$250 · 440–459下翼$125 · 480–499上翼$125。</span>
              </div>
              <div className="flex items-start gap-2 bg-amber-500/8 border border-amber-500/25 rounded-lg px-3 py-2.5">
                <Info className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <span>核心原则：已亏损的钱已经不存在，不能因"不甘心"而拒绝止损。第二次入场必须独立决策，基于当前最新µ。</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Convert 机制 */}
      <div className="bg-[#162538] rounded-2xl p-6 border border-slate-800/80 space-y-5">
        <SectionTitle icon={Zap} title="Convert 机制：以 NO 换 YES" sub="在 Polymarket 分类市场中降低入场成本" />

        <div className="bg-slate-900/60 rounded-xl p-4 border border-violet-500/25 space-y-2">
          <div className="text-xs text-violet-400 uppercase tracking-wide font-semibold">等价恒等式</div>
          <div className="font-mono text-sm text-slate-300">NO_X ≡ YES_A + YES_B + YES_C + ...（除 X 外所有区间的 YES）</div>
          <div className="text-xs text-slate-500">两者赔付结构完全相同：X区间不中时均赔付$1。Polymarket的Convert按钮即执行此转换。</div>
        </div>

        <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700/40 space-y-4 text-sm">
          <div className="text-xs text-slate-500 mb-2 uppercase tracking-wide">数值对比（市场overround = 3%）</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="bg-slate-800/60 rounded-lg p-3 space-y-2">
              <div className="text-slate-400 font-semibold">直接买 YES_380–399</div>
              <div className="font-mono">成本：<span className="text-rose-400">$0.185/份</span></div>
              <div className="font-mono">$300 可买：<span className="text-slate-300">1621 份</span></div>
            </div>
            <div className="bg-slate-800/60 rounded-lg p-3 space-y-2">
              <div className="text-slate-400 font-semibold">Convert 路线（买远端 NO 转换）</div>
              <div className="font-mono text-[11px] space-y-0.5">
                <div>买 NO_560–579（YES=2%）：$0.98/份</div>
                <div>Convert → 其余所有区间各1份YES</div>
                <div>卖掉不要的区间：约 $0.810/份</div>
                <div className="border-t border-slate-700 pt-1 mt-1">
                  净成本：<span className="text-emerald-400 font-bold">$0.170/份（省8.1%）</span>
                </div>
              </div>
              <div className="font-mono">$300 可买：<span className="text-emerald-400 font-bold">1765 份（多 +144）</span></div>
            </div>
          </div>
          <InfoBox color="emerald">
            <span className="font-semibold">节省原理：</span>
            每份净成本 = 市场价 − overround = $0.185 − $0.030 = $0.155（理论值）。
            实际因卖出时有点差，约节省 6–9%。Overround越高，Convert越合算。
          </InfoBox>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="bg-slate-900/60 rounded-xl p-4 border border-emerald-500/20">
            <div className="text-emerald-400 font-semibold mb-2">✓ 理想的 Convert 源</div>
            <div className="space-y-1.5 text-slate-400">
              <div>· 距落点中心3个区间以上（必输区间）</div>
              <div>· YES 价格 5–15%（流动性充足）</div>
              <div>· 市场高估了该区间（NO本身也有正EV）</div>
            </div>
          </div>
          <div className="bg-slate-900/60 rounded-xl p-4 border border-rose-500/20">
            <div className="text-rose-400 font-semibold mb-2">✗ 避免用作 Convert 源</div>
            <div className="space-y-1.5 text-slate-400">
              <div>· YES价格 {'<'}3%（卖出时滑点大）</div>
              <div>· 相邻中心区间（有可能会中）</div>
              <div>· 最后6小时（速度优先，直接买）</div>
            </div>
          </div>
        </div>
      </div>

      {/* 6. 减仓规则 */}
      <div className="bg-[#162538] rounded-2xl p-6 border border-slate-800/80 space-y-5">
        <SectionTitle icon={Shield} title="减仓与止损规则" sub="只有两种情况应主动平仓" />

        <div className="space-y-3">
          {[
            {
              num: '01',
              title: '落点漂移超过2个区间（µ偏移>40条）',
              body: '若速率突变导致新µ与第一次入场时偏差超过2个区间（40条），原仓位大概率落空。以当前市价止损，通常亏损$50–100，然后以第二次入场资金重新按新落点布局。',
              color: 'border-rose-500/30', tagColor: 'bg-rose-500/15 text-rose-400',
            },
            {
              num: '02',
              title: '持仓市场价涨超 75%（获利了结）',
              body: '若第二次入场的主仓价格从18%涨到75%+，说明市场已认可你的判断。卖出50%锁定利润，剩50%持有到结算。',
              color: 'border-emerald-500/30', tagColor: 'bg-emerald-500/15 text-emerald-400',
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
          <span className="font-semibold">不该减仓的情况：</span>
          当天发推比平时少、市场价格下跌、"感觉不对"。
          单日数据不能推翻多日均值。短期价格波动可能是加仓机会。
        </InfoBox>
      </div>

      {/* 7. 快速参考 */}
      <div className="bg-[#162538] rounded-2xl p-6 border border-slate-800/80 space-y-5">
        <SectionTitle icon={CheckCircle2} title="快速参考总表" sub="$1000 · 两次入场 · 20条宽区间" />

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 border-b border-slate-700/60">
                <th className="text-left py-2 pr-3">时机</th>
                <th className="text-right py-2 px-3">金额</th>
                <th className="text-left py-2 px-3">仓位分布</th>
                <th className="text-left py-2 pl-3">方式</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {[
                { t: '第一次\n剩余2.5–3天', amt: '$300', alloc: '中心30% · 上下翼各25% · 远边各10%', method: 'Convert优先', c: 'text-emerald-400' },
                { t: '第二次（情景A）\n稳定，距边界≥10条', amt: '$500', alloc: '主仓60% · 两翼各15% · 备用10%', method: 'Convert+直接', c: 'text-sky-400' },
                { t: '第二次（情景B）\n边界附近，≤5条', amt: '$350', alloc: '边界两侧各43% · 保留14%待最后6h', method: '直接购买', c: 'text-amber-400' },
                { t: '应急\n最后6h边界信号', amt: '$200', alloc: '100%押明确方向', method: '直接购买', c: 'text-slate-400' },
              ].map(({ t, amt, alloc, method, c }) => (
                <tr key={t}>
                  <td className="py-3 pr-3 text-slate-300 whitespace-pre-line text-[11px]">{t}</td>
                  <td className={`text-right py-3 px-3 font-mono font-bold ${c}`}>{amt}</td>
                  <td className="py-3 px-3 text-slate-400">{alloc}</td>
                  <td className="py-3 pl-3 text-violet-400 text-[11px]">{method}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Collapsible title="预期收益情景一览（模拟）">
          <div className="mt-3 space-y-2">
            {[
              { s: '主仓精准命中（中心区间赢）', p: '28%', r: '+$500–750', color: 'text-emerald-400' },
              { s: '邻近仓位命中（±1区间赢）', p: '38%', r: '+$80–200', color: 'text-sky-400' },
              { s: 'µ漂移，第一次亏，第二次追回', p: '18%', r: '-$50–150', color: 'text-amber-400' },
              { s: '速率极端异常，全部错失', p: '10%', r: '-$400–600', color: 'text-rose-400' },
              { s: '边界情景，两侧分裂亏损', p: '6%', r: '-$100–250', color: 'text-rose-400' },
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

        <Collapsible title="边界距离与分仓比例速查">
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-slate-700/40">
                  <th className="text-left py-1.5 pr-3">距最近边界</th>
                  <th className="text-right py-1.5 px-3">越界概率</th>
                  <th className="text-right py-1.5 px-3">主仓比例</th>
                  <th className="text-left py-1.5 pl-3">建议</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {[
                  { dist: '≥15条', prob: '~20%', main: '65%', advice: '相对安全，主仓可集中', c: 'text-emerald-400' },
                  { dist: '10–14条', prob: '~28%', main: '55%', advice: '保留足够翼仓', c: 'text-emerald-400' },
                  { dist: '5–9条', prob: '~37%', main: '40%', advice: '两侧对称分仓', c: 'text-amber-400' },
                  { dist: '≤4条', prob: '~45%+', main: '30%', advice: '几乎五五开，等最后6h数据', c: 'text-rose-400' },
                ].map(({ dist, prob, main, advice, c }) => (
                  <tr key={dist}>
                    <td className={`py-2 pr-3 font-mono font-bold ${c}`}>{dist}</td>
                    <td className={`text-right py-2 px-3 font-mono ${c}`}>{prob}</td>
                    <td className={`text-right py-2 px-3 font-mono font-bold ${c}`}>{main}</td>
                    <td className="py-2 pl-3 text-slate-400">{advice}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-[11px] text-slate-600 mt-2">越界概率基于 σ=18条（剩余1天）计算</div>
        </Collapsible>

        <div className="text-xs text-slate-600 text-center">
          以上为模拟数据，不构成投资建议。预测市场存在本金损失风险。
        </div>
      </div>
    </div>
  );
}
