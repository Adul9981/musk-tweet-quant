import { useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp, AlertTriangle, TrendingUp, TrendingDown, Shield, Clock, Zap } from 'lucide-react';

export function StrategyGuide() {
  const [openSection, setOpenSection] = useState<string | null>('buy');
  const toggle = (id: string) => setOpenSection(prev => prev === id ? null : id);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-[#162538] rounded-2xl p-6 border border-slate-800/80">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/25 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-sky-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-100">马斯克推文市场 · 操作手册</h1>
            <p className="text-xs text-slate-500 mt-0.5">简化版 · 只讲操作，不讲数学</p>
          </div>
        </div>
        <div className="p-4 bg-sky-500/8 rounded-xl border border-sky-500/15">
          <p className="text-sm text-slate-300 leading-relaxed">
            <span className="text-sky-400 font-semibold">核心思路：</span>
            押中心落点区间赚大钱，用翼仓做保险，
            <span className="text-amber-400 font-semibold">主动卖出翼仓</span>
            代替等它归零。规则写死之后，不需要在关键时刻靠感情判断。
          </p>
        </div>
      </div>

      {/* ── Section 1: 什么时候买 ── */}
      <Section id="buy" title="什么时候买、买多少" icon={<TrendingUp className="w-4 h-4 text-emerald-400" />} open={openSection === 'buy'} onToggle={() => toggle('buy')}>
        <div className="space-y-4">
          <p className="text-xs text-slate-500">以总资金 $5000 为例，可按比例换算。</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase">时机</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase">买什么</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase">金额</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase">目的</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-800/60">
                  <td className="py-3 px-3 font-medium text-sky-300">距到期 2–2.5天</td>
                  <td className="py-3 px-3 text-slate-300">中心区间 60% + 上翼 28% + 下翼 12%</td>
                  <td className="py-3 px-3 text-right font-mono text-emerald-400">$1250</td>
                  <td className="py-3 px-3 text-slate-500 text-xs">分散建仓，不押单一区间</td>
                </tr>
                <tr className="border-b border-slate-800/60">
                  <td className="py-3 px-3 font-medium text-sky-300">距到期 1.5–2天</td>
                  <td className="py-3 px-3 text-slate-300">集中加仓中心区间（主力仓）</td>
                  <td className="py-3 px-3 text-right font-mono text-emerald-400">$2000</td>
                  <td className="py-3 px-3 text-slate-500 text-xs">落点更确定，重仓押注</td>
                </tr>
                <tr className="border-b border-slate-800/60 bg-violet-500/5">
                  <td className="py-3 px-3 font-medium text-violet-300">任意时间（机会单）</td>
                  <td className="py-3 px-3 text-slate-300">中心附近区间价格跌到 8% 以下时少量买入</td>
                  <td className="py-3 px-3 text-right font-mono text-violet-400">$50–100</td>
                  <td className="py-3 px-3 text-slate-500 text-xs">低价保险，扩大安全边界</td>
                </tr>
                <tr>
                  <td className="py-3 px-3 font-medium text-slate-500">预留不动</td>
                  <td className="py-3 px-3 text-slate-500">—</td>
                  <td className="py-3 px-3 text-right font-mono text-slate-500">$750</td>
                  <td className="py-3 px-3 text-slate-500 text-xs">异常情况下的机动资金</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/20 text-xs text-amber-200">
            <p className="font-semibold mb-1">⚠️ 不建议这样做</p>
            <ul className="space-y-1 text-amber-300/80">
              <li>· 距到期超过3天就重仓入场（预测不准，容易买错区间）</li>
              <li>· 同一期内无限补仓（加仓应有明确计划，不是凭感觉）</li>
            </ul>
          </div>
        </div>
      </Section>

      {/* ── Section 2: 什么时候卖 ── */}
      <Section id="sell" title="什么时候卖（固定规则，不靠感情）" icon={<TrendingDown className="w-4 h-4 text-amber-400" />} open={openSection === 'sell'} onToggle={() => toggle('sell')}>
        <div className="space-y-4">
          <p className="text-xs text-slate-500">把卖出时间写成规则，不用在关键时刻临时决定，心理压力会小很多。</p>

          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">翼仓减仓计划（上翼+下翼）</p>
            <div className="space-y-2">
              {[
                { time: '1.5天晚上',     action: '各卖出 40%', note: '只要速率正常就执行，不管涨跌', color: 'border-l-amber-400' },
                { time: '1天晚上',       action: '再卖剩余 50%', note: '此时翼仓只剩最初的30%仓位', color: 'border-l-orange-400' },
                { time: '到期前12小时',  action: '翼仓全部清仓', note: '不留任何翼仓持仓过夜', color: 'border-l-rose-400' },
              ].map((step, i) => (
                <div key={i} className={`pl-4 border-l-2 ${step.color} py-2`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-200">{step.time}</span>
                    <span className="text-sm font-bold text-amber-400">{step.action}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{step.note}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">中心仓位止盈（价格触发）</p>
            <div className="space-y-2">
              {[
                { trigger: '中心区间涨到 65–74%', action: '卖出 20%，锁定部分收益', note: '卖完还剩80%，中奖潜力仍然很大' },
                { trigger: '中心区间涨到 75% 以上', action: '再卖 30%，共减仓50%', note: '到这个价位赔率极低，减仓是理性的' },
              ].map((step, i) => (
                <div key={i} className="p-3 bg-emerald-500/8 rounded-xl border border-emerald-500/15">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-emerald-300">{step.trigger}</span>
                    <span className="text-sm font-bold text-emerald-400">{step.action}</span>
                  </div>
                  <p className="text-xs text-slate-500">{step.note}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="p-3 bg-slate-800/50 rounded-xl border border-slate-700/40 text-xs text-slate-400">
            <p className="font-semibold text-slate-300 mb-1">卖出后它反而涨了，怎么办？</p>
            <p>卖出翼仓之后翼仓涨了——这不是错误，这是正确的风险管理。预测市场的利润来自<span className="text-sky-400">多次操作的平均收益</span>，不是某一次押对。翼仓归零的次数远多于中奖的次数。</p>
          </div>
        </div>
      </Section>

      {/* ── Section 3: 异常情况 ── */}
      <Section id="exception" title="出现异常情况怎么办" icon={<Zap className="w-4 h-4 text-yellow-400" />} open={openSection === 'exception'} onToggle={() => toggle('exception')}>
        <div className="space-y-3">
          {[
            {
              title: '马斯克今天发推速度突然很快（速率偏高预警）',
              action: '延迟卖出上翼，观察是否持续。若持续2小时以上，考虑少量补买上翼。',
              color: 'border-amber-500/40 bg-amber-500/5',
            },
            {
              title: '马斯克今天发推速度突然很慢（速率偏低预警）',
              action: '延迟卖出下翼，观察是否持续。若持续2小时以上，考虑补买下翼低价保险。',
              color: 'border-blue-500/40 bg-blue-500/5',
            },
            {
              title: '预测落点（µ）在一天内移动超过一个区间（20条）',
              action: '先不加仓，等落点稳定2小时以上，再重新确认中心区间后执行计划。',
              color: 'border-violet-500/40 bg-violet-500/5',
            },
            {
              title: '中心区间价格跌到入场价的40%以下，且模型概率也很低',
              action: '考虑止损，把剩余资金转移到当前中心区间。不要死守。',
              color: 'border-rose-500/40 bg-rose-500/5',
            },
          ].map((item, i) => (
            <div key={i} className={`p-3.5 rounded-xl border ${item.color}`}>
              <p className="text-sm font-semibold text-slate-200 mb-1.5 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                {item.title}
              </p>
              <p className="text-xs text-slate-400 pl-6">→ {item.action}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Section 4: 心理备忘 ── */}
      <Section id="mindset" title="心理备忘" icon={<Shield className="w-4 h-4 text-sky-400" />} open={openSection === 'mindset'} onToggle={() => toggle('mindset')}>
        <div className="space-y-3">
          {[
            {
              q: '卖了翼仓，结果它中奖了，怎么办？',
              a: '你没有做错。翼仓赔率是5–8倍，但中奖概率只有15–20%。长期来看，按计划卖出比死守期望值更高。这次是偶然，不代表策略错了。',
            },
            {
              q: '中心区间加了很多，突然很慌怎么办？',
              a: '先看模型的预测落点（µ）是否还在中心区间内。如果是，说明策略没变化，你只是在正常价格波动中焦虑。如果µ已经移走了一个区间，才需要调整。',
            },
            {
              q: '要不要一直盯着价格看？',
              a: '距到期2天以上：每6小时看一次即可。距到期1天内：每2–3小时看一次。到期前12小时：需要随时关注，执行翼仓清仓。',
            },
            {
              q: '为什么利润总是来自没有重仓的区间？',
              a: '因为你重仓的区间是模型认为最可能的区间，它的赔率往往已经被市场定价得比较高了。翼仓赔率低、潜在回报高——这是预测市场的结构特征，不是你的问题。',
            },
          ].map((item, i) => (
            <div key={i} className="p-4 bg-slate-800/40 rounded-xl border border-slate-700/40">
              <p className="text-sm font-semibold text-sky-300 mb-2">Q: {item.q}</p>
              <p className="text-xs text-slate-400 leading-relaxed">A: {item.a}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Summary card ── */}
      <div className="bg-[#162538] rounded-2xl p-5 border border-slate-800/80">
        <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4 text-sky-400" />
          一张纸总结
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center text-xs">
          {[
            { label: '距到期2.5天',  value: '第一次建仓', color: 'text-sky-400',     bg: 'bg-sky-500/10 border-sky-500/20' },
            { label: '距到期1.5天',  value: '加仓中心',   color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
            { label: '距到期1天晚',  value: '翼仓减仓',   color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/20' },
            { label: '到期前12h',    value: '翼仓清仓',   color: 'text-rose-400',    bg: 'bg-rose-500/10 border-rose-500/20' },
          ].map((step, i) => (
            <div key={i} className={`p-3 rounded-xl border ${step.bg}`}>
              <p className="text-slate-500 mb-1">{step.label}</p>
              <p className={`font-bold ${step.color}`}>{step.value}</p>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-600 text-center mt-4">
          中心区间是利润来源 · 翼仓是保险不是主力 · 按时间表卖出，不靠临场判断
        </p>
      </div>
    </div>
  );
}

// ── Collapsible section ────────────────────────────────────────────────────────
function Section({ id, title, icon, open, onToggle, children }: {
  id: string; title: string; icon: React.ReactNode;
  open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  void id;
  return (
    <div className="bg-[#162538] rounded-2xl border border-slate-800/80 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-800/20 transition-colors"
      >
        <div className="flex items-center gap-3">
          {icon}
          <span className="text-sm font-semibold text-slate-200">{title}</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
      </button>
      {open && (
        <div className="px-5 pb-5 border-t border-slate-800/60 pt-4">
          {children}
        </div>
      )}
    </div>
  );
}
